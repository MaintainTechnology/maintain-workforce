"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormResult } from "@/lib/actions";
import { audit, type Actor } from "@/lib/audit";
import {
  getUser,
  isMaintainAdmin,
  requireCompanyAdmin,
  requireMaintainAdmin,
} from "@/lib/auth";
import { findUserByEmail, inviteAdministrator, userHasSignedIn } from "@/lib/clerk";
import { isValidAbn, normaliseAbn } from "@/lib/domain/abn";
import { notify, NOTIFICATION_TRIGGERS } from "@/lib/notify";
import { parseRegistrationInput } from "@/lib/registration";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CompanyStatus } from "@/lib/supabase/types";

// Registration, company profile and verification — spec modules 1 and 3.2.
//
// Every export of this module is a server action, reachable by direct POST. Each one
// therefore re-establishes its own authorisation (requireCompanyAdmin / requireMaintainAdmin)
// rather than trusting the screen that rendered the form, and each mutation calls audit()
// per 18.1.

const MAINTAIN_INBOX =
  process.env.MAINTAIN_NOTIFICATION_EMAIL ?? process.env.BOOKING_NOTIFICATION_EMAIL ?? "";

/** 1.7 — private bucket, path scoped by company id, signed URLs only. */
const DOCUMENT_BUCKET = "company-documents";
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_MIME = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

/**
 * 1.4 — the per-company verification checklist. Items of kind "document" are
 * company_document rows carrying type, number, issuer, dates and the uploaded file.
 * The two flags carry no document: the schema has no dedicated column for them, so
 * each is recorded as a company_document row with no file_path, where verified_by /
 * verified_at IS the flag. "Payment details provided" is reference only — 1.4 stores
 * no bank data.
 */
const CHECKLIST = [
  { id: "abn_verified", label: "ABN verified", kind: "flag", optional: false },
  { id: "public_liability", label: "Public liability insurance", kind: "document", optional: false },
  { id: "workers_comp", label: "Workers compensation", kind: "document", optional: false },
  { id: "trade_licence", label: "Trade licence", kind: "document", optional: false },
  // 22.1 statutory carve-out: a statute's name cannot be paraphrased, so this one
  // label and the identifier lh_licence are exempt. The field is nullable (1.4).
  { id: "lh_licence", label: "Labour-hire licence", kind: "document", optional: true },
  { id: "payment_details", label: "Payment details provided", kind: "flag", optional: false },
] as const;

const CHECKLIST_IDS = CHECKLIST.map((item) => item.id);

/** Exposed as an async accessor because a "use server" module may only export functions. */
export async function companyChecklist(): Promise<typeof CHECKLIST> {
  return CHECKLIST;
}

// ------------------------------------------------------------------ validation

function echo(formData: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = String(formData.get(key) ?? "");
  return out;
}

const optionalAbnField = z.preprocess(
  (value) =>
    value == null || (typeof value === "string" && value.trim() === "") ? undefined : value,
  z.string().trim().optional(),
);

const profileFields = {
  legal_name: z.string().trim().min(2, "Tell us the registered company name."),
  trading_name: z.string().trim().max(200).optional(),
  abn: optionalAbnField,
  industry_id: z.string().uuid("Choose the industry you work in."),
  contact_name: z.string().trim().min(2, "Tell us who to speak to."),
  contact_email: z.string().trim().email("That email does not look right."),
  contact_phone: z.string().trim().min(6, "We need a phone number."),
  primary_region_id: z.string().uuid("Choose your primary region."),
  operating_region_ids: z
    .array(z.string().uuid())
    .min(1, "Choose at least one region you operate in."),
};

const profileSchema = z.object(profileFields);

const companyProfileSnapshotSchema = z.object({
  legal_name: z.string(),
  trading_name: z.string().nullable(),
  abn: z.string().nullable(),
  industry_id: z.string().uuid().nullable(),
  contact_name: z.string().nullable(),
  contact_email: z.string(),
  contact_phone: z.string().nullable(),
  primary_region_id: z.string().uuid().nullable(),
  operating_region_ids: z.array(z.string().uuid()),
}).strict();

/**
 * When an ABN is supplied it is checksum-validated and unique across companies.
 * Registration may defer it; profile edits and lead qualification share this check.
 */
type AbnCheck =
  | { ok: true; abn: string | null }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "collision"; abn: string };

