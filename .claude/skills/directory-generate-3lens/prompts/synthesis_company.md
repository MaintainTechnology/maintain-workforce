# Synthesis Phase: Deep Single-Company Clinical Profile

You are synthesizing outputs from all three analytical lenses into a **deep clinical profile** for a single company: **{{company_name}}** in the **{{category_name}}** category.

## The Format: Standalone Company Evaluation

This is NOT a category comparison or listicle. It is a dedicated evaluation of one company, written with the same rigor and independence as a category guide but focused entirely on understanding what this company does, how well it works, and what clinicians should know before adopting it.

### Why This Format

- Company pages are a Tier 2+ partnership deliverable — the company has been independently selected and invited to the platform
- The evaluation is ours. The company reviews for factual accuracy but does not control editorial
- Clinicians reading this page should walk away understanding the company's technology, evidence base, and clinical fit — or lack thereof
- The profile must be useful even to a clinician who has never heard of the company

## Inputs

- **Company Name:** {{company_name}}
- **Category:** {{category_name}}
- **Partnership Tier:** {{partnership_tier}} (Tier 2 = Company Page, Tier 3 = Strategic Partner)
- **Lens 1 Output (Mechanistic):** {{lens1_output}}
- **Lens 2 Output (Literature):** {{lens2_output}}
- **Lens 3 Output (KB + Citations):** {{lens3_output}}
- **KBV2 Context Dossier:** {{kbv2_dossier}}

## CRITICAL: KBV2 Integration for Company Profiles

The KBV2 dossier provides the clinical context that turns a product review into a clinical evaluation. Without it, you're describing a product. With it, you're explaining how the product fits into the biology, the evidence landscape, and the clinical workflow.

### How KBV2 Enriches Each Profile Section

| Profile Section | KBV2 Source | What It Provides |
|----------------|-------------|-------------------|
| **Executive Summary** | `narrative_threads` | Frames the company within the broader story of its category |
| **The Approach** | `tier_1_files` (pathways) | Precise mechanistic context — the biology that makes this technology possible or limited |
| **Evidence & Validation** | `conflict_synthesis` + `citation_harvest` | Known controversies, field debates, and curated citations beyond what the company publishes |
| **Clinical Implementation** | `tier_1_files` (interventions + biomarkers) | How practitioners typically act on results from this type of technology |
| **KB Integration** | `tier_1_files` (all types) + `cross_references` | Intervention connections, biomarker interpretation, signaling pathway context |
| **Category Context** | `lens_priming` + `conflict_synthesis` | How this company's approach compares methodologically to alternatives |

## CRITICAL: KB Citation Integration

The KB is a source aggregator, not a citable source. When Lens 3 output contains PMIDs or DOIs extracted from KB files, cite those primary sources directly. Never write "according to our knowledge base" or "KB analysis suggests."

## CRITICAL: Editorial Voice Rules

All editorial voice rules from the default synthesis apply. Additionally:

### Company Profile-Specific Voice

1. **Evaluate, don't promote** — This is an independent clinical evaluation, not a vendor page. Write as if you have no financial relationship with the company (even though you do).
2. **Notable for, not best at** — Use "notable for" / "takes a [X] approach" / "distinctive in" framing. Never "best" / "leading" / "superior."
3. **Honest about unknowns** — If the evidence is early-stage, say so. If a mechanism is theoretical, say so. Intellectual honesty IS the value proposition.
4. **Clinical perspective throughout** — Every section should answer "so what?" from a practicing clinician's standpoint.
5. **No comparative rankings** — You can describe how the company's methodology differs from alternatives, but never frame as better/worse.

### Tier-Aware Content Depth

**Tier 2 (Company Page):**
- Full three-lens evaluation as described below
- 4,000-6,000 total words
- Standard inline Q&A distribution (minimum 3)
- Evidence table with graded studies

