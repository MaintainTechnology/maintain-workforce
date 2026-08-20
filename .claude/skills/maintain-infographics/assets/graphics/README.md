# Brand graphics (recolored)

Backgrounds, gradients and wireframe-mountain graphics aligned to the Maintain Audits
palette. Source art (from `maintain-technology/01 Visual Identity/graphics`) used an **orange**
highlight; here the orange is remapped to **Assurance Green `#3DDC84`**, the brand's signature
accent, while the dark teal / black regions (already in the Forge Blue family) are left untouched.

The recolor is a **hue-only selective rotation**: only warm (orange/red/amber) pixels shift to
green; cool and neutral pixels are unchanged, so shapes, wireframe density and glow falloff match
the originals exactly.

## Recolored (orange → green)
| File | What it is |
|---|---|
| `cover.jpg` | Green wireframe mountains on deep teal — the hero background |
| `cover 2.jpg` | Green → teal diagonal gradient |
| `mountain forms 1.png` / `mountain forms 2.png` | Wireframe terrain, green on black |
| `section.jpg` | Deep-teal section background with a green glow |
| `green-gradient.png` | Green radial glow blob (was `orange-gradient.png`) |
| `Gradient-pantone-1.png` | Tall green glow on dark |
| `gradient.jpg` / `gradient.png` | Green perspective gradient (landscape / portrait) |
| `gradient-white.jpg` | Soft white → green gradient (light background) |
| `white bg.jpg` | Light base with a green corner glow (had a hidden orange corner) |
| `white-gradient.png` | Soft light glow (had faint warm edge) |

## Copied unchanged (already brand / neutral)
`blue-gradient.png`, `blu-gradient.svg` (teal blobs) · `mountain.svg` (line art) ·
`white-lineargradient.png` (neutral light fade)

## `web/`
Optimized copies (flattened onto their brand backdrop, resized, JPEG) that the design-system
`index.html` paints — the page stays ~2 MB instead of ~124 MB. The full-resolution and
transparent-PNG originals in this folder are the real assets to hand to designers.

> Originals are untouched in the `maintain-technology` repo. To re-run or retune the mapping
> (e.g. a different target hue), the pipeline is `recolor.py` in this folder — edit `GREEN_CENTER`
> and run `python recolor.py` (needs `pillow` + `numpy`).
