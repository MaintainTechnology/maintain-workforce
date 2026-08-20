# HTML Template for Elevated Scientific Listicle

Render the synthesized content as an **elevated scientific listicle**—a comprehensive, research-driven clinical evaluation guide optimized for both human readers and AI answer engines.

## Output Format Philosophy

This is NOT a generic template. It's a specific format designed for:
1. **LLM citability** — Quick reference table at top, structured headings, inline Q&A
2. **Clinical depth** — 5,000-7,000 words of substantive content
3. **Vendor positivity** — "Notable for" framing, numbered but not ranked
4. **Actionability** — Clear path from findings to interventions

## AEO-Critical Elements

These elements are **required** for optimal AI citation:

| Element | Purpose | Placement |
|---------|---------|-----------|
| Quick Reference Table | Immediate data extraction | After header, before summary |
| Sequential H1>H2>H3>H4 | 3x higher citation rate | Throughout |
| Inline Q&A blocks | 40% more likely to be extracted | Technology, Evidence, Decision Support sections |
| Numbered entity sections | Listicle format for LLMs | Entity evaluation section |
| ItemList schema | Structured data for crawlers | JSON-LD in head |
| Front-loaded answers | Direct answer in first sentence | All Q&A blocks and FAQ |

## Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ H1: [Category] in [Year]: A Clinical Evaluation Guide       │
│ Subtitle + Meta badges + Date                               │
├─────────────────────────────────────────────────────────────┤
│ QUICK REFERENCE TABLE (5-6 rows × 5 columns)               │
│ Entity | Methodology | Notable For | Price | Ordering       │
├─────────────────────────────────────────────────────────────┤
│ EXECUTIVE SUMMARY (gold-bordered box, 300-400 words)        │
│ - Clinical value proposition                                │
│ - Evidence summary                                          │
│ - KB intervention connections                               │
├─────────────────────────────────────────────────────────────┤
│ H2: Understanding the Technology (800-1000 words)           │
│   H3: [Methodology 1]                                       │
│   H3: [Methodology 2]                                       │
│   H3: [Methodology 3]                                       │
│   [Inline Q&A block]                                        │
│   [Comparison Table]                                        │
│   [SVG Diagram]                                             │
├─────────────────────────────────────────────────────────────┤
│ H2: The Evidence Landscape (600-800 words)                  │
│   [Evidence grading table]                                  │
│   [Inline Q&A block]                                        │
│   [Nuance note for conflicting findings]                    │
├─────────────────────────────────────────────────────────────┤
│ H2: Testing Options: Clinical Evaluation                    │
│   [Intro paragraph - not ranked disclaimer]                 │
├─────────────────────────────────────────────────────────────┤
│ ENTITY SECTION 1 (bordered card, 400-600 words)            │
│   H2: ① [Entity Name]                                       │
│   Tagline                                                   │
│   Quick Facts grid (Methodology, Price, Ordering, Time)     │
│   H4: What Makes It Notable (bullet list)                   │
│   H4: The Approach in Depth (2-3 paragraphs)               │
│   H4: Clinical Fit (1-2 paragraphs)                        │
│   H4: Evidence & Validation (1-2 paragraphs)               │
├─────────────────────────────────────────────────────────────┤
│ ENTITY SECTION 2-5 (same structure)                        │
├─────────────────────────────────────────────────────────────┤
│ H2: Clinical Decision Support (500-700 words)               │
│   [Action pathways table: Finding → Intervention]           │
│   [Inline Q&A block]                                        │
│   H3: Realistic Expectations                                │
│   [What testing does well - bullet list]                    │
│   [What testing doesn't do - bullet list]                   │
├─────────────────────────────────────────────────────────────┤
│ H2: Frequently Asked Questions (6-10 Q&A)                   │
│   [Each Q&A: question, then front-loaded answer]            │
├─────────────────────────────────────────────────────────────┤
│ H2: Sources                                                 │
│   [Numbered citations with PMID/DOI links]                  │
└─────────────────────────────────────────────────────────────┘
```

## CSS Component Reference

### Quick Reference Table
```css
.quick-reference {
  width: 100%;
  background: var(--paper-alt);
  border-radius: 8px;
  overflow: hidden;
}
.quick-reference th {
  background: var(--ink-900);
  color: white;
  text-transform: uppercase;
}
```

### Entity Section Cards
```css
.entity-section {
  margin: var(--space-5) 0;
  padding: var(--space-4);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.entity-number {
  display: inline-flex;
  width: 32px; height: 32px;
  background: var(--gold);
  color: white;
  border-radius: 50%;
  /* Number badge before entity name */
}
```

### Inline Q&A Block
```css
.inline-qa {
  background: linear-gradient(135deg, rgba(92, 122, 138, 0.06) 0%, rgba(92, 122, 138, 0.02) 100%);
  border-radius: 8px;
  padding: var(--space-3);
  margin: var(--space-4) 0;
}
.inline-qa .qa-question {
  font-family: var(--font-serif);
  font-weight: 500;
  color: var(--ink-900);
}
.inline-qa .qa-answer {
  /* First sentence should directly answer the question */
}
```

### Quick Facts Grid
```css
.quick-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-2);
  background: var(--paper-alt);
  padding: var(--space-3);
  border-radius: 8px;
}
.quick-fact .label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--ink-500);
}
```

### Action Pathways Table
```css
.action-table {
  width: 100%;
}
.action-table th {
  background: var(--ink-900);
  color: white;
}
.action-table .finding {
  background: var(--blue);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
}
```

## Schema Markup (Required)

Include both Article and ItemList schema:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Category] in [Year]: A Clinical Evaluation Guide",
  "datePublished": "[ISO date]",
  "dateModified": "[ISO date]",
  "author": { "@type": "Organization", "name": "NextGen Medicine" },
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "[Entity 1]",
        "description": "[One-line description]"
      },
      // ... entities 2-5
    ]
  }
}
```

