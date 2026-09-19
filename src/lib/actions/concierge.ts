"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormResult } from "@/lib/actions";
import type { WorkerFormResult } from "@/lib/actions/worker";
import { requireMaintainAdmin } from "@/lib/auth";
import { getBookingRules } from "@/lib/config";
import { dateRangeProblem, inclusiveDays, overlaps } from "@/lib/domain/availability";
import { expectedHours, hoursPerWeekFromTotal } from "@/lib/domain/money";
import { NOTIFICATION_TRIGGERS, notify } from "@/lib/notify";
import { indicativeRange, supplierBand } from "@/lib/rates";
import { createAdminClient } from "@/lib/supabase/admin";

// CONCIERGE — spec 16.1. Availability and paperwork arrive by phone and email, not
// typed in by a logged-in supplying/hiring business (0.3 explicitly allows a company
// that has never logged in). A Maintain admin transcribes what was said; guardrail 2
// holds here exactly as it does in match.ts — the admin RELAYS the company's
// instructions, it never substitutes its own judgement for a nomination or a rate.
// Every write below is flagged admin_entered, carries the same mandatory evidence
// note as the match-decision concierge path (match.ts:44-47), and is audited with the
// acting admin (18.2).
//
// This file re-implements the validation of capacity.ts / demand.ts / worker.ts
// rather than importing it: those modules run on the caller's RLS-scoped client and
// derive "this company" from the session, neither of which applies to a service-role
// write on behalf of an arbitrary target company (17.3). The rules themselves — 9.2,
// 9.4, 9.7, 10.3, 5.6, 6.2, 6.3 — are unchanged; only the client and the company id
// source differ, so restructuring the company-facing files would buy nothing.

type AdminClient = ReturnType<typeof createAdminClient>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 16.1 — every recorded concierge entry carries a mandatory evidence note (who was
 * spoken to, and when). Mandatory in the schema, not the markup, so a hand-rolled
 * POST cannot omit it — mirrors match.ts:44-47.
 */
const evidenceNote = z
  .string()
  .trim()
  .min(10, "Record who you spoke to and when — this note is the evidence for the decision.");

