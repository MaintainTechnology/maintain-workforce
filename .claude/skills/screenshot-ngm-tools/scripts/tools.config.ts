import type { Page, Locator, FrameLocator } from '@playwright/test';

/**
 * Per-tool capture configuration for the screenshot-ngm-tools skill.
 *
 * One entry per NGM tool tab on /longevity-intelligence-core. Adding a tool = one entry.
 * Selectors verified against src/views/LongevityIntelligenceCore.tsx and the tool components;
 * see references/selectors.md for the anchor list and re-verify before debugging.
 */

export type ToolKind = 'chat' | 'biomarker' | 'page';

export interface ToolConfig {
  /** activeTab value in LongevityIntelligenceCore. Omit for `page` tools (no workspace tab). */
  activeTab?: string;
  /** Visible nav label clicked to open the tab. Omit for `page` tools. */
  tabLabel?: string;
  kind: ToolKind;
  /** Marketing-vetted default input. Unused for biomarker (file-based). */
  defaultInput?: string;
  /** Per-tool max wait for a completed result, in ms. */
  timeoutMs: number;
  /** Enter the input and submit a run. Omit for `page` tools — nothing to drive. */
  trigger?: (page: Page, input: string, filePath?: string) => Promise<void>;

  /**
   * Path to open, relative to the base URL. Defaults to the workspace
   * (`/longevity-intelligence-core`). `{input}` is replaced with `--input`, which lets one entry
   * serve every lesson slug.
   */
  path?: string;

  /**
   * Set false for public marketing surfaces — skips the saved-session load and the tier
   * pre-flight entirely. `/lp/*` is public at the middleware, so curriculum captures need no
   * credentials at all.
   */
  requiresAuth?: boolean;

  /**
   * localStorage seeded before any app script runs, for client-side gates. `cookie-consent` is
   * always seeded; this adds per-tool keys (e.g. the sales-preview unlock).
   */
  seedLocalStorage?: Record<string, string>;

  /** Walk a paginated deck instead of taking a fixed shot list. Takes precedence over `shots`. */
  paginate?: Paginate;

  /**
   * Cap the single-shot capture at this many CSS pixels tall, measured from the top of
   * `captureLocator`. For views that are legitimately thousands of pixels long (a 12-module
   * list) but only need their first screenful as a marketing card.
   */
  clipHeight?: number;

  /**
   * Fixed output filename stem for the single-shot path, instead of `<tool>-<date>`. Set it to
   * the canonical asset name so a capture replaces the live image in place — the dated name is
   * useless when the goal is to overwrite `src/assets/clinical-knowledge-screenshot.png`.
   */
  outName?: string;
  /** Resolve once the tool's output is rendered and ready to screenshot. */
  waitForReady: (page: Page, timeoutMs: number) => Promise<void>;
  /** Optional tool-specific cleanup just before the screenshot (e.g. scroll, hide an element). */
  beforeCapture?: (page: Page) => Promise<void>;
  /** Optional: screenshot ONLY this element (the tool's output area) instead of the full viewport. */
  captureLocator?: (page: Page) => Locator;

  /**
   * Capture MANY named crops from ONE run. Takes precedence over captureLocator.
   *
   * This exists because the biomarker pipeline takes up to 30 minutes and the marketing pages
   * need seven separate report figures — one-PNG-per-run would be 3.5 hours of pipeline for a
   * set of images that all come from the same report.
   */
  shots?: Shot[];

  /**
   * CSS selector for an iframe that `shots` resolve inside, instead of the top document.
   * The biomarker visual report is an `srcDoc` iframe, so its figures are unreachable from
   * the page scope.
   */
  shotFrame?: string;

  /**
   * Default output directory for this tool's shots, relative to the repo root. Points at the
   * canonical asset path so a capture replaces the live image with no code edit. `--out` wins.
   */
  outDir?: string;
}

/** Scope a shot resolves against: the page, or a frame when `shotFrame` is set. */
export type Scope = Page | FrameLocator;

