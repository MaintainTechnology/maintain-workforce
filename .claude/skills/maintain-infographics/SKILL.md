---
name: maintain-infographics
description: Branded social-graphics generator for Maintain Audits marketing. Use whenever the user wants "a post for Maintain Audits", an infographic, a social tile, a stat card, a testimonial card, a LinkedIn carousel, or a flyer. You supply the copy; it handles all the styling so every graphic comes out in the same brand. Produces pixel-exact PNGs plus a ready-to-post carousel PDF from a copy-only SLIDES deck, in the brand's "Assurance" design system (Forge Blue + Assurance Green, Albert Sans + Inter). User-invocable via /maintain-infographics. Requires Playwright to render.
---

# Maintain Audits — Infographics

A branded social-graphics generator for Maintain Audits. **You give it the copy; it handles the styling** — every graphic comes out looking like the same brand.

## What it makes
On-brand **PNGs** and a ready-to-post **carousel PDF**: LinkedIn carousels, Instagram posts, stat cards, testimonial cards, "how it works" graphics, and marketing tiles. Default size is a **1080×1350** LinkedIn carousel (override per platform).

## How it works
A bundled HTML engine (`assets/generator.html`) is driven by a **SLIDES deck** (`slides.json`) — one entry per panel. You edit the deck (headline, numbers, quote, etc.), then run `scripts/render.mjs` (Playwright) to output `slide-1.png … slide-N.png` + `carousel.pdf`.

```bash
# one-time
npm i playwright && npx playwright install chromium
# edit slides.json, then render
node .claude/skills/maintain-infographics/scripts/render.mjs slides.json --out ./out
# other sizes: --size 1080x1080 (IG post) · 1080x1920 (story)
```

The engine pulls the **real logo and icon set** from `design-system/assets/sprite.svg`, so branding always matches the source of truth. It also draws on the **brand graphics library** in `assets/graphics/` (gradients, covers, mountain-form and section backgrounds) — see *Backgrounds & graphics*. Testimonial panels can take a supplied headshot (`avatar`), rendered in the brand's green-gradient circle.

## The design it enforces (the "Assurance" system)
Deep **Forge Blue `#07272D`** canvas with a 1px green grid + green glow · one accent, **Assurance Green `#3DDC84`** (Signal Green `#06F285` rare) · **Albert Sans** (display) + **Inter** (body) · small/square corners · authoritative, evidence-led tone. Mirrors `DESIGN.md` / `design-system/tokens.css`.

## Six panel types you compose from
| Type | Purpose | Key fields |
|---|---|---|
| `cover` | Title / hero slide over a graphic | `headline`, `eyebrow?`, `sub?`, `bg` |
| `stat` | Hard-number hook | `value`, `label`, `note`, `kicker` |
| `list` | Breakdown in bordered cards | `headline`, `items[{title, detail}]` |
| `steps` | Real ordered sequence | `headline`, `steps[]` |
| `quote` | Real testimonial | `quote`, `name`, `role`, `avatar?` |
| `cta` | Closing call to action | `headline`, `sub?`, `action`, `url` |

**Any panel also accepts `bg` (a background graphic — see below) and `kicker` (a small top-right label).**

A typical carousel runs **cover → stat → list → steps → cta**. Deck shape:
```json
{ "size": "1080x1350", "handle": "maintainaudits.com.au", "slides": [ { "type": "stat", ... } ] }
```

## Backgrounds & graphics
Every file in `assets/graphics/` is usable as a full-bleed panel background. Add `bg` to any slide; the engine applies a legibility scrim and **flips the text colour automatically** — dark graphic → white text, light graphic → Forge-Blue text (per the brand's scrim rule).

- **Dark (white text):** `cover` · `cover-2` · `green-gradient` · `blue-gradient` · `gradient` · `gradient-portrait` · `section` · `mountain-forms-1` · `mountain-forms-2` · `pantone-glow` · `mountain` · `blu-gradient`
- **Light (Forge-Blue text):** `gradient-white` · `white-bg` · `white-gradient` · `white-linear` · `mountain-line`

```json
{ "type": "cover", "bg": "cover", "eyebrow": "Franchise assurance", "headline": "The audit force behind Australia's franchise networks" }
```

Any other filename works too (`"bg": "my-file.jpg"` resolves under `graphics/web/`, or pass a full relative path). Override the auto tone with `"tone": "light"` / `"dark"`. The renderer uses the **web-optimized** versions in `assets/graphics/web/` (fast, crisp at 2×); full-resolution originals live in `assets/graphics/` for print. Helper scripts ship alongside: `web_optimize.py` (regenerate the `web/` set) and `recolor.py` (recolour a graphic to brand green). `render.mjs` warns if a `bg` name has no matching file.

## Anti-slop rules (what keeps it from reading as AI-made)
- No white text on green (text on green fills is Forge Blue). No second accent colour.
- No emoji, no exclamation marks, no em-dashes in copy. `render.mjs` **warns** on any it finds.
- No invented testimonials, no fake stats — pull real content from the `audits/` materials.
- No text clipping at the frame edge — `render.mjs` warns if a panel overflows; shorten the copy or reduce items.
- Inherits the design-system bans: no gradient text, side-stripe borders, decorative glass, or per-panel eyebrows.

## When to use
Any time the user wants a Maintain Audits post, infographic, social tile, stat card, testimonial, or flyer — it is the on-brand alternative to hand-rolling CSS each time. User-invocable with **`/maintain-infographics`**.

## Caveat
Rendering needs **Playwright** (`npm i playwright && npx playwright install chromium`). Editing the deck and previewing `assets/generator.html` in a browser needs nothing.
