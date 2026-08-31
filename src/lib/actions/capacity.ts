"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormResult } from "@/lib/actions";
import { requireActiveCompany } from "@/lib/auth";
import { overlaps } from "@/lib/domain/availability";
import { NOTIFICATION_TRIGGERS, notify } from "@/lib/notify";
import { supplierBand } from "@/lib/rates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// SELL CAPACITY — spec module 9, with the rate rules of 5.2 and 9.7.
//
// Every write here goes through the user's own Supabase client, so RLS is the
// security boundary and this file's own filtering is convenience only (17.1).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const lineSchema = z.object({
  tradeRoleId: z.string().min(1),
  proficiencyId: z.string().min(1),
  availableFrom: z.string().regex(ISO_DATE, "Give a start date."),
  availableUntil: z.string().regex(ISO_DATE, "Give an end date."),
  availableDays: z.string().trim().max(120).optional(),
  hoursPerWeek: z.number().positive("Hours per week must be more than zero.").max(168),
  locationRegionId: z.string().min(1),
  travelRegionIds: z.array(z.string().min(1)).default([]),
  // 20.1 — money is integer cents everywhere, including in transit.
  supplierRateCents: z.number().int().positive("Confirm a rate."),
  // 9.1 / 9.3 — every line names its individual workers. There is no anonymous capacity.
  workerIds: z.array(z.string().min(1)).min(1, "Name the crew on this line."),
});

// 9.3 — the bulk flow is one form that creates several lines in one submission.
const createSchema = z.object({ lines: z.array(lineSchema).min(1) });

const updateSchema = z.object({
  lineId: z.string().min(1),
  availableFrom: z.string().regex(ISO_DATE),
  availableUntil: z.string().regex(ISO_DATE),
  availableDays: z.string().trim().max(120).optional(),
  hoursPerWeek: z.number().positive().max(168),
  travelRegionIds: z.array(z.string().min(1)).default([]),
  supplierRateCents: z.number().int().positive(),
  workerIds: z.array(z.string().min(1)).min(1),
});

type LineInput = z.infer<typeof lineSchema>;

type CrewRow = {
  id: string;
  first_name: string;
  last_name: string;
  primary_trade_id: string;
  primary_proficiency_id: string;
};

type Claim = { workerId: string; from: string; until: string };

/**
 * 9.5 — an "open capacity line" is one in {Open, Partially Committed}. Commit status is
 * derived at read time (module 19 executor table), so the stored column only ever holds
 * Open for a live line; Withdrawn and Expired lines are history and never block (9.4).
 */
const LIVE_LINE_STATUSES = ["Open", "Partially Committed", "Fully Committed"];

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

