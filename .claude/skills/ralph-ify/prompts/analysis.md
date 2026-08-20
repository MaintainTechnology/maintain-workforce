# Workflow Analysis Prompt

You are analyzing a workflow, process, or skill to prepare it for RALPH-ification (transformation into an iterative architecture with quality gates).

## Input

{INPUT_CONTENT}

## Your Task

Analyze the input and extract the following information:

### 1. Workflow Identification

- **Workflow Name**: What should this workflow/skill be called?
- **Purpose**: What is the primary goal of this workflow?
- **Trigger**: What initiates this workflow? (user command, event, schedule, etc.)
- **Output**: What does this workflow produce?

### 2. Work Unit Decomposition

Identify the discrete, atomic work units. A good work unit:
- Can be completed in a single context window (~100k tokens)
- Has clear inputs and outputs
- Has measurable success criteria
- Is independent enough to be retried without affecting other units

For each work unit, capture:
- **ID**: Short identifier (e.g., PARSE, VALIDATE, GENERATE)
- **Name**: Human-readable name
- **Description**: What this unit does
- **Inputs**: What it needs to start
- **Outputs**: What it produces
- **Dependencies**: Which other units must complete first
- **Estimated Complexity**: Low / Medium / High

### 3. Dependency Mapping

Create a dependency graph showing:
- Which units can run in parallel (no dependencies on each other)
- Which units must run sequentially (have dependencies)
- Critical path (longest chain of dependencies)

### 4. Success Criteria

For each work unit, define what "done" means:
- What conditions must be met?
- What quality thresholds apply?
- What artifacts must be produced?

### 5. Failure Modes

Identify potential failure modes:
- What can go wrong in each unit?
- What are the common edge cases?
- What external dependencies might fail?

### 6. Iteration Opportunities

Identify where iteration (retry with feedback) would be valuable:
- Which units produce outputs that can be objectively evaluated?
- Which units would benefit from refinement cycles?
- What feedback would be useful for retries?

## Output Format

Provide your analysis in this structured format:

```yaml
workflow:
  name: "{workflow_name}"
  purpose: "{one-line description}"
  trigger: "{what initiates this}"
  output: "{what it produces}"

work_units:
  - id: "UNIT_1"
    name: "{human-readable name}"
    description: "{what it does}"
    inputs:
      - "{input 1}"
    outputs:
      - "{output 1}"
    dependencies: []
    complexity: "Low|Medium|High"
    success_criteria:
      - "{criterion 1}"
    failure_modes:
      - "{potential failure 1}"
    iteration_value: "Low|Medium|High"  # How much would iteration help?

dependency_graph:
  parallel_groups:
    - [UNIT_1, UNIT_2]  # These can run in parallel
  sequential_chains:
    - [UNIT_3, UNIT_4, UNIT_5]  # These must run in order
  critical_path: [UNIT_1, UNIT_3, UNIT_4, UNIT_5]

recommendations:
  max_iterations: {suggested number}
  max_retries_per_unit: {suggested number}
  state_persistence: "required|optional"
  notes:
    - "{any important observations}"
```

## Guidelines

1. **Err on the side of smaller units**: It's better to have more small units than fewer large ones
2. **Be specific about success criteria**: Vague criteria lead to vague quality gates
3. **Consider retry scenarios**: What feedback would help improve a failed unit?
4. **Identify the 80/20**: Which units are most likely to fail? Focus quality gates there
5. **Note ambiguities**: If something is unclear, flag it for user clarification
