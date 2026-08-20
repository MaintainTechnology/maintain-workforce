# Generate Lectures and Render

Combines lecture generation with automatic preview system registration.

## Quick Start

```
/generate-lectures-and-render outline.md
```

## What It Does

1. Runs the VectorShift pipeline to generate lectures
2. Copies lecture JSON to physician course directory
3. Registers lectures in the TypeScript registry
4. Opens the first lecture in browser for immediate review
5. Prints URLs for remaining lectures

## Options

| Flag | Description |
|------|-------------|
| `<outline_path>` | Required: path to course outline |
| `--physician ID` | Physician ID (e.g., dr-john-smith) |
| `--course ID` | Course ID (e.g., metabolic-health) |
| `--dry-run` | Preview plan without executing |
| `--start N` | Start from lecture N |
| `--end N` | End at lecture N |
| `--materials PATH` | Custom materials folder |
| `--no-llm-parser` | Use regex parser |

## Preview URLs

After generation, lectures are available at:
```
http://localhost:3000/preview/courses/{physician-id}/{course-id}-{lecture-number}
```

## Examples

```bash
# Basic usage (prompts for physician/course)
/generate-lectures-and-render outline.md

# Pre-specify physician and course
/generate-lectures-and-render outline.md --physician dr-abid-husain --course advanced-cardio

# Dry run to preview
/generate-lectures-and-render outline.md --dry-run

# Generate specific range
/generate-lectures-and-render outline.md --start 2 --end 4
```

## Output

- JSON files: `content/physician-courses/{physician}/{course}/lecture-N.json`
- Registry: `content/physician-courses/registry.ts` (updated)
- Preview: First lecture auto-opens, rest printed as URLs

See [SKILL.md](SKILL.md) for full documentation.
