# Signaling KB Builder - Architecture & Design Rationale

This document explains the architectural decisions, their rationale, and how to modify them in the future.

## Table of Contents

1. [Problem Analysis](#problem-analysis)
2. [Architectural Decisions](#architectural-decisions)
3. [Data Model Design](#data-model-design)
4. [Processing Pipeline Design](#processing-pipeline-design)
5. [Conflict Handling Design](#conflict-handling-design)
6. [Future Modification Guide](#future-modification-guide)

---

## Problem Analysis

### Evidence: Query Testing Results (2025-01-16)

We tested 6 representative queries against the existing VectorShift KB:

| Query | Expected Result | Actual Result | Diagnosis |
|-------|-----------------|---------------|-----------|
| Q1: "mTOR rapamycin dosing" | Rapamycin protocols | BAM-15, SLU content | Entity match, wrong compound |
| Q2: "IGF-1 low insulin resistance" | Diagnostic interpretation | How to RAISE IGF-1 | Intent mismatch |
| Q3: "thymosin alpha-1 dosing" | TA1 protocols | TB-500, BPC-157 content | Complete retrieval failure |
| Q4: "AMPK autophagy mitochondrial" | Pathway mechanisms | Correct content | SUCCESS (vocabulary matched) |
| Q5: "NLRP3 ketogenic neuroinflammation" | Inflammation pathways | Correct content | SUCCESS (vocabulary matched) |
| Q6: "GLP-1 semaglutide weight loss" | GLP-1 protocols | Partially correct | Mixed (entity found but tangential) |

### Root Cause Analysis

1. **Document-centric chunking:** Information about the same intervention is scattered across multiple document chunks. There's no single "rapamycin node" to query.

2. **No query intent classification:** The system doesn't distinguish between:
   - "How do I dose rapamycin?" (intervention query)
   - "What does low IGF-1 mean?" (interpretation query)
   - "How does AMPK activate autophagy?" (mechanism query)

3. **Entity mention ≠ topic relevance:** A chunk mentioning "mTOR" in a pathway list ranks highly for "mTOR dosing" even if the chunk is about a different compound.

4. **Existing structure is good but inaccessible:** The SIGNAL-10 axis structure, confidence levels, and evidence types ARE embedded in the documents. But semantic search can't leverage this structure for filtering.

### Success Pattern Identified

Queries 4 and 5 worked because query vocabulary matched the SIGNAL-10 axis terminology embedded in documents. This suggests the existing extraction schema is valuable - the problem is organization and retrieval, not extraction.

---

## Architectural Decisions

### Decision 1: Entity-Centric Organization

**Choice:** Organize by biological entity (intervention, pathway, biomarker) rather than by source document.

**Rationale:**
- Clinical queries target entities ("rapamycin dosing"), not documents ("TPC lecture 47")
- All information about an entity should be in one retrievable unit
- Enables direct lookup instead of semantic search for specific entities

**Alternative considered:** Enhanced metadata tagging on document chunks
- Rejected because semantic search still can't reliably distinguish "mentioned" vs "topic of"

**How to modify:** If we find entity fragmentation is still a problem, consider:
- Sub-entity nodes (e.g., `rapamycin-dosing.json`, `rapamycin-mechanisms.json`)
- Or larger aggregate nodes (e.g., `mtor-inhibitors.json` containing rapamycin, everolimus, etc.)

### Decision 2: LLM-Driven Pipeline (No Rule-Based Logic)

**Choice:** All decision-making steps use LLM calls. No Python fuzzy matching, regex parsing, or threshold-based conflict detection.

**Rationale:**
- Entity resolution requires semantic understanding ("sirolimus" = "rapamycin")
- Conflict detection requires understanding context ("acute" vs "chronic" effects)
- Rule-based systems are brittle and require constant maintenance
- LLMs can handle edge cases that rules miss

**Alternative considered:** Hybrid approach with rules for simple cases, LLM for complex
- Rejected because the boundary between "simple" and "complex" is itself complex
- Simpler to have one approach that handles all cases

**How to modify:** If LLM costs become prohibitive:
- Add caching layer for repeated entity resolution queries
- Batch similar extractions to reduce API calls
- Consider fine-tuned smaller model for entity resolution specifically

### Decision 3: Append-Only Merge Strategy

**Choice:** New facts are always appended, never overwritten. Even "duplicate" information is preserved with different source refs.

**Rationale:**
- Preserves provenance chain (which sources said what)
- Enables conflict detection (can't detect conflicts if you overwrite)
- Supports evidence aggregation (more sources = higher confidence)
- Avoids information loss

**Alternative considered:** Deduplication with canonical entries
- Rejected because "duplicates" may have subtle differences worth preserving
- Clinicians may want to see corroboration from multiple sources

**How to modify:** If storage becomes a concern:
- Add compaction step that merges truly identical entries
- Keep only most recent N entries per claim type
- Archive older entries to separate store

### Decision 4: Surface Both Positions in Conflicts

**Choice:** When sources disagree, both positions are preserved and surfaced. No ranking or resolution.

**Rationale:**
- Clinical decisions should be made by clinicians, not by the KB
- "Conflicts" may actually be complementary (different contexts, timeframes)
- Ranking implies certainty that may not exist
- User requirement: "Flag both positions, don't rank"

**Alternative considered:** Confidence-weighted position ranking
- Rejected per user requirement
- Also rejected because confidence scores are themselves uncertain

**How to modify:** If conflict volume becomes overwhelming:
- Add "resolved" status for conflicts reviewed by clinical expert
- Add "known complementary" status for conflicts that are contextual, not contradictory
- Consider UI for conflict triage

### Decision 5: Source Type, Not Source Name

**Choice:** Store source type ("expert_lecture") not specific source ("Huberman Episode 245").

**Rationale:**
- Peer-reviewed citations are verifiable; lecture claims are not
- Avoids authority bias toward specific lecturers
- Focus attention on evidence quality, not source reputation
- User requirement: "Do not include specific source names"

**Alternative considered:** Store both but display only type
- Rejected to avoid temptation to use names in outputs
- Simpler data model without unused fields

**How to modify:** If audit trail is needed:
- Store source identifier in separate `extraction-index.json`
- Can be recovered from extraction_ref but not exposed in node data

### Decision 6: SIGNAL-10 Axis Structure for Pathways

**Choice:** Organize pathway nodes following the existing SIGNAL-10 framework.

**Rationale:**
- Already embedded in existing lecture analyses
- Provides consistent taxonomy across sources
- Enables pathway traversal queries
- Query tests showed good retrieval when using axis vocabulary

**Alternative considered:** Gene Ontology or KEGG pathway organization
- Rejected because SIGNAL-10 is already the internal standard
- Would require re-extraction of all existing analyses

**How to modify:** If SIGNAL-10 proves insufficient:
- Add secondary pathway classification
- Create cross-reference mapping to external ontologies
- Consider hybrid structure with both

---

## Data Model Design

### Why JSON Files Instead of Database?

**Choice:** Store nodes as JSON files in `.signaling-kb/` directory.

**Rationale:**
- Simple to version control with git
- Easy to inspect and debug
- No database setup required
- Files can be directly uploaded to VectorShift
- Ralph-style architecture uses file-based state

**Alternative considered:** SQLite or PostgreSQL
- Rejected because:
  - Adds deployment complexity
  - Harder to inspect/debug
  - File-based works for expected scale (~100s of interventions)

**When to reconsider:**
- If node count exceeds ~10,000
- If query performance becomes slow
- If concurrent write access is needed

### Node Type Separation

**Choice:** Three primary node types: interventions, pathways, biomarkers.

**Rationale based on query pattern analysis:**

| Query Intent | Node Type | Example |
|--------------|-----------|---------|
| "How do I dose X?" | intervention | rapamycin.json |
| "What does biomarker Y mean?" | biomarker | igf1-patterns.json |
| "How does pathway Z work?" | pathway | mtor-signaling.json |

**Cross-references between types:**
- Interventions reference pathways they target
- Pathways reference interventions that modulate them
- Biomarkers reference pathways they indicate and interventions that affect them

### Schema Versioning

Each node type has a `schema_version` field (implicitly "1.0" if absent).

**Migration strategy:**
1. New fields are added with defaults
2. Removed fields are ignored (backward compatible reads)
3. Major schema changes increment version and require migration script

---

## Processing Pipeline Design

### Why Per-Transcript Processing?

**Choice:** Process transcripts one at a time, not in batch.

**Rationale:**
- Fresh LLM context per transcript (no cross-contamination)
- Can resume from failure
- Easier to debug specific extraction issues
- User can review progress incrementally

**Alternative considered:** Batch processing with shared context
- Rejected because:
  - Risk of context confusion
  - Harder to attribute errors to specific sources
  - All-or-nothing failure mode

### Pipeline Step Breakdown

```
STEP 1: EXTRACTION
├── Input: Transcript PDF/markdown
├── LLM call: Extract atomic facts
├── Output: List of facts with metadata
└── Quality gate: Completeness check

STEP 2: ENTITY RESOLUTION (per fact)
├── Input: Extracted entity name
├── LLM call: Match to existing or create new
├── Output: Entity ID
└── Quality gate: Confidence threshold

STEP 3: MERGE ASSESSMENT (per fact)
├── Input: Existing node + new fact
├── LLM call: Determine merge action
├── Output: append | skip | flag_conflict
└── Quality gate: None (LLM decides)

STEP 4: CONFLICT CHARACTERIZATION (if flagged)
├── Input: Conflicting claims
├── LLM call: Characterize conflict
├── Output: Conflict description
└── Quality gate: None (always preserve both)

STEP 5: ENRICHMENT (optional)
├── Input: Claim summary
├── External call: Perplexity search
├── LLM call: Extract citations
├── Output: Peer-reviewed citations
└── Quality gate: Citation validity check

STEP 6: NODE SYNTHESIS
├── Input: Existing node + all updates
├── LLM call: Produce updated JSON
├── Output: Complete node JSON
└── Quality gate: Schema validation

STEP 7: COMMIT
├── Input: Updated node JSON
├── Action: Write to file
├── Action: Update state
└── Action: Log processing
```

### Idempotency

Processing the same transcript twice should not create duplicates.

**Implementation:**
- Each extraction gets unique `extraction_ref`
- Before appending, check if extraction_ref already exists in node
- If exists, skip (already processed)

---

## Conflict Handling Design

### Conflict Detection Approach

**Not rule-based.** The LLM determines if claims conflict by considering:
- Semantic similarity of claims
- Directionality of effects
- Context differences
- Timeframe differences

### Conflict Characterization Template

```json
{
  "conflict_id": "unique_id",
  "topic": "human_readable_topic",
  "nature": "directional | numeric | contextual | evidence_grade",
  "truly_contradictory": true | false,
  "position_a": {
    "summary": "...",
    "detail": "...",
    "evidence_type": "...",
    "confidence": "..."
  },
  "position_b": {
    "summary": "...",
    "detail": "...",
    "evidence_type": "...",
    "confidence": "..."
  },
  "characterization": "LLM explanation of why these conflict or don't",
  "resolution_status": "unresolved",
  "flagged_for_review": true
}
```

### Conflict Lifecycle

```
DETECTED → CHARACTERIZED → [REVIEWED] → [RESOLVED]
   │            │              │            │
   │            │              │            └── Optional: Clinical expert marks as resolved
   │            │              │
   │            │              └── Optional: Expert reviews and adds notes
   │            │
   │            └── LLM describes nature of conflict
   │
   └── LLM flags potential conflict during merge
```

Most conflicts will stay in CHARACTERIZED state. This is intentional - resolution requires clinical judgment.

---

## Future Modification Guide

### Adding a New Node Type

1. Create schema in `schemas/new-type.json`
2. Add extraction rules to `prompts/extraction.md`
3. Create directory `.signaling-kb/new-type/`
4. Update entity resolution prompt to recognize new type
5. Update query classifier to handle new intent type

### Changing Extraction Prompt

1. Edit `prompts/extraction.md`
2. Test on 3-5 representative transcripts
3. Verify output matches expected schema
4. Process a batch and check for regressions

### Adding New Source Type

1. Add to source type enum in schema
2. Update extraction prompt to recognize source markers
3. No changes needed to node structure

### Changing Conflict Policy

1. Edit `prompts/conflict-characterization.md`
2. If changing from "surface both" to "rank":
   - Add ranking logic to prompt
   - Add `preferred_position` field to conflict schema
   - Update query response format

### Migrating to Database

1. Create database schema matching JSON structure
2. Write migration script to import existing nodes
3. Update commit step to write to database
4. Update query step to read from database
5. Consider keeping JSON export for VectorShift sync

### Adding UI

1. Create read API over `.signaling-kb/` directory
2. Implement node browser (list, search, detail)
3. Implement conflict review queue
4. Consider WebSocket for processing progress

---

## Appendix: Query Test Data

### Raw Query Results (2025-01-16)

Full query results that informed this architecture are documented in the conversation history. Summary:

**Query 1:** mTOR signaling rapamycin dosing
- Scores: 0.98-0.99
- Retrieved: BAM-15, SLU, 5-Amino-1MQ content
- Problem: Entity match on "mTOR" pulled wrong interventions

**Query 2:** IGF-1 low insulin resistance interpretation
- Scores: 0.99+
- Retrieved: GH + carnitine combo, GLP-1 non-responders
- Problem: Returned interventions, not interpretation

**Query 3:** thymosin alpha-1 TA1 immune modulation dosing
- Scores: 0.99+
- Retrieved: KLOW Blend, TB-500, BPC-157
- Problem: Complete miss - TA1 content exists but not retrieved

**Query 4:** AMPK autophagy mitochondrial biogenesis
- Scores: 0.99+
- Retrieved: Dr. Chris Palmer content, Huberman essentials
- Result: SUCCESS - vocabulary matched axis structure

**Query 5:** NLRP3 inflammasome ketogenic diet neuroinflammation
- Scores: 0.99+
- Retrieved: Axis 4 inflammation content correctly
- Result: SUCCESS - vocabulary matched axis structure

**Query 6:** GLP-1 agonist semaglutide appetite suppression weight loss
- Scores: 0.99+
- Retrieved: Mixed - some relevant, some tangential
- Result: PARTIAL - entity found but couldn't distinguish primary vs mentioned