/**
 * Walk a paginated deck, capturing one crop per page.
 *
 * Lessons are slide decks (32 slides for advanced-diagnostics) with no per-slide anchor, so a
 * fixed `shots` list cannot address them. The boss's ask is "the coolest looking slides" — which
 * requires seeing all of them, so this dumps every slide to a review directory for a human to
 * pick from. Chosen slides get copied to src/assets/curriculum under the canonical names.
 */
export interface Paginate {
  /** Accessible name of the advance control. */
  next: string;
  /** What to crop on each page. */
  slide: (page: Page) => Locator;
  /** Hard stop, so a control that never disables cannot loop forever. */
  max: number;
}

/** One named crop. `name` is the output filename stem — use the canonical asset name. */
export interface Shot {
  name: string;
  locator: (scope: Scope) => Locator;
}

const MIN = 60_000;

/**
 * Click "New Chat" and PROVE the thread is empty before submitting.
 *
 * Chat sessions persist server-side, so a swallowed New Chat click silently leaves the previous
 * conversation mounted — a real capture came back framing an unrelated question ("What are the
 * most important biomarkers to track for…") and its answer, while the requested question was
 * still generating off-screen. `emptyWhenGone` is whatever only exists once an answer has
 * rendered for that tool.
 */
async function startFreshThread(page: Page, emptyWhenGone: Locator): Promise<void> {
  const newChat = page.getByRole('button', { name: 'New Chat' }).first();
  await newChat.waitFor({ state: 'visible', timeout: 20_000 });

  // Let the server-side session restore finish FIRST, so the New Chat click wins the race.
  // Clicking immediately after load meant the restore landed afterwards and re-selected the
  // previous conversation, and the question was appended to that thread instead.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  // Up to 3 attempts: click, then require a STABLE empty thread. A single-sample check passed
  // while an async restore was still in flight — two real captures framed a previous
  // conversation's answer as a result.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await newChat.click();

    let stable = 0;
    for (let i = 0; i < 24; i++) {
      stable = (await emptyWhenGone.count()) === 0 ? stable + 1 : 0;
      if (stable >= 5) return; // ~2.5s of continuous emptiness
      await page.waitForTimeout(500);
    }
  }

  throw new Error(
    'New Chat never produced a stably empty thread — refusing to capture an existing ' +
      'conversation. Nothing was saved.',
  );
}

/** Start a fresh chat, fill the box, and submit via the "Send message" button. */
async function chatTriggerAria(page: Page, input: string, placeholder: RegExp | string) {
  // Fresh thread → title matches the question and the answer renders from the top.
  await startFreshThread(page, page.locator('.prose'));
  const box = page.getByPlaceholder(placeholder);
  await box.waitFor({ state: 'visible' });
  await box.fill(input);
  await page.getByRole('button', { name: 'Send message' }).first().click();
}

/** A real answer is at least this many characters — rejects "thinking…" placeholders and
 *  the empty-conversation frame that the old stop-button-only wait used to save. */
const MIN_ANSWER_CHARS = 400;

export interface TextSource {
  innerText(): Promise<string>;
}

/**
 * Poll `src` until its text stops growing, then return the settled length.
 *
 * Streaming answers have no single "done" event we can trust across all four tools, so the
 * signal is the text itself going quiet. Throws if the deadline passes without settling at
 * >= minChars — a marketing shot must never be saved from a half-rendered or empty answer.
 *
 * `now`/`sleep` are injected so the loop is testable without a browser or real time.
 */
