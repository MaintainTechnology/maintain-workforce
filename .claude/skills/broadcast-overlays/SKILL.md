---
name: broadcast-overlays
description: Generate transparent PNG overlays (sidebar + chyron, or chyron-only) for Next Generation Medicine live stream episodes. Use when creating stream graphics, overlays, lower thirds, or chyrons.
---

# Broadcast Overlay Generator

Generate transparent 1920x1080 PNG overlays for StreamYard live streams.
Two modes: **full** (sidebar topic strip + chyron) or **chyron** (lower-third only).

## Design System

- **Font:** Plus Jakarta Sans (Google Fonts)
- **Background:** Deep midnight blue-black `rgba(11, 17, 32, 0.93)`, semi-transparent
- **Accent:** Broadcast gold `#D4A040` / `#E8BE60`
- **Live indicator:** Vermillion `#D06848`
- **Text:** White primary, cool gray secondary `#8A94A6`, muted `#4E5869`
- **Panel width:** 560px right-aligned sidebar
- **Chyron:** Full-width lower third (or full width minus sidebar in full mode)

## File Locations

```
outputs/overlays/
  template.html     — Master HTML template (DO NOT hardcode data here)
  generate.py       — Playwright-based PNG renderer
  config.json       — Per-episode config (topics, hooks, mode)
```

## Workflow

### Step 1: Collect Topics

Ask the user for their episode topics. Typical format:
```
1. GLP-1 Agonists & Longevity
2. AI-Powered Diagnostics Update
3. Peptide Therapy Deep Dive
```

### Step 2: Generate Hook Questions

For each topic, write a **scroll-stopping chyron question** — the kind of thing
that makes someone stop scrolling and watch. Rules:

- Frame as a provocative question, contrarian take, or surprising claim
- Keep under 60 characters when possible
- Pick ONE key word/phrase to highlight in gold (the `highlight` field)
- Make it accessible to a general audience, not just clinicians
- Avoid jargon — use brand names and plain language

**Good hooks:**
- "Can *Ozempic* Actually Make You Live Longer?"
- "Is *AI* About to Replace Your Doctor's Diagnosis?"
- "Why Your *Blood Work* Is Lying to You"

**Bad hooks (too clinical/boring):**
- "GLP-1 Receptor Agonist Longevity Data Review"
- "Diagnostic AI Performance Metrics"

### Step 3: Write config.json

Write the config to `outputs/overlays/config.json`:

```json
{
  "topics": [
    "GLP-1 Agonists & Longevity",
    "AI-Powered Diagnostics Update",
    "Peptide Therapy Deep Dive"
  ],
  "hooks": [
    {"question": "Can Ozempic Actually Make You Live Longer?", "highlight": "Ozempic"},
    {"question": "Is AI About to Replace Your Doctor's Diagnosis?", "highlight": "AI"},
    {"question": "Are Peptides the Future of Anti-Aging Medicine?", "highlight": "Peptides"}
  ],
  "mode": "full"
}
```

**Mode options:**
- `"full"` — Sidebar topic strip + chyron (default)
- `"chyron"` — Lower-third chyron only, no sidebar

**Config rules:**
- `topics` and `hooks` arrays must be the same length
- Each hook needs `question` (string) and `highlight` (string, the word to gold-highlight)
- If no word should be highlighted, set `highlight` to `""`

### Step 4: Generate PNGs

```bash
cd outputs/overlays && python3 generate.py
```

This produces one PNG per topic:
- Full mode: `overlay_topic_1.png` through `overlay_topic_N.png`
- Chyron mode: `chyron_topic_1.png` through `chyron_topic_N.png`

Each PNG has the corresponding topic highlighted as active.
Previous topics show as "done" (checkmark), upcoming topics are dimmed.

### Step 5: Show Results

Read and display the first and last PNG so the user can verify the design.
Tell the user the output directory path so they can load files into StreamYard.

## Chyron-Only Mode

When the user says "just the chyron" or "no sidebar":
- Set `"mode": "chyron"` in config.json
- The sidebar is hidden entirely
- The chyron spans the full 1920px width
- Output files are named `chyron_topic_N.png`

## Custom Output Directory

To save to a subdirectory (e.g., per-episode), add `output_dir` to config:
```json
{
  "topics": [...],
  "hooks": [...],
  "mode": "full",
  "output_dir": "ep42"
}
```
PNGs will be saved to `outputs/overlays/ep42/`.

## Generating for a Specific Config Path

```bash
python3 outputs/overlays/generate.py /path/to/config.json
```

## Requirements

- Python 3.9+
- Playwright + Chromium (auto-installed on first run)
- Internet connection (Google Fonts loaded at render time)
