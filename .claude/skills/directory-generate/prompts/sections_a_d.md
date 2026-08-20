# Directorypageentity Atod Prompt

**Model:** anthropic/claude-opus-4-5-20251101

## System Prompt

_No system prompt_

## User Prompt

You are the EDITOR-IN-CHIEF of the "Next Generation Medicine" Directory.

You are writing a COMPREHENSIVE, IN-DEPTH article that serves as the definitive resource on this topic. Your content will be consumed by ChatGPT, Perplexity, Claude, and Google AI Overviews—but it must ALSO be genuinely useful and educational for human readers.

**CRITICAL PHILOSOPHY:**
- You are EDUCATING readers, not RANKING products
- Present all options neutrally without declaring winners
- Use "Notable for" instead of "Best for"
- Focus on differences and fit, not quality judgments
- Let readers make their own informed decisions

**DEPTH REQUIREMENTS (CRITICAL):**
- This is NOT a surface-level overview—it's a substantive educational resource
- Readers should finish this article feeling genuinely informed, not just aware
- Include detailed mechanistic explanations from the Architect's Report
- Include specific study details, citations, and evidence documentation from the Auditor's Report
- Don't just list facts—EXPLAIN them. Why does this matter? What's the underlying logic?
- Aim for 3,000-5,000 words of substantive content (varies by content_type)

**CRITICAL:** Your output structure depends entirely on `content_type`:
- **single_entity**: Deep entity profile (3,000-4,000 words)
- **category_roundup**: Comprehensive category guide (4,000-5,000 words)
- **approach_comparison**: Entities categorized by approach - non-hierarchical (4,000-5,000 words)
- **head_to_head**: Thorough two-entity comparison (3,000-4,000 words)
- **category_analysis**: In-depth category trends analysis (3,000-4,000 words)

Your inputs are:
1. The "Architect's Report" (Theory from First Principles analysis) — USE THIS EXTENSIVELY
2. The "Auditor's Report" (Evidence Documentation + Quantitative Metrics) — CITE SPECIFIC STUDIES
3. The "Curator's Perspective" (Industry insights from transcript synthesis)
4. The "Comparison Analysis" (How entities compare to alternatives)
5. The "Industry Insights" (Generalizable learnings from the field)

You MUST return a single valid JSON object and NOTHING else.

----------------
INPUTS
----------------

Full JSON from NormalizeEntityInput:

{{ llm_693b6d4f9e0a691542b8d81d.response }}

Full JSON from FirstPrinciples_Mechanism (The Architect):

{{ llm_693b6d4f9e0a691542b8d81e.response }}

Full JSON from Evidence_Auditor (The Researcher):

{{ llm_693b6d4f9e0a691542b8d81f.response }}

Full JSON from TranscriptPerspectiveEntity_Summary (The Curator):

{{ llm_693b6d4f9e0a691542b8d823.response }}

Full JSON from CompetitiveComparison:

{{ llm_693b6d4f9e0a691542b8d824.response }}

Full JSON from IndustryInsights:

{{ llm_693b6d4f9e0a691542b8d822.response }}

----------------
AEO OPTIMIZATION PRINCIPLES (Apply to ALL content types)
----------------

1. **Front-load direct answers** - Put the core answer in the first 40-60 words
2. **Use specific numbers** - "$299/month" not "$$", "500+ clinics" not "many users"
3. **Structure for extraction** - Tables, bullet lists, clear Q&A format
4. **Answer common questions** - Include explicit FAQ section
5. **Provide comparisons** - Help readers understand differences (not rankings)

----------------
NEUTRALITY PRINCIPLES (CRITICAL)
----------------

1. **No ranking language** - Avoid "best", "top", "leading", "worst", "weakest"
2. **No winner declarations** - No "Top Pick", "Editor's Choice", "Our Recommendation"
3. **Use "Notable for"** - Instead of "Best for X", use "Notable for X"
4. **Describe, don't rate** - Evidence profiles describe what exists, not quality ratings
5. **Equal treatment** - All entities get comparable depth and neutral framing
6. **Let readers decide** - Present information, don't make the decision for them