async function checkAbn(raw?: string | null, excludeCompanyId?: string): Promise<AbnCheck> {
  const abn = normaliseAbn(raw ?? "");
  if (!abn) return { ok: true, abn: null };
  if (!isValidAbn(abn)) return { ok: false, reason: "invalid" };

  const admin = createAdminClient();
  let query = admin.from("company").select("id").eq("abn", abn);
  if (excludeCompanyId) query = query.neq("id", excludeCompanyId);
  const { data } = await query.limit(1);

  return data && data.length > 0
    ? { ok: false, reason: "collision", abn }
    : { ok: true, abn };
}

/**
 * 1.2 — a registration against an existing ABN is blocked and routed to Maintain admin
 * review. The review artefact is a Lead row, because the Leads queue (0.4) is the only
 * admin surface that holds work with no company behind it yet. Nothing here, and
 * nothing in the caller's response, names the company that holds the ABN.
 */
async function routeAbnCollisionToReview(input: {
  actor: Actor;
  abn: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  origin: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: lead, error: leadError } = await admin
    .from("lead")
    .insert({
      source: `abn-collision:${input.origin}`,
      intent: "both",
      contact_name: input.contactName,
      business_name: input.businessName,
      abn: normaliseAbn(input.abn),
      phone: input.contactPhone,
      email: input.contactEmail,
      notes: "Blocked at entry: this ABN is already registered (1.2). Needs Maintain review.",
      status: "New",
    })
    .select("id")
    .single();
  if (leadError || !lead) {
    throw new Error(
      `ABN collision review could not be recorded: ${leadError?.message ?? "lead was not returned"}`,
    );
  }

  await notify({
    trigger: NOTIFICATION_TRIGGERS.ABN_COLLISION_REVIEW,
    to: MAINTAIN_INBOX,
    subject: "Registration blocked — ABN already registered",
    body: `A registration was blocked because its ABN is already on the platform. It is waiting in the Leads queue for review.`,
    entityType: "lead",
    entityId: lead.id,
    actionPath: "/admin/leads",
  });

  await audit({
    actor: input.actor,
    action: "company.registration_blocked_abn_collision",
    entityType: "lead",
    entityId: lead.id,
    after: { abn: normaliseAbn(input.abn), origin: input.origin },
  });
}

// ------------------------------------------------------------------ 1.1 registration

const REGISTRATION_KEYS = [
  "legal_name",
  "trading_name",
  "abn",
  "industry_id",
  "contact_name",
  "contact_email",
  "contact_phone",
  "primary_region_id",
];

const GENERIC_BLOCKED =
  "We could not complete this registration automatically. Maintain will review the details and be in touch.";

/**
 * 1.1 — the public Register screen creates a company (legal name, trading name, ABN,
 * industry, primary contact, primary region, operating regions) plus its first Company
 * Administrator, with status Pending. Clerk has already authenticated that first
 * administrator before this second step can run.
 */
