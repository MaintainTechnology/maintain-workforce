# Entity Resolution Prompt Template

## Purpose

Determine if an extracted entity matches an existing node in the KB or should be created as new. This prompt is used in Step 2 of the processing pipeline.

---

## System Prompt

```
You are a biomedical entity resolution specialist. Your task is to determine if an extracted entity name matches an existing entity in the knowledge base.

You must consider:
1. Synonyms (sirolimus = rapamycin)
2. Trade names (Rapamune = rapamycin)
3. Abbreviations (TA1 = thymosin alpha-1)
4. Spelling variants (metformine = metformin)
5. Related but distinct entities (rapamycin ≠ everolimus, both are mTOR inhibitors but different compounds)

CRITICAL: Do NOT match entities that are related but distinct. Only match true synonyms/aliases.
```

---

## User Prompt Template

```
TASK: Determine if the extracted entity matches an existing KB entity.

EXTRACTED ENTITY:
- Name: {extracted_entity_name}
- Category: {extracted_category}
- Context: {extraction_context}

EXISTING KB ENTITIES ({entity_type}):
{existing_entities_list}

For each existing entity, I'm showing:
- ID: canonical identifier
- Aliases: known alternative names

---

EXISTING ENTITIES:
{formatted_entity_list}

---

DECISION REQUIRED:

1. Does "{extracted_entity_name}" match any existing entity?
2. If yes, which one and why?
3. If no, should it be created as a new entity?

Consider:
- Is this a synonym, trade name, or abbreviation of an existing entity?
- Is this a distinct entity that happens to be in the same class?
- Is there ambiguity that requires more context?

OUTPUT as JSON:
{
  "decision": "match" | "create_new" | "ambiguous",
  "matched_entity_id": "string or null",
  "confidence": "high" | "moderate" | "low",
  "reasoning": "explanation of decision",
  "suggested_alias": "if match, should this name be added as an alias? string or null",
  "ambiguity_notes": "if ambiguous, what additional context would help?"
}
```

---

## Example: Synonym Match

**Input:**
```
EXTRACTED ENTITY:
- Name: sirolimus
- Category: small_molecule
- Context: "sirolimus 5mg weekly for longevity"

EXISTING ENTITIES:
- rapamycin (aliases: ["Rapamune"])
- everolimus (aliases: ["Afinitor", "Zortress"])
- metformin (aliases: ["Glucophage"])
```

**Output:**
```json
{
  "decision": "match",
  "matched_entity_id": "rapamycin",
  "confidence": "high",
  "reasoning": "Sirolimus is the INN (International Nonproprietary Name) for rapamycin. They are the same compound - rapamycin was the original research name derived from Rapa Nui (Easter Island), while sirolimus is the standardized pharmaceutical name.",
  "suggested_alias": "sirolimus",
  "ambiguity_notes": null
}
```

---

## Example: Related but Distinct

**Input:**
```
EXTRACTED ENTITY:
- Name: everolimus
- Category: small_molecule
- Context: "everolimus as alternative to rapamycin"

EXISTING ENTITIES:
- rapamycin (aliases: ["sirolimus", "Rapamune"])
- metformin (aliases: ["Glucophage"])
```

**Output:**
```json
{
  "decision": "create_new",
  "matched_entity_id": null,
  "confidence": "high",
  "reasoning": "Everolimus is a distinct mTOR inhibitor, not a synonym for rapamycin. While both are rapalogs (rapamycin analogs) with similar mechanisms, they are different chemical entities with different pharmacokinetics, dosing, and indications. Everolimus should be its own node.",
  "suggested_alias": null,
  "ambiguity_notes": null
}
```

---

## Example: Abbreviation Match

**Input:**
```
EXTRACTED ENTITY:
- Name: TA1
- Category: peptide
- Context: "TA1 1.5mg subcutaneous for immune modulation"

EXISTING ENTITIES:
- thymosin-alpha-1 (aliases: ["Zadaxin"])
- thymosin-beta-4 (aliases: ["TB-500", "TB4"])
- bpc-157 (aliases: ["Body Protection Compound 157"])
```

**Output:**
```json
{
  "decision": "match",
  "matched_entity_id": "thymosin-alpha-1",
  "confidence": "high",
  "reasoning": "TA1 is a standard abbreviation for Thymosin Alpha-1. The context of immune modulation is consistent with thymosin-alpha-1's known use. Note: TA1 should not be confused with TB4 (thymosin-beta-4), which is a different peptide.",
  "suggested_alias": "TA1",
  "ambiguity_notes": null
}
```

---

## Example: Ambiguous Case

**Input:**
```
EXTRACTED ENTITY:
- Name: GH
- Category: hormone
- Context: "GH therapy for anti-aging"

EXISTING ENTITIES:
- growth-hormone (aliases: ["somatropin", "HGH", "hGH"])
- growth-hormone-releasing-hormone (aliases: ["GHRH", "sermorelin"])
```

**Output:**
```json
{
  "decision": "match",
  "matched_entity_id": "growth-hormone",
  "confidence": "moderate",
  "reasoning": "GH most commonly refers to Growth Hormone (somatropin) rather than GHRH. The context 'GH therapy' strongly suggests the hormone itself rather than a secretagogue. However, in some contexts GH could refer to the GH/IGF-1 axis broadly.",
  "suggested_alias": "GH",
  "ambiguity_notes": "If context mentions 'GH peptides' or 'GH secretagogues', this might refer to GHRH/GHRP instead."
}
```

---

## Entity Categories

When resolving, consider category-specific patterns:

### Small Molecules
- INN vs trade names (metformin vs Glucophage)
- Isomer specifications (L-carnitine vs D-carnitine)
- Salt forms (metformin HCl vs metformin)

### Peptides
- Abbreviations (BPC-157, TB-500, TA1)
- Fragment notations (GHK-Cu, AOD-9604)
- Research codes (PT-141, Melanotan II)

### Pathways
- Full name vs abbreviation (mTOR vs mechanistic target of rapamycin)
- Subunit specifications (mTORC1 vs mTORC2)
- Alternative naming conventions (AMPK vs AMP-activated protein kinase)

### Biomarkers
- Abbreviations (IGF-1, HOMA-IR, hs-CRP)
- Assay-specific names (free T3 vs total T3)
- Calculated indices (HOMA-IR, TG/HDL ratio)

---

## Quality Criteria

A good entity resolution should:

1. **Be decisive**: Match, create, or explicitly flag as ambiguous
2. **Be accurate**: Only match true synonyms, not related entities
3. **Include reasoning**: Explain the decision logic
4. **Suggest aliases**: If matching, suggest adding the extracted name as alias
5. **Flag uncertainty**: Note when additional context would help
