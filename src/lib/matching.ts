import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireMaintainAdmin } from "@/lib/auth";
import { getBookingRules } from "@/lib/config";
import { buyerRateCents } from "@/lib/domain/money";
import { effectiveQualification } from "@/lib/domain/matching-credentials";
import {
  availability,
  classifyCandidate,
  intersect,
  isCommitting,
  overlaps,
  COMMITTING_STATUSES,
  type CandidateClass,
  type CapacityWindow,
  type DateRange,
} from "@/lib/domain/availability";
import type { CapacityLineStatus, MatchStatus } from "@/lib/supabase/types";

// Matching — spec module 11, plus the role projections modules 12 and 13 read.
//
// Two halves, deliberately in one file because they share the same joins:
//   1. the 11.1 candidate computation, run with the service role for the Maintain
//      admin workspace (17.3);
//   2. the per-role projections a company reads for a match or an engagement.
//
// On (2): 17.1 forbids a company reading match/engagement base tables, so entitlement
// always comes from the RLS view read under the user's own session. The view is fixed
// and carries only money and status columns, so the descriptive fields 12.2 and 12.4
// require (trade, dates, skills coverage, aggregate badges) are fetched server-side
// afterwards and hand-projected for that role. The view proves the right to read the
// row; this module decides what of the row that role may be told.

/** 9.5 — "open capacity line" means exactly this set, everywhere in the spec. */
export const OPEN_CAPACITY_STATUSES: CapacityLineStatus[] = ["Open", "Partially Committed"];

/**
 * 9.5 / 21.2 — commit status never removes a line from the availability union and
 * never affects the 11.1 candidate computation. Only Withdrawn and Expired do.
 */
export const LIVE_CAPACITY_STATUSES: CapacityLineStatus[] = [
  "Open",
  "Partially Committed",
  "Fully Committed",
];

/** 12.1 — "open match" means exactly this set, everywhere in the spec. */
export const OPEN_MATCH_STATUSES: MatchStatus[] = ["Awaiting Supplier", "Awaiting Buyer"];

export type QualificationBadge = {
  name: string;
  held: boolean;
  expiresDuringEngagement: boolean;
  expiringSoon: boolean;
};

export type Candidate = {
  /** Candidate unit is the worker via its capacity_line_worker row (11.1). */
  key: string;
  workerId: string;
  workerName: string;
  capacityLineId: string;
  supplierCompanyId: string;
  supplierCompanyName: string;
  klass: CandidateClass;
  reasons: string[];
  availabilityPercent: number;
  hoursShortfall: boolean;
  lineHoursPerWeek: number;
  hoursSufficient: boolean;
  skillsHeld: number;
  skillsRequired: number;
  qualifications: QualificationBadge[];
  expiresDuringEngagement: boolean;
  supplierRateCents: number;
  buyerRateCents: number;
  engagementStart: string;
  engagementEnd: string;
};

export type DemandLineContext = {
  id: string;
  requestName: string;
  buyerCompanyId: string;
  tradeRoleId: string;
  tradeName: string;
  proficiencyId: string;
  proficiencyName: string;
  proficiencyRank: number;
  quantity: number;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
  workRegionId: string;
  workRegionName: string;
  description: string | null;
  notes: string | null;
  status: string;
  requiredSkills: string[];
  requiredQualifications: string[];
  /** 10.3 — the two derived counts, shown separately in the admin view. */
  quantityFilled: number;
  quantityPending: number;
  remaining: number;
  feeBp: number;
};

type Row = Record<string, unknown>;

type FetchRange = (from: number, to: number) => PromiseLike<{
  data: unknown; error: unknown; count: number | null;
}>;

/** Stable ordered ranges, exact counts and fail-closed reads prevent partial
 * PostgREST responses from silently changing eligibility. Advance by the received
 * length so a configured API cap below our requested page size is also safe. */
async function readMatchingRows(fetchRange: FetchRange): Promise<Row[]> {
  const rows: Row[] = [];
  let expectedCount: number | null = null;
  do {
    const { data, error, count } = await fetchRange(rows.length, rows.length + 499);
    if (error || !Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("Matching details could not be loaded completely. Refresh before deciding.");
    }
    if ((expectedCount !== null && expectedCount !== count) || (!data.length && rows.length < count)) {
      throw new Error("Matching details changed while loading. Refresh before deciding.");
    }
    expectedCount = count;
    rows.push(...data as Row[]);
  } while (rows.length < expectedCount);
  return rows;
}

