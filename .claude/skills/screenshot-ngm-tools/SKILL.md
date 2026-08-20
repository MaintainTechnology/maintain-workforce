---
name: screenshot-ngm-tools
description: >-
  This skill should be used when capturing marketing-quality screenshots of the live NGM
  tools on the Longevity Intelligence Core workspace — Biomarker Analysis, Knowledge
  Assistant, Business Advisor, and Therapy Explorer. It drives each tool with a vetted
  input via a bundled Playwright script, waits for the real output to render, hides UI
  chrome (Intercom, cookie banner, What's New modal), and saves a clean PNG cropped to the tool's output area
  for use on website pages and social media. Trigger when asked to "screenshot the NGM
  tools", "capture the platform for marketing", or "generate tool screenshots".
---

# Screenshot NGM Tools

Capture clean, marketing-ready screenshots of the live NGM tools by operating each one the
way a real user would — enter a vetted input, wait for the genuine output, then screenshot
the whole platform with no distracting UI chrome.

## What this produces

A retina-crisp PNG per tool at `screenshots/marketing/<tool>-<YYYY-MM-DD>.png`, cropped to the
tool's **output area** — the answer/result column plus its input box, excluding the workspace nav,
conversation rail, and side panels. Rendered at a 1440×900 @2x viewport, then cropped to the tool's
`captureLocator` element.

### Framing contract

The shot shows the tool **mid-use**, framed like a card:

```
┌─────────────────────────────────────┐
│ conversation title      + New Chat  │  tool header
├─────────────────────────────────────┤
│                      the question ▊ │  user bubble, at the top
│ NGM KNOWLEDGE · EVIDENCE SYNTHESIS  │  answer starts immediately under it
│ the answer, prose and bullets…      │
│ …clipped at the frame edge ─────────│  implies depth without a tall ribbon
├─────────────────────────────────────┤
│ Ask a question                    ↑ │  live composer
└─────────────────────────────────────┘
```

Roughly 700×850 logical px (1400×1700 @2x). The answer is **deliberately cut off** at the bottom —
`beforeCapture` resets the message scroller to `scrollTop 0` so the *start* of the answer is in
frame. Streaming leaves the scroller pinned to the bottom, which framed the answer's tail instead,
so the reset is explicit.

**Never a blank frame.** The capture asserts a settled, non-trivial answer before it writes a
file; if no answer renders, it throws and saves nothing. See *How it works*.

## Tools supported

| CLI name    | Tool             | Input type            | Auth |
|-------------|------------------|-----------------------|------|
| `biomarker` | Biomarker Analysis | a lab file (PDF/image) | yes |
| `knowledge` | Knowledge Assistant | a clinical question   | yes |
| `operations`| Business Advisor  | a business question   | yes |
| `therapy`   | Therapy Explorer  | a clinical hypothesis | yes |
| `curriculum`| Clinical Academy lesson deck | a lesson slug | **no** |

> **"Web Explorer" is intentionally absent.** The workspace has no such tab (verified against
> `src/views/LongevityIntelligenceCore.tsx` — the tabs are biomarker, advanced, knowledge,
> operations, growth, wearables, peptides, peptide-gps, therapy). If a "Web Explorer" is added
> later, register it in `scripts/tools.config.ts`.

## Prerequisites (both are one-time / occasional)

1. **A logged-in session.** The tools are gated client-side by subscription tier, so the browser
   must be authenticated as a **professional or admin** user. Capture the session once:
   ```bash
   npx tsx .claude/skills/screenshot-ngm-tools/scripts/save-auth.ts
   ```
   A headed browser opens — log in by hand, wait until the tools are visible, return to the
   terminal and press Enter. The session is saved to `playwright/.auth/ngm-session.json`
   (already gitignored). Automation never types credentials.

2. **A reachable app.** Either run the dev server (`npm run dev`, serves `http://localhost:3000`)
   or pass a deployed URL with `--url`. Screenshotting production/staging captures the true
   current UI.

## Usage

```bash
# Fast tools (seconds):
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool knowledge
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool operations
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool therapy

# Biomarker (slow — the pipeline can take up to ~30 min). Requires a lab file:
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool biomarker --file fixtures/sample-labs.pdf
```

Flags: `--tool` (required), `--input "..."` (override the demo prompt), `--file <path>`
(biomarker lab file, or set `BIOMARKER_SAMPLE_PATH`), `--url <base>` (default
`http://localhost:3000` or `PLAYWRIGHT_BASE_URL`), `--out <dir>` (default: the tool's own
`outDir`, else `screenshots/marketing`), `--list-figures` (dump the report's real structure
instead of capturing).

## Shot lists — many figures from one run

The marketing pages don't use whole-tool screenshots; they use **individual report figures**
(`src/assets/lab-reports/`, 7 files) and **curriculum slides** (`src/assets/curriculum/`). The
biomarker pipeline takes up to 30 minutes, so one-PNG-per-run would mean 3.5 hours of pipeline for
one set of images that all live in the same report.

`ToolConfig.shots` fixes that — a list of `{name, locator}` captured from a single run:

```bash
# One ~30-min run → all seven figures, written straight to src/assets/lab-reports/
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool biomarker --file <lab.pdf>
```

Three things make this work:

- **`shotFrame`** — the visual report is an `srcDoc` iframe (`#biomarker-visual-report-iframe`), so
  figures are unreachable from the page scope. Shots resolve via `page.frameLocator()`.
- **`beforeCapture: expandReportFrame`** — the iframe ships at `h-[350px] sm:h-[500px]` and the
  report scrolls *inside* it. An element screenshot cannot scroll a parent iframe, so any figure
  over 500px tall would come out **clipped**. The frame is grown to its `scrollHeight` first.
- **`outDir`** — output goes to the canonical asset path under the canonical filename, so a
  capture replaces the live image with no code edit.

A shot whose heading is absent from a given report is reported and skipped — one missing figure
must not discard the other six from a 30-minute run. If *nothing* matches, it throws.

### Heading text is the only stable anchor

The visual report is HTML written by an LLM on every run (`srcDoc={visualReport}`,
`LongevityIntelligenceCore.tsx:3856`). **Class names and ids differ run to run** — do not anchor
on them. `figureByHeading()` matches structural containers by their heading text instead.

The shipped heading patterns were derived from the canonical asset names and
`public/sample-report-screenshot.html`, **not yet from a live run.** Verify them once:

```bash
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool biomarker --file <lab.pdf> --list-figures
```

That prints every heading, figure and section inside the report with its rendered size, so the
`shots` entries in `tools.config.ts` can be corrected from reality in one pass.

## How it works

`scripts/capture.ts` loads the saved session, navigates to `/longevity-intelligence-core`,
pre-seeds `localStorage['cookie-consent']='accepted'`, dismisses the auto-opening What's New
modal, opens the tool's tab, **pre-flights that the tool actually mounted**, starts a fresh chat,
enters the input, **polls the tool's own "done" signal** (never a fixed sleep — the biomarker
pipeline is minutes long), frames the answer's start, hides remaining chrome, and screenshots the
tool's `captureLocator` element (its output area).

