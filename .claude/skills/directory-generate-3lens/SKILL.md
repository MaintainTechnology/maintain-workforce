---
name: directory-generate-3lens
description: Generate NGM Commons directory listings using a three-lens analytical framework (Mechanistic, Literature, KB Cross-Reference) with RALPH-style iterative quality gates.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, Task, WebFetch, WebSearch
user_invocable: true
argument-hint: <product_name> [--output-dir PATH] [--resume] [--dry-run] [--rerun-lens L1|L2|L3] [--guide] [--company-profile <company_name>]
---

# Three-Lens Directory Generator

Generate comprehensive, clinically rigorous directory entries for the NGM Commons platform using a structured three-lens analytical framework.

## Invocation

```bash
/directory-generate-3lens <product_name> [options]
```

**Arguments:**
- `<product_name>` - Product to analyze (e.g., "Metformin", "Pendulum Glucose Control")
- `--output-dir PATH` - Custom output directory (default: content/commons/)
- `--resume` - Resume from last checkpoint if interrupted
- `--dry-run` - Show execution plan without running
- `--rerun-lens L1|L2|L3` - Force re-run specific lens
- `--guide` - **Guide mode:** Generate a first-principles educational guide instead of the default listicle. See "Guide Mode" section below.
- `--company-profile <company_name>` - **Company profile mode:** Generate a deep single-company evaluation page. See "Company Profile Mode" section below. Requires `--tier 2` or `--tier 3` to control content depth.

## Framework: KBV2-Grounded Three-Lens Analysis

This skill applies a **KBV2 deep review** followed by three distinct analytical lenses. The KBV2 review reads local knowledge base files to build a rich context dossier that grounds all subsequent analysis in first-principles knowledge.

```
                         ┌────────────────────┐
                         │   KBV2 DEEP REVIEW │
                         │  VectorShift KB    │
                         │  Semantic Search   │
                         │  (1,165 documents) │
                         └────────┬───────────┘
                                  │
                         KBV2 Context Dossier
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PARALLEL LENS EXECUTION                         │
│              (each lens receives the KBV2 dossier)                   │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │     LENS 1       │  │     LENS 2       │  │     LENS 3       │  │
│  │   Mechanistic    │  │   Literature     │  │   KB Cross-Ref   │  │
│  │  (grounded in    │  │  (informed by    │  │  (enriched by    │  │
│  │   KBV2 pathways) │  │   KBV2 gaps)     │  │   KBV2 files)    │  │
│  │                  │  │                  │  │                  │  │
│  │ Claude Opus 4.6  │  │ Perplexity Deep  │  │ KBV2 Local       │  │
│  │ via OpenRouter   │  │ via OpenRouter   │  │ Files (1,165)    │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                     │            │
│           ▼                     ▼                     ▼            │
│      Quality Gate          Quality Gate          Quality Gate      │
│      (iterate)             (iterate)             (iterate)         │
└───────────┬─────────────────────┴─────────────────────┬────────────┘
            └─────────────────────┬─────────────────────┘
                                  ▼
                         ┌────────────────┐
                         │   SYNTHESIS    │
                         │  (with KBV2    │
                         │   conflicts &  │
                         │   narratives)  │
                         └───────┬────────┘
                                 ▼
                         ┌────────────────┐
                         │    ASSEMBLY    │
                         │  JSON + HTML   │
                         └────────────────┘
```

---

## Execution Flow

### Phase 0: Initialization

1. Parse product name and options
2. Create/load progress file at `.ralph-3lens/progress.txt`
3. Initialize state tracking
4. If `--resume`, load previous checkpoint

### Phase 0.5: KBV2 Deep Review (MANDATORY)

**Purpose:** Build a rich context dossier via semantic search across the KBV2 knowledge base before any lens executes. This ensures all analysis is grounded in curated first-principles knowledge.

**Method:** Calls the **Signaling KB Semantic Search v2** VectorShift pipeline, which performs two-stage iterative semantic search (Sonnet 4.6 query expansion → 4 parallel KB searches → Opus 4.6 gap analysis → 4 targeted follow-up searches → Opus 4.6 dossier synthesis) across 4 category-specific Knowledge Bases containing 1,165 documents with voyage-4-large embeddings.

**KBs searched:**
- Pathways (152 docs) — Signaling cascades, metabolic axes, pathway crosstalk
- Interventions (413 docs) — Supplements, drugs, diets, therapies with dosing & evidence
- Biomarkers (297 docs) — Clinical markers with interpretation patterns & reference ranges
- Conflicts (303 docs) — Unresolved debates, assay limitations, evidence gaps

