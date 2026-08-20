# Enrichment Prompt Template

## Purpose

Extract peer-reviewed citations from Perplexity search results to enrich extracted claims. This prompt is used in Step 5 of the processing pipeline.

---

## MANDATORY EXECUTION

**This step is REQUIRED for all processing runs - NOT optional.**

**CRITICAL: Always use Perplexity API via `scripts/enrich_kb_citations.py`. Do NOT use WebSearch tool.**

```bash
PERPLEXITY_API_KEY=<key> python3 scripts/enrich_kb_citations.py
```

The script will:
1. **Load all KB nodes** from `.signaling-kb/`
2. **Query Perplexity** (sonar-reasoning-pro model) for each mechanism claim and dosing protocol
3. **Extract and parse citations** from Perplexity responses
4. **Update the node JSON files** with `peer_reviewed_citations` arrays

If no relevant peer-reviewed citations are found:
```json
{
  "peer_reviewed_citations": [],
  "enrichment_note": "No peer-reviewed citations found for this specific claim"
}
```

**IMPORTANT:** All claims must have citation searches attempted. Do NOT skip this step.

---

## Perplexity Query Template

For each claim to be enriched, construct a query:

```
{intervention_name} {mechanism_or_dosing_keywords} clinical evidence peer-reviewed {year_range}
```

**Examples:**
- "rapamycin weekly dosing longevity clinical evidence peer-reviewed 2015-2025"
- "metformin AMPK activation mechanism peer-reviewed research"
- "IGF-1 insulin resistance interpretation clinical significance"

---

## System Prompt (for citation extraction)

```
You are a biomedical literature specialist. Your task is to extract relevant peer-reviewed citations from search results that support or inform a specific claim.

RULES:
1. Extract ONLY peer-reviewed publications (journals, not preprints unless noted)
2. Include full citation with authors, year, journal
3. Include DOI or PMID when available
4. Assess relevance to the specific claim
5. Note if the citation supports, contradicts, or provides context for the claim
6. DO NOT fabricate citations - only extract what's in the search results
```

---

## User Prompt Template

```
TASK: Extract peer-reviewed citations relevant to this claim from the search results.

CLAIM TO ENRICH:
---
Intervention: {intervention_name}
Claim type: {dosing_protocol | mechanism_claim | biomarker_interpretation}
Claim content: {claim_summary}
Current confidence: {confidence_level}
---

PERPLEXITY SEARCH RESULTS:
---
{perplexity_response}
---

EXTRACTION REQUIRED:

For each relevant citation found:
1. Full citation (Authors, Year, Title, Journal)
2. DOI or PMID if available
3. Relevance to the claim (supports | contradicts | provides_context | partial_support)
4. Brief note on how it relates to the claim
5. Evidence strength (RCT | meta-analysis | cohort | case_series | review | mechanistic)

OUTPUT as JSON:
{
  "claim_summary": "{original claim}",
  "citations_found": [
    {
      "citation": "Authors et al. (Year) Title. Journal. Volume:Pages",
      "doi": "10.xxxx/xxxxx or null",
      "pmid": "PMID or null",
      "relevance": "supports | contradicts | provides_context | partial_support",
      "relevance_note": "brief explanation of relevance",
      "evidence_strength": "RCT | meta-analysis | cohort | case_series | review | mechanistic"
    }
  ],
  "enrichment_summary": "Brief summary of what the literature says about this claim",
  "confidence_adjustment": "increase | maintain | decrease | insufficient_evidence",
  "confidence_reasoning": "Why confidence should be adjusted based on literature"
}
```

---

## Example: Dosing Protocol Enrichment

**Input:**
```
CLAIM TO ENRICH:
Intervention: rapamycin
Claim type: dosing_protocol
Claim content: 5-6mg weekly for longevity in adults over 40
Current confidence: moderate

PERPLEXITY SEARCH RESULTS:
[Perplexity returns information about Mannick 2014, ITP studies, etc.]
```

