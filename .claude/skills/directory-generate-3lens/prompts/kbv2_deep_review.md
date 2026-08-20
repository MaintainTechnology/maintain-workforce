# Phase 0.5: KBV2 Deep Review — VectorShift Semantic Search + Local File Enrichment

You are building a rich context dossier for **{{product_name}}** before any lens execution begins. This phase uses the **Signaling KB Semantic Search v2** VectorShift pipeline for two-stage iterative semantic search across 4 category-specific Knowledge Bases, then supplements with targeted local file reads.

## Why This Phase Exists

The KBV2 knowledge base contains 1,165 curated markdown documents across four categories — pathways, interventions, biomarkers, and conflicts — each written with mechanistic depth, structured appendices, verifiable citations, and clinical perspective. By building a comprehensive dossier *before* lenses execute, every subsequent phase benefits from grounded, cross-referenced context.

## Architecture: Pipeline + Local Enrichment

```
                    ┌─────────────────────────────┐
                    │  VectorShift Pipeline Call   │
                    │  (Signaling KB Search v2)    │
                    │                              │
                    │  Stage 1: Query Expansion    │
                    │    → Broad Retrieval (4 KBs) │
                    │  Stage 2: Gap Analysis       │
                    │    → Targeted Retrieval       │
                    │  Stage 3: Dossier Synthesis  │
                    └──────────┬──────────────────┘
                               │
                    Pipeline JSON Dossier
                               │
                    ┌──────────▼──────────────────┐
                    │  Local File Enrichment       │
                    │  (Optional, targeted)        │
                    │                              │
                    │  Read specific files the     │
                    │  pipeline identified in      │
                    │  files_to_read_deeper[]      │
                    │  or that cross-references    │
                    │  suggest                     │
                    └──────────┬──────────────────┘
                               │
                    Final KBV2 Context Dossier
```

## Step 1: Call the VectorShift Pipeline

Run the Signaling KB Semantic Search v2 pipeline:

```bash
cd "/Users/anantvinjamoori/Vectorshift Pipelines" && python3 -u cli/run_signaling_kb_search.py "{{product_name}}" --context "{{initial_context}}" --output ".ralph-3lens/kbv2_dossier.json"
```

**Pipeline inputs:**
- `product_name`: The product or category being analyzed
- `search_context`: Additional context about the analysis (e.g., "category guide for microbiome testing", "single product deep-dive for creatine monohydrate")

**Pipeline outputs:** A JSON dossier with:
- `kbv2_review_meta` — Search metadata (chunks retrieved, categories covered)
- `entities_found` — All pathways, interventions, biomarkers, conflicts, molecular targets found
- `cross_document_synthesis` — Mechanistic network, recurring themes, narrative threads, conflict synthesis
- `citation_harvest` — All PMIDs, DOIs, and key citations extracted
- `lens_priming` — Pre-built grounding data for Lens 1, Lens 2, Lens 3, and Synthesis
- `raw_chunks_summary` — Brief summaries of what each KB search stage found

**This pipeline runs two-stage iterative search:**
1. **Broad retrieval** — Sonnet 4.6 expands the query, then 4 parallel KB searches (top-15 with Cohere reranking) across Pathways, Interventions, Biomarkers, and Conflicts
2. **Targeted retrieval** — Opus 4.6 analyzes broad results, identifies gaps, generates follow-up query, then 4 more parallel KB searches (top-10)
3. **Dossier synthesis** — Opus 4.6 synthesizes all 8 search results into the structured JSON dossier

## Step 2: Review Pipeline Output

Read the pipeline's JSON dossier output. Evaluate:

1. **Entity coverage** — Did it find relevant pathways, interventions, biomarkers, and conflicts?
2. **Cross-document connections** — Are the narrative threads and recurring themes meaningful?
3. **Citation quality** — Are PMIDs/DOIs present and plausible?
4. **Lens priming completeness** — Does each lens have useful grounding data?

## Step 3: Local File Enrichment (Targeted)

The pipeline dossier may identify files worth reading deeper. Check:

1. **`lens_priming.for_lens_3.files_to_read_deeper`** — Specific KB document names the pipeline flagged for deeper reading
2. **Cross-references in `entities_found`** — If the pipeline surfaced a pathway name, the corresponding `kb-v2-all/pathways/pathway_{name}.md` file may contain richer detail than what semantic search chunks returned
3. **Conflict files** — If `cross_document_synthesis.conflict_synthesis` mentions specific debates, read the corresponding conflict files in full for nuanced framing

**Local file reads are OPTIONAL and TARGETED** — only read files that will add value beyond what the pipeline already provides. The pipeline's semantic search covers the same 1,165 documents; local reads are for when you need the full document rather than top-k chunks.

**KBV2 folder:** `kb-v2-all/`
```
kb-v2-all/
├── pathways/       (152 files)  — pathway_{name}.md
├── interventions/  (413 files)  — {intervention-name}.md
├── biomarkers/     (297 files)  — BIOMARKER_{NAME}_{ID}.md
└── conflicts/      (303 files)  — {conflict_topic}.md
```

