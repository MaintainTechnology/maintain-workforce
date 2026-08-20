# Extraction Prompt Template

## Purpose

Extract all entity types (interventions, pathways, biomarkers, conflicts) from transcript analyses for the cell signaling knowledge base. This prompt is used in Stage 1 of the three-stage LLM pipeline.

---

## System Prompt

```
You are a biomedical knowledge extraction specialist. Extract ALL entity types for a cell signaling knowledge base.

CRITICAL RULES:
1. Extract ONLY what is explicitly stated or strongly inferred
2. Include confidence levels based on evidence quality
3. Do NOT infer beyond what the source supports
4. Do NOT add external knowledge not present in the source
5. NEVER capture verbatim quotes - always rephrase content
6. MINE EMBEDDED REFERENCES: Extract PMIDs/DOIs from the References section
7. ONLY include citations that have a valid PMID or DOI - do NOT include source document titles
8. EXCLUDE all source-identifying information (document names, titles, course names, institute names)
9. DETECT CONFLICTS: If the document contradicts common knowledge or other claims, flag it

OUTPUT FORMAT: JSON only, no other text
```

---

## User Prompt Template

```
Extract ALL biomedical entities from this document for a cell signaling knowledge base.

CITATION RULES (CRITICAL):
- ONLY include citations with valid PMIDs or DOIs
- Extract PMIDs from URLs like pmc.ncbi.nlm.nih.gov/articles/PMC... or pubmed.ncbi.nlm.nih.gov/...
- Extract DOIs from URLs or text
- DO NOT include the source document itself as a citation
- DO NOT reference any document titles, course names, or institute names
- If a claim has no peer-reviewed citation with PMID/DOI, leave citations array empty

SOURCE DOCUMENT:
---
{content}
---

Extract ALL of the following entity types:

1. INTERVENTIONS (compounds, peptides, biologics, modalities)
   - intervention_name: Canonical name
   - aliases: Other names mentioned
   - category: small_molecule | peptide | biologic | hormone | device | modality | lifestyle
   - dosing_protocols: Array of {dose, frequency, indication, route, context, citations: [{pmid, doi, title}]}
   - mechanism_claims: Array of {target, effect, citations: [{pmid, doi, title}]}
   - contraindications: Array of strings
   - monitoring: Array of strings (recommended labs/tests)

2. PATHWAYS (signaling cascades and molecular pathways)
   - pathway_name: Canonical pathway name (e.g., "mTOR signaling", "AMPK pathway")
   - pathway_id: Slugified ID (e.g., "mtor-signaling", "ampk-pathway")
   - axis: SIGNAL-10 axis number (1-10) where applicable:
     1=Nutrient Sensing, 2=Proteostasis, 3=Mitochondrial, 4=Inflammation,
     5=Stem Cell, 6=Epigenetic, 7=Intercellular, 8=Genomic, 9=Telomere, 10=Senescence
   - description: Brief description of the pathway
   - core_nodes: Array of genes/proteins involved (use HGNC symbols: MTOR, AMPK, etc.)
   - upstream_triggers: What activates this pathway
   - downstream_effects: What this pathway causes
   - interventions_targeting: Array of {intervention_name, effect: activate|inhibit|modulate}
   - crosstalk: Array of {target_pathway, relationship: activates|inhibits|modulates}
   - citations: Array of {pmid, doi, title}
   - confidence: high | moderate | low

3. BIOMARKERS (lab values and their clinical interpretation)
   - biomarker_name: Canonical name (e.g., "IGF-1", "HOMA-IR", "hs-CRP")
   - biomarker_id: Slugified ID
   - full_name: Full name if abbreviated
   - reference_range: {low, high, unit} - standard reference range
   - interpretation_patterns: Array of patterns like:
     {
       pattern_id: unique ID,
       biomarker_state: {biomarker: "low"|"high"|"normal", other_markers: ...},
       interpretation: What this pattern suggests clinically,
       differential: Array of possible diagnoses/conditions,
       clinical_implications: What to do about it,
       citations: [{pmid, doi, title}],
       confidence: high | moderate | low
     }
   - optimal_ranges_by_context: Array of context-specific optimal ranges:
     {
       context: "longevity" | "athletic performance" | "metabolic health" | etc.,
       optimal: {low, high},
       rationale: Why this range is optimal for this context,
       citations: [{pmid, doi, title}]
     }
   - interventions_affecting: Array of {intervention_name, effect: increase|decrease, magnitude}
   - pathways_involved: Array of pathway IDs this biomarker relates to

4. CONFLICTS (contradictions or controversial claims)
   - conflict_id: Unique identifier
   - conflict_type: dosing_contradiction | mechanism_dispute | safety_concern | efficacy_debate
   - entity_type: intervention | pathway | biomarker
   - entity_name: Name of the entity involved
   - claim_a: First claim (from this document)
   - claim_b: Contradicting claim (if known from document context)
   - context: Why this is controversial or needs resolution
   - resolution_status: unresolved | needs_review | resolved
   - citations: Supporting references for the conflict

5. REFERENCES (parse References section):
   - ONLY extract references that have PMIDs or DOIs
   - ref_number: The bracket number [N]
   - pmid: Extract from URL (required if no DOI)
   - doi: Extract if present (required if no PMID)
   - title: The paper title (NOT the source document)

6. For EACH fact:
   - evidence_type: EXPLICIT | STRONGLY_INFERRED | LOOSELY_INFERRED
   - confidence: high | moderate | low
   - support_refs: Array of reference numbers [N] that support this claim

OUTPUT as JSON:
{
  "references": [{ref_number, pmid, doi, title}],
  "interventions": [...],
  "pathways": [...],
  "biomarkers": [...],
  "conflicts": [...]
}

Extract now:
```