----------------
TASK
----------------

**STEP 1: IDENTIFY CONTENT TYPE**

Parse `content_type` from NormalizeEntityInput.

**STEP 2: GENERATE APPROPRIATE OUTPUT**

Follow the section structure for your content_type below.

================================================================================
================================================================================
FOR SINGLE_ENTITY: ENTITY PROFILE
================================================================================
================================================================================

Use this structure when `content_type` = "single_entity".

----------------
Section A – The Snapshot
----------------

Variable name: section_A_markdown

**1. Quick Facts Table**
```
### Quick Facts

| Attribute | Value |
|-----------|-------|
| **Pricing** | [Actual pricing, e.g., "$299/month (Pro), $149/month (Basic)"] |
| **Founded** | [Year] |
| **Headquarters** | [Location] |
| **Users/Clinics** | [Count] |
| **Published Research** | [Descriptive - e.g., "2 RCTs, 3 observational studies"] |
| **Regulatory Status** | [FDA status, CE marking, etc.] |
| **Availability** | [Geographic + delivery model] |
```

**2. The Hook** - Educational opening sentence from first_principles
**3. Entity Header** - "## [Entity Name]"
**4. The Tagline** - One italic sentence describing what this entity does
**5. Quick Take** - Direct answer: "[Entity] is designed for [use case]..."
**6. Badge Row** - Methodology • Regulatory Status • Integration • Price
**7. Who This Is Designed For** - 3-7 bullets

----------------
Section B – Clinical Signal
----------------

Variable name: section_B_markdown

**1. "# B. Clinical Signal"**
**2. Direct Answer** - "### What does [Entity] do?" with 2-3 sentence answer
**3. The Primer** - "### The Primer: How It Works" from first_principles_markdown
**4. The Evidence Landscape** - "### The Evidence Landscape" from evidence_markdown (descriptive, not rated)
**5. The Gap** - "### Theory vs. Reality: What's Known and Unknown"
**6. Clinical Considerations** - 3-7 bullets
**7. Clinical Pearls** - 3-10 practical bullets
**8. Industry Learnings** - From industry_insights

----------------
Section C – Operational Fit
----------------

Variable name: section_C_markdown

**1. "# C. Operational Fit"**
**2. Pricing** - "### What does [Entity] cost?" with specific numbers
**3. Comparison** - "### How does [Entity] differ from alternatives?" with feature table (no "Winner" column)
**4. Practice Types This Serves** - 3-7 bullets
**5. Workflow Placement**
**6. Staffing & Skills**
**7. Data & Interoperability**
**8. Integration Effort**
**9. Pilot Playbook** - 3-7 bullets

----------------
Section D – Strategic Context + FAQ
----------------

Variable name: section_D_markdown

**1. "# D. Strategic Context"**
**2. Category & Peers**
**3. What Distinguishes This Entity**
**4. Designed For Scenarios**
**5. Important Considerations**
**6. Implementation Considerations**
**7. NGM Perspective** - Curator's view
**8. FAQ** - 6+ Q&A pairs:
   - What is [Entity]?
   - How much does [Entity] cost?
   - How does [Entity] differ from alternatives?
   - Who is [Entity] designed for?
   - What research exists for [Entity]?
   - What is [Entity]'s regulatory status?

================================================================================
================================================================================
FOR CATEGORY_ROUNDUP: CATEGORY OVERVIEW
================================================================================
================================================================================

Use this structure when `content_type` = "category_roundup".

----------------
Section A – Category Overview (AIM FOR 800-1200 WORDS)
----------------

Variable name: section_A_markdown

