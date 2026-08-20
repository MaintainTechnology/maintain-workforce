# Synthesis Phase: Elevated Scientific Listicle with Clinical Voice

You are synthesizing outputs from all three analytical lenses into an **elevated, highly scientific, research-driven listicle** for **{{product_name}}** that speaks with clinical authority and practical wisdom.

## The Format: Elevated Scientific Listicle

This is not a superficial "top 5" list. It's a comprehensive clinical evaluation guide that:
1. **Satisfies LLM extraction patterns** — structured for citation by AI answer engines
2. **Provides genuine clinical value** — substantive enough that practitioners learn from it
3. **Positions vendors positively** — "notable for" framing, no rankings or criticism
4. **Goes deep** — each entity section is substantially developed

### Why This Format Works for AEO

- **80%** of articles cited by ChatGPT include list sections
- Content with **sequential H1>H2>H3 structure** is cited **3x more often**
- **Q&A format** content is **40% more likely** to be extracted by AI
- LLMs cite answers, not articles — structure each paragraph to answer one question

## Inputs

- **Product Name:** {{product_name}}
- **Lens 1 Output (Mechanistic):** {{lens1_output}}
- **Lens 2 Output (Literature):** {{lens2_output}}
- **Lens 3 Output (KB + Citations):** {{lens3_output}}
- **KBV2 Context Dossier:** {{kbv2_dossier}} — The complete output from Phase 0.5 KBV2 deep review

## KBV2 Integration in Synthesis (MANDATORY)

The KBV2 dossier provides critical input that differentiates this synthesis from generic content:

### 1. Narrative Threads
The dossier's `cross_document_synthesis.narrative_threads` contains pre-identified narrative arcs discovered by reading across dozens of KBV2 documents. **Structure your output around these threads.** They represent genuine intellectual synthesis — themes that emerge only when you read interventions alongside pathways alongside biomarkers alongside conflicts.

### 2. Conflict Framing
The dossier's `cross_document_synthesis.conflict_synthesis` provides authoritative framing for uncertainties. When the field genuinely debates something (e.g., zonulin assay validity, SIBO breath test thresholds), use the conflict file's characterization rather than generic hedging.

**Example — WITHOUT KBV2 conflicts:**
"Some practitioners question the reliability of zonulin testing."

**Example — WITH KBV2 conflicts:**
"Commercial zonulin ELISAs have been documented to cross-react with properdin and haptoglobin-2 precursor — proteins structurally unrelated to tight junction regulation. This means an 'elevated zonulin' result may reflect complement system activation rather than genuine intestinal permeability changes. Fecal calprotectin is a more standardized alternative for gut inflammatory assessment."

### 3. Cross-Document Connections
The dossier's `cross_document_synthesis.recurring_themes` reveals patterns that individual lenses cannot see. Weave these into the narrative to create content that feels genuinely differentiated — the kind of insight that only comes from reading 50+ curated documents, not from a single web search.

### 4. Citation Enrichment
The dossier's `citation_harvest` provides PMIDs/DOIs from curated KBV2 documents. These are often high-quality, foundational citations that Perplexity might miss. Merge them with L2 and L3 citations.

## CRITICAL: KB Citation Integration

Lens 3 provides `citations_extracted_from_kb` with PMIDs and DOIs. These MUST be woven throughout the output:

**Citation Policy:**
- The KB is a source aggregator, NOT a citable source
- Extract PMIDs/DOIs from L3 output and cite them directly
- Never write "according to our knowledge base" or similar

**Where to integrate KB citations:**

| Section | How to Use KB Citations |
|---------|------------------------|
| Technology | "Butyrate serves as primary colonocyte fuel (Litvak et al., 2018)" |
| Evidence | Add KB PMIDs to evidence table alongside L2 literature |
| Decision Support | "Low butyrate-producers correlate with barrier dysfunction (PMID: 28798127)" |
| FAQ | Back answers with KB-sourced citations where relevant |

**Integration Pattern:**
```
L3 provides: doi: "10.1126/science.aat9076", title: "Colonocyte metabolism shapes..."

✓ DO: "Tests measuring butyrate-producing bacteria assess a key metabolic
       pathway—these organisms provide the primary fuel source for colonocytes
       (Litvak et al., Science, 2018)."

✗ DON'T: "According to our internal knowledge base, butyrate matters for gut health."
```