---

## Example Output

```json
{
  "references": [
    {"ref_number": 1, "pmid": "24566879", "doi": null, "title": "mTOR inhibition improves immune function..."},
    {"ref_number": 2, "pmid": null, "doi": "10.1126/scitranslmed.3009892", "title": "TORC1 inhibition enhances..."}
  ],
  "interventions": [
    {
      "intervention_name": "rapamycin",
      "aliases": ["sirolimus", "Rapamune"],
      "category": "small_molecule",
      "dosing_protocols": [
        {
          "dose": "5-6mg",
          "frequency": "weekly",
          "indication": "longevity/healthspan",
          "route": "oral",
          "context": "Pulsed dosing to avoid immunosuppression",
          "citations": [{"pmid": "24566879", "title": "mTOR inhibition improves..."}],
          "evidence_type": "EXPLICIT",
          "confidence": "moderate",
          "support_refs": [1]
        }
      ],
      "mechanism_claims": [
        {
          "target": "MTORC1",
          "effect": "inhibit",
          "citations": [],
          "evidence_type": "EXPLICIT",
          "confidence": "high",
          "support_refs": [2]
        }
      ],
      "contraindications": ["active infection", "wound healing"],
      "monitoring": ["lipid panel", "CBC", "fasting glucose"]
    }
  ],
  "pathways": [
    {
      "pathway_name": "mTOR signaling",
      "pathway_id": "mtor-signaling",
      "axis": 1,
      "axis_name": "Nutrient Sensing & Energetics",
      "description": "Master regulator of cell growth integrating nutrient and energy signals",
      "core_nodes": ["MTOR", "RPTOR", "RICTOR", "EIF4EBP1", "RPS6KB1"],
      "upstream_triggers": ["amino acids", "insulin", "IGF-1", "energy status"],
      "downstream_effects": ["protein synthesis", "autophagy inhibition", "lipid synthesis"],
      "interventions_targeting": [
        {"intervention_name": "rapamycin", "effect": "inhibit"}
      ],
      "crosstalk": [
        {"target_pathway": "autophagy", "relationship": "inhibits"}
      ],
      "citations": [],
      "confidence": "high"
    }
  ],
  "biomarkers": [
    {
      "biomarker_name": "IGF-1",
      "biomarker_id": "igf-1",
      "full_name": "Insulin-like Growth Factor 1",
      "reference_range": {"low": 100, "high": 300, "unit": "ng/mL"},
      "interpretation_patterns": [
        {
          "pattern_id": "low-igf1-with-insulin-resistance",
          "biomarker_state": {"igf1": "low", "homa_ir": "elevated"},
          "interpretation": "Suggests GH resistance or hepatic dysfunction rather than simple GH deficiency",
          "differential": ["hepatic_insulin_resistance", "gh_resistance", "malnutrition"],
          "clinical_implications": "Address insulin resistance before considering GH therapy",
          "citations": [],
          "confidence": "moderate"
        }
      ],
      "optimal_ranges_by_context": [
        {
          "context": "longevity",
          "optimal": {"low": 150, "high": 250},
          "rationale": "Below 150 suggests GH deficiency, above 250 may accelerate aging",
          "citations": []
        }
      ],
      "interventions_affecting": [
        {"intervention_name": "growth hormone", "effect": "increase", "magnitude": "significant"}
      ],
      "pathways_involved": ["igf1-axis"]
    }
  ],
  "conflicts": [
    {
      "conflict_id": "conflict_rapa_pgc1a_001",
      "conflict_type": "mechanism_dispute",
      "entity_type": "intervention",
      "entity_name": "rapamycin",
      "claim_a": "Rapamycin inhibits PGC-1alpha transcriptional activity",
      "claim_b": "Rapamycin has biphasic effect - acute inhibition but chronic upregulation via enhanced mitophagy",
      "context": "Different timeframes may explain apparent contradiction",
      "resolution_status": "unresolved",
      "citations": []
    }
  ]
}
```

---

## Quality Criteria

A good extraction should:

1. **Be comprehensive**: Capture all interventions, pathways, biomarkers, and conflicts mentioned
2. **Be precise**: Use standardized clinical/scientific terminology (HGNC symbols for genes)
3. **Include provenance**: Reference numbers linking to parsed citations
4. **Assess evidence**: Realistic confidence levels based on source quality
5. **Avoid hallucination**: Nothing beyond what the source states or strongly implies
6. **No verbatim quotes**: All content must be rephrased in clinical language
7. **Source-agnostic**: No document titles, institute names, or speaker names

---

## Common Extraction Errors to Avoid

1. **Over-extraction**: Adding claims not supported by source
2. **Under-extraction**: Missing explicit dosing or mechanism claims
3. **Confidence inflation**: Marking anecdotal claims as "high" confidence
4. **Missing context**: Extracting dose without indication or population
5. **Gene symbol errors**: Using non-standard gene names instead of HGNC symbols
6. **Including source titles**: Referencing the transcript itself as a citation
7. **Missing conflicts**: Not flagging contradictory claims in the document