export async function completeCompanyRegistration(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  if (formData.get("website")) return { ok: true }; // honeypot

  const sessionUser = await getUser();
  if (!sessionUser) redirect("/signup");

  const admin = createAdminClient();
  const { data: existingMembership } = await admin
    .from("company_user")
    .select("company_id")
    .eq("user_id", sessionUser.id)
    .maybeSingle();
  if (existingMembership) redirect("/app");

  const operatingRegionIds = formData.getAll("operating_region_ids").map(String).filter(Boolean);
  const values = {
    ...echo(formData, REGISTRATION_KEYS),
    operating_region_ids: operatingRegionIds.join(","),
  };

  const parsed = parseRegistrationInput({
    legal_name: formData.get("legal_name"),
    trading_name: formData.get("trading_name") || undefined,
    abn: formData.get("abn"),
    industry_id: formData.get("industry_id"),
    contact_name: formData.get("contact_name"),
    contact_email: formData.get("contact_email"),
    contact_phone: formData.get("contact_phone"),
    primary_region_id: formData.get("primary_region_id"),
    operating_region_ids: operatingRegionIds,
  });

  if (!parsed.success) return { ok: false, errors: parsed.errors, values };
  const input = parsed.data;

  const abnCheck = await checkAbn(input.abn);
  if (!abnCheck.ok && abnCheck.reason === "invalid") {
    return {
      ok: false,
      errors: {
        abn: "This has 11 digits, but it is not a valid ABN. Check it against your ABR record.",
      },
      values,
    };
  }
  if (!abnCheck.ok) {
    await routeAbnCollisionToReview({
      actor: { userId: sessionUser.id },
      abn: abnCheck.abn,
      businessName: input.legal_name,
      contactName: input.contact_name,
      contactEmail: input.contact_email,
      contactPhone: input.contact_phone,
      origin: "register",
    });
    return { ok: false, message: GENERIC_BLOCKED, values };
  }

  const { data: companyId, error: registrationError } = await admin.rpc(
    "register_company_with_first_clerk_admin",
    {
      p_actor_user_id: sessionUser.id,
      p_administrator_email: sessionUser.email,
      p_legal_name: input.legal_name,
      p_trading_name: input.trading_name ?? "",
      p_abn: abnCheck.abn,
      p_industry_id: input.industry_id,
      p_contact_name: input.contact_name,
      p_contact_email: input.contact_email,
      p_contact_phone: input.contact_phone,
      p_primary_region_id: input.primary_region_id,
      p_operating_region_ids: input.operating_region_ids,
    },
  );

  if (registrationError || !companyId) {
    if (registrationError?.code === "23505") {
      // A concurrent/retried submission may have committed this Clerk user's
      // membership already. Treat that as idempotent success rather than routing a
      // harmless retry into ABN-collision review.
      const { data: racedMembership } = await admin
        .from("company_user")
        .select("company_id")
        .eq("user_id", sessionUser.id)
        .maybeSingle();
      if (racedMembership) redirect("/app");

      if (abnCheck.abn) {
        await routeAbnCollisionToReview({
          actor: { userId: sessionUser.id },
          abn: abnCheck.abn,
          businessName: input.legal_name,
          contactName: input.contact_name,
          contactEmail: input.contact_email,
          contactPhone: input.contact_phone,
          origin: "register",
        });
      }
    }
    return { ok: false, message: GENERIC_BLOCKED, values };
  }

  await notify({
    trigger: NOTIFICATION_TRIGGERS.COMPANY_REGISTERED,
    to: MAINTAIN_INBOX,
    subject: `New registration — ${input.legal_name}`,
    body: `${input.legal_name} registered and is waiting in the verification queue.`,
    companyId,
    entityType: "company",
    entityId: companyId,
    actionPath: `/admin/verification?company=${companyId}`,
  });

  redirect("/app");
}

// ------------------------------------------------------------------ 3.1 company profile

/** 3.2 — Suspended is read-only and Closed is terminal; only Pending and Active write. */
function writable(status: CompanyStatus): boolean {
  return status === "Pending" || status === "Active";
}

/**
 * 3.1 / 1.3 — a Pending company can complete its profile long before it is verified.
 * Suspended and Closed companies are read-only (3.2), enforced here rather than by a
 * disabled button.
 */
