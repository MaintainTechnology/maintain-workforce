# Maintain Audits — Design System

The canonical reference for every Maintain Audits visual: social graphics, branded
reports, letterhead, web, and future product UI. **Build against this, not ad-hoc values.**

## Files

| File | What it is |
|---|---|
| [`../DESIGN.md`](../DESIGN.md) | **The spec.** Full documentation of color, type, logo, icons, spacing, motion, usage rules, and consistency notes. Start here. |
| [`tokens.css`](tokens.css) | CSS custom properties + signature background utilities. Link this in any web build. |
| [`tokens.json`](tokens.json) | The same tokens, machine-readable (for scripts, Figma sync, other tooling). |
| [`index.html`](index.html) | **Living style guide** — renders the whole system. Open it to see everything at once. |
| [`assets/logo/`](assets/logo) | `wordmark-on-dark.svg`, `wordmark-on-light.svg` |
| [`assets/icons/`](assets/icons) | 14 brand line icons (`i-*.svg`) |
| [`assets/sprite.svg`](assets/sprite.svg) | All symbols bundled for `<use>` |

## Use it

**Web / HTML**
```html
<link rel="stylesheet" href="design-system/tokens.css">
<!-- color -->
<button style="background:var(--color-primary); color:var(--color-primary-ink)">Book an audit</button>
<!-- icon (from sprite) -->
<svg class="icon" width="24" height="24"><use href="design-system/assets/sprite.svg#i-shield"/></svg>
<!-- signature brand surface -->
<section class="ma-grid-bg ma-glow"> … </section>
```
Icon base style: `.icon{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}`.

**Documents / graphics (non-web)**
Use the hex values in [`tokens.json`](tokens.json) and the fonts **Albert Sans** (display) + **Inter** (body). Logo and icon SVGs in `assets/` import directly into Canva, Figma, Illustrator, Word.

**View the style guide**
Open [`index.html`](index.html) directly, or serve the repo root and visit
`/design-system/index.html` (e.g. `python -m http.server 8123`).

## Where the values came from

Everything was extracted empirically, not invented:
- **Live site** `maintainaudits.com.au` — the brand's own CSS variables (token names like *Forge Blue*, *Assurance Green*), the logo + icon SVGs, fonts, and background treatment.
- **[`../audits/`](../audits)** — every social post, sample report, letterhead, and team photo (fonts, colors, layout).

See **Consistency notes** in [`../DESIGN.md`](../DESIGN.md) for the real drift found (fonts differ across web / social / reports; two greens; one inferred severity tint).