/** Keep IN URLs bounded; four independent chunks at a time avoid a request flood. */
async function readMatchingRowsForIds(
  ids: string[], fetchRange: (ids: string[], from: number, to: number) => ReturnType<FetchRange>,
): Promise<Row[]> {
  const uniqueIds = [...new Set(ids)].sort();
  const rows: Row[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 400) {
    const batches: Promise<Row[]>[] = [];
    for (let chunk = offset; chunk < Math.min(offset + 400, uniqueIds.length); chunk += 100) {
      const selected = uniqueIds.slice(chunk, chunk + 100);
      batches.push(readMatchingRows((from, to) => fetchRange(selected, from, to)));
    }
    rows.push(...(await Promise.all(batches)).flat());
  }
  return rows;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function today(): string {
  // 20.5 — calendar dates in Australia/Brisbane, which has no daylight saving, so the
  // fixed +10:00 offset is exact rather than an approximation.
  return new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
}

export const brisbaneToday = today;

/* ------------------------------------------------------------------ 10.3 counts -- */

/**
 * 10.3 — quantity_filled counts distinct workers on committing engagements for the
 * line (a worker covering it through sequential engagements occupies one slot);
 * quantity_pending is the requested quantity while Awaiting Supplier and the live
 * nomination count once Awaiting Buyer. The over-proposal guard in 11.3 caps a new
 * match at quantity − filled − pending.
 */
export async function demandLineCounts(
  demandLineId: string,
): Promise<{ filled: number; pending: number }> {
  const admin = createAdminClient();

  const { data: engagements } = await admin
    .from("engagement")
    .select("id, status")
    .eq("demand_line_id", demandLineId)
    .in("status", [...COMMITTING_STATUSES]);

  const engagementIds = (engagements ?? []).map((e) => e.id as string);
  let filled = 0;
  if (engagementIds.length > 0) {
    const { data: workers } = await admin
      .from("engagement_worker")
      .select("worker_id, status")
      .in("engagement_id", engagementIds)
      .in("status", [...COMMITTING_STATUSES]);
    filled = new Set((workers ?? []).map((w) => w.worker_id as string)).size;
  }

  const { data: matches } = await admin
    .from("match")
    .select("id, status, requested_quantity")
    .eq("demand_line_id", demandLineId)
    .in("status", OPEN_MATCH_STATUSES);

  let pending = 0;
  for (const match of matches ?? []) {
    if (match.status === "Awaiting Supplier") {
      pending += num(match.requested_quantity);
      continue;
    }
    const { count } = await admin
      .from("match_worker")
      .select("id", { count: "exact", head: true })
      .eq("match_id", match.id as string)
      .eq("knocked_out", false);
    pending += count ?? 0;
  }

  return { filled, pending };
}

/* --------------------------------------------------------- 11.1 candidate query -- */

export async function getDemandLineContext(
  demandLineId: string,
): Promise<DemandLineContext | null> {
  await requireMaintainAdmin();
  const admin = createAdminClient();

  const { data: line } = await admin
    .from("demand_line")
    .select(
      `id, company_id, trade_role_id, proficiency_id, quantity, start_date, end_date,
       hours_per_week, notes, status,
       request:request_id (name, description, work_region_id, region:work_region_id (name)),
       trade:trade_role_id (name),
       proficiency:proficiency_id (name, rank)`,
    )
    .eq("id", demandLineId)
    .maybeSingle();

  if (!line) return null;

  const request = one<Row>(line.request as Row | Row[]);
  const trade = one<Row>(line.trade as Row | Row[]);
  const proficiency = one<Row>(line.proficiency as Row | Row[]);
  const region = one<Row>(request?.region as Row | Row[] | undefined);

  const [{ data: skillRows }, { data: qualRows }, counts, rules] = await Promise.all([
    admin
      .from("demand_line_skill")
      .select("skill_id, skill:skill_id (name)")
      .eq("demand_line_id", demandLineId),
    admin
      .from("demand_line_qualification")
      .select("qualification_id, qualification:qualification_id (name)")
      .eq("demand_line_id", demandLineId),
    demandLineCounts(demandLineId),
    getBookingRules(),
  ]);

  return {
    id: line.id as string,
    requestName: (request?.name as string) ?? "Requirement",
    buyerCompanyId: line.company_id as string,
    tradeRoleId: line.trade_role_id as string,
    tradeName: (trade?.name as string) ?? "—",
    proficiencyId: line.proficiency_id as string,
    proficiencyName: (proficiency?.name as string) ?? "—",
    proficiencyRank: num(proficiency?.rank),
    quantity: num(line.quantity),
    startDate: line.start_date as string,
    endDate: line.end_date as string,
    hoursPerWeek: num(line.hours_per_week),
    workRegionId: request?.work_region_id as string,
    workRegionName: (region?.name as string) ?? "—",
    description: (request?.description as string) ?? null,
    notes: (line.notes as string) ?? null,
    status: line.status as string,
    requiredSkills: (skillRows ?? []).map(
      (r) => (one<Row>(r.skill as Row | Row[])?.name as string) ?? "",
    ),
    requiredQualifications: (qualRows ?? []).map(
      (r) => (one<Row>(r.qualification as Row | Row[])?.name as string) ?? "",
    ),
    quantityFilled: counts.filled,
    quantityPending: counts.pending,
    remaining: Math.max(0, num(line.quantity) - counts.filled - counts.pending),
    feeBp: rules.feeBp,
  };
}

/**
 * 11.1 — the three display classes, computed server-side. The candidate unit is the
 * worker via its capacity_line_worker rows, so one worker attached to two capacity
 * lines yields two rows: the line is what a match is scoped to (11.3).
 *
 * 21.1 asks for this in SQL. It is expressed here as a small set of indexed reads
 * plus the shared arithmetic in @/lib/domain/availability, because the display classes
 * and the availability formula must be the same code the unit tests exercise —
 * duplicating the rule in a view is how the two drift apart.
 */
export async function getCandidates(input: {
  demandLine: DemandLineContext;
  includeHigherProficiency: boolean;
}): Promise<Candidate[]> {
  const admin = createAdminClient();
  const { demandLine, includeHigherProficiency } = input;
  const demandWindow: DateRange = { start: demandLine.startDate, end: demandLine.endDate };

  // Capacity lines of the demand's trade whose window overlaps the demand window.
  // Withdrawn and Expired lines are not offering capacity; commit status is not a
  // filter here (9.5 — it never affects the 11.1 candidate computation).
  const lines = await readMatchingRows((from, to) => admin
    .from("capacity_line")
    .select(
      `id, company_id, proficiency_id, available_from, available_until, hours_per_week,
       location_region_id, supplier_rate_cents, status,
       company:company_id (legal_name, trading_name, status),
       proficiency:proficiency_id (rank)`, { count: "exact" },
    )
    .eq("trade_role_id", demandLine.tradeRoleId)
    .in("status", LIVE_CAPACITY_STATUSES)
    .lte("available_from", demandLine.endDate)
    .gte("available_until", demandLine.startDate).order("id").range(from, to));
  if (lines.length === 0) return [];

  const lineIds = lines.map((l) => l.id as string);

  const [travelRows, members] = await Promise.all([
    readMatchingRowsForIds(lineIds, (ids, from, to) => admin
      .from("capacity_line_travel_region")
      .select("capacity_line_id, region_id", { count: "exact" })
      .in("capacity_line_id", ids).order("capacity_line_id").order("region_id").range(from, to)),
    readMatchingRowsForIds(lineIds, (ids, from, to) => admin.from("capacity_line_worker")
      .select("capacity_line_id, worker_id", { count: "exact" }).in("capacity_line_id", ids)
      .order("capacity_line_id").order("worker_id").range(from, to)),
  ]);

  const workerIds = [...new Set(members.map((m) => m.worker_id as string))];
  if (workerIds.length === 0) return [];

  const requiredQualificationIds = await requiredQualificationIdsFor(demandLine.id);

  // 7.2 / 4.5 — a qualification flagged mandatory for the line's trade at worker
  // level excludes a worker whose copy has Expired, regardless of whether this
  // particular demand line listed it. The definition lives in the catalogue mapping,
  // so a compliance change is a data edit, never a code change.
  const mandatoryRows = await readMatchingRows((from, to) => admin
    .from("trade_role_qualification")
    .select("qualification_id", { count: "exact" })
    .eq("trade_role_id", demandLine.tradeRoleId)
    .eq("level", "worker")
    .eq("is_mandatory", true).order("qualification_id").range(from, to));
  const mandatoryQualIds = new Set(
    (mandatoryRows ?? []).map((r) => r.qualification_id as string),
  );

  const [
    workerRows,
    skillRows,
    qualRows,
    engagementRows,
    nominationRows,
    allMemberRows,
    requiredSkillIds,
  ] = await Promise.all([
    readMatchingRowsForIds(workerIds, (ids, from, to) => admin
      .from("worker")
      .select("id, first_name, last_name, status", { count: "exact" })
      .in("id", ids).order("id").range(from, to)),
    readMatchingRowsForIds(workerIds, (ids, from, to) => admin.from("worker_skill")
      .select("worker_id, skill_id", { count: "exact" }).in("worker_id", ids)
      .order("worker_id").order("skill_id").range(from, to)),
    readMatchingRowsForIds(workerIds, (ids, from, to) => admin
      .from("worker_qualification")
      .select("worker_id, qualification_id, expiry_date, status, qualification:qualification_id (name)", { count: "exact" })
      .in("worker_id", ids).order("id").range(from, to)),
    // 13.0 — committing engagements consume capacity wherever capacity is counted.
    readMatchingRowsForIds(workerIds, (ids, from, to) => admin
      .from("engagement_worker")
      .select("worker_id, status, engagement:engagement_id (start_date, end_date)", { count: "exact" })
      .in("worker_id", ids)
      .in("status", [...COMMITTING_STATUSES]).order("id").range(from, to)),
    // 21.3 — a nomination in an open match soft-holds the worker's dates.
    readMatchingRowsForIds(workerIds, (ids, from, to) => admin
      .from("match_worker")
      .select("worker_id, match:match_id (status, engagement_start, engagement_end)", { count: "exact" })
      .in("worker_id", ids)
      .eq("knocked_out", false).order("id").range(from, to)),
    // 21.2 — the availability union spans every live capacity line of the worker,
    // not only the lines of this trade that surfaced above.
    readMatchingRowsForIds(workerIds, (ids, from, to) => admin.from("capacity_line_worker")
      .select("capacity_line_id, worker_id", { count: "exact" }).in("worker_id", ids)
      .order("worker_id").order("capacity_line_id").range(from, to)),
    requiredSkillIdsFor(demandLine.id),
  ]);

  const unionLines = await capacityWindowsFor(
    [...new Set((allMemberRows ?? []).map((m) => m.capacity_line_id as string))],
  );

  const travelByLine = new Map<string, Set<string>>();
  for (const row of travelRows ?? []) {
    const key = row.capacity_line_id as string;
    if (!travelByLine.has(key)) travelByLine.set(key, new Set());
    travelByLine.get(key)!.add(row.region_id as string);
  }

  const workerById = new Map((workerRows ?? []).map((w) => [w.id as string, w]));

  const skillsByWorker = new Map<string, Set<string>>();
  for (const row of skillRows ?? []) {
    const key = row.worker_id as string;
    if (!skillsByWorker.has(key)) skillsByWorker.set(key, new Set());
    skillsByWorker.get(key)!.add(row.skill_id as string);
  }

  const qualsByWorker = new Map<string, Row[]>();
  for (const row of qualRows ?? []) {
    const key = row.worker_id as string;
    if (!qualsByWorker.has(key)) qualsByWorker.set(key, []);
    qualsByWorker.get(key)!.push(row as Row);
  }

  const committedByWorker = new Map<string, DateRange[]>();
  for (const row of engagementRows ?? []) {
    const engagement = one<Row>(row.engagement as Row | Row[]);
    if (!engagement) continue;
    const key = row.worker_id as string;
    if (!committedByWorker.has(key)) committedByWorker.set(key, []);
    committedByWorker.get(key)!.push({
      start: engagement.start_date as string,
      end: engagement.end_date as string,
    });
  }

  const softHeldWorkers = new Set<string>();
  for (const row of nominationRows ?? []) {
    const match = one<Row>(row.match as Row | Row[]);
    if (!match) continue;
    if (!OPEN_MATCH_STATUSES.includes(match.status as MatchStatus)) continue;
    const window: DateRange = {
      start: match.engagement_start as string,
      end: match.engagement_end as string,
    };
    if (overlaps(window, demandWindow)) softHeldWorkers.add(row.worker_id as string);
  }

  const linesByWorker = new Map<string, string[]>();
  for (const row of allMemberRows ?? []) {
    const key = row.worker_id as string;
    if (!linesByWorker.has(key)) linesByWorker.set(key, []);
    linesByWorker.get(key)!.push(row.capacity_line_id as string);
  }

  const candidates: Candidate[] = [];

  for (const line of lines) {
    const lineId = line.id as string;
    const company = one<Row>(line.company as Row | Row[]);
    const lineProficiency = one<Row>(line.proficiency as Row | Row[]);
    const lineWindow: DateRange = {
      start: line.available_from as string,
      end: line.available_until as string,
    };
    // 11.3 — the engagement window is the intersection of the demand window and the
    // capacity line window. It is what both parties see and what the engagement
    // inherits, so every in-window test below uses it, not the demand window.
    const engagementWindow = intersect(lineWindow, demandWindow);
    if (!engagementWindow) continue;

    const regionCovered =
      (line.location_region_id as string) === demandLine.workRegionId ||
      (travelByLine.get(lineId)?.has(demandLine.workRegionId) ?? false);

    // 1.6 / 3.2 — a company that is not Active, or is non-compliant, is out of new
    // proposals. The line's company is the employing company: 9.2 attaches only that
    // company's own crew to its lines.
    const companyActive = (company?.status as string) === "Active";
    const compliant = companyActive ? await companyCompliance(line.company_id as string) : false;

    const supplierRate = num(line.supplier_rate_cents);
    const derivedBuyerRate = buyerRateCents(supplierRate, demandLine.feeBp);
    const lineHours = num(line.hours_per_week);

    for (const member of members.filter((m) => (m.capacity_line_id as string) === lineId)) {
      const workerId = member.worker_id as string;
      const worker = workerById.get(workerId);
      if (!worker) continue;

      const committed = committedByWorker.get(workerId) ?? [];
      const workerLines = (linesByWorker.get(workerId) ?? [])
        .map((id) => unionLines.get(id))
        .filter((w): w is CapacityWindow => Boolean(w));

      const avail = availability({
        demand: demandWindow,
        demandHoursPerWeek: demandLine.hoursPerWeek,
        lines: workerLines,
        committedRanges: committed,
      });

      // 11.1 — a committing engagement covering only part of the window is a partial
      // conflict (greyed); one covering all of it drives availability to 0% (excluded).
      const partialConflict = committed.some((range) => overlaps(range, engagementWindow));

      const badges = qualificationBadges(
        qualsByWorker.get(workerId) ?? [],
        requiredQualificationIds,
        engagementWindow,
        demandLine.startDate,
      );

      const held = skillsByWorker.get(workerId) ?? new Set<string>();
      const skillsHeld = requiredSkillIds.filter((id) => held.has(id)).length;

      let { klass, reasons } = classifyCandidate({
        // 9.2 — every worker on a line shares the line's trade and proficiency, so the
        // line's own trade and proficiency are the worker's for matching purposes.
        tradeMatches: true,
        proficiencyRank: num(lineProficiency?.rank),
        demandProficiencyRank: demandLine.proficiencyRank,
        includeHigherProficiency,
        regionCovered,
        workerStatusActive: (worker.status as string) === "Active",
        employerActiveAndCompliant: companyActive && compliant,
        // 7.2 — an Expired mandatory-for-the-trade qualification excludes the worker
        // even when the demand line never listed it.
        requiredQualificationExpired:
          badges.anyExpired ||
          [...mandatoryQualIds].some((id) => {
            const credential = effectiveQualification(qualsByWorker.get(workerId) ?? [], id, today());
            return credential !== undefined && (credential.status === "Expired" ||
              (typeof credential.expiry_date === "string" && credential.expiry_date < today()));
          }),
        requiredQualificationExpiresBeforeStart: badges.anyExpiresBeforeStart,
        requiredQualificationExpiresInWindow: badges.anyExpiresInWindow,
        availabilityPercent: avail.percent,
        softHeldElsewhere: softHeldWorkers.has(workerId),
        partialCommittingConflict: partialConflict,
      });

      // 7.3 — a required qualification is satisfied only when it is held and its expiry
      // clears the window. A ticket that was never issued can never satisfy that, so a
      // missing one excludes exactly as an expired one does.
      if (badges.anyMissing) {
        klass = "Excluded";
        reasons = [...reasons, "required qualification not held"];
      }

      candidates.push({
        key: `${lineId}:${workerId}`,
        workerId,
        workerName: `${worker.first_name as string} ${worker.last_name as string}`,
        capacityLineId: lineId,
        supplierCompanyId: line.company_id as string,
        supplierCompanyName:
          (company?.trading_name as string) || (company?.legal_name as string) || "—",
        klass,
        reasons,
        availabilityPercent: avail.percent,
        hoursShortfall: avail.hoursShortfall,
        lineHoursPerWeek: lineHours,
        hoursSufficient: lineHours >= demandLine.hoursPerWeek,
        skillsHeld,
        skillsRequired: requiredSkillIds.length,
        qualifications: badges.badges,
        expiresDuringEngagement: badges.anyExpiresInWindow,
        supplierRateCents: supplierRate,
        buyerRateCents: derivedBuyerRate,
        engagementStart: engagementWindow.start,
        engagementEnd: engagementWindow.end,
      });
    }
  }

  // 11.1 — Excluded is never shown. It is computed and then dropped here rather than
  // filtered away in SQL so the reasons stay available to the audit trail.
  return candidates.filter((c) => c.klass !== "Excluded");
}

async function requiredSkillIdsFor(demandLineId: string): Promise<string[]> {
  const admin = createAdminClient();
  const data = await readMatchingRows((from, to) => admin
    .from("demand_line_skill")
    .select("skill_id", { count: "exact" })
    .eq("demand_line_id", demandLineId).order("skill_id").range(from, to));
  return (data ?? []).map((r) => r.skill_id as string);
}

export async function requiredQualificationIdsFor(demandLineId: string): Promise<string[]> {
  const admin = createAdminClient();
  const data = await readMatchingRows((from, to) => admin
    .from("demand_line_qualification")
    .select("qualification_id", { count: "exact" })
    .eq("demand_line_id", demandLineId).order("qualification_id").range(from, to));
  return (data ?? []).map((r) => r.qualification_id as string);
}

async function capacityWindowsFor(lineIds: string[]): Promise<Map<string, CapacityWindow>> {
  const out = new Map<string, CapacityWindow>();
  if (lineIds.length === 0) return out;
  const admin = createAdminClient();
  const data = await readMatchingRowsForIds(lineIds, (ids, from, to) => admin
    .from("capacity_line")
    .select("id, available_from, available_until, hours_per_week, status", { count: "exact" })
    .in("id", ids).order("id").range(from, to));
  for (const row of data ?? []) {
    out.set(row.id as string, {
      range: { start: row.available_from as string, end: row.available_until as string },
      hoursPerWeek: num(row.hours_per_week),
      status: row.status as CapacityWindow["status"],
    });
  }
  return out;
}

/**
 * 1.6 — a company with an expired mandatory document is out of new match proposals.
 * Cached per request because a single candidate set repeats a handful of companies
 * across hundreds of rows.
 */
const companyCompliance = cache(async (companyId: string): Promise<boolean> => {
  const { data, error } = await createAdminClient().rpc("company_is_match_compliant", {
    p_company_id: companyId,
    p_effective_date: today(),
  });
  if (error) throw new Error("Company compliance could not be checked.");
  return data === true;
});

/** 7.3 + 12.4 — badge facts. Ticket numbers never appear; only names and states. */
function qualificationBadges(
  rows: Row[],
  requiredIds: string[],
  engagementWindow: DateRange,
  demandStart: string,
): {
  badges: QualificationBadge[];
  anyExpired: boolean;
  anyExpiresBeforeStart: boolean;
  anyExpiresInWindow: boolean;
  anyMissing: boolean;
} {
  const badges: QualificationBadge[] = [];
  let anyExpired = false;
  let anyExpiresBeforeStart = false;
  let anyExpiresInWindow = false;
  let anyMissing = false;

  for (const id of requiredIds) {
    const row = effectiveQualification(rows, id, today());
    const name = (one<Row>(row?.qualification as Row | Row[] | undefined)?.name as string) ?? "Ticket";

    if (!row) {
      anyMissing = true;
      badges.push({ name, held: false, expiresDuringEngagement: false, expiringSoon: false });
      continue;
    }

    const expiry = (row.expiry_date as string) ?? null;
    const status = row.status as string;
    const expired = status === "Expired" || (expiry !== null && expiry < today());
    const expiresBeforeStart = Boolean(expiry) && expiry! < demandStart;
    const expiresInWindow =
      Boolean(expiry) && expiry! >= engagementWindow.start && expiry! < engagementWindow.end;

    if (expired) anyExpired = true;
    if (expiresBeforeStart) anyExpiresBeforeStart = true;
    if (!expired && !expiresBeforeStart && expiresInWindow) anyExpiresInWindow = true;

    badges.push({
      name,
      held: !expired,
      expiresDuringEngagement: expiresInWindow,
      expiringSoon: status === "Expiring Soon",
    });
  }

  return { badges, anyExpired, anyExpiresBeforeStart, anyExpiresInWindow, anyMissing };
}

/* --------------------------------------------------------- 12.2 supplier reads -- */

export type SupplierMatchView = {
  id: string;
  status: MatchStatus;
  nominationVersion: number;
  requestedQuantity: number;
  engagementStart: string;
  engagementEnd: string;
  hoursPerWeek: number;
  supplierRateCents: number;
  proposedAt: string;
  hasQualificationOverride: boolean;
  capacityLineId: string;
  tradeName: string;
  proficiencyName: string;
  workRegionName: string;
  workDescription: string | null;
  estimatedSupplierValueCents: number;
  expectedHours: number;
  nominatedWorkers: { id: string; name: string; knockedOut: boolean; reason: string | null }[];
};

/**
 * 12.2 — the shape the supplying business sees: trade, proficiency, quantity, dates,
 * hours, work region, work description, its own snapshotted rate and the estimated
 * engagement value. The buyer's company name is absent by construction: it is never
 * selected, not hidden in the markup.
 */
export async function supplierMatches(): Promise<SupplierMatchView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supplier_match_view")
    .select("*")
    .order("proposed_at", { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];
  return Promise.all(rows.map((row) => enrichSupplierMatch(row as Row)));
}

export async function supplierMatch(id: string): Promise<SupplierMatchView | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("supplier_match_view").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return enrichSupplierMatch(data as Row);
}

