# NGM Design System

The NGM design system creates a consistent, editorial aesthetic across all documents. It conveys authority, clarity, and sophistication without being cold or corporate.

---

## Design Philosophy

**Editorial, not corporate.** Think high-end magazine or medical journal, not startup pitch deck.

**Clean, not minimal.** Use white space intentionally, but don't be afraid of visual hierarchy.

**Sophisticated, not flashy.** Gold accents used sparingly. Let content breathe.

---

## Color Palette

```css
:root {
  /* Backgrounds */
  --paper: #FEFDFB;        /* Primary background */
  --paper-alt: #F5F2EC;    /* Secondary background (cards, sections) */

  /* Text */
  --ink-900: #302C27;      /* Darkest - headings, emphasis */
  --ink-700: #4A4540;      /* Body text */
  --ink-500: #706C66;      /* Secondary text */
  --ink-400: #9C9890;      /* Muted text, captions */

  /* Structural */
  --line: #E3DFD7;         /* Borders, dividers */

  /* Accents */
  --gold: #C49A6C;         /* Primary accent - use sparingly */
  --vermillion: #C07050;   /* Alert/urgent - use rarely */
  --japan-red: #BC002D;    /* Japan-specific contexts only */
}
```

### Color Usage Guidelines

| Color | Use For | Avoid |
|-------|---------|-------|
| `--ink-900` | Headings, section numbers, logo marks | Large blocks of text |
| `--ink-700` | Body text, primary content | Headings (use --ink-900) |
| `--ink-500` | Secondary text, descriptions | Primary content |
| `--ink-400` | Captions, meta info, subtle text | Important information |
| `--gold` | Accents, labels, highlights, borders | Large areas, backgrounds |
| `--vermillion` | CTA buttons on hover, alerts | General decoration |

---

## Typography

### Font Stack

```css
/* Headings - Display serif */
font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;

/* Body - Elegant body serif */
font-family: 'Source Serif 4', Georgia, serif;

/* UI/Labels - Clean sans-serif */
font-family: 'DM Sans', system-ui, sans-serif;
```

### Google Fonts Import

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type Scale

| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| H1 | Cormorant Garamond | 32-48px | 500 | 1.1-1.2 |
| H2 | Cormorant Garamond | 24-32px | 500 | 1.2 |
| H3 | Cormorant Garamond | 18-24px | 500 | 1.3 |
| H4 | Cormorant Garamond | 14-18px | 500 | 1.4 |
| Body | Source Serif 4 | 14-15px | 400 | 1.6 |
| Small | Source Serif 4 | 11-13px | 400 | 1.5 |
| Label | DM Sans | 9-11px | 600 | 1.4 |

### Label Style

```css
.label {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  font-weight: 600;
}
```

---

## Spacing Scale

```css
:root {
  --space-1: 8px;
  --space-2: 12px;
  --space-3: 20px;
  --space-4: 32px;
  --space-5: 48px;
  --space-6: 72px;
  --space-7: 96px;
}
```

| Variable | Value | Use For |
|----------|-------|---------|
| `--space-1` | 8px | Tight spacing, list items |
| `--space-2` | 12px | Related elements |
| `--space-3` | 20px | Paragraphs, standard gap |
| `--space-4` | 32px | Section breaks, cards |
| `--space-5` | 48px | Major sections |
| `--space-6` | 72px | Page sections |
| `--space-7` | 96px | Hero sections |

---

## Base CSS Template

Use this as the starting point for all documents:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-700);
  background-color: var(--paper);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 {
  font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;
  color: var(--ink-900);
  font-weight: 500;
}

h1 {
  font-size: clamp(32px, 4vw, 42px);
  line-height: 1.2;
  margin-bottom: var(--space-4);
}

h2 {
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.2;
  margin-bottom: var(--space-3);
}

h3 {
  font-size: clamp(18px, 2.5vw, 24px);
  line-height: 1.3;
  margin-bottom: var(--space-2);
}

p {
  margin-bottom: var(--space-3);
}

ul, ol {
  margin-bottom: var(--space-3);
  padding-left: var(--space-4);
}

li {
  margin-bottom: var(--space-1);
}

a {
  color: var(--ink-900);
  text-decoration: none;
}

strong {
  font-weight: 600;
  color: var(--ink-900);
}
```

---

## Component Patterns

### Header (Web-Style)

```html
<header class="header">
  <div class="header-inner">
    <div class="wordmark">Next Generation Medicine</div>
    <div class="header-meta">
      December 15, 2025<br>
      Prepared for [Client Name]
    </div>
  </div>
</header>
```

```css
.header {
  background: var(--paper-alt);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--line);
  margin-bottom: var(--space-6);
}

