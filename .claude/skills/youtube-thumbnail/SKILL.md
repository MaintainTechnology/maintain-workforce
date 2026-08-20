---
name: youtube-thumbnail
description: Create high-impact YouTube thumbnails with NGM branding. Thumbnails are face-forward, minimal text, and optimized for click-through at small sizes. Uses HTML templates for layout + Nano Banana Pro for AI-generated backgrounds when needed.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# YouTube Thumbnail Creator

## The #1 Rule

**Thumbnails are NOT slides.** They are tiny images competing for attention in a feed. Everything about this skill is designed around that constraint.

What makes a thumbnail work:
- **Faces** — large, expressive, recognizable
- **Few words** — 3-5 words max, readable at phone size
- **Contrast** — dark backgrounds, bright text, bold separation
- **Emotion** — curiosity, surprise, authority, urgency
- **Simplicity** — one clear focal point, not a brochure

What kills a thumbnail:
- Paragraphs of text (nobody reads them)
- Small faces buried in a layout
- Low contrast (light text on light background)
- Too many elements competing for attention
- Logos, dates, event details, CTAs (save those for the video description)

---

## Dimensions

**1280 × 720px** (16:9 aspect ratio) — YouTube's standard.

The `.canvas` element in the HTML is always exactly 1280×720px.

---

## Thumbnail Anatomy

Every thumbnail has 3 layers:

### Layer 1: Background
- Dark gradient, AI-generated abstract, or solid dark color
- Should create mood but never compete with the face or text
- Subtle — the background is a stage, not the performer

### Layer 2: Face(s)
- The dominant visual element
- Takes up 40-60% of the thumbnail area
- Positioned right-of-center (for solo) or split left/right (for two people)
- Photos provided as inputs by the user — always use real photos, never AI-generated faces
- Cutout style (no circular crops — use CSS `object-fit` and positioning to show face/upper body)

### Layer 3: Text
- 3-5 words maximum
- Positioned opposite the face (left side if face is right, etc.)
- Large enough to read on a phone screen (minimum 60px, prefer 72-96px)
- High contrast: white or gold text on dark backgrounds
- One line or two short lines — never three

---

## Pre-Generation Steps

### 1. Read Reference Materials
```
Read: .claude/skills/youtube-thumbnail/SKILL.md (this file)
Read: .claude/skills/document-studio/design-system.md (for brand colors)
```

### 2. Check Existing Thumbnails
```
Glob: content/graphics/yt-thumb-*.html
```

### 3. Gather Required Inputs
- **Topic** — What is this video about? (used to write the 3-5 word hook)
- **Face photo(s)** — Path(s) to headshot image files
- **Guest info** (if applicable) — Guest name, title (for small attribution only)

---

## Required Inputs

| Input | Required? | Example |
|-------|-----------|---------|
| Topic/title | Yes | "Spermidine and autophagy" |
| Host photo path | Yes | `src/assets/anant-profile.jpeg` |
| Guest photo path | If guest video | `src/assets/melissa-cano.jpg` |
| Guest name | If guest video | "Melissa Cano, PhD" |
| Text hook override | No | "Your Cells Are Eating Themselves" |

---

## Output

```
content/graphics/yt-thumb-[topic-slug].html
```

The HTML file renders at exactly 1280×720px. To export as an image:
1. Open in browser
2. Screenshot the `.canvas` element
3. Or use Playwright to capture: `page.locator('.canvas').screenshot()`

---

## Text Hook Writing

The thumbnail text is NOT the video title. It's a **hook** — a short, punchy phrase that creates curiosity or urgency.

### Rules
- **3-5 words.** Absolutely never more than 6.
- **Create a curiosity gap.** Make them need to click.
- **Use power words:** "Secret", "Truth", "Actually", "Wrong", "Hidden", "Real", "Never"
- **Be specific when possible:** "5-Minute Labs" beats "Quick Labs"
- **Avoid jargon** unless the audience expects it (longevity physicians do)

### Good Examples
| Video Topic | Thumbnail Text |
|-------------|---------------|
| Spermidine and cellular recycling | "Your Cells Recycle Themselves" |
| GLP-1 protocols that work | "GLP-1s Actually Work" |
| Why most lab panels miss things | "Your Labs Are Wrong" |
| Hormone optimization masterclass | "Hormones Nobody Tests" |
| AI in clinical practice | "AI Reads Labs Better" |
| Longevity medicine for beginners | "Start Living Longer" |

### Bad Examples (too long, too vague)
- "Understanding the Role of Spermidine in Cellular Autophagy" (way too long)
- "New Research" (too vague, no curiosity)
- "Watch This Webinar" (not a hook)
- "Unlocking autophagy for longevity, cognition & cardiovascular health" (this is a subtitle, not a thumbnail)

---

## Layout Patterns

### Pattern A: Solo Speaker (Default)

