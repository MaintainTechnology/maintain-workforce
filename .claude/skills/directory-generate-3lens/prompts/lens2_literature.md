# Lens 2: Comprehensive Literature Review

You are conducting a comprehensive literature review for **{{product_name}}** using Perplexity Deep Research.

## Objective

Document what the peer-reviewed evidence demonstrates about this product. Focus on what research EXISTS and what it shows—not on making clinical recommendations.

## Input

- **Product Name:** {{product_name}}
- **Lens 1 Output (Mechanism):** {{lens1_output}}

## Research Queries

Execute these queries via Perplexity Deep Research (OpenRouter):

### Query 1: Mechanism Studies
```
"{{product_name}}" mechanism of action clinical studies PMID site:pubmed.ncbi.nlm.nih.gov OR site:doi.org
```

### Query 2: Clinical Trials
```
"{{product_name}}" randomized controlled trial systematic review meta-analysis PMID
```

### Query 3: Safety Data
```
"{{product_name}}" adverse effects safety data FDA warning contraindications
```

### Query 4: Longevity/Aging (if applicable)
```
"{{product_name}}" longevity aging lifespan healthspan clinical trial
```

## Process

### Step 1: Execute Deep Research

For each query:
1. Send to Perplexity via OpenRouter
2. Collect all citations returned
3. Extract PMIDs and DOIs

### Step 2: Validate Citations

For each citation:
1. Verify PMID/DOI resolves to a real paper
2. Extract: Title, Authors, Year, Journal
3. Flag any citations that cannot be verified (may be hallucinated)

**Validation approach:**
- PMIDs should be 8 digits
- DOIs should match pattern `10.\d{4,}/.*`
- If uncertain, note as "unverified" rather than including

### Step 2.5: API Validation (MANDATORY)

Perplexity frequently hallucates PMIDs. Every PMID and DOI MUST be validated against the PubMed/CrossRef APIs before inclusion.

