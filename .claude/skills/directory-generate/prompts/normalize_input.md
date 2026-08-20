# Normalizeentityinput Prompt

**Model:** anthropic/claude-haiku-4-5-20251001

## System Prompt

_No system prompt_

## User Prompt

You are the entry point for a Functional/Longevity Medicine directory pipeline.

Your FIRST job is to detect the **content_type** — this determines how the entire pipeline behaves.

Your second job is to classify entities so downstream agents know whether to analyze "Biology" or "Software Architecture."

You receive messy, free-form text that could be:
- A request about ONE specific entity (vendor or clinic)
- A request for a category roundup (e.g., "Best CGM platforms in 2025")
- A request for a head-to-head comparison (e.g., "Levels vs Nutrisense")
- A request for an approach comparison (e.g., "Top 10 longevity clinics" - categorized by approach, not ranked)
- A request for a category analysis (e.g., "State of metabolic health monitoring")

You MUST return a single valid JSON object and NOTHING else.
Long-form narrative fields should be Markdown.

----------------
INPUT
----------------

Raw input text (Markdown):

{{ input_693b6d4f9e0a691542b8d81b.text }}

----------------
TASK
----------------

**STEP 1: DETECT CONTENT TYPE (CRITICAL - DO THIS FIRST)**

Analyze the input and classify into ONE of these content types:

1. **"single_entity"** (DEFAULT): Input is about ONE specific entity.
   - Signals: A company name, product name, clinic name, or clear single subject.
   - Examples: "Tell me about Levels Health", "Analyze the Prenuvo full-body MRI", "Lifeforce review".

2. **"category_roundup"** (PREFERRED FOR "BEST X" QUERIES): Input asks for an overview of multiple entities in a category.
   - Signals: "roundup", "overview", "landscape", "options", "what's out there", "best [category]", "top [category]", "what are my options".
   - Examples: "Best microbiome tests 2025", "What are the best longevity clinics?", "Overview of peptide vendors", "Best CGM platforms", "Top CGM options".
   - NOTE: "Best X" or "Top X" WITHOUT explicit ranking language defaults to category_roundup, which provides a comprehensive article.

3. **"head_to_head"**: Input explicitly compares TWO specific entities.
   - Signals: "vs", "versus", "compared to", "or", "[Entity A] vs [Entity B]".
   - Examples: "Levels vs Nutrisense", "Compare Prenuvo and SimonMed", "Should I choose InsideTracker or Function Health?".

4. **"approach_comparison"**: Input asks for multiple entities to be compared or grouped.
   - Signals: "rankings", "ranked", "tier list", "top 10", "compare all", "options compared".
   - Examples: "Top 10 longevity clinics", "Tier list of CGM apps", "Compare the best peptide vendors", "What are the different microbiome test approaches".
   - NOTE: This produces a NON-HIERARCHICAL comparison that groups entities by APPROACH (Evidence-Established, Innovation-Forward, Value-Optimized, Specialized) rather than ranking them. All approaches are presented as equally valid for different practice needs.

5. **"category_analysis"**: Input asks for category trends/analysis WITHOUT rankings.
   - Signals: "state of", "trends in", "analysis", "market", "industry".
   - Examples: "State of metabolic health monitoring", "Longevity industry trends 2025", "Analysis of at-home testing market".

**STEP 2: EXTRACT ENTITIES AND CATEGORY**

Based on content_type:

- **single_entity**: Extract the ONE entity mentioned.
- **head_to_head**: Extract BOTH entities being compared.
- **category_roundup / approach_comparison**: Identify the category, and list any specific entities mentioned.
- **category_analysis**: Identify the category being analyzed.

**STEP 3: FOR SINGLE_ENTITY ONLY - DETAILED CLASSIFICATION**

If content_type is "single_entity", perform the full entity classification:

A. Infer whether this is most likely a **vendor** or a **clinic**:
   - "vendor" = company that supplies tools, diagnostics, platforms, programs, or services to clinics/patients.
   - "clinic" = care-delivery organization (in-person or virtual) seeing patients directly.

B. Classify the `mechanism_type` (CRITICAL for routing):

   - **"Biological"**: Supplements, drugs, peptides, hardware that affects biology (red light therapy, saunas, PEMF), diagnostics measuring biological markers, lab testing companies.
     - Key signal: The product/service directly interacts with human physiology.
   
   - **"Technological"**: EMRs, software platforms, AI tools, practice management systems, scheduling software, patient engagement platforms.
     - Key signal: The product is primarily software that improves clinic operations or data management.
   
   - **"Service"**: Clinics, coaching programs, consulting services (human-driven delivery).
     - Key signal: The value is delivered primarily through human expertise and care.
   
   - **"Hybrid"**: A tech platform that delivers a biological intervention (e.g., CGM + coaching app, wearable + health program).
     - Key signal: Technology AND biology are both core to the value proposition.

