"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMaintainAdmin, requireWritableCompany } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWorkerStatusKnockouts } from "@/lib/match-orchestration";
import { audit } from "@/lib/audit";
import type { DocumentStatus, WorkerStatus } from "@/lib/supabase/types";

type WorkerStatusCascadeResult = {
  knocked_out_match_ids?: string[];
  declined_match_ids?: string[];
  buyer_declined_match_ids?: string[];
  buyer_renotification_match_ids?: string[];
};

async function notifyWorkerStatusCascade(data: unknown): Promise<void> {
  const result = (data ?? {}) as WorkerStatusCascadeResult;
  await notifyWorkerStatusKnockouts({
    knockedOutMatchIds: result.knocked_out_match_ids ?? [],
    declinedMatchIds: result.declined_match_ids ?? [],
    buyerDeclinedMatchIds: result.buyer_declined_match_ids ?? [],
    buyerRenotificationMatchIds: result.buyer_renotification_match_ids ?? [],
  });
}

// Workers — spec module 6, and the qualification records of module 7.
//
// Two service-role uses in this file are deliberate and cannot be done any other way:
//   * 6.2 duplicate detection has to see workers the caller's RLS scope hides — that is
//     the whole point of the rule, and the response deliberately reveals nothing but
//     existence.
//   * 6.4 worker creation writes the worker row before the employment row exists, and
//     worker RLS is keyed on the open employment row, so the first insert can never
//     satisfy its own policy.
// Both run only after requireWritableCompany, and every write is pinned to the session's
// company id — never to a company id supplied by the caller.

export type WorkerFormResult = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  /** React 19 resets uncontrolled fields after an action; echo so a failure is not data loss. */
  values?: Record<string, string>;
  /**
   * 6.2 — existence only. The flag says "a record matches"; it never says which field
   * matched and never names the current employer. It exists so the form can offer the
   * module 8 transfer flow, which is the only door into a transfer (8.1).
   */
  collision?: boolean;
};

/**
 * 20.5 — availability and employment dates are calendar dates in Australia/Brisbane.
 * Queensland does not observe daylight saving, so the offset is a constant +10 and
 * no timezone library is needed to name today's date on a site calendar.
 */
