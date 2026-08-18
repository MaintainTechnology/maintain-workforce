---
name: maintain-visual
description: Generate on-brand social media marketing visuals and infographics for Maintain Workforce from pasted content and images — LinkedIn, Instagram, Facebook, X, TikTok, YouTube, in portrait, landscape, square or story orientation. Composes real HTML with the design-system tokens (Hi-Vis Standard), generates brand-graded imagery via Gemini (GEMINI_API_KEY), and screenshots pixel-exact PNGs with Playwright. Use this whenever the user pastes copy, stats, an announcement, or reference images and wants a social post visual, marketing graphic, infographic, banner, carousel slide, story, or thumbnail for Maintain Workforce — even if they just say "make this a LinkedIn post" or "turn this into a visual".
---

# maintain-visual

Turn pasted content (and optional images) into finished, platform-sized
marketing PNGs in the Maintain Workforce brand. The pipeline is **compose, not
generate**: Gemini makes the photography; the type, stats and layout are real
HTML styled with the design-system tokens, screenshotted at exact platform
dimensions. This is why the text is always verbatim and the brand is always the
actual brand — an image model approximating hex codes and Manrope is neither.

Skill files live in `.claude/skills/maintain-visual/` at the repo root; run the
paths below from the repo root. The design authorities are
`public/design-system/tokens.css` and `DESIGN.md` — when in doubt, read them.

## The brand, distilled for posters

The Hi-Vis Standard: on a working site one colour is reserved for what must be
seen. These rules survive every layout decision:

1. **Dark lock.** The ground is Ink Teal `#07272D` (tonal steps: `#051F24`,
   `#101820`, `#0C1319`). Never a light canvas.
2. **One amber moment.** Hi-Vis Amber `#FFC400` goes to the single most
   important element — the stat, the headline emphasis, *or* the footer band.
   Kicker label in amber is fine alongside ONE of those; if two big amber
   elements compete, demote one to white.
3. **Manrope only.** Weight and size carry hierarchy (800 display → 400 body).
   No monospace, no serif — on this brand a second family is a costume. (If a
   reference visual uses mono — e.g. QuoteMax collateral — translate it to the
   Label style, don't copy it.)
4. **Caps are for labels.** Uppercase + 0.08em tracking only for short
   operational strings: kickers, sources, trade codes, URLs. Never headlines or
   body.
5. **Hairlines, not shadows.** 1px at 10% white separates regions. Depth is
   tonal.
6. **Signature textures.** The 40px amber grid (`.grid-bg`) and off-centre
   amber glow (`.glow`) mark brand moments — use on the canvas ground, sparingly.

## Workflow

### 1. Distill the content

Pull copy blocks from what the user pasted: **kicker** (short label), **headline**
(the argument, sentence case), optional **stat** (the one number that earns the
amber), **source line** (attribution for any stat), **body** (≤ 2 sentences),
**footer** (URL + campaign line). Two hard rules:

- **Verbatim numbers.** Every figure, claim and URL must appear character-for-
  character in the user's content. Never invent, round, or "improve" a stat.
- **Attribute stats.** A number without its source line doesn't ship. If the
  pasted content has no source for a claim-like stat, ask or drop the stat.

If the user pasted images, save them into the work folder now (product
screenshots embed directly; photos may be regraded — see art direction).

### 2. Pick canvases

Read `references/platforms.md` for the size matrix. Resolve the user's platform
and orientation words to exact pixel sizes; default is LinkedIn portrait
1080×1350. Multiple platforms = one HTML file per canvas, **recomposed** for
each aspect (a story is not a stretched feed post — copy pressure differs per
platform; the matrix says how).

### 3. Set up the work folder

```
design-source/social/<yyyy-mm-dd>-<slug>/
```
(`design-source/` is the repo's masters-never-deploy area; social masters belong
there, not in `public/`.) Copy in the template and wordmark:

- `.claude/skills/maintain-visual/assets/template.html` → `<platform>-<orientation>.html`
- `public/design-system/assets/logo/wordmark-on-dark.svg` → `wordmark-on-dark.svg`
  (compact badge alternative: `logo/mark.svg`)

### 4. Generate imagery

Read `references/art-direction.md` — it has the house grade (petrol-teal blue
hour, amber worklights) and three prompt recipes (Environment / Crew /
Wireframe), plus how to handle pasted reference images. Then:

```
node .claude/skills/maintain-visual/scripts/generate-image.mjs \
  --prompt-file prompt.txt --out panel-1.png --aspect 4:5
```

Write the prompt to a file first (`--prompt-file` avoids shell-quoting pain on
Windows). Pick `--aspect` to match the slot the photo fills. **Look at every
generated panel** (Read the file) before using it — the reference lists the
rejection criteria. Not every visual needs a photo; a type-led stat poster on
the grid texture is fully on-brand.

### 5. Compose

Edit the HTML: set `--w`/`--h` inline on `.canvas` to the exact canvas size,
place the copy blocks, size type to the canvas (a 1080-wide portrait wants a
~80–110px headline, a ~180–260px stat; a 1920-tall story wants everything
bigger and less of it). The template's utility classes encode the token values —
build with them. Layout patterns that work at poster scale: text column over
photo strip (the template default); full-bleed photo with a scrim and type on
top (`linear-gradient(transparent, #07272D 70%)`); split panel (type left,
photo right) for landscape; type-only on `.grid-bg .glow` for pure stat plays.

### 6. Screenshot

```
npx playwright screenshot --viewport-size=1080,1350 --wait-for-timeout=4000 \
  linkedin-portrait.html linkedin-portrait.png
```

Viewport = canvas size, always. The wait lets Manrope and the panels load.

### 7. Verify — this is a design review, not a file check

Read the PNG and actually look at it: text clipped or overflowing? Contrast
readable at thumbnail size (squint test)? More than one amber moment? Photo
detail fighting the type? Wordmark crisp? Stat verbatim? Fix the HTML and
re-screenshot until it would survive a marketing manager's glance. Then present
the PNGs to the user (SendUserFile if available), named
`<platform>-<orientation>.png`, and keep the `.html` sources in the folder —
they are the editable masters for next time.
