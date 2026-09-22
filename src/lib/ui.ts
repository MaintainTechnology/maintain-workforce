// Shared layout class strings for the Hi-Vis Standard (DESIGN.md). One source
// so shell, rhythm, heading scale and button language stay identical
// everywhere.

export const SHELL = "mx-auto w-full max-w-[1200px] px-(--space-5)";

export const SECTION = "py-(--space-8) md:py-(--space-9)";

// Page title (h1): Manrope display scale, one per page.
export const H1 =
  "font-display text-display font-extrabold leading-(--leading-display) tracking-(--tracking-display) text-on-dark";

// Section headings.
export const H2 =
  "font-display text-h1 font-extrabold leading-(--leading-display) tracking-(--tracking-display) text-on-dark";

// Short operational labels (statuses, trade codes, availability): the Label
// style. Caps here are sanctioned; eyebrows above headings are not.
export const LABEL =
  "text-overline font-semibold uppercase tracking-(--tracking-caps) text-on-dark-faint";

// Buttons per DESIGN.md: pill, 44px minimum target, felt press. The press is
// scale(0.97) at --dur-fast (120ms) — the whole pill gives under the pointer;
// the colour change keeps 200ms. mw-cta nudges a trailing arrow on hover.
export const BTN_PRIMARY =
  "mw-cta inline-flex min-h-11 items-center justify-center gap-(--space-2) rounded-(--radius-pill) bg-primary px-(--space-6) py-(--space-3) font-bold text-primary-ink shadow-(--shadow-md) [transition:background-color_var(--dur-base)_var(--ease-out),transform_var(--dur-fast)_var(--ease-out),opacity_var(--dur-base)_var(--ease-out)] hover:bg-amber-tint-2 focus-visible:bg-amber-tint-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-primary disabled:active:scale-100";

export const BTN_GHOST =
  "mw-cta inline-flex min-h-11 items-center justify-center gap-(--space-2) rounded-(--radius-pill) border border-hairline px-(--space-6) py-(--space-3) font-bold text-on-dark [transition:background-color_var(--dur-base)_var(--ease-out),transform_var(--dur-fast)_var(--ease-out),opacity_var(--dur-base)_var(--ease-out)] hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:active:scale-100";

// Compact variants for dense operational surfaces (table cells, toolbars, the
// admin sidebar footer). Same pill, same 44px target, tighter horizontal
// padding and the 14px interface size so a row of controls reads as one line.
export const BTN_PRIMARY_SM =
  "mw-cta inline-flex min-h-11 items-center justify-center gap-(--space-2) whitespace-nowrap rounded-(--radius-pill) bg-primary px-(--space-4) py-(--space-2) text-sm font-bold text-primary-ink shadow-(--shadow-md) [transition:background-color_var(--dur-base)_var(--ease-out),transform_var(--dur-fast)_var(--ease-out),opacity_var(--dur-base)_var(--ease-out)] hover:bg-amber-tint-2 focus-visible:bg-amber-tint-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-primary disabled:active:scale-100";

export const BTN_GHOST_SM =
  "mw-cta inline-flex min-h-11 items-center justify-center gap-(--space-2) whitespace-nowrap rounded-(--radius-pill) border border-hairline px-(--space-4) py-(--space-2) text-sm font-semibold text-on-dark [transition:background-color_var(--dur-base)_var(--ease-out),transform_var(--dur-fast)_var(--ease-out),opacity_var(--dur-base)_var(--ease-out)] hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:active:scale-100";

// Panel: Black 2 on a hairline, no shadow (Flat-By-Default Rule).
export const PANEL = "rounded-(--radius-lg) border border-hairline bg-black-2";

// Inline prose link.
export const LINK =
  "font-semibold text-on-dark underline underline-offset-4 transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark";

// Keyboard focus for bare nav links (buttons and inputs carry their own).
export const NAV_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark";
