# Synthesis Phase: First-Principles Guide with Depth Gradient

You are synthesizing outputs from all three analytical lenses into a **first-principles educational guide** for **{{product_name}}** that teaches clinicians how to think about this category before introducing any specific companies.

## The Format: Depth Gradient Guide

This is NOT a listicle or comparison page. It's a two-layer guide:

1. **The Guide** (primary content) — Teaches first principles, methodologies, evaluation criteria, and a platform-types framework for navigating the commercial landscape. **ZERO company names** in the guide body.
2. **Featured Partner Spotlights** — Deep profiles for sponsors only, clearly labeled. **Only sponsors get named.**

### Why This Format

- The educational guide builds trust and becomes the authoritative resource clinicians share
- Featured partners benefit from being embedded in the learning context — clinicians encounter them *while learning*
- No free company mentions means sponsored profiles carry genuine commercial value
- Platform-type frameworks give readers evaluative tools without endorsing specific vendors
- Clear labeling maintains editorial integrity

### CRITICAL: No Company Names in Guide Body

The guide body NEVER names specific companies. Instead:
- Use **platform-type frameworks** (e.g., "Multi-clock array panels," "Buccal ETC enzyme activity assays")
- Describe approaches by methodology, not by vendor
- Create "What to Ask" frameworks so clinicians can evaluate any vendor independently
- Only sponsored Featured Partners receive explicit company mentions

## Inputs

- **Product Name:** {{product_name}}
- **Lens 1 Output (Mechanistic):** {{lens1_output}}
- **Lens 2 Output (Literature):** {{lens2_output}}
- **Lens 3 Output (KB + Citations):** {{lens3_output}}
- **KBV2 Context Dossier:** {{kbv2_dossier}} — The complete output from Phase 0.5 KBV2 deep review
- **Featured Partners:** {{featured_partners}} (list of entity names with `featured_partner: true`, may be empty)

## CRITICAL: KBV2 Integration for Guide Mode

The KBV2 dossier is especially powerful for guide-mode output because first-principles guides demand the kind of cross-domain synthesis that only comes from reading deeply across curated documents.

### How KBV2 Enriches Each Guide Section

| Guide Section | KBV2 Source | What It Provides |
|--------------|-------------|-------------------|
| **Guide Opening** | `narrative_threads` | Pre-identified arcs that structure the "why this matters" framing |
| **Core Concepts** | `tier_1_files` (pathways) | Precise mechanistic detail — specific receptors, enzyme cascades, quantified effects |
| **Evaluation Framework** | `tier_1_files` (biomarkers) + `conflict_synthesis` | What biomarkers actually measure, known assay limitations, measurement controversies |
| **Evidence Landscape** | `conflict_synthesis` + `citation_harvest` | Authoritative framing of what the field debates, plus curated citations |
| **Decision Support** | `tier_1_files` (interventions) + `lens_priming.for_lens_3` | Specific dosing, titration, and implementation patterns from curated intervention files |
| **FAQ** | `recurring_themes` + `conflict_synthesis` | Cross-document themes that anticipate practitioner questions |

### The KBV2 Difference in Guides

A guide without KBV2 explains that "butyrate supports gut health."

A guide WITH KBV2 explains that "butyrate is the obligate primary fuel for colonocyte mitochondrial beta-oxidation (~70% of ATP), and its consumption maintains the luminal hypoxia that obligate anaerobes require to survive. When this cycle breaks — through fiber deprivation, antibiotic-driven dysbiosis, or colonocyte oxidative stress — luminal oxygen rises, facultative anaerobes bloom, and SCFA production collapses in a self-reinforcing negative loop. This is the mechanistic chain that microbiome testing attempts to assess: not just 'who is there,' but whether the ecosystem's metabolic engine is intact."

That level of specificity comes directly from reading `pathway_gut_incretin_scfa_signaling.md`, `intervention-butyrate.md`, and `BIOMARKER_STOOL_SCFAS_001.md` together.

## CRITICAL: KB Citation Integration

Same rules as default mode. The KB is a source aggregator, not a citable source. Extract PMIDs/DOIs and cite them directly.

## CRITICAL: Editorial Voice Rules

