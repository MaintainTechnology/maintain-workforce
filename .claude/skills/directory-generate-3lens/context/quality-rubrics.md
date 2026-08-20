# Quality Rubrics Reference

This document defines all quality rubrics used by the three-lens directory generation skill.

## Core Philosophy

**The goal is content that passes two simultaneous tests:**
1. **Vendor test:** Would every vendor featured be pleased to share this page?
2. **Clinician test:** Would a practitioner find this genuinely useful for their decisions?

These aren't in tension—they require thoughtful, positive, clinically-informed content.

---

## Lens 1: Mechanistic Analysis Rubric

**Pass Threshold:** 5/6 criteria

| ID | Criterion | Description | Pass Condition |
|----|-----------|-------------|----------------|
| L1.1 | `mechanism_depth` | Are specific molecular/system targets identified? | At least 2 specific targets with proper nomenclature |
| L1.2 | `pathway_accuracy` | Are signaling pathways correctly mapped? | Clear directional relationships; no known errors |
| L1.3 | `cascade_completeness` | Is the full mechanism chain shown? | Trigger → Primary → Secondary → Outcomes present |
| L1.4 | `analogy_quality` | Is there a memorable educational analogy? | At least one accurate and illuminating analogy |
| L1.5 | `diagram_validity` | Does the SVG diagram render correctly? | Valid SVG with proper viewBox, readable text, no overflow |
| L1.6 | `first_principles_not_claims` | Does it explain mechanism, not efficacy? | Describes HOW, not WHETHER it works |

### L1 Common Failure Modes

- **L1.1 fails:** Vague targets like "cellular metabolism" instead of specific genes/proteins
- **L1.2 fails:** Incorrect pathway directionality
- **L1.3 fails:** Missing downstream outcomes
- **L1.4 fails:** Analogy that's catchy but scientifically misleading
- **L1.5 fails:** Text overflows viewBox boundaries
- **L1.6 fails:** Efficacy claims instead of mechanism explanation

---

## Lens 2: Literature Review Rubric

**Pass Threshold:** 5/6 criteria

| ID | Criterion | Description | Pass Condition |
|----|-----------|-------------|----------------|
| L2.1 | `citation_validity` | Are all citations verifiable? | Every PMID/DOI resolves to a real paper |
| L2.2 | `evidence_breadth` | Is there sufficient study diversity? | At least 3 unique studies cited |
| L2.3 | `study_details` | Are methodological details included? | Sample size, design, population included |
| L2.4 | `conflict_documentation` | Are conflicting findings noted? | Both positions presented if conflicts exist |
| L2.5 | `regulatory_accuracy` | Is regulatory status correct? | Matches official records |
| L2.6 | `recency` | Are recent studies included? | 2024-2026 studies included if they exist |

### L2 Common Failure Modes

- **L2.1 fails:** Hallucinated PMIDs
- **L2.2 fails:** Same study cited multiple times as if different
- **L2.3 fails:** "A study showed..." without methodology
- **L2.4 fails:** One-sided presentation of contested evidence
- **L2.5 fails:** Incorrect FDA approval status
- **L2.6 fails:** Missing recent studies when they exist

---

## Lens 3: KB Cross-Reference & Clinical Perspective Rubric

**Pass Threshold:** 5/6 criteria

| ID | Criterion | Description | Pass Condition |
|----|-----------|-------------|----------------|
| L3.1 | `kb_search_exhaustive` | Were all query types attempted? | Direct, target, pathway, indication queries attempted |
| L3.2 | `clinical_perspective_extracted` | Is implicit clinical wisdom surfaced? | Practitioner mental model, tradeoffs, and practical wisdom documented |
| L3.3 | `notable_for_framing` | Are entities positioned positively? | Each entity has 2-4 "notable for" points; no rankings or criticism |
| L3.4 | `actionability_mapped` | Is the path from finding to action clear? | At least 3 finding → intervention mappings documented |
| L3.5 | `integration_guidance_provided` | Is there clear guidance for weaving? | Specific guidance for how to integrate into each section |
| L3.6 | `vendor_neutral_language` | Is language free of criticism/rankings? | Zero instances of "better than," "best," "weakness," or negative comparisons |

### L3 Common Failure Modes

- **L3.1 fails:** Only doing direct lookup, skipping pathway/indication queries
- **L3.2 fails:** Extracting only facts from KB, not implicit clinical perspective
- **L3.3 fails:** "GI-MAP has accuracy concerns" (critical language)
- **L3.4 fails:** Listing interventions without connecting them to test findings
- **L3.5 fails:** KB data siloed in separate output without integration guidance
- **L3.6 fails:** Ranking vendors or declaring winners

### L3 "Notable For" Examples

**GOOD framing:**
- "Notable for its metatranscriptomic approach, capturing functional activity"
- "Distinctive in offering practitioner education resources"
- "Emphasizes longitudinal tracking with repeated testing protocols"

**BAD framing (fails L3.3 and L3.6):**
- "Better than competitors in..." (ranking)
- "Limited by its 16S methodology..." (critical)
- "Weakness is lack of functional data..." (negative)
- "Best option for practitioners who..." (declaring winner)

---

## Synthesis Rubric

**Pass Threshold:** 5/5 criteria (all must pass)

| ID | Criterion | Description | Pass Condition |
|----|-----------|-------------|----------------|
| S.1 | `clinical_voice_throughout` | Does clinical perspective permeate the narrative? | Every section has clinical context, not just facts; KB wisdom informs perspective, not siloed in boxes |
| S.2 | `vendor_positive_framing` | Are all vendors/entities positioned positively? | Each entity framed via "notable for"; no rankings, criticism, or "best" declarations |
| S.3 | `actionability_clear` | Does reader know what to DO? | Clear path from information to clinical action; KB intervention connections explicit |
| S.4 | `evidence_graded` | Is confidence level clear? | Claims labeled with confidence; evidence hierarchy visible |
| S.5 | `kb_wisdom_interwoven` | Is clinical perspective integrated, not siloed? | No separate "KB Insight" boxes; wisdom flows through prose naturally |

