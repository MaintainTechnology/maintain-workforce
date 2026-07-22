# Brand graphics (recolored)

Backgrounds, gradients and wireframe-mountain graphics aligned to the Maintain Workforce
palette. Source art (from `maintain-technology/maintain/01 Visual Identity/graphics`) used an **orange**
highlight; here the orange is remapped to **Hi-Vis Amber `#FFC400`**, the brand's signature
accent, while the dark teal / black regions (already in the Ink Teal family) are left untouched.

The recolor is a **hue-only selective rotation**: only warm (orange/red) pixels shift to
amber; cool and neutral pixels are unchanged, so shapes, wireframe density and glow falloff match
the originals exactly. Orange (~25°) sits close to amber (~46°) on the hue wheel, so the shift
is gentle and the art keeps its original energy.

## Recolored (orange → amber)
| File | What it is |
|---|---|
| `cover.jpg` | Amber wireframe mountains on deep teal — the hero background |
| `cover 2.jpg` | Amber → teal diagonal gradient |
| `mountain forms 1.png` / `mountain forms 2.png` | Wireframe terrain, amber on black |
| `section.jpg` | Deep-teal section background with an amber glow |
| `amber-gradient.png` | Amber radial glow blob (was `orange-gradient.png`) |
| `Gradient-pantone-1.png` | Tall amber glow on dark |
| `gradient.jpg` / `gradient.png` | Amber perspective gradient (landscape / portrait) |
| `gradient-white.jpg` | Soft white → amber gradient (light background) |
| `mountain.svg` | Line-art terrain, strokes swapped to amber |

`mountain forms 1.png` has no orange original, so it is rotated from the green
(Maintain Audits era) copy with a narrow band that leaves the teal family untouched.

## Copied unchanged (already brand / neutral)
`blue-gradient.png`, `blu-gradient.svg` (teal blobs) · `white bg.jpg` · `white-gradient.png` ·
`white-lineargradient.png` (neutral light fades)

## `web/`
Optimized copies (flattened onto their brand backdrop, resized, JPEG) that the design-system
`index.html` paints — the page stays ~2 MB instead of ~124 MB. The full-resolution and
transparent-PNG originals in this folder are the real assets to hand to designers.

> Originals are untouched in the `maintain-technology` repo. To re-run or retune the mapping
> (e.g. a different target hue), the pipeline is `recolor.py` in this folder — edit `AMBER_CENTER`
> and run `python recolor.py`, then `python web_optimize.py` (needs `pillow` + `numpy`).