**Process:**
1. **Call pipeline** — Run `python3 cli/run_signaling_kb_search.py "<product_name>" --context "<context>" --output .ralph-3lens/kbv2_dossier.json` from the Vectorshift Pipelines directory
2. **Review output** — Evaluate entity coverage, cross-document connections, citation quality, lens priming completeness
3. **Local file enrichment** (optional) — Read specific `kb-v2-all/` files identified in `files_to_read_deeper[]` or by cross-references for full-document depth beyond what semantic search chunks provide

**Prompt:** `prompts/kbv2_deep_review.md`

**Quality Gate (7/8 to pass):**
- K.1 `pipeline_executed`: Pipeline ran successfully and returned valid JSON
- K.2 `entity_breadth`: Entities found in at least 3 of 4 categories
- K.3 `cross_document_synthesis`: At least 3 recurring themes identified across documents
- K.4 `narrative_threads`: At least 3 narrative threads proposed for output structure
- K.5 `citation_harvest`: At least 15 unique PMIDs/DOIs harvested
- K.6 `conflict_integration`: At least 2 conflicts surfaced with recommended framing
- K.7 `lens_priming`: Priming data provided for all 4 downstream phases
- K.8 `connections_not_summaries`: Synthesis focuses on cross-document connections, not individual chunk summaries

**Output:** A "KBV2 Context Dossier" JSON object passed to all subsequent phases.

### Phase 1: Parallel Lens Execution

Execute all three lenses. Each lens receives the KBV2 Context Dossier as input. Each lens iterates until its quality gate passes.

#### Lens 1: First-Principles Mechanistic Analysis (KBV2-Grounded)

**Purpose:** Explain HOW the product works from foundational principles, grounded in KBV2 pathway data

**Process:**
1. Classify product type: biological | technological | service | hybrid
2. Identify primary molecular/system targets — **cross-reference against KBV2 pathway files**
3. Map signaling pathways (upstream → downstream) — **using KBV2 pathway crosstalk data**
4. Generate SVG pathway diagram — **incorporating KBV2 network structure**
5. Create educational analogies

**KBV2 Integration:** Lens 1 receives the KBV2 dossier's `lens_priming.for_lens_1` which includes grounding pathways, key targets, and diagram elements from the local KB files. The mechanistic analysis should be *grounded in* these curated pathway documents rather than generated from scratch.

**Prompt:** `prompts/lens1_mechanistic.md`

**Quality Gate (5/6 to pass):**
- L1.1 `mechanism_depth`: Specific targets named
- L1.2 `pathway_accuracy`: Pathways correctly mapped
- L1.3 `cascade_completeness`: Full trigger → outcome chain
- L1.4 `analogy_quality`: Memorable analogy present
- L1.5 `diagram_validity`: SVG passes validation
- L1.6 `first_principles_not_claims`: Explains HOW, not IF

#### Lens 2: Comprehensive Literature Review

**Purpose:** Document what the peer-reviewed evidence demonstrates

**Process:**
1. Execute deep research via Perplexity (OpenRouter)
2. Extract PMIDs/DOIs from results
3. Grade evidence quality (RCT > Observational > Case > Mechanistic)
4. Document regulatory status
5. Note conflicting findings

**Prompt:** `prompts/lens2_literature.md`

**Quality Gate (6/7 to pass):**
- L2.1 `citation_validity`: PMIDs/DOIs resolve to real papers
- L2.2 `evidence_breadth`: 3+ distinct studies cited
- L2.3 `study_details`: Sample sizes and designs included
- L2.4 `conflict_documentation`: Conflicting findings noted
- L2.5 `regulatory_accuracy`: Regulatory status correct
- L2.6 `recency`: 2024+ studies included when available
- L2.7 `all_citations_api_verified`: All PMIDs/DOIs confirmed via PubMed/CrossRef API

#### Lens 3: Knowledge Base Cross-Referencing (MANDATORY — KBV2 Local Files)

**Purpose:** Connect product to the NGM Signaling KB by reading local `kb-v2-all/` files to extract insights, citations, and clinical wisdom.

**CRITICAL:** This lens must ALWAYS execute. The KBV2 deep review (Phase 0.5) has already identified relevant local files and harvested citations. Lens 3 deepens that foundation by reading additional files and building the full clinical perspective layer.

**Source:** `kb-v2-all/` — 1,165 curated markdown files across pathways, interventions, biomarkers, and conflicts. No external API calls needed.

**Process:**
1. Start from KBV2 dossier's `lens_priming.for_lens_3` — intervention landscape, actionability map seeds, and files to read
2. Read any additional KBV2 files identified during lens execution that weren't in the original dossier
3. Follow cross-references in documents to discover related files (pathway → intervention → biomarker chains)
4. Extract PMIDs, DOIs, and peer-reviewed citations from structured appendices
5. Build comprehensive "Finding → KB Intervention" actionability map
6. Extract clinical perspective (what practitioners monitor, dosing patterns, contraindications)
7. Integrate conflict file insights into the clinical perspective layer

