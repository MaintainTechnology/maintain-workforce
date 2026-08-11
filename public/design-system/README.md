# Maintain Workforce Design System

The canonical reference for every Maintain Workforce visual: web, product UI, documents,
and social graphics. **Build against this, not ad-hoc values.**

There is no Maintain Workforce website yet, so this system is derived from the brand mark
itself: [`assets/logo/maintain-workforce-logo-lightbg.svg`](assets/logo/maintain-workforce-logo-lightbg.svg)
(Ink Teal `#07272D` wordmark, Hi-Vis Amber `#FFC400` chevrons, Manrope type), on the shared
Maintain group dark-surface scaffolding.

## Files

| File | What it is |
|---|---|
| [`tokens.css`](tokens.css) | CSS custom properties + signature background utilities. Link this in any web build. |
| [`tokens.json`](tokens.json) | The same tokens, machine-readable (for scripts, Figma sync, other tooling). |
| [`index.html`](index.html) | **Living style guide** — renders the whole system. Open it to see everything at once. |
| [`assets/logo/`](assets/logo) | `maintain-workforce-logo-lightbg.svg` (source of truth), `wordmark-on-dark.svg`, `wordmark-on-light.svg` |
| [`assets/icons/`](assets/icons) | 14 brand line icons (`i-*.svg`) |
| [`assets/sprite.svg`](assets/sprite.svg) | All symbols bundled for `<use>` |
| [`graphics/web/`](graphics/web) | Web-optimized brand backgrounds (~2 MB). Full-res masters: `design-source/graphics/` in the repo, never deployed |

## Use it

**Web / HTML**
```html
<link rel="stylesheet" href="design-system/tokens.css">
<!-- color -->
<button style="background:var(--color-primary); color:var(--color-primary-ink)">Book a crew</button>
<!-- icon (from sprite) -->
<svg class="icon" width="24" height="24"><use href="design-system/assets/sprite.svg#i-shield"/></svg>
<!-- signature brand surface -->
<section class="mw-grid-bg mw-glow"> … </section>
```
Icon base style: `.icon{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}`.

**Documents / graphics (non-web)**
Use the hex values in [`tokens.json`](tokens.json) and the font **Manrope** (display 700–800,
body 400–600). Logo and icon SVGs in `assets/` import directly into Canva, Figma, Illustrator, Word.

**View the style guide**
Open [`index.html`](index.html) directly, or serve the repo root and visit
`/design-system/index.html` (e.g. `python -m http.server 8123`).

## Where the values came from

- **The logo** — `maintain-workforce-logo-lightbg.svg` supplies the two brand colors
  (Ink Teal `#07272D`, Hi-Vis Amber `#FFC400`) and names the typeface (Manrope, semibold,
  wide-tracked caps for the WORKFORCE line).
- **The Maintain group scaffolding** — dark surfaces, spacing, radius, motion and icon
  language are shared across the Maintain brands so the family stays recognisably one company;
  each brand swaps in its own accent (Workforce: amber).
- **Amber ramp, tints and status colors** — derived here (contrast-checked to WCAG AA) since
  the logo defines only the core pair. `--mw-amber-deep` is the darkest amber that still reads
  as amber while passing 4.5:1 on white.