export async function updateCompanyProfile(formData: FormData): Promise<void> {
  const { user, companyId, companyStatus } = await requireCompanyAdmin();
  if (!writable(companyStatus)) redirect("/app/settings?error=read_only");

  const operatingRegionIds = formData.getAll("operating_region_ids").map(String).filter(Boolean);
  let expectedProfile: unknown;
  try {
    expectedProfile = JSON.parse(String(formData.get("expected_profile") ?? ""));
  } catch {
    redirect("/app/settings?error=invalid");
  }
  const expected = companyProfileSnapshotSchema.safeParse(expectedProfile);
  const parsed = profileSchema.safeParse({
    legal_name: formData.get("legal_name"),
    trading_name: formData.get("trading_name") || undefined,
    abn: formData.get("abn"),
    industry_id: formData.get("industry_id"),
    contact_name: formData.get("contact_name"),
    contact_email: formData.get("contact_email"),
    contact_phone: formData.get("contact_phone"),
    primary_region_id: formData.get("primary_region_id"),
    operating_region_ids: operatingRegionIds,
  });
  if (!expected.success || !parsed.success) redirect("/app/settings?error=invalid");
  const input = parsed.data;

  const abnCheck = await checkAbn(input.abn, companyId);
  if (!abnCheck.ok && abnCheck.reason === "invalid") redirect("/app/settings?error=abn_checksum");
  // Profile edits must not create a review artefact before the atomic writer has
  // checked the displayed snapshot. Registration collisions still enter the Leads
  // queue, while an existing company gets a stable, retry-safe collision response.
  if (!abnCheck.ok) redirect("/app/settings?error=abn_collision");

  await companyRpc(
    "update_company_profile_atomic",
    {
      p_company_id: companyId,
      p_expected_status: companyStatus,
      p_expected_profile: expected.data,
      p_actor_user_id: user.id,
      p_actor_scope: "company",
      p_legal_name: input.legal_name,
      p_trading_name: input.trading_name ?? "",
      p_abn: abnCheck.abn,
      p_industry_id: input.industry_id,
      p_contact_name: input.contact_name,
      p_contact_email: input.contact_email,
      p_contact_phone: input.contact_phone,
      p_primary_region_id: input.primary_region_id,
      p_operating_region_ids: input.operating_region_ids,
    },
    companyProfileSnapshotSchema.extend({
      company_id: z.string().uuid(),
      status: z.enum(["Pending", "Active"]),
    }),
    "/app/settings",
    { "23505": "abn_collision", "23514": "invalid", "42501": "save_failed" },
  );

  // The persistent workspace shell also displays the company name. Its layout
  // lives at the (app) route group, so invalidate that file-structure path only
  // after the atomic profile update and audit have both succeeded.
  revalidatePath("/(app)", "layout");
  redirect("/app/settings?saved=profile");
}

/**
 * Maintain can correct the saved onboarding profile while reviewing a Pending account.
 * The expected snapshot prevents a stale approval tab from overwriting a newer company
 * edit; the RPC updates the company, regions and audit event in one transaction.
 */
export async function updatePendingCompanyProfileAsMaintain(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const operatingRegionIds = formData.getAll("operating_region_ids").map(String).filter(Boolean);
  const decision = companyDecisionSchema.safeParse({
    company_id: formData.get("company_id"),
    expected_status: formData.get("expected_status"),
  });
  if (!decision.success) companyActionError("/admin/verification", "invalid");
  const back = `/admin/verification?company=${decision.data.company_id}`;

  let expectedProfile: unknown;
  try {
    expectedProfile = JSON.parse(String(formData.get("expected_profile") ?? ""));
  } catch {
    companyActionError(back, "invalid");
  }
  const expected = companyProfileSnapshotSchema.safeParse(expectedProfile);
  const parsed = profileSchema.safeParse({
    legal_name: formData.get("legal_name"),
    trading_name: formData.get("trading_name") || undefined,
    abn: formData.get("abn"),
    industry_id: formData.get("industry_id"),
    contact_name: formData.get("contact_name"),
    contact_email: formData.get("contact_email"),
    contact_phone: formData.get("contact_phone"),
    primary_region_id: formData.get("primary_region_id"),
    operating_region_ids: operatingRegionIds,
  });
  if (!expected.success || !parsed.success) companyActionError(back, "invalid");

  const input = parsed.data;
  const abnCheck = await checkAbn(input.abn, decision.data.company_id);
  if (!abnCheck.ok && abnCheck.reason === "invalid") companyActionError(back, "abn_checksum");
  if (!abnCheck.ok) companyActionError(back, "abn_collision");

  await companyRpc(
    "update_company_profile_atomic",
    {
      p_company_id: decision.data.company_id,
      p_expected_status: decision.data.expected_status,
      p_expected_profile: expected.data,
      p_actor_user_id: user.id,
      p_actor_scope: "maintain",
      p_legal_name: input.legal_name,
      p_trading_name: input.trading_name ?? "",
      p_abn: abnCheck.abn,
      p_industry_id: input.industry_id,
      p_contact_name: input.contact_name,
      p_contact_email: input.contact_email,
      p_contact_phone: input.contact_phone,
      p_primary_region_id: input.primary_region_id,
      p_operating_region_ids: input.operating_region_ids,
    },
    companyProfileSnapshotSchema.extend({
      company_id: z.string().uuid(),
      status: z.literal("Pending"),
    }),
    back,
    { "23505": "abn_collision", "23514": "invalid", "42501": "save_failed" },
  );
  revalidatePath("/(app)", "layout");
  revalidatePath("/admin/verification");
  redirect(`${back}&saved=profile`);
}

// ------------------------------------------------------------------ 1.3 / 1.4 documents