### Synthesis Common Failure Modes

- **S.1 fails:** Section reads like vendor spec sheet without clinical context
- **S.2 fails:** "GI-MAP has accuracy concerns" or "Viome is the best option"
- **S.3 fails:** Great research summary but no guidance on what to do with information
- **S.4 fails:** All claims presented with equal confidence
- **S.5 fails:** KB insights in separate green boxes rather than woven into narrative

### The Four Litmus Tests

Before finalizing synthesis, verify:

1. **Vendor test:** Would every vendor featured be happy to share this page?
2. **Clinician test:** Would a practitioner find this genuinely useful for decisions?
3. **Wisdom test:** Does this feel like guidance from an experienced colleague?
4. **Action test:** Does the reader know what to DO after reading?

All four must pass.

---

## Iteration Rules

### When to Iterate

A lens iterates if:
1. Pass count < threshold
2. Retry feedback is actionable
3. Iteration count < max_iterations (default: 3)

### Iteration Process

1. Quality gate evaluates output
2. If FAIL: Generate specific retry feedback
3. Feed back to generation prompt with:
   - Original input
   - Previous output
   - Specific failures and fixes
4. Re-generate
5. Re-evaluate

### When to Block

Block (stop iterating) if:
- Max iterations reached
- Failure is not addressable (e.g., product genuinely has no studies)
- Critical error that can't be fixed

Blocked items are logged with reason and the process continues.

---

## Evidence Confidence Mapping

| Source Type | Confidence Level | How to Present |
|-------------|------------------|----------------|
| Meta-analysis of RCTs | Highest | Lead claims, state confidence |
| Single large RCT (N>500) | High | Strong support, cite directly |
| KB claim with PMID | Medium-High | Integrate as practitioner consensus |
| Small RCT (N<100) | Medium | Supporting evidence |
| Observational (large cohort) | Medium | Associative |
| Case series | Low | Anecdotal |
| KB claim without PMID | Low | Frame as "clinical experience suggests" |
| Expert opinion | Contextual | Framing only |

---

## Vendor Neutrality Rules

### Prohibited Language

Never use:
- "best," "top," "leading," "superior," "premier"
- "better than," "worse than," "outperforms"
- "recommended," "preferred," "choice for"
- "weakness," "limitation," "lacks," "fails to"
- "concerns about," "problematic," "questionable"

### Permitted Language

Use instead:
- "notable for," "distinctive in," "emphasizes"
- "takes a [X] approach," "focuses on [Y]"
- "practitioners who prioritize [X] may find value in"
- "the [methodology] approach offers [specific capability]"

### Handling Genuine Concerns

If there are legitimate accuracy or safety issues:
- Frame via evidence: "Studies show interlaboratory variability, suggesting practitioners should use the same lab for longitudinal comparison"
- Never attribute to vendor: NOT "GI-MAP has accuracy problems"
- Focus on practitioner action: "When evaluating results, consider methodology differences between labs"

---

## Assembly Rubric (AEO Compliance)

**Pass Threshold:** 8/10 criteria

| ID | Criterion | Description | Pass Condition |
|----|-----------|-------------|----------------|
| A.1 | `quick_reference_table` | Is comparison table at page top? | Table immediately after header, before summary |
| A.2 | `heading_hierarchy` | Is H1>H2>H3>H4 sequential? | No skipped heading levels |
| A.3 | `inline_qa_distributed` | Are Q&A blocks throughout? | Minimum 3 inline Q&A (Technology, Evidence, Decision Support) |
| A.4 | `entity_depth` | Are entity sections substantive? | Each 400-600 words with all 4 H4 subsections |
| A.5 | `front_loaded_answers` | Do answers start with direct answer? | All Q&A and FAQ answers bold first sentence |
| A.6 | `schema_markup` | Is ItemList schema present? | JSON-LD with all entities listed |
| A.7 | `word_count` | Is total content sufficient? | 5,000-7,000 words total |
| A.8 | `numbered_not_ranked` | Are entities numbered but not ranked? | Visible numbers, explicit "not ranked" statement |
| A.9 | `action_pathways` | Is finding→intervention table present? | Decision support table with KB intervention connections |
| A.10 | `vendor_neutral` | Is all language vendor-positive? | Zero rankings, criticism, or "best" language |

### AEO Research Basis

These criteria derive from AEO research showing:
- **80%** of ChatGPT-cited content includes list sections
- **3x higher** citation rate for proper heading hierarchy
- **40% more likely** extraction for Q&A format
- **Front-loaded answers** essential for featured snippet capture

Sources:
- [Amsive: AEO Complete Guide](https://www.amsive.com/insights/seo/answer-engine-optimization-aeo-evolving-your-seo-strategy-in-the-age-of-ai-search/)
- [Taylor Street: Listicles for LLM Visibility](https://www.taylorstreetco.com/resources/llm-search-visibility-listicles)
- [Conductor: 2026 AEO/GEO Benchmarks](https://www.conductor.com/academy/aeo-geo-benchmarks-report/)

---

## Quality Gate Invocation

```
Evaluate phase: L1 | L2 | L3 | Synthesis | Assembly
Product: {{product_name}}
Iteration: {{n}}
Output: {{lens_output}}

Apply rubric, return:
- Per-criterion PASS/FAIL
- Overall result
- Retry feedback if FAIL
```
