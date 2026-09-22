import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/admin-page";
import { Icon } from "@/components/icon";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCommitting } from "@/lib/domain/availability";
import { formatCentsExGst } from "@/lib/domain/money";
import { brisbaneToday } from "@/lib/cron";
import { LABEL, NAV_FOCUS, PANEL } from "@/lib/ui";
import { formatDate } from "@/lib/platform-ui";
import { collectReportPages } from "@/lib/admin-reporting";
import { cn } from "@/lib/utils";

// Maintain marketplace dashboard — spec 14.2.
//
// Basic figures only: supply, demand, matches, engagements, and four marketplace
// totals. Explicitly not an analytics platform — 14.3's CSV exports are the only
// reporting facility in MVP, and every number here is a count or a sum of frozen
// estimates.
//
// The aggregation happens in TypeScript over modest row sets rather than in SQL views:
// year-one volumes are ≤200 companies, ≤5,000 workers and ≤500 open lines (11.5), and a
// readable derivation that matches the spec's own arithmetic beats a clever query.
//
// Layout: a ledger, not a card grid. Supply sits beside demand because that gap is
// the marketplace; the proposals waiting on a party sit beside it; the commercial
// book and the cumulative totals run underneath as hairline-divided figures.
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
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Marketplace"
        lead="Supply against demand, what is waiting on a party, and what is on the books. Every figure is derived at read time — nothing here is a stored counter that can drift."
        meta={
          <>
            <span>As at {formatDate(today)}</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>Australia/Brisbane</span>
          </>
        }
      />

      <div className="grid gap-(--space-5) lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel step={0}>
          <SectionHeader
            title="Supply against demand"
            hint="Open capacity covering today, beside the requirement lines still seeking crew."
            actions={<PanelLink href="/admin/matching">Open matching</PanelLink>}
          />
          <div className="mt-(--space-5) grid gap-x-(--space-8) gap-y-(--space-6) sm:grid-cols-2">
            <Ledger heading="Supply">
              <Row label="Available crew" value={availableWorkers.size} note="Not committed today" />
              <Row label="Available hours" value={Math.round(availableHoursPerWeek)} note="Per week across open lines" />
              <Row label="Upcoming capacity" value={upcomingLines} note="Lines opening later" />
            </Ledger>
            <Ledger heading="Demand">
              <Row label="Open requirements" value={demandRows.length} note="Lines seeking crew" />
              <Row label="Crew required" value={requiredWorkers} note="Across those lines" />
              <Row label="Hours required" value={Math.round(requiredHoursPerWeek)} note="Per week across those lines" />
              <Row label="Unfilled demand" value={unfilledDemand} note="Requested minus filled, per 10.3" />
            </Ledger>
          </div>
        </Panel>

        <Panel step={1}>
          <SectionHeader
            title="Waiting on a party"
            hint="Proposals in flight, and declines on lines that still need crew."
            actions={<PanelLink href="/admin/matching">Matching</PanelLink>}
          />
          <ul className="mt-(--space-4) divide-y divide-hairline">
            <Row label="Awaiting supplier" value={awaitingSupplier} note="Proposed, not yet answered" />
            <Row label="Awaiting buyer" value={awaitingBuyer} note="Supplier accepted and nominated" />
            <Row label="Declined, needs attention" value={declinedNeedingAttention} note="Requirement still open" />
          </ul>
        </Panel>
      </div>

      <Panel step={2}>
        <SectionHeader
          title="Engagements"
          hint="The commercial book. Overdue is a start date reached without the commercial trigger."
          actions={<PanelLink href="/admin/engagements">Open the register</PanelLink>}
        />
        <Figures className="mt-(--space-5) grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Figure
            label="Awaiting commercial"
            value={awaitingCommercial.length}
            note="Pre-authorisation not yet recorded"
            href="/admin/engagements?status=Awaiting%20Commercial"
          />
          <Figure
            label="Overdue"
            value={overdue}
            note="Start date reached without the trigger"
            href="/admin/engagements?timing=overdue"
            emphasis
          />
          <Figure label="Confirmed" value={confirmed.length} note="Commercial trigger recorded" href="/admin/engagements?status=Confirmed" />
          <Figure label="Upcoming" value={upcoming} note="Confirmed, starting after today" href="/admin/engagements?timing=upcoming" />
          <Figure label="Active" value={active} note="On site now" href="/admin/engagements?status=Active" />
          <Figure label="Completed" value={completed} note="Finished, outcome recorded" href="/admin/engagements?status=Completed" />
        </Figures>
      </Panel>

      <Panel step={3}>
        <SectionHeader
          title="Marketplace"
          hint="Cumulative. Estimates are ex GST and frozen at engagement creation."
          actions={<PanelLink href="/admin/companies">Companies</PanelLink>}
        />
        <Figures className="mt-(--space-5) grid-cols-2 lg:grid-cols-4">
          <Figure label="Active companies" value={companies.count ?? 0} note="Verified and trading" />
          <Figure label="Crew on the platform" value={workers.count ?? 0} note="All company records" />
          <Figure label="Estimated transaction value" value={formatCentsExGst(transactionValue)} note="Frozen at engagement creation" compact />
          <Figure label="Estimated Maintain revenue" value={formatCentsExGst(maintainRevenue)} note="Buyer value less supplier value" compact />
        </Figures>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces ---- */

/** The page's one authored entrance: panels rise in order, 90ms apart. */
function Panel({ step, children }: { step: number; children: ReactNode }) {
  return (
    <section className={`${PANEL} mw-enter p-(--space-5)`} style={{ "--enter-step": step } as CSSProperties}>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`mw-cta inline-flex min-h-11 items-center gap-(--space-2) text-sm font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark ${NAV_FOCUS}`}
    >
      {children}
      <Icon name="i-arrow-right" className="size-4" />
    </Link>
  );
}

function Ledger({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <p className={`${LABEL} border-b border-hairline pb-(--space-2)`}>{heading}</p>
      <ul className="divide-y divide-hairline">{children}</ul>
    </div>
  );
}

/** A ledger line: label and note on the left, the figure set against the right edge. */
function Row({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-4) py-(--space-3)">
      <p className="text-sm font-semibold text-on-dark">{label}</p>
      <p className="row-span-2 font-display text-h3 font-extrabold leading-none tracking-(--tracking-tight) text-on-dark tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-on-dark-faint">{note}</p>
    </li>
  );
}

/** Hairline-divided figure tiles: one panel, not a card per number. */
function Figures({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-(--radius-md) border border-hairline bg-hairline", className)}>
      {children}
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  href,
  emphasis,
  compact,
}: {
  label: string;
  value: number | string;
  note: string;
  href?: string;
  emphasis?: boolean;
  compact?: boolean;
}) {
  const body = (
    <>
      <p className={LABEL}>{label}</p>
      <p
        className={cn(
          "mt-(--space-2) font-display font-extrabold leading-none tracking-(--tracking-display) tabular-nums [overflow-wrap:anywhere]",
          compact ? "text-h3" : "text-h2",
          emphasis && typeof value === "number" && value > 0 ? "text-primary" : "text-on-dark",
        )}
      >
        {value}
      </p>
      <p className="mt-(--space-2) text-xs text-on-dark-faint">{note}</p>
    </>
  );
  const cell = "flex min-w-0 flex-col bg-black-2 p-(--space-4)";
  return href ? (
    <Link
      href={href}
      className={cn(cell, "transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-dark")}
    >
      {body}
    </Link>
  ) : (
    <div className={cell}>{body}</div>
  );
}
