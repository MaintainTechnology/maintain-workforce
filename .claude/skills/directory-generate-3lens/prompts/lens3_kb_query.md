# Lens 3: Knowledge Base Cross-Referencing & Citation Extraction

You are cross-referencing **{{product_name}}** against the local KBV2 knowledge base (`kb-v2-all/`) to:
1. Surface related interventions and mechanism alignment
2. **Extract peer-reviewed citations (PMIDs/DOIs) to enrich the final output**
3. Build actionability mapping from findings to interventions
4. Extract clinical perspective and practical wisdom

## CRITICAL: Citation Policy

**The KB is a source aggregator, NOT a citable source.**

When you find relevant data in the KB files:
- **EXTRACT** the PMIDs and DOIs from the Verifiable Citations and Structured Appendix sections
- **CITE** those papers directly in the final output
- **NEVER** cite "the KB" or "internal knowledge base"

```
✗ WRONG: "According to our knowledge base, butyrate supports colonocyte function"
✓ RIGHT: "Butyrate serves as the primary fuel for colonocyte mitochondrial respiration (Litvak et al., Science, 2018; DOI: 10.1126/science.aat9076)"
```

## Knowledge Base: Local KBV2 Files

**Location:** `kb-v2-all/`
**Total:** 1,165 curated markdown documents

| Category | Count | File Pattern | Content |
|----------|-------|-------------|---------|
| `pathways/` | 152 | `pathway_{name}.md` | Signaling cascades, metabolic axes, crosstalk tables |
| `interventions/` | 413 | `intervention-{slug}.md` | Supplements, drugs, diets with dosing & evidence |
| `biomarkers/` | 297 | `BIOMARKER_{NAME}_001.md` | Clinical markers with interpretation & reference ranges |
| `conflicts/` | 303 | `{descriptive_slug}.md` | Unresolved debates, assay limitations, evidence gaps |

Each file contains:
- **Summary** — Quick overview
- **Mechanistic Context** — Detailed molecular/systems biology
- **Clinical/Practical Use Patterns** — How practitioners use this
- **Dosing and Implementation Patterns** — Protocols and ranges
- **Evidence and Uncertainty** — Confidence levels and gaps
- **Verifiable Citations** — PMIDs and DOIs
- **Lossless Structured Appendix** — Machine-readable metadata

## The Clinical Perspective Layer

Beyond mechanism claims and citations, the KB files contain embedded clinical wisdom:

- **What practitioners actually monitor** → reveals what matters in practice
- **How dosing protocols are structured** → reveals clinical priorities
- **What contraindications are emphasized** → reveals hard-won lessons
- **What combinations are used** → reveals clinical thinking patterns
- **What alternatives exist** → reveals the decision landscape
- **What conflicts exist** → reveals where the field is genuinely uncertain

This implicit knowledge should inform the **voice and perspective** of the entire directory entry — not be siloed into a separate "KB Insights" box.

## Input

- **Product Name:** {{product_name}}
- **Slugified Name:** {{slug}}
- **Lens 1 Output (Mechanism):** {{lens1_output}}
- **KBV2 Context Dossier:** {{kbv2_dossier}} — Contains the complete context from Phase 0.5 KBV2 deep review

## Starting from the KBV2 Dossier

The KBV2 deep review (Phase 0.5) has already:
- Identified and read relevant pathway, intervention, biomarker, and conflict files
- Harvested PMIDs/DOIs from structured appendices
- Built an intervention landscape with relationship classifications
- Mapped actionability connections (Finding → Intervention)
- Synthesized clinical perspective from practitioner-oriented content
- Integrated conflict file insights for evidence calibration

**Use `lens_priming.for_lens_3` from the dossier** which contains:
- `intervention_landscape` — Full list of related interventions with relationships
- `actionability_map_seed` — Pre-built Finding → Intervention mappings
- Files still worth reading that weren't in the Tier 1/2 pass

## Process

### Step 0: Product Type Detection

First, determine the product type:

