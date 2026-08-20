# Quality Gate Generation Prompt

You are designing quality gates for a RALPH-style skill. Quality gates are the mechanism that enables iteration—they evaluate outputs and provide structured feedback for refinement.

## Input: PRD Structure

{PRD_CONTENT}

## Your Task

For each item type in the PRD, design 4-8 quality checks that:
1. Are objective and measurable
2. Provide specific feedback when failed
3. Enable meaningful iteration

### Quality Gate Anatomy

Each quality gate has:
- **Name**: Descriptive identifier
- **Check Function**: What to evaluate
- **Pass Condition**: Threshold for passing
- **Failure Suggestion**: How to fix it (CRITICAL - this enables iteration)
- **Severity**: Critical (auto-fail) or Standard (contributes to score)

### Gate Design Process

For each item type:

1. **Identify the output**: What does this item produce?
2. **Define "good"**: What makes the output acceptable?
3. **Find failure modes**: What commonly goes wrong?
4. **Create checks**: One check per failure mode
5. **Write suggestions**: Specific, actionable advice for each failure

### Output Format

Generate quality gates in this structure:

```markdown
# Quality Gates: {skill-name}

## Gate: {ITEM_TYPE}

**Applies to**: Items with ID prefix `{ITEM_TYPE}-*`
**Pass Threshold**: {percentage}% of checks must pass
**Critical Failures**: {list of checks that auto-fail}

### Checks

| # | Check | Criteria | Severity | Failure Suggestion |
|---|-------|----------|----------|-------------------|
| 1 | {name} | {what to evaluate} | Critical/Standard | "To fix: {specific action}" |
| 2 | {name} | {what to evaluate} | Standard | "To fix: {specific action}" |
| ... | ... | ... | ... | ... |

### Evaluation Logic

```python
def evaluate_{item_type}(output, context):
    results = []

    # Check 1: {name}
    check_1_passed = {evaluation logic}
    results.append({
        "check": "{name}",
        "passed": check_1_passed,
        "severity": "critical|standard",
        "suggestion": "To fix: {suggestion}" if not check_1_passed else None
    })

    # ... more checks ...

    # Calculate overall result
    critical_failures = [r for r in results if not r["passed"] and r["severity"] == "critical"]
    if critical_failures:
        return {"passed": False, "reason": "Critical failure", "results": results}

    pass_rate = sum(1 for r in results if r["passed"]) / len(results)
    return {
        "passed": pass_rate >= {threshold},
        "score": pass_rate,
        "results": results
    }
```

---

## Repeat for each item type...
```

## Quality Check Categories

Draw from these common check categories:

### Structural Checks
- **format_valid**: Output is in expected format (JSON, Markdown, etc.)
- **required_fields**: All required fields are present
- **no_empty_values**: Required fields are not empty/null
- **length_bounds**: Content within min/max length

### Content Checks
- **topic_relevance**: Content is on-topic
- **no_hallucination**: Claims are grounded in provided context
- **completeness**: All requested aspects are addressed
- **no_contradictions**: Content is internally consistent

### Style Checks
- **tone_appropriate**: Matches required tone/voice
- **no_forbidden_patterns**: Avoids banned phrases/patterns
- **formatting_consistent**: Follows style guidelines

### Technical Checks
- **valid_syntax**: Code/config is syntactically valid
- **no_security_issues**: No obvious vulnerabilities
- **dependencies_resolved**: All references are valid

### Domain-Specific Checks
- Design checks specific to the workflow domain
- E.g., for invoices: `amount_positive`, `date_valid`, `vendor_exists`

## Guidelines

1. **Be specific**: "Word count between 100-200" not "Appropriate length"
2. **Be actionable**: Suggestions should tell exactly what to do
3. **Prioritize**: Mark truly critical checks as critical, don't overuse
4. **Balance**: 4-8 checks is optimal; too few = poor quality, too many = noise
5. **Test mentally**: Would this check catch the common failure modes?

## Example

**Item Type**: EMAIL_DRAFT

```markdown
## Gate: EMAIL_DRAFT

**Pass Threshold**: 70%
**Critical Failures**: valid_structure, no_forbidden_openers

### Checks

| # | Check | Criteria | Severity | Failure Suggestion |
|---|-------|----------|----------|-------------------|
| 1 | valid_structure | Has greeting, body, sign-off | Critical | "To fix: Add a greeting line, body paragraphs, and sign-off" |
| 2 | no_forbidden_openers | Doesn't start with "I hope this email finds you well" | Critical | "To fix: Replace generic opener with specific reference to recipient's context" |
| 3 | word_count | Between 50-200 words | Standard | "To fix: {if too long} Remove redundant sentences {if too short} Add more context about the value proposition" |
| 4 | has_cta | Includes clear call-to-action | Standard | "To fix: Add a specific ask or next step in the closing paragraph" |
| 5 | personalization | References recipient by name or context | Standard | "To fix: Add recipient's name and reference their specific situation" |
| 6 | no_salesy_language | Avoids pushy sales phrases | Standard | "To fix: Replace '{matched phrase}' with softer language" |
```
