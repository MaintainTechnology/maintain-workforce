# Quality Evaluation Rubrics for BizDev Opportunity Intelligence

Detailed rubrics for evaluating opportunities, emails, and proposals. Used by quality gates and evaluator subagents.

---

## Opportunity Analysis Rubric

### Signal Quality (0-25 points)

| Score | Criteria |
|-------|----------|
| 25 | 3+ signals with confidence ≥ 0.7, includes EXPLICIT_INTEREST |
| 20 | 2+ signals with confidence ≥ 0.6, clear interest indicated |
| 15 | 2+ signals, mixed confidence (0.5-0.7) |
| 10 | 1 signal with confidence ≥ 0.6 |
| 5 | 1 signal with low confidence |
| 0 | No clear signals or all below 0.5 confidence |

### Contact Completeness (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | Name + Email + Company + Title |
| 15 | Name + Email + Company |
| 10 | Name + (Email OR Company) |
| 5 | Name only |
| 0 | No identifiable contact |

### Classification Confidence (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | Classification confidence ≥ 0.8, clear fit to single type |
| 15 | Classification confidence 0.6-0.8, primary type clear |
| 10 | Classification confidence 0.5-0.6, type determinable |
| 5 | Classification confidence < 0.5, uncertain type |
| 0 | Unable to classify or multiple equal types |

### Pain Point Clarity (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | 2+ specific, actionable pain points identified with quotes |
| 15 | 1 specific pain point with supporting quote |
| 10 | General pain point area identified |
| 5 | Implied pain point, no direct evidence |
| 0 | No pain points identified |

### Actionability (0-15 points)

| Score | Criteria |
|-------|----------|
| 15 | Clear next step, timeline mentioned, decision maker identified |
| 10 | Clear next step, contact reachable |
| 5 | Contact identified but unclear next step |
| 0 | No clear path to action |

### Total Score Interpretation

| Score | Grade | Action |
|-------|-------|--------|
| 80-100 | A | High priority, draft proposal |
| 60-79 | B | Good opportunity, draft email |
| 40-59 | C | Needs enrichment, search for more context |
| 20-39 | D | Low priority, monitor only |
| 0-19 | F | Insufficient for action |

---

## Email Draft Rubric

### Opening Quality (0-25 points)

| Score | Criteria | Examples |
|-------|----------|----------|
| 25 | Pattern interrupt + immediate value | "After building 3 clinics, here's the pattern I see with practices like yours..." |
| 20 | Value-first opening, relevant hook | "Most practitioners struggle with X. Here's why..." |
| 15 | Decent hook but generic | "Quick thought on your practice..." |
| 10 | Acceptable but forgettable | "I noticed your work in longevity..." |
| 5 | Weak but not cliche | "I wanted to share something..." |
| 0 | Cliche opener | "Hope this finds you well..." |

**Automatic 0 for:**
- "Hope this finds you well"
- "Just checking in"
- "Wanted to touch base"
- "Following up on my last email"

### Personalization (0-25 points)

| Score | Criteria |
|-------|----------|
| 25 | Uses name + company + specific pain point + unique insight |
| 20 | Uses name + specific pain point from their context |
| 15 | Uses name + general pain point for their type |
| 10 | Uses name + generic industry reference |
| 5 | Name only, generic content |
| 0 | No personalization, could be sent to anyone |

### Value Proposition (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | Clear connection between their need and specific solution |
| 15 | Value stated with relevant credential |
| 10 | Value implied but not specific to them |
| 5 | Generic value statement |
| 0 | No clear value to recipient |

### CTA Quality (0-15 points)

| Score | Criteria |
|-------|----------|
| 15 | Single, specific, low-commitment ask with clear next step |
| 10 | Single ask but slightly vague |
| 5 | Multiple CTAs or high-commitment ask |
| 0 | No CTA or "let me know what you think" |

### Brevity & Format (0-15 points)

| Score | Criteria |
|-------|----------|
| 15 | Under word limit, scannable, well-structured |
| 10 | At word limit, readable |
| 5 | Over limit but still readable |
| 0 | Wall of text or significantly over limit |

**Word limits:**
- Cold: 200 words
- Warm: 300 words
- Re-engagement: 250 words

### Total Score Interpretation

