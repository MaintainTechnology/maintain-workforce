// Shared platform UI tokens — DESIGN.md Hi-Vis Standard, layered on the marketing
// site's existing constants in @/lib/ui so the two halves of the repo read as one
// product. Semantic tokens only: never a raw hex, radius or duration in a component.

export const PAGE = "py-(--space-7)";
export const CARD = "rounded-(--radius-lg) border border-hairline bg-black-2 p-(--space-5)";

// Keep the legacy export so existing tables and forms share the correction:
// operational data uses Manrope too (DESIGN.md, Single Family Rule).
export const MONO = "font-body tabular-nums";

export const TABLE = "w-full border-collapse text-left text-body";
export const TH =
  "border-b border-hairline px-(--space-3) py-(--space-3) text-overline uppercase tracking-(--tracking-caps) text-on-dark-faint font-semibold";
export const TD = "border-b border-hairline px-(--space-3) py-(--space-3) align-top";

export const FIELD = "flex flex-col gap-(--space-2)";
export const INPUT =
  "w-full rounded-(--radius-sm) border border-hairline bg-black px-(--space-3) py-(--space-3) text-body text-on-dark placeholder:text-on-dark-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber";
export const FIELD_LABEL = "text-body font-semibold text-on-dark";
export const FIELD_HINT = "text-sm text-on-dark-muted";
export const FIELD_ERROR = "text-sm text-status-critical";

/**
 * DESIGN.md's Dot-and-Label Rule: status colour belongs to a decorative 8px
 * dot; the written label stays neutral. An empty pseudo-element adds no
 * accessible text, so existing callers keep their complete status labels.
 */
export const STATUS_TONE = {
  neutral: "before:bg-on-dark-faint",
  active: "before:bg-status-active",
  scheduled: "before:bg-status-scheduled",
  pending: "before:bg-status-pending",
  overdue: "before:bg-status-overdue",
  critical: "before:bg-status-critical",
} as const;

export type StatusTone = keyof typeof STATUS_TONE;

export function pill(tone: StatusTone): string {
  return `inline-flex items-center gap-(--space-2) rounded-(--radius-pill) border border-hairline px-(--space-3) py-(--space-1) text-overline font-semibold uppercase tracking-(--tracking-caps) text-on-dark-muted before:size-2 before:shrink-0 before:rounded-full before:content-[''] ${STATUS_TONE[tone]}`;
}

/** Maps the spec's status vocabularies onto the shared tone set. */
export function toneFor(status: string): StatusTone {
  switch (status) {
    case "Active":
    case "Confirmed":
    case "Accepted":
    case "Current":
    case "Completed":
      return "active";
    case "Awaiting Commercial":
    case "Awaiting Supplier":
    case "Awaiting Buyer":
    case "Awaiting Current Employer":
    case "Pending":
    case "Requested":
    case "Expiring Soon":
      return "pending";
    case "Overdue":
    case "Admin Review":
    case "Partially Filled":
    case "Partially Committed":
      return "overdue";
    case "Declined":
    case "Cancelled":
    case "Expired":
    case "Suspended":
    case "Disputed":
      return "critical";
    default:
      return "neutral";
  }
}

/** 20.5 — dd/mm/yyyy, the format a site office reads without thinking. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatWindow(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}
