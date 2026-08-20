# Signaling KB Manual - VA-Assisted Knowledge Base Builder

A cost-optimized variant of `/signaling-kb-builder` that uses a virtual assistant (VA) to perform Deep Research queries via Perplexity's web UI instead of the expensive API ($5/request).

## When to Use

Use this skill when:
- Processing large batches of transcripts where API costs would be prohibitive
- You have VA capacity available for manual query execution
- You want to maximize cost efficiency over processing speed

Use `/signaling-kb-builder` instead when:
- You need fully automated processing
- Processing small batches (< 10 queries)
- Speed is more important than cost

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SIGNALING-KB-MANUAL WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: EXTRACTION (Automatic - Claude Sonnet)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Transcript → Extract interventions, dosing protocols, mechanisms   │   │
│  │ Output: Intervention JSON files WITHOUT citations                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  PHASE 2: QUERY GENERATION (Automatic)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Scan KB for unenriched protocols/claims                             │   │
│  │   → Generate structured Deep Research queries                       │   │
│  │   → Create VA-friendly batch file                                   │   │
│  │ Output: .signaling-kb/pending-enrichment/batch-YYYYMMDD-HHMMSS.json │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  PHASE 3: VA EXECUTION (Manual - Web UI)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ VA opens batch file → Copy-paste each query into Perplexity web UI │   │
│  │ VA copies response (content + URLs) into results file              │   │
│  │ Output: .signaling-kb/completed-enrichment/batch-YYYYMMDD-HHMMSS.json│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  PHASE 4: ENRICHMENT MERGE (Automatic)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Parse VA results → Extract citations from URLs                      │   │
│  │ Match to intervention files → Update peer_reviewed_citations        │   │
│  │ Output: Updated intervention JSON files with citations              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Phase 1: Extract from Transcripts (No Enrichment)

```bash
# Process transcripts WITHOUT calling Perplexity API
python3 scripts/process_kb_transcripts_with_costs.py --skip-enrichment

# Or process specific transcripts
python3 scripts/process_kb_transcripts_with_costs.py \
  --transcript "path/to/transcript.txt" \
  --skip-enrichment
```

### Phase 2: Generate Enrichment Batch

```bash
# Scan KB for unenriched items and generate VA batch file
python3 scripts/generate_enrichment_batch.py

# Options:
#   --output FILE     Specify output file (default: auto-generated timestamp)
#   --limit N         Limit number of queries (useful for testing)
#   --intervention X  Generate queries for specific intervention only
```

### Phase 3: VA Executes Queries

Hand off the batch file to your VA. See **VA Instructions** section below.

### Phase 4: Merge Results

```bash
# After VA completes the batch file
python3 scripts/merge_enrichment_results.py \
  --input .signaling-kb/completed-enrichment/batch-YYYYMMDD-HHMMSS.json
```

---

## Batch File Format

The batch file is a JSON file optimized for:
- VA workflow (clear structure, incremental saves)
- VectorDB quality (preserves relationships)
- Future automation (machine-readable)

```json
{
  "batch_id": "batch-20260123-103000",
  "created_at": "2026-01-23T10:30:00Z",
  "status": "pending",
  "metadata": {
    "total_queries": 47,
    "estimated_va_time_minutes": 120
  },
  "instructions": "For each query: 1) Copy query_text to Perplexity Pro, 2) Paste full response into response_text, 3) List citation URLs in citation_urls array",
  "queries": [
    {
      "query_id": "DR-001",
      "status": "pending",
      "intervention": "rapamycin",
      "type": "dosing_protocol",
      "target_file": ".signaling-kb/interventions/rapamycin.json",
      "target_id": "rapamycin-longevity-weekly",
      "context": {
        "dose": "5-6mg",
        "frequency": "weekly",
        "indication": "longevity/healthspan"
      },
      "query_text": "Find peer-reviewed clinical studies on rapamycin dosing:\n- Dose: 5-6mg\n- Frequency: weekly\n- Indication: longevity/healthspan\n\nInclude mechanism of action, clinical trial data, and safety information.\nFocus on human studies. Include DOIs where available.",
      "response_text": null,
      "citation_urls": []
    }
  ]
}
```

---

## VA Instructions

Copy this section to your VA:

---

### Deep Research Batch Processing Instructions

**Setup:**
1. Open the JSON file in VS Code (or any text editor with JSON support)
2. Log into perplexity.ai with Pro account
3. Ensure "Deep Research" mode is enabled (toggle at top)

**For each query:**

1. Find the next query with `"status": "pending"`
2. Copy the `query_text` value (the text between quotes, not the quotes themselves)
3. Paste into Perplexity's search box and press Enter
4. Wait for Deep Research to complete (~2-3 minutes)
5. Copy the **ENTIRE** response text from Perplexity
6. In the JSON file, replace `null` in `"response_text": null` with the response (wrapped in quotes)
   - Escape any quotes in the response with `\"`
   - Or use triple-quotes if your editor supports it
7. Copy each citation URL shown at the bottom of Perplexity's response
8. Add URLs to the `"citation_urls"` array: `["https://...", "https://..."]`
9. Change `"status": "pending"` to `"status": "completed"`
10. **Save the file** (important for incremental progress!)
11. Move to the next query

**When finished:**
- Move the completed file to `.signaling-kb/completed-enrichment/`
- Notify for Phase 4 merge processing

**Tips:**
- Save after each query to avoid losing work
- If a query fails or times out, mark status as `"failed"` and add a note
- Take breaks as needed - progress is saved incrementally

---

## Directory Structure

```
.signaling-kb/
├── interventions/              # Intervention JSON files (shared with /signaling-kb-builder)
│   ├── rapamycin.json
│   ├── metformin.json
│   └── ...
├── pending-enrichment/         # Batch files awaiting VA processing
│   └── batch-20260123-103000.json
├── completed-enrichment/       # Completed batch files (archive)
│   └── batch-20260123-103000.json
└── cost-report.json           # Cost tracking (from /signaling-kb-builder)
```

---

## Cost Comparison

| Approach | 50 Queries | 200 Queries |
|----------|------------|-------------|
| API ($5/request) | $250 | $1,000 |
| **VA + Web UI** | ~$0 (Pro subscription) | ~$0 |
| VA time @ $15/hr | ~$40 (2.5 hrs) | ~$150 (10 hrs) |

**Net savings:** ~$210 for 50 queries, ~$850 for 200 queries

---

## Incremental Updates

When processing new transcripts that mention interventions already in the KB:

1. **Phase 1** detects new protocol_id/claim_id not in existing file
2. **Phase 2** only generates queries for NEW unenriched items
3. **Phase 4** updates only the new items, leaving existing enriched data unchanged

This allows incremental KB growth without re-enriching existing content.

---

## Troubleshooting

### JSON Syntax Errors After VA Edits

Common issues:
- Missing quotes around strings
- Unescaped quotes inside response text
- Missing commas between array items

**Fix:** Use a JSON validator (e.g., jsonlint.com) to find syntax errors

### Merge Script Can't Find Target

The `target_id` must exactly match a `protocol_id` or `claim_id` in the intervention file.

**Fix:** Check that the intervention file wasn't modified after batch generation

### Partial Batch Completion

The merge script processes only queries with `"status": "completed"`. Pending queries are skipped and can be completed later.

---

## Changelog

### 2026-01-23 - Initial Release
- Created `/signaling-kb-manual` skill as cost-optimized alternative to `/signaling-kb-builder`
- Implemented 4-phase VA-assisted workflow
- Added JSON batch format for VA handoff
- Created `generate_enrichment_batch.py` and `merge_enrichment_results.py` scripts
