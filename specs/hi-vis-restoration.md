# Spec: Restore the Hi-Vis Standard design system to the Maintain Worker site

> Historical marketing-restyle scope. Its frozen-content constraint applied to that
> task; the later dashboard and MVP alignment requests authorise functional changes.
> [DESIGN.md](../DESIGN.md) remains the design authority; [the MVP spec](maintain-workforce-mvp.md)
> governs current application behaviour.

## Goal

The site's **content** (Maintain Worker, the B2B workforce exchange) is correct
and frozen. The site's **design system** wrongly adopted the reference build
spec's system; restore the repo's own Hi-Vis Standard everywhere, changing zero
content. Then re-run the quality gates (taste skill audits, impeccable
detector + finish review) until clean.

## Definitions

**KEEP (content, frozen):** every sentence, section order, route, redirect,
form field, action contract, bracket placeholder, FAQ/sample-board copy,
PRODUCT.md, the 8 images in `public/generated/`, `mark.svg`, both `.env`
files. Rule: if a change alters what a sentence says rather than how it looks,
it is out of scope.

**REMOVE (the reference spec's design system, currently live):**
- Fonts Archivo / Inter / IBM Plex Mono (`src/app/layout.tsx` next/font
  imports and variables).
- The spec token layer in `src/app/globals.css`: `--mw-raised-panel`,
  `--mw-sunken`, `--mw-text*`, `--mw-border*`, `--mw-success`,
  `--shadow-card`, `--shadow-raised`, the `--color-surface-*`,
  `--color-content-*`, `--color-line-*`, `--color-success` aliases, the
  spec type scale values, and the `--font-archivo/inter/plex-mono`
  references.
- All usage of: `font-mono`, `EYEBROW`, `CARD` (spec shadow version),
  `bg-surface-*`, `text-content*`, `border-line*`, `text-teal-mist` chips
  idiom, `rounded-(--radius-md)` buttons, `shadow-(--shadow-card)`,
  `shadow-(--shadow-raised)`, wide mono tracking (`tracking-[0.14em]` etc.).

**RESTORE (the Hi-Vis Standard, source `public/design-system/tokens.css` +
the previous DESIGN.md):**
- Manrope only, via next/font, `--font-manrope` mapped to
  `--font-display`/`--font-body`.
- Original type scale: display clamp(2.75rem,6vw,4.5rem), h1
  clamp(2rem,4vw,3rem), h2 clamp(1.5rem,3vw,2rem), h3 1.375rem, h4 1.125rem,
  body-lg 1.125rem, body 1rem.
- Surfaces: page `bg` (Ink Teal #07272D), bands `bg-deep` (#101820), panels
  `black-2` (#0C1319), text ramp `on-dark` / `on-dark-muted` /
  `on-dark-faint`, hairlines `border-hairline` (white/10), signature
  `.mw-grid-bg` / `.mw-glow` on the home hero.
- Buttons: pill (`rounded-(--radius-pill)`), primary amber bg +
  `text-primary-ink`, ghost hairline border, `active:translate-y-px`, press
  transform at `--dur-fast`.
- Depth: hairline first, tonal step second; `shadow-(--shadow-md)` only on
  the primary button, `shadow-(--shadow-lg)` only on the mobile menu overlay.
- No eyebrow labels anywhere (caps only inside the dot+label status pattern
  and short trade-code chips per the addendum below). No monospace anywhere.
- Amber budget: one primary amber element per viewport.

## Deliverables

1. **DESIGN.md** restored to the previous Hi-Vis Standard document (dark
   lock, one-amber, hairline elevation, Manrope-only, dot+label, pill
   buttons, signature surfaces, do/don't lists), with a short "Maintain
   Worker content vocabulary" addendum: trade codes (ROOF/PLUMB/CARP/ELEC),
   ABNs and availability windows render in Manrope using the existing
   caps-label pattern (0.08em tracking, on-dark-faint), never a second
   family; the exchange-ledger, chips and sample-board remain content
   patterns styled by this system.
2. **src/app/layout.tsx**: Manrope only.
3. **src/app/globals.css**: spec layer and spec scale removed, original
   scale and font mapping restored; motion primitives block (mw-rise,
   mw-enter, mw-reveal, mw-reveal-image, mw-menu-in, mw-swap, mw-ping,
   mw-dot-live, mw-glow-band) kept byte-compatible.
4. **src/lib/ui.ts**: SHELL (max-w-[1200px] stays, it is a layout choice not
   a token), SECTION, H1 (display scale), H2 (h1 scale), BTN_PRIMARY /
   BTN_GHOST (pill, brand press), PANEL (hairline + black-2, no shadow),
   LINK. EYEBROW and spec CARD deleted.
5. **Components restyled, content untouched**: exchange-ledger, chip
   (TradePill + Chip via caps-label idiom, live chip may use amber text
   within the amber budget), site-header (ink-teal glass stays, pill CTAs),
   mobile-menu, site-footer, form primitives (black-2 fields, hairline,
   amber focus per original), faq, status, reveal/reveal-image untouched.
6. **All eight routes restyled**: `/` (grid+glow hero restored around the
   ledger), about, contact, register, login, forgot-password,
   legal/privacy, legal/terms.
7. **mdx-components** back to on-dark ramp classes.

## Definition of done (the /review checklist)

- [ ] Grep-clean: zero occurrences in `src/` of `font-mono`, `Archivo`,
      `IBM_Plex_Mono`, `Inter,` imports, `EYEBROW`, `surface-card`,
      `surface-raised`, `surface-sunken`, `surface-brand`, `content-secondary`,
      `content-muted`, `content-on-amber`, `border-line`, `line-strong`,
      `line-amber`, `shadow-card`, `shadow-raised`, `tracking-[0.1`.
- [ ] Grep-clean: zero em/en dashes in visible strings; zero retired
      labour-supply copy ("join the crew", "we supply crews", "book a crew").
- [ ] `npx tsc --noEmit`, `npx eslint`, `npx next build` all green; all 8
      content routes static.
- [ ] No horizontal overflow at 320 / 390 / 1440 on any route.
- [ ] Both forms round-trip: honest failure state, all values preserved
      (register: text + checkboxes + radios).
- [ ] Taste-skill audits: zero eyebrows, one amber per viewport (header CTA
      + page primary of the same intent tolerated as before), pill buttons
      everywhere, dot+label statuses.
- [ ] Impeccable detector: zero findings. Fresh finish review run, material
      fixes applied, verdict reported.
- [ ] Content diff: rendered text of every page identical to before the
      restyle (allowing only whitespace/markup differences).
