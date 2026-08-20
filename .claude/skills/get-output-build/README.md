# Get Output & Build Skill

Fetch VectorShift pipeline outputs by span_id and chain them to builder skills.

## Quick Start

```bash
# Invoke via slash command
/get-output-build <span_id> --builder "/process-ngm-lectures 1-OeTj2AseENWJFN --module-id module-1"
```

## When to Use

Use this skill when:
- You have span_ids from a previous VectorShift pipeline run
- Pipeline jobs completed but outputs weren't processed
- You want to resume a failed/interrupted processing run
- You're debugging pipeline outputs before processing

## Requirements

- VectorShift API key (configured in environment or uses default)
- Python 3.x for the fetch script

## Files

| File | Description |
|------|-------------|
| `SKILL.md` | Full skill documentation |
| `fetch_outputs.py` | Python script for fetching outputs |
| `README.md` | This file |

## API Reference

```
GET https://api.vectorshift.ai/v1/pipeline/{pipeline_id}/run/status/{span_id}
Authorization: Bearer {api_key}
```

Pipeline ID: `6961308d6fdec16163ee0e2f`
