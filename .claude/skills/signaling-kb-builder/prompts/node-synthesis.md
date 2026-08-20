# Node Synthesis Prompt Template

## Purpose

Produce the final merged node JSON after all processing steps. This prompt is used in Step 6 of the processing pipeline.

---

## System Prompt

```
You are a knowledge base node synthesizer. Your task is to produce a valid JSON node that incorporates all updates while preserving existing content.

SYNTHESIS RULES:
1. PRESERVE all existing content - never delete or overwrite
2. APPEND new entries to arrays (dosing_protocols, mechanism_claims, etc.)
3. UPDATE metadata (updated_at timestamp)
4. ADD new aliases if discovered
5. MERGE conflicts array with any new conflicts
6. FOLLOW the schema exactly - produce valid JSON

Output ONLY the JSON node, no explanation or markdown formatting.
```

---

## User Prompt Template

```
TASK: Synthesize the updated node incorporating all changes.

EXISTING NODE:
---
{existing_node_json}
---

CHANGES TO APPLY:
---
{changes_list_json}
---

Each change has:
- action: "append" | "update_confidence" | "add_alias" | "add_conflict"
- target: which array or field
- content: what to add/update
- extraction_ref: source reference

SCHEMA REFERENCE:
{schema_json}

SYNTHESIS INSTRUCTIONS:
1. Start with the existing node
2. Apply each change in order
3. Generate new IDs for appended entries (format: {type}_{topic}_{3_digit_number})
4. Update "updated_at" to current timestamp
5. Ensure all required fields are present
6. Validate against schema

OUTPUT: Complete JSON node (no markdown, no explanation)
```

---

## Example: Intervention Node Synthesis

**Input:**
```
EXISTING NODE:
{
  "intervention_id": "rapamycin",
  "aliases": ["sirolimus", "Rapamune"],
  "category": "small_molecule",
  "primary_pathways": ["axis-1-nutrient-sensing/mtor-signaling"],
  "dosing_protocols": [
    {
      "protocol_id": "longevity-weekly-5mg",
      "indication": "longevity/healthspan",
      "dose": "5mg",
      "frequency": "weekly",
      "evidence_grade": "moderate",
      "source_type": "expert_lecture",
      "extraction_ref": "ext_001",
      "confidence": "moderate"
    }
  ],
  "mechanism_claims": [],
  "regulatory_status": {
    "fda": "Approved (transplant), off-label (longevity)"
  },
  "conflicts": [],
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}

CHANGES TO APPLY:
[
  {
    "action": "append",
    "target": "dosing_protocols",
    "content": {
      "indication": "longevity/healthspan",
      "dose": "6mg",
      "frequency": "weekly",
      "context": "For adults over 50 with robust health",
      "evidence_grade": "moderate",
      "source_type": "expert_lecture",
      "peer_reviewed_citations": [
        {
          "citation": "Mannick JB et al. (2014) Sci Transl Med",
          "doi": "10.1126/scitranslmed.3009892",
          "relevance": "Supports intermittent mTOR inhibition concept"
        }
      ],
      "confidence": "moderate"
    },
    "extraction_ref": "ext_042"
  },
  {
    "action": "append",
    "target": "mechanism_claims",
    "content": {
      "target": "MTORC1",
      "effect": "inhibit",
      "specificity": "mTORC1 selective at weekly dosing",
      "evidence_type": "EXPLICIT",
      "confidence": "high"
    },
    "extraction_ref": "ext_042"
  },
  {
    "action": "add_conflict",
    "target": "conflicts",
    "content": {
      "topic": "Optimal weekly dose for longevity",
      "nature": "numeric",
      "truly_contradictory": false,
      "position_a": {
        "summary": "5mg weekly",
        "extraction_ref": "ext_001"
      },
      "position_b": {
        "summary": "6mg weekly for adults over 50",
        "extraction_ref": "ext_042"
      },
      "characterization": "Both doses are within reasonable range; 6mg may be for more robust patients"
    }
  }
]
```

