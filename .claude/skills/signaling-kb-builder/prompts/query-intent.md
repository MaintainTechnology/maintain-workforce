# Query Intent Classification Prompt Template

## Purpose

Classify user queries to route them to the appropriate retrieval path. This prompt is used when querying the knowledge base.

---

## System Prompt

```
You are a clinical query classifier for a cell signaling knowledge base. Your task is to determine the intent behind a user's query so it can be routed to the correct retrieval path.

INTENT CATEGORIES:
1. intervention_dosing - User wants dosing protocols for an intervention
2. biomarker_interpretation - User wants to understand what a biomarker pattern means
3. mechanism - User wants to understand pathway/mechanism relationships
4. regulatory - User wants regulatory status information
5. interaction - User wants drug/intervention interaction information
6. comparison - User wants to compare multiple interventions
7. general - General query that doesn't fit other categories

Be precise. A query about "how rapamycin works" is mechanism, not intervention_dosing.
```

---

## User Prompt Template

```
QUERY: {user_query}

Classify this query:

1. PRIMARY INTENT: What is the user trying to find out?
2. TARGET ENTITIES: What interventions, biomarkers, or pathways are mentioned?
3. RETRIEVAL PATH: Which node type(s) should be queried?

OUTPUT as JSON:
{
  "intent": "intervention_dosing | biomarker_interpretation | mechanism | regulatory | interaction | comparison | general",
  "confidence": "high | moderate | low",
  "target_entities": [
    {
      "name": "entity name as mentioned",
      "type": "intervention | biomarker | pathway",
      "likely_id": "probable node ID"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions | biomarkers | pathways",
    "primary_field": "specific field to query (e.g., 'dosing_protocols')",
    "secondary_lookups": ["any related nodes to also check"]
  },
  "query_refinement": "rewritten query optimized for retrieval (or null if original is good)"
}
```

---

## Intent Examples

### intervention_dosing

**Query:** "What's the recommended rapamycin dose for longevity?"
```json
{
  "intent": "intervention_dosing",
  "confidence": "high",
  "target_entities": [
    {
      "name": "rapamycin",
      "type": "intervention",
      "likely_id": "rapamycin"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions",
    "primary_field": "dosing_protocols",
    "secondary_lookups": []
  },
  "query_refinement": null
}
```

**Query:** "How much thymosin alpha-1 for immune support?"
```json
{
  "intent": "intervention_dosing",
  "confidence": "high",
  "target_entities": [
    {
      "name": "thymosin alpha-1",
      "type": "intervention",
      "likely_id": "thymosin-alpha-1"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions",
    "primary_field": "dosing_protocols",
    "secondary_lookups": []
  },
  "query_refinement": "thymosin alpha-1 dosing immune modulation"
}
```

### biomarker_interpretation

**Query:** "What does low IGF-1 with high insulin resistance mean?"
```json
{
  "intent": "biomarker_interpretation",
  "confidence": "high",
  "target_entities": [
    {
      "name": "IGF-1",
      "type": "biomarker",
      "likely_id": "igf1"
    },
    {
      "name": "insulin resistance",
      "type": "biomarker",
      "likely_id": "homa-ir"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "biomarkers",
    "primary_field": "interpretation_patterns",
    "secondary_lookups": ["igf1-patterns", "homa-ir-patterns"]
  },
  "query_refinement": "low IGF-1 elevated insulin resistance interpretation"
}
```

**Query:** "My patient has elevated homocysteine - what should I check?"
```json
{
  "intent": "biomarker_interpretation",
  "confidence": "high",
  "target_entities": [
    {
      "name": "homocysteine",
      "type": "biomarker",
      "likely_id": "homocysteine"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "biomarkers",
    "primary_field": "interpretation_patterns",
    "secondary_lookups": ["related_biomarkers"]
  },
  "query_refinement": null
}
```

### mechanism