```
### Quick Category Stats

| Metric | Value |
|--------|-------|
| **Entities Covered** | [N] |
| **Price Range** | [$X - $Y per month/year] |
| **Methodologies** | [List of different approaches] |
| **Category Type** | [Biological/Technological/Service/Hybrid] |
| **Geographic Focus** | [Regions] |

## [Category Name]: A Comprehensive Guide [Year if applicable]

*Understanding [N] [category] options—the science, the differences, and finding the right fit.*

### Overview
[4-6 paragraphs providing genuine insight:
- Paragraph 1: What is this category? Define it clearly for someone unfamiliar.
- Paragraph 2: Why does this category exist? What problem does it solve? What need does it address?
- Paragraph 3: Current state of the category (market maturity, adoption, key trends)
- Paragraph 4: What the underlying science/technology enables (draw from Architect's Report)
- Paragraph 5-6: Why this matters for patients/practitioners - the practical significance]

### Understanding the Methodologies

**CRITICAL: Pull extensively from the Architect's Report (first_principles_response)**
**CRITICAL: Present all methodologies as equally valid choices for different needs**

[This section should be 600-1000 words explaining the different methodological approaches in this category.

For EACH methodology (typically 3-5), include:

#### [Methodology 1 Name] (e.g., "16S rRNA Sequencing")

**What it measures:** [Technical description]

**How it works:** [Mechanism explanation]

**What it CAN tell you:**
- [Capability 1]
- [Capability 2]
- [Capability 3]

**What it CANNOT tell you:**
- [Limitation 1]
- [Limitation 2]

**When it's most useful:** [Use cases - NOT "best for"]

**Typical price range:** [Range]

**Analogy:** "[Memorable analogy from Architect's Report]"

---

#### [Methodology 2 Name]
[Same structure]

---

#### [Methodology 3 Name]
[Same structure]

The reader should finish this section understanding the methodologies well enough to ask intelligent questions.]

### At a Glance
There are [N] options in [Category]. Here's how they differ.
```

----------------
Section B – All Players (AIM FOR 1500-2500 WORDS TOTAL)
----------------

Variable name: section_B_markdown

```
# B. The Options: In-Depth Profiles

[For EACH entity from entities_documented, create a substantive profile:]

### [Entity 1 Name]

**Quick Stats:**
| Metric | Value |
|--------|-------|
| Methodology | [Specific approach] |
| Published Research | [Descriptive - e.g., "2 RCTs (n=500), FDA cleared"] |
| Pricing | [Actual amount] |
| Scale | [Users] |
| Founded | [Year] |

**What They Offer:**
[4-6 sentences providing genuine insight into what this entity does, how it works, and what makes it different. Don't just say "they offer microbiome testing" - explain their specific approach, methodology, and value proposition.]

**The Evidence:**
[2-3 sentences describing what research exists for this entity. Cite specific studies where available. Be factual, not evaluative.]

**Designed For:**
[Specific practice types and use cases this entity serves]

**Notable For:**
- [Distinguishing feature 1 with brief explanation]
- [Distinguishing feature 2 with brief explanation]

**Considerations:**
- [Consideration 1 - factual, not negative]
- [Consideration 2]

**Summary:**
[1-2 sentence neutral summary of this option]

---

### [Entity 2 Name]
[Same structure - aim for 200-400 words per entity]

[Repeat for all entities, typically 5-10. Total section should be comprehensive enough that someone could make an informed decision based on these profiles alone.]
```

----------------
Section C – Comparison & Decision Guide
----------------

Variable name: section_C_markdown

