/**
 * screenshot-ngm-tools — marketing capture script.
 *
 * Drives one live NGM tool on /longevity-intelligence-core and captures a clean
 * full-platform screenshot of its real output.
 *
 * Usage:
 *   npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool knowledge
 *   npx tsx .../capture.ts --tool biomarker --file fixtures/sample-labs.pdf
 *   npx tsx .../capture.ts --tool operations --input "..." --url https://staging.example.com
 *
 * Prereqs:
 *   1. Saved session:  npx tsx .../save-auth.ts   (one-time human login, pro/admin tier)
 *   2. Reachable app:  npm run dev (localhost:3000) or --url <deployed>
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { TOOLS } from './tools.config';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = process.cwd();

/**
 * The What's New modal shows whenever `localStorage['ngm-whats-new-dismissed'] !== CURRENT_VERSION`
 * (src/components/WhatsNewModal.tsx). Seeding the current version stops it ever opening.
 *
 * The version is read from source rather than hardcoded: it is bumped by hand on every dashboard
 * release, and a stale literal here would silently let the modal back in. Its backdrop is an empty
 * `<div></div>` that intercepts pointer events, so a returning modal breaks the tab click with a
 * confusing "element is visible, enabled and stable / <div></div> intercepts pointer events".
 *
 * Pressing Escape is NOT sufficient — the modal mounts ~800ms after load, so with a fast
 * `domcontentloaded` navigation the keypress lands before the modal exists.
 */