C. Create `entity_core` with full metadata.

D. Create `entity_context_markdown` summary.

E. Generate `research_queries` for downstream agents.

**STEP 4: FOR MULTI-ENTITY TYPES - CATEGORY CLASSIFICATION**

If content_type is "category_roundup", "head_to_head", "approach_comparison", or "category_analysis":

A. Determine the `category_mechanism_type`:
   - "Biological" - Category involves biological interventions (CGMs, supplements, diagnostics)
   - "Technological" - Category involves software/platforms (EMRs, practice management)
   - "Service" - Category involves care delivery (clinics, coaching)
   - "Hybrid" - Category involves tech + biology combined

B. Generate `category_research_queries` for researching the entire category.

C. If specific entities are mentioned, list them in `entities_mentioned`.

----------------
OUTPUT FORMAT
----------------

Return EXACTLY this JSON shape (fill in based on content_type):

{
  "content_type": "<\"single_entity\" | \"category_roundup\" | \"head_to_head\" | \"approach_comparison\" | \"category_analysis\">",
  "category_focus": "<string describing the category, or null for single_entity>",
  "entities_mentioned": ["<entity name 1>", "<entity name 2>", "..."],
  "comparison_focus": "<what dimensions to compare by for approach_comparison, or null>",
  "year_context": "<year mentioned, e.g. '2025', or null>",
  
  "entity_type": "<\"vendor\" | \"clinic\" | \"mixed\" | null>",
  "mechanism_type": "<\"Biological\" | \"Technological\" | \"Service\" | \"Hybrid\" | null>",
  
  "entity_core": {
    "name": "<string or null - for single_entity>",
    "website_url": "<string or null>",
    "category_guess": "<short phrase or null>",
    "entity_subtype_guess": "<short phrase or null>",
    "geographies_guess": ["<string>", "..."],
    "practice_models_guess": ["<string>", "..."]
  },
  
  "entity_context_markdown": "## Entity context\n...\n<for single_entity, describe the entity; for multi-entity, describe the category/comparison>",
  
  "research_queries": {
    "mechanism_queries": ["<string>", "..."],
    "evidence_queries": ["<string>", "..."],
    "transcript_queries": ["<string>", "..."]
  }
}

----------------
QUERY GENERATION GUIDELINES
----------------

**For single_entity:**

- `mechanism_queries`: 3-5 queries for The Architect (First Principles analysis).
  - Focus on "HOW it works" — the theory, the mechanism, the logic.
  - **If Biological:** "mechanism of action [entity/ingredient]", "[ingredient] metabolic pathways", "biochemistry of [intervention]", "[device] physiological effects", "[entity] biological mechanism".
  - **If Technological:** "[entity] software architecture", "[entity] data flow", "[entity] algorithm", "[entity] workflow automation logic", "how [entity] works technically".
  - **If Service:** "[entity] care model", "[entity] treatment protocol", "[entity] clinical approach philosophy".
  - **If Hybrid:** Include BOTH biological mechanism AND technological architecture queries.

- `evidence_queries`: 3-5 queries for The Auditor (Evidence analysis).
  - Focus on "PROOF" — the data, the validation, the regulatory status.
  - **If Biological:** "[entity] clinical trials", "[entity] pubmed", "[entity] FDA status", "[ingredient] human studies sample size", "[entity] safety data".
  - **If Technological:** "[entity] case studies ROI", "[entity] SOC2 HIPAA compliance", "[entity] user reviews G2 Capterra", "[entity] integration problems", "[entity] customer testimonials metrics".
  - **If Service:** "[entity] patient outcomes", "[entity] physician credentials", "[entity] accreditation", "[entity] treatment results data".
  - **If Hybrid:** Include BOTH biological evidence AND technology validation queries.

- `transcript_queries`: 3-5 queries for the Knowledge Base search.
  - Include the entity name, category words, and similar entities where you can infer them.
  - Focus on what the curator might have discussed about this type of entity.

**For category_roundup / approach_comparison:**

- `mechanism_queries`: Focus on how the CATEGORY works in general.
  - "how [category] technology works", "[category] mechanism of action", "[category] approaches comparison".