```
# C. How They Differ

### Full Feature Comparison

| Entity | Methodology | Published Research | Pricing | Designed For |
|--------|-------------|-------------------|---------|--------------|
| [Name] | [Approach] | [Descriptive] | [Price] | [Practice types] |
[All entities]

### Methodology-Price Overview

| Methodology | Entities | Price Range | What It Measures |
|-------------|----------|-------------|------------------|
| [16S rRNA] | [Entity A, Entity B] | [$X-$Y] | [Brief description] |
| [Shotgun] | [Entity C, Entity D] | [$X-$Y] | [Brief description] |
| [Metatranscriptomics] | [Entity E] | [$X-$Y] | [Brief description] |

### Practice Fit Guide

**High-volume practices:**
- [Entities] - designed for throughput and scale

**Research-focused practices:**
- [Entities] - extensive documentation and clinical protocols

**Budget-conscious practices:**
- [Entities] - accessible pricing starting at [price]

**Boutique/Concierge practices:**
- [Entities] - premium service models

### How to Choose

Consider your practice needs:
- **Prioritize throughput?** Consider [entities] - designed for scale
- **Prioritize depth?** Consider [entities] - extensive analysis
- **Prioritize affordability?** Consider [entities] - accessible pricing
- **Prioritize cutting-edge methodology?** Consider [entities] - innovative approaches
```

----------------
Section D – Strategic Context + FAQ
----------------

Variable name: section_D_markdown

```
# D. Category Insights

### Category Trends
[What's changing in this space - cite market reports or announcements with [n]]

### What to Look For
[Buying guide - key criteria when evaluating - framed as considerations, not rankings]

### Common Pitfalls
[What to avoid - educational, not judgmental]

### NGM Perspective
[Curator's view on the category]

### Frequently Asked Questions

**Q: What are the options for [Category] in [Year]?**
A: There are [N] options in this category using different methodological approaches. [Brief overview of the landscape without declaring winners.]

**Q: How much does [Category] cost?**
A: Prices range from [low][n] to [high][n]. [Context on what drives pricing differences - methodology, depth, etc.]

**Q: What different methodologies exist in [Category]?**
A: The main methodological approaches are [list]. [Brief explanation of differences without ranking.]

**Q: How do I choose between [Category] options?**
A: Consider your practice type and needs. [Decision framework based on practice fit, not quality ranking]

**Q: What research exists for [Category]?**
A: Research varies by entity. [Factual descriptions of what research exists for different entities.]

**Q: Which [Category] is most affordable?**
A: [Entity] offers accessible pricing at [price][n], designed for [practice type].

### Sources & References

[1] [Author/Source]. "[Title]." [Publication], [Year]. [URL]
[2] [Author/Source]. "[Title]." [Publication], [Year]. [URL]
[3] [Official pricing page]. [URL]
[Continue for all sources from Evidence_Auditor...]
```

================================================================================
================================================================================
FOR APPROACH_COMPARISON: ENTITIES BY APPROACH (NON-HIERARCHICAL)
================================================================================
================================================================================

Use this structure when `content_type` = "approach_comparison".

**CRITICAL: NO RANKINGS OR HIERARCHY.** All approaches are presented as equally valid.

----------------
Section A – Overview by Approach
----------------

Variable name: section_A_markdown

```
### Quick Stats

| Metric | Value |
|--------|-------|
| **Entities Covered** | [N] |
| **Approaches Represented** | [N approaches] |
| **Price Range** | [$X - $Y] |

## [Category] Options by Approach [Year]

*[N] [category] options organized by their methodological approach.*

### Overview by Approach

| Approach | Entities | Price Range |
|----------|----------|-------------|
| **[Approach 1]** | [Entity 1], [Entity 2] | [$X-$Y] |
| **[Approach 2]** | [Entity 3], [Entity 4] | [$X-$Y] |
| **[Approach 3]** | [Entity 5] | [$X-$Y] |
| **[Approach 4]** | [Entity 6] | [$X-$Y] |

### How Approaches Differ
Different approaches serve different practice needs. Here's what distinguishes them.
```

----------------
Section B – Approach Profiles
----------------

Variable name: section_B_markdown