function readPayload(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function maintainInbox(): string {
  const base = process.env.APP_BASE_URL ?? "https://maintainworkforce.com.au";
  let host = "maintainworkforce.com.au";
  try {
    host = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    /* keep the fallback */
  }
  return process.env.MAINTAIN_NOTIFICATION_EMAIL ?? `notifications@${host}`;
}

async function loadCompanyStatus(admin: AdminClient, companyId: string): Promise<string | null> {
  const { data } = await admin.from("company").select("status").eq("id", companyId).maybeSingle();
  return (data?.status as string | undefined) ?? null;
}

/* ================================================================== 9 capacity ==== */

const capacityLineSchema = z.object({
  tradeRoleId: z.string().min(1),
  proficiencyId: z.string().min(1),
  availableFrom: z.string().regex(ISO_DATE, "Give a start date."),
  availableUntil: z.string().regex(ISO_DATE, "Give an end date."),
  availableDays: z.string().trim().max(120).optional(),
  hoursPerWeek: z.number().positive("Hours per week must be more than zero.").max(168),
  locationRegionId: z.string().min(1),
  travelRegionIds: z.array(z.string().min(1)).default([]),
  supplierRateCents: z.number().int().positive("Confirm a rate."),
  workerIds: z.array(z.string().min(1)).min(1, "Name the crew on this line."),
});
const conciergeCapacitySchema = z.object({ lines: z.array(capacityLineSchema).min(1) });
type CapacityLineInput = z.infer<typeof capacityLineSchema>;

const LIVE_LINE_STATUSES = ["Open", "Partially Committed", "Fully Committed"];

type CrewRow = {
  id: string;
  first_name: string;
  last_name: string;
  primary_trade_id: string;
  primary_proficiency_id: string;
};
type Claim = { workerId: string; from: string; until: string };

function crewName(worker: CrewRow): string {
  return `${worker.first_name} ${worker.last_name}`;
}

/** 9.2 / 9.4, the same rules capacity.ts's lineProblem enforces for the company path. */
function capacityLineProblem(
  line: Pick<
    CapacityLineInput,
    "tradeRoleId" | "proficiencyId" | "availableFrom" | "availableUntil" | "workerIds"
  >,
  crew: Map<string, CrewRow>,
  claimed: Claim[],
): string | null {
  if (line.availableUntil < line.availableFrom) return "The window ends before it starts.";

  for (const workerId of line.workerIds) {
    const worker = crew.get(workerId);
    if (!worker) return "One of the selected crew is not on this company's roster.";

    if (
      worker.primary_trade_id !== line.tradeRoleId ||
      worker.primary_proficiency_id !== line.proficiencyId
    ) {
      return `${crewName(worker)} is classified under a different trade or proficiency — put them on their own line.`;
    }

    const clash = claimed.some(
      (claim) =>
        claim.workerId === workerId &&
        overlaps(
          { start: claim.from, end: claim.until },
          { start: line.availableFrom, end: line.availableUntil },
        ),
    );
    if (clash) {
      return `${crewName(worker)} is already on an open capacity line covering those dates.`;
    }
  }
  return null;
}

/**
 * The service-role client bypasses RLS, so the roster check the company path gets
 * for free from `worker_write` is done by hand here: only a worker with an OPEN
 * employment row (6.4) at the target company is eligible.
 */
async function loadCrewForCompany(
  admin: AdminClient,
  companyId: string,
  workerIds: string[],
): Promise<Map<string, CrewRow>> {
  if (workerIds.length === 0) return new Map();

  const { data } = await admin
    .from("worker_employment")
    .select(
      "worker_id, worker:worker_id (id, first_name, last_name, primary_trade_id, primary_proficiency_id)",
    )
    .eq("company_id", companyId)
    .is("end_date", null)
    .in("worker_id", workerIds);

  const rows = (data ?? []) as unknown as { worker_id: string; worker: CrewRow | null }[];
  return new Map(rows.filter((row) => row.worker).map((row) => [row.worker_id, row.worker as CrewRow]));
}

async function loadOpenCapacityClaims(admin: AdminClient, companyId: string): Promise<Claim[]> {
  const { data } = await admin
    .from("capacity_line")
    .select("id, available_from, available_until, capacity_line_worker(worker_id)")
    .eq("company_id", companyId)
    .in("status", LIVE_LINE_STATUSES);

  const rows = (data ?? []) as {
    id: string;
    available_from: string;
    available_until: string;
    capacity_line_worker: { worker_id: string }[] | null;
  }[];

  return rows.flatMap((row) =>
    (row.capacity_line_worker ?? []).map((link) => ({
      workerId: link.worker_id,
      from: row.available_from,
      until: row.available_until,
    })),
  );
}

async function flagMissingCapacityBands(
  lines: { tradeRoleId: string; proficiencyId: string; locationRegionId: string }[],
  companyId: string,
  entityId: string,
): Promise<void> {
  const bands = await Promise.all(
    lines.map((line) => supplierBand(line.tradeRoleId, line.proficiencyId, line.locationRegionId)),
  );
  const missing = bands.filter((band) => band === null).length;
  if (missing === 0) return;

  await notify({
    trigger: NOTIFICATION_TRIGGERS.NO_RATE_BAND,
    to: maintainInbox(),
    companyId,
    entityType: "capacity_listing",
    entityId,
    subject: "No recommended band on a capacity line",
    body: `${missing} capacity line(s) carry no applicable rate band. The rate was entered concierge-style; publish a band for that trade, proficiency and region.`,
    actionPath: "/admin/rates",
  });
}

/**
 * 16.1 / 9.1–9.4 — concierge equivalent of capacity.ts's createCapacityListing. The
 * admin transcribes the supplying business's phoned-in lines onto a target company;
 * the rate is that company's own figure, relayed, never decided by Maintain (9.7).
 */
export async function conciergeCreateCapacityListing(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const admin = createAdminClient();

  const companyId = String(formData.get("company_id") ?? "");
  const evidence = evidenceNote.safeParse(formData.get("evidence_note"));
  const parsed = conciergeCapacitySchema.safeParse(readPayload(formData.get("payload")));

  if (!companyId) return { ok: false, message: "Choose a company first." };
  if (!evidence.success) {
    return {
      ok: false,
      errors: { evidence_note: evidence.error.issues[0].message },
      message: "Record the evidence before saving.",
    };
  }
  if (!parsed.success) {
    return { ok: false, message: "Some lines are incomplete. Check the fields marked below." };
  }
  const lines = parsed.data.lines;

  // 3.2 / Edge cases — "concierge entry by Maintain is still possible for Active
  // companies only." A Pending or Suspended company cannot list capacity even when
  // Maintain is doing the typing.
  const status = await loadCompanyStatus(admin, companyId);
  if (!status) return { ok: false, message: "That company no longer exists." };
  if (status !== "Active") {
    return { ok: false, message: "Concierge capacity entry is only available for Active companies." };
  }

  const crew = await loadCrewForCompany(
    admin,
    companyId,
    [...new Set(lines.flatMap((line) => line.workerIds))],
  );
  const claimed = await loadOpenCapacityClaims(admin, companyId);

  const errors: Record<string, string> = {};
  lines.forEach((line, index) => {
    const problem = capacityLineProblem(line, crew, claimed);
    if (problem) {
      errors[`line-${index}`] = problem;
      return;
    }
    for (const workerId of line.workerIds) {
      claimed.push({ workerId, from: line.availableFrom, until: line.availableUntil });
    }
  });
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, message: "This listing was not saved." };
  }

  const { data: listingId, error } = await admin.rpc(
    "create_capacity_listing_transactional",
    {
      p_company_id: companyId,
      p_actor_user_id: user.id,
      p_admin_entered: true,
      p_evidence_note: evidence.data,
      p_payload: {
        lines: lines.map((line) => ({
          trade_role_id: line.tradeRoleId,
          proficiency_id: line.proficiencyId,
          available_from: line.availableFrom,
          available_until: line.availableUntil,
          available_days: line.availableDays || null,
          hours_per_week: line.hoursPerWeek,
          location_region_id: line.locationRegionId,
          supplier_rate_cents: line.supplierRateCents,
          worker_ids: line.workerIds,
          travel_region_ids: line.travelRegionIds,
        })),
      },
    },
  );

  if (error || !listingId) {
    return { ok: false, message: "The listing could not be saved. Try again." };
  }

  await flagMissingCapacityBands(lines, companyId, listingId as string);

  // NEW_CAPACITY (15.2) tells Maintain a company listed capacity — pointless here
  // since the Maintain admin submitting this form already knows; skipped, unlike the
  // company-facing path in capacity.ts.

  revalidatePath(`/admin/companies/${companyId}/concierge`);
  redirect(`/admin/companies/${companyId}/concierge?saved=capacity`);
}