export async function settleText(
  src: TextSource,
  opts: {
    timeoutMs: number;
    minChars?: number;
    stablePolls?: number;
    pollMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<number> {
  const minChars = opts.minChars ?? MIN_ANSWER_CHARS;
  const stablePolls = opts.stablePolls ?? 3;
  const pollMs = opts.pollMs ?? 2_000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const deadline = now() + opts.timeoutMs;
  let last = -1;
  let stable = 0;

  while (now() < deadline) {
    const len = (await src.innerText()).length;
    if (len === last && len >= minChars) {
      if (++stable >= stablePolls) return len;
    } else {
      stable = 0;
      last = len;
    }
    await sleep(pollMs);
  }

  throw new Error(
    `answer never settled: last length ${last < 0 ? 0 : last} (need >= ${minChars} chars ` +
      `stable across ${stablePolls} polls within ${Math.round(opts.timeoutMs / 1000)}s). ` +
      `Nothing was saved — check the session tier and that generation actually started.`,
  );
}

/**
 * Done when the assistant's answer has rendered AND stopped growing (Knowledge + Therapy).
 *
 * The "Stop generating" button is a hint, not the oracle — it may never appear if generation
 * is fast or the label changes, and an absent element counts as already-detached. So it is
 * only used to absorb the streaming window; the *assertion* is a settled `.prose` block, with
 * no catch anywhere. If no answer renders, this throws and no PNG is written.
 */
async function waitForSettledAnswer(page: Page, timeoutMs: number) {
  const stop = page.getByRole('button', { name: 'Stop generating' }).first();
  await stop.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  await stop.waitFor({ state: 'detached', timeout: timeoutMs }).catch(() => {});

  // The newest assistant block. .last() — not .first() — so an earlier message can't satisfy it.
  const answer = page.locator('.prose').last();
  await answer.waitFor({ state: 'visible', timeout: timeoutMs });
  await settleText(answer, { timeoutMs });
}

/** The tool's output column: header → answer → input. Same shape across all chat tools. */
function outputColumn(page: Page): Locator {
  return page
    .locator('div.flex-1.flex.flex-col.min-h-0.min-w-0')
    .filter({ has: page.locator('textarea') })
    .first();
}

/**
 * Frame the shot the way the marketing reference does: the question at the top, the answer
 * beginning right under it, deliberately clipped at the frame edge so the card implies more
 * depth than it shows.
 *
 * Every `trigger` starts a New Chat first, so the thread holds exactly ONE exchange and the
 * top of the message scroller IS the start of that exchange — scrollTop 0. (Streaming leaves
 * the scroller pinned to the bottom, which framed the answer's *tail*, so this must be reset
 * explicitly.)
 */
async function frameAnswerStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const search = document.querySelector('input[aria-label="Search conversations"]');
    const areas = Array.from(document.querySelectorAll<HTMLElement>('.overflow-y-auto')).filter(
      (el) => !(search && el.contains(search)), // never the conversation rail
    );
    const scroller = areas.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (scroller) scroller.scrollTop = 0;
  });
}

export const REPORT_FRAME = '#biomarker-visual-report-iframe';

/**
 * Grow the report iframe to its full content height before cropping.
 *
 * The iframe ships at `h-[350px] sm:h-[500px]` (LongevityIntelligenceCore.tsx:3857) and the
 * report scrolls INSIDE it. An element screenshot cannot scroll a parent iframe, so any figure
 * taller than 500px would come out clipped. Growing the frame to its scrollHeight puts every
 * figure into layout at once.
 */
async function expandReportFrame(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    const f = document.querySelector(sel) as HTMLIFrameElement | null;
    const h = f?.contentDocument?.documentElement?.scrollHeight;
    if (f && h) f.style.height = `${h}px`;
  }, REPORT_FRAME);
  await page.waitForTimeout(300); // let reflow settle before cropping
}

/**
 * A report figure, anchored on its heading TEXT.
 *
 * The visual report is HTML written by an LLM on every run (`srcDoc={visualReport}`), so its
 * class names and ids are NOT stable run-to-run — the heading text is the only durable anchor.
 * Structural containers only (no bare `div`), and `.last()` because ancestors precede
 * descendants in document order, so it lands on the innermost matching block rather than a
 * report-sized wrapper.
 *
 * NOTE: the heading strings below are derived from the canonical asset names and the static
 * sample report, NOT yet from a live run. Verify them once with `--list-figures`.
 */
function figureByHeading(heading: string | RegExp) {
  return (scope: Scope) =>
    scope.locator('section, figure, div.figure').filter({ hasText: heading }).last();
}