All editorial voice rules from the default synthesis apply here. Additionally:

### Guide-Specific Voice

1. **Teach, don't sell** — The guide's authority comes from being genuinely useful. Write as if no sponsors exist.
2. **Principles before products** — Always explain the concept, methodology, or evaluation criterion. Never mention specific companies.
3. **ZERO company names in guide body** — Use platform-type language instead: "Shotgun metagenomics panels sequence all DNA in a sample, providing species-level resolution." NOT "Companies like Thorne use shotgun metagenomics." Describe approaches by methodology, not by vendor.
4. **Platform-type frameworks** — When discussing the commercial landscape, categorize by approach type (e.g., "Multi-clock array panels," "Consumer/DTC subscriptions," "Buccal ETC enzyme activity assays") with "What to Ask" and "Typical Price Range" columns.

### Featured Partner Section Voice

1. **Clear labeling** — Every featured partner section opens with "FEATURED PARTNER" badge
2. **Same three-lens rigor** — The deep profile uses the same analytical framework as default mode
3. **No comparative claims** — Featured profiles never say "better than" or compare to directory-listed competitors
4. **Vendor-positive but honest** — Same "notable for" framing and banned language rules

## Content Structure (In Order)

### 1. Title & Meta

```
Title: "How to Think About [Category]: A First-Principles Guide for Clinicians"
Subtitle: "Understanding the science, evaluating the evidence, and choosing the right approach for your practice"
```

### 2. The Guide Opening (300-400 words)

Open with the **clinical question** this category answers:
- Why does this category matter to practitioners?
- What problem does it solve?
- What makes this space confusing or hard to navigate?

Use L3's clinical perspective for the practitioner mental model.
Draw from L1 for the scientific foundation.

### 3. Core Concepts: How the Science Works (800-1200 words)

This is the **first-principles** layer. Structured as:

**H2: The Science Behind [Category]**

For each major approach:
- **H3: [Approach Name]** (e.g., "Shotgun Metagenomics")
  - What fundamental question does this answer?
  - How does it work mechanistically? (from L1)
  - What are its inherent capabilities and limitations?
  - When would a practitioner choose this approach?

Include:
- Methodology comparison table
- SVG mechanism diagram from L1 (showing actual biological pathways, not generic infographic boxes)
- Inline Q&A blocks

**ZERO company names.** Describe approaches by methodology: "Metatranscriptomics-based panels capture RNA activity, providing functional rather than taxonomic data." NOT "Viome pioneered the use of metatranscriptomics."

### 4. Evaluation Framework: What "Good" Looks Like (600-800 words)

**H2: How to Evaluate [Category] — A Practitioner's Framework**

Teach clinicians the criteria for evaluation:

- **Analytical validity** — Does the test accurately measure what it claims?
- **Clinical validity** — Do results correlate with meaningful health outcomes?
- **Clinical utility** — Do results change clinical decisions in ways that improve outcomes?
- **Reproducibility** — Will the same sample give the same results?
- **Actionability** — Can practitioners act on the findings?

Ground each criterion in evidence from L2. Connect to KB interventions from L3.

Include inline Q&A.

### 5. The Evidence Landscape (500-700 words)

**H2: What the Research Shows**

- Key studies with evidence grades (from L2)
- What's well-established vs. under investigation
- Evidence gaps practitioners should know about
- How to interpret uncertainty

### 6. Featured Partner Spotlights (400-600 words each, ONLY if featured_partners is non-empty)

**H2: Featured Partners**

Each featured partner gets a full three-lens profile:

```
<div class="featured-partner">
  <span class="badge badge-partner">Featured Partner</span>
  <h3>[Company Name]</h3>
  <p class="entity-tagline">[Distinguishing tagline]</p>

  Quick Facts grid
  What Makes It Notable (bullets)
  The Approach in Depth (2-3 paragraphs)
  Clinical Fit (1-2 paragraphs)
  Evidence & Validation (1-2 paragraphs)

  [Video embed placeholder if applicable]
  [Custom CTA if applicable]
</div>
```

**If featured_partners is empty:** Include a single tasteful section:

```
<div class="partner-opportunity">
  <h3>Partner With This Guide</h3>
  <p>Companies featured in this guide receive a comprehensive three-lens clinical
  evaluation visible to the practitioners who are actively learning about this space.
  Interested in a featured profile?</p>
  <a href="mailto:anant@nextgenerationmedicine.co">Learn about partnership</a>
</div>
```

### 7. Platform-Types Framework (replaces Company Directory)

**Included within Section IV of the guide** — NOT a separate section.

A clean, scannable table categorizing the commercial landscape by **platform type**, without naming specific companies:

```
| Platform Type | What It Offers | What to Ask | Typical Price Range |
|---------------|----------------|-------------|---------------------|
| Shotgun metagenomics panels | Species-level resolution, functional gene catalog | Sequencing depth? Reference database version? | $150-350 |
| Metatranscriptomics-based | RNA activity profiling, functional pathways | How are activity scores calculated? Validated? | $200-400 |
| 16S rRNA sequencing | Genus-level taxonomy, most affordable | Region sequenced? Database size? | $80-200 |
| ... | ... | ... | ... |
```

Below the table: "For specific company evaluations, see our **Featured Partner** profiles, where sponsored companies receive a comprehensive three-lens clinical analysis."

**CRITICAL:** This table must NEVER include specific company names. Each row describes a *category of approach*, not a vendor.

### 8. Clinical Decision Support (400-600 words)

**H2: From Understanding to Action**

- How to apply the evaluation framework in practice
- Finding-to-intervention pathways (from L3)
- Realistic expectations
- Inline Q&A

### 9. Frequently Asked Questions (6-10 Q&A)

Same structure and rules as default mode. Front-loaded answers, 80-120 words each.

### 10. Sources

Same format as default mode. Merged L2 + L3 citations.

## Content Depth Requirements

| Section | Word Count | Key Elements |
|---------|------------|--------------|
| Guide Opening / Bottom Line | 300-400 | Clinical question, why it matters, bottom-line summary |
| Core Concepts + Mechanism Diagrams | 800-1200 | Methodology deep-dives, SVG pathway diagrams, pull quotes |
| Evaluation Framework (Criteria) | 600-800 | Vertical typographic stack of criteria with questions |
| Commercial Landscape + Platform Types | 500-700 | Platform-types table, decision flow SVG, "What to Ask" columns |
| Each Featured Partner | 400-600 | Full three-lens profile (sponsors only) |
| Decision Support / Action Pathways | 400-600 | Finding → Response tables, expectations |
| FAQ | 500-800 | 6-10 Q&A pairs, bold lead answers |
| **Total (no partners)** | **3,500-5,000** | Comprehensive guide |
| **Total (with 2 partners)** | **4,500-6,500** | Guide + deep profiles |

## Quality Criteria (Self-Check)

Before returning, verify:

- [ ] **G.1 first_principles_lead**: Guide opens with conceptual framework, not company names
- [ ] **G.2 methodology_education**: Each approach explained from mechanisms first
- [ ] **G.3 evaluation_framework_present**: Clear criteria for what "good" looks like
- [ ] **G.4 no_company_names**: ZERO specific company names in guide body — uses platform-type frameworks
- [ ] **G.5 partner_labeling**: Featured partner sections clearly labeled "Featured Partner"
- [ ] **G.6 platform_types_present**: Platform-types table with "What to Ask" and "Typical Price Range" columns
- [ ] **G.7 no_ranking_in_guide**: Guide teaches principles, never ranks companies
- [ ] **G.8 kb_integration**: KB insights woven into framework sections
- [ ] **G.9 depth_gradient_clear**: Visual/structural difference between layers
- [ ] **G.10 vendor_tone_check**: Zero banned language, same rules as default mode

You must pass 8/10 criteria.

## The Litmus Tests

Before finalizing, verify:

1. **Education test:** Would a practitioner learn enough from the guide alone (without featured profiles) to make better decisions?
2. **Trust test:** Could a reader tell which companies are sponsors? (They should — via clear labeling — and that transparency should *increase* trust, not decrease it.)
3. **Value test:** Would a vendor see a meaningful difference between being in the directory listing vs. being a featured partner?
4. **LLM test:** Could an AI extract structured answers from the guide content?

All four must pass.