/* ==================================================================== 10 demand ==== */

const demandLineSchema = z.object({
  tradeRoleId: z.string().min(1),
  proficiencyId: z.string().min(1),
  quantity: z.number().int().positive("Say how many people the line needs."),
  startDate: z.string().regex(ISO_DATE, "Give a start date."),
  endDate: z.string().regex(ISO_DATE, "Give an end date."),
  hoursMode: z.enum(["week", "total"]),
  hours: z.number().positive("Give the hours."),
  skillIds: z.array(z.string().min(1)).default([]),
  qualificationIds: z.array(z.string().min(1)).default([]),
  notes: z.string().trim().max(2000).optional(),
});
const conciergeDemandSchema = z.object({
  name: z.string().trim().min(2, "Name the project."),
  industryId: z.string().min(1).optional(),
  workRegionId: z.string().min(1),
  description: z.string().trim().max(2000).optional(),
  lines: z.array(demandLineSchema).min(1),
});
type DemandLineInput = z.infer<typeof demandLineSchema>;

/** 10.1 — canonical hours/week, derived when the line was phoned in as a total. */
function canonicalHoursPerWeek(input: {
  hoursMode: "week" | "total";
  hours: number;
  startDate: string;
  endDate: string;
}): number {
  if (input.hoursMode === "week") return input.hours;
  const days = inclusiveDays({ start: input.startDate, end: input.endDate });
  return hoursPerWeekFromTotal(input.hours, days);
}

/** 10.2 / 5.6 — booking minimums, the same rule demand.ts's lineProblem enforces. */
function demandLineProblem(
  line: { quantity: number; startDate: string; endDate: string; hoursPerWeek: number },
  rules: { minimumHoursPerLine: number; minimumCrewSize: number },
): string | null {
  if (line.endDate < line.startDate) return "The window ends before it starts.";

  if (line.quantity < rules.minimumCrewSize) {
    return `The minimum crew size is ${rules.minimumCrewSize}.`;
  }

  const hours = expectedHours(line.hoursPerWeek, inclusiveDays({ start: line.startDate, end: line.endDate }));
  if (hours < rules.minimumHoursPerLine) {
    return `A booking is at least ${rules.minimumHoursPerLine} hours; this line comes to ${hours}.`;
  }
  return null;
}

