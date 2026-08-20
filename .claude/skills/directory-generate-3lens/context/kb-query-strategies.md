# KB Query Strategies

This document details strategies for reading and extracting knowledge from the local KBV2 knowledge base (`kb-v2-all/`).

## KBV2 Overview

**Location:** `kb-v2-all/`
**Total Files:** 1,165 curated markdown documents

| Category | Count | File Pattern | Content |
|----------|-------|-------------|---------|
| `pathways/` | 152 | `pathway_{descriptive_name}.md` | Signaling cascades, metabolic axes, pathway crosstalk |
| `interventions/` | 413 | `intervention-{slug}.md` or bare names | Supplements, drugs, diets, therapies with dosing & evidence |
| `biomarkers/` | 297 | `BIOMARKER_{NAME}_001.md` | Clinical markers with interpretation patterns & reference ranges |
| `conflicts/` | 303 | `{descriptive_slug}.md` | Unresolved debates, assay limitations, evidence gaps |

Each file follows a consistent structure with Summary, Mechanistic Context, Clinical/Practical Use Patterns, Dosing and Implementation Patterns, Evidence and Uncertainty, Verifiable Citations, and a Lossless Structured Appendix.

## File Discovery Patterns

### Pathways

File names follow `pathway_{descriptive_name}.md`. Browse by listing the directory:

```bash
ls kb-v2-all/pathways/
```

**Key microbiome-related pathways:**
- `pathway_microbiome_ecology_colonization.md` — Microbiome ecology, SCFA production, dysbiosis framework
- `pathway_gut_incretin_scfa_signaling.md` — SCFA → FFAR2/FFAR3 → GLP-1, colonocyte metabolism, HDAC inhibition
- `pathway_gut_brain_axis_psychobiotic.md` — Gut-brain communication, SCFAs, LPS, vagus nerve
- `pathway_gut_liver_axis.md` — Portal LPS, dysbiosis, hepatic inflammation
- `pathway_tma_tmao_metaorganismal.md` — Microbial TMA production, TMAO cardiovascular risk
- `pathway_treg_activation.md` — FOXP3, Th17/Treg balance, butyrate support
- `pathway_bile_acid_biosynthesis_modification.md` — BSH, 7α-dehydroxylation, FXR, TGR5
- `pathway_exercise_microbiome_recovery_axis.md` — Exercise-microbiome interaction
- `pathway_endothelial_barrier_integrity.md` — Tight junctions, zonulin, barrier function
- `pathway_tlr_signaling.md` — TLR4/LPS sensing
- `pathway_nlrp3_inflammasome.md` — NLRP3 activation from gut-derived signals
- `pathway_cholinergic_anti_inflammatory.md` — Vagal anti-inflammatory reflex
- `pathway_glp1_receptor_signaling.md` — GLP-1 receptor, SCFA upstream drivers

### Interventions

File names follow `intervention-{slug}.md` or bare names:

```bash
ls kb-v2-all/interventions/
```

**Key microbiome interventions:**
- `intervention-butyrate.md` — HDAC inhibitor, colonocyte fuel, barrier support
- `intervention-propionate.md` — FFAR2/FFAR3, hepatic DNL inhibition
- `intervention-acetate.md` — Cross-feeding, GLP-1 secretion
- `intervention-akkermansia-muciniphila.md` — Keystone species, barrier integrity
- `intervention-fecal-microbiota-transplant.md` — Direct microbiome replacement
- `intervention-fermented-foods.md` — Live microbes and SCFAs
- `intervention-resistant-starch.md` — Prebiotic fiber, butyrate substrate
- `intervention-lactulose.md` — Synthetic prebiotic, SCFA production
- `intervention-tributyrin.md` — Butyrate prodrug, colonic delivery
- `intervention-rifaximin.md` — Non-absorbable antibiotic for SIBO
- `intervention-lactobacillus-reuteri.md` — Probiotic strain, immune modulation
- `intervention-e-coli-nissle-1917.md` — Probiotic, UC maintenance
- `intervention-mediterranean-diet.md` — Fiber, SCFAs, diversity
- `broad-spectrum-probiotic.md` — Multi-strain probiotics

### Biomarkers

File names follow `BIOMARKER_{NAME}_001.md`:

```bash
ls kb-v2-all/biomarkers/
```

**Key microbiome biomarkers:**
- `BIOMARKER_STOOL_SCFAS_001.md` — Fecal SCFA panel (butyrate, propionate, acetate)
- `BIOMARKER_BUTYRATE_001.md` — Colonocyte fuel, HDAC inhibitor
- `BIOMARKER_MICROBIOME_DIVERSITY_001.md` — Alpha diversity index
- `BIOMARKER_ZONULIN_001.md` — Proposed permeability marker (assay controversy)
- `BIOMARKER_CALPROTECTIN_001.md` — Validated mucosal inflammation marker
- `BIOMARKER_TMAO_001.md` — Gut-derived cardiovascular risk marker
- `BIOMARKER_SIGA_001.md` — Secretory IgA, gut mucosal immunity
- `BIOMARKER_LBP_001.md` — LPS-binding protein, endotoxemia proxy
- `BIOMARKER_H2_CH4_BREATH_TEST_001.md` — SIBO diagnostic
- `BIOMARKER_GLP1_001.md` — Incretin, SCFA-driven secretion
- `BIOMARKER_PYY_001.md` — Satiety hormone, FFAR2/3-driven
- `BIOMARKER_TRYPTOPHAN_001.md` — Kynurenine vs serotonin pathways
- `BIOMARKER_PROPIONATE_001.md` — C3 SCFA, hepatic DNL inhibition
- `BIOMARKER_ACETATE_001.md` — Dominant fecal SCFA

