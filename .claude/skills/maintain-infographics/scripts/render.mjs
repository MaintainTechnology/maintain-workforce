#!/usr/bin/env node
/**
 * Maintain Audits — infographic renderer.
 * Reads a SLIDES deck (slides.json), drives assets/generator.html in headless
 * Chromium (Playwright), and writes slide-1.png … slide-N.png + carousel.pdf.
 *
 * Usage:
 *   node scripts/render.mjs [deck.json] [--out DIR] [--size WxH]
 * Requires: npm i playwright && npx playwright install chromium
 */
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(__dirname, "..");
const GEN = path.join(SKILL, "assets", "generator.html");

// ---- args ----
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const deckFile = path.resolve(args.find(a => !a.startsWith("--") && a.endsWith(".json")) || path.join(SKILL, "slides.json"));
const outDir = path.resolve(flag("--out", path.join(process.cwd(), "out")));
const sizeOverride = flag("--size", null);

// ---- locate repo root (for the real logo/icon sprite) ----
function findRepoRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(d, "design-system", "assets", "sprite.svg"))) return d;
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return null;
}
const repoRoot = findRepoRoot(SKILL);

// ---- anti-slop copy lint (warn, never rewrite the user's words) ----
const BANNED = [
  [/\p{Extended_Pictographic}/u, "emoji"],
  [/!/, "exclamation mark"],
  [/[—–]/, "em/en dash (use a comma, colon, or period)"],
];
function lint(deck) {
  const hits = [];
  (deck.slides || []).forEach((s, i) => {
    for (const [k, v] of Object.entries(s)) {
      const scan = t => BANNED.forEach(([re, name]) => { if (re.test(t)) hits.push(`slide ${i + 1} .${k}: ${name} → "${t}"`); });
      if (typeof v === "string") scan(v);
      else if (Array.isArray(v)) v.forEach(x => scan(typeof x === "string" ? x : (x?.title || "") + " " + (x?.detail || "")));
    }
  });
  return hits;
}

// ---- background graphics resolver (mirror of generator.html's BG catalog) ----
const BG = {
  "green-gradient": "graphics/web/green-gradient.jpg", "blue-gradient": "graphics/web/blue-gradient.jpg",
  "gradient": "graphics/web/gradient.jpg", "gradient-portrait": "graphics/web/gradient-portrait.jpg",
  "cover": "graphics/web/cover.jpg", "cover-2": "graphics/web/cover-2.jpg", "section": "graphics/web/section.jpg",
  "mountain-forms-1": "graphics/web/mountain-forms-1.jpg", "mountain-forms-2": "graphics/web/mountain-forms-2.jpg",
  "pantone-glow": "graphics/web/pantone-glow.jpg", "blu-gradient": "graphics/web/blu-gradient.svg",
  "mountain": "graphics/mountain.svg", "gradient-white": "graphics/web/gradient-white.jpg",
  "white-bg": "graphics/web/white-bg.jpg", "white-gradient": "graphics/web/white-gradient.jpg",
  "white-linear": "graphics/web/white-linear.jpg", "mountain-line": "graphics/web/mountain-line.jpg",
};
function bgSrc(bg) { if (!bg) return null; if (BG[bg]) return BG[bg]; return bg.includes("/") ? bg : `graphics/web/${bg}${bg.includes(".") ? "" : ".jpg"}`; }
function bgMissing(bg) { const s = bgSrc(bg); return s ? !existsSync(path.join(SKILL, "assets", s)) : false; }

async function main() {
  if (!existsSync(deckFile)) { console.error("Deck not found:", deckFile); process.exit(1); }
  const deck = JSON.parse(await readFile(deckFile, "utf8"));
  const norm = Array.isArray(deck) ? { slides: deck } : deck;
  if (sizeOverride) norm.size = sizeOverride;
  const [w, h] = String(norm.size || "1080x1350").split("x").map(Number);

  const warnings = lint(norm);
  if (warnings.length) {
    console.warn("\n⚠ anti-slop copy warnings (fix these, then re-run):");
    warnings.forEach(x => console.warn("  - " + x));
    console.warn("");
  }

  const missingBg = (norm.slides || []).map((s, i) => (s.bg && bgMissing(s.bg)) ? `slide ${i + 1}: bg "${s.bg}"` : null).filter(Boolean);
  if (missingBg.length) {
    console.warn("⚠ background graphic not found (slide falls back to the grid surface):");
    missingBg.forEach(x => console.warn("  - " + x));
    console.warn("");
  }

  let sprite = "";
  if (repoRoot) sprite = await readFile(path.join(repoRoot, "design-system", "assets", "sprite.svg"), "utf8")
    .then(s => s.replace(/style="[^"]*"/, 'style="position:absolute;width:0;height:0"')).catch(() => "");
  else console.warn("⚠ design-system/sprite.svg not found — falling back to text wordmark.");

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(GEN).href, { waitUntil: "load" });
  await page.evaluate(({ deck, sprite }) => {
    if (sprite) document.getElementById("sprite").innerHTML = sprite;
    window.DECK = deck; window.renderDeck();
  }, { deck: norm, sprite });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);

  // overflow (text-clipping) check per stage
  const overflow = await page.$$eval(".stage", els => els.map((el, i) =>
    el.scrollHeight > el.clientHeight + 2 ? i + 1 : null).filter(Boolean));
  if (overflow.length) console.warn("⚠ content overflows on slide(s):", overflow.join(", "), "— shorten copy or reduce items.");

  const stages = await page.$$(".stage");
  const pngs = [];
  for (let i = 0; i < stages.length; i++) {
    const p = path.join(outDir, `slide-${i + 1}.png`);
    await stages[i].screenshot({ path: p });
    pngs.push(p);
  }

  // assemble carousel.pdf from the exact-size PNGs (one page each)
  const imgs = await Promise.all(pngs.map(async p =>
    `data:image/png;base64,${(await readFile(p)).toString("base64")}`));
  const pdfHtml = `<style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0}
    img{display:block;width:${w}px;height:${h}px;page-break-after:always}img:last-child{page-break-after:auto}</style>`
    + imgs.map(d => `<img src="${d}">`).join("");
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(pdfHtml, { waitUntil: "load" });
  await pdfPage.pdf({ path: path.join(outDir, "carousel.pdf"), width: `${w}px`, height: `${h}px`, printBackground: true, preferCSSPageSize: true });

  await browser.close();
  console.log(`✓ ${pngs.length} slides + carousel.pdf → ${outDir}`);
}
main().catch(e => { console.error(e); process.exit(1); });
