# HTML Template for First-Principles Guide (v2 — Editorial Design)

Render the synthesized guide content as an **editorial, typography-driven educational guide** — building from first principles with mechanism diagrams, pull quotes, and vertical typographic hierarchy. NO card grids, NO container-heavy design.

## Design Philosophy

This is a scientific editorial, not a SaaS landing page. Think: Nature Reviews meets Kinfolk.

1. **Typography-driven hierarchy** — Size, weight, whitespace, and thin rules create structure. NOT containers, borders, rounded corners, or card grids.
2. **No card grids** — NEVER use `.principles-grid`, `.summary-cards`, or any card-in-a-grid pattern. These feel "vibe-code-y." Use vertical typographic stacks instead.
3. **Mechanism diagrams** — Where possible, show actual signaling pathways (enzymes, metabolites, arrows showing causation) in an approachable way. Not generic infographic boxes.
4. **Pull quotes** — Centered serif italic text between thin rules. Replaces "key takeaway" boxes.
5. **The Bottom Line** — A single prose paragraph with a left accent border. Replaces "3 Things to Know" cards.
6. **Roman numeral sections** — I, II, III, IV, V in small accent text. Not giant gold numbers.
7. **No company names** — Guide sections NEVER name specific companies. Only sponsors in Featured Partner profiles get named. Use platform-type frameworks instead.

## CRITICAL RULES

1. **No paragraph longer than 3 sentences** in the main flow
2. **Bold the first sentence** of every paragraph as the lead
3. **Every 2-3 paragraphs must have a visual break** — diagram, pull quote, table, or criterion
4. **Dense technical content goes inside `<details>`** — reader understands the page without opening any
5. **Each section gets at least ONE SVG diagram** — mechanism pathways preferred
6. **NEVER name specific companies in the guide body** — use generic platform-type language. Companies only appear in Featured Partner profiles (which are sponsor-gated).

## Font Stack

```
--font-display: "Cormorant Garamond"  — titles, h1, h2, pull quotes, criterion questions
--font-body: "Source Serif 4"         — body text, lede paragraphs
--font-ui: "DM Sans"                  — labels, tables, byline, meta, badges, captions
```

## Color Palette

```
--paper: #FEFDFB         — page background (warm white)
--paper-warm: #F5F3EE    — subtle warm sections
--ink: #1A1A1A            — h1, h2, strong
--ink-2: #3A3A3A          — body text
--ink-3: #6A6A6A          — secondary text, captions, criteria descriptions
--ink-4: #9A9A9A          — meta, byline, faint labels
--rule: #D4D0C8           — primary rules
--rule-light: #E8E5DE     — light dividers between criteria
--accent: #8B7355         — section markers, accent borders, labels (warm brown)
--green: #4A7A5A          — mechanistic notes, positive status
--blue: #4A6A7A           — links, blue pathway nodes
--orange: #B06840         — aging/decline in diagrams
--purple: #6A5A7A         — category accents
```

## Page Structure

```
┌───────────────────────────────────────────────────────────┐
│ Breadcrumb                                                 │
│ KICKER: NGM Commons · First-Principles Guide               │
│ H1 (Cormorant Garamond, 2.8rem)                           │
│ Deck (Cormorant italic, 1.25rem)                           │
│ Byline (DM Sans, 13px) + rule below                       │
├───────────────────────────────────────────────────────────┤
│ THE BOTTOM LINE                                            │
│ Left accent border, single prose paragraph (18px)          │
│ Weaves 3 key insights into flowing text, not cards         │
├───────────────────────────────────────────────────────────┤
│ I — [The Question / What Is This?]                         │
│   .lede paragraph (1.15rem, darker)                        │
│   Body paragraphs (bold leads, max 3 sentences)            │
│   [SVG: Concept diagram — e.g., diverging trajectories]    │
│   Pull quote (centered Cormorant italic between rules)     │
├───────────────────────────────────────────────────────────┤
│ II — [The Molecular Machinery / How It Works]              │
│   .lede paragraph                                          │
│   [SVG: MECHANISM DIAGRAM — signaling pathway]             │
│   Body text with h3 subsections                            │
│   .mechanistic-note (green left border, no box)            │
│   [SVG: Timeline/evolution diagram if applicable]          │
│   <details> for deep technical content                     │
│   Pull quote                                               │
├───────────────────────────────────────────────────────────┤
│ III — [Evaluating the Evidence]                            │
│   .lede paragraph                                          │
│   VERTICAL CRITERIA LIST (not cards!):                     │
│     .criterion (border-bottom rule between each)           │
│       .criterion-name (small caps, accent color)           │
│       .criterion-status (green/gray checkmark)             │
│       .criterion-question (Cormorant italic, 1.3rem)       │
│       .criterion p (body description)                      │
│   <details> for deeper evidence                            │
│   Pull quote                                               │
├───────────────────────────────────────────────────────────┤
│ IV — [The Commercial Landscape]                            │
│   .lede paragraph                                          │
│   [SVG: Decision flow — NO company names]                  │
│   PLATFORM-TYPES TABLE (not company directory):            │
│     Columns: Platform Type | What It Offers |              │
│              What to Ask | Typical Price Range             │
│   .directory-note pointing to Featured Partners            │
├───────────────────────────────────────────────────────────┤
│ V — [From Understanding to Action]                         │
│   Action pathways table (Finding → Response)               │
│   Framing guidance for patients                            │
├───────────────────────────────────────────────────────────┤
│ ═══ Featured Partners (layer label) ═══                    │
│ Partner CTA or featured-partner cards (sponsors only)      │
├───────────────────────────────────────────────────────────┤
│ FAQ (typographic — just .faq-q and .faq-a, no containers) │
├───────────────────────────────────────────────────────────┤
│ Sources (DM Sans, 12px)                                    │
├───────────────────────────────────────────────────────────┤
│ Sponsor CTA (dark background block)                        │
└───────────────────────────────────────────────────────────┘
```