function whatsNewVersion(): string {
  try {
    const src = fs.readFileSync(path.resolve(ROOT, 'src/components/WhatsNewModal.tsx'), 'utf8');
    const m = src.match(/CURRENT_VERSION\s*=\s*["'`]([^"'`]+)["'`]/);
    if (m) return m[1];
    console.warn('⚠ could not parse CURRENT_VERSION from WhatsNewModal.tsx — modal may appear');
  } catch {
    console.warn('⚠ WhatsNewModal.tsx unreadable — modal may appear');
  }
  return 'seeded-by-screenshot-skill';
}
const tool = arg('tool');
const baseUrl = arg('url', process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000')!;
const storagePath = process.env.PLAYWRIGHT_STORAGE_STATE || 'playwright/.auth/ngm-session.json';
/** --out wins; otherwise the tool's canonical outDir; otherwise the marketing scratch dir. */
const outDirArg = arg('out');
/** Dump the report's real heading/figure structure instead of capturing. */
const listFigures = process.argv.includes('--list-figures');

async function main() {
  if (!tool || !TOOLS[tool]) {
    throw new Error(`--tool must be one of: ${Object.keys(TOOLS).join(', ')}`);
  }
  const cfg = TOOLS[tool];
  const needsAuth = cfg.requiresAuth !== false;
  const input = arg('input', cfg.defaultInput) ?? '';
  const filePath = arg('file', process.env.BIOMARKER_SAMPLE_PATH);

  // Public marketing surfaces (/lp/*) need no session at all — don't demand one.
  if (needsAuth && !fs.existsSync(storagePath)) {
    throw new Error(
      `No saved session at ${storagePath}.\n` +
        `Run the one-time login first:\n` +
        `  npx tsx .claude/skills/screenshot-ngm-tools/scripts/save-auth.ts`,
    );
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ...(needsAuth ? { storageState: storagePath } : {}),
  });
  // Seed client-side gates before any app script runs: the cookie banner and the What's New
  // modal always, plus whatever this tool needs (e.g. the sales-preview unlock key).
  const seed = {
    'cookie-consent': 'accepted',
    'ngm-whats-new-dismissed': whatsNewVersion(),
    ...(cfg.seedLocalStorage ?? {}),
  };
  await context.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, seed);

  const page = await context.newPage();
  const routePath = (cfg.path ?? '/longevity-intelligence-core').replace('{input}', input);
  const url = `${baseUrl}${routePath}`;
  console.log(`→ ${url}  (tool: ${tool}${needsAuth ? '' : ', public — no session'})`);
  // 'domcontentloaded', NOT 'networkidle': layout.tsx loads Intercom, GA, PostHog and Sentry,
  // which hold connections open indefinitely, so networkidle never fires and every run died at
  // 30s. The real readiness signal is the tool's own waitForReady — networkidle was a blind
  // wait anyway, which is exactly what this skill is supposed to avoid.
  // 60s (not the 30s default) because a cold Next dev server compiles the route on first request.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Dismiss the auto-opening "What's New" modal, if present.
  await page.keyboard.press('Escape').catch(() => {});

  // Workspace tools live behind a tab and a tier gate; `page` tools are already where they need
  // to be, so both steps are skipped for them.
  if (cfg.tabLabel) {
    // Belt-and-braces: if the version seed above ever fails to parse, the modal will have mounted
    // by now (~800ms after load) and its backdrop would swallow this click.
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByText(cfg.tabLabel, { exact: true }).first().click();

    // Pre-flight: the tool's own input must exist, or the tool never mounted. The tools are gated
    // client-side by subscription tier, so an expired or under-tiered session renders them
    // empty/locked — and without this check that only surfaces as a multi-minute wait timeout.
    // 'attached' not 'visible': biomarker's file input is styled-hidden.
    await page
      .locator('textarea, input#files')
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 })
      .catch(() => {
        throw new Error(
          `"${cfg.tabLabel}" rendered no input within 20s — the tool did not mount.\n` +
            `Most likely the saved session expired or is not professional/admin tier.\n` +
            `Re-run the one-time login:\n` +
            `  npx tsx .claude/skills/screenshot-ngm-tools/scripts/save-auth.ts`,
        );
      });
  }

  // Trigger the run (nothing to drive on a `page` tool).
  if (cfg.trigger) {
    console.log(`… running ${cfg.kind === 'biomarker' ? `file=${filePath}` : `"${input}"`}`);
    await cfg.trigger(page, input, filePath);
  }

  // The submitted question must be on screen before we wait for "an answer" to settle. Chat
  // sessions are restored from the server, so a stale thread can otherwise satisfy every
  // downstream signal — verified twice: captures came back framing a previous conversation.
  if (cfg.kind === 'chat' && input) {
    const needle = input.slice(0, 50);
    await page
      .waitForFunction((n) => (document.body.innerText || '').includes(n), needle, { timeout: 60_000 })
      .catch(() => {
        throw new Error(
          `The submitted question never appeared on screen within 60s:\n  "${needle}…"\n` +
            `The capture would have framed a different conversation, so nothing was saved.`,
        );
      });
  }

  // Wait for the real output — polls the tool's own ready-signal, never a blind sleep.
  console.log(`… waiting for result (timeout ${Math.round(cfg.timeoutMs / 60000)} min)`);
  await cfg.waitForReady(page, cfg.timeoutMs);

  // Tool-specific pre-capture cleanup (e.g. hide a conversation-history rail).
  if (cfg.beforeCapture) await cfg.beforeCapture(page);

  // Final chrome cleanup so nothing leaks into a marketing shot.
  await page.addStyleTag({
    content: `
      #intercom-container, .intercom-lightweight-app, iframe[name^="intercom"],
      .intercom-launcher, [class*="intercom"] { display: none !important; }
      [role="dialog"], [aria-modal="true"] { display: none !important; }
      /* Next.js dev-tools launcher: fixed bottom-left, so it bleeds into the edge of any
         element crop taken against the dev server. Verified on the certificate capture. */
      [data-nextjs-dev-tools-button], #next-logo, nextjs-portal,
      [data-nextjs-toast], #__next-build-watcher { display: none !important; }
    `,
  });

  // Discovery mode: print what the report ACTUALLY contains, so shot headings are written from
  // reality instead of guessed. The visual report is LLM-generated per run, so its class names
  // and ids differ every time — only the heading text is worth anchoring on.
  if (listFigures) {
    // Frame-scoped for the report iframe; page-scoped for public pages like the curriculum preview.
    const body = cfg.shotFrame
      ? page.frameLocator(cfg.shotFrame).locator('body')
      : page.locator('body');
    const structure = await body.evaluate((el) =>
      Array.from(
        el.querySelectorAll('h1, h2, h3, figure, section, div.figure, [class*="slide"], [class*="Slide"]'),
      )
        .map((n) => {
          const r = n.getBoundingClientRect();
          const cls = String((n as HTMLElement).className || '').trim().split(/\s+/).filter(Boolean);
          return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            sel: `${n.tagName.toLowerCase()}${cls.length ? '.' + cls.join('.') : ''}`,
            text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
          };
        })
        // Anything smaller than this is a label, not a capturable figure.
        .filter((n) => n.w > 200 && n.h > 100)
        .map((n) => `${String(n.w).padStart(5)}x${String(n.h).padEnd(5)}  ${n.sel}\n            ${n.text}`),
    );
    console.log(`\n  Capturable blocks in ${cfg.shotFrame ?? routePath} (${structure.length}):\n`);
    for (const line of structure) console.log(`    ${line}`);
    console.log(`\n  Anchor \`shots\` in tools.config.ts on the TEXT above, not the class names.\n`);
    await browser.close();
    return;
  }

  const dir = path.resolve(ROOT, outDirArg ?? cfg.outDir ?? 'screenshots/marketing');
  fs.mkdirSync(dir, { recursive: true });

  // Walk a paginated deck, one PNG per slide, so a human can pick the best diagrams.
  if (cfg.paginate) {
    const { next, slide, max } = cfg.paginate;
    const nextBtn = page.getByRole('button', { name: next, exact: true }).first();
    let saved = 0;

    for (let i = 1; i <= max; i++) {
      const target = slide(page);
      if (!(await target.count())) break;

      const before = (await target.innerText().catch(() => '')).trim();
      // Re-run per slide: React re-renders the deck on navigation, so chrome hidden once on
      // slide 1 can come back on slide 2.
      if (cfg.beforeCapture) await cfg.beforeCapture(page);
      await target.screenshot({ path: path.join(dir, `${input}-slide-${String(i).padStart(2, '0')}.png`) });
      saved++;

      if (await nextBtn.isDisabled().catch(() => true)) break;
      await nextBtn.click();

      // Poll for the slide to actually change — never a fixed sleep. Text that stops changing
      // also means the end of the deck, which covers a Next button that never disables.
      let changed = false;
      for (let t = 0; t < 25; t++) {
        const now = (await slide(page).innerText().catch(() => '')).trim();
        if (now && now !== before) { changed = true; break; }
        await page.waitForTimeout(200);
      }
      if (!changed) break;
    }

    console.log(`\n✓ ${saved} slides → ${dir}`);
    console.log(`  Pick the best, then copy them into src/assets/curriculum/ under the canonical names.`);
    if (!saved) throw new Error('no slides captured — nothing saved.');
    await browser.close();
    return;
  }

  // Many named crops from one run (see ToolConfig.shots — a 30-min pipeline must not yield 1 PNG).
  if (cfg.shots?.length) {
    const scope = cfg.shotFrame ? page.frameLocator(cfg.shotFrame) : page;
    const saved: string[] = [];
    const missing: string[] = [];

    for (const shot of cfg.shots) {
      const target = shot.locator(scope);
      // A figure this report doesn't contain is expected (reports vary by panel) — report and
      // continue, so one absent figure cannot discard the other six from a 30-minute run.
      if ((await target.count()) === 0) {
        missing.push(shot.name);
        continue;
      }
      const outPath = path.join(dir, `${shot.name}.png`);
      await target.first().screenshot({ path: outPath });
      saved.push(shot.name);
      console.log(`  ✓ ${shot.name}.png`);
    }

    console.log(`\n✓ ${saved.length}/${cfg.shots.length} figures → ${dir}`);
    if (missing.length) {
      console.log(`⚠ not in this report: ${missing.join(', ')}`);
      console.log(`  Run with --list-figures to see what this report actually contains.`);
    }
    if (!saved.length) throw new Error('no figures matched — nothing saved. Run --list-figures.');
    await browser.close();
    return;
  }

  // Single-shot path: crop to the tool's output area, or the full viewport.
  const date = new Date().toISOString().slice(0, 10); // NOTE: UTC — an evening run stamps yesterday
  const outPath = path.join(dir, `${cfg.outName ?? `${tool}-${date}`}.png`);
  const target = cfg.captureLocator?.(page);
  if (target && cfg.clipHeight) {
    // Clip a window measured DOWN from the top of the element.
    //
    // Deliberately not capped at the element's own height: a close-up often anchors on the first
    // item of a repeating list and needs to extend through its siblings. Clamp to what is
    // actually painted below the anchor instead, so Playwright never gets an out-of-bounds clip.
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error('captureLocator has no bounding box — nothing to clip.');
    const available = await page.evaluate(
      (top) => Math.max(0, document.documentElement.scrollHeight - top),
      box.y,
    );
    const height = Math.min(cfg.clipHeight, available);
    if (height < 40) throw new Error(`only ${Math.round(height)}px paintable below the anchor — nothing worth capturing.`);
    await page.screenshot({ path: outPath, clip: { x: box.x, y: box.y, width: box.width, height } });
  } else if (target) {
    await target.screenshot({ path: outPath });
  } else {
    await page.screenshot({ path: outPath });
  }

  console.log(`✓ saved ${outPath}`);
  await browser.close();
}

main().catch((e) => {
  console.error(`✗ ${e?.message ?? e}`);
  process.exit(1);
});