**For each PMID:**
```bash
curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={PMID}&retmode=json"
```
- If response contains `"error"` or the PMID key is missing from `result` → **REMOVE** from output, add to `removed_citations[]`
- If valid → Extract and use the **API-confirmed** title, authors, journal, and year (NOT Perplexity's version, which may be inaccurate)

**Batch validation:** Submit up to 20 PMIDs per API call (comma-separated): `&id=12345,67890,11111`

**For each DOI:**
```bash
curl -s "https://api.crossref.org/works/{DOI}"
```
- If 404 or error → **REMOVE** from output, add to `removed_citations[]`
- If valid → Extract confirmed metadata

**Output must include:**
- `verified_citations[]`: PMIDs/DOIs confirmed by API with API-sourced metadata
- `removed_citations[]`: PMIDs/DOIs that failed verification (with reason)
- `verification_rate`: verified / total attempted (must be reported)

**Quality Gate L2.7:** `all_citations_api_verified` — Every PMID/DOI in the final output has been confirmed against PubMed/CrossRef. Zero unverified citations allowed.

### Step 3: Grade Evidence Quality

Classify each study by evidence level:

| Evidence Level | Study Type | Weight | CSS Class |
|----------------|------------|--------|-----------|
| Strong Evidence | Systematic Review / Meta-Analysis | Highest | `.evidence-strong` |
| Moderate Evidence | Randomized Controlled Trial (RCT) | High | `.evidence-moderate` |
| Emerging Evidence | Observational / Cohort Study | Medium | `.evidence-emerging` |
| Preliminary | Case Series / Case Report / Mechanistic | Low-Supporting | `.evidence-preliminary` |
| Expert Consensus | Expert Opinion / Narrative Review | Contextual | `.evidence-consensus` |

**IMPORTANT:** Do NOT use letter grades (A, B, C, D, E, F) anywhere in the output. Use the descriptive labels above. Letter grades feel like school report cards and are alienating to vendors.

### Step 4: Document Regulatory Status

Research and document:
- **FDA Status**: Approved, cleared, investigational, or none
- **Indication (if approved)**: What is it approved for?
- **CE Marking**: European approval status
- **Clinical Trials**: Active NCT numbers

### Step 5: Identify Conflicts and Gaps

Note:
- Conflicting study results
- Gaps in the evidence base
- Populations not studied
- Outcomes not measured

## Output Format

Return a JSON object with this structure:

```json
{
  "research_executed": {
    "queries_run": 4,
    "total_citations_found": 23,
    "verified_citations": 18,
    "unverified_citations": 5
  },
  "evidence_summary": "Metformin has extensive clinical evidence for glycemic control (Strong Evidence) and emerging evidence for longevity applications (Emerging Evidence to Preliminary)...",
  "key_studies": [
    {
      "pmid": "34391872",
      "doi": null,
      "title": "Metformin Therapy in Autosomal Dominant Polycystic Kidney Disease",
      "authors": "Seliger SL et al.",
      "year": 2021,
      "journal": "Clin J Am Soc Nephrol",
      "study_type": "RCT",
      "evidence_level": "Moderate Evidence",
      "sample_size": 97,
      "population": "Adults with ADPKD",
      "duration": "12 months",
      "key_findings": "Metformin was safe and tolerable in ADPKD patients",
      "limitations": "Small sample, safety focus rather than efficacy"
    }
  ],
  "evidence_by_grade": {
    "Strong Evidence": 2,
    "Moderate Evidence": 5,
    "Emerging Evidence": 8,
    "Preliminary": 2,
    "Expert Consensus": 0
  },
  "removed_citations": [],
  "verification_rate": 0.95,
  "regulatory_status": {
    "fda": {
      "status": "Approved",
      "indication": "Type 2 Diabetes Mellitus",
      "year_approved": 1995,
      "label_url": "https://..."
    },
    "ce_mark": {
      "status": "Available",
      "indication": "Type 2 Diabetes"
    },
    "active_trials": [
      {
        "nct_number": "NCT02432287",
        "title": "Targeting Aging with Metformin (TAME)",
        "status": "Recruiting",
        "phase": "Phase 3"
      }
    ]
  },
  "conflicting_findings": [
    {
      "topic": "Exercise adaptation blunting",
      "position_a": {
        "finding": "Metformin blunts muscle hypertrophy response to resistance training",
        "source_pmid": "10.1111/acel.13039"
      },
      "position_b": {
        "finding": "Effects may be dose and timing dependent",
        "source_pmid": null
      },
      "characterization": "Active area of research; timing relative to exercise may matter"
    }
  ],
  "evidence_gaps": [
    "Long-term longevity outcomes in non-diabetic populations",
    "Optimal dosing for off-label longevity use",
    "Interaction with exercise in older adults"
  ],
  "literature_markdown": "## Evidence Review for {{product_name}}\n\n..."
}
```

## Quality Criteria (Self-Check Before Submission)

Before returning your output, verify:

- [ ] **L2.1 citation_validity**: Do all PMIDs/DOIs resolve to real papers?
- [ ] **L2.2 evidence_breadth**: Are 3+ distinct studies cited?
- [ ] **L2.3 study_details**: Are sample sizes and study designs included?
- [ ] **L2.4 conflict_documentation**: Are conflicting findings noted?
- [ ] **L2.5 regulatory_accuracy**: Is regulatory status factually correct?
- [ ] **L2.6 recency**: Are 2024+ studies included when available?
- [ ] **L2.7 all_citations_api_verified**: Were all PMIDs/DOIs validated via PubMed/CrossRef API? (0 unverified in final output)

You must pass 6/7 criteria. If you identify a gap, address it before returning.

## Critical Reminders

1. **Verify citations** - Perplexity can hallucinate; remove unverifiable PMIDs
2. **Report what exists** - Don't make efficacy claims, report what studies found
3. **Note limitations** - Every study has them; include them
4. **Surface conflicts** - Don't hide contradictory findings
5. **Distinguish evidence levels** - RCTs are not the same as case reports
6. **Recency matters** - Prioritize recent studies but don't ignore foundational work