- `evidence_queries`: Focus on evidence across the category.
  - "best [category] 2025 comparison", "[category] clinical evidence meta-analysis", "[category] pricing comparison", "top [category] reviews".

- `transcript_queries`: Focus on category-level discussions.
  - "[category] landscape", "best [category] recommendations", "[category] trends".

**For head_to_head:**

- `mechanism_queries`: Include queries for BOTH entities.
  - "[Entity A] mechanism of action", "[Entity B] mechanism of action", "[Entity A] vs [Entity B] how they differ".

- `evidence_queries`: Include evidence queries for BOTH entities.
  - "[Entity A] clinical trials", "[Entity B] clinical trials", "[Entity A] vs [Entity B] comparison", "[Entity A] pricing", "[Entity B] pricing".

- `transcript_queries`: Include transcript queries for BOTH entities and their comparison.
  - "[Entity A] review", "[Entity B] review", "[Entity A] vs [Entity B]".

**For category_analysis:**

- `mechanism_queries`: Focus on category mechanisms and trends.
  - "how [category] works", "[category] technology trends", "[category] emerging approaches".

- `evidence_queries`: Focus on category-level evidence and market data.
  - "[category] market size", "[category] efficacy studies", "[category] regulatory landscape".

- `transcript_queries`: Focus on industry insights.
  - "[category] industry trends", "[category] future outlook", "[category] challenges".

----------------
EXAMPLES
----------------

**Example 1: single_entity**
Input: "Tell me about Levels Health - they make CGM-based metabolic health products"
Output:
{
  "content_type": "single_entity",
  "category_focus": null,
  "entities_mentioned": ["Levels Health"],
  "ranking_criteria": null,
  "year_context": null,
  "entity_type": "vendor",
  "mechanism_type": "Hybrid",
  "entity_core": {
    "name": "Levels Health",
    "website_url": null,
    "category_guess": "CGM-based metabolic health program",
    ...
  },
  ...
}

**Example 2: head_to_head**
Input: "Levels vs Nutrisense - which is better?"
Output:
{
  "content_type": "head_to_head",
  "category_focus": "CGM-based metabolic health platforms",
  "entities_mentioned": ["Levels", "Nutrisense"],
  "ranking_criteria": null,
  "year_context": null,
  "entity_type": "vendor",
  "mechanism_type": "Hybrid",
  "entity_core": {
    "name": null,
    ...
  },
  ...
}

**Example 3: approach_comparison**
Input: "Top 10 longevity clinics 2025 ranked"
Output:
{
  "content_type": "approach_comparison",
  "category_focus": "longevity clinics",
  "entities_mentioned": [],
  "comparison_focus": "methodology, pricing, target patient population",
  "year_context": "2025",
  "entity_type": "clinic",
  "mechanism_type": "Service",
  ...
}
Note: Even though user said "ranked", we use approach_comparison which groups entities by approach (Evidence-Established, Innovation-Forward, Value-Optimized, Specialized) rather than hierarchical rankings.

**Example 4: category_roundup (DEFAULT for "best X" queries)**
Input: "Best microbiome tests 2025"
Output:
{
  "content_type": "category_roundup",
  "category_focus": "microbiome tests",
  "entities_mentioned": [],
  "ranking_criteria": null,
  "year_context": "2025",
  "entity_type": "vendor",
  "mechanism_type": "Biological",
  ...
}
Note: This is category_roundup (not approach_comparison) because the user is asking for "best" options without explicitly requesting comparisons or groupings.

----------------
RULES
----------------

- Use double quotes for all JSON keys and string values.
- Do not add any keys beyond those specified.
- If you lack information for a field, use null or an empty list.
- `content_type` is REQUIRED and must be one of the five options.
- `mechanism_type` is REQUIRED (for single_entity) or should be the dominant mechanism for the category (for multi-entity types).
- Be conservative. If something is not clearly supported, set it to null or an empty list.

**CRITICAL CONTENT TYPE RULE:**
- "Best X" or "Top X" queries WITHOUT explicit comparison language → **category_roundup** (comprehensive article)
- "Top 10 X ranked" or "Compare X options" WITH explicit comparison request → **approach_comparison** (grouped by approach, NOT hierarchical rankings)
- When in doubt between category_roundup and approach_comparison, DEFAULT TO **category_roundup**.

**IMPORTANT:** The approach_comparison content type produces NON-HIERARCHICAL output. Entities are grouped by their approach (Evidence-Established, Innovation-Forward, Value-Optimized, Specialized) - all approaches are presented as equally valid for different practice needs. There are NO S/A/B/C tiers, NO rankings, NO "best" declarations.

