# Platform canvas matrix

Render at these exact pixel sizes (the screenshot viewport = the canvas = the
deliverable; no post-scaling). When the user names a platform without an
orientation, use the **default** row. When they name neither, use LinkedIn
portrait — it's the primary channel for a B2B construction brand.

| Platform | Use | Size (px) | Aspect | Notes |
|---|---|---|---|---|
| LinkedIn | feed portrait **(default)** | 1080×1350 | 4:5 | Tallest feed real estate; best for stat posters |
| LinkedIn | feed square | 1200×1200 | 1:1 | |
| LinkedIn | feed landscape / link card | 1200×627 | 1.91:1 | Headline left, photo right works well |
| LinkedIn | carousel slide (PDF) | 1080×1350 | 4:5 | One idea per slide; repeat canvas per slide |
| Instagram | feed portrait **(default)** | 1080×1350 | 4:5 | Feed preview crops to 4:5 |
| Instagram | feed square | 1080×1080 | 1:1 | |
| Instagram | story / reel cover | 1080×1920 | 9:16 | Keep content out of top & bottom ~250px (UI chrome) |
| Facebook | feed portrait **(default)** | 1080×1350 | 4:5 | |
| Facebook | link/ad landscape | 1200×630 | 1.91:1 | |
| Facebook | story | 1080×1920 | 9:16 | Same safe areas as IG story |
| X / Twitter | feed **(default)** | 1600×900 | 16:9 | Timeline crops to 16:9 |
| TikTok | video cover / static | 1080×1920 | 9:16 | Right edge ~120px covered by action rail |
| YouTube | thumbnail | 1280×720 | 16:9 | Type must survive ~25% scale — go bigger than feels right |
| YouTube | community post | 1080×1080 | 1:1 | |

"Portrait" with no platform → 1080×1350. "Landscape" with no platform → 1200×627.

## Per-platform copy pressure

- **LinkedIn / Facebook**: the visual can carry a full argument (kicker, headline,
  stat, two-sentence body, footer). Body copy ≤ ~40 words on the canvas.
- **Instagram / TikTok**: cut body copy to one line or zero; the caption carries
  the prose. Headline + stat + footer is a complete IG visual.
- **Stories (9:16)**: one message only. Headline or stat — not both fighting.
- **X**: landscape leaves little height; kicker + headline + footer band.

## Gemini aspect for photo panels

Generate panels at the aspect closest to the slot they fill, then `object-fit:
cover`: full-bleed 4:5 canvas → `4:5`; a bottom strip → `16:9` or `21:9`; a side
column → `2:3` or `9:16`. Never stretch; always cover-crop.