## Entity Section Template

Each entity follows this exact structure:

```html
<div class="entity-section">
  <h2><span class="entity-number">[N]</span> [Entity Name]</h2>
  <p class="entity-tagline">[Distinguishing tagline]</p>

  <div class="quick-facts">
    <div class="quick-fact">
      <span class="label">Methodology</span>
      <span class="value">[Specific approach]</span>
    </div>
    <div class="quick-fact">
      <span class="label">Price</span>
      <span class="value">$X-X</span>
    </div>
    <div class="quick-fact">
      <span class="label">Ordering</span>
      <span class="value">[Direct/Practitioner]</span>
    </div>
    <div class="quick-fact">
      <span class="label">Turnaround</span>
      <span class="value">X weeks</span>
    </div>
  </div>

  <h4>What Makes It Notable</h4>
  <ul class="notable-for-list">
    <li>[Distinctive attribute 1]</li>
    <li>[Distinctive attribute 2]</li>
    <li>[Distinctive attribute 3]</li>
    <li>[Distinctive attribute 4]</li>
  </ul>

  <h4>The Approach in Depth</h4>
  <p>[2-3 substantive paragraphs explaining methodology, technology choices,
     what distinguishes this approach. Include specific technical details.]</p>

  <h4>Clinical Fit</h4>
  <p>[1-2 paragraphs on which practitioners/workflows this supports,
     patient populations, specific use cases.]</p>

  <h4>Evidence & Validation</h4>
  <p>[1-2 paragraphs on validation studies, regulatory status,
     what literature shows about this specific product/methodology.]</p>
</div>
```

## Inline Q&A Rules

1. **Placement:** One in Technology section, one in Evidence section, one in Decision Support
2. **Question format:** Start with "Q:" in serif font
3. **Answer format:** Start with bold direct answer, then supporting detail
4. **Length:** 80-150 words per answer

Example:
```html
<div class="inline-qa">
  <p class="qa-question">Q: How does metatranscriptomics differ from shotgun metagenomics?</p>
  <p class="qa-answer"><strong>Shotgun metagenomics sequences DNA to show what organisms
  are present and what they could potentially do. Metatranscriptomics sequences RNA to
  reveal what genes are actively being expressed.</strong> Think of it as the difference
  between reading someone's resume (DNA: what they're capable of) versus watching them
  work (RNA: what they're actually doing).</p>
</div>
```

## FAQ Section Rules

1. **Question format:** Serif font, no "Q:" prefix
2. **Answer format:** First sentence directly answers the question in bold
3. **Length:** 80-120 words per answer
4. **Count:** 6-10 questions
5. **Sources:** Questions should come from L3's "key questions clinicians ask"

## Quality Checklist

Before saving, verify:

- [ ] Quick reference table appears immediately after header
- [ ] H1>H2>H3>H4 hierarchy is sequential (no skipped levels)
- [ ] At least 3 inline Q&A blocks distributed throughout (not just FAQ)
- [ ] Each entity section is 400-600 words with all 4 H4 subsections
- [ ] Entity numbers visible (①②③④⑤) but explicitly "not ranked"
- [ ] All FAQ answers start with bold direct answer
- [ ] Total word count: 5,000-7,000 words
- [ ] ItemList schema includes all entities
- [ ] No vendor criticism, rankings, or "best" language
- [ ] Action pathways table connects findings to KB interventions

## Output Files

Save to `{{output_dir}}/{{slug}}/`:
- `directory_content.json` - Structured data with all lens outputs
- `directory_page.html` - Rendered elevated scientific listicle