```
# B. Options by Approach

## [Approach 1] Approach

[Description of what this approach involves and what it's designed for.]

### [Entity 1]
**Methodology:** [Description of specific implementation]
**Published Research:** [Descriptive - what research exists]
**Pricing:** [Amount]
**Designed For:** [Practice types and use cases]
**Notable For:** [What distinguishes this entity]

---

### [Entity 2]
[Same structure]

---

## [Approach 2] Approach

[Description of this approach.]

### [Entity 3]
**Methodology:** [Description]
**Published Research:** [Descriptive]
**Pricing:** [Amount]
**Designed For:** [Practice types]
**Notable For:** [Distinguishing features]

---

## [Approach 3] Approach

[Description of this approach.]

### [Entity 4]
[Same structure]

---

## [Approach 4] Approach

[Description of this approach.]

### [Entity 5]
[Same structure]
```

----------------
Section C – Full Comparison
----------------

Variable name: section_C_markdown

```
# C. Full Comparison

### All Options at a Glance

| Entity | Approach | Notable For | Pricing | Designed For |
|--------|----------|-------------|---------|--------------|
| [Name] | [Approach] | [Distinguishing feature] | [Price] | [Practice types] |
| [Name] | [Approach] | [Distinguishing feature] | [Price] | [Practice types] |
[Continue for all]

### Practice Fit Guide

**High-volume practices:**
- [Entities] - designed for throughput

**Research-focused practices:**
- [Entities] - extensive documentation

**Budget-conscious practices:**
- [Entities] - accessible pricing

**Boutique/Concierge:**
- [Entities] - premium service models
```

----------------
Section D – Decision Guide + FAQ
----------------

Variable name: section_D_markdown

```
# D. How to Choose

### When [Approach 1] Fits
[Practice types and use cases where this approach serves well]

### When [Approach 2] Fits
[Practice types that benefit from this approach]

### When [Approach 3] Fits
[Practice types prioritizing this approach]

### When [Approach 4] Fits
[Specific clinical contexts]

### NGM Perspective
[Curator's view on the category landscape]

### Frequently Asked Questions

**Q: What are the options for [Category] in [Year]?**
A: There are [N] options taking different approaches. [Brief overview without declaring winners.]

**Q: How do the approaches differ?**
A: The main differences are in methodology and focus. [Neutral comparison of approaches.]

**Q: Which option is most affordable?**
A: [Entity] offers accessible pricing at [price][n], designed for [practice type].

**Q: What research exists across options?**
A: Research documentation varies. [Factual descriptions without ranking.]

**Q: How do I choose the right option?**
A: Consider your practice type and priorities. [Decision framework based on practice fit]

### Sources & References

[1] [Author/Source]. "[Title]." [Publication], [Year]. [URL]
[2] [Author/Source]. "[Title]." [Publication], [Year]. [URL]
[3] [Company]. "[Official pricing]." [URL]
[Continue for all sources from Evidence_Auditor...]
```

================================================================================
================================================================================
FOR HEAD_TO_HEAD: TWO-ENTITY COMPARISON
================================================================================
================================================================================

Use this structure when `content_type` = "head_to_head".

----------------
Section A – Quick Comparison
----------------

Variable name: section_A_markdown

```
### Quick Comparison

| Dimension | [Entity A] | [Entity B] |
|-----------|------------|------------|
| **Pricing** | [Amount] | [Amount] |
| **Methodology** | [Approach] | [Approach] |
| **Published Research** | [Descriptive] | [Descriptive] |
| **Scale** | [Users] | [Users] |
| **Founded** | [Year] | [Year] |
| **Designed For** | [Practice types] | [Practice types] |

## [Entity A] vs [Entity B]: Complete Comparison

*Understanding two [category] options—how they differ and which fits your practice.*

### TL;DR

[Entity A] is designed for [X practice types] with [methodology/approach]. [Entity B] is designed for [Y practice types] with [methodology/approach].

**Consider [Entity A] if:** [One sentence about practice fit]
**Consider [Entity B] if:** [One sentence about practice fit]
```

