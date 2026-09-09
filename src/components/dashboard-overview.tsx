import Link from "next/link";
import { Icon } from "@/components/icon";
import type { IconName } from "@/components/icon";
import type { CompanyStatus } from "@/lib/supabase/types";
import { BTN_GHOST, BTN_PRIMARY, NAV_FOCUS, PANEL } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/platform-ui";

export type DashboardMetrics = {
  crew: number | null;
  available: number | null;
  deployed: number | null;
  requirements: number | null;
  decisions: number | null;
  engagements: number | null;
};

const ROW_LINK = `group flex min-w-0 items-center gap-(--space-4) rounded-(--radius-sm) py-(--space-5) transition-colors duration-(--dur-base) hover:bg-white/5 ${NAV_FOCUS}`;

export function DashboardOverview({ companyStatus, today, metrics }: {
  companyStatus: CompanyStatus;
  today: string;
  metrics: DashboardMetrics;
}) {
  const canTrade = companyStatus === "Active";
  const canPrepare = canTrade || companyStatus === "Pending";
  const hasError = Object.values(metrics).some((value) => value === null);
  const date = formatDate(today); // MVP 20.5: Brisbane calendar dates, dd/mm/yyyy.

  return (
    <div className="mw-dashboard flex flex-col gap-(--space-6) lg:gap-(--space-7)">
      <header className="flex flex-col justify-between gap-(--space-5) xl:flex-row xl:items-center">
        <div>
          <h1 className="font-display text-h1 font-extrabold leading-(--leading-display) tracking-(--tracking-display)">Your exchange</h1>
          <p className="mt-(--space-3) max-w-[60ch] text-body text-on-dark-muted">
            Your crew, your capacity. A clear view of what comes next.
          </p>
        </div>
        <div className={canTrade ? "grid grid-cols-2 gap-(--space-3) min-[480px]:flex min-[480px]:flex-wrap" : "flex flex-wrap gap-(--space-3)"}>
          {canTrade ? (
            <>
              <Link href="/app/capacity/new" className={cn(BTN_PRIMARY, "px-(--space-4) text-sm sm:px-(--space-6) sm:text-base")}>
                Sell capacity <Icon name="i-arrow-right" className="hidden size-5 min-[480px]:block" />
              </Link>
              <Link href="/app/demand/new" className={cn(BTN_GHOST, "px-(--space-4) text-sm sm:px-(--space-6) sm:text-base")}>Buy capacity</Link>
            </>
          ) : companyStatus === "Pending" ? (
            <Link href="/app/workers/new" className={BTN_PRIMARY}>
              Add a worker <Icon name="i-arrow-right" />
            </Link>
          ) : (
            <Link href="/app/settings" className={BTN_GHOST}>View company details</Link>
          )}
        </div>
      </header>

      {hasError && (
        <div role="status" className={`${PANEL} flex flex-wrap items-center justify-between gap-(--space-3) px-(--space-5) py-(--space-3)`}>
          <p className="max-w-[65ch] text-sm text-on-dark-muted">
            Some figures could not be loaded. You can still open each area of your workspace.
          </p>
          <Link href="/app" className={`inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 ${NAV_FOCUS}`}>Reload dashboard</Link>
        </div>
      )}

      <div className="grid min-w-0 gap-(--space-5) xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section aria-labelledby="workforce-today" className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-wrap items-start justify-between gap-(--space-3) p-(--space-5) sm:p-(--space-6) sm:pb-(--space-5)">
            <div>
              <h2 id="workforce-today" className="text-h3 font-bold tracking-(--tracking-tight)">Workforce today</h2>
              <p className="mt-(--space-2) text-sm text-on-dark-muted"><time dateTime={today}>{date}</time> · Brisbane</p>
            </div>
            <Icon name="i-network" className="size-6 text-teal-mist" />
          </div>
          <div className="grid grid-cols-1 px-(--space-5) min-[480px]:grid-cols-3 sm:px-(--space-6)">
            <WorkforceStat label="Crew on record" value={metrics.crew} href="/app/workers" note="Currently employed" />
            <WorkforceStat label="Available today" value={metrics.available} href="/app/capacity" note="Listed and uncommitted" />
            <WorkforceStat label="Deployed today" value={metrics.deployed} href="/app/engagements" note="On a current engagement" />
          </div>
          <div className="mt-(--space-5) flex flex-wrap items-center justify-between gap-x-(--space-4) border-t border-hairline bg-ink-teal/40 px-(--space-5) py-(--space-3) sm:px-(--space-6)">
            <p className="text-sm text-on-dark-muted">
              {metrics.crew === 0
                ? "Your workforce starts with your first crew member."
                : "Keep your crew records and availability up to date."}
            </p>
            <Link href={metrics.crew === 0 && canPrepare ? "/app/workers/new" : "/app/workers"} className={`mw-cta inline-flex min-h-11 items-center gap-(--space-2) text-sm font-semibold ${NAV_FOCUS}`}>
              {metrics.crew === 0 && canPrepare ? "Add a worker" : "Manage workforce"} <Icon name="i-arrow-right" className="size-4" />
            </Link>
          </div>
        </section>

        <section aria-labelledby="decisions-heading" className="flex flex-col rounded-(--radius-lg) border border-hairline bg-ink-teal p-(--space-5) sm:p-(--space-6)">
          <h2 id="decisions-heading" className="text-h3 font-bold tracking-(--tracking-tight)">Needs your attention</h2>
          <Link href="/app/matches" className={`group mt-(--space-5) flex flex-1 flex-col rounded-(--radius-sm) ${NAV_FOCUS}`}>
            <div className="flex items-center gap-(--space-3)">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-(--radius-pill) border border-hairline text-teal-mist">
                <Icon name={metrics.decisions === 0 ? "i-check" : "i-network"} />
              </span>
              <h3 className="text-body-lg font-bold">
                {metrics.decisions === null ? "Matches unavailable" : metrics.decisions === 0 ? "All caught up" : `${metrics.decisions.toLocaleString("en-AU")} ${metrics.decisions === 1 ? "match needs" : "matches need"} a decision`}
              </h3>
            </div>
            <p className="mt-(--space-4) max-w-[45ch] text-sm leading-relaxed text-on-dark-muted">
              {metrics.decisions === null
                ? "Open matches to check your latest proposals."
                : metrics.decisions === 0
                  ? "No proposed matches are waiting on you. Your next opportunity will appear here."
                  : canTrade
                    ? "Review the proposed matches for your business and decide what works for your crew."
                    : "You can view your proposed matches. Decisions are available when your account is active."}
            </p>
            <div className="mt-(--space-5) flex items-center justify-between gap-(--space-3) border-t border-hairline pt-(--space-4) text-sm">
              <span className="text-on-dark-muted">Awaiting your decision</span>
              <span className="font-bold tabular-nums">{metrics.decisions === null ? "Unavailable" : metrics.decisions.toLocaleString("en-AU")}</span>
            </div>
            <span className="mt-(--space-4) inline-flex min-h-11 items-center justify-between gap-(--space-3) text-sm font-semibold">
              {metrics.decisions && canTrade ? "Review matches" : "View matches"}
              <Icon name="i-arrow-right" className="size-5 transition-transform duration-(--dur-base) motion-safe:group-hover:translate-x-1" />
            </span>
          </Link>
        </section>

        <section aria-labelledby="exchange-heading" className="min-w-0 pt-(--space-2)">
          <div className="mb-(--space-3)">
            <h2 id="exchange-heading" className="text-h3 font-bold tracking-(--tracking-tight)">Manage your exchange</h2>
            <p className="mt-(--space-2) text-sm text-on-dark-muted">Pick up where your business needs you.</p>
          </div>
          <div className="divide-y divide-hairline">
            <ExchangeLink href="/app/capacity" icon="i-speed" title="Capacity" description="Manage your available crew and listing windows." />
            <ExchangeLink href="/app/demand" icon="i-clipboard" title="Requirements" description="Track the crew your projects still need." count={metrics.requirements} countLabel="Open requirements" />
            <ExchangeLink href="/app/engagements" icon="i-chart" title="Engagements" description="Follow agreed work, from confirmation to completion." count={metrics.engagements} countLabel="Current engagements" />
          </div>
        </section>

        <section aria-labelledby="company-heading" className="min-w-0 pt-(--space-2)">
          <h2 id="company-heading" className="text-h3 font-bold tracking-(--tracking-tight)">Company essentials</h2>
          <p className="mt-(--space-2) text-sm text-on-dark-muted">The details behind a ready workforce.</p>
          <div className="mt-(--space-3) divide-y divide-hairline">
            <EssentialLink href="/app/settings" icon="i-shield" title="Company & documents" description="Business details, compliance and your team" />
            <EssentialLink href="/app/transfers" icon="i-network" title="Worker transfers" description="Review moves between employers" />
            <EssentialLink href="/contact" icon="i-mail" title="Contact Maintain" description="Get help from the exchange team" />
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkforceStat({ label, value, href, note }: { label: string; value: number | null; href: string; note: string }) {
  return (
    <Link href={href} className={`mw-workforce-stat group flex min-w-0 items-center justify-between gap-(--space-3) border-b border-hairline py-(--space-4) last:border-0 min-[480px]:block min-[480px]:border-b-0 min-[480px]:border-r min-[480px]:px-(--space-4) min-[480px]:first:pl-0 min-[480px]:last:pr-0 ${NAV_FOCUS}`}>
      <div className="flex items-center justify-between gap-(--space-2) text-sm text-on-dark-muted group-hover:text-on-dark">
        <span>{label}</span><Icon name="i-arrow-right" className="hidden size-4 shrink-0 min-[480px]:block" />
      </div>
      <div className="min-[480px]:mt-(--space-4)">
        <span className={value === null ? "text-sm text-on-dark-muted" : "text-h1 font-bold leading-none tracking-(--tracking-display) tabular-nums"}>{value === null ? "Unavailable" : value.toLocaleString("en-AU")}</span>
        <p className="mt-(--space-3) hidden text-xs text-on-dark-muted min-[480px]:block">{note}</p>
      </div>
    </Link>
  );
}

function ExchangeLink({ href, icon, title, description, count, countLabel }: {
  href: string; icon: IconName; title: string; description: string; count?: number | null; countLabel?: string;
}) {
  return (
    <Link href={href} className={ROW_LINK}>
      <span className="hidden size-11 shrink-0 items-center justify-center rounded-(--radius-md) border border-hairline text-teal-mist sm:inline-flex"><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold">{title}</h3>
        <p className="mt-(--space-1) max-w-[48ch] text-sm text-on-dark-muted">{description}</p>
        {countLabel && <p className="mt-(--space-2) text-xs text-on-dark-muted min-[480px]:hidden">{countLabel}: {count === null ? "Unavailable" : count?.toLocaleString("en-AU")}</p>}
      </div>
      {countLabel && <div className="hidden shrink-0 text-right min-[480px]:block">
        <p className={count === null ? "text-sm text-on-dark-muted" : "text-h3 font-bold tabular-nums"}>{count === null ? "Unavailable" : count?.toLocaleString("en-AU")}</p>
        <p className="mt-(--space-1) text-xs text-on-dark-muted">{countLabel}</p>
      </div>}
      <Icon name="i-arrow-right" className="size-5 shrink-0 text-on-dark-muted transition-transform duration-(--dur-base) motion-safe:group-hover:translate-x-1" />
    </Link>
  );
}

function EssentialLink({ href, icon, title, description }: { href: string; icon: IconName; title: string; description: string }) {
  return (
    <Link href={href} className={ROW_LINK}>
      <Icon name={icon} className="size-5 shrink-0 text-teal-mist" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-(--space-1) text-xs text-on-dark-muted">{description}</p>
      </div>
      <Icon name="i-arrow-right" className="size-4 shrink-0 text-on-dark-muted transition-transform duration-(--dur-base) motion-safe:group-hover:translate-x-1" />
    </Link>
  );
}