**Query:** "How does AMPK activate autophagy?"
```json
{
  "intent": "mechanism",
  "confidence": "high",
  "target_entities": [
    {
      "name": "AMPK",
      "type": "pathway",
      "likely_id": "axis-1-nutrient-sensing/ampk-signaling"
    },
    {
      "name": "autophagy",
      "type": "pathway",
      "likely_id": "axis-2-proteostasis/autophagy"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "pathways",
    "primary_field": "crosstalk",
    "secondary_lookups": ["axis-1-nutrient-sensing/ampk-signaling", "axis-2-proteostasis/autophagy"]
  },
  "query_refinement": null
}
```

**Query:** "What pathways does rapamycin affect?"
```json
{
  "intent": "mechanism",
  "confidence": "high",
  "target_entities": [
    {
      "name": "rapamycin",
      "type": "intervention",
      "likely_id": "rapamycin"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions",
    "primary_field": "mechanism_claims",
    "secondary_lookups": ["primary_pathways"]
  },
  "query_refinement": null
}
```

### regulatory

**Query:** "Is BPC-157 legal?"
```json
{
  "intent": "regulatory",
  "confidence": "high",
  "target_entities": [
    {
      "name": "BPC-157",
      "type": "intervention",
      "likely_id": "bpc-157"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions",
    "primary_field": "regulatory_status",
    "secondary_lookups": []
  },
  "query_refinement": "BPC-157 FDA WADA regulatory status"
}
```

### interaction

**Query:** "Can I take metformin with rapamycin?"
```json
{
  "intent": "interaction",
  "confidence": "high",
  "target_entities": [
    {
      "name": "metformin",
      "type": "intervention",
      "likely_id": "metformin"
    },
    {
      "name": "rapamycin",
      "type": "intervention",
      "likely_id": "rapamycin"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions",
    "primary_field": "interactions",
    "secondary_lookups": ["metformin", "rapamycin"]
  },
  "query_refinement": null
}
```

### comparison

**Query:** "Rapamycin vs everolimus for longevity"
```json
{
  "intent": "comparison",
  "confidence": "high",
  "target_entities": [
    {
      "name": "rapamycin",
      "type": "intervention",
      "likely_id": "rapamycin"
    },
    {
      "name": "everolimus",
      "type": "intervention",
      "likely_id": "everolimus"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "interventions",
    "primary_field": "dosing_protocols",
    "secondary_lookups": ["rapamycin", "everolimus"]
  },
  "query_refinement": "compare rapamycin everolimus longevity dosing mechanisms"
}
```

### general

**Query:** "Tell me about mTOR"
```json
{
  "intent": "general",
  "confidence": "moderate",
  "target_entities": [
    {
      "name": "mTOR",
      "type": "pathway",
      "likely_id": "axis-1-nutrient-sensing/mtor-signaling"
    }
  ],
  "retrieval_path": {
    "primary_node_type": "pathways",
    "primary_field": null,
    "secondary_lookups": ["interventions targeting mTOR"]
  },
  "query_refinement": "mTOR signaling pathway overview interventions"
}
```

---

## Ambiguous Query Handling

If intent is unclear, classify as most likely with "low" confidence and include clarifying questions:

```json
{
  "intent": "intervention_dosing",
  "confidence": "low",
  "target_entities": [...],
  "retrieval_path": {...},
  "query_refinement": null,
  "clarifying_questions": [
    "Are you asking about dosing or mechanism?",
    "For what indication or patient population?"
  ]
}
```

---

## Entity ID Normalization

When guessing `likely_id`:
- Lowercase
- Hyphenate multi-word names
- Use common abbreviations (IGF-1 → igf1)
- Greek letters spelled out (alpha → alpha)

Examples:
- "Thymosin Alpha-1" → "thymosin-alpha-1"
- "IGF-1" → "igf1"
- "HOMA-IR" → "homa-ir"
- "BPC-157" → "bpc-157"
- "mTOR" → "axis-1-nutrient-sensing/mtor-signaling" (pathway)
