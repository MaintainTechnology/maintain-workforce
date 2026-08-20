# Conflict Characterization Prompt Template

## Purpose

Characterize conflicts between claims WITHOUT resolving them. Both positions must be preserved. This prompt is used in Step 4 of the processing pipeline.

---

## System Prompt

```
You are a biomedical knowledge curator specializing in conflict analysis. Your task is to characterize disagreements between claims in a knowledge base.

CRITICAL RULES:
1. DO NOT resolve the conflict - both positions must be preserved
2. DO NOT rank which position is "better" or "more correct"
3. DO characterize the nature of the disagreement
4. DO identify if positions might be complementary rather than contradictory
5. DO provide guidance for clinicians on how to interpret the conflict

Your goal is to help clinicians understand the disagreement, not to make the decision for them.
```

---

## User Prompt Template

```
TASK: Characterize this conflict between two claims. Do NOT resolve it.

CLAIM A (existing):
---
{claim_a_json}
---

CLAIM B (new):
---
{claim_b_json}
---

TOPIC: {conflict_topic}

ANALYSIS REQUIRED:

1. NATURE OF CONFLICT
   - directional: Opposite effects claimed (inhibits vs activates)
   - numeric: Different values for same metric
   - contextual: Different conclusions for different contexts
   - temporal: Different effects at different timeframes
   - evidence_grade: Same claim, different confidence levels
   - definitional: Different definitions of the same term

2. TRUE CONTRADICTION OR COMPLEMENTARY?
   - Are these truly contradictory (cannot both be true)?
   - Or potentially complementary (both could be true in different contexts)?
   - What context would explain both being valid?

3. CLINICAL INTERPRETATION
   - How should a clinician interpret this conflict?
   - What additional information would help decide which applies?
   - What patient factors might favor one position over another?

OUTPUT as JSON:
{
  "conflict_id": "conflict_{topic}_{unique_suffix}",
  "topic": "{human_readable_topic}",
  "nature": "directional | numeric | contextual | temporal | evidence_grade | definitional",
  "truly_contradictory": true | false,
  "position_a": {
    "summary": "brief summary of position A",
    "detail": "fuller explanation",
    "evidence_type": "from claim A",
    "confidence": "from claim A"
  },
  "position_b": {
    "summary": "brief summary of position B",
    "detail": "fuller explanation",
    "evidence_type": "from claim B",
    "confidence": "from claim B"
  },
  "characterization": "explanation of why these conflict or how they might be reconciled",
  "clinical_note": "guidance for clinicians on interpreting this conflict",
  "context_factors": ["list of factors that might determine which position applies"],
  "resolution_status": "unresolved",
  "flagged_for_review": true
}
```

---

## Example: Temporal Complementarity

**Input:**
```
CLAIM A:
{
  "target": "PGC1A",
  "effect": "inhibit",
  "context": "mTORC1 inhibition reduces PGC-1alpha transcriptional activity",
  "evidence_type": "EXPLICIT",
  "confidence": "moderate"
}

CLAIM B:
{
  "target": "PGC1A",
  "effect": "activate",
  "context": "Chronic rapamycin upregulates PGC-1alpha through enhanced mitophagy",
  "evidence_type": "STRONGLY_INFERRED",
  "confidence": "low"
}

TOPIC: rapamycin effect on PGC-1alpha
```

**Output:**
```json
{
  "conflict_id": "conflict_rapa_pgc1a_temporal_001",
  "topic": "Rapamycin effect on PGC-1alpha expression",
  "nature": "temporal",
  "truly_contradictory": false,
  "position_a": {
    "summary": "Rapamycin inhibits PGC-1alpha",
    "detail": "Direct mTORC1 inhibition reduces PGC-1alpha transcriptional activity through reduced S6K1-mediated activation",
    "evidence_type": "EXPLICIT",
    "confidence": "moderate"
  },
  "position_b": {
    "summary": "Chronic rapamycin upregulates PGC-1alpha",
    "detail": "Long-term rapamycin use enhances mitophagy, leading to compensatory mitochondrial biogenesis which requires PGC-1alpha upregulation",
    "evidence_type": "STRONGLY_INFERRED",
    "confidence": "low"
  },
  "characterization": "These positions likely describe different timeframes of rapamycin's effect. Acutely, mTORC1 inhibition directly suppresses PGC-1alpha activity. Chronically, the enhanced autophagy/mitophagy may trigger compensatory mitochondrial biogenesis. Both mechanisms are biologically plausible and may both be occurring at different timescales.",
  "clinical_note": "When evaluating rapamycin's effect on mitochondrial biogenesis, consider the duration of treatment. Short-term use may show different effects than long-term use. Neither position is definitively 'correct' - they may both apply at different treatment phases.",
  "context_factors": [
    "Treatment duration (acute vs chronic)",
    "Dosing regimen (daily vs weekly pulsed)",
    "Measurement timepoint relative to last dose",
    "Patient's baseline mitochondrial status"
  ],
  "resolution_status": "unresolved",
  "flagged_for_review": true
}
```

---

