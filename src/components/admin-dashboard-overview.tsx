import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, SectionHeader } from "@/components/admin-page";
import { Icon } from "@/components/icon";
import type { IconName } from "@/components/icon";
import { formatCentsExGst } from "@/lib/domain/money";
import { formatDate } from "@/lib/admin-ui";
import { BTN_GHOST_SM, BTN_PRIMARY, NAV_FOCUS, PANEL } from "@/lib/ui";

export type AdminDashboardMetrics = {
  activeCompanies: number;
  pendingCompanies: number;
  workers: number;
  availableWorkers: number;
  availableHoursPerWeek: number;
  upcomingCapacity: number;
  openRequirements: number;
  requiredWorkers: number;
  requiredHoursPerWeek: number;
  unfilledDemand: number;
  awaitingSupplier: number;
  awaitingBuyer: number;
  declinedNeedingAttention: number;
  awaitingCommercial: number;
  overdue: number;
  confirmed: number;
  upcoming: number;
  active: number;
  completed: number;
  transactionValue: number;
  maintainRevenue: number;
};

export function AdminDashboardOverview({ today, metrics }: {
  today: string;
  metrics: AdminDashboardMetrics;
}) {
  const nextAction = metrics.overdue > 0
    ? { href: "/admin/engagements?timing=overdue", label: "Review overdue work" }
    : metrics.pendingCompanies > 0
      ? { href: "/admin/verification", label: "Review account approvals" }
      : { href: "/admin/matching", label: "Open matching" };

  return (
    <div className="mw-dashboard flex min-w-0 flex-col gap-(--space-6) lg:gap-(--space-7)">
      <PageHeader
        title="Admin dashboard"
        lead="Manage the workforce exchange. Review accounts, connect crew with work, and keep engagements moving."
        actions={
          <Link href={nextAction.href} className={`${BTN_PRIMARY} px-(--space-4) text-sm sm:px-(--space-6)`}>
            {nextAction.label} <Icon name="i-arrow-right" />
          </Link>
        }
      />

      <div className="grid min-w-0 gap-(--space-5) xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section aria-labelledby="platform-today" className={`${PANEL} flex min-w-0 flex-col overflow-hidden`}>
          <div className="flex items-start justify-between gap-(--space-3) p-(--space-5) sm:p-(--space-6)">
            <div>
              <h2 id="platform-today" className="text-h3 font-bold tracking-(--tracking-tight)">Exchange today</h2>
              <p className="mt-(--space-2) text-sm text-on-dark-muted"><time dateTime={today}>{formatDate(today)}</time> · Brisbane</p>
            </div>
            <Icon name="i-network" className="size-6 shrink-0 text-teal-mist" />
          </div>
          <div className="grid grid-cols-1 px-(--space-5) min-[540px]:grid-cols-3 sm:px-(--space-6)">
            <Snapshot label="Active companies" value={metrics.activeCompanies} note="Approved to trade" href="/admin/companies?status=Active" />
            <Snapshot label="Crew on the platform" value={metrics.workers} note="All company records" href="/admin/workers" />
            <Snapshot label="Active engagements" value={metrics.active} note="Work underway" href="/admin/engagements?status=Active" />
          </div>
          <div className="mt-auto pt-(--space-5)">
            <div className="flex flex-wrap items-center justify-between gap-x-(--space-4) border-t border-hairline bg-ink-teal/40 px-(--space-5) py-(--space-3) sm:px-(--space-6)">
              <p className="text-sm text-on-dark-muted">Across all companies in the exchange.</p>
              <PanelLink href="/admin/companies">Manage companies</PanelLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="admin-attention" className="min-w-0 rounded-(--radius-lg) border border-hairline bg-ink-teal p-(--space-5) sm:p-(--space-6)">
          <h2 id="admin-attention" className="text-h3 font-bold tracking-(--tracking-tight)">Needs your attention</h2>
          <div className="mt-(--space-3) divide-y divide-hairline">
            <Attention
              href="/admin/engagements?timing=overdue"
              title="Commercial overdue"
              count={metrics.overdue}
              note={metrics.overdue ? "Start date reached. Record payment authorisation." : "No overdue payment authorisations."}
              icon="i-clipboard"
              urgent={metrics.overdue > 0}
            />
            <Attention
              href="/admin/verification"
              title="Account approvals"
              count={metrics.pendingCompanies}
              note={metrics.pendingCompanies ? "Review company details and approve access." : "No companies waiting for approval."}
              icon="i-shield"
            />
            <Attention
              href="/admin/matching"
              title="Crew positions to fill"
              count={metrics.unfilledDemand}
              note={metrics.declinedNeedingAttention > 0
                ? `${metrics.declinedNeedingAttention} declined ${metrics.declinedNeedingAttention === 1 ? "proposal needs" : "proposals need"} another look.`
                : metrics.unfilledDemand > 0 ? "Match available crew with open requirements." : "No unfilled crew positions."}
              icon="i-network"
            />
          </div>
        </section>
      </div>

      <div className="grid min-w-0 gap-(--space-5) xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className={`${PANEL} min-w-0 p-(--space-5) sm:p-(--space-6)`}>
          <SectionHeader
            title="Supply and demand"
            hint="Available crew and the work still seeking people."
            actions={<PanelLink href="/admin/matching">Open matching</PanelLink>}
          />
          <div className="mt-(--space-4) grid gap-x-(--space-6) gap-y-(--space-5) sm:grid-cols-2">
            <Ledger title="Supply">
              <Row label="Available crew" value={metrics.availableWorkers} note="Listed and uncommitted today" />
              <Row label="Available hours" value={metrics.availableHoursPerWeek} note="Per week across open lines" />
              <Row label="Upcoming capacity" value={metrics.upcomingCapacity} note="Lines opening later" />
            </Ledger>
            <Ledger title="Demand">
              <Row label="Open requirements" value={metrics.openRequirements} note="Lines seeking crew" />
              <Row label="Crew required" value={metrics.requiredWorkers} note="Across open requirements" />
              <Row label="Hours required" value={metrics.requiredHoursPerWeek} note="Per week across those lines" />
              <Row label="Unfilled demand" value={metrics.unfilledDemand} note="Crew positions still to fill" />
            </Ledger>
          </div>
        </section>

        <section className={`${PANEL} min-w-0 p-(--space-5) sm:p-(--space-6)`}>
          <SectionHeader title="Match progress" hint="Follow proposals through each decision." />
          <ul className="mt-(--space-4) divide-y divide-hairline">
            <Row label="Awaiting supplier" value={metrics.awaitingSupplier} note="Proposal awaiting a response" />
            <Row label="Awaiting buyer" value={metrics.awaitingBuyer} note="Supplier accepted and nominated crew" />
            <Row label="Declined, needs attention" value={metrics.declinedNeedingAttention} note="Requirement is still open" />
          </ul>
          <div className="mt-(--space-3) border-t border-hairline pt-(--space-2)">
            <PanelLink href="/admin/matching">Review matching</PanelLink>
          </div>
        </section>
      </div>

      <section className={`${PANEL} min-w-0 p-(--space-5) sm:p-(--space-6)`}>
        <SectionHeader
          title="Engagements"
          hint="Track agreed work from payment authorisation to completion."
          actions={<PanelLink href="/admin/engagements">View engagements</PanelLink>}
        />
        <div className="mt-(--space-5) grid grid-cols-1 gap-px overflow-hidden rounded-(--radius-md) border border-hairline bg-hairline min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Figure label="Awaiting commercial" value={metrics.awaitingCommercial} note="Payment authorisation pending" href="/admin/engagements?status=Awaiting%20Commercial" />
          <Figure label="Overdue" value={metrics.overdue} note="Start date reached, authorisation pending" href="/admin/engagements?timing=overdue" />
          <Figure label="Confirmed" value={metrics.confirmed} note="Payment authorisation recorded" href="/admin/engagements?status=Confirmed" />
          <Figure label="Upcoming" value={metrics.upcoming} note="Confirmed and starting after today" href="/admin/engagements?timing=upcoming" />
          <Figure label="Active" value={metrics.active} note="Work underway" href="/admin/engagements?status=Active" />
          <Figure label="Completed" value={metrics.completed} note="Work marked complete" href="/admin/engagements?status=Completed" />
        </div>
      </section>

      <section className={`${PANEL} min-w-0 p-(--space-5) sm:p-(--space-6)`}>
        <SectionHeader title="Commercial overview" hint="Cumulative estimates for all engagements except cancelled work." />
        <div className="mt-(--space-5) grid gap-(--space-5) sm:grid-cols-2">
          <Money label="Estimated transaction value" value={formatCentsExGst(metrics.transactionValue)} note="Buyer value agreed when work was created" />
          <Money label="Estimated Maintain revenue" value={formatCentsExGst(metrics.maintainRevenue)} note="Buyer value less supplier value" />
        </div>
        <div className="mt-(--space-6) flex flex-wrap items-center justify-between gap-(--space-3) border-t border-hairline pt-(--space-4)">
          <p className="text-sm text-on-dark-muted">Download reports as CSV</p>
          <div className="flex flex-wrap gap-(--space-2)">
            <a href="/admin/companies/export" download className={BTN_GHOST_SM}>Companies CSV</a>
            <a href="/admin/workers/export" download className={BTN_GHOST_SM}>Workers CSV</a>
            <a href="/admin/engagements/export" download className={BTN_GHOST_SM}>Engagements CSV</a>
          </div>
        </div>
      </section>
    </div>
  );
}

