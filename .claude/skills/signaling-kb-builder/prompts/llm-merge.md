# LLM Merge Prompts

## Purpose

Intelligently merge new extracted data into existing KB entity files using Claude Haiku 4.5. This is Stage 3 of the three-stage LLM pipeline. LLM-based merging ensures semantic deduplication of protocols and claims while preserving all existing information.

---

## Merge Intervention Prompt

```
You are a biomedical knowledge base curator. Merge new intervention data into an existing intervention record.

EXISTING INTERVENTION RECORD:
{existing}

NEW EXTRACTED DATA TO MERGE:
{new_data}

MERGE RULES:
1. PRESERVE all existing data - never delete information unless it's clearly wrong
2. ADD new dosing protocols only if they provide genuinely new information (different dose, route, indication, or context)
3. ADD new mechanism claims only if they describe different targets/effects (avoid semantic duplicates)
4. MERGE aliases - combine without duplicates
5. MERGE contraindications and monitoring - combine, deduplicate
6. For conflicting information, keep BOTH with appropriate confidence levels
7. Prefer peer-reviewed citations (PMID/DOI) over uncited claims
8. ONLY include citations with valid PMIDs or DOIs

OUTPUT the complete merged intervention JSON. Return ONLY valid JSON, no other text.
```

---

## Merge Pathway Prompt

```
You are a biomedical knowledge base curator. Merge new pathway data into an existing pathway record.

EXISTING PATHWAY RECORD:
{existing}

NEW EXTRACTED DATA TO MERGE:
{new_data}

MERGE RULES:
1. PRESERVE all existing data
2. ADD new core_nodes (genes/proteins) without duplicates
3. ADD new upstream_triggers and downstream_effects without duplicates
4. MERGE interventions_targeting - combine, avoid duplicates
5. MERGE crosstalk relationships - combine, avoid duplicates
6. For conflicting information, keep BOTH
7. Prefer citations with PMIDs/DOIs

OUTPUT the complete merged pathway JSON. Return ONLY valid JSON, no other text.
```

---

## Merge Biomarker Prompt

```
You are a biomedical knowledge base curator. Merge new biomarker data into an existing biomarker record.

EXISTING BIOMARKER RECORD:
{existing}

NEW EXTRACTED DATA TO MERGE:
{new_data}

MERGE RULES:
1. PRESERVE all existing data
2. ADD new interpretation_patterns only if they describe genuinely different patterns
3. ADD new optimal_ranges_by_context only if for different contexts
4. MERGE interventions_affecting - combine, avoid duplicates
5. MERGE pathways_involved - combine, avoid duplicates
6. Update reference_range only if new data is more complete
7. For conflicting interpretations, keep BOTH with context

OUTPUT the complete merged biomarker JSON. Return ONLY valid JSON, no other text.
```

---

## Implementation

```python
async def llm_merge_entity(
    client: OpenRouterClient,
    entity_type: str,
    existing: dict,
    new_data: dict,
    tracker: CostTracker
) -> dict:
    """Use Haiku 4.5 to intelligently merge new data into existing entity."""
    
    # Select appropriate prompt
    if entity_type == "intervention":
        prompt = MERGE_INTERVENTION_PROMPT
    elif entity_type == "pathway":
        prompt = MERGE_PATHWAY_PROMPT
    elif entity_type == "biomarker":
        prompt = MERGE_BIOMARKER_PROMPT
    else:
        raise ValueError(f"Unknown entity type: {entity_type}")
    
    formatted_prompt = prompt.format(
        existing=json.dumps(existing, indent=2),
        new_data=json.dumps(new_data, indent=2)
    )
    
    messages = [{"role": "user", "content": formatted_prompt}]
    
    response, input_tokens, output_tokens = await client.chat_completion(
        messages=messages,
        model=MERGE_MODEL,  # anthropic/claude-haiku-4.5
        max_tokens=64000,
        temperature=0.0
    )
    
    # Parse JSON response
    text = response.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    
    merged = json.loads(text.strip())
    return merged
```

---

## Why LLM-Based Merging?

### Problem with Simple Merging

Simple programmatic merging (e.g., list concatenation) creates duplicates:

```python
# Simple merge creates duplicates
existing_protocols = [
    {"dose": "5mg", "frequency": "weekly", "indication": "longevity"}
]
new_protocols = [
    {"dose": "5-6mg", "frequency": "weekly", "indication": "healthspan"}
]
# Result: 2 protocols that are semantically the same
```

### LLM Merge Advantage

LLM understands semantic equivalence:
- "5mg weekly" ≈ "5-6mg weekly" (same protocol, different precision)
- "longevity" ≈ "healthspan" (same indication, different terminology)
- "inhibits MTORC1" ≈ "mTOR complex 1 inhibitor" (same mechanism)

The LLM intelligently merges these into a single, more complete entry.

---

## Conflict Handling

### Principle: Surface Both, Don't Rank

When sources disagree, BOTH positions are preserved:

```json
{
  "dosing_protocols": [
    {
      "dose": "5mg",
      "frequency": "weekly",
      "context": "Conservative dosing approach",
      "confidence": "moderate"
    },
    {
      "dose": "10mg",
      "frequency": "weekly",
      "context": "More aggressive protocol for robust patients",
      "confidence": "low"
    }
  ]
}
```

---

## Cost

| Model | Input | Output | Typical Merge |
|-------|-------|--------|---------------|
| Haiku 4.5 | $0.80/M | $4.00/M | ~$0.05-0.15 |

LLM merge adds ~$0.10 per entity merge on average. For a transcript with 20 interventions, 10 pathways, and 10 biomarkers, expect ~$4-5 in merge costs.

---

## Fallback Behavior

If LLM merge fails (parsing error, API timeout), the system falls back to simple programmatic merge:

```python
if merged is None:
    # Fallback: simple merge
    for protocol in new_data.get("dosing_protocols", []):
        existing["dosing_protocols"].append(protocol)
    # ... etc
```

This ensures no data loss even if the LLM merge fails.