```
{{product_name}} is a:
[ ] INTERVENTION - supplement, drug, therapy
[ ] TESTING/DIAGNOSTIC - lab test, microbiome test, device (measures biomarkers)
[ ] SERVICE - coaching, program (connects to interventions)
```

**For TESTING/DIAGNOSTIC products, skip Step 1 and go to Step 1B.**

### Step 1: Direct Intervention Lookup (for Intervention products)

Read the relevant KBV2 intervention file(s) directly:

```bash
# Find the intervention file
ls kb-v2-all/interventions/ | grep -i "{{product_slug}}"

# Read the full file
cat kb-v2-all/interventions/intervention-{{product_slug}}.md
```

From the file, extract:
- Mechanism claims with confidence levels
- Dosing protocols and implementation patterns
- Contraindications and monitoring parameters
- All PMIDs and DOIs from Verifiable Citations and Structured Appendix
- Cross-references to pathways and biomarkers

### Step 1B: Biomarker-Based File Reading (for Testing/Diagnostic products)

For testing products, read KBV2 files for what the test MEASURES:

```bash
# Read biomarker files for each key thing the test measures
cat kb-v2-all/biomarkers/BIOMARKER_{{biomarker_name}}_001.md

# Read pathway files for the underlying biology
cat kb-v2-all/pathways/pathway_{{relevant_pathway}}.md

# Read intervention files for what practitioners do with results
cat kb-v2-all/interventions/intervention-{{actionable_intervention}}.md
```

**For each file read, extract:**
1. PMIDs/DOIs from Verifiable Citations and Structured Appendix
2. Mechanism claims that explain WHY the biomarker matters
3. Actionable interventions that test results inform
4. Interpretation patterns (what high/low values mean clinically)
5. Monitoring recommendations

| KB File Section | What to Extract |
|-----------------|----------------|
| Summary | Quick framing of clinical relevance |
| Mechanistic Context | Molecular targets, pathway positions, upstream/downstream effects |
| Clinical/Practical Use Patterns | How practitioners interpret and act |
| Dosing and Implementation | Specific protocols informed by this biomarker |
| Evidence and Uncertainty | Confidence levels, what's debated |
| Lossless Structured Appendix | Machine-readable PMIDs, targets, confidence scores |

### Step 2: Related Intervention Discovery

Using targets from Lens 1 and the KBV2 dossier, map the clinical neighborhood by reading additional files:

```bash
# Read intervention files for related approaches
cat kb-v2-all/interventions/intervention-{{related_intervention}}.md

# Read conflict files for known debates
cat kb-v2-all/conflicts/{{relevant_conflict}}.md
```

For each related intervention file, extract:
- How it relates mechanistically to the product
- What clinical context it serves
- What this reveals about the decision landscape

### Step 3: Clinical Perspective Synthesis

From the files read, synthesize:

#### A. The Practitioner's Mental Model
How do clinicians think about this category? What questions do they ask? What tradeoffs do they weigh?

#### B. The Intervention Landscape
What KB interventions does this product/category connect to? Map the full network.

#### C. The Practical Wisdom
What do experienced practitioners know that isn't in the literature?
- Monitoring that matters most
- Timing considerations
- Patient populations where this shines
- Realistic expectations

#### D. Conflict-Informed Framing
What do the conflict files tell us about:
- Biomarker measurement limitations to surface
- Clinical claims to moderate
- Evidence gaps to acknowledge honestly

### Step 4: "Notable For" Framing

For vendor/product comparisons, extract what makes each option **distinctive** rather than ranking them:

**DO:**
- "Notable for its metatranscriptomic approach, which captures functional activity"
- "Distinctive in offering personalized supplement recommendations"

**DON'T:**
- "Best for..." or "Better than..."
- "Weakness is..." or "Lacks..."

### Step 5: Actionability Mapping

Map this product/category to **actionable next steps** from the KB files:

```
[Product/Test] → reveals → [Insight] → informs → [KB Intervention]
```

