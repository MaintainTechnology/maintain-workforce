---
name: advanced-analysis
description: Run the Advanced Analysis V5 pipeline — generates comprehensive biomarker reports with visual HTML output
allowed-tools: Read, Bash, Glob, Write
---

# Advanced Analysis V5 Pipeline

Standalone replica of the VectorShift "Advanced Analysis V5" pipeline. Generates publication-quality biomarker analysis reports using Claude Opus 4.6, with KB enrichment via VectorShift.

## Quick Start

```python
from lib.advanced_analysis import run_pipeline_sync, PipelineInput, PipelineConfig

config = PipelineConfig.from_env()
result = run_pipeline_sync(
    PipelineInput(
        primary_input="<paste lab results here>",
        language="English",
        overall_instructions="Patient goals: optimize metabolic health and longevity",
    ),
    config,
)

# Save outputs
with open("report.md", "w") as f:
    f.write(result.translated_report)
with open("report.html", "w") as f:
    f.write(result.visual_html)
```

## Architecture

```
Stage 1: Base Report Generator
│   Model: Claude Opus 4.6 (32K tokens)
│   Input: lab results + instructions + files
│   Output: 3,000+ word clinical report
│
├── Stage 2: KB Enrichment
│   API: VectorShift pipeline 69583423bb2cc87ef3fecefe
│   KBs: Kalish, SSRP, HHI, cheatsheets, Goodenow
│   Output: report enriched with interpretation rules
│
├── Stage 3a: Medical Translator (parallel)
│   Model: Claude Opus 4.6 (32K tokens)
│   Output: translated clinical report
│
└── Stage 3b: Visual Reporter (parallel)
    Model: Claude Opus 4.6 (32K tokens)
    Output: 800+ line HTML executive summary with SVG diagrams
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY_VS_ADVANCED_ANALYSIS` | Yes* | Anthropic API key for Claude Opus 4.6 |
| `ANTHROPIC_API_KEY` | Fallback | Used if VS-specific key not set |
| `VECTORSHIFT_API_KEY` | Yes | VectorShift API key for KB enrichment |

## Pipeline Inputs

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `primary_input` | str | required | Lab results text |
| `language` | str | "English" | Target output language |
| `overall_instructions` | str | "" | Clinic instructions, patient goals, intake data |
| `other_files` | list[str] | [] | Parsed text from supplementary files |

## Pipeline Outputs

| Field | Type | Description |
|-------|------|-------------|
| `translated_report` | str | Full clinical report in target language |
| `visual_html` | str | Visual HTML executive summary |
| `base_report` | str | Raw Stage 1 output (for debugging) |
| `enriched_report` | str | Stage 2 output (for debugging) |
| `stage1_usage` | StageUsage | Token counts for base report |
| `stage3a_usage` | StageUsage | Token counts for translation |
| `stage3b_usage` | StageUsage | Token counts for visual report |
| `success` | bool | Whether pipeline completed successfully |
| `error` | str | Error message if failed |

## Cost Estimate

| Stage | Model | Est. Cost |
|-------|-------|-----------|
| Stage 1 | Claude Opus 4.6 | $1.50–$3.00 |
| Stage 2 | VectorShift KB | ~$0.10 |
| Stage 3a | Claude Opus 4.6 | $0.50–$1.50 |
| Stage 3b | Claude Opus 4.6 | $1.00–$3.00 |
| **Total** | | **$3.10–$7.60** |

## Module Structure

```
lib/advanced_analysis/
├── __init__.py           # Public API
├── config.py             # PipelineConfig, API key loading
├── models.py             # PipelineInput, PipelineResult, StageUsage
├── pipeline.py           # Orchestrator: Stage1 → Stage2 → Stage3a+3b
├── prompts/
│   ├── base_report.py    # System + user prompts for base report
│   ├── translator.py     # System prompt for medical translator
│   └── visual_reporter.py # System + user prompts for visual HTML
├── stages/
│   ├── stage1_base_report.py     # Claude Opus → clinical report
│   ├── stage2_kb_enrichment.py   # VectorShift → enriched report
│   ├── stage3_translator.py      # Claude Opus → translated report
│   └── stage3_visual_reporter.py # Claude Opus → visual HTML
└── tests/
    ├── test_models.py
    ├── test_config.py
    ├── test_prompts.py
    ├── test_stage1.py
    ├── test_stage2.py
    ├── test_stage3_translator.py
    ├── test_stage3_visual.py
    └── test_pipeline.py
```

## Clinical Conventions

- **Free Testosterone**: Always labeled "suboptimal" per clinic convention
- **GLP-1 RAs**: When recommending, add creatine monohydrate 5g daily
- **NAD+**: Consider 1000mg oral daily if A1c >5.4 AND CRP <1
- **Vitamin D**: Target 60-80 ng/mL
- **Lab Values**: Report EXACTLY as provided (no rounding)
- **Branding**: Generic names only (no NutriImmunity, NutriCleanse, etc.)

## Running Tests

```bash
python -m pytest lib/advanced_analysis/tests/ -v
```