Face on the right, text on the left. Best for solo content.

```
┌──────────────────────────────────┐
│                                  │
│   YOUR CELLS                     │
│   RECYCLE          ┌──────────┐  │
│   THEMSELVES       │          │  │
│                    │  FACE    │  │
│                    │          │  │
│                    └──────────┘  │
│                          ▪ NGM  │
└──────────────────────────────────┘
```

- Face: right 50% of canvas, large, cropped from waist up
- Text: left 45%, vertically centered, left-aligned
- Brand mark: small, bottom-right corner

### Pattern B: Two Speakers (Guest Interview)

Both faces visible, text centered or at top.

```
┌──────────────────────────────────┐
│         THE TRUTH ABOUT          │
│         SPERMIDINE               │
│                                  │
│  ┌────────┐      ┌────────┐     │
│  │        │      │        │     │
│  │ HOST   │      │ GUEST  │     │
│  │        │      │        │     │
│  └────────┘      └────────┘     │
│   Dr. Anant    Melissa Cano,PhD │
└──────────────────────────────────┘
```

- Faces: each takes ~35% width, positioned bottom half
- Text: top third, centered, large
- Names: small labels below each face (optional)

### Pattern C: Bold Statement (Text-Dominant)

For provocative/controversial takes. Face smaller, text is the star.

```
┌──────────────────────────────────┐
│                                  │
│       YOUR LABS                  │
│       ARE WRONG      ┌───────┐  │
│                      │ FACE  │  │
│                      │(small)│  │
│                      └───────┘  │
│                                  │
│                          ▪ NGM  │
└──────────────────────────────────┘
```

- Text: massive (96-120px), takes up left 60%
- Face: smaller (30% width), bottom-right
- High drama — text IS the visual

---

## Color System for Thumbnails

Thumbnails use a subset of the NGM palette optimized for contrast and screen visibility:

```css
/* Backgrounds — always dark */
--bg-primary: #302C27;       /* Pure dark (ink-900) */
--bg-gradient-start: #302C27;
--bg-gradient-end: #1a1d21;  /* Slightly lighter dark */

/* Text — always high contrast */
--text-primary: #FFFFFF;      /* Main headline text */
--text-accent: #C49A6C;       /* Gold — for emphasis words or underlines */

/* Utility */
--text-muted: rgba(255,255,255,0.6); /* Small labels, names */
--divider: rgba(197, 165, 114, 0.3); /* Subtle gold separator lines */
```

### Text Styling

```css
/* Headline — the 3-5 word hook */
.headline {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-weight: 800;           /* Extra bold for thumbnails */
  font-size: 80px;            /* Large enough to read on phone */
  line-height: 0.95;          /* Tight line height */
  color: white;
  text-transform: uppercase;
  letter-spacing: -0.02em;    /* Slightly tighter */
}

/* Accent word — one word in gold for emphasis */
.headline .accent {
  color: var(--gold);
}
```

**Why Inter 800, not Cormorant Garamond?** Cormorant Garamond is beautiful for documents but too thin for thumbnails. Thumbnails need heavy, blocky type that's readable at 120px wide on a phone screen. Inter ExtraBold delivers that.

### Optional Text Shadow for Readability

When text overlaps a photo edge:

```css
text-shadow: 0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.4);
```

---

## Photo Treatment

### Cutout Style (Preferred)

Photos should feel like the person is "in" the thumbnail, not in a picture frame. No circular crops. No borders.

```css
.speaker-photo {
  position: absolute;
  right: 0;              /* Flush against right edge */
  bottom: 0;             /* Anchored to bottom */
  width: 55%;            /* Takes up right half */
  height: 95%;           /* Nearly full height */
  object-fit: cover;
  object-position: top center;  /* Show face, not torso */
}
```

### Gradient Fade

Blend the photo into the dark background on the left edge:

```css
.photo-fade {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 60%;
  height: 100%;
  background: linear-gradient(to right, var(--bg-primary) 0%, transparent 40%);
  z-index: 1;           /* Sits on top of photo */
}
```

### For Two Speakers

Each face gets ~35% width, positioned at bottom:

```css
.speaker-left {
  position: absolute;
  left: 5%;
  bottom: 0;
  width: 38%;
  height: 75%;
  object-fit: cover;
  object-position: top center;
}

.speaker-right {
  position: absolute;
  right: 5%;
  bottom: 0;
  width: 38%;
  height: 75%;
  object-fit: cover;
  object-position: top center;
}
```

---

## AI Background Generation (Optional)

When a plain dark gradient isn't enough, use Nano Banana Pro to generate an abstract background.

### When to Use AI Backgrounds
- Topic has a strong visual metaphor (cells, DNA, brain, etc.)
- You want a textured feel beyond a flat gradient
- The user requests it

### When NOT to Use AI Backgrounds
- The face photo provides enough visual interest
- Simple is better (most of the time)
- The background would compete with readability