const documentSchema = z.object({
  doc_type: z.enum(CHECKLIST_IDS as unknown as [string, ...string[]]),
  number: z.string().trim().max(120).optional(),
  issuer: z.string().trim().max(200).optional(),
  issue_date: z.string().trim().optional(),
  expiry_date: z.string().trim().optional(),
});

/**
 * 1.3 — a Pending company can upload compliance documents; 1.4 — each one is a
 * company_document row carrying type, number, issuer, issue date, expiry date and the
 * uploaded file. 16.1 lets a Maintain admin do the same on the company's behalf, which
 * is why the company id is a parameter rather than always the caller's own.
 */
export async function uploadCompanyDocument(formData: FormData): Promise<void> {
  const asMaintain = String(formData.get("as_maintain") ?? "") === "1";
  const targetCompanyId = String(formData.get("company_id") ?? "");

  let actorUserId: string;
  let companyId: string;
  let back: string;

  if (asMaintain) {
    const user = await requireMaintainAdmin();
    actorUserId = user.id;
    companyId = targetCompanyId;
    back = `/admin/verification?company=${companyId}`;
  } else {
    const context = await requireCompanyAdmin();
    if (!writable(context.companyStatus)) redirect("/app/settings?error=read_only");
    actorUserId = context.user.id;
    companyId = context.companyId;
    back = "/app/settings";
  }

  const parsed = documentSchema.safeParse({
    doc_type: formData.get("doc_type"),
    number: formData.get("number") || undefined,
    issuer: formData.get("issuer") || undefined,
    issue_date: formData.get("issue_date") || undefined,
    expiry_date: formData.get("expiry_date") || undefined,
  });
  if (!parsed.success) redirect(`${back}?error=invalid`);
  const input = parsed.data;

  // The company id was established above from the caller's own membership or from the
  // maintain_admin gate, so the service-role client cannot be steered across a tenant
  // boundary here — and Storage has no per-company policy for a user-scoped client to
  // satisfy (1.7).
  const admin = createAdminClient();
  const file = formData.get("file");
  let filePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > DOCUMENT_MAX_BYTES) redirect(`${back}?error=file_too_large`);
    if (!DOCUMENT_MIME.has(file.type)) redirect(`${back}?error=file_type`);

    // 1.7 — private bucket, path scoped by company id; readers get short-lived signed
    // URLs minted server-side after the auth gate.
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
    const path = `${companyId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await admin.storage
      .from(DOCUMENT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) redirect(`${back}?error=upload_failed`);
    filePath = path;
  }

  const { data: row, error: insertError } = await admin
    .from("company_document")
    .insert({
      company_id: companyId,
      doc_type: input.doc_type,
      number: input.number ?? null,
      issuer: input.issuer ?? null,
      issue_date: input.issue_date || null,
      expiry_date: input.expiry_date || null,
      file_path: filePath,
    })
    .select("id")
    .single();
  if (insertError) redirect(`${back}?error=save_failed`);

  await audit({
    actor: { userId: actorUserId },
    action: "company_document.created",
    entityType: "company_document",
    entityId: row?.id,
    after: { company_id: companyId, doc_type: input.doc_type, expiry_date: input.expiry_date ?? null, admin_entered: asMaintain },
  });

  redirect(`${back}?saved=document`);
}

const companyStateSchema = z.enum(["Pending", "Active", "Suspended", "Closed"]);
const companyDecisionSchema = z.object({
  company_id: z.string().uuid(),
  expected_status: z.literal("Pending"),
});
const companyTransitionResult = z.object({
  company_id: z.string().uuid(),
  status_before: companyStateSchema,
  status_after: companyStateSchema,
  contact_email: z.string(),
  withdrawn_matches: z.array(z.object({
    match_id: z.string().uuid(),
    supplier_company_id: z.string().uuid(),
    supplier_email: z.string(),
    buyer_company_id: z.string().uuid(),
    buyer_email: z.string(),
  })),
});

function companyActionError(back: string, code: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}error=${code}`);
}