**Tier 3 (Strategic Partner):**
- Everything in Tier 2, plus:
- 6,000-8,000 total words
- Extended KB integration section with more intervention mappings
- Additional inline Q&A (minimum 5)
- Video embed section included in template
- "Strategic Partner" badge instead of "Verified"

## Content Structure (In Order)

### 1. Company Header & Quick Facts

```
Breadcrumb: NGM Commons > [Category] > [Company Name]
Badge: "Verified Partner" (Tier 2) or "Strategic Partner" (Tier 3)
H1: [Company Name]
Subtitle: One-sentence description of what the company does and its primary methodology
```

Quick Facts grid (4-6 items):
- Methodology / Technology
- Founded / Headquarters
- Price range (if publicly available)
- Regulatory status
- Category
- Sample type (for diagnostics)

### 2. Executive Summary (200-300 words)

In the summary box with gold left border. 2-3 paragraphs covering:
- What the company does in plain clinical language
- What makes their approach notable within the category
- Clinical relevance — who should care and why

Use L1 for the technical grounding, L3 for clinical perspective.

### 3. The Approach (1000+ words)

Primary source: **Lens 1 (Mechanistic)**

**H2: The Approach**

Structured as:
- **H3: Foundational Methodology** — What technology/methodology does the company use? How does it work at a first-principles level?
- **H3: Technical Differentiation** — What specifically does this company do differently from others using similar methodology? (Describe without ranking.)
- **H3: Data Processing & Analysis** — If applicable, how do they process raw data into clinically relevant outputs?

Include:
- SVG diagram of the company's specific analytical process (inline, same style as guide SVGs)
- At least 1 inline Q&A block

KBV2 enrichment: Use `tier_1_files` (pathways) to provide the biological context. If the company measures butyrate levels, explain the SCFA-colonocyte axis. If they use metatranscriptomics, explain what functional gene expression tells you that DNA-based methods don't.

### 4. Evidence & Validation (800+ words)

Primary source: **Lens 2 (Literature)**

**H2: Evidence & Validation**

Structured as:
- **H3: Published Studies** — What has the company published or been validated by? Grade each study.
- Evidence grading table (`.evidence-table`):
  - Study | Design | N | Key Finding | Evidence Level
  - Use badges: Strong, Moderate, Emerging, Preliminary
- **H3: Regulatory Status** — FDA clearance, CE marking, CLIA certification, etc.
- **H3: Clinical Performance Data** — Sensitivity, specificity, reproducibility where available.

Include:
- At least 1 inline Q&A block
- KB insight callouts for relevant field debates from `conflict_synthesis`

Evidence level labels (NOT letter grades):
- Strong | Moderate | Emerging | Preliminary | Expert Consensus

### 5. Clinical Implementation (600+ words)

Primary source: **Lens 3 (KB Cross-Reference)**

**H2: Clinical Implementation**

Structured as:
- **H3: Patient / Population Fit** — Which patients benefit most? Who is not a good candidate?
- **H3: Workflow Integration** — How does this fit into clinical practice? Ordering, turnaround, interpretation.
- **H3: Interpretation Framework** — How should clinicians read the results? What are the common pitfalls?

Include:
- At least 1 inline Q&A on practical usage
- KB insights from `tier_1_files` (interventions) for what practitioners typically do with results

### 6. Related Interventions & Pathways

**H2: Related Interventions & Pathways**

This section draws from Lens 3 KB cross-reference output to connect the company's measurements or treatments to actionable clinical interventions.

Structured as:
- **H3: What practitioners typically do with results** — Common clinical responses to findings from this type of technology
- **H3: Biomarkers this company measures** — If diagnostic: list key biomarkers and what they indicate
- **H3: Signaling pathways targeted** — If therapeutic: relevant pathways and mechanisms

Include an action table:
| Finding | Intervention | Protocol | Evidence Grade |

### 7. Video Section (Tier 2+ only)

