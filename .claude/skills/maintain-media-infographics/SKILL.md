---
name: maintain-media-infographics
description: >-
  Generate on-brand Maintain Media marketing graphics — LinkedIn carousels, Instagram posts, stat
  cards, testimonial cards, "how it works" step graphics, list/breakdown tiles, and closing CTA
  panels — as PNG slides plus a ready-to-post carousel PDF. Use this whenever the user wants a
  social post, carousel, infographic, stat card, testimonial graphic, marketing tile, or flyer FOR
  MAINTAIN MEDIA, or says things like "make a post/graphic for Maintain Media," even if they don't
  name this skill. You supply the copy; it enforces the brand (purple #a04dff on deep teal-black,
  the real logo, Albert Sans + Vela Sans, real icons) and strict anti-slop rules so every graphic
  reads as the same brand. NOT for building websites, app UI, or editing the design system itself.
---

# Maintain Media Infographics

A branded social-graphics generator for Maintain Media. The user gives you the **copy**; you compose
a `SLIDES` array and render it. The styling is fixed by the brand engine, so every graphic comes out
looking like the same company — no hand-rolling CSS each time, no drift.

**What it produces:** `slide-1.png … slide-N.png` (one per panel, at exact platform size) plus
`carousel.pdf` (ready to upload as a LinkedIn document / carousel). Default size is a **1080×1350**
LinkedIn/Instagram carousel; the engine also does 1080×1080 and 1080×1920.

## Why it exists

Marketing graphics rot into "AI slop" when each one is styled from scratch: colours drift, fonts
wander, text clips the frame, testimonials get invented to fill space. This skill removes that by
fixing the design system in a bundled engine and only letting you change the **content**. Your job
is to get the copy right and pick the right panel for each idea — the engine guarantees it looks
like Maintain Media.

## The design it enforces (don't fight it)

- **Canvas:** deep teal-black (`#08282d` → `#061518`) with a faint purple wireframe grid. Never a
  white/cream background.
- **One accent:** purple `#a04dff`. There is no second accent colour — restraint is the brand.
- **Type:** Vela Sans for display (headlines, big stat numbers), Albert Sans for everything else.
  Real bundled font files, embedded at render.
- **Marks:** the real Maintain Media logo (top-left of every slide) and a subtle `01 / 05` page
  marker (top-right) so carousels read in order.
- **Icons:** the engine auto-discovers **every icon in `assets/`** (~90 — the full Iconography line
  set plus the coloured set) and recolours any of them to brand purple. Request one by name on a
  `list` item; see "Icons" below.

## Panels (compose a carousel from these)

A strong carousel usually runs **stat → list → steps → quote → cta** — hook with a number, break it
down, show the sequence, prove it with a real voice, then ask for the action. Use the panel that
actually fits the idea; don't force all five.

| Panel | Use it for | Key fields |
|-------|-----------|------------|
| `stat` | a hard-number hook / single metric | `value`, `unit`, `label`, `support`, `kicker?` |
| `list` | a breakdown in bordered cards (2–4) | `title`, `items:[{icon?, title, text?}]` |
| `steps` | a real ordered sequence | `title`, `steps:[{title, text?}]` |
| `quote` | a REAL testimonial | `quote`, `name`, `role?` |
| `cta` | the closing call to action | `headline`, `sub?`, `action?`, `url?` |
| `cover` | an opening title / hero slide | `headline`, `sub?`, `kicker?`, `bg?` |

Every panel also accepts optional `footer` (defaults to `maintainmedia.com`), `logo` (`"dark"`
default, or `"light"` for light backgrounds), and **`bg`** — a real brand background graphic behind
the content (aliases: `wireframe`/`mountain`, `gradient`/`hero`, `cover`, `section`; a legibility
scrim is added automatically). Use `bg` sparingly — it shines on a `cover`, less so on dense panels.

**SLIDES array — example (this is `SLIDES.example.json`):**