async function enrichSupplierMatch(row: Row): Promise<SupplierMatchView> {
  const admin = createAdminClient();
  const { data: detail } = await admin
    .from("match")
    .select(
      `id,
       demand_line:demand_line_id (
         trade:trade_role_id (name),
         proficiency:proficiency_id (name),
         request:request_id (description, region:work_region_id (name))
       )`,
    )
    .eq("id", row.id as string)
    .maybeSingle();

  const demandLine = one<Row>(detail?.demand_line as Row | Row[] | undefined);
  const request = one<Row>(demandLine?.request as Row | Row[] | undefined);

  const { data: nominations } = await admin
    .from("match_worker")
    .select("worker_id, knocked_out, knocked_out_reason, worker:worker_id (first_name, last_name)")
    .eq("match_id", row.id as string);

  const hours = num(row.hours_per_week);
  const days = inclusiveDayCount(row.engagement_start as string, row.engagement_end as string);
  const liveCount = (nominations ?? []).filter((n) => !n.knocked_out).length;
  const workerCount = liveCount || num(row.requested_quantity);
  const expected = Math.floor((hours * days) / 7 + 0.5);

  return {
    id: row.id as string,
    status: row.status as MatchStatus,
    nominationVersion: num(row.nomination_version),
    requestedQuantity: num(row.requested_quantity),
    engagementStart: row.engagement_start as string,
    engagementEnd: row.engagement_end as string,
    hoursPerWeek: hours,
    supplierRateCents: num(row.supplier_rate_cents),
    proposedAt: row.proposed_at as string,
    hasQualificationOverride: Boolean(row.has_qualification_override),
    capacityLineId: row.capacity_line_id as string,
    tradeName: (one<Row>(demandLine?.trade as Row | Row[] | undefined)?.name as string) ?? "—",
    proficiencyName:
      (one<Row>(demandLine?.proficiency as Row | Row[] | undefined)?.name as string) ?? "—",
    workRegionName: (one<Row>(request?.region as Row | Row[] | undefined)?.name as string) ?? "—",
    workDescription: (request?.description as string) ?? null,
    expectedHours: expected,
    estimatedSupplierValueCents: num(row.supplier_rate_cents) * expected * workerCount,
    nominatedWorkers: (nominations ?? []).map((n) => {
      const worker = one<Row>(n.worker as Row | Row[]);
      return {
        id: n.worker_id as string,
        name: `${(worker?.first_name as string) ?? ""} ${(worker?.last_name as string) ?? ""}`.trim(),
        knockedOut: Boolean(n.knocked_out),
        reason: (n.knocked_out_reason as string) ?? null,
      };
    }),
  };
}

