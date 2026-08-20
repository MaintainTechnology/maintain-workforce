# Merge Assessment Prompt Template

## Purpose

Determine how to merge a new extracted fact into an existing node. This prompt is used in Step 3 of the processing pipeline.

---

## System Prompt

```
You are a knowledge base curator. Your task is to determine how a newly extracted fact should be merged into an existing node.

MERGE PRINCIPLES:
1. APPEND new information - never overwrite existing
2. DETECT conflicts - flag when claims contradict
3. AVOID duplicates - skip if fact already exists
4. PRESERVE provenance - track all source references

A fact is a DUPLICATE if it says essentially the same thing with the same confidence.
A fact is a CONFLICT if it contradicts an existing claim.
A fact is NEW if it adds information not present in the node.
```

---

## User Prompt Template

```
TASK: Determine how to merge this extracted fact into the existing node.

EXISTING NODE:
---
{existing_node_json}
---

NEW EXTRACTED FACT:
---
{extracted_fact_json}
---

EXTRACTION REFERENCE: {extraction_ref}

ANALYSIS REQUIRED:

1. Does this fact duplicate existing content?
   - Check all relevant arrays (dosing_protocols, mechanism_claims, interpretation_patterns, etc.)
   - Consider: same claim with same or lower confidence = duplicate
   
2. Does this fact conflict with existing content?
   - Check for contradictory claims about same target/topic
   - Consider: different dosing for same indication, opposite effects on same target
   
3. Is this genuinely new information to append?
   - New protocol for different indication
   - New mechanism claim for different target
   - Higher confidence version of existing low-confidence claim

DECISION OPTIONS:
- "append": Add as new entry to relevant array
- "skip_duplicate": Already exists, no action needed
- "flag_conflict": Contradicts existing, needs conflict characterization
- "update_confidence": Same claim but higher confidence, update existing

OUTPUT as JSON:
{
  "decision": "append" | "skip_duplicate" | "flag_conflict" | "update_confidence",
  "target_array": "which array to modify (e.g., 'dosing_protocols', 'mechanism_claims')",
  "reasoning": "explanation of decision",
  "conflict_details": {
    "existing_claim_id": "if conflict, which existing claim",
    "conflict_nature": "directional | numeric | contextual | temporal",
    "brief_description": "what the conflict is about"
  },
  "duplicate_of": "if duplicate, which existing entry ID"
}
```

---

## Example: New Protocol (Append)

**Input:**
```
EXISTING NODE (rapamycin):
{
  "intervention_id": "rapamycin",
  "dosing_protocols": [
    {
      "protocol_id": "longevity-weekly-5mg",
      "indication": "longevity/healthspan",
      "dose": "5mg",
      "frequency": "weekly",
      "confidence": "moderate"
    }
  ]
}

NEW FACT:
{
  "type": "dosing_protocol",
  "dose": "1mg",
  "frequency": "daily",
  "indication": "transplant immunosuppression",
  "confidence": "high"
}
```

**Output:**
```json
{
  "decision": "append",
  "target_array": "dosing_protocols",
  "reasoning": "This is a different indication (transplant vs longevity) with a different dosing regimen. It adds valid information about rapamycin's use in a different clinical context.",
  "conflict_details": null,
  "duplicate_of": null
}
```

---

## Example: Duplicate (Skip)

**Input:**
```
EXISTING NODE (rapamycin):
{
  "dosing_protocols": [
    {
      "protocol_id": "longevity-weekly-5mg",
      "indication": "longevity/healthspan",
      "dose": "5mg",
      "frequency": "weekly",
      "context": "Pulsed dosing to avoid immunosuppression",
      "confidence": "moderate",
      "extraction_ref": "ext_001"
    }
  ]
}

NEW FACT:
{
  "type": "dosing_protocol",
  "dose": "5mg",
  "frequency": "weekly",
  "indication": "longevity",
  "context": "Weekly pulsed dosing",
  "confidence": "moderate"
}
```