**Prompt:** `prompts/lens3_kb_query.md`

**Quality Gate (5/6 to pass):**
- L3.1 `kb_search_exhaustive`: All query types attempted (direct, target, pathway, indication/biomarker)
- L3.2 `related_interventions_found`: Related nodes surfaced (minimum 3)
- L3.3 `mechanism_alignment`: KB claims align with Lens 1
- L3.4 `pmid_extraction`: At least 5 PMIDs/DOIs extracted from KB nodes
- L3.5 `citation_enrichment`: KB PMIDs incorporated into synthesis (not siloed)
- L3.6 `novel_product_handling`: If not in KB, indirect enrichment via biomarker/target queries

### Phase 2: Synthesis (KBV2-Enriched)

**Purpose:** Integrate three lenses and the KBV2 dossier into a coherent, deeply grounded narrative

**Process:**
1. Resolve conflicts between lenses — **using KBV2 conflict files for authoritative framing**
2. Weight evidence appropriately
3. Generate integrated narrative — **structured around KBV2 narrative threads**
4. Compile all citations — **merging L2, L3, and KBV2-harvested citations**
5. Weave KBV2 cross-document connections throughout the narrative

**Prompt:** `prompts/synthesis.md`

**Conflict Resolution Rules:**
- L1 vs L2 conflict → Evidence (L2) precedence, note discrepancy
- L2 vs L3 conflict → Surface as "area of ongoing research"
- L3 has newer data → Update with KB insights
- **KBV2 conflict file exists** → Use its characterization to frame the uncertainty (these are curated assessments of what the field actually debates)

**Quality Gate (6/6 to pass):**
- S.1 `lens_integration`: All three lenses represented
- S.2 `conflict_addressed`: Discrepancies noted
- S.3 `evidence_graded`: Confidence communicated
- S.4 `clinical_utility`: Practitioner-actionable
- S.5 `vendor_neutrality`: No ranking
- S.6 `vendor_tone_check`: No letter grades, no "No." FAQ starts, no banned language

### Phase 3: Assembly

1. Generate `directory_content.json` with all structured data
2. Render `directory_page.html` from template
3. Update progress file with completion status

**Template:** `prompts/html_template.md`

---

## State Management

Progress tracked in `.ralph-3lens/progress.txt`:

```
=== DIRECTORY GENERATION: [Product Name] ===
Started: 2026-01-26T10:00:00Z

--- KBV2 DEEP REVIEW ---
Iteration 1: PASSED (8/8)
  Files scanned: 1165
  Tier 1 read: 15 files
  Tier 2 read: 22 files
  Tier 3 scanned: 18 files
  PMIDs harvested: 47
  Narrative threads: 5
  Conflicts integrated: 4

--- LENS 1: MECHANISTIC (KBV2-Grounded) ---
Iteration 1: FAILED (L1.3 cascade_completeness=FALSE)
  Feedback: Missing downstream effects after AMPK activation
Iteration 2: PASSED (6/6)
  Mechanism type: biological
  Primary targets: AMPK, mTOR
  KBV2 pathways used: 3

--- LENS 2: LITERATURE ---
Iteration 1: PASSED (5/6)
  Citations: 8 (5 RCTs, 2 observational, 1 meta-analysis)
  Regulatory: FDA approved for Type 2 diabetes
  KBV2 gaps probed: 2

--- LENS 3: KB CROSS-REFERENCE (KBV2 Local) ---
Iteration 1: PASSED (5/6)
  KBV2 files read: 12
  Related interventions: 3 (rapamycin, berberine, AICAR)
  Conflicts integrated: 2
  PMIDs extracted: 18

--- SYNTHESIS ---
Iteration 1: PASSED (6/6)
  KBV2 narrative threads used: 4
  KBV2 conflict framing applied: 3

--- ASSEMBLY ---
Output: content/commons/metformin/

COMPLETED: 2026-01-26T10:45:00Z
```

---

## Output Schema

```json
{
  "meta": {
    "product_name": "Metformin",
    "slug": "metformin",
    "generated": "2026-01-26",
    "framework_version": "3lens-v1",
    "kb_status": "IN_KB",
    "conference_partner": false,
    "conference_participation": null
  },
  "lens_1_mechanistic": {
    "mechanism_type": "biological",
    "primary_targets": ["AMPK", "Mitochondrial Complex I"],
    "first_principles_markdown": "...",
    "pathway_diagram_svg": "<svg>...</svg>",
    "analogies": ["..."]
  },
  "lens_2_literature": {
    "evidence_summary": "...",
    "key_studies": [...],
    "regulatory_status": {...}
  },
  "lens_3_kb_crossref": {
    "kb_node_found": true,
    "related_interventions": [...],
    "conflicts_detected": [...],
    "kb_citations_added": 4
  },
  "synthesis": {
    "integrated_narrative_markdown": "...",
    "conflict_notes": [...]
  },
  "sources": [...]
}
```