function crewName(worker: CrewRow): string {
  return `${worker.first_name} ${worker.last_name}`;
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

/**
 * 9.2 and 9.4, checked per line against the company's roster and every window each
 * worker already holds. `claimed` accumulates as the batch is validated, so two lines
 * in one submission cannot smuggle the same worker into overlapping windows either.
 */
function lineProblem(
  line: Pick<
    LineInput,
    "tradeRoleId" | "proficiencyId" | "availableFrom" | "availableUntil" | "workerIds"
  >,
  crew: Map<string, CrewRow>,
  claimed: Claim[],
): string | null {
  if (line.availableUntil < line.availableFrom) return "The window ends before it starts.";

  for (const workerId of line.workerIds) {
    const worker = crew.get(workerId);
    if (!worker) return "One of the selected crew is not on this company's roster.";

    // 9.2 — all workers on a line share the line's trade and proficiency. A different
    // classification means a separate line, never a per-worker override on this one.
    if (
      worker.primary_trade_id !== line.tradeRoleId ||
      worker.primary_proficiency_id !== line.proficiencyId
    ) {
      return `${crewName(worker)} is classified under a different trade or proficiency — put them on their own line.`;
    }

    // 9.4 — a worker may not appear on two open lines with overlapping windows.
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

async function loadCrew(supabase: Supabase, workerIds: string[]): Promise<Map<string, CrewRow>> {
  if (workerIds.length === 0) return new Map();

  // RLS scopes worker reads to the current employer (17.1), so a row coming back here
  // is itself the proof that this company employs the worker.
  const { data } = await supabase
    .from("worker")
    .select("id, first_name, last_name, primary_trade_id, primary_proficiency_id")
    .in("id", workerIds);

  return new Map(((data ?? []) as CrewRow[]).map((row) => [row.id, row]));
}

async function loadClaims(
  supabase: Supabase,
  companyId: string,
  exceptLineId?: string,
): Promise<Claim[]> {
  const { data } = await supabase
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

  return rows
    .filter((row) => row.id !== exceptLineId)
    .flatMap((row) =>
      (row.capacity_line_worker ?? []).map((link) => ({
        workerId: link.worker_id,
        from: row.available_from,
        until: row.available_until,
      })),
    );
}

/** 9.5 — withdrawal and every matchable edit are blocked while an open match holds the line. */
async function hasOpenMatch(supabase: Supabase, lineId: string): Promise<boolean> {
  const { data } = await supabase
    .from("supplier_match_view")
    .select("id")
    .eq("capacity_line_id", lineId)
    .in("status", OPEN_MATCH_STATUSES)
    .limit(1);

  return (data ?? []).length > 0;
}

/**
 * 20.4 — a missing band never invents a rate. The supplying business can still set one;
 * Maintain is told so the band can be published.
 */
async function flagMissingBands(
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
    body: `${missing} capacity line(s) carry no applicable rate band. The supplying business set its own rate; publish a band for that trade, proficiency and region.`,
    actionPath: "/admin/rates",
  });
}

export async function createCapacityListing(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  // 1.3 / 3.2 — only an Active company can list capacity. Enforced here rather than by
  // a disabled button, so a hand-rolled request cannot slip past it.
  const { user, companyId } = await requireActiveCompany();
  const supabase = await createClient();

  const parsed = createSchema.safeParse(readPayload(formData.get("payload")));
  if (!parsed.success) {
    return { ok: false, message: "Some lines are incomplete. Check the fields marked below." };
  }
  const lines = parsed.data.lines;

  const crew = await loadCrew(supabase, [...new Set(lines.flatMap((line) => line.workerIds))]);
  const claimed = await loadClaims(supabase, companyId);

  const errors: Record<string, string> = {};
  lines.forEach((line, index) => {
    const problem = lineProblem(line, crew, claimed);
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

  const { data: listingId, error } = await createAdminClient().rpc(
    "create_capacity_listing_transactional",
    {
      p_company_id: companyId,
      p_actor_user_id: user.id,
      p_admin_entered: false,
      p_evidence_note: null,
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

  // The RPC committed the parent, all lines and children, and the audit first. These
  // deliveries are deliberately post-commit and cannot leave a partial listing.
  await flagMissingBands(lines, companyId, listingId as string);

  // 15.2 / 15.3 — Maintain is told capacity exists; the email carries no rate and no
  // worker names, and deep-links into the app where the visibility rules apply.
  await notify({
    trigger: NOTIFICATION_TRIGGERS.NEW_CAPACITY,
    to: maintainInbox(),
    companyId,
    entityType: "capacity_listing",
    entityId: listingId as string,
    subject: "New capacity listed",
    body: `A supplying business listed ${lines.length} capacity line(s).`,
    actionPath: "/admin/matching",
  });

  revalidatePath("/app/capacity");
  redirect("/app/capacity");
}

export async function updateCapacityLine(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const { companyId } = await requireActiveCompany();
  const supabase = await createClient();

  const parsed = updateSchema.safeParse(readPayload(formData.get("payload")));
  if (!parsed.success) {
    return { ok: false, message: "Some fields are incomplete. Check the fields marked below." };
  }
  const input = parsed.data;

  const { data: line } = await supabase
    .from("capacity_line")
    .select(
      "id, company_id, trade_role_id, proficiency_id, available_from, available_until, available_days, hours_per_week, supplier_rate_cents, status",
    )
    .eq("id", input.lineId)
    .maybeSingle();

  if (!line) return { ok: false, message: "That capacity line is not available to edit." };
  if (line.status === "Withdrawn" || line.status === "Expired") {
    return { ok: false, message: "Withdrawn and expired lines are history and cannot be edited." };
  }

  // 9.5 — window, workers, rate, trade, proficiency, hours, location and travel regions
  // are all matchable fields: none of them may move while an open match references the
  // line. Maintain withdraws the match first.
  if (await hasOpenMatch(supabase, line.id)) {
    return {
      ok: false,
      message:
        "A match is open on this line. Maintain has to withdraw the match before the line can change.",
    };
  }

  const crew = await loadCrew(supabase, input.workerIds);
  const claimed = await loadClaims(supabase, companyId, line.id);
  const problem = lineProblem(
    {
      tradeRoleId: line.trade_role_id,
      proficiencyId: line.proficiency_id,
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
      workerIds: input.workerIds,
    },
    crew,
    claimed,
  );
  if (problem) {
    return { ok: false, errors: { "line-0": problem }, message: "No changes were saved." };
  }

  const { error } = await supabase.rpc("update_company_capacity_line", {
    p_line_id: line.id,
    p_available_from: input.availableFrom,
    p_available_until: input.availableUntil,
    p_available_days: input.availableDays || null,
    p_hours_per_week: input.hoursPerWeek,
    p_supplier_rate_cents: input.supplierRateCents,
    p_worker_ids: input.workerIds,
    p_travel_region_ids: input.travelRegionIds,
  });

  if (error) return { ok: false, message: "The line could not be saved. Try again." };

  revalidatePath("/app/capacity");
  redirect(`/app/capacity/${line.id}`);
}

/**
 * 9.5 / module 19 — a supplying business withdraws its own lines. Withdrawal with a
 * pending match is blocked until Maintain withdraws the match. The rows stay as
 * history and never block a future listing (9.4).
 *
 * The detail screen already hides the control when a match is open, so reaching the
 * throw means the request was hand-rolled.
 */
export async function withdrawCapacityLine(formData: FormData): Promise<void> {
  await requireActiveCompany();
  const supabase = await createClient();
  const lineId = String(formData.get("lineId") ?? "");

  const { data: line } = await supabase
    .from("capacity_line")
    .select("id, status")
    .eq("id", lineId)
    .maybeSingle();

  if (!line) throw new Error("That capacity line is not available to withdraw.");
  if (line.status === "Withdrawn" || line.status === "Expired") return;

  if (await hasOpenMatch(supabase, line.id)) {
    throw new Error(
      "A match is open on this line. Maintain has to withdraw the match before the line can be withdrawn.",
    );
  }

  const { error } = await supabase.rpc("withdraw_company_capacity_line", {
    p_line_id: line.id,
  });
  if (error) throw new Error("That capacity line could not be withdrawn.");

  revalidatePath("/app/capacity");
  redirect("/app/capacity");
}
