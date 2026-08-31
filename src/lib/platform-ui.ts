// Shared platform UI tokens — DESIGN.md Hi-Vis Standard, layered on the marketing
// site's existing constants in @/lib/ui so the two halves of the repo read as one
// product. Semantic tokens only: never a raw hex, radius or duration in a component.

export const PAGE = "py-(--space-7)";
export const CARD = "rounded-(--radius-lg) border border-hairline bg-black-2 p-(--space-5)";

// Monospace carries operational truth: ABNs, trade codes, availability windows, rates.
export const MONO = "font-mono tabular-nums";

export const TABLE = "w-full border-collapse text-left text-body";
export const TH =
  "border-b border-hairline px-(--space-3) py-(--space-3) text-label uppercase tracking-[0.08em] text-on-dark-faint font-semibold";
export const TD = "border-b border-hairline px-(--space-3) py-(--space-3) align-top";

export const FIELD = "flex flex-col gap-(--space-2)";
export const INPUT =
  "w-full rounded-(--radius-sm) border border-hairline bg-black px-(--space-3) py-(--space-3) text-body text-on-dark placeholder:text-on-dark-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber";
export const FIELD_LABEL = "text-body font-semibold text-on-dark";
export const FIELD_HINT = "text-body-sm text-on-dark-muted";
export const FIELD_ERROR = "text-body-sm text-status-critical";

/**
 * Status pills. The canonical vocabulary is shared with the operating model, and
 * colour is never the only signal — every pill carries its label (Operating
 * Blueprint s06, and the accessibility floor in Constraints).
 */
export const STATUS_TONE = {
  neutral: "border-hairline text-on-dark-muted",
  active: "border-status-active/40 text-status-active",
  scheduled: "border-status-scheduled/40 text-status-scheduled",
  pending: "border-status-pending/40 text-status-pending",
  overdue: "border-status-overdue/40 text-status-overdue",
  critical: "border-status-critical/40 text-status-critical",
} as const;

export type StatusTone = keyof typeof STATUS_TONE;

export function pill(tone: StatusTone): string {
  return `inline-flex items-center gap-(--space-2) rounded-(--radius-pill) border px-(--space-3) py-(--space-1) text-label font-semibold uppercase tracking-[0.08em] ${STATUS_TONE[tone]}`;
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
