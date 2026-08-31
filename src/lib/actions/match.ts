"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/lib/actions";
import { requireActiveCompany, requireMaintainAdmin } from "@/lib/auth";
import { notifyWorkerStatusKnockouts } from "@/lib/match-orchestration";
import { brisbaneToday, demandLineCounts, loadMatchRow } from "@/lib/matching";
import { notify, NOTIFICATION_TRIGGERS, type NotifyInput } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinedRow, type MatchStatus } from "@/lib/supabase/types";

// Every exported mutation authenticates its actor independently. The service-only
// RPC owns eligibility, exact CAS, records and audit in one transaction. Only
// notification delivery and cache refresh happen after it commits.
const MAINTAIN_INBOX =
  process.env.MAINTAIN_NOTIFICATION_EMAIL ?? process.env.BOOKING_NOTIFICATION_EMAIL ?? "";
const openStatus = z.enum(["Awaiting Supplier", "Awaiting Buyer"]);
const evidenceNote = z.string().trim().min(10, "Record who you spoke to and when.").max(4000);
const version = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  z.coerce.number().int().nonnegative(),
);
const matchResult = z.object({
  match_id: z.string().uuid(),
  supplier_company_id: z.string().uuid(),
  buyer_company_id: z.string().uuid(),
}).passthrough();
type MatchResult = z.infer<typeof matchResult>;
type DatabaseError = { code?: string; message?: string } | null;