## Key Component Patterns

### The Bottom Line (replaces summary cards)
```html
<aside class="bottom-line">
  <span class="bottom-line-label">The Bottom Line</span>
  <p>[Single paragraph weaving 3 key insights together. Uses <em> and <strong>.]</p>
</aside>
```

### Section Marker (replaces numbered headers)
```html
<div class="section-marker">
  <span class="section-num">I</span>
  <h2>[Section Title]</h2>
</div>
```

### Pull Quote (replaces key-takeaway boxes)
```html
<p class="pull-quote">[One-sentence insight — centered, Cormorant italic, thin rules above/below]</p>
```

### Evaluation Criterion (replaces principle cards)
```html
<div class="criterion">
  <div class="criterion-header">
    <span class="criterion-name">[NAME IN SMALL CAPS]</span>
    <span class="criterion-status established">✓ [Status]</span>
  </div>
  <p class="criterion-question">[Italic question in Cormorant?]</p>
  <p>[Brief description in body text]</p>
</div>
```
Status classes: `.established` (green) or `.not-established` (gray).

### Mechanistic Note (replaces kb-insight boxes)
```html
<div class="mechanistic-note">
  <div class="mechanistic-note-label">Mechanistic Insight</div>
  <p>[Signaling pathway insight — green left border, no box]</p>
</div>
```

### Collapsible Deep Dive (minimal, no container)
```html
<details>
  <summary>[Label text]</summary>
  <div class="detail-body">
    <p>[Content with left border indent]</p>
  </div>
</details>
```

### Platform-Types Table (replaces company directory)
```html
<table>
  <thead>
    <tr>
      <th>Platform Type</th>
      <th>What It Offers</th>
      <th>What to Ask</th>
      <th>Typical Price Range</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>[Category name]</strong></td>
      <td>[Description of what this type does]</td>
      <td>[Questions clinicians should ask vendors]</td>
      <td>[Price range]</td>
    </tr>
  </tbody>
</table>
<p class="directory-note">For specific company evaluations, see our <strong>Featured Partner</strong> profiles, where sponsored companies receive a comprehensive three-lens clinical analysis.</p>
```

## SVG Diagram Guidelines

Each guide should include 3-5 SVG diagrams. Prioritize:

1. **Mechanism/pathway diagrams** — Show actual biological pathways with enzymes, metabolites, arrows. Use color-coded nodes: blue for metabolic, green for protective, orange for damage/aging. Include a DNA/molecular representation if relevant.
2. **Timeline/evolution diagrams** — Horizontal timelines showing progression of approaches or technology generations.
3. **Decision flow diagrams** — Goal-based selection trees. NO company names — use platform-type descriptions.
4. **Concept visualization** — Diverging curves, spectrums, hierarchies rendered as clean data viz.

SVG style rules:
- Font family: `'DM Sans',system-ui,sans-serif`
- Use the color palette variables (as hex values in SVG)
- Thin strokes (1-2px), no heavy borders
- No background rects on SVGs — let them sit on the page
- Include `<p class="figure-caption"><strong>Figure N.</strong> [Description]</p>` below each

## Schema Markup

Use Article schema with topic tags (NOT a company list):

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How to Think About [Category]: A First-Principles Guide",
  "datePublished": "[ISO date]",
  "dateModified": "[ISO date]",
  "author": {
    "@type": "Person",
    "name": "Dr. Anant Vinjamoori",
    "jobTitle": "Physician, Founder of Next Generation Medicine"
  },
  "publisher": { "@type": "Organization", "name": "NextGen Medicine" },
  "about": [
    { "@type": "Thing", "name": "[Topic 1]" },
    { "@type": "Thing", "name": "[Topic 2]" },
    { "@type": "Thing", "name": "[Topic 3]" }
  ]
}
```

## Quality Checklist

Before saving, ALL must pass:

**Editorial Design (v2):**
- [ ] Uses Cormorant Garamond + Source Serif 4 + DM Sans (NOT Inter/Cormorant Garamond)
- [ ] NO card grids anywhere (no `.principles-grid`, no `.summary-cards`)
- [ ] "The Bottom Line" callout with left accent border (not cards)
- [ ] Roman numeral section markers (I, II, III...) not gold numbers
- [ ] Pull quotes between thin rules (not gold takeaway boxes)
- [ ] Evaluation criteria as vertical typographic stack (not card grid)
- [ ] At least 1 mechanism/pathway diagram showing actual biology
- [ ] Platform-types framework table (not company directory)
- [ ] NO specific company names in guide body

**Content Quality:**
- [ ] No paragraph exceeds 3 sentences in main flow
- [ ] First sentence of every paragraph is bold
- [ ] At least 3 SVG diagrams total
- [ ] At least 1 `<details>` collapsible for dense content
- [ ] FAQ answers start with bold direct answer
- [ ] Framework badge reads `3lens-guide-v2 | {category}`
- [ ] All sources are real, with DOIs where available

## Output Files

Save to `{{output_dir}}/{{slug}}/`:
- `guide_content.json` - Structured data with all lens outputs + guide structure
- `guide_page.html` - Rendered editorial guide
