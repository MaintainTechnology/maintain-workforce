#!/usr/bin/env node
/**
 * maintain-visual — Gemini image generation (Nano Banana Pro).
 * Generates brand-graded photography/art panels for social visuals.
 * No dependencies; Node 18+.
 *
 * Usage:
 *   node generate-image.mjs --prompt "..." --out panel.png [--aspect 4:5] [--size 2K] [--ref img.jpg ...]
 *   node generate-image.mjs --prompt-file prompt.txt --out panel.png --aspect 16:9
 *
 * Aspect ratios (Nano Banana Pro): 1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9
 * Reads GEMINI_API_KEY from env, then .env.local (cwd, then repo root).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRIMARY_MODEL = "gemini-3-pro-image-preview"; // Nano Banana Pro
const FALLBACK_MODEL = "gemini-2.5-flash-image";    // no imageSize support

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = { ref: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--ref") opt.ref.push(argv[++i]);
  else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
}
if (opt["prompt-file"]) opt.prompt = readFileSync(resolve(opt["prompt-file"]), "utf8");
if (!opt.prompt || !opt.out) {
  console.error("Required: --prompt (or --prompt-file) and --out");
  process.exit(1);
}

// ---- API key --------------------------------------------------------------
function findKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), ".env.local"),
    join(here, "..", "..", "..", "..", ".env.local"), // repo root from .claude/skills/maintain-visual/scripts
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^GEMINI_API_KEY=["']?([^"'\r\n]+)["']?\s*$/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}
const KEY = findKey();
if (!KEY) {
  console.error("GEMINI_API_KEY not found in env or .env.local");
  process.exit(1);
}

// ---- request --------------------------------------------------------------
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const parts = [{ text: opt.prompt }];
for (const r of opt.ref) {
  const p = resolve(r);
  parts.push({
    inline_data: {
      mime_type: MIME[extname(p).toLowerCase()] || "image/png",
      data: readFileSync(p).toString("base64"),
    },
  });
}

async function call(model, withSize) {
  const imageConfig = { aspectRatio: opt.aspect || "4:5" };
  if (withSize) imageConfig.imageSize = opt.size || "2K";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig },
      }),
    }
  );
  return res;
}

async function run() {
  let model = opt.model || PRIMARY_MODEL;
  let withSize = model !== FALLBACK_MODEL;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await call(model, withSize);
    // 404 = model id unknown; repeated 429/503 = model overloaded. Either way
    // the fallback model has independent capacity — switch instead of dying.
    if (model !== FALLBACK_MODEL && (res.status === 404 || (attempt >= 2 && (res.status === 429 || res.status >= 500)))) {
      console.error(`${model} unavailable (HTTP ${res.status}); falling back to ${FALLBACK_MODEL}`);
      model = FALLBACK_MODEL;
      withSize = false;
      attempt = 1;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = attempt * 15000;
      console.error(`HTTP ${res.status}; retrying in ${wait / 1000}s (attempt ${attempt}/3)`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
      process.exit(1);
    }
    const json = await res.json();
    const respParts = json.candidates?.[0]?.content?.parts || [];
    const img = respParts.find((p) => p.inlineData?.data);
    const txt = respParts.find((p) => p.text);
    if (txt) console.error(`Model note: ${txt.text.slice(0, 300)}`);
    if (!img) {
      console.error(`No image in response (finishReason: ${json.candidates?.[0]?.finishReason})`);
      process.exit(1);
    }
    const out = resolve(opt.out);
    writeFileSync(out, Buffer.from(img.inlineData.data, "base64"));
    console.log(`Saved ${out} (${model}, ${opt.aspect || "4:5"})`);
    return;
  }
  console.error("Exhausted retries");
  process.exit(1);
}
run();