/** Checked database calls only: failure never falls through to an email or success. */
async function companyRpc<T extends z.ZodType>(
  name: string,
  args: Record<string, unknown>,
  schema: T,
  back: string,
  errorCodes: Record<string, string> = {},
): Promise<z.infer<T>> {
  let result: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    result = await createAdminClient().rpc(name, args);
  } catch {
    companyActionError(back, "save_failed");
  }
  if (result.error) {
    const mapped = result.error.code ? errorCodes[result.error.code] : undefined;
    const code = mapped ?? (result.error.code === "40001" ? "stale"
      : result.error.code === "23503" ? "not_found"
      : result.error.message === "company checklist is incomplete or expired" ? "checklist_incomplete"
      : result.error.code === "23514" ? "invalid_transition"
      : "save_failed");
    companyActionError(back, code);
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) companyActionError(back, "save_failed");
  return parsed.data;
}

function revalidateCompanyLifecycle() {
  // The company status and verification banner live in the persistent workspace
  // layout. Invalidating a page alone does not refresh that shared account state.
  revalidatePath("/(app)", "layout");
  for (const path of ["/admin/verification", "/admin/companies", "/admin/matching", "/admin/engagements"]) {
    revalidatePath(path);
  }
}

/** 1.4 — only reference flags can be created here; real documents are checked by ID. */
export async function verifyCompanyDocument(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsed = z.object({
    company_id: z.string().uuid(),
    expected_status: companyStateSchema,
    document_id: z.string().uuid().nullable(),
    doc_type: z.enum(CHECKLIST_IDS as unknown as [string, ...string[]]),
    qualification_id: z.string().uuid().nullable(),
    expected_abn: z.string().regex(/^\d{11}$/).nullable(),
  }).safeParse({
    company_id: formData.get("company_id"),
    expected_status: formData.get("expected_status"),
    document_id: formData.get("document_id") || null,
    doc_type: formData.get("doc_type"),
    qualification_id: formData.get("qualification_id") || null,
    expected_abn: formData.get("expected_abn") || null,
  });
  if (!parsed.success) companyActionError("/admin/verification", "invalid");
  const input = parsed.data;
  const back = `/admin/verification?company=${input.company_id}`;
  if (!input.document_id && !["abn_verified", "payment_details"].includes(input.doc_type)) {
    companyActionError(back, "invalid");
  }
  await companyRpc("verify_company_document_atomic", {
    p_company_id: input.company_id,
    p_document_id: input.document_id,
    p_doc_type: input.doc_type,
    p_expected_status: input.expected_status,
    p_actor_user_id: user.id,
    p_qualification_id: input.qualification_id,
    p_expected_abn: input.expected_abn,
  }, z.object({ company_id: z.string().uuid(), document_id: z.string().uuid() }), back);
  revalidateCompanyLifecycle();
  redirect(`${back}&saved=verified`);
}

// ------------------------------------------------------------------ 1.5 verification decision

/** 1.5 — approving the checklist sets the company Active and notifies it. */
export async function approveCompany(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsed = companyDecisionSchema.safeParse({
    company_id: formData.get("company_id"), expected_status: formData.get("expected_status"),
  });
  if (!parsed.success) companyActionError("/admin/verification", "invalid");
  const companyId = parsed.data.company_id;
  const result = await companyRpc("transition_company_status_atomic", {
    p_company_id: companyId, p_expected_status: parsed.data.expected_status,
    p_next_status: "Active", p_actor_user_id: user.id,
  }, companyTransitionResult, `/admin/verification?company=${companyId}`);
  await Promise.allSettled([notify({
    trigger: NOTIFICATION_TRIGGERS.COMPANY_VERIFIED,
    to: result.contact_email,
    subject: "Your company is verified",
    body: "Verification is complete. You can now list spare capacity and post requirements.",
    companyId,
    entityType: "company",
    entityId: companyId,
    actionPath: "/app",
  })]);
  revalidateCompanyLifecycle();
  redirect("/admin/verification?saved=approved");
}

/**
 * 1.5 — rejecting records a reason and notifies the company. There is no Rejected
 * company status in 3.2, so the company stays Pending with the reason held in the
 * audit trail (18.3, Maintain-visible) and stated in the notification.
 */
