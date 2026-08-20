---
name: show-prep
description: Research topics and generate preview graphics for NGM Live show episodes. Use when preparing for a live show, finding discussion topics, or creating LinkedIn preview images. Triggers on "show prep", "show topics", "live show", "NGM Live", "episode prep", "preview graphic".
---

# Show Prep: NGM Live Episode Research & Preview Graphics

Two-phase skill for preparing **Next Generation Medicine (NGM) Live** episodes:
1. **Research & Curate** — Surface the best 3-5 discussion-ready topics using WebSearch and optionally `/last30days`
2. **Preview Graphic** — Generate a high-res LinkedIn-sized (2400x1254 @2x) show announcement PNG

## Invocation

```bash
/show-prep                                    # Full pipeline: research → brief → graphic
/show-prep --research-only                    # Research and briefs only
/show-prep --graphic-only                     # Render graphic from existing brief
/show-prep "GLP-1 and longevity, AI update"   # Skip research, use provided topics
/show-prep --date 2026-04-05                  # Override date (default: tomorrow)
```

## Phase 0: Setup

1. Determine the episode date:
   - Default: tomorrow's date
   - Override: `--date YYYY-MM-DD` argument
2. Format the day label (e.g., "WEDNESDAY, APRIL 2")
3. Show time: **11AM PST** (always include in config as `time_label`)
4. Check `content/show-prep/` for recent briefs (last 2 episodes) to build a deduplication exclusion list
5. Load API key: `OPENROUTER_API_KEY` from `.env`

## Phase 1: Research & Topic Curation

Skip this phase if `--graphic-only` is set or if the user provided topics directly.

### Topic Archetypes

**Every topic MUST match at least one of these 4 archetypes.** Topics that don't fit are too generic for the show.

1. **Named clinical trial results** — Specific trials with endpoints, cohort sizes, relative risk reductions. Published in major journals (NEJM, Lancet, JAMA) or presented at conferences (ACC, ASCO, ASH). Example: "Ez-PAVE trial: 33% CV event reduction at LDL <55 mg/dL"

2. **Major industry deals** — Big-dollar partnerships, acquisitions, or funding rounds with specific figures and deal structure. Example: "Eli Lilly + Insilico $2.75B AI drug discovery deal"

3. **Key researcher milestones** — Named scientists hitting inflection points with specific mechanism details. Example: "Sinclair's Life Biosciences gets FDA approval for first human epigenetic reprogramming trial"

4. **Influencer opinion shifts** — Trusted voices changing positions with reasons and data that convinced them. Example: "Rhonda Patrick restarts NR supplementation after Parkinson's trial data"

**Bad topics (too generic):**
- "AI in Healthcare Update"
- "Recent Biotech Funding Developments"
- "New Longevity Research"

### Stage 1: Research

**Primary method: WebSearch** — Run 4-5 parallel WebSearch queries targeting specific names, trials, companies, and dollar figures (not broad categories).

Good queries:
- `"Ez-PAVE trial results LDL cholesterol 2026"`
- `"Eli Lilly Insilico $2.75 billion deal March 2026"`
- `"David Sinclair Life Biosciences FDA human trial 2026"`

Bad queries:
- `"longevity medicine breakthroughs"`
- `"healthcare AI news"`

**Optional: `/last30days`** — For Reddit/X/HN social signal data. Note: last30days often hits Reddit 403s and OpenAI timeouts. Use as supplemental signal, not primary source.

```bash
python3 ~/.claude/skills/last30days/scripts/last30days.py "SPECIFIC TOPIC" --days 7 --emit=compact > /tmp/l30d_result.txt 2>&1
```

**Optional: Perplexity Deep Research** — For academic/clinical depth on specific finalists:

```bash
API_KEY=$(grep OPENROUTER_API_KEY .env | cut -d'=' -f2)
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "perplexity/sonar-deep-research",
    "messages": [{"role": "user", "content": "Deep dive on [TOPIC]: key findings, evidence for and against, implications for longevity medicine. Include specific data, expert reactions, counter-arguments."}]
  }' > /tmp/deep_research_N.txt 2>&1
```

### Stage 2: Triage & Curation

1. Filter candidates through the 4 topic archetypes above
2. Prioritize by:
   - **Recency** — This week > this month
   - **Specificity** — Named trial with n=3048 > "new study shows"
   - **Discussion potential** — Can you talk about this for 10+ minutes?
   - **Controversy/debate** — Is there a genuine contrarian take?
3. Exclude topics from previous episode briefs
4. Select final 3-5 topics

### Stage 3: Brief Assembly

For each of the final 3-5 topics, synthesize a structured brief:

```markdown
## 🔴 Topic N: [Specific Headline — not generic]
**Hook:** [Scroll-stopping question or claim, <60 chars]
**Category:** [Research | Industry | Funding | AI | Controversy]

### Why It Matters
2-3 sentences explaining significance. Be specific: names, numbers, dates.

### Key Data Points
- [Specific stat, study citation, or funding figure]
- [Study: Author et al., Journal, Year, n=X, key finding]
- [Company/product specific detail]

### Contrarian Angle
The uncomfortable question, the opposing view, or the thing nobody is saying.
This is what makes it a discussion, not a lecture.

### Discussion Questions
1. [Question that opens the conversation — accessible to general audience]
2. [Follow-up that goes deeper — for the clinicians and biotech watchers]
3. [Question that connects to the audience's personal health or career]

### Sources
- [Title](url)
- [Title](url)
```

