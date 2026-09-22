import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { LABEL, BTN_GHOST_SM, NAV_FOCUS, PANEL } from "@/lib/ui";
import { PAGE_TITLE, SECTION_TITLE } from "@/lib/platform-ui";
import { cn } from "@/lib/utils";

// The Maintain admin page vocabulary. Every admin screen is built from these few
// pieces so arrival, feedback, data and navigation read identically from Leads to
// Rates. Presentational only: pages keep their queries and actions.

/* ---------------------------------------------------------------- header ---- */

export function PageHeader({
  title,
  lead,
  meta,
  actions,
  back,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  /** Short operational facts under the lead: counts, dates, identifiers. */
  meta?: ReactNode;
  /** Right-aligned controls: exports, primary entry points. */
  actions?: ReactNode;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-(--space-4)">
      {back && (
        <Link
          href={back.href}
          className={`inline-flex min-h-11 w-fit items-center gap-(--space-2) text-sm font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark ${NAV_FOCUS}`}
        >
          <Icon name="i-arrow-right" className="size-4 rotate-180" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-(--space-6) gap-y-(--space-4)">
        <div className="min-w-0 max-w-[64ch]">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {lead && <p className="mt-(--space-3) text-body text-on-dark-muted">{lead}</p>}
          {meta && (
            <div className="mt-(--space-3) flex flex-wrap items-center gap-x-(--space-4) gap-y-(--space-2) text-sm text-on-dark-muted tabular-nums">
              {meta}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-(--space-3)">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A panel or section heading row: title left, hint or controls right. */
export function SectionHeader({
  title,
  hint,
  actions,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-(--space-4) gap-y-(--space-2)", className)}>
      <div className="min-w-0">
        <Heading className={SECTION_TITLE}>{title}</Heading>
        {hint && <p className="mt-(--space-1) max-w-[64ch] text-sm text-on-dark-muted">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-(--space-3)">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- notice ---- */

/**
 * Feedback after a redirecting action. Dot-and-Label: the tone rides on the
 * dot, the sentence stays white; the role tells assistive tech which it is.
 */
export function Notice({
  tone = "ok",
  children,
  className,
}: {
  tone?: "ok" | "error" | "warn" | "info";
  children: ReactNode;
  className?: string;
}) {
  const dot = {
    ok: "bg-status-active",
    error: "bg-status-critical",
    warn: "bg-status-overdue",
    info: "bg-on-dark-faint",
  }[tone];
  return (
    <p
      role={tone === "error" || tone === "warn" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-(--space-3) rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-sm leading-relaxed text-on-dark",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("mt-[0.45em] size-2 shrink-0 rounded-(--radius-pill)", dot)} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/* ----------------------------------------------------------------- table ---- */

/**
 * Frames a <table> in a panel: horizontal scroll, hairline rows that stop at the
 * frame, a tonal header band, and a row hover that reads as focus, not colour.
 */
export function TableFrame({
  children,
  className,
  inset = false,
}: {
  children: ReactNode;
  className?: string;
  /** For a table that already sits inside a panel: hairline frame, no second surface. */
  inset?: boolean;
}) {
  return (
    <div
      className={cn(
        inset ? "rounded-(--radius-md) border border-hairline" : PANEL,
        "overflow-x-auto",
        "[&_thead_th]:bg-white/[0.025]",
        "[&_tbody_tr]:transition-colors [&_tbody_tr]:duration-(--dur-fast) [&_tbody_tr:hover]:bg-white/[0.03]",
        "[&_tbody_tr:last-child>td]:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-(--space-4) py-(--space-8) text-center text-sm text-on-dark-muted">
        {children}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------ pagination ---- */

export function Pagination({
  label,
  summary,
  previousHref,
  nextHref,
  className,
}: {
  label: string;
  summary: ReactNode;
  previousHref?: string;
  nextHref?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("flex flex-wrap items-center justify-between gap-(--space-3)", className)}
    >
      <p className="text-sm text-on-dark-muted tabular-nums">{summary}</p>
      <div className="flex items-center gap-(--space-2)">
        <PageLink href={previousHref}>
          <Icon name="i-arrow-right" className="size-4 rotate-180" />
          Previous
        </PageLink>
        <PageLink href={nextHref}>
          Next
          <Icon name="i-arrow-right" className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(BTN_GHOST_SM, "cursor-not-allowed opacity-50 hover:bg-transparent")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={BTN_GHOST_SM}>
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------- facts ---- */

export function FactList({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return <dl className={cn("grid gap-x-(--space-6) gap-y-(--space-4)", cols, className)}>{children}</dl>;
}

export function Fact({
  label,
  value,
  numeric,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className={LABEL}>{label}</dt>
      <dd className={cn("mt-(--space-1) text-sm text-on-dark [overflow-wrap:anywhere]", numeric && "tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------ empty state ---- */

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(PANEL, "px-(--space-6) py-(--space-8) text-center", className)}>
      <p className="text-body font-semibold text-on-dark">{title}</p>
      {children && <p className="mx-auto mt-(--space-2) max-w-[48ch] text-sm text-on-dark-muted">{children}</p>}
      {action && <div className="mt-(--space-5) flex justify-center">{action}</div>}
    </div>
  );
}
