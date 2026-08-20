---
name: biomarker-pipeline
description: Run the two-stage biomarker analysis pipeline (Gemini clinical report + Claude visual HTML). Fallback for VectorShift Basic LG Pipeline V2.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Biomarker Pipeline (VectorShift Fallback)

Standalone replica of the VectorShift "Basic LG Pipeline V2" for biomarker analysis.

## When to Use

- When VectorShift pipeline fails or is unavailable
- For manual/CLI-based biomarker report generation
- For testing pipeline changes before deploying to VectorShift

## Architecture

Two-stage LLM pipeline:
1. **Stage 1 (Gemini 3 Pro Preview):** Generates detailed clinical report from patient lab data
2. **Stage 2 (Claude Opus 4.6):** Transforms clinical report into visual HTML executive summary

## Prerequisites

Environment variables must be set:
- `GEMINI_API_KEY` - Google Gemini API key
- `ANTHROPIC_API_KEY` - Anthropic Claude API key

## Usage

### From Python (dashboard fallback)

```python
from lib.biomarker_pipeline import run_pipeline, PipelineInput

result = run_pipeline(PipelineInput(
    patient_data="<paste or read lab data here>",
    language="English",
    user_preference_level=3,
    overall_instructions="",
    other_files=[],
))

# Outputs
print(result.raw_report)       # Stage 1 clinical text
print(result.visual_html)      # Stage 2 HTML report
print(result.gemini_usage)     # Token usage
print(result.claude_usage)     # Token usage
print(result.stage2_failed)    # True if only raw report available
```

### From Claude Code CLI

1. Read the patient lab data file
2. Run the pipeline:

```python
from lib.biomarker_pipeline import run_pipeline, PipelineInput

# Read lab data from file
with open("path/to/lab_results.txt") as f:
    lab_data = f.read()

result = run_pipeline(PipelineInput(patient_data=lab_data))

# Save outputs
with open("content/docs/reports/report.html", "w") as f:
    f.write(result.visual_html)
```

## Pipeline Details

### Inputs (same as VectorShift)

| Input | Maps to VS Node | Description |
|-------|----------------|-------------|
| `patient_data` | `input_0` | Primary lab data text |
| `overall_instructions` | `overall_instructions` | Custom per-run instructions |
| `language` | `language` | Output language (default: English) |
| `user_preference_level` | `User_Preference_Level` | 1-5 aggressiveness scale |
| `other_files` | `Other_files` | Additional file texts |

### Outputs (same as VectorShift)

| Output | Maps to VS Node | Description |
|--------|----------------|-------------|
| `raw_report` | `output_0` | Stage 1 clinical report text |
| `visual_html` | `Visual_Report` | Stage 2 HTML executive summary |
| `gemini_usage` | `credits_node_1` | Gemini token/cost data |
| `claude_usage` | `credits_node_2` | Claude token/cost data |

### User Preference Levels

| Level | Description |
|-------|-------------|
| 1 | Ultra-conservative: Evidence-based medicine only |
| 2 | Conservative: Some emerging research |
| 3 | Balanced: Conventional + alternative |
| 4 | Progressive: Experimental approaches |
| 5 | Cutting-edge: Biohacker methods |

### Error Handling

- Stage 1 failure: Raises error (no report possible without clinical data)
- Stage 2 failure: Returns `raw_report` with `stage2_failed=True`
- Both stages retry up to 5 times with 1-second intervals

### Cost per Run

| Stage | Model | Estimated Cost |
|-------|-------|----------------|
| Stage 1 | Gemini 3 Pro Preview | $0.05-$0.40 |
| Stage 2 | Claude Opus 4.6 | $1.10-$3.50 |
| **Total** | | **$1.15-$3.90** |