/** 4.2 — a (trade, proficiency) pair is only a line if the catalogue allows it. */
async function supportedProficiencies(
  admin: AdminClient,
  tradeRoleIds: string[],
): Promise<Set<string>> {
  const { data } = await admin
    .from("trade_role_proficiency")
    .select("trade_role_id, proficiency_id")
    .in("trade_role_id", tradeRoleIds);

  return new Set(
    ((data ?? []) as { trade_role_id: string; proficiency_id: string }[]).map(
      (row) => `${row.trade_role_id}:${row.proficiency_id}`,
    ),
  );
}

async function flagMissingDemandBands(
  lines: { tradeRoleId: string; proficiencyId: string }[],
  workRegionId: string,
  companyId: string,
  entityId: string,
): Promise<void> {
  const ranges = await Promise.all(
    lines.map((line) => indicativeRange(line.tradeRoleId, line.proficiencyId, workRegionId)),
  );
  const missing = ranges.filter((range) => range === null).length;
  if (missing === 0) return;

  await notify({
    trigger: NOTIFICATION_TRIGGERS.NO_RATE_BAND,
    to: maintainInbox(),
    companyId,
    entityType: "demand_request",
    entityId,
    subject: "No recommended band on a requirement",
    body: `${missing} demand line(s) carry no applicable rate band, so no indicative range was shown. Publish a band for that trade, proficiency and region.`,
    actionPath: "/admin/rates",
  });
}

/**
 * 16.1 / 10.1–10.3 — concierge equivalent of demand.ts's createDemandRequest, for a
 * hiring business whose requirement arrived by phone or email.
 */
export async function conciergeCreateDemandRequest(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const admin = createAdminClient();

  const companyId = String(formData.get("company_id") ?? "");
  const evidence = evidenceNote.safeParse(formData.get("evidence_note"));
  const parsed = conciergeDemandSchema.safeParse(readPayload(formData.get("payload")));

  if (!companyId) return { ok: false, message: "Choose a company first." };
  if (!evidence.success) {
    return {
      ok: false,
      errors: { evidence_note: evidence.error.issues[0].message },
      message: "Record the evidence before saving.",
    };
  }
  if (!parsed.success) {
    return { ok: false, message: "Some lines are incomplete. Check the fields marked below." };
  }
  const request = parsed.data;

  // 3.2 / Edge cases — same Active-only gate as concierge capacity entry.
  const status = await loadCompanyStatus(admin, companyId);
  if (!status) return { ok: false, message: "That company no longer exists." };
  if (status !== "Active") {
    return { ok: false, message: "Concierge requirement entry is only available for Active companies." };
  }

  const rules = await getBookingRules();
  const supported = await supportedProficiencies(admin, request.lines.map((line) => line.tradeRoleId));

  const errors: Record<string, string> = {};
  const prepared: (DemandLineInput & { hoursPerWeek: number })[] = [];

  request.lines.forEach((line, index) => {
    if (!supported.has(`${line.tradeRoleId}:${line.proficiencyId}`)) {
      errors[`line-${index}`] = "That trade does not carry that proficiency level.";
      return;
    }
    const windowProblem = dateRangeProblem({ start: line.startDate, end: line.endDate });
    if (windowProblem) {
      errors[`line-${index}`] = windowProblem;
      return;
    }
    const hoursPerWeek = canonicalHoursPerWeek(line);
    const problem = demandLineProblem({ ...line, hoursPerWeek }, rules);
    if (problem) {
      errors[`line-${index}`] = problem;
      return;
    }
    prepared.push({ ...line, hoursPerWeek });
  });

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, message: "This requirement was not saved." };
  }

  const { data: requestId, error } = await admin.rpc(
    "create_demand_request_transactional",
    {
      p_company_id: companyId,
      p_actor_user_id: user.id,
      p_admin_entered: true,
      p_evidence_note: evidence.data,
      p_payload: {
        name: request.name,
        industry_id: request.industryId ?? null,
        work_region_id: request.workRegionId,
        description: request.description || null,
        lines: prepared.map((line) => ({
          trade_role_id: line.tradeRoleId,
          proficiency_id: line.proficiencyId,
          quantity: line.quantity,
          start_date: line.startDate,
          end_date: line.endDate,
          hours_per_week: line.hoursPerWeek,
          skill_ids: line.skillIds,
          qualification_ids: line.qualificationIds,
          notes: line.notes || null,
        })),
      },
    },
  );

  if (error || !requestId) {
    return { ok: false, message: "The requirement could not be saved. Try again." };
  }

  await flagMissingDemandBands(prepared, request.workRegionId, companyId, requestId as string);

  // NEW_DEMAND (15.2) tells Maintain a company posted a requirement — pointless here
  // for the same reason NEW_CAPACITY is skipped above; skipped, unlike demand.ts.

  revalidatePath(`/admin/companies/${companyId}/concierge`);
  redirect(`/admin/companies/${companyId}/concierge?saved=demand`);
}