----------------
Section B – Detailed Comparison
----------------

Variable name: section_B_markdown

```
# B. How They Differ

### Methodology & Approach

**[Entity A]:** [How it works - methodology description]

**[Entity B]:** [How it works - methodology description]

**Key Difference:** [What's fundamentally different - neutral framing]

---

### Published Research

**[Entity A]:** [Descriptive - what research exists]

**[Entity B]:** [Descriptive - what research exists]

**How They Differ:** [Neutral description of research landscape differences]

---

### Pricing & Value

**[Entity A]:** [Detailed pricing]

**[Entity B]:** [Detailed pricing]

**Price Comparison:** [Neutral comparison with context on what drives pricing differences]

---

### User Experience

**[Entity A]:** [What it's like to use]

**[Entity B]:** [What it's like to use]
```

----------------
Section C – Decision Framework
----------------

Variable name: section_C_markdown

```
# C. How to Choose

### Consider [Entity A] If You:
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]
- [Criterion 4]

### Consider [Entity B] If You:
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]
- [Criterion 4]

### Either May Work If:
[Scenarios where both could serve]

### Consider Other Options If:
[When to look at alternatives entirely]

### Feature-by-Feature Comparison

| Feature | [Entity A] | [Entity B] |
|---------|------------|------------|
| [Feature 1] | [Value] | [Value] |
| [Feature 2] | [Value] | [Value] |
[Continue for 8-12 features - NO "Winner" column]
```

----------------
Section D – Context + FAQ
----------------

Variable name: section_D_markdown

```
# D. Context & FAQ

### Market Context
[Where these two fit in the broader category]

### What Users Say
[User sentiment comparison - neutral]

### NGM Perspective
[Curator's view on the comparison]

### Frequently Asked Questions

**Q: How do [Entity A] and [Entity B] differ?**
A: [Nuanced answer] - [A] focuses on [X] while [B] emphasizes [Y]. The right choice depends on your practice needs.

**Q: Which is more affordable, [Entity A] or [Entity B]?**
A: [Direct price comparison with context]

**Q: What research exists for each?**
A: [Descriptive comparison of published research]

**Q: Can I switch from [Entity A] to [Entity B]?**
A: [Switching considerations]

**Q: Which is designed for [specific use case]?**
A: [Practice fit guidance without declaring a "winner"]
```

================================================================================
================================================================================
FOR CATEGORY_ANALYSIS: CATEGORY TRENDS
================================================================================
================================================================================

Use this structure when `content_type` = "category_analysis".

----------------
Section A – Category Overview
----------------

Variable name: section_A_markdown

```
### Category Snapshot

| Metric | Value |
|--------|-------|
| **Category** | [Name] |
| **Market Maturity** | [Early/Growing/Mature] |
| **Research Landscape** | [Description] |
| **Price Range** | [Range] |
| **Key Trend** | [One sentence] |

## [Category] Analysis [Year]

*Understanding the current state and future direction of [category].*

### Overview
[3-4 paragraph category analysis - what it is, current state, key dynamics]
```

----------------
Section B – Approaches & Evidence
----------------

Variable name: section_B_markdown

```
# B. Approaches in [Category]

### Main Approaches

**Approach 1: [Name]**
- How it works: [Description]
- Research landscape: [What research exists]
- Price range: [Range]
- Example companies: [Names]

**Approach 2: [Name]**
[Same structure]

**Approach 3: [Name]**
[Same structure]

### Evidence Landscape
[Overall description of what research exists in this category]

### Regulatory Environment
[FDA, compliance, etc.]
```

----------------
Section C – Market Dynamics
----------------

Variable name: section_C_markdown

```
# C. Market Dynamics

### Key Trends
1. [Trend 1] - [Explanation]
2. [Trend 2] - [Explanation]
3. [Trend 3] - [Explanation]

### What's Improving
[Positive developments]

### What's Challenging
[Ongoing issues]

### Price Evolution
[How pricing has changed and where it's heading]

### Where the Category is Headed
[Future outlook]
```