**Output:**
```json
{
  "decision": "skip_duplicate",
  "target_array": "dosing_protocols",
  "reasoning": "This describes the same protocol (5mg weekly for longevity) with the same confidence level. The context wording differs slightly but conveys the same information. No need to add duplicate entry.",
  "conflict_details": null,
  "duplicate_of": "longevity-weekly-5mg"
}
```

---

## Example: Conflict Detected

**Input:**
```
EXISTING NODE (rapamycin):
{
  "mechanism_claims": [
    {
      "claim_id": "rapa_pgc1a_001",
      "target": "PGC1A",
      "effect": "inhibit",
      "context": "mTORC1 inhibition reduces PGC-1alpha transcription",
      "confidence": "moderate"
    }
  ]
}

NEW FACT:
{
  "type": "mechanism_claim",
  "target": "PGC1A",
  "effect": "activate",
  "context": "Chronic rapamycin upregulates PGC-1alpha through enhanced mitophagy",
  "confidence": "low"
}
```

**Output:**
```json
{
  "decision": "flag_conflict",
  "target_array": "mechanism_claims",
  "reasoning": "The new claim states rapamycin activates PGC-1alpha, while the existing claim states it inhibits PGC-1alpha. These are directionally opposite claims about the same target. This needs conflict characterization to determine if they represent different timeframes (acute vs chronic) or are truly contradictory.",
  "conflict_details": {
    "existing_claim_id": "rapa_pgc1a_001",
    "conflict_nature": "directional",
    "brief_description": "Opposite effects claimed on PGC-1alpha (inhibit vs activate)"
  },
  "duplicate_of": null
}
```

---

## Example: Update Confidence

**Input:**
```
EXISTING NODE (metformin):
{
  "mechanism_claims": [
    {
      "claim_id": "met_ampk_001",
      "target": "AMPK",
      "effect": "activate",
      "context": "Metformin activates AMPK",
      "evidence_type": "LOOSELY_INFERRED",
      "confidence": "low"
    }
  ]
}

NEW FACT:
{
  "type": "mechanism_claim",
  "target": "AMPK",
  "effect": "activate",
  "context": "Metformin activates AMPK through inhibition of mitochondrial complex I",
  "evidence_type": "EXPLICIT",
  "confidence": "high",
  "peer_reviewed_citation": "Zhou G et al. (2001) J Clin Invest"
}
```

**Output:**
```json
{
  "decision": "update_confidence",
  "target_array": "mechanism_claims",
  "reasoning": "The new fact describes the same mechanism (metformin activates AMPK) but with higher confidence, more detail, and a peer-reviewed citation. This should update the existing claim rather than create a duplicate.",
  "conflict_details": null,
  "duplicate_of": "met_ampk_001"
}
```

---

## Conflict Detection Heuristics

The LLM should consider these patterns as potential conflicts:

### Directional Conflicts
- "inhibits X" vs "activates X"
- "increases Y" vs "decreases Y"
- "beneficial for Z" vs "harmful for Z"

### Numeric Conflicts
- Different doses for same indication (5mg vs 10mg weekly for longevity)
- Different optimal ranges for same context (IGF-1: 150-250 vs 100-180)
- Different frequencies (daily vs weekly for same dose)

### Contextual Conflicts
- Same claim but different patient populations
- Different timeframes (acute vs chronic effects)
- Different routes of administration

### Temporal Conflicts
- "Early initiation recommended" vs "Start only after X"
- "Short-term use only" vs "Indefinite use appropriate"

---

## Decision Flow

```
Is the fact essentially the same as existing?
├── YES → Is confidence higher?
│         ├── YES → "update_confidence"
│         └── NO → "skip_duplicate"
└── NO → Does it contradict existing claims?
         ├── YES → "flag_conflict"
         └── NO → "append"
```