/* ------------------------------------------------------------ 12.4 buyer reads -- */

export type BuyerMatchView = {
  id: string;
  status: MatchStatus;
  nominationVersion: number;
  requestedQuantity: number;
  nominatedCount: number;
  engagementStart: string;
  engagementEnd: string;
  hoursPerWeek: number;
  buyerRateCents: number;
  proposedAt: string;
  demandLineId: string;
  requestName: string;
  tradeName: string;
  proficiencyName: string;
  skillsHeld: number;
  skillsRequired: number;
  /** 12.4 — counts only. Never a ticket number, never a per-worker row. */
  qualificationCoverage: { name: string; heldBy: number; of: number }[];
  expectedHours: number;
  estimatedBuyerValueCents: number;
};

/**
 * 12.4 — the buyer sees trade, proficiency, quantity, skills coverage, aggregate
 * qualification badges, dates, hours, buyer rate and estimated total cost. No worker
 * names, no supplying business name, no supplier rate: none of the three is selected
 * anywhere in this function, so no response can carry them.
 */
export async function buyerMatches(): Promise<BuyerMatchView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buyer_match_view")
    .select("*")
    .order("proposed_at", { ascending: false });
  const rows = data ?? [];
  return Promise.all(rows.map((row) => enrichBuyerMatch(row as Row)));
}