function Snapshot({ label, value, note, href }: { label: string; value: number; note: string; href: string }) {
  return (
    <Link href={href} className={`group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-3) border-b border-hairline py-(--space-4) last:border-0 min-[540px]:block min-[540px]:border-b-0 min-[540px]:border-r min-[540px]:px-(--space-4) min-[540px]:first:pl-0 min-[540px]:last:pr-0 ${NAV_FOCUS}`}>
      <p className="text-sm text-on-dark-muted group-hover:text-on-dark">{label}</p>
      <p className="col-start-2 row-span-2 row-start-1 text-h2 font-bold leading-none tracking-(--tracking-display) tabular-nums min-[540px]:mt-(--space-3) min-[540px]:text-h1">{value}</p>
      <p className="mt-(--space-1) text-xs text-on-dark-muted min-[540px]:mt-(--space-3)">{note}</p>
    </Link>
  );
}

function Attention({ href, title, count, note, icon, urgent }: {
  href: string; title: string; count: number; note: string; icon: IconName; urgent?: boolean;
}) {
  return (
    <Link href={href} className={`group flex min-w-0 items-center gap-(--space-3) rounded-(--radius-sm) py-(--space-4) ${NAV_FOCUS}`}>
      <Icon name={icon} className="size-5 shrink-0 text-teal-mist" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-(--space-3)">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-h4 font-bold tabular-nums">{count}</p>
        </div>
        <p className="mt-(--space-1) text-xs leading-relaxed text-on-dark-muted">
          {urgent && <span aria-hidden="true" className="mr-(--space-2) inline-block size-2 rounded-full bg-status-overdue" />}
          {note}
        </p>
      </div>
      <Icon name="i-arrow-right" className="size-4 shrink-0 text-on-dark-muted transition-transform duration-(--dur-base) motion-safe:group-hover:translate-x-1" />
    </Link>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`mw-cta inline-flex min-h-11 items-center gap-(--space-2) text-sm font-semibold text-on-dark-muted hover:text-on-dark ${NAV_FOCUS}`}>
      {children} <Icon name="i-arrow-right" className="size-4" />
    </Link>
  );
}

function Ledger({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="border-b border-hairline pb-(--space-3) text-sm font-bold text-teal-mist">{title}</h3>
      <ul className="divide-y divide-hairline">{children}</ul>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-3) py-(--space-3)">
      <p className="text-sm font-semibold">{label}</p>
      <p className="row-span-2 text-h3 font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-(--space-1) text-xs leading-relaxed text-on-dark-muted">{note}</p>
    </li>
  );
}

function Figure({ label, value, note, href }: { label: string; value: number; note: string; href: string }) {
  return (
    <Link href={href} className="min-w-0 bg-black-2 p-(--space-4) transition-colors hover:bg-black focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-dark">
      <p className="text-sm font-semibold text-on-dark-muted">{label}</p>
      <p className="mt-(--space-3) text-h2 font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-(--space-2) text-xs leading-relaxed text-on-dark-muted">{note}</p>
    </Link>
  );
}

function Money({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-on-dark-muted">{label}</p>
      <p className="mt-(--space-3) text-h3 font-bold tracking-(--tracking-tight) tabular-nums [overflow-wrap:anywhere]">{value}</p>
      <p className="mt-(--space-2) text-xs text-on-dark-muted">{note}</p>
    </div>
  );
}
