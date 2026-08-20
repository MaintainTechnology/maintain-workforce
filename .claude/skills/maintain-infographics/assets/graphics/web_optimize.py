"""Web-optimized derivatives of the recolored brand graphics for the style guide page.
Full-res + transparent PNG originals stay in graphics/; these flattened JPEGs are only
what the HTML paints (keeps the page light). Each is flattened onto its natural brand
backdrop so the on-page preview matches real use."""
import os, shutil
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

G = r"C:/Users/dalig/Desktop/MaintainTech/MaintainOrg/maintain-audits/design-system/graphics"
WEB = os.path.join(G, "web")
os.makedirs(WEB, exist_ok=True)

D = (7, 39, 45)      # forge-blue backdrop for dark graphics
L = (255, 255, 255)  # white backdrop for light graphics

# (source, web base, max dim, backdrop)
JOBS = [
    ("cover.jpg", "cover", 1920, D),
    ("cover 2.jpg", "cover-2", 1800, D),
    ("section.jpg", "section", 1800, D),
    ("mountain forms 1.png", "mountain-forms-1", 1800, D),
    ("mountain forms 2.png", "mountain-forms-2", 1800, D),
    ("green-gradient.png", "green-gradient", 1400, D),
    ("blue-gradient.png", "blue-gradient", 1400, D),
    ("Gradient-pantone-1.png", "pantone-glow", 1400, D),
    ("gradient.jpg", "gradient", 1800, D),
    ("gradient.png", "gradient-portrait", 1600, D),
    ("gradient-white.jpg", "gradient-white", 1800, L),
    ("white bg.jpg", "white-bg", 1600, L),
    ("white-gradient.png", "white-gradient", 1600, L),
    ("white-lineargradient.png", "white-linear", 1600, L),
]
SVGS = ["blu-gradient.svg", "mountain.svg"]

mapping = []
for src, base, maxdim, bg in JOBS:
    im = Image.open(os.path.join(G, src))
    w, h = im.size
    scale = min(1.0, maxdim / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, bg)
        flat.paste(im, mask=im.split()[-1])
        im = flat
    else:
        im = im.convert("RGB")
    out = base + ".jpg"
    im.save(os.path.join(WEB, out), quality=82, subsampling=1, progressive=True)
    kb = os.path.getsize(os.path.join(WEB, out)) // 1024
    mapping.append((src, out, f"{im.size[0]}x{im.size[1]}", kb))

for s in SVGS:
    shutil.copy2(os.path.join(G, s), os.path.join(WEB, s))
    mapping.append((s, s, "vector", os.path.getsize(os.path.join(WEB, s)) // 1024))

# clean any stale PNGs from the earlier run
for f in os.listdir(WEB):
    if f.endswith(".png"):
        os.remove(os.path.join(WEB, f))

print(f"{'SOURCE':28} {'WEB':22} {'SIZE':12} KB")
total = 0
for src, out, dim, kb in mapping:
    print(f"{src:28} {out:22} {dim:12} {kb}")
    total += kb
print(f"\nTOTAL page image weight: ~{total/1024:.1f} MB across {len(mapping)} files")
