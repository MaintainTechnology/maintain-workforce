# NGM Editorial Design System

Complete style guide for NextGeneration Medicine HTML content. Extracted from the live NGM Commons guide pages and partners landing page.

---

## Brand Identity

NextGeneration Medicine is a longevity medicine education platform targeting:
- Physicians entering the longevity space
- Health-conscious professionals
- Evidence-based practitioners

**Voice:** Authoritative yet accessible, evidence-based, clinically actionable.

**Aesthetic:** Typography-driven editorial hierarchy. Magazine-quality, not corporate. Think: The Economist, NEJM, The Atlantic. No card grids — use vertical rhythm, pull quotes, and typographic markers.

---

## Typography

Two-font stack ("Sei × Ma" — modern Japanese editorial). Never deviate from this.

```
Display: "Zen Old Mincho", "Noto Serif JP", Georgia, serif    — headlines, pull quotes, section markers
Body+UI: "Familjen Grotesk", system-ui, sans-serif             — running text, lede paragraphs, labels, kickers, captions, metadata, tables
```

### Google Fonts Import (Lead Magnets)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Zen+Old+Mincho:wght@400;500;600;700;900&display=swap" rel="stylesheet">
```

### Type Scale
| Element | Font | Size | Weight | Line-height | Color |
|---------|------|------|--------|-------------|-------|
| H1 | Zen Old Mincho | 2.8rem | 500 | 1.1 | --ink |
| H2 | Zen Old Mincho | 2rem | 500 | 1.2 | --ink |
| H3 | Zen Old Mincho | 1.35rem | 500 | 1.3 | --ink |
| Body | Familjen Grotesk | 17px | 400 | 1.7 | --ink-2 |
| Lede | Familjen Grotesk | 1.15rem | 400 | 1.65 | --ink |
| Kicker | Familjen Grotesk | 11px | 700 | — | --accent |
| Deck | Familjen Grotesk | 1.2rem | 400 italic | 1.55 | --ink-3 |
| Caption | Familjen Grotesk | 13px | 400 | 1.6 | --ink-3 |
| Label | Familjen Grotesk | 10-11px | 700 | — | varies |

**Italics rule:** italics come from Familjen Grotesk (it has true italics) — decks and asides. Never slant Zen Old Mincho (no italic face exists); pull quotes stand upright in Zen Old Mincho, distinguished by size and centering.

---

## Color Palette

### Guide Pages (Editorial / Lead Magnets) — "Sei × Ma"
```css
:root {
  --linen: #F3F2EC;        /* Page background — warm linen */
  --paper: #FAF9F5;         /* Washi — cards / raised surfaces, never pure white */
  --paper-alt: #ECEAE2;     /* Callout / note backgrounds */
  --paper-cool: #E7E4D9;    /* Deeper alt band */

  --ink: #232220;           /* Sumi near-black — primary text, headings */
  --ink-2: #4A4844;         /* Body text */
  --ink-3: #76736C;         /* Secondary text */
  --ink-4: #A6A39A;         /* Tertiary text, captions */
  --ink-faint: #B6B1A4;     /* Very light text */
  --rule: #DEDBD2;          /* Primary dividers */
  --rule-light: #E8E5DD;    /* Light dividers */

  --accent: #3E5A6E;        /* Signature slate — kickers, links, borders, badges */
  --accent-light: #5C7E95;  /* Lighter slate */
  --pine: #4F6B57;          /* Established / positive / mechanistic notes */
  --clay: #BD6B4E;          /* Mixed / cautionary / CTA hover */
  --link: #3E5A6E;          /* Links = slate */
}
```

### Usage Rules
- Accent (slate) appears only in kickers, left-borders, links, and small labels — never across large fields
- Prefer ink tones for most elements
- Page is linen (#F3F2EC), surfaces are washi (#FAF9F5) — never pure white
- Borders are warm-toned (#DEDBD2), not cool gray

---

## Lead Magnet HTML Template

Lead magnets use the editorial guide design with CSS `<style>` blocks (not inline styles) for clean, maintainable code.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | NGM Commons</title>
  <meta name="description" content="{description}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Zen+Old+Mincho:wght@400;500;600;700;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --font-display: "Zen Old Mincho", "Noto Serif JP", Georgia, serif;
      --font-body: "Familjen Grotesk", system-ui, sans-serif;

      --linen: #F3F2EC;
      --paper: #FAF9F5;
      --paper-alt: #ECEAE2;
      --paper-cool: #E7E4D9;
      --ink: #232220;
      --ink-2: #4A4844;
      --ink-3: #76736C;
      --ink-4: #A6A39A;
      --ink-faint: #B6B1A4;
      --rule: #DEDBD2;
      --rule-light: #E8E5DD;

      --accent: #3E5A6E;
      --accent-light: #5C7E95;
      --pine: #4F6B57;
      --clay: #BD6B4E;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-body);
      font-size: 17px;
      line-height: 1.7;
      color: var(--ink-2);
      background: var(--linen);
      font-variant-numeric: tabular-nums;
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 24px 80px;
      -webkit-font-smoothing: antialiased;
    }

    h1 { font-family: var(--font-display); font-size: 2.8rem; font-weight: 500; line-height: 1.1; color: var(--ink); letter-spacing: -0.01em; margin-bottom: 16px; }
    h2 { font-family: var(--font-display); font-size: 2rem; font-weight: 500; color: var(--ink); line-height: 1.2; margin: 0; }
    h3 { font-family: var(--font-display); font-size: 1.35rem; font-weight: 500; color: var(--ink); margin: 40px 0 12px; line-height: 1.3; }
    p { margin-bottom: 20px; }
    strong { color: var(--ink); font-weight: 600; }

    .breadcrumb { font-family: var(--font-body); font-size: 13px; color: var(--ink-4); margin-bottom: 48px; }
    .breadcrumb a { color: var(--accent); text-decoration: none; }
    .kicker { font-family: var(--font-body); font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 16px; }
    .deck { font-family: var(--font-body); font-size: 1.2rem; font-style: italic; color: var(--ink-3); line-height: 1.55; max-width: 620px; margin-bottom: 20px; }
    .byline { font-family: var(--font-body); font-size: 13px; color: var(--ink-4); display: flex; gap: 8px; flex-wrap: wrap; padding-bottom: 28px; border-bottom: 1px solid var(--rule); }

    .bottom-line { margin: 48px 0 64px; padding: 24px 28px; padding-left: 24px; border-left: 2px solid var(--accent); background: var(--paper-alt); }
    .bottom-line-label { font-family: var(--font-body); font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 12px; }
    .bottom-line p { font-size: 16px; line-height: 1.7; color: var(--ink-2); margin: 0; }

    .section-marker { margin-bottom: 32px; }
    .section-num { font-family: var(--font-display); font-size: 14px; font-weight: 500; letter-spacing: 0.2em; color: var(--accent); display: block; margin-bottom: 6px; }
    section { margin-top: 80px; }

    .lede { font-size: 1.15rem; line-height: 1.65; color: var(--ink); max-width: 660px; margin-bottom: 24px; }
    .pull-quote { margin: 48px auto; padding: 32px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); font-family: var(--font-display); font-size: 1.6rem; font-weight: 500; line-height: 1.5; color: var(--ink); text-align: center; max-width: 600px; letter-spacing: -0.01em; }

    .figure { margin: 48px 0; }
    .figure svg { width: 100%; height: auto; display: block; }
    .figure-caption { margin-top: 12px; font-family: var(--font-body); font-size: 13px; line-height: 1.6; color: var(--ink-3); }
    .figure-caption strong { color: var(--ink-2); font-weight: 600; }

    .mechanistic-note { margin: 40px 0; padding: 24px 28px; padding-left: 20px; border-left: 2px solid var(--pine); background: var(--paper-alt); }
    .mechanistic-note-label { font-family: var(--font-body); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pine); margin-bottom: 8px; }
    .mechanistic-note p { font-size: 15px; line-height: 1.75; color: var(--ink-3); margin: 0; }

    table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: 13px; line-height: 1.6; margin: 32px 0; }
    thead th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); padding: 10px 14px; border-bottom: 2px solid var(--ink); }
    tbody td { padding: 10px 14px; border-bottom: 1px solid var(--rule-light); color: var(--ink-2); vertical-align: top; }
    tbody td strong { font-weight: 600; color: var(--ink); }
    tbody tr:last-child td { border-bottom: 1px solid var(--rule); }

    .ev-strong { color: var(--pine); font-weight: 600; }
    .ev-moderate { color: var(--accent); font-weight: 600; }
    .ev-emerging { color: var(--clay); font-weight: 600; }
    .ev-preliminary { color: var(--ink-4); font-weight: 600; }

    .sources-section { margin-top: 80px; padding-top: 40px; border-top: 1px solid var(--rule); }
    .sources-section h2 { font-size: 1.2rem; margin-bottom: 20px; }
    .source-item { font-family: var(--font-body); font-size: 12px; line-height: 1.6; color: var(--ink-3); margin-bottom: 8px; }
    .source-item a { color: var(--accent); text-decoration: none; }

    .partner-cta { margin: 64px 0 0; padding: 40px; background: var(--paper-alt); text-align: center; }
    .partner-cta h3 { font-family: var(--font-display); font-size: 1.5rem; font-weight: 500; color: var(--ink); margin: 0 0 12px; }
    .partner-cta p { font-family: var(--font-body); font-size: 14px; color: var(--ink-3); max-width: 520px; margin: 0 auto 20px; line-height: 1.7; }
    .partner-cta a.cta-btn { display: inline-block; font-family: var(--font-body); font-size: 13px; font-weight: 600; letter-spacing: 0.04em; padding: 10px 28px; background: var(--ink); color: var(--linen); text-decoration: none; border-radius: 2px; }
    .partner-cta a.cta-btn:hover { background: var(--clay); }

    @media (max-width: 640px) {
      body { padding: 32px 16px 60px; }
      h1 { font-size: 2rem; }
      h2 { font-size: 1.6rem; }
      .deck { font-size: 1.1rem; }
      .bottom-line p { font-size: 16px; }
      .pull-quote { font-size: 1.2rem; padding: 24px 0; }
      table { font-size: 12px; }
      thead th, tbody td { padding: 8px 10px; }
    }
  </style>
</head>
<body>
  <article>
    <nav class="breadcrumb">
      <a href="/commons">NGM Commons</a> &rarr; {topic}
    </nav>

    <header>
      <span class="kicker">NGM Commons &middot; {type_label}</span>
      <h1>{title}</h1>
      <p class="deck">{deck}</p>
      <div class="byline">
        <span>Dr. Anant Vinjamoori</span>
        <span>&middot;</span>
        <span>{month} {year}</span>
        <span>&middot;</span>
        <span>{source_count} peer-reviewed sources</span>
      </div>
    </header>

    <aside class="bottom-line">
      <span class="bottom-line-label">The Bottom Line</span>
      <p>{bottom_line_text}</p>
    </aside>

    <section>
      <div class="section-marker">
        <span class="section-num">I</span>
        <h2>{section_title}</h2>
      </div>
      <p class="lede">{lede_paragraph}</p>
      <p>{body_text}</p>
      <p class="pull-quote">{pull_quote}</p>
    </section>

    <section class="sources-section">
      <h2>Sources</h2>
      <div class="source-item">[1] {reference}</div>
    </section>

    <div class="partner-cta">
      <h3>Learn More at NGM</h3>
      <p>Evidence-based longevity education for clinicians.</p>
      <a href="https://nextgenmed.io" class="cta-btn">Explore NGM</a>
    </div>
  </article>
</body>
</html>
```