### Conflicts

File names are descriptive slugs:

```bash
ls kb-v2-all/conflicts/
```

**Key microbiome conflicts:**
- `zonulin_tight_junction_permeability_assay_gap.md` — Commercial ELISAs detect properdin, not zonulin
- `sibo_breath_test_threshold_outcome_gap.md` — No validated thresholds or decision trees
- `probiotics_microbiome_gut_brain_axis.md` — Transient colonization, no validated selection framework
- `prebiotic_fibers_dose_boundary_operationalization_gap.md` — No validated benefit-harm dose boundary
- `tmao_microbiome_context_dependency.md` — TMAO risk depends on microbiome context
- `th17_treg_balance_microbiome_claims.md` — Overstated clinical evidence for microbiome Treg restoration
- `serotonin_microbiome_interaction.md` — Unverified direct antimicrobial effect of serotonin
- `urolithin_a_aging_mitochondrial.md` — 20-40% conversion figure unverified
- `ssri_chronic_use_mood_gi.md` — SSRI-dysbiosis-IBD causal link unresolved

## Reading Strategy

### Tiered Approach

| Tier | When | What to Read | What to Extract |
|------|------|-------------|-----------------|
| **Tier 1** (Core) | File directly about product/primary mechanism | Full document | Everything: mechanisms, targets, dosing, citations, cross-refs |
| **Tier 2** (Adjacent) | Related pathway, intervention, or biomarker | Summary + Structured Appendix | Relationship, key PMIDs, clinical insight, crosstalk nodes |
| **Tier 3** (Contextual) | Indirectly connected via shared targets | Summary only | Connection type, surprising relationships |

### Structured Appendix Extraction

Every KBV2 file ends with a "Lossless Structured Appendix" in YAML-like format. This is the most efficient data source for machine-readable extractions:

```yaml
# From intervention-butyrate.md:
- intervention_id: "intervention-butyrate"
- primary_pathways: ["HDAC inhibition", "SCFA signaling", "colonocyte beta-oxidation"]
- mechanism_claims:
  - target: "HDAC1/HDAC2"
    effect: "Inhibits class I/II HDACs"
    confidence: "high"
    citations: [{"pmid": "14676263"}, {"pmid": "12840228"}]
- dosing_protocols: [...]
- contraindications: [...]
```

### Cross-Document Connection Patterns

When reading multiple files, look for:
1. **Shared molecular targets** — Same gene symbol in multiple documents
2. **Pathway crosstalk tables** — Explicit cross-references in pathway files
3. **Intervention-biomarker links** — Intervention files reference biomarkers they modulate
4. **Conflict-biomarker links** — Conflict files identify biomarker measurement problems
5. **Citation overlap** — Same PMID appearing in multiple documents = high-confidence claim

## Relationship Classification

When mapping related interventions from KB files, classify the relationship:

| Relationship | Criteria | Example |
|--------------|----------|---------|
| `synergistic` | Different targets, complementary effects | Rapamycin (mTOR) + Metformin (AMPK) |
| `complementary` | Same goal, different mechanism | Butyrate supplementation + Resistant starch |
| `overlapping` | Same target, consider redundancy | Tributyrin + Sodium butyrate (both deliver butyrate) |
| `potentially_antagonistic` | May interfere with each other | Prebiotics in active SIBO |

## Handling Products NOT in KB

If no directly relevant files exist:

1. **Search by mechanism** — Use Lens 1's targets to find pathway and intervention files
2. **Search by indication** — Find files for conditions the product addresses
3. **Search by biomarker** — Find files for what the product measures or modulates
4. **Follow cross-references** — Read one file, find its cross-references, follow the chain
5. **Flag for KB inclusion** — Note that this product could be added to KB

## Example: Microbiome Testing Query Flow

```bash
# Step 1: Core pathway files
cat kb-v2-all/pathways/pathway_microbiome_ecology_colonization.md
cat kb-v2-all/pathways/pathway_gut_incretin_scfa_signaling.md

# Step 2: Key biomarker files (what tests measure)
cat kb-v2-all/biomarkers/BIOMARKER_STOOL_SCFAS_001.md
cat kb-v2-all/biomarkers/BIOMARKER_MICROBIOME_DIVERSITY_001.md
cat kb-v2-all/biomarkers/BIOMARKER_ZONULIN_001.md
cat kb-v2-all/biomarkers/BIOMARKER_CALPROTECTIN_001.md

# Step 3: Actionable intervention files
cat kb-v2-all/interventions/intervention-butyrate.md
cat kb-v2-all/interventions/intervention-resistant-starch.md
cat kb-v2-all/interventions/intervention-akkermansia-muciniphila.md

# Step 4: Conflict files (evidence calibration)
cat kb-v2-all/conflicts/zonulin_tight_junction_permeability_assay_gap.md
cat kb-v2-all/conflicts/sibo_breath_test_threshold_outcome_gap.md
cat kb-v2-all/conflicts/probiotics_microbiome_gut_brain_axis.md
```