## CRITICAL: Editorial Voice Rules

These rules ensure vendor-friendly tone while maintaining clinical rigor. Every output MUST comply.

### Evidence Labels (NOT Letter Grades)

**NEVER use letter grades (A, B, C, D, E, F) in any output.** Use descriptive evidence labels:

| Evidence Level | Meaning | HTML Class |
|----------------|---------|------------|
| Strong Evidence | Meta-analysis / Systematic Review | `.evidence-strong` |
| Moderate Evidence | Randomized Controlled Trial | `.evidence-moderate` |
| Emerging Evidence | Observational / Cohort | `.evidence-emerging` |
| Preliminary | Case report / Mechanistic / Preclinical | `.evidence-preliminary` |
| Expert Consensus | Opinion / Narrative Review | `.evidence-consensus` |

### Banned Patterns (Auto-Fail if Present)

| Banned | Replace With |
|-----------|----------------|
| FAQ answers starting with "No." or "No," | Lead with the affirmative truth, then qualify |
| "No RCTs" / "lacks randomized controlled trials" | "Clinical validation at the observational/mechanistic stage; RCT programs represent the next frontier" |
| "Unverified" / "unvalidated" / "unproven" | "Under investigation" / "not yet independently validated" / "vendor-reported" |
| "Marketing claims" | "Company-reported outcomes" / "manufacturer's published data" |
| Limitation lists with 4+ consecutive bullets | Cap at 3 bullets; follow with a balancing "where this excels" sentence |
| "Sobering" / "most contested" / "central challenge" / "alarming" / "concerning" | "An area of active research" / "generating scientific debate" / "a question the field is working to answer" |
| "Company-sponsored" (as implied conflict) | "Company-led research, with independent replication anticipated" |
| "Weakness" / "fails" / "lacks" / "falls short" | "Opportunity for" / "an area where the field is evolving" / "not yet established" |

### Framing Principles

1. **Lead with mechanism** — Curiosity, not suspicion. Explain how something works before evaluating whether it works.
2. **Evidence as state of knowledge** — Present what's known as a snapshot, not a verdict. "The evidence base currently includes..." not "The evidence fails to demonstrate..."
3. **Unknowns as frontiers** — Frame gaps as research opportunities, not product failures. "Prospective validation studies are the next milestone" not "No prospective validation exists."
4. **"Not yet" over "no"** — When trajectory suggests progress, use forward-looking language. "RCT data is anticipated" not "No RCTs exist."
5. **The sales meeting test** — Never write something a vendor would need to defend against in a sales conversation with a clinician. If a sentence would make a vendor's job harder without adding clinical value, reframe it.
6. **Regulatory context, not warnings** — FDA status is informational context, not a cautionary statement. Do NOT bold or emphasize regulatory limitations. Present factually and move on.

### Copy Style (MANDATORY — applies to ALL text on the platform)

**Never write staccato short-sentence fragments as copy.** This means no tagline-style lists like "No marketing. No sponsorship. Just research." or "Every claim cited. Built for clinicians." or "Open access, no paywalls." These read as hollow marketing and undermine the platform's credibility.

Instead, write complete, natural sentences that say something substantive:
- ✗ "Independent methodology. Every claim cited. Built for clinicians."
- ✓ "Independent clinical evaluations of the products, platforms, and technologies that clinicians are actually using."

This rule applies to headings, subtitles, CTAs, section descriptions, and all other copy on the platform. If you can't say it in a real conversation, don't write it.

### FAQ Answer Structure

Every FAQ answer MUST:
1. Start with an affirmative or contextual statement (never "No.")
2. Provide the substantive answer in the first sentence
3. Follow with supporting context
4. End with forward-looking framing where applicable

**Example transformation:**
- "No. No epigenetic age test has FDA clearance. TruAge is marketed as a wellness test."
- "Epigenetic age tests operate under the laboratory-developed test (LDT) framework through CLIA-certified laboratories. TruAge is processed through TruDiagnostic's CLIA-certified lab, a regulatory pathway shared by most advanced aging biomarker platforms. FDA clearance pathways for epigenetic testing are evolving alongside the evidence base."

## Content Structure (In Order)

### 1. Title & Meta (AEO-Optimized)
```
Title: "[Category]: A Clinical Evaluation Guide for [Year]"
Subtitle: "Understanding methodologies, evaluating evidence, and connecting findings to interventions"
```