Template placeholder for vendor-submitted video (product walkthrough, up to 10 minutes).

### 8. Category Context

**H2: Category Context**

Structured as:
- **H3: Methodological Comparison** — Comparison table positioning this company's approach alongside alternatives. Highlight the current company's row with `.current-company` class. Describe approaches, don't rank them.
- **H3: Where the Field Is Evolving** — What's changing in this category? What should clinicians watch for?

### 9. Vendor CTA

Custom call-to-action provided by the vendor. Heading, description, and link to their booking/demo page.

### 10. FAQ (6-10 questions)

Company-specific Q&A. Questions should anticipate what a clinician would ask before adopting this product.

Rules:
- Answers start affirmative, never with "No."
- Each answer is 2-4 sentences
- Draw from all three lenses
- Include at least 1 question about limitations or unknowns

### 11. Sources

Merged and deduplicated from L2 (Perplexity) + L3 (KB-extracted) citations.
- Format: Author et al. (Year). "Title." *Journal*. PMID/DOI link.
- Minimum 15 unique citations
- All PMIDs/DOIs must be real and verifiable

## Output Format

Produce TWO outputs:

### Output 1: `company_content.json`

```json
{
  "meta": {
    "company_name": "{{company_name}}",
    "category": "{{category_name}}",
    "content_type": "company_profile",
    "framework_version": "company-v1",
    "partnership_tier": {{partnership_tier}},
    "generated": "YYYY-MM-DD",
    "kbv2_grounded": true
  },
  "company": {
    "name": "{{company_name}}",
    "tagline": "[one-sentence description]",
    "methodology": "[primary methodology]",
    "founded": "[year]",
    "headquarters": "[location]",
    "website": "[url]",
    "price_range": "[if available]",
    "regulatory_status": "[FDA/CE/CLIA status]"
  },
  "kbv2_context": {
    "files_read": [number],
    "narrative_threads": ["[thread 1]", "[thread 2]"],
    "conflict_synthesis": ["[conflict 1]", "[conflict 2]"],
    "citation_harvest": { "total": [number], "pmids": [number], "dois": [number] }
  },
  "synthesis": {
    "executive_summary_markdown": "[markdown]",
    "approach_markdown": "[markdown]",
    "evidence_markdown": "[markdown]",
    "clinical_implementation_markdown": "[markdown]",
    "kb_integration_markdown": "[markdown]",
    "category_context_markdown": "[markdown]"
  },
  "faq": [
    { "question": "[Q]", "answer": "[A]" }
  ],
  "sources": [
    { "id": 1, "authors": "[...]", "year": "[...]", "title": "[...]", "journal": "[...]", "pmid": "[...]", "doi": "[...]" }
  ]
}
```

### Output 2: `company_page.html`

Render the JSON content into the `templates/company_page.html` template, substituting all `{{placeholders}}` with the synthesized content.

## Quality Gate: Company Profile Synthesis

All 5 must pass:

| ID | Criterion | Pass if... |
|----|-----------|-----------|
| CP.1 | `clinical_voice_throughout` | Every section answers "so what?" from a clinician's perspective |
| CP.2 | `vendor_positive_framing` | Company positioned via "notable for" — zero ranking language |
| CP.3 | `evidence_honestly_graded` | All studies have explicit evidence levels; unknowns acknowledged |
| CP.4 | `kb_wisdom_integrated` | KBV2 content enriches at least 3 of 5 major sections |
| CP.5 | `actionability_clear` | Clinician can answer "should I use this?" after reading |

## Litmus Tests

1. **The vendor test:** Would the company share this profile? (If not, it's too negative.)
2. **The clinician test:** Would a skeptical internist find this useful? (If not, it's too promotional.)
3. **The competitor test:** Would a competitor call this unfair? (If so, check for accidental ranking language.)
4. **The depth test:** Could a reader learn something they couldn't from the company's own website? (If not, it's not adding value.)
