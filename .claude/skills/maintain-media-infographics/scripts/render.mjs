#!/usr/bin/env node
/**
 * Maintain Media infographics renderer.
 * Loads assets/generator.html, injects a SLIDES array, and exports
 *   slide-1.png … slide-N.png  +  carousel.pdf
 * at the exact target dimensions.
 *
 * Usage:
 *   node scripts/render.mjs [slides.json] [--size 1080x1350] [--out ./out] [--footer "handle"] [--scale 1]
 *   node scripts/render.mjs                      # renders the built-in example deck
 *
 * Requires Playwright:  npm i -D playwright && npx playwright install chromium
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join, relative, sep, basename, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(__dirname, '..');
const ASSETS_DIR = join(SKILL, 'assets');
const GEN = join(ASSETS_DIR, 'generator.html');

// Scan EVERY image under assets/ so the engine can use the whole library, and stay in
// sync as new assets are dropped in. Keys are normalised file names; values are paths
// relative to assets/ (the generator resolves + URL-encodes them at use).
const IMG = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
const normKey = s => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/[^a-z0-9]/g, '');
function scanAssets() {
  const icons = {}, backgrounds = {}, logos = {};
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { walk(p); continue; }
      const ext = extname(p).toLowerCase();
      if (!IMG.has(ext)) continue;
      const rel = relative(ASSETS_DIR, p).split(sep).join('/');
      const parent = (rel.split('/').slice(-2, -1)[0] || '').toLowerCase();
      const key = normKey(basename(p));
      const isSvg = ext === '.svg';
      if (/icon/.test(parent)) { if (!icons[key] || (isSvg && !icons[key].endsWith('.svg'))) icons[key] = rel; }
      else if (parent === 'logos' || parent === 'logo') { if (!logos[key] || (isSvg && !logos[key].endsWith('.svg'))) logos[key] = rel; }
      else if (/background|graphic|identifier/.test(parent)) { if (!backgrounds[key]) backgrounds[key] = rel; }
    }
  };
  walk(ASSETS_DIR);
  return { icons, backgrounds, logos };
}
const manifest = scanAssets();

// ---- args ----
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const slidesPath = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
const [W, H] = (flag('size', '1080x1350')).split('x').map(Number);
const OUT = resolve(flag('out', './out'));
const FOOTER = flag('footer', 'maintainmedia.com');
const SCALE = Number(flag('scale', '1'));

// ---- slides ----
let slides;
if (slidesPath) {
  slides = JSON.parse(readFileSync(resolve(slidesPath), 'utf8'));
} else if (existsSync(join(SKILL, 'SLIDES.example.json'))) {
  slides = JSON.parse(readFileSync(join(SKILL, 'SLIDES.example.json'), 'utf8'));
} else {
  slides = null; // generator falls back to its built-in example
}
if (slides && !Array.isArray(slides)) slides = slides.slides || [];

// ---- playwright ----
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('\nPlaywright is not installed. Install it once:\n  npm i -D playwright && npx playwright install chromium\n');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
await page.addInitScript((data) => { window.__ASSETS = data; window.__NO_AUTORENDER = true; }, manifest);
await page.goto(pathToFileURL(GEN).href, { waitUntil: 'load' });
console.log(`  assets discovered: ${Object.keys(manifest.icons).length} icons, ${Object.keys(manifest.backgrounds).length} backgrounds, ${Object.keys(manifest.logos).length} logos`);

// render + wait for fonts and every image (icons, logo)
await page.evaluate(async ({ slides, W, H, FOOTER }) => {
  await window.renderSlides(slides || window.SLIDES, { width: W, height: H, footer: FOOTER });
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
  document.querySelectorAll('.slide').forEach(el => { /* re-fit after images */ });
}, { slides, W, H, FOOTER });
await page.waitForTimeout(150);

// ---- PNG per slide ----
const handles = await page.$$('.slide');
const pngs = [];
for (let i = 0; i < handles.length; i++) {
  const p = join(OUT, `slide-${i + 1}.png`);
  await handles[i].screenshot({ path: p });
  pngs.push(p);
  console.log('  ✓ ' + p);
}

// ---- carousel PDF (assembled from the exact PNGs) ----
// Write the assembly page to a real file next to the PNGs and open it via file://.
// (setContent() gives the page a non-file origin, and Chromium blocks file:// <img>
//  from a non-file origin — which silently produces a blank, image-less PDF.)
const pdfHtmlPath = join(OUT, '_carousel.html');
const pdfHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:${W}px ${H}px;margin:0}
  html,body{margin:0;padding:0;background:#000}
  img{display:block;width:${W}px;height:${H}px;page-break-after:always}
  img:last-child{page-break-after:auto}
</style></head><body>${pngs.map(p => `<img src="./${basename(p)}">`).join('')}</body></html>`;
writeFileSync(pdfHtmlPath, pdfHtml);
const pdfPage = await browser.newPage();
await pdfPage.goto(pathToFileURL(pdfHtmlPath).href, { waitUntil: 'load' });
await pdfPage.evaluate(() => Promise.all([...document.images].map(i => (i.complete && i.naturalWidth) ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
const pdfPath = join(OUT, 'carousel.pdf');
await pdfPage.pdf({ path: pdfPath, width: `${W}px`, height: `${H}px`, printBackground: true, preferCSSPageSize: true });
try { unlinkSync(pdfHtmlPath); } catch {}
console.log('  ✓ ' + pdfPath);

await browser.close();
console.log(`\nDone — ${pngs.length} slides (${W}×${H}) + carousel.pdf in ${OUT}`);
