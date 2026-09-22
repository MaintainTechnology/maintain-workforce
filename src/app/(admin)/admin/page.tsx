import type { Metadata } from "next";
import { AdminDashboardOverview } from "@/components/admin-dashboard-overview";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCommitting } from "@/lib/domain/availability";
import { brisbaneToday } from "@/lib/cron";
import { collectReportPages } from "@/lib/admin-reporting";

// Maintain marketplace dashboard — spec 14.2.
//
// Operational overview: supply, demand, matches, engagements and marketplace totals.
// Explicitly not an analytics platform — 14.3's CSV exports are the only reporting
// facility in MVP, and every number here is a count or a sum of frozen estimates.
//
// The aggregation happens in TypeScript over modest row sets rather than in SQL views:
// year-one volumes are ≤200 companies, ≤5,000 workers and ≤500 open lines (11.5), and a
// readable derivation that matches the spec's own arithmetic beats a clever query.
//
// The overview prioritises overdue engagements, pending approvals, then matching.
// Read failures reach the route error boundary so an incomplete queue never appears clear.

export const metadata: Metadata = { title: "Admin dashboard" };

const OPEN_CAPACITY = ["Open", "Partially Committed"];
const OPEN_DEMAND = ["Open", "Partially Filled"];

type CapacityRow = {
  id: string; status: string; available_from: string; available_until: string;
  hours_per_week: number; capacity_line_worker: { worker_id: string }[] | null;
};
type DemandRow = {
  id: string; status: string; quantity: number; hours_per_week: number;
  start_date: string; end_date: string;
};
type MatchRow = {
  id: string; status: string;
  demand_line: { status: string } | { status: string }[] | null;
};
type EngagementRow = {
  id: string; status: string; demand_line_id: string; start_date: string; end_date: string;
  estimated_buyer_value_cents: number; estimated_maintain_revenue_cents: number;
  engagement_worker: { worker_id: string }[] | null;
};

