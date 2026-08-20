---
name: generate-outline-win
description: Windows-patched version of generate-outline. Generates a course outline with research dossier using the VectorShift pipeline. Automatically converts and compresses files before upload. Use on Windows machines where the original mac/linux runner path does not resolve.
user_invocable: true
allowed-tools: Read, Bash, Glob, Grep
---

# Course Outline Creator — Windows Patched

Generate a comprehensive course outline and research dossier from a topic and reference materials. Automatically converts non-PDF files (PPTX, DOCX, etc.) to PDF using LibreOffice, then compresses large PDFs (>5MB) using Ghostscript before uploading to VectorShift.

**This is the Windows-specific variant** of `generate-outline`. It points at the in-repo Python runner at [scripts/outline_creator_runner_win.py](../../../scripts/outline_creator_runner_win.py) and uses Windows-appropriate tool discovery (LibreOffice in `C:\Program Files\LibreOffice`, `gswin64c`/`gswin32c` for Ghostscript).

## Slash Command Usage

```
/generate-outline-win "<topic>" --materials <folder> [options]
```

**Examples:**
- `/generate-outline-win "Cardiovascular Longevity" --materials "course materials/"`
- `/generate-outline-win "Peptide Therapy Fundamentals" --materials "C:/path/to/materials/" --dry-run`
- `/generate-outline-win "Topic" --materials "./materials/" --outline existing_outline.md`

## Supported File Types

| Extension | Type | Processing |
|-----------|------|------------|
| `.pdf` | PDF | Compress only |
| `.pptx`, `.ppt` | PowerPoint | Convert to PDF, then compress |
| `.docx`, `.doc` | Word | Convert to PDF, then compress |
| `.xlsx`, `.xls` | Excel | Convert to PDF, then compress |
| `.odt` | OpenDocument Text | Convert to PDF, then compress |
| `.odp` | OpenDocument Presentation | Convert to PDF, then compress |
| `.ods` | OpenDocument Spreadsheet | Convert to PDF, then compress |

## Requirements (Windows)

| Tool | Install Command | Purpose |
|------|-----------------|---------|
| LibreOffice | `winget install TheDocumentFoundation.LibreOffice` | Convert PPTX, DOCX, etc. to PDF |
| Ghostscript | `winget install ArtifexSoftware.GhostScript` | Compress PDFs >5MB |
| Python 3 | already on PATH via `uv` | Runs the generator |

**Environment variable:** `VECTORSHIFT_API_KEY` must be present in the repo's `.env` file (already configured in this project).

## Execution Instructions

When this skill is invoked, execute the following steps:

1. **Parse arguments** from the skill invocation
2. **Run dry-run first** (unless user explicitly skipped) to show file sizes and processing plan
3. **Confirm with user** before making API calls (especially for large uploads)
4. **Execute the generator**:

```bash
uv run python scripts/outline_creator_runner_win.py \
    "{topic}" \
    --materials "{materials_folder}" \
    {--outline file if specified} \
    {--dry-run if specified} \
    {--output folder if specified}
```

Run from the repo root (`c:\Users\dalig\Desktop\ngm-website-official`).

## When to Use This Skill

Use this skill when the user:
- Is on **Windows** and wants to create a course outline from reference materials
- Has PowerPoint presentations, Word docs, or PDFs to process
- Has large files (>5MB) that need compression before upload
- Says "create an outline", "generate course outline", "build curriculum" on a Windows machine
- Invokes `/generate-outline-win`

**On macOS/Linux, use `/generate-outline` instead.**

## Pipeline Information

| Property | Value |
|----------|-------|
| Extractor Pipeline ID | `695fe21bfc432bac017b7f45` (File Insight Extractor) |
| Outline Pipeline ID | `695fe224fc432bac017b870e` (Course Outline Creator v5 Sequential) |
| Fallback Pipeline ID | `695fb4525cbca10bf6c2ac46` (Course Outline Creator v4 Parallel) |
| Runner Script | [scripts/outline_creator_runner_win.py](../../../scripts/outline_creator_runner_win.py) |

### Architecture

```
Files -> [Sequential Extraction Loop] -> Accumulated Insights -> [Outline Generator]
```

Phase 1 extracts insights from each file one at a time (more reliable than parallel for large sets, with progress visibility and natural rate-limit throttling). Phase 2 generates the outline from accumulated insights.