export async function buyerMatch(id: string): Promise<BuyerMatchView | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("buyer_match_view").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return enrichBuyerMatch(data as Row);
}

async function enrichBuyerMatch(row: Row): Promise<BuyerMatchView> {
  const admin = createAdminClient();
  const demandLineId = row.demand_line_id as string;

  const { data: line } = await admin
    .from("demand_line")
    .select(
      `id, trade:trade_role_id (name), proficiency:proficiency_id (name),
       request:request_id (name)`,
    )
    .eq("id", demandLineId)
    .maybeSingle();

  const nominations = await readMatchingRows((from, to) => admin
    .from("match_worker")
    .select("worker_id", { count: "exact" })
    .eq("match_id", row.id as string)
    .eq("knocked_out", false).order("id").range(from, to));

  const workerIds = (nominations ?? []).map((n) => n.worker_id as string);
  const [requiredSkills, requiredQuals] = await Promise.all([
    requiredSkillIdsFor(demandLineId),
    requiredQualificationIdsFor(demandLineId),
  ]);

  let skillsHeld = 0;
  const coverage: { name: string; heldBy: number; of: number }[] = [];

  if (workerIds.length > 0) {
    if (requiredSkills.length > 0) {
      const skillRows = await readMatchingRowsForIds(workerIds, (ids, from, to) => admin
        .from("worker_skill")
        .select("skill_id", { count: "exact" })
        .in("worker_id", ids).order("worker_id").order("skill_id").range(from, to));
      skillsHeld = new Set(skillRows.map((r) => r.skill_id as string).filter((id) => requiredSkills.includes(id))).size;
    }
    if (requiredQuals.length > 0) {
      const qualRows = await readMatchingRowsForIds(workerIds, (ids, from, to) => admin
        .from("worker_qualification")
        .select("worker_id, qualification_id, expiry_date, status, qualification:qualification_id (name)", { count: "exact" })
        .in("worker_id", ids).order("id").range(from, to));
      for (const id of requiredQuals) {
        const qualifications = qualRows.filter((r) => r.qualification_id === id);
        const holders = workerIds.filter((workerId) => {
          const current = effectiveQualification(qualifications.filter((r) => r.worker_id === workerId), id, today());
          return current && current.status !== "Expired" &&
            (typeof current.expiry_date !== "string" || current.expiry_date >= today());
        });
        const name =
          (one<Row>(qualifications[0]?.qualification as Row | Row[] | undefined)?.name as string) ?? "Ticket";
        coverage.push({
          name,
          heldBy: holders.length,
          of: workerIds.length,
        });
      }
    }
  }

  const hours = num(row.hours_per_week);
  const days = inclusiveDayCount(row.engagement_start as string, row.engagement_end as string);
  const expected = Math.floor((hours * days) / 7 + 0.5);
  const count = num(row.nominated_count) || num(row.requested_quantity);

  return {
    id: row.id as string,
    status: row.status as MatchStatus,
    requestedQuantity: num(row.requested_quantity),
    nominatedCount: num(row.nominated_count),
    nominationVersion: num(row.nomination_version),
    engagementStart: row.engagement_start as string,
    engagementEnd: row.engagement_end as string,
    hoursPerWeek: hours,
    buyerRateCents: num(row.buyer_rate_cents),
    proposedAt: row.proposed_at as string,
    demandLineId,
    requestName: (one<Row>(line?.request as Row | Row[] | undefined)?.name as string) ?? "Requirement",
    tradeName: (one<Row>(line?.trade as Row | Row[] | undefined)?.name as string) ?? "—",
    proficiencyName: (one<Row>(line?.proficiency as Row | Row[] | undefined)?.name as string) ?? "—",
    skillsHeld,
    skillsRequired: requiredSkills.length,
    qualificationCoverage: coverage,
    expectedHours: expected,
    estimatedBuyerValueCents: num(row.buyer_rate_cents) * expected * count,
  };
}

