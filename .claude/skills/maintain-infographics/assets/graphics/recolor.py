"""Recolor Maintain source graphics: orange highlight -> Assurance Green #3DDC84.
Hue-only selective rotation. Cool/teal/dark regions (already forge-blue family) untouched.
Structure, wireframe density and glow falloff are preserved exactly."""
import os, glob, shutil
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

SRC = r"C:/Users/dalig/Desktop/MaintainTech/MaintainOrg/maintain-technology/maintain/01 Visual Identity/graphics"
OUT = r"C:/Users/dalig/Desktop/MaintainTech/MaintainOrg/maintain-audits/design-system/graphics"
os.makedirs(OUT, exist_ok=True)

# Files copied through unchanged (already brand teal, or neutral white). SVGs also copied (ext branch).
COPY_NEUTRAL = {
    "blue-gradient.png",        # already the teal twin of orange-gradient
    "white bg.jpg", "white-gradient.png", "white-lineargradient.png",
}

# --- recolor params ---
ORANGE_CENTER = 25.0     # deg: dominant orange hue in the source art
GREEN_CENTER  = 147.0    # deg: hue of Assurance Green #3DDC84
DELTA = GREEN_CENTER - ORANGE_CENTER          # +122 deg
BAND_INNER, BAND_OUTER = 20.0, 62.0           # full warm weight <=20deg, zero >=62deg from center


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


def recolor_block(rgb):  # rgb float32 [0,1], (...,3)
    h, s, v = rgb_to_hsv(rgb)
    d = np.abs(((h - ORANGE_CENTER + 180) % 360) - 180)          # circular dist from orange
    # Hue-only weight. NOT scaled by saturation: partial rotation is what smears a smooth
    # orange->white/dark fade into a rainbow seam. Neutral pixels have s~0, so rotating their
    # hue is a visual no-op -> the orange body lands fully on green, edges stay clean.
    w = np.clip((BAND_OUTER - d) / (BAND_OUTER - BAND_INNER), 0, 1)
    h2 = (h + DELTA * w) % 360
    out = hsv_to_rgb(h2, s, v)
    return np.clip(out, 0, 1)


def recolor_image(path, dst):
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
        res = recolor_block(block)
        out[y:y + STRIP] = np.round(res * 255.0).astype(np.uint8)
    if has_alpha:
        out = np.concatenate([out, alpha], axis=-1)
    res_im = Image.fromarray(out, "RGBA" if has_alpha else "RGB")
    ext = dst.lower().rsplit(".", 1)[-1]
    if ext in ("jpg", "jpeg"):
        res_im.convert("RGB").save(dst, quality=95, subsampling=0)
    else:
        res_im.save(dst)


def run(src=SRC, out=OUT):
    os.makedirs(out, exist_ok=True)
    recolored, copied = [], []
    for f in sorted(glob.glob(src + "/*")):
        name = os.path.basename(f)
        ext = name.lower().rsplit(".", 1)[-1]
        dst = os.path.join(out, name)
        if ext == "svg" or name in COPY_NEUTRAL:
            shutil.copy2(f, dst); copied.append(name)
        elif ext in ("png", "jpg", "jpeg"):
            recolor_image(f, dst); recolored.append(name)
        else:
            shutil.copy2(f, dst); copied.append(name)
    print("RECOLORED (" + str(len(recolored)) + "):")
    for n in recolored: print("  " + n)
    print("COPIED AS-IS (" + str(len(copied)) + "):")
    for n in copied: print("  " + n)


if __name__ == "__main__":
    run()