### Two guards, both fail loudly

A marketing shot that looks fine but contains no output is worse than a crash, so both failure
modes throw instead of saving:

1. **Pre-flight (seconds).** After the tab click, the tool's own input (`textarea` / `input#files`)
   must be attached. The tools are gated client-side by subscription tier, so an expired or
   under-tiered session renders them empty/locked — this catches that in 20s with a message
   pointing at `save-auth.ts`, instead of surfacing as a 15-minute wait timeout.
2. **Settled answer (`settleText`).** The assistant's `.prose` block must render and its text must
   stop growing at ≥400 chars across 3 polls. This replaced a stop-button-only wait whose every
   check was a swallowed `.catch(() => {})` — when generation hadn't started, `waitFor({state:
   'detached'})` on a never-existent element resolved *instantly* and the skill saved an empty
   conversation. Checks: `npx tsx --test .claude/skills/screenshot-ngm-tools/scripts/settle.test.ts`
   (5 cases, virtual clock, no browser — `npm test` does not cover `.claude/`).

Business Advisor and Biomarker were never affected: they wait on `[title="Download as PDF"]` and
`#biomarker-visual-report-iframe` respectively, with full timeouts and no catch.

All per-tool specifics — the tab label, how to submit, the ready-signal, and the crop target
(`captureLocator`) — live in one place: **`scripts/tools.config.ts`**. Adding a tool is one entry
there.

