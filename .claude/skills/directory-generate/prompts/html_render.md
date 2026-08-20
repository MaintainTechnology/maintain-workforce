# Anthropic 0 Prompt

**Model:** anthropic/claude-opus-4-5-20251101

## System Prompt

_No system prompt_

## User Prompt

You are the FINAL RENDERING step in a pipeline that builds a directory of WELLNESS / LONGEVITY content.

This output is optimized for Answer Engine Optimization (AEO) — it will be crawled by ChatGPT, Perplexity, Claude, and Google AI Overviews.

**CRITICAL PHILOSOPHY:**
- NO RANKING elements in the UI
- NO "Top Pick" cards or winner declarations
- NO evidence hierarchy badges (Gold/Established/Emerging/Pioneer)
- All entities presented with equal visual weight
- Use "Notable for" instead of "Best for"

**CRITICAL:** Your layout depends on `content_type` from the input:
- **single_entity**: Entity profile layout
- **category_roundup**: Entity card grid + comparison tables (NO rankings)
- **approach_comparison**: Entities grouped by methodology (equal weight)
- **head_to_head**: Two-column comparison layout (NO winner)
- **category_analysis**: Category overview with trend visualizations

You receive:
1. A JSON object called `directory_page_output` containing four Markdown sections, their concatenation, and AEO-ready extracts.
2. An optional `custom_style_guide` string with extra CSS overrides (may be empty).

Your job is to:
- Parse the JSON.
- Identify the `content_type` from `aeo_extract.content_type`.
- Convert the Markdown sections into semantic HTML.
- Apply the appropriate LAYOUT for the content_type.
- Wrap them in a rich, engaging HTML page.
- Include structured data (JSON-LD) for FAQ and appropriate schema.
- Include appropriate SVG diagrams based on content_type.
- Output ONLY the raw HTML document.

All CSS must be in a `<style>` tag in the `<head>` (no external CSS file). You MAY include a `<link>` to Google Fonts as provided.

--------------------------------------------------
INPUTS
--------------------------------------------------

Full JSON from the previous node:

{{ llm_693b6d4f9e0a691542b8d825.response }}

The JSON from the previous node has this structure:

{
  "content_type_processed": "single_entity|category_roundup|approach_comparison|head_to_head|category_analysis",
  "section_A_markdown": "...",
  "section_B_markdown": "...",
  "section_C_markdown": "...",
  "section_D_markdown": "...",
  "directory_markdown": "...",
  "aeo_extract": {
    "content_type": "single_entity|category_roundup|approach_comparison|head_to_head|category_analysis",
    "title": "Main title",
    "one_sentence_summary": "Direct answer to main query",
    "pricing_answer": "Direct pricing answer",
    "comparison_answer": "How things differ",
    "designed_for_answer": "Who each option is designed for",
    "evidence_answer": "Evidence summary",
    "entities_covered": ["Entity 1", "Entity 2", "..."]
  }
}

--------------------------------------------------
SCHEMA MARKUP (CRITICAL FOR AEO)
--------------------------------------------------

Include appropriate JSON-LD structured data based on content_type:

**For single_entity:**
- FAQPage schema with entity-specific Q&As
- Organization schema

**For category_roundup / approach_comparison:**
- FAQPage schema with category-wide Q&As
- ItemList schema listing entities covered

**For head_to_head:**
- FAQPage schema with comparison Q&As
- Two Organization schemas (one per entity)

**For category_analysis:**
- FAQPage schema with category Q&As
- Article schema for the analysis

Schema structure using schema.org context - use appropriate schema.org types like FAQPage with mainEntity array containing Question objects with acceptedAnswer.

--------------------------------------------------
STYLE GUIDE (DEFAULT)
--------------------------------------------------

Use this "Personal Action Blueprint" style guide. Implement as CSS inside a single style tag.

Typography
- Serif (Headlines/Titles): "Cormorant Garamond", "Noto Serif JP", serif
- Sans-serif (Body/UI): "DM Sans", system-ui, -apple-system, sans-serif
- Monospace (Time displays): ui-monospace, monospace

Include this font import in the head:
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=DM+Sans:wght@400;500;600&family=Noto+Serif+JP:wght@500&display=swap

Type Scale
- Hero (h1): clamp(40px, 5vw, 56px) / line-height: 1.05
- XXL (h2): clamp(32px, 4vw, 42px) / line-height: 1.2
- XL (h3): clamp(24px, 3vw, 32px) / line-height: 1.2
- Large (h4): clamp(18px, 2.5vw, 24px) / line-height: 1.3
- Body: 15px default; 17px medium; 13px extra small.

