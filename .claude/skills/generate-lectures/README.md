# Generate Lectures Skill

Batch-generate lecture packages from a course outline using the VectorShift Individual Lecture JSON pipeline.

## Quick Start

```
/generate-lectures outline.md
```

## What It Does

1. Parses a course outline markdown file
2. Extracts lecture titles and suggested materials
3. Fuzzy-matches material names to PDFs in your materials folder
4. Calls the VectorShift pipeline for each lecture (async)
5. Saves structured JSON slides, transcripts, and research content

## Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview execution plan without API calls |
| `--start N` | Start from lecture N |
| `--end N` | Stop after lecture N |
| `--materials PATH` | Custom materials folder |
| `--no-llm-parser` | Use regex parser instead of LLM |

## Output

Each lecture generates:
- `lecture_N_slides.json` - Structured slides for UniversalLecture renderer
- `lecture_N_transcript.md` - TTS-ready speaker script
- `lecture_N_blueprint.md` - Slide-by-slide plan
- `lecture_N_research_dossier.md` - Deep research content

See [SKILL.md](SKILL.md) for full documentation.