**Quality checks for each topic:**
- Does the headline name specific things (not "AI in Healthcare Update")?
- Are there at least 3 specific data points with numbers?
- Is the contrarian angle genuine (not a strawman)?
- Would a smart non-expert understand the discussion questions?

### Brief Output

Save the full brief to `content/show-prep/YYYY-MM-DD-show-brief.md` with this header:

```markdown
# NGM Live Show Brief — [Full Date]

**Episode Topics: [N]** | **Research completed:** [today's date]
**Exclusions:** [N] topics from previous episodes excluded

---
```

If `--research-only`, stop here. Otherwise, proceed to Phase 2.

## Phase 2: Preview Graphic Generation

### Step 1: Generate Hooks

For each topic in the brief, write a scroll-stopping hook:
- Frame as provocative question, contrarian take, or surprising claim
- Keep under 60 characters
- Pick ONE key word/phrase to highlight in gold (the `highlight` field)
- Make it accessible to a general audience, not just clinicians

**Good hooks:**
- "New Trial Settles the *LDL* Debate?"
- "Lilly Just Paid *$2.75B* for AI-Made Drugs"
- "The First Human Trial to *Reverse Aging*"
- "Why Rhonda Patrick Changed Her Mind on *NAD+*"

**Bad hooks (too clinical/boring):**
- "GLP-1 Receptor Agonist Longevity Data Review"
- "Recent Biotech Funding Developments"

### Step 2: Write Config

Write the config to `content/show-prep/YYYY-MM-DD-config.json`:

```json
{
  "date": "YYYY-MM-DD",
  "day_label": "WEDNESDAY, APRIL 2",
  "time_label": "11AM PST",
  "topics": [
    {
      "headline": "Ez-PAVE Trial: Lower LDL Is Always Better",
      "hook": "New Trial Settles the LDL Debate?",
      "highlight": "LDL",
      "category": "Research"
    },
    {
      "headline": "Lilly + Insilico: $2.75B AI Drug Deal",
      "hook": "Lilly Just Paid $2.75B for AI-Made Drugs",
      "highlight": "$2.75B",
      "category": "Industry"
    }
  ]
}
```

**Config notes:**
- `time_label` is required — the headline renders as "[DAY_LABEL] at [TIME_LABEL]" (do NOT append "on NGM Live" — the NGM Live label is already in the header)
- `headline` is stored in the config but NOT displayed in the graphic (hooks only)
- The graphic does NOT include a LIVE badge — keep it clean and professional
- No topic subtitle/headline text in the graphic — hooks only

### Step 3: Generate PNG

```bash
cd /Users/anantvinjamoori/NGMClean/ngm-website-official/content/show-prep
python3 generate-preview.py YYYY-MM-DD-config.json
```

This produces: `content/show-prep/YYYY-MM-DD-show-preview.png`

**Renderer specs:**
- Viewport: 1200x627, rendered at **2x device scale** (2400x1254 actual pixels)
- Background: Midnight blue (#0B1120) with abstract SVG art (flowing arcs, constellation dots, concentric rings)
- Font: Plus Jakarta Sans (loaded from Google Fonts)
- Gold accent: #D4A040 / #E8BE60 for highlights

### Step 4: Show Results

1. Read and display the generated PNG inline
2. Open it in Preview via `open` command
3. Report the output path for uploading to LinkedIn

## File Locations

| File | Purpose |
|------|---------|
| `content/show-prep/preview-template.html` | LinkedIn graphic HTML template (with SVG background art) |
| `content/show-prep/generate-preview.py` | Playwright PNG renderer (2x scale) |
| `content/show-prep/YYYY-MM-DD-show-brief.md` | Episode research brief |
| `content/show-prep/YYYY-MM-DD-config.json` | Graphic config (topics + hooks + time) |
| `content/show-prep/YYYY-MM-DD-show-preview.png` | LinkedIn preview graphic |

## API Reference

| Service | Use |
|---------|-----|
| WebSearch | Primary research — targeted queries with specific names, trials, figures |
| `/last30days` skill | Supplemental social signal data — Reddit, X, YouTube, HN (configured at `~/.config/last30days/.env`) |
| Perplexity Deep Research (optional) | Deep dives on finalists via `perplexity/sonar-deep-research` through OpenRouter |
| `OPENROUTER_API_KEY` | In `.env` — used by last30days and Perplexity |

## Design System

| Element | Value |
|---------|-------|
| Background | `#0B1120` (midnight blue) |
| Surface | `#0F1628` |
| Gold accent | `#D4A040` / `#E8BE60` |
| Live accent | `#D06848` (used sparingly) |
| Font | Plus Jakarta Sans (400-800) |
| Highlight | Gold italic on keyword via `.hl` class |
| Resolution | 2x device scale (2400x1254 actual) |
| No LIVE badge | Removed — too cheesy |
| No topic subtitles | Hooks only in the graphic |
| Headline format | "[DAY] at [TIME]" — use the actual date, never "Tomorrow". No "on NGM Live" (redundant with header). |

## Tips

- Run `/show-prep` the day before the live show to give yourself time to review
- Edit the brief as needed — it's your show prep doc, not a script
- The preview graphic is designed for LinkedIn but also works on X/Twitter
- If a topic feels weak after the deep dive, drop it and promote the next candidate
- The contrarian angle is what makes each topic a *discussion*, not a lecture
- When last30days returns thin results (Reddit 403s, timeouts), fall back to WebSearch immediately — don't wait
- Always include `time_label: "11AM PST"` in the config