async function runTransaction(
  operation: () => PromiseLike<{ data: unknown; error: DatabaseError }>,
): Promise<{ data: unknown; error: DatabaseError }> {
  try {
    return await operation();
  } catch {
    // A lost response can follow a commit; exact CAS makes a refresh/retry safe.
    return { data: null, error: { code: "TRANSPORT" } };
  }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

function transactionFailure(error: DatabaseError): FormResult {
  if (error?.code === "40001" || error?.code === "40P01") {
    return { ok: false, message: "This proposal changed while you were deciding. Refresh and review the current proposal." };
  }
  if (error?.code === "42501") {
    return { ok: false, message: "This match decision is not available for your company." };
  }
  if (error?.code === "23514" || error?.code === "23P01") {
    return { ok: false, message: "The crew or proposal no longer satisfies availability, ticket, rate or booking rules. Refresh and review the current details." };
  }
  if (error?.code === "23503") {
    return { ok: false, message: "A record needed for this proposal no longer exists. Refresh before trying again." };
  }
  return { ok: false, message: "We could not confirm this decision. Refresh the match before trying again." };
}

async function companyEmail(companyId: string): Promise<string> {
  const { data, error } = await createAdminClient().from("company")
    .select("contact_email").eq("id", companyId).maybeSingle();
  if (error || !data) throw new Error("Notification recipient could not be loaded");
  return String(data.contact_email);
}

async function companyNotification(companyId: string, input: Omit<NotifyInput, "to" | "companyId">) {
  return notify({ ...input, to: await companyEmail(companyId), companyId });
}

/** A delivery rejection must not turn a committed marketplace decision into a failure. */
async function deliverNonBlocking(jobs: (() => Promise<unknown>)[]): Promise<void> {
  const delivered = await Promise.allSettled(jobs.map((job) => Promise.resolve().then(job)));
  if (delivered.some((item) => item.status === "rejected")) {
    console.error("A post-commit match notification could not be delivered.");
  }
}

function refreshMatches(matchId?: string) {
  revalidatePath("/app/matches");
  revalidatePath("/admin/matching");
  revalidatePath("/admin/matching/[demandLineId]", "page");
  if (matchId) revalidatePath(`/app/matches/${matchId}`);
}

function supplierAcceptanceNotifications(row: MatchResult, substituted = false) {
  return deliverNonBlocking([
    () => companyNotification(row.buyer_company_id, {
      trigger: NOTIFICATION_TRIGGERS.SUPPLIER_ACCEPTED,
      entityType: "match", entityId: row.match_id,
      subject: substituted ? "An updated proposal is ready for your review" : "A proposal is ready for your decision",
      body: substituted
        ? "The supplying business has updated its nominations. Review the current name-free crew summary before deciding."
        : "A supplying business has accepted a proposal against your requirement. Review the shape and accept or decline it.",
      actionPath: `/app/matches/${row.match_id}`,
    }),
    () => notify({
      trigger: NOTIFICATION_TRIGGERS.SUPPLIER_ACCEPTED, to: MAINTAIN_INBOX,
      entityType: "match", entityId: row.match_id,
      subject: substituted ? "Supplier updated its nominations" : "Supplier accepted a match",
      body: "The supplying business has confirmed its nominations. The proposal is with the hiring business for review.",
      actionPath: "/admin/matching",
    }),
  ]);
}

const proposeSchema = z.object({
  demand_line_id: z.string().uuid(),
  candidates: z.array(z.string().regex(
    /^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, "Refresh the candidate list before proposing.",
  )).min(1, "Shortlist at least one candidate."),
  include_higher_proficiency: z.boolean(),
  qualification_override: z.boolean(),
  override_evidence_note: z.string().trim().max(4000),
}).superRefine((value, context) => {
  if (value.qualification_override && value.override_evidence_note.length < 10) {
    context.addIssue({ code: "custom", path: ["override_evidence_note"], message: "Explain the shortlisted exception and why it is acceptable." });
  }
});

export async function proposeMatches(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const actingUser = await requireMaintainAdmin();
  const parsed = proposeSchema.safeParse({
    demand_line_id: formData.get("demand_line_id"),
    candidates: formData.getAll("candidate").map(String).filter(Boolean),
    include_higher_proficiency: formData.get("include_higher_proficiency") === "on",
    qualification_override: formData.get("qualification_override") === "on",
    override_evidence_note: formData.get("override_evidence_note") ?? "",
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const candidates = parsed.data.candidates.map((key) => {
    const [capacity_line_id, worker_id] = key.split(":");
    return { capacity_line_id, worker_id };
  });
  if (!z.array(z.object({ capacity_line_id: z.string().uuid(), worker_id: z.string().uuid() })).safeParse(candidates).success) {
    return { ok: false, message: "Refresh the candidate list before proposing." };
  }
  const { data, error } = await runTransaction(() => createAdminClient().rpc("propose_matches_atomic", {
    p_demand_line_id: parsed.data.demand_line_id,
    p_candidates: candidates,
    p_include_higher_proficiency: parsed.data.include_higher_proficiency,
    p_qualification_override: parsed.data.qualification_override,
    p_override_evidence_note: parsed.data.override_evidence_note || null,
    p_actor_user_id: actingUser.id,
    p_effective_date: brisbaneToday(),
  }));
  const result = z.object({ matches: z.array(matchResult).min(1) }).safeParse(data);
  if (error || !result.success) return transactionFailure(error);
  await deliverNonBlocking(result.data.matches.map((match) => () =>
    companyNotification(match.supplier_company_id, {
      trigger: NOTIFICATION_TRIGGERS.MATCH_PROPOSED, entityType: "match", entityId: match.match_id,
      subject: "A new match needs your decision",
      body: "Maintain has proposed a match against your available capacity. Open the proposal and nominate your crew or decline.",
      actionPath: `/app/matches/${match.match_id}`,
    }),
  ));
  refreshMatches();
  return { ok: true, message: `${result.data.matches.length} match${result.data.matches.length === 1 ? "" : "es"} proposed.` };
}

const supplierSchema = z.object({
  match_id: z.string().uuid(),
  worker_ids: z.array(z.string().uuid()).min(1, "Nominate at least one of your crew.")
    .refine((ids) => new Set(ids).size === ids.length, "Nominate each worker only once."),
});

async function acceptAsSupplier(input: {
  matchId: string; workerIds: string[]; companyId: string | null;
  actorId: string; adminEntered: boolean; evidence?: string;
}): Promise<FormResult> {
  const { data, error } = await runTransaction(() => createAdminClient().rpc("accept_match_as_supplier", {
    p_match_id: input.matchId, p_expected_status: "Awaiting Supplier",
    p_worker_ids: input.workerIds, p_supplier_company_id: input.companyId,
    p_actor_user_id: input.actorId, p_admin_entered: input.adminEntered,
    p_evidence_note: input.evidence ?? null, p_effective_date: brisbaneToday(),
  }));
  const result = matchResult.safeParse(data);
  if (error || !result.success) return transactionFailure(error);
  refreshMatches(input.matchId);
  await supplierAcceptanceNotifications(result.data);
  return { ok: true, message: "Accepted. The hiring business can now review your nominations." };
}

export async function supplierAcceptMatch(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireActiveCompany();
  const parsed = supplierSchema.safeParse({
    match_id: formData.get("match_id"), worker_ids: formData.getAll("worker_id").map(String),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return acceptAsSupplier({ matchId: parsed.data.match_id, workerIds: parsed.data.worker_ids,
    companyId, actorId: user.id, adminEntered: false });
}

export async function recordSupplierAcceptance(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = supplierSchema.extend({ evidence_note: evidenceNote }).safeParse({
    match_id: formData.get("match_id"), worker_ids: formData.getAll("worker_id").map(String),
    evidence_note: formData.get("evidence_note"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return acceptAsSupplier({ matchId: parsed.data.match_id, workerIds: parsed.data.worker_ids,
    companyId: null, actorId: user.id, adminEntered: true, evidence: parsed.data.evidence_note });
}

export async function supplierSubstituteNominations(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireActiveCompany();
  const parsed = supplierSchema.extend({ expected_nomination_version: version }).safeParse({
    match_id: formData.get("match_id"), worker_ids: formData.getAll("worker_id").map(String),
    expected_nomination_version: formData.get("expected_nomination_version"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { data, error } = await runTransaction(() => createAdminClient().rpc("substitute_match_nominations", {
    p_match_id: parsed.data.match_id, p_expected_status: "Awaiting Buyer",
    p_expected_nomination_version: parsed.data.expected_nomination_version,
    p_worker_ids: parsed.data.worker_ids, p_supplier_company_id: companyId,
    p_actor_user_id: user.id, p_effective_date: brisbaneToday(),
  }));
  const result = matchResult.safeParse(data);
  if (error || !result.success) return transactionFailure(error);
  refreshMatches(parsed.data.match_id);
  await supplierAcceptanceNotifications(result.data, true);
  return { ok: true, message: "Nominations updated. The hiring business must review the updated proposal." };
}

const declineSchema = z.object({
  match_id: z.string().uuid(), expected_status: openStatus,
  reason: z.string().trim().max(1000),
});

async function decline(input: {
  matchId: string; expectedStatus: z.infer<typeof openStatus>; by: "supplier" | "buyer";
  companyId: string | null; actorId: string; adminEntered: boolean; evidence?: string; reason: string;
}): Promise<FormResult> {
  const { data, error } = await runTransaction(() => createAdminClient().rpc("decline_match_atomic", {
    p_match_id: input.matchId, p_expected_status: input.expectedStatus, p_party: input.by,
    p_company_id: input.companyId, p_actor_user_id: input.actorId, p_admin_entered: input.adminEntered,
    p_evidence_note: input.evidence ?? null, p_reason: input.reason || null,
  }));
  const result = matchResult.safeParse(data);
  if (error || !result.success) return transactionFailure(error);
  refreshMatches(input.matchId);
  const otherCompanyId = input.by === "supplier" ? result.data.buyer_company_id : result.data.supplier_company_id;
  await deliverNonBlocking([
    () => companyNotification(otherCompanyId, {
      trigger: NOTIFICATION_TRIGGERS.MATCH_DECLINED_BY_PARTY,
      entityType: "match", entityId: input.matchId, subject: "A match was declined",
      body: "A match against your capacity or requirement was declined. Maintain can review another proposal.",
      actionPath: `/app/matches/${input.matchId}`,
    }),
    () => notify({
      trigger: NOTIFICATION_TRIGGERS.MATCH_DECLINED_BY_PARTY, to: MAINTAIN_INBOX,
      entityType: "match", entityId: input.matchId, subject: `Match declined by the ${input.by}`,
      body: "The match was declined and its holds were released. Review the requirement for a new proposal.",
      actionPath: "/admin/matching",
    }),
  ]);
  return { ok: true, message: "Declined. The match's holds have been released." };
}

export async function supplierDeclineMatch(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireActiveCompany();
  const parsed = declineSchema.safeParse({
    match_id: formData.get("match_id"), expected_status: formData.get("expected_status"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return decline({ matchId: parsed.data.match_id, expectedStatus: parsed.data.expected_status,
    by: "supplier", companyId, actorId: user.id, adminEntered: false, reason: parsed.data.reason });
}

export async function buyerDeclineMatch(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireActiveCompany();
  const parsed = declineSchema.safeParse({
    match_id: formData.get("match_id"), expected_status: formData.get("expected_status"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return decline({ matchId: parsed.data.match_id, expectedStatus: parsed.data.expected_status,
    by: "buyer", companyId, actorId: user.id, adminEntered: false, reason: parsed.data.reason });
}

export async function recordPartyDecline(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = declineSchema.extend({ by: z.enum(["supplier", "buyer"]), evidence_note: evidenceNote }).safeParse({
    match_id: formData.get("match_id"), expected_status: formData.get("expected_status"),
    reason: formData.get("reason") ?? "", by: formData.get("by"), evidence_note: formData.get("evidence_note"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return decline({ matchId: parsed.data.match_id, expectedStatus: parsed.data.expected_status,
    by: parsed.data.by, companyId: null, actorId: user.id, adminEntered: true,
    evidence: parsed.data.evidence_note, reason: parsed.data.reason });
}

const buyerSchema = z.object({
  match_id: z.string().uuid(),
  presented_quantity: z.coerce.number().int().positive(),
  presented_nomination_version: version,
});
const buyerResult = matchResult.extend({
  accepted: z.boolean(),
  engagement_id: z.string().uuid().optional(),
  declined: z.boolean().optional(),
  remaining_count: z.number().int().nonnegative().optional(),
  competing_matches: z.array(matchResult).optional(),
});

async function acceptAsBuyer(input: {
  matchId: string; quantity: number; version: number; companyId: string | null;
  actorId: string; adminEntered: boolean; evidence?: string;
}): Promise<FormResult> {
  const { data, error } = await runTransaction(() => createAdminClient().rpc("accept_match_as_buyer", {
    p_match_id: input.matchId, p_expected_status: "Awaiting Buyer",
    p_presented_quantity: input.quantity, p_presented_nomination_version: input.version,
    p_buyer_company_id: input.companyId, p_actor_user_id: input.actorId,
    p_admin_entered: input.adminEntered, p_evidence_note: input.evidence ?? null,
    p_effective_date: brisbaneToday(),
  }));
  const result = buyerResult.safeParse(data);
  if (error || !result.success) return transactionFailure(error);
  const row = result.data;
  refreshMatches(input.matchId);
  if (!row.accepted) {
    await deliverNonBlocking([() => notifyWorkerStatusKnockouts({
      knockedOutMatchIds: [row.match_id],
      declinedMatchIds: row.declined ? [row.match_id] : [],
      buyerDeclinedMatchIds: row.declined ? [row.match_id] : [],
      buyerRenotificationMatchIds: row.declined ? [] : [row.match_id],
    })]);
    return { ok: false, message: row.declined
      ? "The proposal fell below the minimum crew size and was declined. Maintain can re-propose."
      : "The available crew changed. Review the updated proposal before accepting." };
  }
  if (!row.engagement_id) return transactionFailure(null);
  revalidatePath("/app/engagements");
  revalidatePath("/admin/engagements");
  const competing = row.competing_matches ?? [];
  await deliverNonBlocking([
    () => notify({
      trigger: NOTIFICATION_TRIGGERS.COMMERCIAL_TRIGGER_REQUIRED, to: MAINTAIN_INBOX,
      entityType: "engagement", entityId: row.engagement_id,
      subject: "Match accepted — commercial trigger required",
      body: "Both parties accepted the match. The engagement is Awaiting Commercial until payment pre-authorisation is recorded.",
      actionPath: "/admin/engagements",
    }),
    () => notifyWorkerStatusKnockouts({
      knockedOutMatchIds: competing.map((match) => match.match_id),
      declinedMatchIds: competing.filter((match) => match.status_after === "Declined").map((match) => match.match_id),
      buyerDeclinedMatchIds: competing.filter((match) => match.status_before === "Awaiting Buyer" && match.status_after === "Declined").map((match) => match.match_id),
      buyerRenotificationMatchIds: competing.filter((match) => match.status_after === "Awaiting Buyer").map((match) => match.match_id),
    }),
  ]);
  return { ok: true, message: "Accepted. The engagement is recorded and awaits the commercial step before confirmation." };
}

export async function buyerAcceptMatch(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireActiveCompany();
  const parsed = buyerSchema.safeParse({
    match_id: formData.get("match_id"), presented_quantity: formData.get("presented_quantity"),
    presented_nomination_version: formData.get("presented_nomination_version"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return acceptAsBuyer({ matchId: parsed.data.match_id, quantity: parsed.data.presented_quantity,
    version: parsed.data.presented_nomination_version, companyId, actorId: user.id, adminEntered: false });
}

export async function recordBuyerAcceptance(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = buyerSchema.extend({ evidence_note: evidenceNote }).safeParse({
    match_id: formData.get("match_id"), presented_quantity: formData.get("presented_quantity"),
    presented_nomination_version: formData.get("presented_nomination_version"),
    evidence_note: formData.get("evidence_note"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return acceptAsBuyer({ matchId: parsed.data.match_id, quantity: parsed.data.presented_quantity,
    version: parsed.data.presented_nomination_version, companyId: null, actorId: user.id,
    adminEntered: true, evidence: parsed.data.evidence_note });
}

export async function withdrawMatch(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = declineSchema.safeParse({
    match_id: formData.get("match_id"), expected_status: formData.get("expected_status"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { data, error } = await runTransaction(() => createAdminClient().rpc("withdraw_match_atomic", {
    p_match_id: parsed.data.match_id, p_expected_status: parsed.data.expected_status,
    p_actor_user_id: user.id, p_reason: parsed.data.reason || null,
  }));
  const result = matchResult.safeParse(data);
  if (error || !result.success) return transactionFailure(error);
  refreshMatches(parsed.data.match_id);
  await deliverNonBlocking([result.data.supplier_company_id, result.data.buyer_company_id].map((companyId) => () =>
    companyNotification(companyId, {
      trigger: NOTIFICATION_TRIGGERS.MATCH_WITHDRAWN, entityType: "match", entityId: parsed.data.match_id,
      subject: "Maintain withdrew a match",
      body: "Maintain withdrew a match you were part of. Any holds it placed on dates are released.",
      actionPath: "/app/matches",
    }),
  ));
  return { ok: true, message: "Match withdrawn. All nomination holds are released." };
}

export async function knockOutNomination(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = z.object({
    match_id: z.string().uuid(), worker_id: z.string().uuid(), expected_status: openStatus,
    expected_nomination_version: version, reason: z.string().trim().min(3).max(1000),
  }).safeParse({
    match_id: formData.get("match_id"), worker_id: formData.get("worker_id"),
    expected_status: formData.get("expected_status"), expected_nomination_version: formData.get("expected_nomination_version"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { data, error } = await runTransaction(() => createAdminClient().rpc("knock_out_match_nomination_atomic", {
    p_match_id: parsed.data.match_id, p_worker_id: parsed.data.worker_id,
    p_reason: parsed.data.reason, p_actor_user_id: user.id, p_actor_is_system: false,
    p_expected_status: parsed.data.expected_status,
    p_expected_nomination_version: parsed.data.expected_nomination_version,
  }));
  if (error) return transactionFailure(error);
  if (z.object({ changed: z.literal(false) }).safeParse(data).success) return { ok: false, message: "The nomination is already released. Refresh the proposal." };
  const result = matchResult.safeParse(data);
  if (!result.success) return transactionFailure(null);
  const row = result.data;
  refreshMatches(parsed.data.match_id);
  await deliverNonBlocking([() => notifyWorkerStatusKnockouts({
    knockedOutMatchIds: [row.match_id],
    declinedMatchIds: row.status_after === "Declined" ? [row.match_id] : [],
    buyerDeclinedMatchIds: row.status_before === "Awaiting Buyer" && row.status_after === "Declined" ? [row.match_id] : [],
    buyerRenotificationMatchIds: row.status_after === "Awaiting Buyer" ? [row.match_id] : [],
  })]);
  return { ok: true, message: row.status_after === "Declined"
    ? "Nomination knocked out. The match fell below the minimum crew size and was declined."
    : "Nomination knocked out. The updated crew is available for review." };
}

export async function addQualificationOverride(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = z.object({ match_id: z.string().uuid(), expected_status: openStatus, evidence_note: evidenceNote }).safeParse({
    match_id: formData.get("match_id"), expected_status: formData.get("expected_status"), evidence_note: formData.get("evidence_note"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { data, error } = await runTransaction(() => createAdminClient().rpc("record_match_qualification_override", {
    p_match_id: parsed.data.match_id, p_expected_status: parsed.data.expected_status,
    p_actor_user_id: user.id, p_evidence_note: parsed.data.evidence_note,
  }));
  if (error || !matchResult.safeParse(data).success) return transactionFailure(error);
  refreshMatches(parsed.data.match_id);
  return { ok: true, message: "Override recorded. Eligible crew with an in-window ticket expiry can now be nominated." };
}

/* ------------------------------------------------------------------ admin reads -- */

export type AdminDemandLineRow = {
  id: string;
  requestName: string;
  buyerCompanyName: string;
  tradeName: string;
  proficiencyName: string;
  regionName: string;
  quantity: number;
  filled: number;
  pending: number;
  remaining: number;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
  status: string;
};

/** 11.1 — the workspace opens on the lines that can still take a proposal. */
export async function openDemandLines(): Promise<AdminDemandLineRow[]> {
  await requireMaintainAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("demand_line")
    .select(
      `id, quantity, start_date, end_date, hours_per_week, status,
       company:company_id (legal_name, trading_name),
       trade:trade_role_id (name),
       proficiency:proficiency_id (name),
       request:request_id (name, region:work_region_id (name))`,
    )
    .in("status", ["Open", "Partially Filled"])
    .gte("end_date", brisbaneToday())
    .order("start_date", { ascending: true });

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => {
      const counts = await demandLineCounts(row.id as string);
      const pick = (v: unknown): Record<string, unknown> | null => joinedRow(v);
      const company = pick(row.company);
      const request = pick(row.request);
      return {
        id: row.id as string,
        requestName: (request?.name as string) ?? "Requirement",
        buyerCompanyName:
          (company?.trading_name as string) || (company?.legal_name as string) || "—",
        tradeName: (pick(row.trade)?.name as string) ?? "—",
        proficiencyName: (pick(row.proficiency)?.name as string) ?? "—",
        regionName:
          (pick(request?.region)?.name as string) ?? "—",
        quantity: Number(row.quantity),
        filled: counts.filled,
        pending: counts.pending,
        remaining: Math.max(0, Number(row.quantity) - counts.filled - counts.pending),
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        hoursPerWeek: Number(row.hours_per_week),
        status: row.status as string,
      };
    }),
  );
}

export type AdminMatchRow = {
  id: string;
  status: MatchStatus;
  nominationVersion: number;
  supplierCompanyName: string;
  buyerCompanyName: string;
  requestedQuantity: number;
  nominatedCount: number;
  engagementStart: string;
  engagementEnd: string;
  supplierRateCents: number;
  buyerRateCents: number;
  adminEntered: boolean;
  nominations: { workerId: string; name: string; knockedOut: boolean }[];
};

/** 14.2 — the admin's view of every match on one demand line. */
export async function matchesForDemandLine(demandLineId: string): Promise<AdminMatchRow[]> {
  await requireMaintainAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("match")
    .select(
      `id, status, requested_quantity, engagement_start, engagement_end,
       supplier_rate_cents, buyer_rate_cents, admin_entered, nomination_version,
       supplier:supplier_company_id (legal_name, trading_name),
       buyer:buyer_company_id (legal_name, trading_name)`,
    )
    .eq("demand_line_id", demandLineId)
    .order("proposed_at", { ascending: false });

  const pick = (v: unknown): Record<string, unknown> | null => joinedRow(v);

  return Promise.all(
    (data ?? []).map(async (row) => {
      const { data: nominations } = await admin
        .from("match_worker")
        .select("worker_id, knocked_out, worker:worker_id (first_name, last_name)")
        .eq("match_id", row.id as string);
      const supplier = pick(row.supplier);
      const buyer = pick(row.buyer);
      const list = (nominations ?? []).map((n) => {
        const worker = pick(n.worker);
        return {
          workerId: n.worker_id as string,
          name: `${(worker?.first_name as string) ?? ""} ${(worker?.last_name as string) ?? ""}`.trim(),
          knockedOut: Boolean(n.knocked_out),
        };
      });
      return {
        id: row.id as string,
        status: row.status as MatchStatus,
        nominationVersion: Number(row.nomination_version),
        supplierCompanyName:
          (supplier?.trading_name as string) || (supplier?.legal_name as string) || "—",
        buyerCompanyName: (buyer?.trading_name as string) || (buyer?.legal_name as string) || "—",
        requestedQuantity: Number(row.requested_quantity),
        nominatedCount: list.filter((n) => !n.knockedOut).length,
        engagementStart: row.engagement_start as string,
        engagementEnd: row.engagement_end as string,
        supplierRateCents: Number(row.supplier_rate_cents),
        buyerRateCents: Number(row.buyer_rate_cents),
        adminEntered: Boolean(row.admin_entered),
        nominations: list,
      };
    }),
  );
}

/** 16.1 — the crew a Maintain admin may relay a nomination from, for one match. */
export async function nominableCrew(
  matchId: string,
): Promise<{ id: string; name: string; nominated: boolean }[]> {
  await requireMaintainAdmin();
  const admin = createAdminClient();
  const match = await loadMatchRow(matchId);
  if (!match) return [];

  const [{ data: members }, { data: nominations }] = await Promise.all([
    admin
      .from("capacity_line_worker")
      .select("worker_id, worker:worker_id (first_name, last_name)")
      .eq("capacity_line_id", match.capacity_line_id),
    admin.from("match_worker").select("worker_id").eq("match_id", matchId).eq("knocked_out", false),
  ]);

  const nominated = new Set((nominations ?? []).map((n) => n.worker_id as string));
  return (members ?? []).map((m) => {
    const worker = Array.isArray(m.worker) ? m.worker[0] : m.worker;
    return {
      id: m.worker_id as string,
      name: `${(worker?.first_name as string) ?? ""} ${(worker?.last_name as string) ?? ""}`.trim(),
      nominated: nominated.has(m.worker_id as string),
    };
  });
}