/* ------------------------------------------------------- 13.x engagement reads -- */

export type PartyEngagementView = {
  id: string;
  status: string;
  /** Identity disclosure follows the immutable commercial marker, never lifecycle status. */
  revealed: boolean;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
  rateCents: number;
  expectedHours: number;
  estimatedValueCents: number;
  paymentStatus: string;
  actualHours: number | null;
  completedAt: string | null;
  counterpartyName: string | null;
  tradeName: string;
  proficiencyName: string;
  /** 12.5 — names are revealed only after the commercial marker is recorded. */
  workers: string[];
  /** Site-access facts only: never worker contact information or document paths. */
  workerTickets: {
    name: string;
    /** Historical capture time, not a current compliance-verification timestamp. */
    capturedAt: string | null;
    tickets: { name: string; number: string | null; issueDate: string | null; expiryDate: string | null; status: string }[];
  }[];
  overdue: boolean;
};

export async function partyEngagements(role: "buyer" | "supplier"): Promise<PartyEngagementView[]> {
  const supabase = await createClient();
  const view = role === "buyer" ? "buyer_engagement_view" : "supplier_engagement_view";
  const rows = await readMatchingRows((from, to) => supabase.from(view).select("*", { count: "exact" })
    .order("start_date", { ascending: false }).order("id").range(from, to));
  const engagements: PartyEngagementView[] = [];
  for (let offset = 0; offset < rows.length; offset += 10) {
    engagements.push(...await Promise.all(rows.slice(offset, offset + 10).map((row) => enrichEngagement(row, role, supabase))));
  }
  return engagements;
}