Example:
```
Microbiome test → reveals → low butyrate producers → informs → resistant starch + prebiotic fiber (kb-v2-all/interventions/intervention-resistant-starch.md)
Microbiome test → reveals → low diversity → informs → dietary fiber diversity (kb-v2-all/interventions/intervention-mediterranean-diet.md)
```

## Output Format

Return a JSON object:

```json
{
  "kb_lookup": {
    "source": "kb-v2-all local files",
    "files_read": ["list of files read during this lens"],
    "total_files_consulted": 18
  },

  "kb_factual_summary": {
    "mechanism_claims_found": 14,
    "dosing_protocols_found": 9,
    "contraindications_found": 13,
    "monitoring_items": ["..."],
    "related_interventions": ["..."]
  },

  "clinical_perspective_extraction": {
    "practitioner_mental_model": {
      "key_questions_clinicians_ask": ["..."],
      "tradeoffs_practitioners_weigh": ["..."]
    },
    "intervention_landscape": {
      "connected_kb_interventions": [
        {
          "intervention_name": "...",
          "kb_file": "interventions/intervention-butyrate.md",
          "connection_type": "informs",
          "clinical_narrative": "..."
        }
      ],
      "clinical_value_story": "..."
    },
    "practical_wisdom": {
      "what_practitioners_monitor": "...",
      "timing_considerations": "...",
      "patient_populations_where_valuable": "...",
      "realistic_expectations": "..."
    },
    "conflict_informed_framing": [
      {
        "conflict_file": "conflicts/zonulin_tight_junction_permeability_assay_gap.md",
        "claim_contested": "...",
        "recommended_framing": "..."
      }
    ]
  },

  "notable_for_framing": {
    "entities_analyzed": [
      {
        "entity_name": "...",
        "notable_for": ["..."],
        "distinctive_approach": "..."
      }
    ]
  },

  "actionability_mapping": [
    {
      "finding": "...",
      "kb_interventions_informed": ["..."],
      "kb_files_referenced": ["..."],
      "clinical_action": "..."
    }
  ],

  "citations_extracted_from_kb": {
    "total_pmids": 12,
    "total_dois": 8,
    "citations": [
      {
        "pmid": "...",
        "doi": "...",
        "title": "...",
        "source_file": "...",
        "relevance": "..."
      }
    ],
    "citation_integration_guidance": {
      "mechanism_section": "...",
      "evidence_section": "...",
      "decision_support": "..."
    }
  }
}
```

## Handling Products NOT in KB

If no directly relevant files exist:

1. **Search by mechanism** — Use Lens 1's targets to find pathway and intervention files
2. **Search by indication** — Find files for conditions the product addresses
3. **Search by biomarker** — Find files for what the product measures or modulates
4. **Flag for KB inclusion** — Note that this product could be added to KB

## Quality Criteria

Before returning, verify:

- [ ] **L3.1 kb_files_read**: At least 5 KBV2 files read during this lens (beyond what Phase 0.5 covered)
- [ ] **L3.2 pmid_extraction**: Minimum 5 PMIDs/DOIs extracted from KB files
- [ ] **L3.3 citations_actionable**: Each citation has clear integration guidance (which section to use it in)
- [ ] **L3.4 actionability_mapped**: Clear connection to KB interventions (Finding → Intervention)
- [ ] **L3.5 notable_for_framing**: Entities positioned positively without ranking
- [ ] **L3.6 no_kb_citation**: Output never references "the KB" as a source; only peer-reviewed papers

You must pass 5/6 criteria.

## Critical Principles

1. **Read the files directly** — The KB's value is in the depth of its documents. Read them, don't summarize from memory.
2. **Extract perspective, not just facts** — The KB's value is the clinical wisdom encoded in how things are framed
3. **"Notable for" over "better than"** — Position positively, never compare negatively
4. **Actionability is the story** — Connect everything to what clinicians *do*
5. **Weave, don't silo** — This output should inform the entire narrative, not live in a box
6. **Conflicts calibrate tone** — Use conflict files to avoid overclaiming