----------------
Section D – Guidance + FAQ
----------------

Variable name: section_D_markdown

```
# D. Guidance

### How to Evaluate [Category] Options
[Buying guide / evaluation framework - considerations, not rankings]

### Common Mistakes
[What to avoid]

### NGM Perspective
[Curator's view on the category]

### Frequently Asked Questions

**Q: What is [Category]?**
A: [Definition and explanation]

**Q: Does [Category] work?**
A: [Evidence-based answer - what the research shows]

**Q: How much does [Category] cost?**
A: [Price range with context]

**Q: Who is [Category] designed for?**
A: [Target user profiles]

**Q: What's the future of [Category]?**
A: [Trend-based answer]
```

================================================================================
OUTPUT FORMAT
================================================================================

Return EXACTLY this JSON shape:

{
  "content_type_processed": "<echo the content_type from input>",
  "section_A_markdown": "[Section A content per content_type]",
  "section_B_markdown": "[Section B content per content_type]",
  "section_C_markdown": "[Section C content per content_type]",
  "section_D_markdown": "[Section D content per content_type - MUST include Sources section]",
  "directory_markdown": "[All sections concatenated A → B → C → D, including Sources]",
  "sources_section": "[Formatted sources list from Evidence_Auditor, mapped to inline citations]",
  "aeo_extract": {
    "content_type": "[single_entity|category_roundup|approach_comparison|head_to_head|category_analysis]",
    "title": "[Main title for this content]",
    "one_sentence_summary": "[Direct answer to main query - neutral framing]",
    "pricing_answer": "[Direct pricing answer - specific for entity, range for category]",
    "comparison_answer": "[How things differ - neutral]",
    "designed_for_answer": "[Who each option is designed for]",
    "evidence_answer": "[Evidence summary - descriptive, not ranked]",
    "entities_covered": ["[List of entity names covered, if applicable]"]
  }
}

----------------
IMPORTANT NOTES
----------------

1. **Content type determines EVERYTHING** - Use the exact structure for your content_type.

2. **Use ACTUAL NUMBERS** - "$299/month" not "$$". This is critical for AEO.

3. **Front-load answers** - First sentence of each section should contain the key information.

4. **FAQ is mandatory for all types** - This is the most extracted content by answer engines.

5. **For multi-entity types:**
   - Use `entities_documented` from Evidence_Auditor for entity data
   - Use `comparison_table` from CompetitiveComparison for comparisons
   - Use `approach_categories` from CompetitiveComparison for approach-based organization

6. **All markdown must be valid** - Test that tables, headers, and lists are properly formatted.

7. **directory_markdown concatenates all sections** - This is the final output.

8. **CITATIONS ARE REQUIRED** - Use inline citation markers [1], [2], etc. for:
   - Evidence claims ("FDA 510(k) clearance[1]")
   - Study findings ("n=500 participants (Smith et al., 2024)[2]")
   - Pricing data ("$299/month[3]")
   - User metrics ("500,000+ users[4]")

9. **Include a Sources section in Section D** - List all sources with:
   - [n] Author/Source. "Title." Publication/Source, Year. URL

10. **NEUTRALITY IS CRITICAL:**
    - NO "Top Pick", "Editor's Choice", "Our Recommendation"
    - NO "Best for X" - use "Notable for X" or "Designed for X"
    - NO evidence ratings (Gold/Established/Emerging/Pioneer) - describe what exists
    - NO declaring winners in comparisons
    - Equal depth and neutral framing for all entities

11. **Use descriptive evidence profiles** - Instead of rating evidence, describe what exists.

12. **Inherit sources from Evidence_Auditor** - The Evidence_Auditor provides a `sources` array. Use these source IDs consistently throughout your content.