Color Palette (define as CSS variables on :root)
- --paper: #FFFFFF;
- --paper-alt: #F5F2EC;
- --ink-900: #302C27;
- --ink-700: #4A4540;
- --ink-500: #706C66;
- --ink-400: #9C9890;
- --line: #E3DFD7;
- --gold: #C49A6C;
- --vermillion: #C07050;
- --forest: #2D5A4A;
- --sky: #4A90A4;
- --methodology-1: #2D5A4A;
- --methodology-2: #C49A6C;
- --methodology-3: #4A90A4;
- --methodology-4: #9C9890;

Spacing System (also as CSS variables)
- --space-1: 8px;
- --space-2: 12px;
- --space-3: 20px;
- --space-4: 32px;
- --space-5: 48px;
- --space-6: 72px;
- --space-7: 96px;

Layout
- Body background: --paper.
- Main container: max-width: 900px; margin: 0 auto; padding: clamp(20px, 5vw, 48px);
- Header: background: --paper-alt; border-bottom: 1px solid --line; padding: 32px 0;
- Section spacing: Between major sections: var(--space-6); Between subsections: var(--space-5);

--------------------------------------------------
LAYOUT-SPECIFIC COMPONENTS BY CONTENT_TYPE
--------------------------------------------------

================================================================================
FOR SINGLE_ENTITY: PROFILE LAYOUT
================================================================================

Components:

**Quick Facts Card**
- Place at the very top
- background: --paper-alt
- border: 2px solid --gold
- border-radius: 8px
- padding: 24px
- Table inside: clean, no borders, alternating row colors

**Profile Hero**
- Entity name as h1
- Tagline in italic
- Badge row (Methodology, Regulatory Status, Integration, Price) - NEUTRAL badges only

**Section Structure**
- Section chips: 32x32px circle, background: --ink-900, color: white
- Badges: pill-shaped, border-radius: 999px, border: 1px solid --line

**SVG Diagrams (2 required)**
- Mechanism Map (after The Primer)
- Feature Overview (end of Section B) - NO evidence rating chart

================================================================================
FOR CATEGORY_ROUNDUP: CARD GRID LAYOUT (NO RANKINGS)
================================================================================

**CRITICAL: NO "Top Pick" cards, NO evidence hierarchy badges, NO winner declarations**

Components:

**Category Stats Card**
- Similar to Quick Facts but for category metrics
- Shows: Entities Covered, Price Range, Methodologies Available
- NO "Evidence Range" - replaced with "Methodologies"

**Entity Card Grid**
- CSS Grid: grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))
- gap: var(--space-4)
- Each card:
  - background: --paper-alt
  - border: 1px solid --line
  - border-radius: 8px
  - padding: 24px
  - Entity name as h3
  - Methodology badge (color-coded by methodology type, not quality)
  - Pricing prominent
  - "Notable for" statement (NOT "Best for")
  - Key distinguishing feature

**Master Comparison Table**
- Full-width table with all entities
- Sticky header row
- Highlight rows on hover
- Price column should stand out (--gold background)
- NO "Winner" column
- NO evidence level badges

**SVG Diagram: Methodology-Price Matrix**
- X-axis: Methodology type (16S → Shotgun → Metatranscriptomics)
- Y-axis: Price
- Each entity as a labeled dot
- Color-coded by methodology, NOT by quality

================================================================================
FOR APPROACH_COMPARISON: METHODOLOGY-BASED SECTIONS (EQUAL WEIGHT)
================================================================================

**CRITICAL: All methodology sections have EQUAL VISUAL WEIGHT. No hierarchy.**

Components:

**Methodology Section Headers**
Each methodology gets a distinctive header with EQUAL visual treatment:

**All Methodology Headers use the same neutral style:**
- background: linear-gradient(135deg, var(--ink-700) 0%, var(--ink-900) 100%)
- color: white
- Left border accent in methodology color (4px solid)
- Label: "[Methodology Name] Approach"
- Subtitle: "Brief description of what this methodology involves"

OR use the methodology colors as LEFT BORDERS only (not background), keeping headers visually equal:
- border-left: 4px solid var(--methodology-1/2/3/4)
- background: var(--paper-alt)
- All headers look the same except for the accent color

**Entity Cards within Methodology Sections**
- Cards under each methodology section
- Methodology color accent on left border (4px solid)
- NO ranking numbers or position badges
- Focus on: Name, Notable For, Designed For, Published Research (descriptive), Pricing