**Output:**
```json
{
  "intervention_id": "rapamycin",
  "aliases": ["sirolimus", "Rapamune"],
  "category": "small_molecule",
  "primary_pathways": ["axis-1-nutrient-sensing/mtor-signaling"],
  "dosing_protocols": [
    {
      "protocol_id": "longevity-weekly-5mg",
      "indication": "longevity/healthspan",
      "dose": "5mg",
      "frequency": "weekly",
      "evidence_grade": "moderate",
      "source_type": "expert_lecture",
      "extraction_ref": "ext_001",
      "confidence": "moderate"
    },
    {
      "protocol_id": "longevity-weekly-6mg-001",
      "indication": "longevity/healthspan",
      "dose": "6mg",
      "frequency": "weekly",
      "context": "For adults over 50 with robust health",
      "evidence_grade": "moderate",
      "source_type": "expert_lecture",
      "peer_reviewed_citations": [
        {
          "citation": "Mannick JB et al. (2014) Sci Transl Med",
          "doi": "10.1126/scitranslmed.3009892",
          "relevance": "Supports intermittent mTOR inhibition concept"
        }
      ],
      "extraction_ref": "ext_042",
      "confidence": "moderate"
    }
  ],
  "mechanism_claims": [
    {
      "claim_id": "rapa_mtorc1_001",
      "target": "MTORC1",
      "effect": "inhibit",
      "specificity": "mTORC1 selective at weekly dosing",
      "evidence_type": "EXPLICIT",
      "source_type": "expert_lecture",
      "extraction_ref": "ext_042",
      "confidence": "high"
    }
  ],
  "regulatory_status": {
    "fda": "Approved (transplant), off-label (longevity)"
  },
  "conflicts": [
    {
      "conflict_id": "conflict_rapa_dose_longevity_001",
      "topic": "Optimal weekly dose for longevity",
      "nature": "numeric",
      "truly_contradictory": false,
      "position_a": {
        "summary": "5mg weekly",
        "extraction_ref": "ext_001",
        "confidence": "moderate"
      },
      "position_b": {
        "summary": "6mg weekly for adults over 50",
        "extraction_ref": "ext_042",
        "confidence": "moderate"
      },
      "characterization": "Both doses are within reasonable range; 6mg may be for more robust patients",
      "resolution_status": "unresolved",
      "flagged_for_review": true,
      "created_at": "2025-01-16T14:30:00Z"
    }
  ],
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-16T14:30:00Z"
}
```

---

## ID Generation Rules

### Protocol IDs
Format: `{indication}-{key_detail}-{3_digit_sequence}`
Examples:
- `longevity-weekly-5mg`
- `transplant-daily-2mg`
- `cancer-adjuvant-001`

### Claim IDs
Format: `{intervention_abbrev}_{target}_{3_digit_sequence}`
Examples:
- `rapa_mtorc1_001`
- `met_ampk_002`
- `ta1_immune_001`

### Conflict IDs
Format: `conflict_{topic_abbrev}_{nature}_{3_digit_sequence}`
Examples:
- `conflict_rapa_dose_numeric_001`
- `conflict_igf1_range_longevity_001`
- `conflict_pgc1a_effect_temporal_001`

### Pattern IDs (Biomarkers)
Format: `{biomarker}-{state_description}`
Examples:
- `low-igf1-with-insulin-resistance`
- `elevated-homocysteine-low-b12`
- `high-homa-ir-normal-fasting-glucose`

---

## Validation Checklist

Before outputting, verify:

1. **Required fields present** for the node type
2. **All IDs are unique** within their arrays
3. **extraction_ref** included for all new entries
4. **Timestamps** are ISO 8601 format
5. **Enums** use allowed values only
6. **Arrays** are properly formatted (not objects)
7. **No duplicate entries** (check by ID)
8. **Conflicts properly linked** to relevant claims

---

## Error Recovery

If synthesis fails:

1. **Missing required field**: Add with default/null value, flag for review
2. **Invalid enum value**: Use closest valid value, note in processing log
3. **Duplicate ID**: Append incrementing suffix (-002, -003)
4. **Schema mismatch**: Preserve as-is, flag for schema update

---

## Output Format

Output MUST be:
- Valid JSON
- No markdown code fences
- No explanatory text
- No trailing commas
- Properly escaped strings
- UTF-8 encoded