export async function rejectCompany(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsed = companyDecisionSchema.safeParse({
    company_id: formData.get("company_id"), expected_status: formData.get("expected_status"),
  });
  if (!parsed.success) companyActionError("/admin/verification", "invalid");
  const companyId = parsed.data.company_id;
  const reason = String(formData.get("reason") ?? "").trim();
  const back = `/admin/verification?company=${companyId}`;
  if (reason.length < 4) companyActionError(back, "reason_required");
  if (reason.length > 2000) companyActionError(back, "invalid");
  const result = await companyRpc("reject_company_verification_atomic", {
    p_company_id: companyId, p_expected_status: parsed.data.expected_status,
    p_reason: reason, p_actor_user_id: user.id,
  }, z.object({ company_id: z.string().uuid(), contact_email: z.string() }), back);
  await Promise.allSettled([notify({
    trigger: NOTIFICATION_TRIGGERS.COMPANY_REJECTED,
    to: result.contact_email,
    subject: "Verification could not be completed",
    body: `Maintain could not complete verification yet. Reason given: ${reason}`,
    companyId,
    entityType: "company",
    entityId: companyId,
    actionPath: "/app/settings",
  })]);
  revalidateCompanyLifecycle();
  redirect("/admin/verification?saved=rejected");
}

// ------------------------------------------------------------------ 3.2 company status

/**
 * 3.2 — Pending → Active, Active ⇄ Suspended, any → Closed (terminal). Only a Maintain
 * admin changes a company's status (1.5).
 *
 * Suspended effects that belong to this module: new supply and demand are blocked and
 * the workspace goes read-only (both enforced by requireActiveCompany / writable), and
 * the company's open matches are withdrawn by Maintain with both parties notified
 * (15.2 "match withdrawn by Maintain"). Engagement review flagging lives with the
 * engagement module.
 */
export async function setCompanyStatus(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsed = z.object({
    company_id: z.string().uuid(), expected_status: companyStateSchema, status: companyStateSchema,
  }).safeParse({
    company_id: formData.get("company_id"), expected_status: formData.get("expected_status"), status: formData.get("status"),
  });
  if (!parsed.success) companyActionError("/admin/companies", "invalid");
  const input = parsed.data;
  const result = await companyRpc("transition_company_status_atomic", {
    p_company_id: input.company_id, p_expected_status: input.expected_status,
    p_next_status: input.status, p_actor_user_id: user.id,
  }, companyTransitionResult, "/admin/companies");
  if (result.status_before === "Pending" && result.status_after === "Active") {
    await Promise.allSettled([notify({
      trigger: NOTIFICATION_TRIGGERS.COMPANY_VERIFIED, to: result.contact_email,
      subject: "Your company is verified",
      body: "Verification is complete. You can now list spare capacity and post requirements.",
      companyId: result.company_id, entityType: "company", entityId: result.company_id, actionPath: "/app",
    })]);
  }
  await Promise.allSettled(result.withdrawn_matches.flatMap((match) => [
    { id: match.supplier_company_id, email: match.supplier_email },
    { id: match.buyer_company_id, email: match.buyer_email },
  ].map((party) => notify({
    trigger: NOTIFICATION_TRIGGERS.MATCH_WITHDRAWN,
    to: party.email, subject: "A proposed match has been withdrawn",
    body: "Maintain has withdrawn a proposed match. Open the app for the current position.",
    companyId: party.id, entityType: "match", entityId: match.match_id,
    actionPath: `/app/matches/${match.match_id}`,
  }))));
  revalidateCompanyLifecycle();
  redirect("/admin/companies?saved=status");
}

// ------------------------------------------------------------------ 1.8 administrators

/**
 * 1.8 — an existing Company Administrator invites another by email; the invitee sets a
 * password through a tokenised link and is bound to the inviting company only.
 *
 * Clerk owns the tokenized invitation and adds the target company to backend-only
 * metadata. requireCompanyAdmin creates the company_user binding after acceptance.
 */
export async function inviteCompanyAdmin(formData: FormData): Promise<void> {
  const { user, companyId, companyStatus } = await requireCompanyAdmin();
  if (!writable(companyStatus)) redirect("/app/settings?error=read_only");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) redirect("/app/settings?error=invalid_email");

  const existing = await findUserByEmail(email);
  if (existing) {
    const admin = createAdminClient();
    const { data: existingMembership } = await admin
      .from("company_user")
      .select("company_id")
      .eq("user_id", existing.id)
      .maybeSingle();
    if (existingMembership) {
      redirect(
        existingMembership.company_id === companyId
          ? "/app/settings?error=already_active"
          : "/app/settings?error=invite_failed",
      );
    }
  }

  const invited = await inviteAdministrator(email, companyId);
  if (!invited.ok) redirect("/app/settings?error=invite_failed");

  await audit({
    actor: { userId: user.id },
    action: "company_user.invited",
    entityType: "company_user",
    entityId: email,
    after: { company_id: companyId, email },
  });

  await notify({
    trigger: NOTIFICATION_TRIGGERS.ADMIN_INVITATION,
    to: email,
    subject: "You have been invited to administer a company on Maintain Workforce",
    body: "Clerk has emailed a secure link to finish joining the company.",
    companyId,
    entityType: "company_user",
    entityId: email,
  });

  redirect("/app/settings?saved=invited");
}