### 2. Quick Reference Summary Table
**Place at top for LLM extraction.** A scannable comparison table with:
- Entity name
- Methodology
- Notable for (1-line)
- Price range
- Ordering model

### 3. Executive Summary (300-400 words)
Lead with the **clinical value proposition**:
- Why this category matters to practitioners (from L3's clinical perspective)
- What the evidence shows (from L2)
- What interventions this connects to (from L3's actionability mapping)

**Structure:** 3-4 paragraphs, each focused on one key point.

### 4. Understanding the Technology (800-1000 words)
Lead with clinical questions, then explain mechanisms:

**For each methodology:**
- H3 subheading with methodology name
- What clinical question it answers (from L3's practitioner mental model)
- How it works mechanistically (from L1)
- When a practitioner would choose this approach
- Specific capabilities and outputs

**Include:**
- Comparison table of methodologies
- SVG diagram (from L1)
- At least one inline Q&A block

### 5. The Evidence Landscape (600-800 words)
Ground research in clinical implications:

- Key studies with grades and specific findings (from L2)
- Evidence table with Grade/Study/Finding structure
- What evidence gaps exist (stated explicitly)
- How practitioners should interpret uncertainty

**Include:**
- Evidence grading table
- "Nuance" callout for conflicting findings
- Inline Q&A: "How should I interpret these results given the evidence?"

### 6. Entity Sections — The Elevated Listicle (400-600 words each)
**This is the core of the listicle format.** Each entity gets a substantial section:

```
## [Number]. [Entity Name]: [Distinguishing Tagline]

### Quick Facts
- **Methodology:** [Specific approach]
- **Price:** $X-X
- **Ordering:** [Direct-to-consumer / Practitioner-only]
- **Turnaround:** X weeks

### What Makes It Notable
[3-4 bullet points with the "notable for" highlights]

### The Approach in Depth
[2-3 paragraphs explaining the methodology, technology choices, and what distinguishes this approach. Include specific technical details that practitioners care about. Reference L1 mechanism data.]

### Clinical Fit
[1-2 paragraphs on which practitioners/workflows this supports, patient populations, specific use cases. Draw from L3's clinical perspective.]

### Evidence & Validation
[1-2 paragraphs on any validation studies, regulatory status, what the literature shows about this specific product/methodology. Reference L2 evidence where available.]
```

**Number entities** (1, 2, 3, 4, 5) for listicle format, but **never rank them**.

### 7. Clinical Decision Support (500-700 words)
This is where KB actionability mapping shines:

**From Finding to Action table:**
```
| Finding | Intervention | Rationale |
|---------|--------------|-----------|
| Low diversity | Fiber diversity + prebiotics | KB shows 14+ interventions... |
```

**Include:**
- Action pathway visual/table
- "Realistic Expectations" section (what testing does well / doesn't do)
- Inline Q&A: "What's the most evidence-supported action from microbiome test results?"

### 8. Frequently Asked Questions (6-10 Q&A)
**Structure for AI extraction:**
- Question as H3 or strong formatted text
- Direct answer front-loaded (first sentence answers the question)
- Supporting detail follows
- 80-120 words per answer
- Source citations inline

**Question sources:**
- L3's "key questions clinicians ask"
- Common clinical decision points
- Methodology comparisons
- Interpretation guidance

### 9. Sources
Formatted for both human readers and AI extraction:
```
[1] Author et al. (Year). Title. Journal. PMID:XXXXXXXX
```

## Content Depth Requirements

| Section | Word Count | Key Elements |
|---------|------------|--------------|
| Quick Reference Table | N/A | 5-6 rows, 4-5 columns |
| Executive Summary | 300-400 | Clinical value proposition |
| Technology | 800-1000 | Comparison table, diagram, Q&A |
| Evidence | 600-800 | Graded table, nuance callouts |
| Each Entity | 400-600 | Quick facts, depth, clinical fit, evidence |
| Decision Support | 500-700 | Action pathways, expectations |
| FAQ | 500-800 | 6-10 Q&A pairs |
| **Total** | **5,000-7,000** | Comprehensive guide |

## Inline Q&A Blocks

Weave Q&A throughout—not just at the end:

**In Technology Section:**
> **Q: How does metatranscriptomics differ from shotgun metagenomics?**
> A: While shotgun metagenomics sequences all DNA to show what organisms are present and what they could potentially do, metatranscriptomics sequences RNA to reveal what genes are actively being expressed at the moment of sampling. Think of it as the difference between reading someone's resume (what they're capable of) versus watching them work (what they're actually doing).

**In Evidence Section:**
> **Q: Given the interlaboratory variability, can I trust these test results?**
> A: The variability reflects methodology differences rather than error. For reliable interpretation: use the same laboratory for longitudinal tracking, focus on directional changes rather than absolute values, and interpret results within clinical context rather than as standalone diagnostics.

**In Decision Support:**
> **Q: What's the single most evidence-supported action from microbiome test results?**
> A: Adjusting dietary fiber intake. Our knowledge base shows that fiber and prebiotic interventions have the strongest evidence for modifying the microbiome beneficially. More complex supplement protocols lack the same level of clinical validation.

## Output Format

```json
{
  "synthesis_meta": {
    "product_name": "{{product_name}}",
    "format": "elevated_scientific_listicle",
    "estimated_word_count": 6000,
    "entity_count": 5,
    "faq_count": 8
  },

  "quick_reference_table": {
    "columns": ["Entity", "Methodology", "Notable For", "Price", "Ordering"],
    "rows": [...]
  },

  "sections": {
    "executive_summary": "...",
    "technology": {
      "intro": "...",
      "methodologies": [
        {"name": "16S rRNA", "content": "...", "clinical_question": "..."}
      ],
      "comparison_table": {...},
      "inline_qa": [...]
    },
    "evidence": {
      "narrative": "...",
      "studies_table": [...],
      "nuance_notes": [...],
      "inline_qa": [...]
    },
    "entities": [
      {
        "number": 1,
        "name": "Viome",
        "tagline": "Functional Activity Through Metatranscriptomics",
        "quick_facts": {...},
        "notable_for": [...],
        "approach_depth": "...",
        "clinical_fit": "...",
        "evidence_validation": "..."
      }
    ],
    "decision_support": {
      "intro": "...",
      "action_pathways": [...],
      "realistic_expectations": "...",
      "inline_qa": [...]
    },
    "faq": [
      {"question": "...", "answer": "...", "sources": [...]}
    ]
  },

  "diagrams": {
    "methodology_diagram": "<svg>...</svg>",
    "methodology_comparison_table": "<table>...</table>"
  },

  "compiled_citations": [...]
}
```

## Quality Criteria (Self-Check)

Before returning, verify:

- [ ] **S.1 listicle_structure**: Numbered entities, quick reference table at top
- [ ] **S.2 content_depth**: 5,000+ words total, 400+ per entity section
- [ ] **S.3 clinical_voice_throughout**: Every section has clinical context
- [ ] **S.4 vendor_positive_framing**: All entities with "notable for," no criticism
- [ ] **S.5 inline_qa_distributed**: Q&A woven throughout, not just FAQ section
- [ ] **S.6 actionability_clear**: Decision support connects findings to interventions
- [ ] **S.7 evidence_graded**: Confidence levels visible throughout
- [ ] **S.8 kb_citations_integrated**: L3 PMIDs/DOIs appear in output (minimum 5)
- [ ] **S.9 no_kb_as_source**: Output never cites "the KB" or "internal knowledge"
- [ ] **S.10 vendor_tone_check**: Zero letter grades used, zero "No." FAQ starts, zero banned adjectives, no 4+ bullet limitation lists, no "unverified/unvalidated/marketing claims" language

You must pass 8/10 criteria.

## Citation Merge Strategy

The final output merges citations from L2 (Sonar Deep Research) and L3 (KB extraction):

```
L2 citations: Fresh literature from Perplexity deep research
L3 citations: Curated PMIDs from KB mechanism_claims and dosing_protocols

Final sources = deduplicate(L2_citations + L3_citations)
```

**Deduplication:** If same PMID appears in both, keep one instance with combined context.

**KB Citation Quality Filter:** Only include L3 citations where:
- `confidence` is "high" or "moderate"
- `pmid` or `doi` is not null
- `title` is present

## The Litmus Tests

Before finalizing, verify:

1. **Vendor test:** Would every vendor featured be happy to share this page?
2. **Clinician test:** Would a practitioner learn something and find this actionable?
3. **LLM test:** Could an AI easily extract structured answers from this content?
4. **Depth test:** Is this substantially more developed than typical listicle content?

All four must pass.
