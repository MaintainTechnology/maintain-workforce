---
name: Maintain Worker
description: A dark, hi-vis brand where one amber marks the next action and everything else recedes. The content is the workforce exchange; the system is the Hi-Vis Standard.
colors:
  ink-teal: "#07272D"
  teal-deep: "#051F24"
  teal-mist: "#66A1AB"
  hi-vis-amber: "#FFC400"
  amber-mid: "#C79600"
  amber-deep: "#8F6400"
  amber-tint-1: "#FFF4CC"
  amber-tint-2: "#FFE699"
  black: "#101820"
  black-2: "#0C1319"
  cloud: "#F5F5F1"
  white: "#FFFFFF"
  ink: "#1F2D2B"
  slate: "#64748B"
  on-dark: "#FFFFFF"
  on-dark-muted: "#FFFFFFB3"
  on-dark-faint: "#FFFFFF8C"
  hairline: "#FFFFFF1A"
  hairline-light: "#07272D1F"
  status-active: "#22A05B"
  status-scheduled: "#3B82F6"
  status-pending: "#D97706"
  status-overdue: "#EA580C"
  status-critical: "#DC2626"
typography:
  display:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body-lg:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  sharp: "0"
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.5rem"
  6: "2rem"
  7: "3rem"
  8: "4rem"
  9: "6rem"
  10: "8rem"
components:
  button-primary:
    backgroundColor: "{colors.hi-vis-amber}"
    textColor: "{colors.ink-teal}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 2rem"
  button-primary-hover:
    backgroundColor: "{colors.amber-tint-2}"
    textColor: "{colors.ink-teal}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 2rem"
  button-ghost:
    textColor: "{colors.on-dark}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 2rem"
  panel:
    backgroundColor: "{colors.black-2}"
    rounded: "{rounded.lg}"
    padding: "2rem"
  site-header:
    backgroundColor: "{colors.ink-teal}"
    height: "68px"
  nav-link:
    textColor: "{colors.on-dark-muted}"
    fontSize: "0.875rem"
    fontWeight: 600
  status-dot:
    rounded: "{rounded.pill}"
    size: "8px"
---

# Design System: Maintain Worker (The Hi-Vis Standard)

> The reference documents in `../MaintainWorkforce/` are **content authorities
> only**: they define what the site says (the workforce exchange, its pages,
> its copy). The visual system is this repo's own Hi-Vis Standard, below. Where
> the reference build spec names fonts, tokens, eyebrows or monospace, it is
> overruled by this file.

## 1. Overview

**Creative North Star: "The Hi-Vis Standard"**

This system borrows its logic from safety-wear, not from web design. On a working site, one
colour is reserved for the thing that must be seen, and everything else deliberately recedes so
that reservation still means something at the end of a long shift. Hi-Vis Amber is that colour
here. Ink Teal is everything else: the ground, the panels, the bands, the dark you read against.
The discipline is not "use amber sparingly for taste". It is that amber marks the next action,
and if two ambers compete in one viewport, one of them is a bug.

The surface is dark end to end, and that is a locked decision rather than a mood. The brand mark
is amber chevrons on ink teal; the tokens are built on dark surfaces shared across the Maintain
group. A section that flips to a light theme mid-scroll breaks the family resemblance, so it
does not happen. Depth is carried by 1px hairlines at 10% white and by tonal steps between Ink
Teal, near-black and panel-black, not by shadow. Shadow is reserved for things that are
genuinely lifted off the page.

What this system explicitly rejects: **editorial-magazine styling** (display-serif italic
headlines, ruled multi-column grids, tracked lowercase metadata) and **borrowed second
families** (a monospace "data voice", a serif "premium voice"). Manrope carries every level,
and contrast comes from weight and size, never from a borrowed family.

**Key Characteristics:**

- One accent, rationed. Amber is a signal, not a decoration.
- Dark-locked surface, no theme flips between sections.
- Flat at rest; hairlines and tonal steps do the work shadows usually do.
- One type family (Manrope), 400 through 800, doing all the talking.
- Status is always a dot plus a written label, never colour alone.
- Field-legible: large tap targets, high contrast, no hover-only meaning.

## 2. Colors: The Hi-Vis Palette

A two-colour brand (deep petrol-teal ground, saturated safety amber) with a small set of
neutrals and a five-hue status ramp that is deliberately quieter than the accent.