**Practice Fit Guide**
- Grid of cards matching practice types to suggested entities
- "High-volume practices → Consider [entities]"
- Equal weight given to all suggestions

**Overview Table**
- Entity column (alphabetical, NOT ranked)
- Methodology column with color-coded badge
- Notable For column
- Designed For column
- Published Research column (DESCRIPTIVE - e.g., "2 RCTs", not "Established")
- Pricing column
- NO "Evidence Level" column, NO "Winner" column

**SVG Diagram: Methodology Distribution**
- Equal segments showing count per methodology
- Or: Practice Fit Matrix showing which entities fit which practice types
- NO hierarchy implied

================================================================================
FOR HEAD_TO_HEAD: TWO-COLUMN LAYOUT (NO WINNER)
================================================================================

**CRITICAL: NO winner declaration, NO "better" language**

Components:

**VS Header**
- Two-column header with both entity names
- "VS" badge in center (neutral)
- Equal visual weight to both
- NO crown/trophy icons

**Quick Comparison Cards**
- Side-by-side cards showing key metrics
- Use CSS Grid: grid-template-columns: 1fr auto 1fr
- Center column for dimension labels
- NO winner highlighting per dimension
- Just show the values, let readers compare

**Feature Comparison Table**
- Three columns: Feature | Entity A | Entity B
- NO "Winner" column
- NO checkmarks implying one is better
- Just values for comparison

**Consider If Cards**
- Two cards side by side
- "Consider [Entity A] if..." and "Consider [Entity B] if..."
- Bullet points in each
- Equal visual weight

**SVG Diagram**
- Side-by-side bar chart comparing key dimensions
- EQUAL styling for both entities (same color intensity)
- No visual indication of "winner"

================================================================================
FOR CATEGORY_ANALYSIS: EDITORIAL LAYOUT
================================================================================

Components:

**Category Hero**
- Large editorial-style header
- Category name as h1
- "Analysis" or "Guide" label
- Year if applicable

**Stat Cards Row**
- Horizontal row of 3-4 stat cards
- Each showing a key category metric
- Large number with label below
- NO "Evidence" ratings

**Methodology Cards**
- Cards for each methodology within the category
- Different accent color per methodology (NOT quality-based)
- Equal visual weight

**Trend Timeline (optional)**
- Visual timeline of category evolution

**SVG Diagram**
- Category landscape visualization
- Or: Methodology comparison chart

--------------------------------------------------
COMMON COMPONENTS (All content types)
--------------------------------------------------

**FAQ Section (CRITICAL FOR AEO)**
- Style each Q&A pair distinctly
- Question: font-weight: 600, color: --ink-900
- Answer: color: --ink-700
- Subtle separator between pairs

**Comparison Tables (all types)**
- Clean with proper headers
- thead background: --paper-alt
- Hover highlight on rows
- Responsive: horizontal scroll on mobile
- NO "Winner" column
- NO evidence level badges with hierarchy colors

