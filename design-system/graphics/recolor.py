"""Recolor Maintain source graphics: orange highlight -> Hi-Vis Amber #FFC400.
Hue-only selective rotation. Cool/teal/dark regions (already ink-teal family) untouched.
Structure, wireframe density and glow falloff are preserved exactly.
Files absent from the source repo fall back to a green->amber rotation of the
local (Maintain Audits era) copy."""
import os, glob, shutil
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

SRC = r"C:/Users/dalig/Desktop/MaintainTech/MaintainOrg/maintain-technology/maintain/01 Visual Identity/graphics"
OUT = os.path.dirname(os.path.abspath(__file__))

# Files copied through unchanged (already brand teal, or neutral white). SVGs also copied (ext branch).
COPY_NEUTRAL = {
    "blue-gradient.png",        # already the teal twin of the warm gradient
    "white bg.jpg", "white-gradient.png", "white-lineargradient.png",
}
RENAME = {"orange-gradient.png": "amber-gradient.png"}
STALE = {"green-gradient.png"}  # audits-era outputs to remove from OUT

AMBER_CENTER = 46.1      # deg: hue of Hi-Vis Amber #FFC400

# --- primary pass: orange source -> amber ---
ORANGE_CENTER = 25.0     # deg: dominant orange hue in the source art
BAND_INNER, BAND_OUTER = 20.0, 62.0           # full warm weight <=20deg, zero >=62deg from center

# --- fallback pass: local green (audits) -> amber. Narrow band so the nearby
#     teal family (~187deg) stays untouched (greens span ~125-155deg).
GREEN_CENTER = 145.0
G_INNER, G_OUTER = 25.0, 40.0


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); df = mx - mn
    h = np.zeros_like(mx)
    m = df > 1e-9
    ir = m & (mx == r); h[ir] = (60 * ((g[ir] - b[ir]) / df[ir]) + 360) % 360
    ig = m & (mx == g) & ~ir; h[ig] = (60 * ((b[ig] - r[ig]) / df[ig]) + 120) % 360
    ib = m & (mx == b) & ~ir & ~ig; h[ib] = (60 * ((r[ib] - g[ib]) / df[ib]) + 240) % 360
    s = np.where(mx > 1e-9, df / np.where(mx > 1e-9, mx, 1), 0.0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    c = v * s
    hp = (h / 60.0) % 6
    x = c * (1 - np.abs(hp % 2 - 1))
    z = np.zeros_like(h)
    cond = hp.astype(np.int32)
    r = np.select([cond == 0, cond == 1, cond == 2, cond == 3, cond == 4, cond == 5], [c, x, z, z, x, c])
    g = np.select([cond == 0, cond == 1, cond == 2, cond == 3, cond == 4, cond == 5], [x, c, c, x, z, z])
    b = np.select([cond == 0, cond == 1, cond == 2, cond == 3, cond == 4, cond == 5], [z, z, x, c, c, x])
    m = v - c
    return np.stack([r + m, g + m, b + m], -1)


def recolor_block(rgb, center, inner, outer):  # rgb float32 [0,1], (...,3)
    h, s, v = rgb_to_hsv(rgb)
    d = np.abs(((h - center + 180) % 360) - 180)             # circular dist from source hue
    # Hue-only weight. NOT scaled by saturation: partial rotation is what smears a smooth
    # warm->white/dark fade into a rainbow seam. Neutral pixels have s~0, so rotating their
    # hue is a visual no-op -> the warm body lands fully on amber, edges stay clean.
    w = np.clip((outer - d) / (outer - inner), 0, 1)
    h2 = (h + (AMBER_CENTER - center) * w) % 360
    out = hsv_to_rgb(h2, s, v)
    return np.clip(out, 0, 1)


def recolor_image(path, dst, center, inner, outer):
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if has_alpha else "RGB")
    arr = np.asarray(im)
    rgb = arr[..., :3]
    alpha = arr[..., 3:] if has_alpha else None
    H = rgb.shape[0]
    out = np.empty_like(rgb)
    STRIP = 1024
    for y in range(0, H, STRIP):
        block = rgb[y:y + STRIP].astype(np.float32) / 255.0
        res = recolor_block(block, center, inner, outer)
        out[y:y + STRIP] = np.round(res * 255.0).astype(np.uint8)
    if has_alpha:
        out = np.concatenate([out, alpha], axis=-1)
    res_im = Image.fromarray(out, "RGBA" if has_alpha else "RGB")
    ext = dst.lower().rsplit(".", 1)[-1]
    if ext in ("jpg", "jpeg"):
        res_im.convert("RGB").save(dst, quality=95, subsampling=0)
    else:
        res_im.save(dst)


def fix_mountain_svg(path):
    """The line-art terrain SVG uses the legacy orange stroke; swap it to amber."""
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    n = txt.count("#FF5F00")
    if n:
        with open(path, "w", encoding="utf-8") as f:
            f.write(txt.replace("#FF5F00", "#FFC400"))
    return n


def run(src=SRC, out=OUT):
    os.makedirs(out, exist_ok=True)
    recolored, copied, fallback = [], [], []
    seen = set()
    for f in sorted(glob.glob(src + "/*")):
        name = os.path.basename(f)
        if not name.isascii():           # junk / non-brand files in the source dir
            continue
        ext = name.lower().rsplit(".", 1)[-1]
        dst = os.path.join(out, RENAME.get(name, name))
        seen.add(name)
        if ext == "svg" or name in COPY_NEUTRAL:
            shutil.copy2(f, dst); copied.append(name)
        elif ext in ("png", "jpg", "jpeg"):
            recolor_image(f, dst, ORANGE_CENTER, BAND_INNER, BAND_OUTER); recolored.append(name)
        else:
            shutil.copy2(f, dst); copied.append(name)
    # fallback: audits-era green files with no orange source (e.g. mountain forms 1.png)
    for name in ("mountain forms 1.png",):
        local = os.path.join(out, name)
        if name not in seen and os.path.exists(local):
            recolor_image(local, local, GREEN_CENTER, G_INNER, G_OUTER); fallback.append(name)
    n = fix_mountain_svg(os.path.join(out, "mountain.svg"))
    for name in STALE:
        p = os.path.join(out, name)
        if os.path.exists(p):
            os.remove(p)
    print("RECOLORED orange->amber (" + str(len(recolored)) + "):")
    for x in recolored: print("  " + x)
    print("FALLBACK green->amber (" + str(len(fallback)) + "):")
    for x in fallback: print("  " + x)
    print("COPIED AS-IS (" + str(len(copied)) + "):")
    for x in copied: print("  " + x)
    print("mountain.svg strokes -> amber: " + str(n))


if __name__ == "__main__":
    run()