### Primary

- **Hi-Vis Amber** (`#FFC400`): the brand's only attention colour. Primary buttons, the active
  step in a sequence, section-leading headings that mark a new group, icon accents. Never used
  as body text on light surfaces; use Amber Deep there.
- **Amber Tint 2** (`#FFE699`): the hover state for amber surfaces. Lighter, not darker.
- **Amber Mid** (`#C79600`) and **Amber Deep** (`#8F6400`): solid decorative fills, and the
  darkest amber that still reads as amber while passing 4.5:1 on white.

### Secondary

- **Teal Mist** (`#66A1AB`): the muted teal accent, for moments that need a second voice
  without spending the amber. Use sparingly.

### Neutral

- **Ink Teal** (`#07272D`): the signature ground. Page background, header, overlay scrims.
- **Teal Deep** (`#051F24`): a half-step darker, for recessed bands.
- **Black** (`#101820`) and **Black 2** (`#0C1319`): the near-black tonal steps. Black is the
  alternating section band; Black 2 is the panel fill that sits on top of it.
- **On Dark** (#FFFFFF), **On Dark Muted** (70%), **On Dark Faint** (55%): the three-step text
  ramp. Headings full white, body muted, metadata faint. Faint never carries paragraphs.
- **Hairline** (10% white): every border on the dark surface. One pixel, always.
- **Cloud / Ink / Slate**: the light-surface set, reserved for documents and print. The
  website does not use them.

### Tertiary

- **Status ramp**: Active `#22A05B`, Scheduled `#3B82F6`, Pending `#D97706`, Overdue
  `#EA580C`, Critical `#DC2626`. Tuned to at least 3:1 as non-text dots on the brand darks,
  deliberately quieter than the accent.

### Named Rules

**The Hi-Vis Rule.** Amber marks the next action. One primary amber element per viewport. If a
second appears, demote it to a ghost button or hairline border.

**The Dark Lock Rule.** The page background is Ink Teal from header to footer. Sections change
*texture* (grid overlay, glow, terrain art, near-black band), never *mode*.

**The Dot-and-Label Rule.** A status is a coloured dot plus a neutral uppercase label. Colour
never carries the meaning alone.

## 3. Typography

**Display / Body / Label:** Manrope, one family, served self-hosted via `next/font`.

Manrope is the group brand's own face, geometric with enough humanist warmth to avoid reading
as a tech brand. Its variable weight axis carries the whole hierarchy: 800 display, 700
titles, 600 labels and interface, 400 body.

### Hierarchy

- **Display** (800, `clamp(2.75rem, 6vw, 4.5rem)`, 1.05, -0.02em): the page h1. One per page.
- **Headline** (800, `clamp(2rem, 4vw, 3rem)`, 1.05, -0.02em): section headings.
- **Title** (700, `clamp(1.5rem, 3vw, 2rem)`, 1.2, -0.01em): sub-section and panel headings.
- **Body Large** (400, 1.125rem, 1.6): section intros. Capped at 58-60ch.
- **Body** (400, 1rem, 1.6): standard copy. Cap 65-75ch.
- **Label** (600, 0.6875rem, 0.08em, uppercase): status labels, trade codes, and short
  operational strings only.

### Named Rules

**The Single Family Rule.** Manrope carries every level. Hierarchy comes from weight and size,
never from importing a second family. A monospace or serif on this brand is a costume.

**The Caps-For-Labels-Only Rule.** Uppercase with 0.08em tracking is reserved for short
operational labels (statuses, trade codes, availability windows) and the wordmark. It is
explicitly *not* available as a section eyebrow. Never set body copy in caps.

**The Balance Rule.** `text-wrap: balance` on h1-h3, `text-wrap: pretty` on long prose.

## 4. Elevation

Flat by default and hairline-led. Depth is a 1px border at 10% white first, a tonal step
second. A panel on a band on the page reads as three layers with no shadow involved.

- **Medium** (`0 6px 20px rgba(7,39,45,.12)`): the primary amber button only.
- **Large** (`0 20px 50px rgba(5,31,36,.35)`): overlaid surfaces (the mobile menu panel).
- **Amber Glow** (`0 0 40px rgba(255,196,0,.25)`): atmosphere for hero moments, never a
  component shadow.

**The Flat-By-Default Rule.** Hairline first, tonal step second, shadow only when neither can
express the relationship. **The Lift-Means-Action Rule.** A shadow means interactive or
overlaid; a static panel never carries one.

## 5. Components

The register is **operational and legible**: surfaces read like a working board, not a
brochure. Generous targets, unmistakable states, information before ornament.

### Buttons

- **Shape:** fully rounded (999px pill), every size. There is no square button.
- **Primary:** Hi-Vis Amber fill, Ink Teal text, `0.75rem 2rem` padding, medium shadow, bold.
- **Hover / Focus:** lightens to Amber Tint 2 over 200ms on the brand ease-out; a trailing
  arrow icon nudges 3px toward the action (hover-capable pointers only). Active presses the
  pill to scale(0.97); the press transform runs at `--dur-fast` (120ms).
- **Ghost:** transparent, hairline border, full-white text, same pill and padding. Hover
  fills to 5% white.
- **Targets:** minimum 44x44px effective area. Gloved-hand interface.

### Panels / Containers

- 16px radius, Black 2 fill, 1px hairline on all sides, no shadow, 2rem padding.

### Navigation

- Sticky header, 68px, Ink Teal at 85% with backdrop blur, hairline bottom border. Brand
  left, links centre-right, primary action far right. Links 600 weight 0.875rem, muted to
  white on hover. Below `lg` the links collapse into a native `<details>` disclosure opening
  a Black 2 panel with the large shadow.

### Status Dots

- 8px circle in the status hue plus an uppercase 0.6875rem label at 0.08em tracking in On
  Dark Faint. The dot is `aria-hidden`; the label is the accessible name.

### Icons

- The 14-mark sprite at `/design-system/assets/sprite.svg` via `<use>`. `fill: none`,
  `stroke: currentColor`, 2px, round caps. 16px inline, 20px in buttons, 32px as panel lead.

### Signature: Brand Surfaces

`.mw-grid-bg` (40px amber grid at 5% over Ink Teal) and `.mw-glow` (off-centre amber radial)
are the brand's signature texture, used on the home hero and reserved for moments that need
to feel like the brand. The composed `.mw-grid-bg.mw-glow` rule renders both layers.
`.mw-glow-band` is the quiet centred variant for emotional beats.

## 6. Maintain Worker content vocabulary (addendum)

The site's content is the workforce exchange. Its recurring data renders through this
system, never through a second family:

- **Trade codes** (`ROOF`, `PLUMB`, `CARP`, `ELEC`), **ABNs**, and **availability windows**
  use the Label style: Manrope 600, 0.6875rem, 0.08em tracking, uppercase, On Dark Faint
  (or On Dark Muted when they must read at a glance).
- **Chips**: pill, hairline border, Label type. The "available now" live chip may use amber
  text plus the live dot; it counts against the viewport's amber budget.
- **The exchange ledger** is a content pattern, not a licence for new styling: two Black 2
  panels with hairline rows, a match node as a pill with the live dot, Label-style column
  headers. Sample data stays visibly labelled illustrative.
- **Numbered steps** in How-it-works keep their numerals as Headline-weight Manrope, not as
  eyebrow labels.

## 7. Do's and Don'ts

### Do:

- **Do** spend amber on the next action and nothing else. One primary amber per viewport.
- **Do** keep every border at 1px hairline on all four sides.
- **Do** express depth as hairline first, tonal step second, shadow last.
- **Do** pair every status colour with a written uppercase label.
- **Do** hold body copy to 65-75ch and lead paragraphs to ~58ch.
- **Do** honour `prefers-reduced-motion` for every animation.
- **Do** keep tap targets at 44x44px or larger, meaning available without hover.
- **Do** reach for the platform first (`<details>`, `<dialog>`) before a client component.

### Don't:

- **Don't** use editorial-magazine styling or any second type family (mono included).
- **Don't** put a tracked uppercase eyebrow above a heading. Caps are for the Label style's
  short operational strings only.
- **Don't** build hero-metric templates, identical icon-card grids, gradient text,
  glassmorphism-as-decoration, or coloured side-stripe borders.
- **Don't** flip a section to a light theme.
- **Don't** attach the amber glow to a card; it is atmosphere.
- **Don't** let a status read by colour alone.
- **Don't** exceed one primary amber per viewport.