**Methodology Badges (REPLACES Evidence Badges)**
- pill-shaped, border-radius: 999px
- Color-coded by METHODOLOGY TYPE (not quality):
  - 16S rRNA: --methodology-1 (#2D5A4A)
  - Shotgun Metagenomics: --methodology-2 (#C49A6C)
  - Metatranscriptomics: --methodology-3 (#4A90A4)
  - Other/Specialized: --methodology-4 (#9C9890)

**CITATIONS & SOURCES (CRITICAL FOR CREDIBILITY)**

The content will contain inline citation markers like [1], [2], etc.

Render these as:
- Superscript links: `<sup><a href="#source-1" class="citation-link">[1]</a></sup>`
- Link to corresponding source in the Sources section

**Sources Section (Required at end of content)**
- h2 heading: "Sources & References"
- Ordered list of sources
- Each source styled as:
```html
<li id="source-1" class="source-item">
  <span class="source-authors">Author et al.</span>
  "<span class="source-title">Title</span>."
  <span class="source-publication">Publication</span>, 
  <span class="source-year">Year</span>.
  <a href="URL" target="_blank" rel="noopener" class="source-link">
    [Link] <svg>external link icon</svg>
  </a>
</li>
```

**Source Styling:**

Style .citation-link with:
- color: var(--forest)
- text-decoration: none
- font-size: 0.75em
- vertical-align: super
- On hover: text-decoration: underline

Style .sources-section with:
- margin-top: var(--space-6)
- padding-top: var(--space-4)
- border-top: 1px solid var(--line)

Style .source-item with:
- margin-bottom: var(--space-2)
- font-size: 14px
- color: var(--ink-500)

Style .source-title with font-style: italic

Style .source-link with color: var(--forest)

Style .source-link svg with:
- width: 12px
- height: 12px
- vertical-align: middle
- margin-left: 4px

**Footer**
- Back link
- Timestamp

--------------------------------------------------
SVG DIAGRAM SPECIFICATIONS
--------------------------------------------------

All SVGs should:
- width: 100%
- preserveAspectRatio: xMidYMid meet
- Use design system colors
- Text in DM Sans font
- Rounded rectangles (rx: 8)
- Be accessible (role="img", aria-label)

**For single_entity:**
1. Mechanism Map (viewBox: 0 0 800 250)
2. Feature Overview (viewBox: 0 0 720 320) - NOT evidence rating

**For category_roundup:**
1. Methodology-Price Matrix (viewBox: 0 0 720 400)
   - X-axis: Methodology type (e.g., "16S rRNA" → "Shotgun" → "Metatranscriptomics")
   - Y-axis: Price
   - Scatter plot with entity dots
   - Color-coded by methodology, NOT by quality
   - NO "Evidence" axis

**For approach_comparison:**
1. Methodology Distribution (viewBox: 0 0 720 200)
   - Equal-weight segments showing count per methodology
   - Horizontal bar chart or pie chart with equal visual treatment
   - Color-coded by methodology
   - NO hierarchy implied

**For head_to_head:**
1. Comparison Bars (viewBox: 0 0 720 400)
   - Side-by-side bars for each dimension
   - EQUAL coloring for both entities
   - No visual "winner" indication

**For category_analysis:**
1. Category Landscape (viewBox: 0 0 720 350)
   - Methodology positioning visualization
   - Or: Methodology comparison chart

--------------------------------------------------
HTML STRUCTURE
--------------------------------------------------

Construct a full HTML document with:

1. DOCTYPE html declaration
2. html tag with lang="en"
3. head section containing:
   - meta charset UTF-8
   - meta viewport
   - title based on content_type and title from aeo_extract
   - meta description using one_sentence_summary
   - Google Fonts link
   - JSON-LD schema script(s) appropriate to content_type
   - style tag with all CSS

4. body section with content_type-specific layout:

**For single_entity:**
- header with wordmark
- main: Quick Facts → Profile Hero → Section B → Section C → Section D → Sources

**For category_roundup:**
- header with "Category Guide" label
- main: Category Stats → Overview → Understanding Methodologies → Entity Card Grid → Comparison Table → FAQ → Sources
- NO "Top Pick" card

**For approach_comparison:**
- header with "Options by Methodology" label and year
- main: Quick Stats → Overview → Methodology Sections (all equal weight) → Practice Fit Guide → Overview Table → FAQ → Sources
- NO tier rankings

**For head_to_head:**
- header with both entity names and VS
- main: Quick Comparison → TL;DR → Detailed Comparison → Decision Framework → FAQ → Sources
- NO winner declaration

**For category_analysis:**
- header with "Analysis" label
- main: Category Hero → Stats → Methodologies → Trends → Guidance → FAQ → Sources

**IMPORTANT: Every layout MUST include a Sources & References section at the end of the main content.**

5. footer with back link

--------------------------------------------------
ELEMENTS TO NEVER INCLUDE
--------------------------------------------------

1. **NO "Top Pick" cards** - Do not highlight any entity as the recommended choice
2. **NO "Winner" columns** in comparison tables
3. **NO evidence hierarchy badges** (Gold/Established/Emerging/Pioneer)
4. **NO "Best for" language** - Use "Notable for" or "Designed for"
5. **NO ranking numbers** (1st, 2nd, 3rd, etc.)
6. **NO tier designations** (S/A/B/C or similar)
7. **NO crown/trophy icons** for any entity
8. **NO checkmarks that imply one option is better** than another
9. **NO "Editor's Choice" or "Our Recommendation"** badges
10. **NO visual hierarchy that implies quality ranking**

--------------------------------------------------
OUTPUT FORMAT
--------------------------------------------------

You MUST return ONLY a complete HTML document.

- Start with DOCTYPE html and end with closing html tag.
- Do NOT wrap the output in JSON.
- Do NOT wrap the output in markdown code blocks.
- Do NOT include any text before or after the HTML document.
- The output should be directly pasteable into an HTML file.

CRITICAL: Output raw HTML only. No JSON. No markdown. Just the HTML document.

