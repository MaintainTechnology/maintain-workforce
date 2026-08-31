"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormResult } from "@/lib/actions";
import { requireActiveCompany } from "@/lib/auth";
import { getBookingRules } from "@/lib/config";
import { COMMITTING_STATUSES, dateRangeProblem, inclusiveDays } from "@/lib/domain/availability";
import { expectedHours, hoursPerWeekFromTotal } from "@/lib/domain/money";
import { NOTIFICATION_TRIGGERS, notify } from "@/lib/notify";
import { indicativeRange } from "@/lib/rates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// BUY CAPACITY — spec module 10, with the booking minimums of 5.6 and the indicative
// rate rules of 5.5. Nothing in this file ever returns a raw rate band to the hiring
// business: the range is computed in @/lib/rates and arrives already marked up (17.1).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const lineSchema = z.object({
  tradeRoleId: z.string().min(1),
  proficiencyId: z.string().min(1),
  quantity: z.number().int().positive("Say how many people the line needs."),
  startDate: z.string().regex(ISO_DATE, "Give a start date."),
  endDate: z.string().regex(ISO_DATE, "Give an end date."),
  // 10.1 — hours per week is canonical. A buyer who thinks in total hours enters the
  // total and the canonical figure is derived from it, never stored alongside it.
  hoursMode: z.enum(["week", "total"]),
  hours: z.number().positive("Give the hours."),
  skillIds: z.array(z.string().min(1)).default([]),
  qualificationIds: z.array(z.string().min(1)).default([]),
  notes: z.string().trim().max(2000).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(2, "Name the project."),
  industryId: z.string().min(1).optional(),
  workRegionId: z.string().min(1),
  description: z.string().trim().max(2000).optional(),
  lines: z.array(lineSchema).min(1),
});

const updateSchema = z.object({
  lineId: z.string().min(1),
  quantity: z.number().int().positive(),
  startDate: z.string().regex(ISO_DATE),
  endDate: z.string().regex(ISO_DATE),
  hoursMode: z.enum(["week", "total"]),
  hours: z.number().positive(),
  skillIds: z.array(z.string().min(1)).default([]),
  qualificationIds: z.array(z.string().min(1)).default([]),
  notes: z.string().trim().max(2000).optional(),
});

type LineInput = z.infer<typeof lineSchema>;

/** 12.1 — an "open match" is one in {Awaiting Supplier, Awaiting Buyer}, everywhere. */
const OPEN_MATCH_STATUSES = ["Awaiting Supplier", "Awaiting Buyer"];

type Supabase = Awaited<ReturnType<typeof createClient>>;