## Example: True Numeric Conflict

**Input:**
```
CLAIM A:
{
  "range_id": "igf1_longevity_standard",
  "optimal": {"low": 150, "high": 250},
  "context": "Longevity optimization, adults 40-60",
  "confidence": "moderate"
}

CLAIM B:
{
  "range_id": "igf1_longevity_conservative",
  "optimal": {"low": 100, "high": 180},
  "context": "Longevity optimization, adults 40-60",
  "confidence": "moderate"
}

TOPIC: Optimal IGF-1 range for longevity
```

**Output:**
```json
{
  "conflict_id": "conflict_igf1_range_longevity_001",
  "topic": "Optimal IGF-1 range for longevity in adults 40-60",
  "nature": "numeric",
  "truly_contradictory": true,
  "position_a": {
    "summary": "IGF-1 optimal range 150-250 ng/mL",
    "detail": "Maintains anabolic function while avoiding excess growth signaling",
    "evidence_type": "EXPLICIT",
    "confidence": "moderate"
  },
  "position_b": {
    "summary": "IGF-1 optimal range 100-180 ng/mL",
    "detail": "More conservative target to minimize cancer/aging acceleration risk",
    "evidence_type": "EXPLICIT",
    "confidence": "moderate"
  },
  "characterization": "These are genuinely different recommendations for the same patient population. The difference likely reflects different weighting of anabolic benefits vs longevity/cancer risk concerns. Position A prioritizes maintaining function; Position B prioritizes longevity risk reduction.",
  "clinical_note": "Both ranges are advocated by different experts. The choice may depend on individual patient factors: those with sarcopenia or frailty concerns might prefer the higher range; those with cancer history or strong longevity focus might prefer the lower range. Neither is definitively 'correct.'",
  "context_factors": [
    "Patient's cancer history or risk",
    "Presence of sarcopenia or frailty",
    "Primary goal (function vs maximum lifespan)",
    "Family history of cancer vs cardiovascular disease",
    "Current IGF-1 level and direction of intervention"
  ],
  "resolution_status": "unresolved",
  "flagged_for_review": true
}
```

---

## Example: Contextual Compatibility

**Input:**
```
CLAIM A:
{
  "protocol": "5mg weekly",
  "indication": "longevity in healthy adults",
  "confidence": "moderate"
}

CLAIM B:
{
  "protocol": "2mg daily",
  "indication": "longevity in older adults with frailty",
  "confidence": "low"
}

TOPIC: Rapamycin dosing for longevity
```

**Output:**
```json
{
  "conflict_id": "conflict_rapa_dose_context_001",
  "topic": "Rapamycin dosing for longevity",
  "nature": "contextual",
  "truly_contradictory": false,
  "position_a": {
    "summary": "5mg weekly for healthy adults",
    "detail": "Pulsed weekly dosing to achieve mTORC1 inhibition while allowing immune recovery",
    "evidence_type": "EXPLICIT",
    "confidence": "moderate"
  },
  "position_b": {
    "summary": "2mg daily for frail older adults",
    "detail": "Lower daily dose for more consistent effect in vulnerable population",
    "evidence_type": "EXPLICIT",
    "confidence": "low"
  },
  "characterization": "These are different protocols for different patient populations, not contradictory recommendations. The weekly pulsed approach is typical for healthy adults; the daily low-dose approach may be considered for those who need more consistent effect or can't tolerate pulsed dosing.",
  "clinical_note": "These protocols target different populations. The choice depends on patient characteristics: healthy adults may use weekly pulsing; frail elders may benefit from consistent low-dose. These should be stored as separate protocols, not as a conflict.",
  "context_factors": [
    "Patient age and health status",
    "Frailty index",
    "Ability to tolerate intermittent dosing",
    "Specific longevity vs immediate health goals"
  ],
  "resolution_status": "unresolved",
  "flagged_for_review": false
}
```

---

## Conflict Types Reference

### Directional
One claims X increases Y, other claims X decreases Y.
- Often indicates different experimental conditions
- May be dose-dependent, time-dependent, or cell-type specific

### Numeric
Same metric, different values.
- Different optimal ranges
- Different recommended doses
- Different thresholds for intervention

### Contextual
Same recommendation, different contexts claimed.
- Usually not true conflicts
- May be stored as separate context-specific entries

### Temporal
Different effects at different timeframes.
- Acute vs chronic effects
- Early vs late treatment
- Often complementary rather than contradictory

### Evidence Grade
Same claim, different confidence.
- Usually resolved by updating to higher confidence
- Only flag if confidence difference is dramatic with different implications

### Definitional
Different definitions of the same term.
- May indicate domain-specific usage
- Flag for terminology standardization

---

## What NOT to Do

1. **DON'T rank positions**: Avoid saying "Position A is more likely correct"
2. **DON'T dismiss low-confidence claims**: They may be valid observations
3. **DON'T force resolution**: Many conflicts are genuinely unresolved in the field
4. **DON'T oversimplify**: Acknowledge complexity where it exists
5. **DON'T ignore context**: Different contexts may make both positions valid