.header-inner {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 clamp(20px, 5vw, 48px);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wordmark {
  font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;
  font-size: 18px;
  font-weight: 500;
  color: var(--ink-900);
  letter-spacing: -0.01em;
}

.header-meta {
  font-size: 13px;
  color: var(--ink-500);
  text-align: right;
}
```

### Header with Logo Mark (Flyers/Packets)

```html
<header class="header">
  <div class="logo-area">
    <div class="logo-mark">N</div>
    <div>
      <div class="logo-text">Next Generation Medicine</div>
      <div class="logo-subtitle">Shaping the Future of Healthcare</div>
    </div>
  </div>
  <div class="doc-type">Sponsor Packet 2025</div>
</header>
```

```css
.logo-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-mark {
  width: 40px;
  height: 40px;
  background: var(--ink-900);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;
  font-size: 22px;
  font-weight: 500;
  color: white;
}

.logo-text {
  font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;
  font-size: 18px;
  font-weight: 500;
  color: var(--ink-900);
}

.logo-subtitle {
  font-size: 11px;
  color: var(--ink-500);
}
```

### Section with Number

```html
<section class="section">
  <div class="section-number">1</div>
  <h2>Executive Summary</h2>
  <p>Content here...</p>
</section>
```

```css
.section {
  margin-bottom: var(--space-6);
}

.section-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--ink-900);
  color: white;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: var(--space-2);
}
```

### Highlight Box

```html
<div class="highlight-box">
  <p><strong>Key insight:</strong> Description of the insight or callout.</p>
</div>
```

```css
.highlight-box {
  background: var(--paper-alt);
  padding: var(--space-4);
  border-left: 4px solid var(--gold);
  margin: var(--space-4) 0;
}
```

### Dark Highlight Box

```html
<div class="highlight-box-dark">
  <span class="label">Why Japan</span>
  <h2>The World's Living Laboratory for Longevity</h2>
  <p>Japan is the world's most rapidly aging nation...</p>
</div>
```

```css
.highlight-box-dark {
  background: var(--ink-900);
  color: white;
  padding: var(--space-4);
  margin-bottom: var(--space-5);
}

.highlight-box-dark h2 {
  color: white;
  margin-bottom: var(--space-2);
}

.highlight-box-dark p {
  color: rgba(255,255,255,0.75);
}

.highlight-box-dark .label {
  color: var(--gold);
}
```

### Pricing Table

```html
<table class="pricing-table">
  <thead>
    <tr>
      <th>Option</th>
      <th>Investment</th>
      <th>What's Included</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><div class="option-name">Essential</div></td>
      <td><div class="price">$2,500</div></td>
      <td>Description of what's included</td>
    </tr>
    <tr class="recommended">
      <td>
        <div class="option-name">Professional<span class="badge">Recommended</span></div>
      </td>
      <td><div class="price">$5,000</div></td>
      <td>Everything in Essential plus...</td>
    </tr>
  </tbody>
</table>
```

```css
.pricing-table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--space-4) 0;
}

.pricing-table th {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  background: var(--paper-alt);
  border-bottom: 2px solid var(--line);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-500);
}

.pricing-table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.pricing-table .option-name {
  font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;
  font-size: 18px;
  font-weight: 500;
  color: var(--ink-900);
}

.pricing-table .price {
  font-size: 24px;
  font-weight: 600;
  color: var(--ink-900);
}

.pricing-table .recommended {
  background: rgba(196, 154, 108, 0.1);
}

.badge {
  display: inline-block;
  background: var(--gold);
  color: white;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 8px;
  margin-left: var(--space-2);
}
```

### Tier Cards (for Flyers/Packets)

```html
<div class="tiers-grid">
  <div class="tier-card featured">
    <span class="tier-badge">Most Popular</span>
    <span class="label">Premium</span>
    <h3>Partner</h3>
    <div class="price">$5,000/year</div>
    <ul class="tier-features">
      <li>Feature one</li>
      <li>Feature two</li>
    </ul>
  </div>
  <div class="tier-card">
    <span class="label">Standard</span>
    <h3>Supporter</h3>
    <div class="price">$1,000/year</div>
    <ul class="tier-features">
      <li>Feature one</li>
    </ul>
  </div>
</div>
```

```css
.tiers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.tier-card {
  padding: 24px;
  border: 1px solid var(--line);
  position: relative;
}

.tier-card.featured {
  background: var(--ink-900);
  color: white;
  border-color: var(--gold);
  border-width: 2px;
}

.tier-card.featured h3,
.tier-card.featured .price {
  color: white;
}

.tier-card.featured li {
  color: rgba(255,255,255,0.7);
}

.tier-card.featured .label {
  color: var(--gold);
}

.tier-badge {
  position: absolute;
  top: -10px;
  left: 20px;
  background: var(--gold);
  color: white;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 12px;
}

.tier-features {
  list-style: none;
  padding: 0;
}