---

## API Configuration

All LLM calls route through OpenRouter using `OPENROUTER_API_KEY` from environment.

| Phase | Model / Source | Purpose |
|-------|---------------|---------|
| KBV2 Deep Review | VectorShift pipeline: `Signaling KB Semantic Search v2` (Sonnet 4.6 + Opus 4.6) | Two-stage iterative semantic search across 4 KBs (voyage-4-large embeddings) |
| Lens 1 | `anthropic/claude-opus-4-6` | Mechanistic reasoning (grounded in KBV2 pathways) |
| Lens 2 | `perplexity/sonar-deep-research` | Literature review (informed by KBV2 gaps) |
| Lens 3 | Local files (`kb-v2-all/`) + pipeline dossier | KB cross-referencing (read local files for depth beyond search chunks) |
| Synthesis | `anthropic/claude-opus-4-6` | Integration (with KBV2 narrative threads & conflicts) |
| Quality Gates | `anthropic/claude-opus-4-6` | Evaluation |

**VectorShift Pipeline:** `cli/run_signaling_kb_search.py` in `/Users/anantvinjamoori/Vectorshift Pipelines/`
**Pipeline ID:** `69a859911633ae82dca34874` (registered as `signaling_kb_search` in registry)

**Estimated cost per entry:** $0.50-0.75 (KBV2 pipeline uses Sonnet + Opus; Lens 3 supplements with local file reads)

---

## Key Principles

1. **KBV2 First, Always** - Every generation starts with a deep review of the local knowledge base. The 1,165 curated documents in `kb-v2-all/` are the richest source of first-principles knowledge available. Read them before generating anything.
2. **Three Lenses, One Truth** - Each lens provides a unique perspective; synthesis reconciles them
3. **First Principles First** - Explain HOW before evaluating IF
4. **Connections Over Summaries** - The value of KBV2 is in cross-document connections: a theme that appears in a pathway file, gets dosed in an intervention file, measured via a biomarker, and contested in a conflict file is exponentially more valuable than any single document
5. **Evidence Hierarchy** - RCTs > Observational > Case > Mechanistic > Clinician Experience
6. **KB Enrichment is MANDATORY** - KBV2 local files must be read thoroughly; they provide the curated PMIDs and clinical wisdom that differentiate our output
7. **Conflicts Are Features** - KBV2 conflict files contain the field's honest assessment of what it doesn't know. Use them to calibrate tone and avoid overclaiming.
8. **Vendor Neutrality** - Educate, don't rank; use "notable for" framing
9. **Elevated Scientific Listicle** - Deep, research-driven content in LLM-optimized structure
10. **AEO-First** - Structure content for AI answer engine citation

## Critical: KB Citation Policy

**The KB is a source aggregator, not a citable source.** When Lens 3 extracts data from the KB:

- **DO:** Extract PMIDs and DOIs from `peer_reviewed_citations[]` arrays and cite them directly
- **DO:** Reference the literature (e.g., "Butyrate serves as primary colonocyte fuel (Science, 2018)")
- **DON'T:** Cite "the KB" or "internal knowledge base" as a source
- **DON'T:** Reference "expert lecture" source types without peer-reviewed backing

Example transformation:
```
KB data: mechanism_claims[].peer_reviewed_citations[0].doi = "10.1126/science.aat9076"

✗ Wrong: "According to our knowledge base, butyrate fuels colonocytes"
✓ Right: "Butyrate serves as the primary energy substrate for colonocytes (Litvak et al., Science, 2018)"
```

---

## Output Format: Elevated Scientific Listicle

The output is an **elevated, highly scientific, research-driven listicle**—not a superficial "top 5" list. This format:
- Satisfies LLM extraction patterns (structured for AI citation)
- Provides genuine clinical value (substantive enough that practitioners learn)
- Positions vendors positively ("notable for" framing, no rankings)
- Goes deep (5,000-7,000 words, 400-600 words per entity)

### Why This Format (AEO Research)

- **80%** of articles cited by ChatGPT include list sections
- Content with **sequential H1>H2>H3 structure** is cited **3x more often**
- **Q&A format** content is **40% more likely** to be extracted by AI
- LLMs cite answers, not articles—structure each paragraph to answer one question

### Required Content Depth

