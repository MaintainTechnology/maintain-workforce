// Admin presentation tokens — DESIGN.md Hi-Vis Standard, layered on the marketing
// site's existing constants in @/lib/ui so the two halves of the repo read as one
// product. Semantic tokens only: never a raw hex, radius or duration in a component.

import { H2 } from "@/lib/ui";
export * from "@/lib/platform-ui";

export const PAGE = "py-(--space-7)";
export const CARD = "rounded-(--radius-lg) border border-hairline bg-black-2 p-(--space-5)";

// Operational pages title at the headline step, not the marketing display step:
// a dashboard h1 is a wayfinding label, not a hero.
export const PAGE_TITLE = H2;
export const SECTION_TITLE =
  "font-display text-h3 font-bold leading-tight tracking-(--tracking-tight) text-on-dark";
export const SUBSECTION_TITLE = "font-display text-h4 font-bold leading-tight text-on-dark";

// Keep the legacy export so existing tables and forms share the correction:
// operational data uses Manrope too (DESIGN.md, Single Family Rule).
export const MONO = "font-body tabular-nums";

// Tables: 14px interface size, hairline rows, cells padded to the frame edge so a
// table can sit flush inside a panel. Numeric columns right-align on the *_NUM
// variants; TableFrame (components/admin-page.tsx) supplies the frame and row hover.
export const TABLE = "w-full border-collapse text-left text-sm";
export const TH =
  "whitespace-nowrap border-b border-hairline px-(--space-4) py-(--space-3) text-overline font-semibold uppercase tracking-(--tracking-caps) text-on-dark-faint";
export const TH_NUM = `${TH} text-right`;
export const TD = "border-b border-hairline px-(--space-4) py-(--space-3) align-top text-on-dark";
export const TD_NUM = `${TD} whitespace-nowrap text-right tabular-nums`;

export const FIELD = "flex flex-col gap-(--space-2)";
// One input vocabulary for the whole platform: Black tonal step on the Black 2
// panel, hairline border, amber focus ring (the same ring components/form.tsx uses).
export const INPUT =
  "w-full min-h-11 rounded-(--radius-md) border border-hairline bg-black px-(--space-3) py-(--space-2) text-body text-on-dark placeholder:text-on-dark-faint transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50";
export const INPUT_SM = INPUT.replace("text-body", "text-sm");
export const FIELD_LABEL = "text-sm font-semibold text-on-dark";
export const FIELD_HINT = "text-sm text-on-dark-muted";
// Errors follow the Dot-and-Label rule in components/form.tsx: status-critical was
// tuned as a dot hue and fails 4.5:1 as text, so the sentence stays white and the
// hue rides on a leading dot.
const OUTCOME =
  "flex items-start gap-(--space-2) text-sm font-semibold text-on-dark before:mt-[0.45em] before:size-2 before:shrink-0 before:rounded-(--radius-pill) before:content-['']";
export const FIELD_ERROR = `${OUTCOME} before:bg-status-critical`;
export const FIELD_OK = `${OUTCOME} before:bg-status-active`;

// Checkbox options rendered as hairline pills: a 44px target, the teal-mist
// checked state, never amber (checkboxes are not the next action).
export const CHECK_OPTION =
  "inline-flex min-h-11 cursor-pointer items-center gap-(--space-2) rounded-(--radius-pill) border border-hairline px-(--space-4) py-(--space-2) text-sm text-on-dark transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-white/5 has-checked:border-teal-mist/60 has-checked:bg-white/[0.06] has-disabled:cursor-not-allowed has-disabled:opacity-50 has-disabled:hover:bg-transparent";
export const CHECKBOX = "size-4 shrink-0 accent-teal-mist";