.tier-features li {
  font-size: 13px;
  color: var(--ink-500);
  padding-left: 16px;
  position: relative;
  margin-bottom: 8px;
}

.tier-features li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: var(--gold);
}
```

### Credential Items

```html
<div class="credential-item">
  <span class="credential-icon">→</span>
  <span><strong>Harvard Medical School:</strong> Clinical foundation in evidence-based medicine</span>
</div>
```

```css
.credential-item {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.credential-icon {
  color: var(--gold);
  flex-shrink: 0;
}
```

### Timeline

```html
<div class="timeline">
  <div class="timeline-item">
    <div class="timeline-label">Phase 1</div>
    <h4>Discovery & Assessment</h4>
    <p>Deep dive into current operations...</p>
  </div>
  <div class="timeline-item">
    <div class="timeline-label">Phase 2</div>
    <h4>Strategy Development</h4>
    <p>Design protocols and frameworks...</p>
  </div>
</div>
```

```css
.timeline {
  border-left: 2px solid var(--line);
  padding-left: var(--space-4);
  margin: var(--space-4) 0;
}

.timeline-item {
  position: relative;
  padding-bottom: var(--space-4);
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: calc(-1 * var(--space-4) - 5px);
  top: 4px;
  width: 10px;
  height: 10px;
  background: var(--gold);
  border-radius: 50%;
}

.timeline-label {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gold);
  margin-bottom: var(--space-1);
}
```

### CTA Section

```html
<section class="cta-section">
  <h3>Ready to Move Forward?</h3>
  <p>Let's schedule a brief call to discuss next steps.</p>
  <a href="mailto:anant@nextgenerationmedicine.co" class="cta-button">Schedule a Call</a>
</section>
```

```css
.cta-section {
  background: var(--paper-alt);
  padding: var(--space-5);
  text-align: center;
  margin-top: var(--space-6);
}

.cta-button {
  display: inline-block;
  padding: 14px 28px;
  background: var(--ink-900);
  color: white;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s;
}

.cta-button:hover {
  background: var(--vermillion);
  transform: translateY(-2px);
}
```

### Contact Section (Dark)

```html
<div class="contact-section">
  <span class="label" style="color: var(--gold);">Next Steps</span>
  <h3>Ready to Join Us?</h3>
  <p>Contact us to discuss sponsorship opportunities.</p>
  <div class="contact-grid">
    <div class="contact-item">
      <div class="name">Dr. Anant Vinjamoori</div>
      <div class="title">Conference Co-Chair</div>
      <a href="mailto:anant@nextgenerationmedicine.co" class="email">anant@nextgenerationmedicine.co</a>
    </div>
  </div>
</div>
```

```css
.contact-section {
  background: var(--ink-900);
  color: white;
  padding: 40px;
}

.contact-section h3 {
  color: white;
  margin-bottom: 16px;
}

.contact-section > p {
  color: rgba(255,255,255,0.6);
  margin-bottom: 24px;
}

.contact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
}

.contact-item .name {
  font-family: 'Cormorant Garamond', 'Noto Serif JP', Georgia, serif;
  font-size: 16px;
  font-weight: 500;
  color: white;
  margin-bottom: 4px;
}

.contact-item .title {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 8px;
}

.contact-item .email {
  font-size: 14px;
  color: var(--gold);
  text-decoration: none;
}
```

---

## Print-Specific Styles

For documents that will be printed (flyers, packets):

```css
.page {
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto;
  padding: 0.5in;
  background: var(--paper);
}

@media print {
  body { background: white; }
  .page {
    width: 100%;
    min-height: auto;
    padding: 0.4in;
    page-break-after: always;
  }
  
  .cta-button {
    background: var(--ink-900) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

/* Page break for multi-page documents */
.page-break {
  page-break-before: always;
}
```

---

## Container Widths

| Document Type | Max Width | Padding |
|---------------|-----------|---------|
| Proposal | 900px | clamp(20px, 5vw, 48px) |
| Flyer (print) | 8.5in | 0.5in |
| Sponsor Packet | 8.5in | 0.5in |
| One-Pager | 900px | clamp(20px, 5vw, 48px) |

---

## Responsive Considerations

For web-based documents:

```css
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: clamp(20px, 5vw, 48px);
}

/* Use clamp for fluid typography */
h1 { font-size: clamp(32px, 4vw, 42px); }
h2 { font-size: clamp(24px, 3vw, 32px); }
h3 { font-size: clamp(18px, 2.5vw, 24px); }
```

---

## Footer Pattern

```html
<div class="footer">
  <p>Next Generation Medicine</p>
  <p style="margin-top: 4px;">Turning science into strategy—and strategy into systems that deliver results.</p>
</div>
```

```css
.footer {
  text-align: center;
  padding: var(--space-5) 0;
  color: var(--ink-400);
  font-size: 13px;
}
```