/**
 * 18.2 — "company user invited/removed" is an audited pair. Removal deletes the
 * company_user binding (2.2), which is what revokes access; the auth user remains,
 * inert, because deleting accounts is not this action's business.
 */
export async function removeCompanyAdmin(formData: FormData): Promise<void> {
  const { user, companyId, companyStatus } = await requireCompanyAdmin();
  if (!writable(companyStatus)) redirect("/app/settings?error=read_only");

  const targetUserId = String(formData.get("user_id") ?? "");
  if (!targetUserId) redirect("/app/settings?error=invalid_user");
  if (targetUserId === user.id) redirect("/app/settings?error=cannot_remove_self");

  const admin = createAdminClient();

  // Never orphan a company: the last administrator cannot be removed, or nobody
  // could ever approve a transfer release or accept a match again.
  const { count } = await admin
    .from("company_user")
    .select("user_id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if ((count ?? 0) <= 1) redirect("/app/settings?error=last_admin");

  const { error } = await admin
    .from("company_user")
    .delete()
    .eq("user_id", targetUserId)
    .eq("company_id", companyId);
  if (error) redirect("/app/settings?error=remove_failed");

  await audit({
    actor: { userId: user.id },
    action: "company_user.removed",
    entityType: "company_user",
    entityId: targetUserId,
    before: { company_id: companyId },
  });

  redirect("/app/settings?saved=removed");
}

/**
 * 1.8 — an expired invitation token can be re-issued by a company administrator or a
 * Maintain admin (audited). This matters most for the 0.3 path: a lead-qualified
 * company may stay login-less far past the first token's 72-hour expiry, and without
 * a re-issue that company could never gain its first administrator.
 */
export async function reissueInvitation(formData: FormData): Promise<void> {
  // Either role may re-issue; each is scoped to its own authority. A company admin
  // can only re-issue for their own company; Maintain for any.
  let actorUserId: string;
  let companyId: string;
  let returnPath: "/app/settings" | "/admin/companies";
  const clerkUser = await currentUser();
  if (isMaintainAdmin(clerkUser?.publicMetadata as Record<string, unknown> | undefined)) {
    actorUserId = (await requireMaintainAdmin()).id;
    companyId = String(formData.get("company_id") ?? "");
    returnPath = "/admin/companies";
    if (!z.string().uuid().safeParse(companyId).success) {
      redirect(`${returnPath}?error=invalid`);
    }
  } else {
    const context = await requireCompanyAdmin();
    if (!writable(context.companyStatus)) redirect("/app/settings?error=read_only");
    actorUserId = context.user.id;
    companyId = context.companyId;
    returnPath = "/app/settings";
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    redirect(`${returnPath}?error=invalid_email`);
  }

  const existing = await findUserByEmail(email);
  if (existing && (await userHasSignedIn(existing.id))) {
    redirect(`${returnPath}?error=already_active`);
  }

  const invited = await inviteAdministrator(email, companyId);
  if (!invited.ok) redirect(`${returnPath}?error=invite_failed`);

  await audit({
    actor: { userId: actorUserId },
    action: "company_user.invitation_reissued",
    entityType: "company_user",
    entityId: existing?.id ?? email,
    after: { company_id: companyId, email },
  });

  await notify({
    trigger: NOTIFICATION_TRIGGERS.ADMIN_INVITATION,
    to: email,
    subject: "Your Maintain Workforce invitation, re-issued",
    body: "Clerk has emailed a fresh secure link to finish joining.",
    companyId,
    entityType: "company_user",
    entityId: existing?.id ?? email,
  });

  redirect(`${returnPath}?saved=invited`);
}
