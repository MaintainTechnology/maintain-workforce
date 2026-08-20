---
name: playwright-cli
description: >-
  Drive Microsoft Playwright from the command line for deterministic, scripted
  browser automation and end-to-end testing. Use when the user wants to write
  or run Playwright tests, record a flow with codegen, take a one-shot
  screenshot or PDF of a URL, capture/inspect a trace, debug a failing test, or
  set up Playwright in a repo — in either the Node/TypeScript (`npx playwright`,
  `@playwright/test`) or Python (`playwright`, `pytest-playwright`) ecosystem.
  Triggers include "write a Playwright test", "run my e2e tests", "playwright
  codegen", "record this login flow", "screenshot this page with Playwright",
  "generate a PDF of this URL", "open the trace viewer", "playwright install",
  "npx playwright test", "pytest --headed", "set up playwright.config",
  "my Playwright test is flaky/failing". Prefer this skill for repeatable,
  scripted automation and test suites; for Claude to drive a live browser
  turn-by-turn use the agent-browser skill, and for a Python AI agent that
  autonomously controls the browser use the browser-use skill.
allowed-tools: Bash(npx playwright:*), Bash(playwright:*), Bash(python -m playwright:*), Bash(pytest:*), Bash(npm init playwright:*), Bash(npx playwright-cli:*), Bash(playwright-cli:*)
---

# Playwright CLI

Playwright is Microsoft's browser-automation and E2E-testing framework. This
skill covers driving it from the **terminal**: scaffolding, recording flows
(`codegen`), running the test runner, one-shot screenshot/PDF utilities, and the
trace viewer. Reach for it when you want **deterministic, repeatable scripts and
test suites** — not an AI agent reading and reacting to a page (that's
`agent-browser` / `browser-use`).

## ⚠ First, the #1 source of errors: Node vs Python

Playwright has two language ecosystems with **different command forms**. Pick
the one matching the project (look for `playwright.config.ts`/`package.json` →
Node; `requirements.txt`/`pyproject.toml` + `pytest` → Python) and don't cross
them.

| Task | Node / TypeScript | Python |
|---|---|---|
| Install lib | `npm i -D @playwright/test` | `pip install playwright pytest-playwright` |
| CLI form | **`npx playwright <cmd>`** | **`playwright <cmd>`** or **`python -m playwright <cmd>`** |
| Run tests | **`npx playwright test`** (built-in runner) | **`pytest`** (via the pytest plugin) |
| Install browsers | `npx playwright install` | `playwright install` |

Rules to keep straight:
- `npx playwright …` ⇒ **Node only.** `playwright …` / `python -m playwright …` ⇒ **Python only.**
- **There is no `playwright test` in Python** — Python runs `pytest`. Writing
  `npx playwright test` in a Python repo (or `pytest` in a Node repo) is the
  classic mistake.
- `python -m playwright …` is the safe form when the `playwright` script isn't
  on PATH (venv issues); it's equivalent to bare `playwright …`.

## Install & setup

```bash
# Node / TypeScript
npm init playwright@latest        # scaffold: runner + browsers + config + example tests + CI
npx playwright install            # browsers only (chromium/firefox/webkit)
npx playwright install --with-deps  # browsers + OS deps (CI / Linux)

# Python
pip install playwright pytest-playwright
playwright install                # download browsers (still required!)
playwright install --with-deps    # browsers + OS deps
```

> **Most common failure: "Executable doesn't exist / browser not installed."**
> You installed the package but not the browsers — run `… install`. On CI/Linux,
> add `--with-deps` (plain `install` does not pull OS libraries).

## The four CLI workflows

### 1. Codegen — record interactions, generate a script

```bash
npx playwright codegen https://example.com           # opens browser + Inspector; writes locators live
npx playwright codegen -o tests/login.spec.ts URL    # write straight to a file
npx playwright codegen --target python -o login.py URL   # languages: playwright-test (default), javascript, python, python-pytest, java, csharp
```

Save/reuse auth so you start logged-in (avoids re-login every run):

