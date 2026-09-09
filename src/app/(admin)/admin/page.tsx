import type { Metadata } from "next";
import Link from "next/link";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCommitting } from "@/lib/domain/availability";
import { formatCentsExGst } from "@/lib/domain/money";
import { brisbaneToday } from "@/lib/cron";
import { H1, H2, PANEL, LABEL } from "@/lib/ui";
import { MONO } from "@/lib/platform-ui";
import { collectReportPages } from "@/lib/admin-reporting";

// Maintain marketplace dashboard — spec 14.2.
//
// Basic cards only: supply, demand, matches, engagements, and four marketplace figures.
// Explicitly not an analytics platform — 14.3's CSV exports are the only reporting
// facility in MVP, and every number here is a count or a sum of frozen estimates.
//
// The aggregation happens in TypeScript over modest row sets rather than in SQL views:
// year-one volumes are ≤200 companies, ≤5,000 workers and ≤500 open lines (11.5), and a
// readable derivation that matches the spec's own arithmetic beats a clever query.
//
// Amber budget (DESIGN.md): one — the Overdue count. An engagement past its start date
// without the commercial trigger is the only number on this screen that means work may
// be about to start unpaid.

export const metadata: Metadata = { title: "Marketplace" };

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
  const [capacityRows, demandRows, matchRows, engagementRows, companies, workers] = await Promise.all([
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
  ]);

  if (companies.error || workers.error || companies.count === null || workers.count === null) {
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
    <div className="flex flex-col gap-(--space-7)">
      <header>
        <h1 className={H1}>Marketplace</h1>
        <p className="mt-(--space-3) max-w-[70ch] text-body-lg text-on-dark-muted">
          Supply against demand, what is waiting on a party, and what is on the books.
          Availability, fill and commit figures are derived at read time — nothing here is
          a stored counter that can drift.
        </p>
      </header>

      <Section title="Supply" href="/admin/matching" hint="Open capacity lines covering today">
        <Stat label="Available crew" value={availableWorkers.size} note="Not committed today" />
        <Stat
          label="Available hours"
          value={Math.round(availableHoursPerWeek)}
          note="Per week across open lines"
        />
        <Stat label="Upcoming capacity" value={upcomingLines} note="Lines opening later" />
      </Section>

      <Section title="Demand" href="/admin/matching" hint="Open and partially filled lines">
        <Stat label="Open requirements" value={demandRows.length} note="Lines seeking crew" />
        <Stat label="Crew required" value={requiredWorkers} note="Across those lines" />
        <Stat
          label="Hours required"
          value={Math.round(requiredHoursPerWeek)}
          note="Per week across those lines"
        />
        <Stat
          label="Unfilled demand"
          value={unfilledDemand}
          note="Requested minus filled, per 10.3"
        />
      </Section>

      <Section title="Matches" href="/admin/matching" hint="Proposals in flight">
        <Stat label="Awaiting supplier" value={awaitingSupplier} note="Proposed, not yet answered" />
        <Stat label="Awaiting buyer" value={awaitingBuyer} note="Supplier accepted and nominated" />
        <Stat
          label="Declined, needs attention"
          value={declinedNeedingAttention}
          note="Requirement still open"
        />
      </Section>

      <Section title="Engagements" href="/admin/engagements" hint="The commercial book">
        <Stat
          label="Awaiting commercial"
          value={awaitingCommercial.length}
          note="Pre-authorisation not yet recorded"
          href="/admin/engagements?status=Awaiting%20Commercial"
        />
        <Stat
          label="Overdue"
          value={overdue}
          note="Start date reached without the trigger"
          href="/admin/engagements?timing=overdue"
          emphasis
        />
        <Stat label="Confirmed" value={confirmed.length} note="Commercial trigger recorded" href="/admin/engagements?status=Confirmed" />
        <Stat label="Upcoming" value={upcoming} note="Confirmed, starting after today" href="/admin/engagements?timing=upcoming" />
        <Stat label="Active" value={active} note="On site now" href="/admin/engagements?status=Active" />
        <Stat label="Completed" value={completed} note="Finished, outcome recorded" href="/admin/engagements?status=Completed" />
      </Section>

      <Section title="Marketplace" href="/admin/companies" hint="Cumulative, estimates ex GST">
        <Stat label="Active companies" value={companies.count ?? 0} note="Verified and trading" />
        <Stat label="Crew on the platform" value={workers.count ?? 0} note="All company records" />
        <StatText
          label="Estimated transaction value"
          value={formatCentsExGst(transactionValue)}
          note="Frozen at engagement creation"
        />
        <StatText
          label="Estimated Maintain revenue"
          value={formatCentsExGst(maintainRevenue)}
          note="Buyer value less supplier value"
        />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces ---- */

function Section({
  title,
  hint,
  href,
  children,
}: {
  title: string;
  hint: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-(--space-3)">
        <h2 className={H2}>{title}</h2>
        <Link
          href={href}
          className="text-body font-semibold text-on-dark-muted underline underline-offset-4 hover:text-on-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark"
        >
          {hint}
        </Link>
      </div>
      <div className="mt-(--space-4) grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {children}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  emphasis,
  href,
}: {
  label: string;
  value: number;
  note: string;
  emphasis?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <p className={LABEL}>{label}</p>
      <p
        className={`${MONO} mt-(--space-3) text-h1 font-extrabold ${
          emphasis && value > 0 ? "text-primary" : "text-on-dark"
        }`}
      >
        {value}
      </p>
      <p className="mt-(--space-2) text-sm text-on-dark-muted">{note}</p>
    </>
  );
  return href ? (
    <Link href={href} className={`${PANEL} p-(--space-5) transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark`}>{body}</Link>
  ) : <div className={`${PANEL} p-(--space-5)`}>{body}</div>;
}

function StatText({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${PANEL} p-(--space-5)`}>
      <p className={LABEL}>{label}</p>
      <p className={`${MONO} mt-(--space-3) text-h3 font-extrabold text-on-dark`}>{value}</p>
      <p className="mt-(--space-2) text-sm text-on-dark-muted">{note}</p>
    </div>
  );
}