export async function partyEngagement(
  id: string,
  role: "buyer" | "supplier",
): Promise<PartyEngagementView | null> {
  const supabase = await createClient();
  const view = role === "buyer" ? "buyer_engagement_view" : "supplier_engagement_view";
  const { data, error } = await supabase.from(view).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Engagement access could not be checked. Refresh and try again.");
  if (!data) return null;
  return enrichEngagement(data as Row, role, supabase);
}

/** Never fall back to a live profile, including when the worker later returns to
 * the same employer. A new employer's facts cannot reconstruct this history. */
function historicalWorkerProfile(row: Row): PartyEngagementView["workerTickets"][number] {
  const unavailable = { name: "Historical worker details unavailable", tickets: [], capturedAt: null };
  const snapshot = row.profile_snapshot;
  const capturedAt = row.profile_snapshot_captured_at;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
      || typeof capturedAt !== "string" || !Number.isFinite(Date.parse(capturedAt))) return unavailable;
  const profile = snapshot as Row;
  if (typeof profile.name !== "string" || !profile.name.trim() || !Array.isArray(profile.tickets)) return unavailable;
  const tickets: PartyEngagementView["workerTickets"][number]["tickets"] = [];
  for (const value of profile.tickets) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable;
    const ticket = value as Row;
    if (typeof ticket.name !== "string" || !ticket.name.trim()
        || (ticket.number !== null && typeof ticket.number !== "string")
        || (ticket.issueDate !== null && (typeof ticket.issueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ticket.issueDate)))
        || (ticket.expiryDate !== null && (typeof ticket.expiryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ticket.expiryDate)))
        || typeof ticket.status !== "string" || !["Current", "Expiring Soon", "Expired"].includes(ticket.status)) return unavailable;
    // Explicit projection protects the response even if future snapshot versions
    // add internal fields. Do not spread database JSON into a party-facing DTO.
    tickets.push({ name: ticket.name, number: ticket.number as string | null,
      issueDate: ticket.issueDate as string | null, expiryDate: ticket.expiryDate as string | null, status: ticket.status });
  }
  return { name: profile.name, tickets, capturedAt };
}