| Score | Grade | Action |
|-------|-------|--------|
| 85-100 | A | Ready to send |
| 70-84 | B | Minor polish, sendable |
| 55-69 | C | Needs revision, iterate |
| 40-54 | D | Major issues, rethink approach |
| 0-39 | F | Start over |

---

## Proposal Rubric

### Understanding Section (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | Accurately reflects their situation, quotes their words, shows deep understanding |
| 15 | Good understanding with specific references |
| 10 | Generic but accurate understanding |
| 5 | Surface-level, could apply to anyone |
| 0 | Missing or inaccurate |

### Solution Fit (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | Directly addresses each pain point with specific deliverables |
| 15 | Addresses main pain points with clear approach |
| 10 | General solution with some customization |
| 5 | Off-the-shelf solution, minimal customization |
| 0 | Solution doesn't match their needs |

### Pricing Clarity (0-20 points)

| Score | Criteria |
|-------|----------|
| 20 | Clear pricing with value justification, matches recommended tier, payment terms included |
| 15 | Clear pricing with justification |
| 10 | Pricing present but limited justification |
| 5 | Vague pricing or missing tier alignment |
| 0 | No pricing or significantly misaligned |

### Credibility/Social Proof (0-15 points)

| Score | Criteria |
|-------|----------|
| 15 | Relevant credentials woven naturally, similar client outcomes cited |
| 10 | Good credentials included, some relevance |
| 5 | Credentials listed but not connected to their needs |
| 0 | No credentials or credential dumping |

### CTA & Next Steps (0-10 points)

| Score | Criteria |
|-------|----------|
| 10 | Clear single action, specific timeline, easy to execute |
| 7 | Clear action but vague timeline |
| 4 | Action present but not specific |
| 0 | No clear next step |

### Format & Polish (0-15 points)

| Score | Criteria |
|-------|----------|
| 15 | Clean HTML, no placeholders, proper styling, client name throughout |
| 10 | Good format, minor issues |
| 5 | Readable but formatting issues |
| 0 | Broken HTML, placeholders present, or unprofessional |

**Automatic 0 for:**
- Any placeholder text ([INSERT], TBD, TODO)
- Broken HTML structure
- Missing client name

### Total Score Interpretation

| Score | Grade | Action |
|-------|-------|--------|
| 85-100 | A | Ready to send |
| 70-84 | B | Minor edits needed |
| 55-69 | C | Significant revision required |
| 40-54 | D | Major restructuring needed |
| 0-39 | F | Regenerate |

---

## Quick Pass/Fail Checks

### Opportunity Pass Criteria
- [ ] At least 1 signal with confidence ≥ 0.6
- [ ] Contact name identified
- [ ] Email OR company identified
- [ ] Classification confidence ≥ 0.5
- [ ] No contradictory signals

### Email Pass Criteria
- [ ] No forbidden opener phrases
- [ ] Under word limit
- [ ] References specific pain point
- [ ] Has single clear CTA
- [ ] No salesy patterns

### Proposal Pass Criteria
- [ ] All sections present
- [ ] No placeholder text
- [ ] Valid HTML
- [ ] Client name included
- [ ] Pricing matches tier

---

## Iteration Guidance

### When Opportunity Fails

1. **Low signal confidence:** Re-analyze source for additional signals, look for implied interest
2. **Missing contact info:** Search email/LinkedIn for contact details
3. **Unclear classification:** Review signals against type patterns, ask for clarification if needed

### When Email Fails

1. **Bad opener:** Rewrite first paragraph with specific value or pattern interrupt
2. **Low personalization:** Add pain point reference and specific context
3. **Multiple CTAs:** Choose the single most important ask
4. **Over word limit:** Cut adjectives, combine sentences, remove redundancy

### When Proposal Fails

1. **Missing sections:** Add required section with relevant content
2. **Placeholders found:** Fill in all bracketed content
3. **Pricing mismatch:** Adjust to recommended tier with justification
4. **Generic understanding:** Add specific quotes and references from opportunity

---

## Evaluator Prompt Template

When spawning a quality evaluator subagent, use this context:

```
Evaluate this {output_type} against the following rubric:

{Paste relevant rubric section}

Content to evaluate:
{content}

Context:
- Opportunity type: {type}
- Pain points: {pain_points}
- Recommended tier: {tier}

Provide:
1. Score for each rubric category
2. Total score and grade
3. Specific passages that passed/failed
4. Actionable improvement suggestions
```