/**
 * Hide the slide navigation row (Previous · progress · Next).
 *
 * It is sticky at the bottom of the lesson scroller, so it overlays the slide and lands in an
 * element screenshot — verified: the first capture of slide 07 had "revious … 7 ▬ 32 … Nex"
 * burned into the bottom edge.
 *
 * `opacity: 0`, NOT `visibility: hidden` or `display: none`:
 *  - `visibility: hidden` drops the element from the accessibility tree, and Playwright's
 *    getByRole('button', {name: 'Next'}) will not match a node hidden from that tree — that
 *    broke the deck walk after exactly one slide.
 *  - `display: none` would reflow the slide.
 * `opacity: 0` is invisible to the camera while staying clickable and keeping layout intact.
 */
async function hideSlideNav(page: Page): Promise<void> {
  await page.evaluate(() => {
    const next = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === 'Next',
    );
    // Walk up to the row that also contains "Previous" — that's the nav bar, not just the button.
    let el = next ? (next.parentElement as HTMLElement | null) : null;
    for (let i = 0; i < 5 && el; i++) {
      if ((el.textContent || '').includes('Previous')) {
        el.style.opacity = '0';
        return;
      }
      el = el.parentElement as HTMLElement | null;
    }
  });
}

export const TOOLS: Record<string, ToolConfig> = {
  knowledge: {
    activeTab: 'knowledge',
    tabLabel: 'Knowledge',
    kind: 'chat',
    defaultInput:
      "What's the mechanism linking ApoB to cardiovascular risk, and how should I act on an elevated result?",
    // KB synthesis with citations is slow AND variable — a Detailed answer can stream 3–12+ min.
    timeoutMs: 15 * MIN,
    trigger: async (page, input) => {
      await startFreshThread(page, page.locator('.prose'));
      // Lean mode → a concise answer that generates faster and frames as a compact card.
      await page.getByRole('button', { name: 'Lean', exact: true }).first().click().catch(() => {});
      const box = page.getByPlaceholder('Ask a question');
      await box.waitFor({ state: 'visible' });
      await box.fill(input);
      await page.getByRole('button', { name: 'Send message' }).first().click();
    },
    waitForReady: waitForSettledAnswer,
    captureLocator: outputColumn,
    beforeCapture: frameAnswerStart,
    // Review dir, NOT src/assets. Writing straight to the canonical name overwrote a live asset
    // imported by 6 views with an unusable frame on the first real run. Approve, then promote.
    outDir: 'screenshots/tools-review',
    outName: 'clinical-knowledge-screenshot',
  },

  therapy: {
    activeTab: 'therapy',
    tabLabel: 'Therapy Explorer',
    kind: 'chat',
    defaultInput: 'Explore novel peptide options for improving insulin sensitivity.',
    timeoutMs: 8 * MIN,
    trigger: (page, input) => chatTriggerAria(page, input, /Ask a clinical question/),
    waitForReady: waitForSettledAnswer,
    captureLocator: outputColumn,
    beforeCapture: frameAnswerStart,
  },

  operations: {
    activeTab: 'operations',
    tabLabel: 'Business Advisor',
    kind: 'chat',
    /**
     * Avoids asking for the advisor's *own views*, which made it stop and ask which knowledge
     * base to ground in — leaking `ngm-general-kb` / `ngm-preview-core-kb` into the frame. A
     * concrete operational question gets a self-contained answer.
     */
    defaultInput:
      'What are the core components of a patient membership agreement for a longevity practice?',
    timeoutMs: 6 * MIN,
    // Business Advisor exposes NO aria-labels on send/stop — submit via Enter.
    trigger: async (page, input) => {
      // Sessions persist server-side (/api/business-advisor/sessions); "Download as PDF" only
      // exists once an answer has finished, so its absence proves an empty thread.
      await startFreshThread(page, page.getByTitle('Download as PDF'));

      const box = page.getByPlaceholder('Ask a question');
      await box.waitFor({ state: 'visible' });
      await box.fill(input);
      await box.press('Enter');
    },
    /**
     * "Download as PDF" only renders on a *finished* answer — but it is per-message, so it goes
     * visible as soon as ONE answer completes even while another is still generating. A real run
     * captured a finished answer with a second "Processing - may take up to 5 minutes" block still
     * spinning underneath it. So require the action row AND no in-flight generation.
     */
    waitForReady: async (page, timeoutMs) => {
      await page.getByTitle('Download as PDF').first().waitFor({ state: 'visible', timeout: timeoutMs });

      // The processing block carries its own copy; wait for every one of them to clear.
      const processing = page.getByText(/Processing\s*-\s*may take up to/i);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if ((await processing.count()) === 0) return;
        await page.waitForTimeout(3_000);
      }
      throw new Error('a generation was still in flight at the deadline — refusing to capture a half-finished thread.');
    },
    captureLocator: outputColumn,
    beforeCapture: frameAnswerStart,
    // Review dir, NOT src/assets — this is the most widely used asset on the site (7 views) and
    // must never be replaced by an unreviewed capture. Approve, then promote.
    outDir: 'screenshots/tools-review',
    outName: 'business-advisor-screenshot',
  },

  biomarker: {
    activeTab: 'biomarker',
    tabLabel: 'Biomarker Analysis',
    kind: 'biomarker',
    timeoutMs: 30 * MIN,
    trigger: async (page, _input, filePath) => {
      if (!filePath) {
        throw new Error('biomarker requires --file <lab.(pdf|jpg|png|txt|csv)> or BIOMARKER_SAMPLE_PATH');
      }
      await page.locator('input#files').setInputFiles(filePath);
      await page.getByRole('button', { name: /Generate analysis report/i }).click();
    },
    // The visual report iframe only mounts once the report is ready.
    waitForReady: async (page, timeoutMs) => {
      await page.locator(REPORT_FRAME).waitFor({ state: 'visible', timeout: timeoutMs });
      await page.locator(REPORT_FRAME).scrollIntoViewIfNeeded();
    },
    beforeCapture: expandReportFrame,

    // Figures live inside the srcDoc iframe — unreachable from the page scope.
    shotFrame: REPORT_FRAME,

    // Review dir, NOT src/assets/lab-reports. Same rule as the chat tools: a 30-minute pipeline
    // can still produce a clipped or mid-generation frame, and these 7 figures are live on 5 pages.
    outDir: 'screenshots/reports-review',

    /**
     * One 30-minute run → all seven marketing figures. Names match the existing asset
     * filenames exactly (see src/assets/lab-reports/), so output overwrites in place.
     * A shot whose heading is absent from this report is reported and skipped, not fatal.
     */
    shots: [
      { name: 'risk-stratification-matrix', locator: figureByHeading(/Risk Stratification/i) },
      { name: 'intervention-priority', locator: figureByHeading(/Intervention Priority/i) },
      { name: 'glycemic-pathway', locator: figureByHeading(/Glycemic|Glucose|Insulin/i) },
      { name: 'metabolic-biomarker-overview', locator: figureByHeading(/Metabolic (Function|Biomarker|Overview)/i) },
      { name: 'intervention-strategy', locator: figureByHeading(/Recommended Interventions|Intervention Strategy/i) },
      { name: 'cardiovascular-findings', locator: figureByHeading(/Cardiovascular/i) },
      { name: 'hpg-axis-diagram', locator: figureByHeading(/HPG|Hypothalamic|Gonadal/i) },
    ],

    // Fallback when --shots is off: the whole report section, not the upload dashboard.
    captureLocator: (page) => page.locator('[data-report-section]').first(),
  },

  /**
   * The REAL lecture viewer (`src/views/preview/NGMLectureViewer.tsx`) as members see it.
   *
   * Exists because a supplied design screenshot of "a lecture" invented an outline sidebar,
   * per-slide source citations, a per-lecture "CME 0.75" badge and module-unlock progress copy.
   * None of those are in the component: it is a single column with a module kicker, serif title,
   * a `{duration} min / {slides.length} slides / {level}` meta row, the slide body, and a sticky
   * Previous / progress / Next bar. A marketing screenshot must show what ships, so shoot it.
   *
   * Same public no-auth surface as `curriculum` (/lp/(.*) allow-listed, localStorage gate seeded).
   */
  lecture: {
    kind: 'page',
    requiresAuth: false,
    path: '/lp/curriculum-preview/{input}',
    defaultInput: 'advanced-diagnostics',
    seedLocalStorage: { 'ngm-sales-preview-unlocked': '1' },
    timeoutMs: 90_000,
    outDir: 'screenshots/academy-review',
    outName: 'academy-lecture-real',

    waitForReady: async (page, timeoutMs) => {
      await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
      await settleText(page.locator('main, body').first(), { timeoutMs, minChars: 1_000 });
    },

    // Drop the site nav and the sticky slide-nav bar: the first is page chrome, the second
    // overlays the content in an element crop (same sticky-overlap problem as the deck walk).
    beforeCapture: async (page) => {
      await page.evaluate(() => {
        const nav = document.querySelector('nav, header[class*="sticky"]') as HTMLElement | null;
        if (nav) nav.style.display = 'none';
        const next = Array.from(document.querySelectorAll('button')).find(
          (b) => (b.textContent || '').trim() === 'Next',
        );
        let el = next ? (next.parentElement as HTMLElement | null) : null;
        for (let i = 0; i < 5 && el; i++) {
          if ((el.textContent || '').includes('Previous')) { el.style.opacity = '0'; return; }
          el = el.parentElement as HTMLElement | null;
        }
      });
      await page.waitForTimeout(250);
    },

    // The lecture <header> (module kicker, title, meta row) is the top of the real chrome.
    captureLocator: (page) => page.locator('header.bg-gradient-to-b').first(),
    clipHeight: 1180,
  },

  /**
   * A CLOSE-UP of the curriculum feature: the module rows themselves, cropped tight so the
   * level eyebrow, roman numeral, topic chips, lecture/CME counts and completion ring are all
   * legible at card size. The `academy` shot below is the wide view (header + stats); this is
   * the detail view for placing beside body copy.
   */
  'academy-modules': {
    kind: 'page',
    requiresAuth: false,
    path: '/dev-academy-preview',
    timeoutMs: 60_000,
    outDir: 'screenshots/academy-review',
    outName: 'academy-module-detail',

    waitForReady: async (page, timeoutMs) => {
      await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
      await settleText(page.locator('body'), { timeoutMs, minChars: 1_500 });
    },

    // Hide the harness's replica tab bar, then scroll the first module row to the top so the
    // clip below starts on a row boundary rather than mid-stat.
    beforeCapture: async (page) => {
      await page.evaluate(() => {
        const bar = document.querySelector('div.sticky') as HTMLElement | null;
        if (bar) bar.style.display = 'none';
      });
      await page.waitForTimeout(250);
    },

    /**
     * Anchor on the first module's heading, then walk to the list container.
     *
     * Probed depths from that h3: div[1]=668x153 text block, div[2]=848x192 single row,
     * div[3]=848x194 row+rule, div[4]=880x2865 the whole tab content. The row sits inside an <a>,
     * which the `ancestor::div` axis skips. Never `.filter({hasText}).last()` here: that lands
     * deep inside the LAST module, not the first.
     *
     * Anchor on the FIRST ROW (div[3]), not the content container: `clipHeight` measures down
     * from the locator's top edge, so anchoring on the container reproduced the header + stats
     * instead of a close-up. Clipping from the row extends down through its sibling rows.
     */
    captureLocator: (page) =>
      page.getByRole('heading', { name: 'The Biology of Aging' }).locator('xpath=ancestor::div[3]'),

    // ~3 of the 12 rows (192px each) — enough to read the pattern, short enough to sit beside copy.
    clipHeight: 580,
  },

  /**
   * The canonical <Certificate> component, rendered with specimen data by the dev-only
   * /dev-certificate-preview harness.
   *
   * CLAUDE.md: this template is a verbatim port of the supplied design and must never be
   * rebuilt or restyled. Capturing it is the ONLY correct way to show a certificate in
   * marketing — do not redraw it in a section.
   */
  certificate: {
    kind: 'page',
    requiresAuth: false,
    path: '/dev-certificate-preview',
    timeoutMs: 45_000,
    outDir: 'screenshots/academy-review',
    outName: 'certificate-specimen',

    waitForReady: async (page, timeoutMs) => {
      // The card carries the holder name and credential id; wait for real text, not just a mount.
      await page.locator('#certificate-capture').waitFor({ state: 'visible', timeout: 20_000 });
      await settleText(page.locator('#certificate-capture'), { timeoutMs, minChars: 200 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(600); // Zen Old Mincho / Herr Von Muellerhoff need a beat to paint
    },

    captureLocator: (page) => page.locator('#certificate-capture'),
  },

  /**
   * The in-app Clinical Academy tab — i.e. what `/mentorship-content?tab=clinical-academy`
   * renders, which is the site's LATEST academy design ("NGM Academy 1a Editorial Index").
   *
   * That route is authed, but `/dev-academy-preview` mounts the same `ClinicalAcademyTab`
   * component with real registry data and no auth (dev-only, allow-listed in
   * src/middleware.ts under the NODE_ENV !== 'production' block). Same component, same design,
   * no credentials — so this is the capture surface, not the gated dashboard.
   */
  academy: {
    kind: 'page',
    requiresAuth: false,
    path: '/dev-academy-preview',
    timeoutMs: 60_000,
    outDir: 'screenshots/academy-review',

    // The module list is registry-driven and long; a rendered tab has plenty of text.
    waitForReady: async (page, timeoutMs) => {
      await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
      await settleText(page.locator('body'), { timeoutMs, minChars: 1_500 });
    },

    /**
     * Drop the harness's REPLICA tab bar. It must not ship in marketing — it would present
     * harness scaffolding as product UI. What remains is the real ClinicalAcademyTab.
     */
    beforeCapture: async (page) => {
      await page.evaluate(() => {
        const bar = document.querySelector('div.sticky') as HTMLElement | null;
        if (bar) bar.style.display = 'none';
      });
      await page.waitForTimeout(250); // let the reflow settle
    },

    // The harness wraps the real tab in this container (dev-academy-preview/page.tsx).
    captureLocator: (page) => page.locator('div.max-w-6xl.mx-auto.px-6').last(),

    // The full tab is 2865px tall — a wall of twelve modules, useless as a card. Clip to the
    // header + stats + first four modules. A clip is deterministic; trying to hide the later
    // rows via DOM surgery kept mis-identifying the list container.
    clipHeight: 760,
  },

  /**
   * Curriculum slides from the PUBLIC sales preview — no credentials required.
   *
   * `/lp/(.*)` is allow-listed in src/middleware.ts:33, and the only gate is client-side
   * localStorage (`ngm-sales-preview-unlocked`, SalesLessonViewer.tsx:19) which we pre-seed.
   * The lesson renders the real Clinical Academy component via SalesPreviewContext, so these
   * are genuine curriculum slides, not mockups.
   *
   * Pick the lesson with --input. Curated slugs (salesPreviewLessons.ts):
   *   advanced-diagnostics | functional-lab-testing | thyroid | testosterone | ai-agents
   */
  curriculum: {
    kind: 'page',
    requiresAuth: false,
    path: '/lp/curriculum-preview/{input}',
    defaultInput: 'advanced-diagnostics',
    seedLocalStorage: { 'ngm-sales-preview-unlocked': '1' },
    timeoutMs: 90_000,

    // A review dump, NOT the canonical dir — 32 slides must not be sprayed into src/assets.
    // Pick the best, then copy them over under the canonical curriculum filenames.
    outDir: 'screenshots/curriculum-review',

    // A lesson that rendered has substantial prose; a redirect back to the gate does not.
    // Reusing settleText means a bounced capture throws instead of saving the gate page.
    waitForReady: async (page, timeoutMs) => {
      await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
      await settleText(page.locator('main, body').first(), { timeoutMs, minChars: 1_000 });
    },

    beforeCapture: hideSlideNav,

    // Verified against the live deck: Previous/Next buttons, slide body in `div.prose`
    // (1056x443 for advanced-diagnostics). There are no <section>/<figure> elements and the
    // classes are Tailwind, so `.prose` is the only meaningful slide container.
    paginate: {
      next: 'Next',
      slide: (page) => page.locator('div.prose').first(),
      max: 60, // advanced-diagnostics is 32; headroom for longer decks
    },
  },
};