```json
[
  { "type": "stat", "kicker": "The problem", "value": "40", "unit": "%",
    "label": "of marketing time is lost re-making the same graphic",
    "support": "Every post rebuilt from scratch is time not spent on the message." },
  { "type": "list", "title": "One system, every asset", "items": [
    { "icon": "target", "title": "On-brand by default", "text": "Real logo, real purple, real fonts, every time." },
    { "icon": "chart", "title": "Built from your numbers", "text": "Cards straight from the data you give it." } ] },
  { "type": "steps", "title": "How it works", "steps": [
    { "title": "Write the copy", "text": "Headlines, numbers, and a real quote." },
    { "title": "Render the deck", "text": "The engine styles every panel to spec." } ] },
  { "type": "quote", "quote": "It finally all looks like the same company.",
    "name": "Jordan Lee", "role": "Head of Growth, Acme" },
  { "type": "cta", "headline": "Make it look like Maintain Media.",
    "sub": "Give it the copy. It handles the design.", "action": "Start a carousel", "url": "maintainmedia.com" }
]
```

**Icons** (for `list` items) — request any icon from the library by name; the engine resolves it
(with common aliases) and recolours it to brand purple, whether the source is a dark line icon or a
coloured one. Handy names: `target`, `chart`, `trend`, `database`, `coin`, `wallet`, `search`,
`shield`, `calendar`, `clock`, `book`, `email`, `globe`, `flag`, `puzzle`, `structure`/`network`,
`team`, `lightning`, `report`, `settings`, `star`, `check`, `fast`, `linkedin`. Unknown names are
simply omitted, never broken.

## Workflow

1. **Get the real copy.** Ask for or extract the numbers, headlines, and any testimonial. Never
   invent stats or quotes — a fake testimonial is the fastest way to look like slop and erode trust.
2. **Compose the `SLIDES` array** — one entry per panel, picking the panel that fits each idea.
   Write it to a JSON file (e.g. `my-deck.json`).
3. **Render:**
   ```bash
   node .claude/skills/maintain-media-infographics/scripts/render.mjs my-deck.json --out ./out
   # options: --size 1080x1080 | 1080x1920   --footer "@maintainmedia"   --scale 2 (retina)
   ```
   Output: `out/slide-1.png … slide-N.png` + `out/carousel.pdf`.
4. **Look at the result.** Open a PNG (or the PDF) and check it at 100%. The engine auto-shrinks
   oversized text so nothing clips, but long copy still reads best when it's tight — trim wordy
   labels rather than relying on the shrink.
5. **Report** what you made: panel sequence, size, and the file paths.

To preview the design without rendering, just open `assets/generator.html` in a browser — it shows a
live example deck.

## Anti-slop rules (this is what keeps it from reading as AI-made)

- **No invented testimonials or fake stats.** Content comes from the user. If you don't have a real
  quote, drop the `quote` panel — don't fabricate one.
- **One accent only.** Purple. Never introduce a second brand colour.
- **No white text on the purple accent** for small text — the engine keeps CTA labels dark-on-purple
  and large for exactly this reason. Body text is white/`#cdd9db` on the dark canvas.
- **No emoji, no exclamation marks, no em-dashes.** Use plain sentences and hyphens; the brand voice
  is confident, not shouty.
- **No text clipping.** Keep copy tight; the engine's safe margins + auto-fit are a backstop, not a
  license for walls of text.
- Everything stays WCAG AA on contrast, uses the real logo/fonts/icons, and keeps one dominant idea
  per slide.

## Requirement

Rendering needs **Playwright + Chromium** (once): `npm i -D playwright && npx playwright install
chromium`. Without it, `render.mjs` prints the install command and exits. Everything else (composing
slides, previewing `generator.html`) works with no dependencies.

## Extending

- **Drop assets in and they're used automatically.** `render.mjs` scans `assets/` on every run and
  builds a manifest of every icon, background, and logo, so new files become available by name with
  no code change. Add a friendly word for one in `generator.html`'s `ALIASES` / `BG_ALIASES` maps if
  you want an easy handle.
- New panel type: add a `case` in `generator.html`'s `panel()` switch plus its CSS. Keep it on the
  same tokens so it stays on-brand.
- The engine, fonts, logos, icons, and the full brand toolkit are bundled under `assets/`, so the
  skill is self-contained and portable.