## Curriculum slides — no credentials needed (verified)

```bash
# 32 slides from one lesson, ~2 min, no login:
npx tsx .claude/skills/screenshot-ngm-tools/scripts/capture.ts --tool curriculum --input advanced-diagnostics
```

Verified end-to-end against a live dev server: **71 slides** captured across four lessons
(advanced-diagnostics 32, functional-lab-testing 22, thyroid 10, testosterone 7).

Why no auth: `/lp/(.*)` is allow-listed in `src/middleware.ts:33`, and the only gate is
client-side `localStorage['ngm-sales-preview-unlocked']` (`SalesLessonViewer.tsx:19`), which
`seedLocalStorage` pre-seeds. The lesson then renders the **real Clinical Academy component**
via `SalesPreviewContext`, so these are genuine slides.

Curated slugs (`src/views/preview/salesPreviewLessons.ts`): `advanced-diagnostics`,
`functional-lab-testing`, `thyroid`, `testosterone`, `ai-agents`.

> **`ai-agents` is not a deck.** It is a long-form article (h1/h2 + References `section`, 804px
> wide) with no `div.prose` and no Previous/Next. The paginate walk correctly captures nothing and
> throws rather than saving a blank. Don't "fix" it by loosening the slide locator.

Output goes to `screenshots/curriculum-review/` — a **review dump**, deliberately not
`src/assets/curriculum/`. Pick the best slides, then copy them across under the canonical
filenames.

### Two gotchas that cost real debugging time

- **Hide chrome with `opacity: 0`, never `visibility: hidden`.** The slide nav is sticky at the
  bottom of the scroller and lands in the crop, but `visibility: hidden` removes it from the
  accessibility tree — and Playwright's `getByRole('button', {name:'Next'})` will not match a node
  hidden from that tree, so the deck walk stopped after exactly one slide. `opacity: 0` is
  invisible to the camera, still clickable, and doesn't reflow.
- **No named arrow functions inside `page.evaluate`.** tsx/esbuild rewrites
  `const f = (x) => …` to `__name(f, "f")`, and `__name` does not exist in the browser context —
  it throws `ReferenceError: __name is not defined`. Inline callbacks (`.map(n => …)`) are fine.

## Verified selectors and gotchas

The tool selectors and ready-signals were verified against the live code. See
[`references/selectors.md`](references/selectors.md) for the anchor list, the per-tool ready-signal
rationale (e.g. Business Advisor has **no** aria-labels so it keys off the "Download as PDF" row),
and known fragilities. **Re-verify against the current tree before debugging a broken selector.**

## Curated inputs (marketing)

Marketing shots need great output every time, so each tool ships a vetted default prompt in
`tools.config.ts`. The biomarker tool needs a real/representative lab file — none is bundled
(labs are sensitive); supply one via `--file` or `BIOMARKER_SAMPLE_PATH`.

## Constraints

- Poll ready-signals; never fixed-sleep waiting for a result.
- **Never save a frame you have not verified has output.** A ready-signal must be an assertion with
  a full timeout and no `.catch()`. If a new tool's signal can pass vacuously, add a `settleText`
  call on its answer element.
- Never type credentials in automation — rely only on the saved session.
- Each tool crops to its own output element via `captureLocator` (chat tools → the answer column,
  anchored on the New Chat button; add one per new tool). Tools without a `captureLocator` fall
  back to a full-viewport shot. Biomarker's crop target is its report iframe / `[data-report-section]`.

## Optional v2: parallel capture

To shoot all tools at once, dispatch one browser subagent per tool (each runs `capture.ts` for
its tool). Do not build this as the default — the single-tool script is the primitive.