```bash
npx playwright codegen --save-storage=auth.json https://example.com/login   # record login → persist cookies/localStorage
npx playwright codegen --load-storage=auth.json https://example.com/dashboard  # later: start authenticated
```

The same `auth.json` feeds tests via `use: { storageState: 'auth.json' }` in config.

### 2. Test runner (Node)

```bash
npx playwright test                       # all tests, headless
npx playwright test --headed -g "checkout"  # headed, only titles matching /checkout/
npx playwright test --project=chromium    # one configured project (name must match playwright.config)
npx playwright test --ui                  # interactive UI mode: watch, time-travel, pick-locator
npx playwright test --debug               # step through in the Playwright Inspector (PWDEBUG)
npx playwright test --trace on            # record a trace for every test
npx playwright test --last-failed         # re-run only what failed
```

Config lives in `playwright.config.ts` at the repo root (`projects`, `use.baseURL`,
`use.trace`, `reporter`, `webServer`). Relative `goto('/login')` needs `use.baseURL`.

### 3. One-shot utilities (no test file needed)

```bash
npx playwright screenshot --full-page --viewport-size=1280,800 https://example.com shot.png
npx playwright pdf https://example.com out.pdf      # headless Chromium only
npx playwright open https://example.com             # open in a controlled browser (cr|wk|ff shorthands)
```

Python forms: `playwright screenshot --full-page URL shot.png`, `playwright pdf URL out.pdf`.

### 4. Trace viewer & debugging

```bash
npx playwright show-trace trace.zip       # open the Trace Viewer (DOM time-travel, network, console)
npx playwright show-report                # serve the HTML report from the last run
```

Traces also load at https://trace.playwright.dev (fully in-browser; nothing uploaded).

## Python (pytest-playwright)

```bash
pytest                                     # default: chromium, headless
pytest --headed --browser chromium         # headed
pytest --browser firefox --browser webkit  # repeatable → run across browsers
pytest --tracing retain-on-failure -k checkout   # trace failing tests; -k selects by name
pytest --slowmo 500 --video on             # observe + record
```

Plugin fixtures: `page` (fresh per test), `context` (isolated per test), `browser`
(session). View a trace with `playwright show-trace trace.zip`.

## Gotchas

- **CI/Linux missing libs** → `npx playwright install --with-deps` (or `playwright install-deps`).
- **Headless by default everywhere** → add `--headed` to watch. **PDF works only in headless Chromium.**
- **`--project=<name>` must match** a `projects[].name` in the config.
- **`@playwright/test` vs `playwright`** → tests import `@playwright/test`;
  `playwright` (core) is the library and backs the `open`/`screenshot`/`pdf` utilities.
- **`baseURL` not applied** → set `use: { baseURL }` (Node) or `--base-url` (Python), or relative URLs fail.
- Authoritative live command list for the installed version: `npx playwright --help` / `playwright --help`.

See [reference.md](reference.md) for the full flag tables (codegen, test, pytest),
device/auth recipes, and the new agent CLI.

## Heads-up: the new `@playwright/cli` agent CLI (2026) is a *different* tool

There is now a separate, agent-oriented CLI — install `npm i -g @playwright/cli`,
invoked as **`playwright-cli`** (note: not `npx playwright`). It is daemon-based
with ref-based accessibility snapshots and token-efficient output — conceptually
like `agent-browser`, for Claude driving a browser live. It is **not** the
classic developer CLI this skill centers on; don't conflate
`playwright-cli screenshot --filename=…` with `npx playwright screenshot <url> <out.png>`
(different binaries, different flags). If the goal is an interactive,
read-and-react browser session, prefer the `agent-browser` skill. Docs:
https://playwright.dev/agent-cli/introduction

## Official docs

Test CLI https://playwright.dev/docs/test-cli · Codegen https://playwright.dev/docs/codegen
· Trace Viewer https://playwright.dev/docs/trace-viewer · Browsers/install
https://playwright.dev/docs/browsers · Python https://playwright.dev/python/docs/intro