---

## Newsletter HTML (Editorial Email)

Newsletters use table-based layout with inline styles for email client compatibility. Same editorial font families as lead magnets — Zen Old Mincho for display, Familjen Grotesk for everything else — with Georgia as the serif fallback for email clients that strip web fonts.

### Email Container
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; padding: 20px !important; }
      h1 { font-size: 26px !important; }
      h2 { font-size: 20px !important; }
      p, li { font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ECEAE2; font-family: 'Familjen Grotesk', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ECEAE2;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" style="background-color: #FAF9F5; width: 100%; max-width: 600px;">
          <tr>
            <td style="padding: 40px;">
              {content}
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table role="presentation" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-family: 'Zen Old Mincho', Georgia, serif; font-size: 14px; color: #232220;">Next Generation Medicine</p>
              <p style="margin: 0; font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 12px; color: #A6A39A;">nextgenerationmedicine.co</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Email Typography (Inline Styles)

Uses the same editorial palette and font families as lead magnets. Georgia appears only as a fallback — never as primary.

**Kicker:**
```html
<p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #3E5A6E; margin: 0 0 16px 0;">NGM COMMONS</p>
```

**Title:**
```html
<h1 style="font-family: 'Zen Old Mincho', Georgia, serif; font-size: 32px; line-height: 1.1; font-weight: 500; color: #232220; margin: 0 0 12px 0; letter-spacing: -0.01em;">{title}</h1>
```

**Deck/Subtitle:**
```html
<p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 18px; line-height: 1.55; font-style: italic; color: #76736C; margin: 0 0 20px 0;">{deck}</p>
```

**Byline:**
```html
<p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 13px; color: #A6A39A; margin: 0 0 48px 0; padding-bottom: 28px; border-bottom: 1px solid #DEDBD2;">Dr. Anant Vinjamoori &middot; {month} {year}</p>
```

**Section Header:**
```html
<h2 style="font-family: 'Zen Old Mincho', Georgia, serif; font-size: 24px; line-height: 1.2; font-weight: 500; color: #232220; margin: 48px 0 16px 0;">{heading}</h2>
```

**Body Paragraph:**
```html
<p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 17px; line-height: 1.7; color: #4A4844; margin: 0 0 20px 0;">{text}</p>
```

**Bottom Line (accent left border):**
```html
<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 32px 0; width: 100%;">
  <tr>
    <td style="border-left: 2px solid #3E5A6E; padding-left: 20px;">
      <p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #3E5A6E; margin: 0 0 8px 0;">THE BOTTOM LINE</p>
      <p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 17px; line-height: 1.7; color: #4A4844; margin: 0;">{bottom_line}</p>
    </td>
  </tr>
</table>
```

**Mechanistic Note (pine accent):**
```html
<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 32px 0; width: 100%;">
  <tr>
    <td style="border-left: 2px solid #4F6B57; padding-left: 20px;">
      <p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #4F6B57; margin: 0 0 8px 0;">MECHANISTIC NOTE</p>
      <p style="font-family: 'Familjen Grotesk', Arial, sans-serif; font-size: 15px; line-height: 1.75; color: #76736C; margin: 0;">{note}</p>
    </td>
  </tr>
</table>
```

---

## Design Anti-Patterns (NEVER DO)

1. **No dark table headers** — Use typographic hierarchy (uppercase labels + 2px bottom border), not dark backgrounds
2. **No card grids** — Use vertical list with borders for evaluation criteria
3. **No retired fonts** — no Cormorant Garamond, Source Serif 4, or DM Sans, and no Inter. Always Zen Old Mincho (display) + Familjen Grotesk (everything else)
4. **No pure white backgrounds** — Use warm linen (#F3F2EC) for page background, washi (#FAF9F5) for surfaces
5. **No cool gray borders** — Use warm-toned rules (#DEDBD2)
6. **No rounded corners on editorial elements** — Sharp edges (max radius 2-3px) for the editorial aesthetic
7. **No boxed callouts with heavy shadow** — Use left-border accent strips (2px solid) + `--paper-alt` fill instead
8. **No inline styles on lead magnets** — Use CSS `<style>` blocks with CSS variables
9. **No faux-italic Zen Old Mincho** — it has no italic face; italics always come from Familjen Grotesk

---

## SVG Diagram Color Palette

When creating inline SVG diagrams, use these colors:
```
Background: #FAF9F5 (washi) or #F3F2EC (linen)
Primary shapes: #232220 (ink)
Secondary shapes: #4A4844 (ink-2)
Accent fills: #3E5A6E (slate) — use sparingly
Pine fills: #4F6B57
Clay fills: #BD6B4E
Text on light: #4A4844
Text on dark: #FAF9F5
Connectors/lines: #DEDBD2 (rule)
Labels on SVG: font-family Familjen Grotesk, 11px uppercase
```