### Prompt Pattern for Thumbnail Backgrounds

```
Dark abstract background for a medical/science YouTube thumbnail.
[TOPIC-SPECIFIC IMAGERY]. Moody, editorial, cinematic lighting.
Dark navy and charcoal tones with subtle gold (#C49A6C) accents.
No text. No people. No faces. Ultra-wide 16:9 format. 2K resolution.
```

**Topic-specific examples:**
- Spermidine: "microscopic cellular structures, autophagy vesicles, glowing organelles"
- GLP-1: "abstract molecular pathways, receptor binding visualization"
- Lab panels: "flowing data streams, biomarker visualization"
- Hormones: "endocrine system abstract, flowing molecular structures"

### Generation Code

```python
import os
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["Dark abstract background for a medical YouTube thumbnail. Microscopic cellular autophagy structures, glowing vesicles. Moody cinematic lighting. Dark navy and charcoal with subtle gold (#C49A6C) accents. No text. No people. Ultra-wide format."],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            image_size="2K"
        ),
    )
)

for part in response.parts:
    if part.inline_data:
        img = part.as_image()
        img.save("content/graphics/yt-bg-[topic].jpg")
```

Then reference the background in the HTML:

```css
.canvas {
  background: url('yt-bg-[topic].jpg') center/cover no-repeat;
}
```

With a dark overlay to ensure text readability:

```css
.canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgba(10, 11, 12, 0.9) 0%,
    rgba(10, 11, 12, 0.5) 50%,
    rgba(10, 11, 12, 0.3) 100%
  );
}
```

---

## Brand Mark

Keep it tiny. The thumbnail is not the place for prominent branding.

```css
.brand-mark {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

.brand-mark .logo {
  width: 28px;
  height: 28px;
  background: rgba(255,255,255,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cormorant Garamond', serif;
  font-size: 16px;
  color: white;
  font-weight: 500;
}

.brand-mark .name {
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
```

---

## Generation Process

### Step 1: Write the Hook
Take the video topic and distill it to 3-5 punchy words. Follow the text hook writing rules above.

### Step 2: Choose the Layout
- Solo speaker → Pattern A
- Guest interview → Pattern B
- Provocative claim → Pattern C

### Step 3: Decide on Background
- Default: dark gradient (fastest, cleanest)
- Optional: AI-generated abstract (if topic has strong visual metaphor)

### Step 4: Build the HTML
Use the template at `.claude/skills/youtube-thumbnail/templates/thumbnail-template.html`. Customize:
- Set the headline text (3-5 words)
- Set the photo `src` paths
- Choose layout variant
- Optionally generate and reference an AI background

### Step 5: Output
Save to `content/graphics/yt-thumb-[topic-slug].html`

---

## Quality Checklist

- [ ] Text is 3-5 words (NEVER more than 6)
- [ ] Text is readable at phone size (shrink browser to 320px width and check)
- [ ] Face(s) are large and prominent (40%+ of canvas)
- [ ] Real photos used (never AI-generated faces)
- [ ] Background doesn't compete with face or text
- [ ] High contrast: white/gold text on dark background
- [ ] Canvas is exactly 1280×720px
- [ ] Brand mark is present but subtle
- [ ] No dates, times, event details, paragraphs, or CTAs
- [ ] File saved to `content/graphics/yt-thumb-[topic-slug].html`

---

## Anti-Patterns

1. **Too much text** — If you can't read it on your phone, delete words
2. **Small faces** — The face should dominate, not be an afterthought
3. **Circular photo crops** — Cutout style only, no circles or frames
4. **Using Cormorant Garamond for headline** — Too thin. Use Inter 800 for thumbnails
5. **Including event details** — No dates, times, durations, registration links
6. **Prominent logo** — The logo is a whisper, not a shout
7. **Light backgrounds** — Dark backgrounds perform better on YouTube
8. **AI-generated faces** — Always use real photos provided by the user
9. **Generic hooks** — "Watch This" and "New Video" are not hooks

---

## Usage Examples

### Solo lecture thumbnail
```
Create a YouTube thumbnail for my lecture on spermidine and autophagy.
Photo: src/assets/anant-profile.jpeg
```

### Guest interview thumbnail
```
Create a YouTube thumbnail for my interview with Melissa Cano, PhD about spermidine.
Host photo: src/assets/anant-profile.jpeg
Guest photo: src/assets/melissa-cano.jpg
```

### Bold statement thumbnail
```
Create a YouTube thumbnail with a bold hook "Your Labs Are Wrong" — it's about why standard lab panels miss key longevity markers.
Photo: src/assets/anant-profile.jpeg
Use Pattern C (text-dominant).
```

### With AI background
```
Create a YouTube thumbnail about mitochondrial health.
Photo: src/assets/anant-profile.jpeg
Generate an abstract background with mitochondria/cellular imagery.
```