function readPayload(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
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

/** 10.1 — the canonical hours/week, derived when the buyer entered a total instead. */
function canonicalHoursPerWeek(input: {
  hoursMode: "week" | "total";
  hours: number;
  startDate: string;
  endDate: string;
}): number {
  if (input.hoursMode === "week") return input.hours;
  const days = inclusiveDays({ start: input.startDate, end: input.endDate });
  // hoursPerWeekFromTotal keeps the weeks divisor fractional and rounds up only the
  // resulting hours-per-week value (10.1, 20.3).
  return hoursPerWeekFromTotal(input.hours, days);
}

/**
 * 10.2 — lines validate against the booking minimums (5.6) and against
 * TradeRoleProficiency (4.2): a proficiency a trade does not support is not a line.
 */
function lineProblem(
  line: { quantity: number; startDate: string; endDate: string; hoursPerWeek: number },
  rules: { minimumHoursPerLine: number; minimumCrewSize: number },
): string | null {
  if (line.endDate < line.startDate) return "The window ends before it starts.";

  if (line.quantity < rules.minimumCrewSize) {
    return `The minimum crew size is ${rules.minimumCrewSize}.`;
  }

  // "Minimum hours per line" is read against the hours the line actually books, which
  // is the 20.3 expected-hours figure, not the weekly rate on its own.
  const hours = expectedHours(line.hoursPerWeek, inclusiveDays({ start: line.startDate, end: line.endDate }));
  if (hours < rules.minimumHoursPerLine) {
    return `A booking is at least ${rules.minimumHoursPerLine} hours; this line comes to ${hours}.`;
  }
  return null;
}

async function supportedProficiencies(
  supabase: Supabase,
  tradeRoleIds: string[],
): Promise<Set<string>> {
  const { data } = await supabase
    .from("trade_role_proficiency")
    .select("trade_role_id, proficiency_id")
    .in("trade_role_id", tradeRoleIds);

  return new Set(
    ((data ?? []) as { trade_role_id: string; proficiency_id: string }[]).map(
      (row) => `${row.trade_role_id}:${row.proficiency_id}`,
    ),
  );
}

/**
 * 10.3 — a demand line with an open match cannot be withdrawn and none of its matchable
 * fields edited until Maintain withdraws the match. The buyer's own projection hides
 * matches still Awaiting Supplier (12.4), so the existence check runs server-side.
 */
async function hasOpenMatch(lineId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("match")
    .select("id")
    .eq("demand_line_id", lineId)
    .in("status", OPEN_MATCH_STATUSES)
    .limit(1);

  return (data ?? []).length > 0;
}

/**
 * 10.3 — quantity_filled counts DISTINCT workers in a committing status (13.0) on the
 * line: a worker covering the line through sequential engagements occupies one slot.
 */
async function quantityFilled(lineId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("engagement_worker")
    .select("worker_id, engagement:engagement_id!inner(demand_line_id)")
    .in("status", [...COMMITTING_STATUSES])
    .eq("engagement.demand_line_id", lineId);

  return new Set(((data ?? []) as { worker_id: string }[]).map((row) => row.worker_id)).size;
}

/**
 * 20.4 — a demand line whose trade, proficiency and region have no band shows no
 * indicative range and is flagged to Maintain. A rate is never invented.
 */
async function flagMissingBands(
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

export async function createDemandRequest(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  // 1.3 / 3.2 — only an Active company can post requirements.
  const { user, companyId } = await requireActiveCompany();
  const supabase = await createClient();

  const parsed = createSchema.safeParse(readPayload(formData.get("payload")));
  if (!parsed.success) {
    return { ok: false, message: "Some lines are incomplete. Check the fields marked below." };
  }
  const request = parsed.data;

  const rules = await getBookingRules();
  const supported = await supportedProficiencies(
    supabase,
    request.lines.map((line) => line.tradeRoleId),
  );

  const errors: Record<string, string> = {};
  const prepared: (LineInput & { hoursPerWeek: number })[] = [];

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
    const problem = lineProblem({ ...line, hoursPerWeek }, rules);
    if (problem) {
      errors[`line-${index}`] = problem;
      return;
    }
    prepared.push({ ...line, hoursPerWeek });
  });

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, message: "This requirement was not saved." };
  }

  const { data: requestId, error } = await createAdminClient().rpc(
    "create_demand_request_transactional",
    {
      p_company_id: companyId,
      p_actor_user_id: user.id,
      p_admin_entered: false,
      p_evidence_note: null,
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

  await flagMissingBands(prepared, request.workRegionId, companyId, requestId as string);

  await notify({
    trigger: NOTIFICATION_TRIGGERS.NEW_DEMAND,
    to: maintainInbox(),
    companyId,
    entityType: "demand_request",
    entityId: requestId as string,
    subject: "New requirement posted",
    body: `A hiring business posted ${prepared.length} demand line(s).`,
    actionPath: "/admin/matching",
  });

  revalidatePath("/app/demand");
  redirect("/app/demand");
}

export async function updateDemandLine(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  await requireActiveCompany();
  const supabase = await createClient();

  const parsed = updateSchema.safeParse(readPayload(formData.get("payload")));
  if (!parsed.success) {
    return { ok: false, message: "Some fields are incomplete. Check the fields marked below." };
  }
  const input = parsed.data;

  const windowProblem = dateRangeProblem({ start: input.startDate, end: input.endDate });
  if (windowProblem) {
    return { ok: false, errors: { "line-0": windowProblem }, message: "No changes were saved." };
  }

  const { data: line } = await supabase
    .from("demand_line")
    .select("id, quantity, start_date, end_date, hours_per_week, notes, status")
    .eq("id", input.lineId)
    .maybeSingle();

  if (!line) return { ok: false, message: "That demand line is not available to edit." };
  if (line.status === "Withdrawn" || line.status === "Expired") {
    return { ok: false, message: "Withdrawn and expired lines are history and cannot be edited." };
  }

  // 10.3 — quantity, window, hours, trade, proficiency, required skills and required
  // qualifications are all matchable: none may move while an open match references the
  // line, mirroring the capacity-side rule in 9.5.
  if (await hasOpenMatch(line.id)) {
    return {
      ok: false,
      message:
        "A match is open on this line. Maintain has to withdraw the match before the line can change.",
    };
  }

  // 10.3 — independently of matches, quantity may never be set below quantity_filled:
  // reduce by cancelling engagements first, so the status derivation always holds.
  const filled = await quantityFilled(line.id);
  if (input.quantity < filled) {
    return {
      ok: false,
      errors: { "line-0": `${filled} of this line is already filled; the quantity cannot go below that.` },
      message: "No changes were saved.",
    };
  }

  const rules = await getBookingRules();
  const hoursPerWeek = canonicalHoursPerWeek(input);
  const problem = lineProblem({ ...input, hoursPerWeek }, rules);
  if (problem) return { ok: false, errors: { "line-0": problem }, message: "No changes were saved." };

  const { error } = await supabase.rpc("update_company_demand_line", {
    p_line_id: line.id,
    p_quantity: input.quantity,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_hours_per_week: hoursPerWeek,
    p_notes: input.notes || null,
    p_skill_ids: input.skillIds,
    p_qualification_ids: input.qualificationIds,
  });

  if (error) return { ok: false, message: "The line could not be saved. Try again." };

  revalidatePath("/app/demand");
  redirect(`/app/demand/${line.id}`);
}

/**
 * 10.3 / module 19 — the hiring business withdraws its own lines, blocked while an open
 * match references the line. The detail screen already hides the control in that case,
 * so reaching the throw means the request was hand-rolled.
 */
export async function withdrawDemandLine(formData: FormData): Promise<void> {
  await requireActiveCompany();
  const supabase = await createClient();
  const lineId = String(formData.get("lineId") ?? "");

  const { data: line } = await supabase
    .from("demand_line")
    .select("id, status")
    .eq("id", lineId)
    .maybeSingle();

  if (!line) throw new Error("That demand line is not available to withdraw.");
  if (line.status === "Withdrawn" || line.status === "Expired") return;

  if (await hasOpenMatch(line.id)) {
    throw new Error(
      "A match is open on this line. Maintain has to withdraw the match before the line can be withdrawn.",
    );
  }

  const { error } = await supabase.rpc("withdraw_company_demand_line", {
    p_line_id: line.id,
  });
  if (error) throw new Error("That demand line could not be withdrawn.");

  revalidatePath("/app/demand");
  redirect("/app/demand");
}
