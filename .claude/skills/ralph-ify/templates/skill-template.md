---
name: {{SKILL_NAME}}
description: {{SKILL_DESCRIPTION}}
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, Task, AskUserQuestion
user_invocable: true
argument-hint: {{ARGUMENT_HINT}}
---

# {{SKILL_TITLE}}

## Overview

{{SKILL_OVERVIEW}}

## Invocation

```bash
/{{SKILL_NAME}} {{ARGUMENT_PATTERN}}
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
{{#ARGUMENTS}}
| `{{ARG_NAME}}` | {{ARG_REQUIRED}} | {{ARG_DESCRIPTION}} |
{{/ARGUMENTS}}

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: PLANNING                           │
├─────────────────────────────────────────────────────────────────┤
│  1. Parse and validate input                                    │
│  2. Generate PRD with discrete items                            │
│  3. Initialize state files                                       │
│  4. Present plan summary to user                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 PHASE 2: ITERATIVE EXECUTION                    │
├─────────────────────────────────────────────────────────────────┤
│  FOR each pending item (by priority):                           │
│    1. Load item context                                         │
│    2. Execute item work                                         │
│    3. Run quality gates                                         │
│    4. IF passed: mark complete, log learnings                   │
│    5. IF failed: retry with feedback (up to {{MAX_RETRIES}}x)   │
│    6. IF blocked: log and continue to next item                 │
│    7. Update state files                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 3: ASSEMBLY                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Collect all completed item outputs                          │
│  2. Assemble final deliverable                                  │
│  3. Run final quality check                                     │
│  4. Write output files                                          │
│  5. Present completion summary                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Planning

### Step 1.1: Input Validation

{{PLANNING_INPUT_VALIDATION}}

### Step 1.2: PRD Generation

Generate a PRD with the following item types:

{{#ITEM_TYPES}}
- **{{ITEM_TYPE}}**: {{ITEM_TYPE_DESCRIPTION}}
{{/ITEM_TYPES}}

### Step 1.3: State Initialization

Create the state directory:

```
.{{SKILL_NAME}}/
├── prd.json              # Source of truth
├── progress.txt          # Human-readable log
{{#HAS_SEGMENTS}}
├── segments/             # Per-item outputs
{{/HAS_SEGMENTS}}
└── output/               # Final deliverables
```

### Step 1.4: User Confirmation

Present the generated PRD to the user and confirm before proceeding.

---

## Phase 2: Iterative Execution

### The Execution Loop

```
WHILE pending items exist AND iterations < {{MAX_ITERATIONS}}:
    item = get_next_pending_item(prd)
    mark_in_progress(item)

    FOR attempt IN range({{MAX_RETRIES}}):
        output = execute_item(item)
        gate_result = run_quality_gate(output, item.type)

        IF gate_result.passed:
            mark_passed(item, output)
            log_learnings(item, gate_result)
            BREAK

        ELSE IF attempt < {{MAX_RETRIES}} - 1:
            # Retry with feedback
            item.feedback = gate_result.suggestions
            CONTINUE

        ELSE:
            mark_blocked(item, gate_result.failures)
            BREAK

    save_state()
```

### Item Execution Details

{{#ITEM_TYPES}}
#### {{ITEM_TYPE}}

**Execution Steps:**
{{ITEM_EXECUTION_STEPS}}

**Quality Gate**: See quality-gates.md section `{{ITEM_TYPE}}`

{{/ITEM_TYPES}}

---

## Phase 3: Assembly

### Step 3.1: Collect Outputs

Gather all passed item outputs from the state.

### Step 3.2: Assemble Deliverable

{{ASSEMBLY_INSTRUCTIONS}}

### Step 3.3: Final Quality Check

{{FINAL_QUALITY_CHECK}}

### Step 3.4: Output

Write final deliverable to:
```
{{OUTPUT_PATH}}
```

---

## Quality Gates

{{QUALITY_GATES_CONTENT}}

---

## State Files

### prd.json

The source of truth for all items and their status.

```json
{
  "version": "1.0",
  "skill": "{{SKILL_NAME}}",
  "config": {
    "maxIterations": {{MAX_ITERATIONS}},
    "maxFailuresPerItem": {{MAX_RETRIES}}
  },
  "items": [...]
}
```

### progress.txt

Human-readable log with learnings:

```
================================================================================
{{SKILL_TITLE}} - PROGRESS LOG
================================================================================

Session Started: {timestamp}

================================================================================
PATTERNS & LEARNINGS
================================================================================

{Accumulated patterns from iterations}

================================================================================
ITERATION LOG
================================================================================

--- ITERATION 1 | {ITEM_ID}: {Title} ---
Status: PASSED | FAILED | BLOCKED
Learnings: {What was learned}
---
```

---

## Troubleshooting

### "Item keeps failing quality gates"

- Review the specific failed checks in progress.txt
- Consider adjusting quality gate thresholds in quality-gates.md
- Check if the item needs to be split into smaller units

### "Stuck on dependencies"

- Verify dependency IDs are correct in prd.json
- Check if a blocking item needs manual intervention

### "State corrupted"

- Delete `.{{SKILL_NAME}}/` directory and restart
- Use `--fresh` flag to force fresh start

---

## Examples

See the examples/ directory for sample invocations and outputs.