| Section | Word Count | Key Elements |
|---------|------------|--------------|
| Quick Reference Table | N/A | 5-6 rows, 4-5 columns at page top |
| Executive Summary | 300-400 | Clinical value proposition |
| Technology | 800-1000 | H3 per methodology, comparison table, diagram |
| Evidence | 600-800 | Graded table, nuance callouts, inline Q&A |
| Each Entity | 400-600 | Quick facts, approach depth, clinical fit, evidence |
| Decision Support | 500-700 | Action pathways table, expectations |
| FAQ | 500-800 | 6-10 Q&A pairs, front-loaded answers |
| **Total** | **5,000-7,000** | Comprehensive clinical guide |

### Inline Q&A Distribution

Q&A blocks must be woven throughout—not siloed in FAQ section:
- Technology section: methodology comparisons
- Evidence section: interpretation guidance
- Decision support: actionability questions
- FAQ section: comprehensive coverage

See `context/aeo-best-practices.md` for detailed AEO requirements.

---

## CRITICAL: HTML Design System

**All directory pages MUST use the template at `templates/directory_page.html`** to ensure visual consistency across the NGM Commons platform.

### Design System Requirements

| Element | Specification |
|---------|---------------|
| **Fonts** | Google Fonts: `Inter` (sans) + `Cormorant Garamond` (serif) — NEVER use system fonts |
| **Color Palette** | Warm editorial: `--ink-900: #302C27`, `--gold: #C49A6C`, `--green: #5C8A6B` |
| **Layout** | `max-width: 860px`, centered, `padding: 48px 20px` |
| **Entity Cards** | `.entity-section` with `border: 1px solid`, `border-radius: 12px` |
| **Tables** | `.quick-reference` with dark header row (`--ink-900`) |
| **Breadcrumbs** | Always include navigation back to overview |
| **Framework Badge** | Fixed position bottom-right: `3lens-v1 | {category}` |

### Category Color Mapping

| Category | Primary Color | Badge Class |
|----------|---------------|-------------|
| Gut Microbiome | `--green: #5C8A6B` | `.badge-green` |
| Oral Microbiome | `--blue: #5C7A8A` | `.badge-blue` |
| Vaginal Microbiome | `--purple: #7A6C8A` | `.badge-purple` |
| SIBO Breath Testing | `--orange: #D4845C` | `.badge-orange` |
| Overview/Default | `--gold: #C49A6C` | `.badge-gold` |

### Required HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google Fonts - REQUIRED -->
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <article>
    <nav class="breadcrumb">...</nav>
    <header>...</header>
    <section><!-- Quick Reference Table --></section>
    <section><!-- Executive Summary with .summary-box --></section>
    <div class="kb-insight"><!-- KB Citation Callout --></div>
    <div class="entity-section"><!-- Vendor 1 --></div>
    <div class="entity-section"><!-- Vendor 2 --></div>
    <!-- ... -->
    <section><!-- Clinical Decision Support --></section>
    <section><!-- FAQ --></section>
    <section class="sources"><!-- Sources with PMIDs --></section>
  </article>
  <div class="framework-badge">3lens-v1 | {category}</div>
</body>
</html>
```

### Design Consistency Quality Gate (Listicle Pages)

Before **listicle** page generation is complete, verify:

- [ ] **D.1** Uses Google Fonts (Inter + Cormorant Garamond), NOT system fonts
- [ ] **D.2** Uses NGM color palette (`--ink-*`, `--gold`, `--green`, etc.)
- [ ] **D.3** Includes breadcrumb navigation
- [ ] **D.4** Entity sections use `.entity-section` class with rounded borders
- [ ] **D.5** Quick reference table uses `.quick-reference` class
- [ ] **D.6** Has framework badge in bottom-right corner
- [ ] **D.7** KB insight callouts use `.kb-insight` class
- [ ] **D.8** Has "Claim This Profile" section between Sources and framework badge

**All 8 must pass** — design inconsistency is a blocking issue.

### Design Consistency Quality Gate (Guide Pages — v2 Editorial)

Before **guide** page generation is complete, verify:

- [ ] **GD.1** Uses Google Fonts: Cormorant Garamond + Source Serif 4 + DM Sans (NOT Inter/Cormorant Garamond)
- [ ] **GD.2** Uses v2 color palette (`--paper: #FEFDFB`, `--accent: #8B7355`, etc.)
- [ ] **GD.3** Includes breadcrumb navigation + kicker + deck + byline
- [ ] **GD.4** "The Bottom Line" is left-accent-border prose paragraph (NOT summary cards)
- [ ] **GD.5** Section markers use Roman numerals (I, II, III) in accent text
- [ ] **GD.6** Evaluation criteria use vertical typographic stack (NOT card grid)
- [ ] **GD.7** At least 3 SVG diagrams, at least 1 showing biological machinery
- [ ] **GD.8** Platform-types table (NOT company directory) — zero specific company names in guide body
- [ ] **GD.9** Pull quotes are centered Cormorant italic between thin rules
- [ ] **GD.10** Framework badge reads `3lens-guide-v2 | {category}`

