# Signaling KB Builder

Build and maintain an entity-centric cell signaling knowledge base from lecture transcripts.

## Overview

This skill transforms lecture transcript analyses into a queryable knowledge graph organized by biological entity (interventions, pathways, biomarkers) rather than by source document.

**Key Features:**
- LLM-driven extraction, entity resolution, and conflict detection
- Peer-reviewed literature enrichment via Perplexity
- Conflict preservation (surfaces both positions, doesn't rank)
- Source type attribution (not specific lecturer names)

## Quick Start

```bash
# Process a single transcript
/signaling-kb-builder process --source /path/to/transcript_analysis.pdf

# Process with literature enrichment
/signaling-kb-builder process --source /path/to/transcript.pdf --enrich

# Query the KB
/signaling-kb-builder query "rapamycin dosing for longevity"
```

## Directory Structure

```
.signaling-kb/
├── interventions/      # Compound/peptide/modality nodes
├── pathways/           # SIGNAL-10 axis pathway nodes
├── biomarkers/         # Biomarker interpretation nodes
├── sources/            # Extraction tracking (internal)
├── conflicts/          # Active conflict records
└── state/              # Processing state
```

## Documentation

- **[SKILL.md](SKILL.md)** - Full skill documentation and usage
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Design decisions and rationale
- **[schemas/](schemas/)** - JSON schemas for all node types
- **[prompts/](prompts/)** - LLM prompt templates
- **[examples/](examples/)** - Example nodes

## Key Design Principles

1. **Entity-centric, not document-centric** - All information about rapamycin is in `interventions/rapamycin.json`
2. **LLM-driven** - All decision steps use LLM calls, no rule-based logic
3. **Append-only** - New facts are appended, never overwritten
4. **Conflicts preserved** - Disagreements are characterized, not resolved
5. **Peer-reviewed citations prioritized** - Literature enrichment adds verifiable references

## Processing Pipeline

```
Transcript → Extract → Entity Match → Merge → Conflict Check → Enrich → Commit
               ↓           ↓            ↓           ↓              ↓
            (LLM)       (LLM)        (LLM)       (LLM)      (Perplexity+LLM)
```

## Example Query Response

**Query:** "rapamycin dosing for longevity"

```json
{
  "intent": "intervention_dosing",
  "node": "interventions/rapamycin.json",
  "dosing_protocols": [
    {
      "dose": "5-6mg weekly",
      "indication": "longevity/healthspan",
      "evidence_grade": "moderate",
      "source_type": "expert_lecture",
      "peer_reviewed_citations": [
        "Mannick JB et al. (2014) Sci Transl Med"
      ]
    }
  ],
  "has_conflicts": true,
  "conflict_note": "5mg vs 6mg weekly - see conflicts for context"
}
```

## Version

0.1.0 - Initial architecture (2025-01-16)
