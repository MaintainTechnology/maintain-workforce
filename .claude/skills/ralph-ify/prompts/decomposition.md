# Decomposition Prompt

You are transforming a workflow analysis into a structured PRD (Product Requirements Document) for RALPH-style execution.

## Input: Workflow Analysis

{ANALYSIS_OUTPUT}

## Your Task

Transform the workflow analysis into a concrete PRD structure with properly sized items, priority ordering, and dependency resolution.

### 1. Item Generation

For each work unit from the analysis, create a PRD item:

```json
{
  "id": "{ITEM_TYPE}-{NNN}",
  "title": "{action verb} {object}",
  "description": "{detailed description with all context needed to execute}",
  "priority": {number},
  "status": "pending",
  "dependsOn": ["{dependency IDs}"],
  "acceptanceCriteria": [
    "{criterion 1}",
    "{criterion 2}"
  ],
  "metadata": {
    "complexity": "Low|Medium|High",
    "estimatedTokens": {rough estimate},
    "iterationValue": "Low|Medium|High"
  }
}
```

### 2. Priority Assignment

Assign priorities using this scheme:
- **1-99**: Core/critical items (must complete for workflow to succeed)
- **100-199**: Important but not blocking items
- **200-299**: Optional/enhancement items
- **Within each tier**: Lower number = higher priority

Priority rules:
1. Items with no dependencies get lower numbers (they can start first)
2. Items on the critical path get lower numbers
3. Items with high iteration value get slightly lower numbers (more time for retries)

### 3. Dependency Resolution

Ensure dependencies are correctly specified:
- Use the exact ID format from the items array
- Verify no circular dependencies exist
- Ensure all referenced dependencies exist

### 4. Sizing Validation

Verify each item fits in one context window:
- Description + acceptance criteria should be < 2000 tokens
- If an item seems too large, flag it for splitting

### 5. Config Recommendations

Based on the analysis, recommend:
- `maxIterations`: Total iterations across all items
- `maxFailuresPerItem`: How many retries before blocking

## Output Format

Generate a complete PRD structure:

```json
{
  "version": "1.0",
  "skill": "{skill-name-kebab-case}",
  "createdAt": "{ISO timestamp placeholder}",
  "config": {
    "maxIterations": {number},
    "maxFailuresPerItem": {number},
    "settings": {
      // workflow-specific settings
    }
  },
  "items": [
    // All generated items in priority order
  ],
  "summary": {
    "totalItems": {count},
    "criticalPath": ["{item IDs in order}"],
    "parallelGroups": [
      ["{IDs that can run in parallel}"]
    ]
  }
}
```

## Validation Checklist

Before outputting, verify:

- [ ] All items have unique IDs
- [ ] All dependencies reference existing items
- [ ] No circular dependencies
- [ ] Priorities are assigned (no duplicates unless intentional)
- [ ] All items have acceptance criteria
- [ ] Description provides enough context to execute independently
- [ ] Items are ordered by priority in the array

## Example Transformation

**Analysis Input:**
```yaml
work_units:
  - id: PARSE
    name: Parse Input Document
    dependencies: []
    complexity: Low
```

**PRD Output:**
```json
{
  "id": "PARSE-001",
  "title": "Parse input document into structured data",
  "description": "Read the input document and extract structured data. Handle various formats (PDF, DOCX, TXT). Output a normalized JSON structure with extracted fields.",
  "priority": 1,
  "status": "pending",
  "dependsOn": [],
  "acceptanceCriteria": [
    "Output is valid JSON",
    "All expected fields are present",
    "No parsing errors in logs"
  ],
  "metadata": {
    "complexity": "Low",
    "estimatedTokens": 500,
    "iterationValue": "Low"
  }
}
```