**All 10 must pass** — design inconsistency is a blocking issue.

---

---

## Guide Mode (`--guide`)

When `--guide` is passed, the generator produces a **first-principles educational guide** instead of the default elevated scientific listicle. This implements the "depth gradient" sponsorship model.

### The Depth Gradient Model

The guide format separates content into two layers with different depth levels:

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: THE GUIDE (Free, Editorial, Trust-Building)              │
│                                                                     │
│  First-principles educational content:                              │
│  - How to think about this category                                │
│  - Major methodological approaches explained                       │
│  - What "good" looks like (evaluation framework)                   │
│  - PLATFORM-TYPE FRAMEWORKS (not company names)                    │
│  - KB-powered intervention connections                             │
│  - Mechanism SVG diagrams showing biological machinery             │
│                                                                     │
│  CRITICAL: NO specific company names in the guide body.            │
│  Use platform-type categories instead (e.g., "Multi-clock array    │
│  panels", "Buccal ETC enzyme activity assays").                    │
│                                                                     │
│  Word count: 3,000-5,000 words                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 2: FEATURED PARTNER SPOTLIGHTS (Paid, Clearly Labeled)     │
│                                                                     │
│  Deep three-lens profiles for SPONSORS ONLY:                       │
│  - Full mechanistic evaluation                                      │
│  - Evidence & validation write-up                                   │
│  - Clinical fit analysis                                            │
│  - Vendor-provided video embed + custom CTA                        │
│  - Lead capture integration                                         │
│  - "Featured Partner" badge — clearly labeled                      │
│                                                                     │
│  Only sponsors get named. This is how companies earn explicit      │
│  mention — by partnering. The guide itself is editorially neutral. │
│                                                                     │
│  Word count: 400-600 per partner                                    │
│  Only rendered for entities with `featured_partner: true`           │
└─────────────────────────────────────────────────────────────────────┘
```

> **Why no company directory layer?** Naming companies for free in the guide body reduces the commercial value of Featured Partner sponsorships. Instead, the guide provides a *platform-type framework* that teaches clinicians how to evaluate any company in the space, while Featured Partners receive the only explicit company mentions — visible to practitioners actively learning about the category.

### How Guide Mode Changes Each Phase

| Phase | Default (Listicle) | Guide Mode |
|-------|-------------------|------------|
| **Lens 1-3** | Same | Same — all lenses execute identically |
| **Synthesis** | Uses `prompts/synthesis.md` | Uses `prompts/synthesis_guide.md` |
| **Assembly** | Uses `prompts/html_template.md` + `templates/directory_page.html` | Uses `prompts/html_template_guide.md` + `templates/guide_page.html` |
| **Output JSON** | `directory_content.json` | `guide_content.json` |
| **Output HTML** | `directory_page.html` | `guide_page.html` |
| **Framework badge** | `3lens-v1 | {category}` | `3lens-guide-v2 | {category}` |

### Guide-Specific JSON Schema

```json
{
  "meta": {
    "product_name": "Microbiome Testing",
    "slug": "microbiome-testing-2026",
    "content_type": "guide",
    "framework_version": "3lens-guide-v2",
    "featured_partners": []
  },
  "guide": {
    "title": "How to Think About Microbiome Testing",
    "subtitle": "A first-principles framework for evaluating gut microbiome testing",
    "framework_sections": [
      {
        "heading": "The Core Question",
        "content_markdown": "..."
      },
      {
        "heading": "Major Methodological Approaches",
        "subsections": [
          { "heading": "Sequencing-Based", "content_markdown": "..." },
          { "heading": "Targeted Detection", "content_markdown": "..." }
        ]
      },
      {
        "heading": "What 'Good' Looks Like",
        "content_markdown": "..."
      }
    ],
    "evaluation_framework": {
      "criteria": ["Analytical Validity", "Clinical Validity", "Clinical Utility"],
      "content_markdown": "..."
    },
    "platform_types": [
      {
        "type": "Shotgun metagenomics panels",
        "what_it_offers": "Species-level resolution, functional gene catalog",
        "what_to_ask": "Sequencing depth, reference database version, longitudinal tracking?",
        "typical_price": "$150-350"
      }
    ]
  },
  "featured_partners": [],
  "lens_1_mechanistic": { "..." : "..." },
  "lens_2_literature": { "..." : "..." },
  "lens_3_kb_crossref": { "..." : "..." },
  "sources": [...]
}
```

> **Note:** The `directory` array with named companies has been removed. Guides use a `platform_types` framework instead, categorizing the commercial landscape by methodology without naming specific companies.

### Guide-Specific Quality Gates

**Synthesis (Guide Mode) — 10/12 to pass:**

| Gate | Check |
|------|-------|
| G.1 `first_principles_lead` | Guide opens with conceptual framework, not company names |
| G.2 `methodology_education` | Each approach explained from mechanisms, not product descriptions |
| G.3 `evaluation_framework_present` | Clear criteria for what "good" looks like |
| G.4 `no_company_names` | **ZERO specific company names in guide body** — uses platform-type frameworks instead |
| G.5 `partner_labeling` | Featured partner sections clearly labeled "Featured Partner" |
| G.6 `platform_types_framework` | Commercial landscape presented via platform-type categories with "What to Ask" and "Typical Price Range" columns |
| G.7 `no_ranking_in_guide` | Guide teaches principles, never ranks or recommends |
| G.8 `kb_integration` | KB insights woven into framework sections (not siloed) |
| G.9 `depth_gradient_clear` | Visual/structural difference between guide, partner profiles |
| G.10 `vendor_tone_check` | Same banned language rules as default mode |
| G.11 `editorial_design_v2` | Uses Cormorant Garamond + Source Serif 4 + DM Sans; NO card grids; typography-driven hierarchy |
| G.12 `mechanism_diagrams` | At least 1 SVG shows actual biological machinery (enzymes, metabolites, signaling arrows) — not generic infographic boxes |

### Design System: Guide Page (v2 — Editorial Typography)

**Guide pages use `templates/guide_page.html`** with the **v2 editorial design system** — a typography-driven hierarchy. Think *Nature Reviews* meets *Kinfolk*. NO card grids, NO container-heavy patterns.

**Fonts:** Cormorant Garamond (display/headers), Source Serif 4 (body), DM Sans (UI/labels/tables)
**Color palette:** `--paper: #FEFDFB`, `--accent: #8B7355`, `--green: #4A7A5A`, `--blue: #4A6A7A`, `--orange: #B06840`, `--purple: #6A5A7A`

| Component | Class | Purpose |
|-----------|-------|---------|
| Bottom line | `.bottom-line` | Single prose paragraph with left accent border (replaces summary cards) |
| Section marker | `.section-marker` + `.section-num` | Roman numerals (I, II, III) in accent color |
| Pull quote | `.pull-quote` | Centered Cormorant italic between thin rules |
| Evaluation criterion | `.criterion` + `.criterion-header` + `.criterion-name` + `.criterion-question` | Vertical typographic stack with thin rules (NOT card grid) |
| Mechanistic note | `.mechanistic-note` | Green left border insight callout (no box) |
| Collapsible detail | `<details>` + `.detail-body` | Left border indent for dense content |
| Platform-types table | Standard `<table>` with typographic headers | Categories the commercial landscape by type (no company names) |
| Featured partner | `.featured-partner` + `.badge-partner` | Deep profile card with accent border (sponsors only) |
| Partner CTA | `.partner-cta` | Dark-background "Become a Featured Partner" block |
| Layer label | `.layer-label-wrap` + `.layer-label` | Centered label between thin rules dividing content layers |

**CRITICAL DESIGN RULES:**
1. **No card grids** — NEVER use `.principles-grid`, `.summary-cards`, or card-in-grid patterns
2. **No company names in guide body** — Use platform-type frameworks; only sponsors get named in Featured Partner profiles
3. **Max 3 sentences per paragraph** — Bold the first sentence
4. **Visual break every 2-3 paragraphs** — Diagram, pull quote, table, or criterion
5. **At least 3 SVG diagrams** — At least 1 must show actual biological machinery (signaling pathways with enzymes/metabolites)
6. **At least 1 `<details>` collapsible** — For dense technical content that doesn't need to be visible on first scan

### When to Use Guide Mode

- **Category pages** (microbiome testing, genomics testing, mitochondrial testing) — USE `--guide`
- **Single-vendor profiles** (Viome, MeScreen) — use default listicle mode
- **Comparison pages** — can use either; guide mode preferred for broad categories

---

## Company Profile Mode (`--company-profile`)

When `--company-profile <company_name>` is passed, the generator produces a **deep single-company evaluation page** — a dedicated profile for Tier 2+ partners on the NGM Commons platform.

### When to Use Company Profile Mode

- **Tier 2 (Company Page) partners** — `--company-profile "Viome" --tier 2`
- **Tier 3 (Strategic Partner) partners** — `--company-profile "Viome" --tier 3` (richer content, more KB integration, video section)
- **NOT for category evaluations** — use default mode or `--guide` for categories

### How Company Profile Mode Changes Each Phase

| Phase | Default (Listicle) | Company Profile |
|-------|-------------------|-----------------|
| **KBV2 Deep Review** | Same | Same — full KB scan |
| **Lens 1-3** | Multi-entity analysis | Focused on single company within category context |
| **Synthesis** | Uses `prompts/synthesis.md` | Uses `prompts/synthesis_company.md` |
| **Assembly** | Uses `templates/directory_page.html` | Uses `templates/company_page.html` |
| **Output JSON** | `directory_content.json` | `company_content.json` |
| **Output HTML** | `directory_page.html` | `company_page.html` |
| **Framework badge** | `3lens-v1 \| {category}` | `company-v1 \| {category}` |

### Content Structure

```
Company Hero (name, tagline, badge, quick facts grid)
├── Executive Summary (200-300 words)
├── The Approach (1000+ words)
│   ├── Foundational methodology
│   ├── Technical differentiation
│   └── SVG diagram + inline Q&A
├── Evidence & Validation (800+ words)
│   ├── Published studies + evidence table
│   ├── Regulatory status
│   └── Clinical performance data
├── Clinical Implementation (600+ words)
│   ├── Patient/population fit
│   ├── Workflow integration
│   └── Interpretation framework
├── Related Interventions & Pathways
│   ├── What practitioners do with results
│   ├── Biomarkers measured
│   └── Finding → intervention action table
├── Video Section (Tier 2+ only)
├── Category Context
│   ├── Methodological comparison table
│   └── Where the field is evolving
├── Vendor CTA
├── FAQ (6-10 company-specific Q&A)
└── Sources (15+ unique PMIDs/DOIs)
```

### Tier-Aware Content Depth

| Aspect | Tier 2 (Company Page) | Tier 3 (Strategic Partner) |
|--------|----------------------|--------------------------|
| **Total words** | 4,000-6,000 | 6,000-8,000 |
| **Inline Q&A** | Minimum 3 | Minimum 5 |
| **Badge** | "Verified Partner" | "Strategic Partner" |
| **Video section** | Included | Included |
| **KB integration** | Standard | Extended (more intervention mappings) |

### Company Profile Quality Gates (5/5 must pass)

| Gate | Check |
|------|-------|
| CP.1 `clinical_voice_throughout` | Every section answers "so what?" from a clinician's perspective |
| CP.2 `vendor_positive_framing` | Company positioned via "notable for" — zero ranking language |
| CP.3 `evidence_honestly_graded` | All studies have explicit evidence levels; unknowns acknowledged |
| CP.4 `kb_wisdom_integrated` | KBV2 content enriches at least 3 of 5 major sections |
| CP.5 `actionability_clear` | Clinician can answer "should I use this?" after reading |

### Design System: Company Page

**Company pages use `templates/company_page.html`** with these components:

| Component | Class | Purpose |
|-----------|-------|---------|
| Company header | `.company-header` | Breadcrumb, badge, title, subtitle |
| Quick facts | `.quick-facts` | Grid of key company data points |
| Summary box | `.summary-box` | Gold-bordered executive summary |
| Evidence table | `.evidence-table` | Study details with evidence badges |
| Evidence badges | `.evidence-strong` / `.evidence-moderate` / `.evidence-emerging` / `.evidence-preliminary` | Color-coded evidence levels |
| Inline Q&A | `.inline-qa` | Green-bordered Q&A callouts |
| KB insight | `.kb-insight` | Green left-border knowledge base insights |
| Comparison table | `.comparison-table` + `.current-company` | Category positioning with highlighted row |
| Video section | `.video-section` | Vendor video embed placeholder |
| Vendor CTA | `.vendor-cta` | Gold-bordered call-to-action |

### Example Invocation

```bash
# Tier 2 company page for Viome
/directory-generate-3lens "Microbiome Testing" --company-profile "Viome" --tier 2

# Tier 3 strategic partner page for Viome
/directory-generate-3lens "Microbiome Testing" --company-profile "Viome" --tier 3

# Resume an interrupted company profile
/directory-generate-3lens "Microbiome Testing" --company-profile "Viome" --tier 2 --resume
```

---

## Troubleshooting

**Lens 1 fails L1.5 (diagram_validity):**
- Check SVG viewBox dimensions match content
- Ensure 40px padding on all sides
- Validate text doesn't overflow containers

**Lens 2 fails L2.1 (citation_validity):**
- Some Perplexity citations may be hallucinated
- Cross-verify PMIDs via PubMed API
- Remove unverifiable citations

**Lens 3 finds no KB node:**
- Product may be new to KB
- Graceful degradation via L3.6
- Use indirect queries (target, pathway) to find related interventions

**Synthesis fails S.2 (conflict_addressed):**
- Review all three lens outputs for discrepancies
- Explicitly note where lenses disagree
- Provide characterization of conflict nature
