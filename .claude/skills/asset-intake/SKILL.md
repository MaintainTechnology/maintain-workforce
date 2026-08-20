---
name: asset-intake
description: Use when adding, renaming, or organizing brand media in this repo — logos, backgrounds, screenshots, or design exports. Triggers on "add this asset", "organize these files", "rename to convention", "where does this file go", or when a new image/SVG/PDF appears in media/. Classifies the file, renames it to the maintain-media-<role>[-variant].<ext> convention, files it under logos/ | backgrounds/ | brand/, and updates media/README.md.
---

# Asset intake

Bring a new or messy media file into line with the repository conventions.

## Steps

1. **Look at the file first.** View images with Read. For SVGs, check the size and whether
   the art is real vector `<path>` data or an embedded base64 raster
   (`grep -o "data:image" file.svg`). If it's an embedded raster and you need to see it,
   extract the base64 PNG and view that.
2. **Classify the role:**
   - `logo` — plus a `darkbg` (white text) or `lightbg` (dark text) variant
   - `gradient-bg` / background texture / hero image
   - `brandkit-colors` or other brand reference (guideline screenshot, palette)
3. **Name it** `maintain-media-<role>[-variant].<ext>` — lowercase, hyphens, no spaces;
   strip `(1)`, "Untitled", "screencapture", timestamps, and other export noise.
4. **File it** under `media/logos/`, `media/backgrounds/`, or `media/brand/`.
5. **Prefer vector.** If a clean vector already covers the same logo, keep heavy raster
   exports as `-canva` fallbacks — do not treat them as the primary asset.
6. **Update `media/README.md`** with the new entry.

## Guardrails

- Never rename the canonical `maintain-media-logo-darkbg.svg` / `-lightbg.svg`.
- Never delete anything without explicit confirmation — assets aren't reproducible.
- Use `git mv` when the file is tracked, plain `mv` when it isn't.
- Report the before → after path for every file you touch.
