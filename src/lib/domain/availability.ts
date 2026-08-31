// Availability arithmetic — spec module 21, and the candidate display classes of 11.1.
// Dates here are calendar dates in Australia/Brisbane held as YYYY-MM-DD strings (20.5).
// No timezone maths: a DATE is a day on a site calendar, not an instant.

export type DateRange = { start: string; end: string }; // inclusive both ends

export type CandidateClass = "Excluded" | "Greyed" | "Eligible";

/** 13.0 — the statuses that consume worker capacity everywhere capacity is counted. */
export const COMMITTING_STATUSES = ["Awaiting Commercial", "Confirmed", "Active"] as const;
export type CommittingStatus = (typeof COMMITTING_STATUSES)[number];

export function isCommitting(status: string): boolean {
  return (COMMITTING_STATUSES as readonly string[]).includes(status);
}

/**
 * A DATE input is only valid when it is both ISO-shaped and a real calendar date.
 * Date.parse normalises values such as 2026-02-30 into March, so the round trip is
 * deliberate: impossible form input must not silently become a different date.
 */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** A form-facing guard that must run before any duration-based hours calculation. */
export function dateRangeProblem(range: DateRange): string | null {
  if (!isCalendarDate(range.start) || !isCalendarDate(range.end)) {
    return "Give valid start and end dates.";
  }
  if (range.end < range.start) return "The window ends before it starts.";
  return null;
}