async function enrichEngagement(
  row: Row, role: "buyer" | "supplier", supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<PartyEngagementView> {
  const admin = createAdminClient();
  const status = row.status as string;
  const revealed = row.commercial_confirmed_at != null;

  const { data: engagement, error: engagementError } = await admin
    .from("engagement")
    .select("id, trade:trade_role_id (name), proficiency:proficiency_id (name)")
    .eq("id", row.id as string)
    .maybeSingle();
  if (engagementError) throw new Error("Engagement details could not be loaded. Refresh and try again.");

  let counterpartyName: string | null = null;
  const counterpartyId = (row.supplier_company_id as string) ?? (row.buyer_company_id as string) ?? null;
  if (revealed && counterpartyId) {
    const { data: company, error: companyError } = await admin
      .from("company")
      .select("legal_name, trading_name")
      .eq("id", counterpartyId)
      .maybeSingle();
    if (companyError) throw new Error("Engagement company details could not be loaded. Refresh and try again.");
    counterpartyName = (company?.trading_name as string) || (company?.legal_name as string) || null;
  }

  // 12.5 / 17.1 / 17.2 — an engagement grants access to its immutable historical
  // crew, never to a transferred worker's live profile. Query the database-gated
  // snapshot projection under the caller's session, not the service role. The
  // supplier sees recorded crew throughout; buyer access requires the marker.
  let workers: string[] = [];
  let workerTickets: PartyEngagementView["workerTickets"] = [];
  if (role === "supplier" || revealed) {
    const rows = await readMatchingRows((from, to) => supabase
      .from("engagement_worker_profile_view")
      .select("id, profile_snapshot, profile_snapshot_captured_at", { count: "exact" })
      .eq("engagement_id", row.id as string).order("id").range(from, to));
    workerTickets = rows.map(historicalWorkerProfile);
    workers = workerTickets.map((worker) => worker.name);
  }

  return {
    id: row.id as string,
    status,
    revealed,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    hoursPerWeek: num(row.hours_per_week),
    rateCents: num(role === "buyer" ? row.buyer_rate_cents : row.supplier_rate_cents),
    expectedHours: num(row.expected_hours),
    estimatedValueCents: num(
      role === "buyer" ? row.estimated_buyer_value_cents : row.estimated_supplier_value_cents,
    ),
    paymentStatus: row.payment_status as string,
    actualHours: row.actual_hours === null || row.actual_hours === undefined ? null : num(row.actual_hours),
    completedAt: (row.completed_at as string) ?? null,
    counterpartyName,
    tradeName: (one<Row>(engagement?.trade as Row | Row[] | undefined)?.name as string) ?? "—",
    proficiencyName:
      (one<Row>(engagement?.proficiency as Row | Row[] | undefined)?.name as string) ?? "—",
    workers,
    workerTickets,
    // 13.2 — still Awaiting Commercial at its start date.
    overdue: status === "Awaiting Commercial" && (row.start_date as string) <= today(),
  };
}

/* ------------------------------------------- 12.2 / 12.3 nomination eligibility -- */

export type MatchRow = {
  id: string;
  nomination_version: number;
  demand_line_id: string;
  supplier_company_id: string;
  buyer_company_id: string;
  capacity_line_id: string;
  requested_quantity: number;
  engagement_start: string;
  engagement_end: string;
  hours_per_week: number;
  supplier_rate_cents: number;
  fee_bp: number;
  buyer_rate_cents: number;
  status: MatchStatus;
  qualification_override_by: string | null;
  evidence_note: string | null;
};

export async function loadMatchRow(id: string): Promise<MatchRow | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("match").select("*").eq("id", id).maybeSingle();
  return (data as MatchRow) ?? null;
}

export type NominationFailure = { workerId: string; reason: string };

/**
 * 12.3 — every nomination is re-checked server-side at nomination time AND again at
 * buyer acceptance, rejecting only for 11.1 Excluded-class criteria or a
 * committing-status overlap with the match's engagement window. Soft-holds never
 * cause rejection: a soft-held nomination stands until a competing engagement enters
 * a committing status, at which point 12.7 knocks it out.
 *
 * One implementation, two callers: the action that writes the nominations and the
 * screen that shows the supplying business which of its crew it may nominate. A
 * second copy of this logic is a second answer to a legal question.
 */
export async function checkNominations(
  match: MatchRow,
  workerIds: string[],
): Promise<NominationFailure[]> {
  if (workerIds.length === 0) return [];
  const { data, error } = await createAdminClient().rpc("check_match_nominations", {
    p_match_id: match.id,
    p_worker_ids: workerIds,
    p_effective_date: today(),
  });
  if (error || !Array.isArray(data)) throw new Error("Nomination availability could not be checked.");
  return data.map((row: { worker_id: string; reason: string }) => ({
    workerId: row.worker_id,
    reason: row.reason,
  }));
}

export type NominationPoolEntry = {
  workerId: string;
  name: string;
  nominated: boolean;
  blocked: boolean;
  reason: string | null;
  /** 12.2 — a soft-hold warns; it never blocks. */
  softHeld: boolean;
};

/**
 * 12.2 — the crew the supplying business may nominate for one match: the workers on
 * the match's own capacity line, each with the reason it may not be nominated, if any.
 * The buyer never reaches this function; Maintain reaches it only to relay a decision
 * under 16.1.
 */
export async function nominationPool(matchId: string): Promise<NominationPoolEntry[]> {
  const admin = createAdminClient();
  const match = await loadMatchRow(matchId);
  if (!match) return [];

  const { data: members } = await admin
    .from("capacity_line_worker")
    .select("worker_id, worker:worker_id (first_name, last_name)")
    .eq("capacity_line_id", match.capacity_line_id);

  const workerIds = (members ?? []).map((m) => m.worker_id as string);
  if (workerIds.length === 0) return [];

  const [failures, { data: nominations }, { data: holds }] = await Promise.all([
    checkNominations(match, workerIds),
    admin.from("match_worker").select("worker_id").eq("match_id", matchId).eq("knocked_out", false),
    admin
      .from("match_worker")
      .select("worker_id, match_id, match:match_id (status, engagement_start, engagement_end)")
      .in("worker_id", workerIds)
      .eq("knocked_out", false),
  ]);

  const failureByWorker = new Map(failures.map((f) => [f.workerId, f.reason]));
  const nominated = new Set((nominations ?? []).map((n) => n.worker_id as string));

  const softHeld = new Set<string>();
  for (const row of holds ?? []) {
    if ((row.match_id as string) === matchId) continue;
    const other = one<Row>(row.match as Row | Row[]);
    if (!other) continue;
    if (!OPEN_MATCH_STATUSES.includes(other.status as MatchStatus)) continue;
    if (
      overlaps(
        { start: other.engagement_start as string, end: other.engagement_end as string },
        { start: match.engagement_start, end: match.engagement_end },
      )
    ) {
      softHeld.add(row.worker_id as string);
    }
  }

  return (members ?? []).map((m) => {
    const worker = one<Row>(m.worker as Row | Row[]);
    const workerId = m.worker_id as string;
    return {
      workerId,
      name: `${(worker?.first_name as string) ?? ""} ${(worker?.last_name as string) ?? ""}`.trim(),
      nominated: nominated.has(workerId),
      blocked: failureByWorker.has(workerId),
      reason: failureByWorker.get(workerId) ?? null,
      softHeld: softHeld.has(workerId),
    };
  });
}

function inclusiveDayCount(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export { isCommitting };