/** PostgREST returns an embedded to-one relation as an object; the client's inference
 *  cannot prove that without generated types, so both shapes are normalised here. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MarketplaceDashboard() {
  await requireMaintainAdmin();
  const today = brisbaneToday();
  const db = createAdminClient();

  // Historical matches and engagements can exceed the API row cap. Use the same
  // counted pagination as CSV reports; incomplete or failed reads reach the route
  // error boundary instead of producing a partial total or a reassuring zero.
  const [capacityRows, demandRows, matchRows, engagementRows, companies, workers, pendingCompanies] = await Promise.all([
    collectReportPages<CapacityRow>((from, to) => db
      .from("capacity_line")
      .select("id, status, available_from, available_until, hours_per_week, capacity_line_worker (worker_id)", { count: "exact" })
      .in("status", OPEN_CAPACITY).order("id").range(from, to), "Dashboard capacity"),
    collectReportPages<DemandRow>((from, to) => db
      .from("demand_line")
      .select("id, status, quantity, hours_per_week, start_date, end_date", { count: "exact" })
      .in("status", OPEN_DEMAND).order("id").range(from, to), "Dashboard requirements"),
    collectReportPages<MatchRow>((from, to) => db.from("match")
      .select("id, status, demand_line:demand_line_id (status)", { count: "exact" })
      .order("id").range(from, to), "Dashboard matches"),
    collectReportPages<EngagementRow>((from, to) => db
      .from("engagement")
      .select("id, status, demand_line_id, start_date, end_date, estimated_buyer_value_cents, estimated_maintain_revenue_cents, engagement_worker (worker_id)", { count: "exact" })
      .order("id").range(from, to), "Dashboard engagements"),
    db.from("company").select("id", { count: "exact", head: true }).eq("status", "Active"),
    db.from("worker").select("id", { count: "exact", head: true }),
    db.from("company").select("id", { count: "exact", head: true }).eq("status", "Pending"),
  ]);

  if (companies.error || workers.error || pendingCompanies.error
    || companies.count === null || workers.count === null || pendingCompanies.count === null) {
    throw new Error("Marketplace totals could not be loaded. Please retry.");
  }

  /* -- SUPPLY (9.5, 21.2) --------------------------------------------------------- */
  // A worker deployed today is one on a committing engagement covering today (13.0).
  const deployedToday = new Set<string>();
  for (const e of engagementRows) {
    if (!isCommitting(e.status)) continue;
    if (e.start_date > today || e.end_date < today) continue;
    for (const row of e.engagement_worker ?? []) deployedToday.add(row.worker_id);
  }

  const availableWorkers = new Set<string>();
  let availableHoursPerWeek = 0;
  let upcomingLines = 0;
  for (const line of capacityRows) {
    const attached = ((line.capacity_line_worker ?? []) as { worker_id: string }[]).map(
      (w) => w.worker_id,
    );
    if (line.available_from > today) {
      upcomingLines += 1; // capacity opening later — not available now, but committed to
      continue;
    }
    if (line.available_until < today) continue;
    const free = attached.filter((id) => !deployedToday.has(id));
    for (const id of free) availableWorkers.add(id);
    availableHoursPerWeek += Number(line.hours_per_week) * free.length;
  }

  /* -- DEMAND (10.3) --------------------------------------------------------------- */
  // quantity_filled counts DISTINCT workers on committing engagements for the line: a
  // worker covering a line through sequential engagements occupies one slot.
  const filledByLine = new Map<string, Set<string>>();
  for (const e of engagementRows) {
    if (!isCommitting(e.status)) continue;
    const set = filledByLine.get(e.demand_line_id) ?? new Set<string>();
    for (const row of e.engagement_worker ?? []) set.add(row.worker_id);
    filledByLine.set(e.demand_line_id, set);
  }

  let requiredWorkers = 0;
  let requiredHoursPerWeek = 0;
  let unfilledDemand = 0;
  for (const line of demandRows) {
    requiredWorkers += line.quantity;
    requiredHoursPerWeek += Number(line.hours_per_week) * line.quantity;
    const filled = filledByLine.get(line.id)?.size ?? 0;
    unfilledDemand += Math.max(0, line.quantity - filled);
  }

  /* -- MATCHES (12.1) -------------------------------------------------------------- */
  const awaitingSupplier = matchRows.filter((m) => m.status === "Awaiting Supplier").length;
  const awaitingBuyer = matchRows.filter((m) => m.status === "Awaiting Buyer").length;
  // 12.6 — a declined match returns to the matching workspace. It needs attention only
  // while its requirement is still seeking crew.
  const declinedNeedingAttention = matchRows.filter((m) => {
    const line = one(m.demand_line);
    return m.status === "Declined" && line !== null && OPEN_DEMAND.includes(line.status);
  }).length;

  /* -- ENGAGEMENTS (13.2) ---------------------------------------------------------- */
  const awaitingCommercial = engagementRows.filter((e) => e.status === "Awaiting Commercial");
  // 13.2 — still Awaiting Commercial at its start date: flagged Overdue, and it cannot
  // become Active until the trigger is recorded or Maintain cancels it.
  const overdue = awaitingCommercial.filter((e) => e.start_date <= today).length;
  const confirmed = engagementRows.filter((e) => e.status === "Confirmed");
  // "Upcoming" is not a status but a filter: Confirmed with a start date in the future.
  const upcoming = confirmed.filter((e) => e.start_date > today).length;
  const active = engagementRows.filter((e) => e.status === "Active").length;
  const completed = engagementRows.filter((e) => e.status === "Completed").length;

  /* -- MARKETPLACE (20.3 estimates, frozen at engagement creation) ------------------ */
  const banked = engagementRows.filter((e) => e.status !== "Cancelled");
  const transactionValue = banked.reduce((sum, e) => sum + (e.estimated_buyer_value_cents ?? 0), 0);
  const maintainRevenue = banked.reduce(
    (sum, e) => sum + (e.estimated_maintain_revenue_cents ?? 0),
    0,
  );

  return (
    <AdminDashboardOverview
      today={today}
      metrics={{
        activeCompanies: companies.count,
        pendingCompanies: pendingCompanies.count,
        workers: workers.count,
        availableWorkers: availableWorkers.size,
        availableHoursPerWeek: Math.round(availableHoursPerWeek),
        upcomingCapacity: upcomingLines,
        openRequirements: demandRows.length,
        requiredWorkers,
        requiredHoursPerWeek: Math.round(requiredHoursPerWeek),
        unfilledDemand,
        awaitingSupplier,
        awaitingBuyer,
        declinedNeedingAttention,
        awaitingCommercial: awaitingCommercial.length,
        overdue,
        confirmed: confirmed.length,
        upcoming,
        active,
        completed,
        transactionValue,
        maintainRevenue,
      }}
    />
  );
}