**Output:**
```json
{
  "claim_summary": "Rapamycin 5-6mg weekly for longevity in adults over 40",
  "citations_found": [
    {
      "citation": "Mannick JB, Del Giudice G, Lattanzi M, et al. (2014) mTOR inhibition improves immune function in the elderly. Science Translational Medicine. 6(268):268ra179",
      "doi": "10.1126/scitranslmed.3009892",
      "pmid": "25540326",
      "relevance": "partial_support",
      "relevance_note": "Studied RAD001 (everolimus) 0.5mg daily or 5mg weekly in elderly, showed improved vaccine response. Supports intermittent dosing concept but used everolimus, not rapamycin, and lower doses.",
      "evidence_strength": "RCT"
    },
    {
      "citation": "Blagosklonny MV (2019) Rapamycin for longevity: opinion article. Aging (Albany NY). 11(19):8048-8067",
      "doi": "10.18632/aging.102355",
      "pmid": "31586989",
      "relevance": "provides_context",
      "relevance_note": "Review article discussing theoretical framework for intermittent rapamycin dosing for longevity. Not clinical evidence but provides mechanistic rationale.",
      "evidence_strength": "review"
    },
    {
      "citation": "Harrison DE, Strong R, Sharp ZD, et al. (2009) Rapamycin fed late in life extends lifespan in genetically heterogeneous mice. Nature. 460(7253):392-395",
      "doi": "10.1038/nature08221",
      "pmid": "19587680",
      "relevance": "supports",
      "relevance_note": "ITP study showing rapamycin extends mouse lifespan. Supports longevity indication but doses not directly translatable to human weekly dosing.",
      "evidence_strength": "mechanistic"
    }
  ],
  "enrichment_summary": "Literature supports the concept of intermittent mTOR inhibition for longevity/immune benefits. The Mannick RCT used a similar weekly dosing approach with a rapalog. However, the specific 5-6mg weekly rapamycin dose in humans for longevity is extrapolated rather than directly studied in clinical trials.",
  "confidence_adjustment": "maintain",
  "confidence_reasoning": "The mechanistic rationale and related clinical evidence support the approach, but the specific dose/frequency for rapamycin in humans for longevity has not been validated in RCTs. Confidence remains 'moderate' - reasonable extrapolation from related evidence."
}
```

---

## Example: Mechanism Claim Enrichment

**Input:**
```
CLAIM TO ENRICH:
Intervention: metformin
Claim type: mechanism_claim
Claim content: Metformin activates AMPK through inhibition of mitochondrial complex I
Current confidence: low

PERPLEXITY SEARCH RESULTS:
[Results about metformin mechanism studies]
```

**Output:**
```json
{
  "claim_summary": "Metformin activates AMPK through inhibition of mitochondrial complex I",
  "citations_found": [
    {
      "citation": "Zhou G, Myers R, Li Y, et al. (2001) Role of AMP-activated protein kinase in mechanism of metformin action. Journal of Clinical Investigation. 108(8):1167-1174",
      "doi": "10.1172/JCI13505",
      "pmid": "11602624",
      "relevance": "supports",
      "relevance_note": "Seminal paper establishing metformin's AMPK activation as key to glucose-lowering effect",
      "evidence_strength": "mechanistic"
    },
    {
      "citation": "Owen MR, Doran E, Halestrap AP (2000) Evidence that metformin exerts its anti-diabetic effects through inhibition of complex 1 of the mitochondrial respiratory chain. Biochemical Journal. 348(Pt 3):607-614",
      "doi": "10.1042/bj3480607",
      "pmid": "10839993",
      "relevance": "supports",
      "relevance_note": "Demonstrates complex I inhibition as upstream mechanism leading to AMPK activation",
      "evidence_strength": "mechanistic"
    },
    {
      "citation": "Foretz M, Guigas B, Bertrand L, et al. (2014) Metformin: from mechanisms of action to therapies. Cell Metabolism. 20(6):918-930",
      "doi": "10.1016/j.cmet.2014.09.018",
      "pmid": "25440056",
      "relevance": "provides_context",
      "relevance_note": "Comprehensive review of metformin mechanisms including AMPK-dependent and independent pathways",
      "evidence_strength": "review"
    }
  ],
  "enrichment_summary": "This mechanism is well-established in the literature. Metformin inhibits mitochondrial complex I, which reduces ATP production and increases AMP:ATP ratio, activating AMPK. This is considered one of the primary mechanisms of metformin's metabolic effects, though AMPK-independent mechanisms also exist.",
  "confidence_adjustment": "increase",
  "confidence_reasoning": "Multiple peer-reviewed studies directly support this mechanism. Confidence should be upgraded to 'high' given strong mechanistic evidence from multiple research groups."
}
```

---

## Enrichment Decision Rules

### When to Enrich

1. **Dosing protocols** with confidence < high
2. **Mechanism claims** from lecture sources
3. **Biomarker interpretations** that guide clinical decisions
4. **Any claim** with regulatory implications

### When to Skip Enrichment

1. Already has peer-reviewed citations
2. Claim is about lecture-specific content (e.g., speaker's personal protocol)
3. Confidence is already "high" with strong provenance

### Confidence Adjustment Guide

| Finding | Adjustment |
|---------|------------|
| RCT directly supports | Increase to high |
| Multiple mechanistic studies support | Increase |
| Review articles support but no primary data | Maintain |
| Evidence is for related but not identical claim | Maintain |
| Evidence contradicts | Add conflict, don't decrease |
| No relevant literature found | Maintain (absence isn't contradiction) |

---

## Important Notes

1. **Don't fabricate citations**: Only use what's in the search results
2. **Note relevance limitations**: "Supports the concept" ≠ "Validates the exact claim"
3. **Distinguish evidence types**: RCT > cohort > case series > mechanistic > review
4. **Preserve original claim**: Enrichment adds to, doesn't replace, extracted content
5. **Flag contradictions**: If literature contradicts the claim, create a conflict record