/** Inclusive day count, the unit every window calculation in the spec uses. */
export function inclusiveDays(range: DateRange): number {
  const start = Date.parse(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function intersect(a: DateRange, b: DateRange): DateRange | null {
  if (!overlaps(a, b)) return null;
  return {
    start: a.start > b.start ? a.start : b.start,
    end: a.end < b.end ? a.end : b.end,
  };
}

/** Every date in a range, as YYYY-MM-DD. Windows are days, not weeks — 21.2 counts days. */
export function daysIn(range: DateRange): string[] {
  const out: string[] = [];
  const total = inclusiveDays(range);
  const start = Date.parse(`${range.start}T00:00:00Z`);
  for (let i = 0; i < total; i++) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export type CapacityWindow = {
  range: DateRange;
  hoursPerWeek: number;
  /**
   * 21.2 — commit status never removes a line from the union. A Fully Committed
   * line still contributes its days; what removes a day is consumption below.
   */
  status: "Open" | "Partially Committed" | "Fully Committed" | "Withdrawn" | "Expired";
};

/**
 * 21.2 — availability is computed per worker.
 *
 * The worker's availability window is the union of the windows of their capacity lines
 * in {Open, Partially Committed, Fully Committed} that intersect the demand window.
 * Availability % = days of the demand window covered by that union, minus days within
 * the union consumed by committing engagements, ÷ total days of the demand window.
 * Engagement days outside the covered union are never subtracted.
 */
export function availability(input: {
  demand: DateRange;
  demandHoursPerWeek: number;
  lines: CapacityWindow[];
  committedRanges: DateRange[]; // committing engagements for this worker
}): { percent: number; hoursShortfall: boolean; coveredDays: number; totalDays: number } {
  const { demand, demandHoursPerWeek, lines, committedRanges } = input;
  const totalDays = inclusiveDays(demand);
  if (totalDays === 0) {
    return { percent: 0, hoursShortfall: false, coveredDays: 0, totalDays: 0 };
  }

  const usable = lines.filter(
    (l) => l.status !== "Withdrawn" && l.status !== "Expired" && overlaps(l.range, demand),
  );

  // Day -> the best hours/week among lines covering it. A day covered by two lines
  // takes the higher figure; 9.4 forbids overlapping open lines, but Fully Committed
  // history can still overlap, and the worker is not less available for that.
  const coverage = new Map<string, number>();
  for (const line of usable) {
    const slice = intersect(line.range, demand);
    if (!slice) continue;
    for (const day of daysIn(slice)) {
      coverage.set(day, Math.max(coverage.get(day) ?? 0, line.hoursPerWeek));
    }
  }

  const consumed = new Set<string>();
  for (const committed of committedRanges) {
    const slice = intersect(committed, demand);
    if (!slice) continue;
    for (const day of daysIn(slice)) {
      // Only days inside the covered union are subtracted (21.2).
      if (coverage.has(day)) consumed.add(day);
    }
  }

  const freeDays = [...coverage.keys()].filter((d) => !consumed.has(d));
  const coveredDays = freeDays.length;
  const percent = Math.round((coveredDays / totalDays) * 100);

  // 21.2 — 100% requires full coverage AND, for each covered day, hours/week >= demand.
  const hoursShortfall = freeDays.some((d) => (coverage.get(d) ?? 0) < demandHoursPerWeek);

  return { percent, hoursShortfall, coveredDays, totalDays };
}

/**
 * 11.1 — the three display classes, computed server-side.
 * Excluded is never shown; Greyed is selectable only with an audited admin override;
 * Eligible is everything else.
 */
export function classifyCandidate(input: {
  tradeMatches: boolean;
  proficiencyRank: number;
  demandProficiencyRank: number;
  includeHigherProficiency: boolean;
  regionCovered: boolean;
  workerStatusActive: boolean;
  employerActiveAndCompliant: boolean;
  requiredQualificationExpired: boolean;
  requiredQualificationExpiresBeforeStart: boolean;
  requiredQualificationExpiresInWindow: boolean;
  availabilityPercent: number;
  softHeldElsewhere: boolean;
  partialCommittingConflict: boolean;
}): { klass: CandidateClass; reasons: string[] } {
  const reasons: string[] = [];

  if (!input.tradeMatches) reasons.push("trade mismatch");
  if (input.proficiencyRank < input.demandProficiencyRank) {
    reasons.push("proficiency below the demand level");
  }
  if (input.proficiencyRank > input.demandProficiencyRank && !input.includeHigherProficiency) {
    reasons.push("higher proficiency excluded by the toggle");
  }
  if (!input.regionCovered) reasons.push("work region not covered");
  if (!input.workerStatusActive) reasons.push("worker not Active");
  if (!input.employerActiveAndCompliant) reasons.push("employing company not Active or non-compliant");
  if (input.requiredQualificationExpired) reasons.push("required qualification expired");
  if (input.requiredQualificationExpiresBeforeStart) {
    reasons.push("required qualification expires before the start date");
  }
  // 11.1 / 21.2 — availability 0% excludes, including the partial-coverage case.
  if (input.availabilityPercent === 0) reasons.push("no uncommitted covered day in the window");

  if (reasons.length > 0) return { klass: "Excluded", reasons };

  const greyReasons: string[] = [];
  if (input.softHeldElsewhere) greyReasons.push("nominated in another open match");
  if (input.partialCommittingConflict) greyReasons.push("partial conflict with a committed engagement");
  if (input.requiredQualificationExpiresInWindow) greyReasons.push("expires during engagement");

  if (greyReasons.length > 0) return { klass: "Greyed", reasons: greyReasons };
  return { klass: "Eligible", reasons: [] };
}

/**
 * 8.3 — business days are Monday–Friday excluding Queensland public holidays,
 * which come from the seeded public_holiday table rather than a library.
 */
export function addBusinessDays(from: string, days: number, holidays: Set<string>): string {
  let cursor = Date.parse(`${from}T00:00:00Z`);
  let remaining = days;
  while (remaining > 0) {
    cursor += 86_400_000;
    const iso = new Date(cursor).toISOString().slice(0, 10);
    const weekday = new Date(cursor).getUTCDay(); // 0 Sun, 6 Sat
    if (weekday !== 0 && weekday !== 6 && !holidays.has(iso)) remaining--;
  }
  return new Date(cursor).toISOString().slice(0, 10);
}