/* ===================================================================== 6 worker ==== */

function normaliseMobile(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

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

const conciergeWorkerSchema = z.object({
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
  start_date: z.string().regex(ISO_DATE, "Give the date this worker joined."),
  // 6.3 / 16.1 — the admin is confirming the company told the worker and obtained
  // consent by phone or email, standing in for the checkbox the company would tick
  // itself; it is still validated with the rest of the record, not assumed.
  consent: z.literal(
    "on",
    "Confirm the company has told this worker and it consents to being listed.",
  ),
});

/**
 * 6.2 — one wording for every collision, whichever field matched, identical to
 * worker.ts's own. It names no field and no employer.
 */
function collisionResult(values: Record<string, string>): WorkerFormResult {
  return {
    ok: false,
    collision: true,
    values,
    message:
      "These details match an existing worker record. If this worker is joining that company, the module 8 transfer flow is the way in — tell the company to request it from the existing record's employer.",
  };
}

/**
 * 16.1 / 6.1–6.4 — concierge equivalent of worker.ts's createWorker, for crew a
 * company phoned or emailed through before it ever logs in (0.3).
 */
export async function conciergeCreateWorker(
  _previous: WorkerFormResult | null,
  formData: FormData,
): Promise<WorkerFormResult> {
  const user = await requireMaintainAdmin();
  const admin = createAdminClient();

  const companyId = String(formData.get("company_id") ?? "");
  const evidence = evidenceNote.safeParse(formData.get("evidence_note"));

  const values: Record<string, string> = {};
  for (const key of WORKER_KEYS) values[key] = String(formData.get(key) ?? "");
  const skillIds = formData.getAll("skills").map(String).filter(Boolean);
  const travelRegionIds = formData.getAll("travel_regions").map(String).filter(Boolean);
  values.skills = skillIds.join(",");
  values.travel_regions = travelRegionIds.join(",");
  values.evidence_note = String(formData.get("evidence_note") ?? "");
  // 6.3 — echoed with the rest of the form; a save failure must not quietly drop the
  // attestation the admin just recorded on the company's behalf.
  values.consent = String(formData.get("consent") ?? "");

  if (!companyId) return { ok: false, values, message: "Choose a company first." };
  if (!evidence.success) {
    return { ok: false, values, errors: { evidence_note: evidence.error.issues[0].message } };
  }

  const parsed = conciergeWorkerSchema.safeParse({
    ...values,
    consent: formData.get("consent") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error), values };
  }
  const input = parsed.data;

  // Pending and Active mirror the company-facing writable gate. Suspended and Closed
  // companies are read-only even when Maintain is transcribing the intake.
  const status = await loadCompanyStatus(admin, companyId);
  if (!status) return { ok: false, values, message: "That company no longer exists." };
  if (status !== "Pending" && status !== "Active") {
    return { ok: false, values, message: "This company is read-only; concierge entry is not available." };
  }

  const email = normaliseEmail(input.email);
  const mobile = normaliseMobile(input.mobile);

  // 4.2 — classification must be a pair the catalogue actually offers.
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

  // 6.2 — email AND mobile are each unique platform-wide; a match on either blocks
  // creation and reveals existence only.
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
    p_admin_entered: true,
    p_evidence_note: evidence.data,
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
    if (error?.code === "23505") return collisionResult(values);
    return { ok: false, values, message: "That worker could not be saved. Try again." };
  }

  revalidatePath(`/admin/companies/${companyId}/concierge`);
  redirect(`/admin/companies/${companyId}/concierge?saved=worker`);
}