function brisbaneToday(): string {
  return new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 6.2 — uniqueness is only meaningful against a normalised value: "0400 000 000" and
 * "0400000000" are the same mobile, and a collision must not be dodgeable by spacing.
 */
function normaliseMobile(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 7.1 — qualification status is derived, never manually set: Current, Expiring Soon
 * (within 30 days), Expired. The daily job (19) writes the same value to the column;
 * this is the between-runs read-time derivation.
 */
function credentialStatus(expiry: string | null, today: string): DocumentStatus {
  if (!expiry) return "Current";
  if (expiry < today) return "Expired";
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return expiry <= horizon ? "Expiring Soon" : "Current";
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const workerSchema = z.object({
  first_name: z.string().trim().min(1, "Give the worker's first name."),
  last_name: z.string().trim().min(1, "Give the worker's last name."),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[\d\s().-]{8,20}$/, "A mobile number, like 0400 000 000."),
  email: z.string().trim().email("That email does not look right."),
  base_region_id: z.uuid("Pick the worker's base region."),
  primary_trade_id: z.uuid("Pick the worker's primary trade."),
  primary_proficiency_id: z.uuid("Pick the worker's proficiency."),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date this worker joined."),
  // 6.3 — consent is a precondition of the record existing, so it is validated with
  // the rest of the profile rather than assumed by a disabled submit button.
  consent: z.literal(
    "on",
    "Confirm this worker has been informed and consents to being listed.",
  ),
});

const WORKER_KEYS = [
  "first_name",
  "last_name",
  "mobile",
  "email",
  "base_region_id",
  "primary_trade_id",
  "primary_proficiency_id",
  "start_date",
];

/**
 * 6.1–6.4 — create a worker for the calling company.
 *
 * 1.3 lets a Pending company prepare its crew before verification, so this is gated on
 * requireWritableCompany, not requireActiveCompany: what Pending cannot do is list capacity.
 */
export async function createWorker(
  _previous: WorkerFormResult | null,
  formData: FormData,
): Promise<WorkerFormResult> {
  const { user, companyId } = await requireWritableCompany();

  const values: Record<string, string> = {};
  for (const key of WORKER_KEYS) values[key] = String(formData.get(key) ?? "");
  const skillIds = formData.getAll("skills").map(String).filter(Boolean);
  const travelRegionIds = formData.getAll("travel_regions").map(String).filter(Boolean);
  values.skills = skillIds.join(",");
  values.travel_regions = travelRegionIds.join(",");
  // 6.3 — the attestation is echoed with the rest of the form. Clearing it on an
  // unrelated save failure re-asks for a confirmation this user just gave, and reads
  // as "the tick was the problem" when it was not.
  values.consent = String(formData.get("consent") ?? "");

  const parsed = workerSchema.safeParse({
    ...values,
    consent: formData.get("consent") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error), values };
  }

  const input = parsed.data;
  const email = normaliseEmail(input.email);
  const mobile = normaliseMobile(input.mobile);
  const admin = createAdminClient();

  // 4.2 — worker classification may only use a (trade, proficiency) pair the catalogue
  // declares valid for that trade. Enforced here because the select is data-driven and
  // a hand-rolled POST would otherwise carry any pair it liked.
  const { data: pair } = await admin
    .from("trade_role_proficiency")
    .select("trade_role_id")
    .eq("trade_role_id", input.primary_trade_id)
    .eq("proficiency_id", input.primary_proficiency_id)
    .maybeSingle();
  if (!pair) {
    return {
      ok: false,
      values,
      errors: { primary_proficiency_id: "That proficiency is not offered for this trade." },
    };
  }

  // 6.2 — email AND mobile are each unique platform-wide, and a match on either blocks
  // creation. Two separate equality filters rather than one composed `or` string so no
  // user-supplied value is ever interpolated into a filter expression.
  const [byEmail, byMobile] = await Promise.all([
    admin.from("worker").select("id").eq("email", email).limit(1),
    admin.from("worker").select("id").eq("mobile", mobile).limit(1),
  ]);
  if ((byEmail.data?.length ?? 0) > 0 || (byMobile.data?.length ?? 0) > 0) {
    return collisionResult(values);
  }

  const { data: workerId, error } = await admin.rpc("create_worker_transactional", {
    p_company_id: companyId,
    p_actor_user_id: user.id,
    p_admin_entered: false,
    p_evidence_note: null,
    p_payload: {
      first_name: input.first_name,
      last_name: input.last_name,
      mobile,
      email,
      base_region_id: input.base_region_id,
      primary_trade_id: input.primary_trade_id,
      primary_proficiency_id: input.primary_proficiency_id,
      start_date: input.start_date,
      consent_confirmed: true,
      travel_region_ids: travelRegionIds,
      skill_ids: skillIds,
    },
  });

  if (error || !workerId) {
    // The unique indexes on email and mobile are the real guarantee; a request that
    // races the check above lands here and must answer with the same 6.2 wording.
    if (error?.code === "23505") return collisionResult(values);
    return { ok: false, values, message: "That worker could not be saved. Try again." };
  }

  revalidatePath("/app/workers");
  redirect(`/app/workers/${workerId as string}`);
}

/**
 * 6.2 — one wording for every collision, whichever field matched. It names no field and
 * no employer, and it points at the transfer flow, which 8.1 makes the only entry point.
 */
function collisionResult(values: Record<string, string>): WorkerFormResult {
  return {
    ok: false,
    collision: true,
    values,
    message:
      "These details match an existing worker record. If this worker is joining you, request a transfer instead.",
  };
}

/**
 * 6.5 / module 19 — stored worker status is account-level only. A company admin moves
 * its own worker between Active and Inactive; Suspended is Maintain's to set, so it is
 * refused here rather than merely hidden from the form.
 *
 * The database RPC owns the compare-and-swap, tenant check and audit in one transaction.
 * Direct authenticated UPDATE cannot name the status column.
 */
export async function setWorkerAccountStatus(formData: FormData): Promise<void> {
  await requireWritableCompany();
  const workerId = String(formData.get("worker_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (status !== "Active" && status !== "Inactive") {
    redirect(`/app/workers/${workerId}?notice=not-permitted`);
  }

  const supabase = await createClient();
  const { data: before, error: beforeError } = await supabase
    .from("worker")
    .select("status")
    .eq("id", workerId)
    .maybeSingle();

  if (
    beforeError ||
    !before ||
    (before.status !== "Active" && before.status !== "Inactive")
  ) {
    redirect(`/app/workers/${workerId}?notice=not-permitted`);
  }

  const { data: knockoutResult, error } = await supabase.rpc("set_company_worker_status", {
    p_worker_id: workerId,
    p_expected_status: before.status,
    p_status: status,
  });

  if (error) redirect(`/app/workers/${workerId}?notice=not-permitted`);

  // The RPC committed the status, audit, nomination knockouts, and any crew-floor
  // declines atomically. Email delivery is intentionally post-commit.
  if (status !== "Active") {
    await notifyWorkerStatusCascade(knockoutResult);
  }

  revalidatePath(`/app/workers/${workerId}`);
  redirect(`/app/workers/${workerId}?notice=status-updated`);
}

/**
 * 7.1 — a worker qualification references the Qualification catalogue. Status is derived
 * here from the expiry date rather than taken from the form: 7.1 forbids setting it by hand.
 *
 * The optional document lands in the private worker-qualifications bucket under the
 * worker's own id — deliberately not a company id, so the path is never re-parented on
 * transfer (7.1); nothing in module 8 touches worker_qualification, which keeps that rule.
 */
export async function addWorkerQualification(formData: FormData): Promise<void> {
  const { user } = await requireWritableCompany();
  const workerId = String(formData.get("worker_id") ?? "");
  const qualificationId = String(formData.get("qualification_id") ?? "");
  const number = String(formData.get("number") ?? "").trim();
  const issueDate = String(formData.get("issue_date") ?? "").trim();
  const expiryDate = String(formData.get("expiry_date") ?? "").trim();

  const parsed = z
    .object({ worker_id: z.uuid(), qualification_id: z.uuid() })
    .safeParse({ worker_id: workerId, qualification_id: qualificationId });
  if (!parsed.success) redirect(`/app/workers/${workerId}?notice=invalid`);

  const supabase = await createClient();

  // Same limits as company documents (1.7). The user-scoped upload is deliberate: the
  // worker-qualifications storage policy proves the current company employs the worker,
  // so a forged worker id cannot be turned into a service-role write.
  let filePath: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) redirect(`/app/workers/${workerId}?notice=file-too-large`);
    if (!new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]).has(file.type))
      redirect(`/app/workers/${workerId}?notice=file-type`);

    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
    const path = `${workerId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("worker-qualifications")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) redirect(`/app/workers/${workerId}?notice=upload-failed`);
    filePath = path;
  }

  const { data: row, error } = await supabase
    .from("worker_qualification")
    .insert({
      worker_id: workerId,
      qualification_id: qualificationId,
      number: number || null,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      file_path: filePath,
      status: credentialStatus(expiryDate || null, brisbaneToday()),
    })
    .select("id")
    .maybeSingle();

  if (error || !row) {
    if (filePath) {
      // Storage currently grants tenant uploads but not deletes. Cleanup is therefore
      // the one narrowly scoped service-role operation: only the exact random path that
      // this already-authorised request successfully uploaded can be removed.
      await createAdminClient().storage.from("worker-qualifications").remove([filePath]);
    }
    redirect(`/app/workers/${workerId}?notice=not-permitted`);
  }

  await audit({
    actor: { userId: user.id },
    action: "worker.qualification_added",
    entityType: "worker_qualification",
    entityId: row.id,
    after: { worker_id: workerId, qualification_id: qualificationId, expiry_date: expiryDate || null },
  });

  revalidatePath(`/app/workers/${workerId}`);
  redirect(`/app/workers/${workerId}?notice=qualification-added`);
}

/**
 * 7.3 — the matching satisfaction rule, exported so the matching workspace (module 11)
 * applies exactly one definition of "satisfied".
 *
 * A required qualification is fully satisfied when it is not Expired AND its expiry falls
 * on or after the demand line's end date. Expiring Soon that still clears the window
 * leaves the worker eligible with a badge; an expiry inside the window is the "expires
 * during engagement" grey; an expiry before the start date, or already Expired, excludes.
 */
export async function qualificationSatisfies(input: {
  expiryDate: string | null;
  demandStartDate: string;
  demandEndDate: string;
  today?: string;
}): Promise<{
  status: DocumentStatus;
  satisfied: boolean;
  excluded: boolean;
  expiresDuringEngagement: boolean;
  expiringSoonBadge: boolean;
}> {
  const today = input.today ?? brisbaneToday();
  const status = credentialStatus(input.expiryDate, today);
  const expiry = input.expiryDate;

  const excluded = status === "Expired" || (expiry !== null && expiry < input.demandStartDate);
  const satisfied = !excluded && (expiry === null || expiry >= input.demandEndDate);
  const expiresDuringEngagement =
    !excluded && expiry !== null && expiry >= input.demandStartDate && expiry < input.demandEndDate;

  return {
    status,
    satisfied,
    excluded,
    expiresDuringEngagement,
    expiringSoonBadge: satisfied && status === "Expiring Soon",
  };
}

/**
 * 6.6 — Maintain admins can override a worker's proficiency, and the override is audited
 * and stamped on the worker so its provenance is readable forever after.
 */
export async function overrideWorkerProficiency(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsed = z.object({ worker_id: z.string().uuid(), proficiency_id: z.string().uuid() }).safeParse({
    worker_id: formData.get("worker_id"),
    proficiency_id: formData.get("proficiency_id"),
  });
  if (!parsed.success) redirect("/admin/workers?notice=invalid");
  // PostgreSQL returns canonical lowercase UUIDs; form casing is not a proficiency change.
  const workerId = parsed.data.worker_id.toLowerCase();
  const proficiencyId = parsed.data.proficiency_id.toLowerCase();

  const admin = createAdminClient();
  const provenanceColumns = "id, primary_trade_id, primary_proficiency_id, proficiency_assigned_by, proficiency_overridden_by_maintain, proficiency_changed_at";
  const { data: before, error: readError } = await admin
    .from("worker")
    .select(provenanceColumns)
    .eq("id", workerId)
    .maybeSingle();

  if (readError) redirect("/admin/workers?notice=proficiency-update-failed");
  if (!before) redirect("/admin/workers?notice=not-found");

  // 4.2 holds for Maintain too: an override may only land on a proficiency the trade
  // actually supports.
  const { data: pair, error: pairError } = await admin
    .from("trade_role_proficiency")
    .select("trade_role_id")
    .eq("trade_role_id", before.primary_trade_id)
    .eq("proficiency_id", proficiencyId)
    .maybeSingle();
  if (pairError) redirect("/admin/workers?notice=proficiency-update-failed");
  if (!pair) redirect("/admin/workers?notice=invalid-proficiency");
  if (before.primary_proficiency_id === proficiencyId) {
    redirect("/admin/workers?notice=proficiency-unchanged");
  }

  const now = new Date().toISOString();
  let update = admin
    .from("worker")
    .update({
      primary_proficiency_id: proficiencyId,
      proficiency_assigned_by: user.id,
      proficiency_overridden_by_maintain: true,
      proficiency_changed_at: now,
    })
    .eq("id", workerId)
    .eq("primary_trade_id", before.primary_trade_id)
    .eq("primary_proficiency_id", before.primary_proficiency_id)
    .eq("proficiency_overridden_by_maintain", before.proficiency_overridden_by_maintain);
  // Compare the provenance too: another admin's override must not be overwritten or
  // attributed to the snapshot read by this request. Nullable values need SQL IS NULL.
  update = before.proficiency_assigned_by === null
    ? update.is("proficiency_assigned_by", null)
    : update.eq("proficiency_assigned_by", before.proficiency_assigned_by);
  update = before.proficiency_changed_at === null
    ? update.is("proficiency_changed_at", null)
    : update.eq("proficiency_changed_at", before.proficiency_changed_at);
  const { data: after, error: updateError } = await update.select(provenanceColumns).maybeSingle();
  if (updateError) redirect("/admin/workers?notice=proficiency-update-failed");
  if (!after) redirect("/admin/workers?notice=worker-changed");

  await audit({
    actor: { userId: user.id },
    action: "worker.proficiency_overridden_by_maintain",
    entityType: "worker",
    entityId: workerId,
    before,
    after,
  });

  revalidatePath("/admin/workers");
  redirect("/admin/workers?notice=proficiency-overridden");
}

/** 6.5 / module 19 — Maintain sets any of the three stored statuses, Suspended included. */
export async function maintainSetWorkerStatus(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const workerId = String(formData.get("worker_id") ?? "");
  const status = String(formData.get("status") ?? "") as WorkerStatus;

  if (status !== "Active" && status !== "Inactive" && status !== "Suspended") {
    redirect("/admin/workers?notice=invalid");
  }

  const admin = createAdminClient();
  const { data: before, error: beforeError } = await admin
    .from("worker")
    .select("status")
    .eq("id", workerId)
    .maybeSingle();

  if (
    beforeError ||
    !before ||
    (before.status !== "Active" &&
      before.status !== "Inactive" &&
      before.status !== "Suspended")
  ) {
    redirect("/admin/workers?notice=not-permitted");
  }

  const { data: knockoutResult, error } = await admin.rpc("set_company_worker_status", {
    p_worker_id: workerId,
    p_expected_status: before.status,
    p_status: status,
    p_actor_user_id: user.id,
  });

  if (error) redirect("/admin/workers?notice=not-permitted");

  // 12.7 — the RPC committed the exact-CAS status change, audit, knockouts, and
  // crew-floor transitions atomically. Only notification delivery remains here.
  if (status !== "Active") {
    await notifyWorkerStatusCascade(knockoutResult);
  }

  revalidatePath("/admin/workers");
  redirect("/admin/workers?notice=status-updated");
}
