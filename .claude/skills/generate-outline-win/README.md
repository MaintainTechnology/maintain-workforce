# Generate Outline (Windows) Skill

Windows-patched variant of `generate-outline`. Generates course outlines with automatic PDF compression for large reference materials, using the in-repo Python runner at `scripts/outline_creator_runner_win.py`.

## Quick Start

```
/generate-outline-win "Cardiovascular Longevity" --materials "course materials/"
```

## What It Does

1. Collects all supported files (PDF, PPTX, DOCX, XLSX, etc.) from the materials folder
2. Converts non-PDF files to PDF using LibreOffice
3. Compresses large PDFs (>5MB) using Ghostscript (`gswin64c` on Windows)
4. Extracts insights from each file sequentially via the VectorShift File Insight Extractor pipeline
5. Generates a structured outline from the accumulated insights via the Course Outline Creator v5 pipeline
6. Saves accumulated insights, research dossier, and structured outline to `outputs/outlines/{topic_name}/`

## Options

| Flag | Description |
|------|-------------|
| `--materials <folder>` | Folder containing materials (required) |
| `--outline <file>` | Existing outline to revise |
| `--dry-run` | Preview without API calls |
| `--output <folder>` | Custom output folder |

## Output

Each run generates:
- `accumulated_insights.md` — Per-file insights extracted in Phase 1
- `course_dossier.md` — Deep research from Perplexity
- `course_outline.md` — Structured 10-15 lecture curriculum

## Requirements (Windows)

- **LibreOffice** — `winget install TheDocumentFoundation.LibreOffice`
- **Ghostscript** — `winget install ArtifexSoftware.GhostScript`
- **`VECTORSHIFT_API_KEY`** — Already in `.env` at the repo root

## Differences from `generate-outline`

| | `generate-outline` (mac/linux) | `generate-outline-win` (Windows) |
|---|---|---|
| Runner path | `/Users/anantvinjamoori/Vectorshift Pipelines/cli/outline_creator_runner.py` | `scripts/outline_creator_runner_win.py` (in this repo) |
| API key source | `vs_pipelines.config` module | `.env` at repo root |
| LibreOffice | `/Applications/LibreOffice.app/...` | `C:\Program Files\LibreOffice\program\soffice.exe` |
| Ghostscript binary | `gs` | `gswin64c` / `gswin32c` / `gs` |
| Install commands | `brew` | `winget` |

See [SKILL.md](SKILL.md) for full documentation.