## Step 4: Assemble Final Dossier

The pipeline's JSON output IS the KBV2 Context Dossier. If local file reads added anything, merge those additions into the dossier:

- Append newly discovered PMIDs/DOIs to `citation_harvest`
- Add any new cross-document connections to `cross_document_synthesis`
- Enhance `lens_priming` fields with specific content extracted from full file reads
- Add a `local_enrichment` section noting which files were read and what they added

The final dossier is passed to all subsequent phases as `{{kbv2_dossier}}`.

## Output Format

The pipeline returns JSON matching this schema (with local enrichments appended):

```json
{
  "kbv2_review_meta": {
    "product_searched": "{{product_name}}",
    "total_chunks_retrieved": 100,
    "categories_covered": ["pathways", "interventions", "biomarkers", "conflicts"],
    "search_stages": 2,
    "broad_retrieval_summary": "...",
    "targeted_retrieval_summary": "..."
  },

  "entities_found": {
    "pathways": ["..."],
    "interventions": ["..."],
    "biomarkers": ["..."],
    "conflicts": ["..."],
    "molecular_targets": ["..."]
  },

  "cross_document_synthesis": {
    "mechanistic_network": "...",
    "recurring_themes": ["..."],
    "narrative_threads": [
      {
        "thread_title": "...",
        "thread_description": "...",
        "supporting_categories": ["pathways", "interventions"]
      }
    ],
    "conflict_synthesis": [
      {
        "conflict_topic": "...",
        "positions": "...",
        "recommended_framing": "...",
        "resolution_status": "active_debate"
      }
    ]
  },

  "citation_harvest": {
    "unique_pmids": ["..."],
    "unique_dois": ["..."],
    "key_citations": [
      {
        "pmid_or_doi": "...",
        "first_author": "...",
        "year": "...",
        "journal": "...",
        "relevance": "..."
      }
    ]
  },

  "lens_priming": {
    "for_lens_1": {
      "grounding_pathways": "...",
      "key_targets_to_map": ["..."],
      "diagram_elements": "..."
    },
    "for_lens_2": {
      "evidence_gaps_to_probe": ["..."],
      "existing_evidence_from_kb": "..."
    },
    "for_lens_3": {
      "intervention_landscape": "...",
      "actionability_map_seed": [
        {
          "finding": "...",
          "kb_interventions": ["..."],
          "clinical_action": "..."
        }
      ],
      "files_to_read_deeper": ["..."]
    },
    "for_synthesis": {
      "narrative_arc_suggestions": ["..."],
      "conflict_framing_guidance": ["..."]
    }
  },

  "raw_chunks_summary": {
    "pathways_broad": "...",
    "interventions_broad": "...",
    "biomarkers_broad": "...",
    "conflicts_broad": "...",
    "pathways_targeted": "...",
    "interventions_targeted": "...",
    "biomarkers_targeted": "...",
    "conflicts_targeted": "..."
  }
}
```

## Quality Gate (KBV2 Review — 7/8 to pass)

| ID | Criterion | Pass Condition |
|----|-----------|----------------|
| K.1 `pipeline_executed` | Pipeline ran successfully and returned valid JSON |
| K.2 `entity_breadth` | Entities found in at least 3 of 4 categories |
| K.3 `cross_document_synthesis` | At least 3 recurring themes identified across documents |
| K.4 `narrative_threads` | At least 3 narrative threads proposed for the final output |
| K.5 `citation_harvest` | At least 15 unique PMIDs/DOIs harvested |
| K.6 `conflict_integration` | At least 2 conflicts surfaced with recommended framing |
| K.7 `lens_priming` | Priming data provided for all 4 downstream phases (L1, L2, L3, Synthesis) |
| K.8 `connections_not_summaries` | Synthesis focuses on cross-document connections, not individual chunk summaries |

## Critical Principles

1. **Pipeline first, local files second** — The VectorShift pipeline does the heavy lifting via semantic search with Cohere reranking. Local file reads are surgical supplements, not a replacement.
2. **Connections over summaries** — The pipeline's `cross_document_synthesis` is the most valuable section. A theme that spans pathways, interventions, biomarkers, and conflicts is exponentially more useful than any single chunk.
3. **Conflicts are features** — The pipeline surfaces conflict data for authoritative uncertainty framing. Use `recommended_framing` from `conflict_synthesis` to calibrate tone.
4. **Citations are currency** — Every PMID/DOI in `citation_harvest` is a potential citation for the final output.
5. **KBV2 is not citable** — Extract PMIDs/DOIs and cite the original papers. Never reference "the knowledge base" in the final output.
6. **Prime, don't constrain** — The dossier opens possibilities for the lenses. If Lens 2's literature review contradicts something, that's valuable signal.