## Required Inputs

1. **Topic** - The course topic (text string)
2. **Materials folder** - Folder containing materials (PDF, PPTX, DOCX, etc.)
3. **Suggested outline** (optional) - Existing outline to revise

## Workflow

### Step 1: Gather Information

Ask the user for:
- Course topic (required)
- Path to materials folder (required)
- Existing outline file to revise (optional)
- Whether to do a dry run first (recommended for large files)

### Step 2: Run Dry Run

Always show a dry run first for large material sets:

```bash
uv run python scripts/outline_creator_runner_win.py \
    "{topic}" \
    --materials "{materials_folder}" \
    --dry-run
```

This shows:
- Total number of files found
- File sizes and what will happen to each (convert, compress, or both)
- Tool availability (LibreOffice, Ghostscript)

### Step 3: Execute Pipeline

After user confirmation:

```bash
uv run python scripts/outline_creator_runner_win.py \
    "{topic}" \
    --materials "{materials_folder}"
```

Options:
- `--outline <file>` - Existing outline to revise
- `--output <folder>` - Custom output folder
- `--extractor-pipeline-id <id>` - Override extractor pipeline ID
- `--outline-pipeline-id <id>` - Override outline pipeline ID

### Step 4: Report Results

After completion, show the user:
- Location of output files
- Duration
- Any errors or warnings

## Output Files

Generated files are saved to `outputs/outlines/{topic_name}/` at the repo root:

| File | Content |
|------|---------|
| `accumulated_insights.md` | Combined insights from all files (Phase 1 output) |
| `course_dossier.md` | Deep research dossier from Perplexity |
| `course_outline.md` | Structured 10-15 lecture curriculum |

## File Processing Pipeline

```
PPTX/DOCX/etc. --[LibreOffice]--> PDF --[Ghostscript]--> Compressed PDF --> Upload
     PDF -----------------------------[Ghostscript]--> Compressed PDF --> Upload
```

### Compression Stats

| Original Size | Typical Compressed Size |
|--------------|------------------------|
| 10MB | 3-5MB |
| 50MB | 10-20MB |
| 100MB | 20-40MB |

**Compression quality:** `ebook` (150dpi) - balances quality and size

## Windows-Specific Notes

- **LibreOffice path:** The runner auto-discovers `soffice.exe` in `C:\Program Files\LibreOffice\program\` and `C:\Program Files (x86)\LibreOffice\program\`. If you installed to a custom location, add it to PATH.
- **Ghostscript binary:** The runner tries `gswin64c`, `gswin32c`, then `gs` — all must be reachable via PATH. Winget-installed Ghostscript usually handles this automatically.
- **Env loading:** `VECTORSHIFT_API_KEY` is read from `.env` at the repo root. No need to export it manually in your shell.
- **Paths with spaces:** Quote material folder paths that contain spaces, e.g. `--materials "C:/Users/dalig/Desktop/course materials/"`.

## Error Handling

| Error | Action |
|-------|--------|
| Materials folder not found | Ask user for correct path |
| No supported files found | Warn and ask if they want to proceed |
| LibreOffice not found | Warn, skip conversion for non-PDFs |
| Ghostscript not found | Warn about large uploads, proceed without compression |
| `VECTORSHIFT_API_KEY` missing | Stop and tell user to check `.env` |
| API timeout | Retry 3x with 30s delay |
| API rate limit (429) | Wait and retry with backoff |

## Example Usage

**Via slash command:**
```
/generate-outline-win "Cardiovascular Longevity" --materials "course materials/"
/generate-outline-win "Topic" --materials "C:/materials/" --dry-run
/generate-outline-win "Topic" --materials "./materials/" --outline existing.md
```

**Via natural language:**

User: "I have a folder at 'course materials/' with PDFs and PowerPoints. Create an outline for a peptide therapy course."

Claude: First runs dry-run to show file analysis, confirms tools are available, then confirms with user before executing.

## Execution Notes

- Pipeline takes 10-20 minutes depending on material size (Phase 1 is ~30s per file, Phase 2 is 5-15 minutes)
- Non-PDF files are converted to PDF first (may take 1-2 min per large file)
- Large PDFs are compressed before upload to avoid timeouts
- Progress is displayed during polling
- Output folder is created automatically
- Existing outline file (if provided) will be used as a guide for revision
