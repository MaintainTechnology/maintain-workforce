# `/signaling-kb-batched` - Cloud Handoff

**Skill name:** `/signaling-kb-batched`

## Current State (2026-01-29)

| Metric | Value |
|--------|-------|
| **Transcripts synced** | 224 |
| **Processed** | 158 (71%) |
| **Pending** | 66 |
| **Failed** | 0 |
| **Total cost** | $248.00 |

### Entity Counts

| Entity Type | Files Created |
|-------------|---------------|
| Interventions | 580 |
| Pathways | 207 |
| Biomarkers | 239 |
| Conflicts | 576 |

## What's Been Done

1. **Full 4-entity extraction pipeline** implemented:
   - `scripts/extract_kb_openrouter.py` - Extracts interventions, pathways, biomarkers, and conflicts
   - Three-stage LLM pipeline: Extraction → Semantic Dedup → LLM Merge

2. **224 transcripts synced** from Google Drive folder (ID in sync script)
   - All subfolders included (recursive)
   - Stored in `data/gdrive-transcripts/`
   - Includes Mastermind sessions, Peptide World Congress 2022, SSRP Institute days

3. **LLM-based semantic deduplication** (Opus 4.5):
   - Maps aliases like "Sirolimus" → "rapamycin"
   - Prevents duplicate entities

4. **LLM-based intelligent merging** (Haiku 4.5):
   - Merges new data into existing entities
   - Preserves all existing information
   - Deduplicates protocols and claims

5. **Configuration**:
   - 64,000 max_tokens for all operations
   - Claude Opus 4.5 for extraction
   - Claude Haiku 4.5 for merge operations

## To Continue Extraction

```bash
# Check current status
python3 scripts/extract_kb_openrouter.py --status

# Run extraction (resumes from tracker - 66 pending)
# Ensure OPENROUTER env var is set, then run:
python3 scripts/extract_kb_openrouter.py --from-tracker

# For background execution (recommended for 66 files):
nohup python3 scripts/extract_kb_openrouter.py --from-tracker > extraction.log 2>&1 &

# With auto-restart monitor:
nohup bash scripts/monitor_extraction.sh > monitor.log 2>&1 &
```

## Estimated Remaining

- **66 transcripts** pending
- **~$80-100** additional cost
- **~3-4 hours** runtime

## Key Files

| File | Purpose |
|------|---------|
| `scripts/extract_kb_openrouter.py` | Main extraction script (3-stage LLM pipeline) |
| `scripts/sync_gdrive_transcripts.py` | Google Drive sync with tracking |
| `scripts/monitor_extraction.sh` | Auto-restart monitor for long runs |
| `.signaling-kb/state/processing-tracker.json` | Tracks processed vs pending |
| `.signaling-kb/interventions/*.json` | Intervention entity nodes (580) |
| `.signaling-kb/pathways/*.json` | Pathway entity nodes (207) |
| `.signaling-kb/biomarkers/*.json` | Biomarker entity nodes (239) |
| `.signaling-kb/conflicts/*.json` | Conflict entity nodes (576) |
| `.env` | Environment variables |

## Output Examples

### Intervention
```json
{
  "intervention_id": "rapamycin",
  "aliases": ["sirolimus"],
  "category": "small_molecule",
  "dosing_protocols": [{
    "indication": "longevity",
    "dose": "5-6mg",
    "frequency": "weekly",
    "source_type": "expert_lecture",
    "peer_reviewed_citations": [{"pmid": "24566879", "title": "..."}],
    "confidence": "moderate"
  }],
  "mechanism_claims": [{
    "target": "MTORC1",
    "effect": "inhibit",
    "confidence": "high"
  }]
}
```

### Pathway
```json
{
  "pathway_id": "mtor-signaling",
  "pathway_name": "mTOR Signaling",
  "axis": 1,
  "core_nodes": ["MTOR", "RPTOR", "RICTOR"],
  "upstream_triggers": ["amino acids", "insulin"],
  "downstream_effects": ["protein synthesis"],
  "interventions_targeting": [
    {"intervention_name": "rapamycin", "effect": "inhibit"}
  ]
}
```

### Biomarker
```json
{
  "biomarker_id": "igf-1",
  "interpretation_patterns": [{
    "biomarker_state": {"igf1": "low"},
    "interpretation": "May suggest GH deficiency",
    "clinical_implications": "Consider GH evaluation"
  }],
  "optimal_ranges_by_context": [{
    "context": "longevity",
    "optimal": {"low": 150, "high": 250}
  }]
}
```

## After Extraction Completes

1. **Commit the KB data**:
   ```bash
   git add .signaling-kb/
   git commit -m "feat: complete signaling KB extraction - 224 transcripts, 4 entity types"
   ```

2. **Optional gap enrichment** for claims missing citations:
   ```bash
   python3 scripts/enrich_kb_batched.py --dry-run
   # Ensure env var is set, then:
   python3 scripts/enrich_kb_batched.py --execute
   ```

## Architecture Summary

```
Transcript → [Opus 4.5 Extraction] → Raw Entities
                                           ↓
                    [Opus 4.5 Semantic Dedup] → Mapped to existing
                                           ↓
                       [Haiku 4.5 LLM Merge] → Updated KB files
```

All operations use 64k max_tokens. Source-agnostic output with PMID/DOI citations only.
