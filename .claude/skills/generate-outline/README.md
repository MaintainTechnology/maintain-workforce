# Generate Outline Skill

Generate course outlines with automatic PDF compression for large reference materials.

## Quick Start

```
/generate-outline "Cardiovascular Longevity" --materials "course materials/"
```

## What It Does

1. Collects all PDFs from the materials folder
2. Compresses large PDFs (>5MB) using Ghostscript
3. Uploads to VectorShift Course Outline Creator pipeline
4. Saves research dossier and structured outline

## Options

| Flag | Description |
|------|-------------|
| `--materials <folder>` | Folder containing PDF materials (required) |
| `--outline <file>` | Existing outline to revise |
| `--dry-run` | Preview without API calls |
| `--output <folder>` | Custom output folder |

## Output

Each run generates:
- `course_dossier.md` - Deep research from Perplexity
- `course_outline.md` - Structured 10-15 lecture curriculum

## Requirements

- Ghostscript for PDF compression: `brew install ghostscript`

See [SKILL.md](SKILL.md) for full documentation.
