# Playwright CLI — reference

Deep reference for driving Playwright from the terminal. Verified against
**Playwright 1.60** (mid-2026). Live truth for any install: `npx playwright --help`
(Node) / `playwright --help` (Python).

## Contents
- [Node vs Python](#node-vs-python)
- [Install](#install)
- [codegen](#codegen-record--generate)
- [test runner (Node)](#test-runner-node)
- [Reports & traces](#reports--traces)
- [One-shot utilities](#one-shot-utilities)
- [Python pytest-playwright](#python-pytest-playwright)
- [Config essentials](#config-essentials)
- [Auth / storage state](#auth--storage-state)
- [Gotchas](#gotchas)
- [The 2026 agent CLI (@playwright/cli)](#the-2026-agent-cli-playwrightcli)

## Node vs Python
| | Node / TypeScript | Python |
|---|---|---|
| Packages | `@playwright/test` (runner) + `playwright` (lib) | `playwright` + `pytest-playwright` |
| Scaffold | `npm init playwright@latest` | `pip install playwright pytest-playwright` |
| CLI form | `npx playwright <cmd>` | `playwright <cmd>` or `python -m playwright <cmd>` |
| Run tests | `npx playwright test` | `pytest` (the plugin — **no** `playwright test`) |
| Install browsers | `npx playwright install` | `playwright install` |
| OS deps | `npx playwright install-deps` | `playwright install-deps` |

`npx playwright …` ⇒ Node only · `playwright …` / `python -m playwright …` ⇒ Python only. Don't cross them.

## Install
```bash
# Node
npm init playwright@latest        # runner + browsers + config + example tests + GH Action
npm i -D @playwright/test         # add to an existing repo
npx playwright install            # browsers only
npx playwright install chromium   # one browser
npx playwright install --with-deps  # browsers + OS deps (CI/Linux)

# Python
pip install playwright pytest-playwright
playwright install [chromium] [--with-deps]
pip install -U playwright pytest-playwright   # update
```

## codegen (record → generate)
`npx playwright codegen [url]` (Python: `playwright codegen [url]`). Opens the target + Inspector; writes resilient locators (`getByRole`/`getByText`/`getByTestId`) live.
```
-o, --output <file>        write generated script to file
--target <lang>            playwright-test (default) | javascript | python | python-async
                           | python-pytest | java | csharp
-b, --browser <name>       chromium | firefox | webkit
--save-storage <file>      persist cookies/localStorage/IndexedDB at session end (auth)
--load-storage <file>      start from previously saved storage (already authenticated)
--device "<name>"          emulate device, e.g. "iPhone 13"
--viewport-size <w,h>      e.g. 800,600
--color-scheme light|dark
--test-id-attribute <attr> generate getByTestId against a custom attribute
--timezone / --geolocation / --lang / --user-data-dir
```

## test runner (Node)
`npx playwright test [filter...]`
```
--headed                 show browser (default headless)
--ui                     interactive UI mode (watch, time-travel, pick-locator, per-test trace)
--project <name...>      run configured project(s); name must match playwright.config
--debug                  Playwright Inspector step-through (sets headed + workers=1; = PWDEBUG=1)
-g, --grep <regex>       run tests whose title matches
--trace <mode>           on | off | on-first-retry | on-all-retries | retain-on-failure
-j, --workers <n|%>      parallel workers (--workers=1 to serialize)
--reporter <name>        list|dot|line|html|json|junit|blob (comma-combine)
--last-failed            re-run only last run's failures
--repeat-each <n>        run each selected test N times (flake hunting)
--retries <n> / --timeout <ms> / -x|--max-failures <n>
--list                   list matching tests, don't run
--shard <cur/all>        e.g. --shard=1/3 for distributed CI
-u, --update-snapshots   refresh screenshot/snapshot baselines
-c, --config <file>      use a specific config
--forbid-only            fail if test.only is committed (CI guard)
```

## Reports & traces
```
npx playwright show-report [dir]          serve the HTML report (--host --port)
npx playwright show-trace <trace.zip>     open Trace Viewer (dir/URL also accepted; no-arg = drag&drop)
npx playwright merge-reports <blob-dir>   merge sharded blob reports (-c --reporter)
npx playwright clear-cache
```
Traces also open at https://trace.playwright.dev (in-browser; nothing uploaded). Enable via `--trace on` or `use: { trace: 'on-first-retry' }`.

## One-shot utilities
(Backed by `playwright`/core; separate from the test runner.)
```
npx playwright open <url>                 open in a controlled browser (--device --viewport-size --color-scheme)
npx playwright screenshot <url> <out.png> --full-page --viewport-size=1280,800 --device="iPhone 14"
                                          --wait-for-timeout=<ms> --color-scheme=dark -b chromium
npx playwright pdf <url> <out.pdf>        headless Chromium only
npx playwright cr|wk|ff <url>             open in Chromium / WebKit / Firefox
npx playwright --version
```
Python: `playwright screenshot --full-page <url> shot.png`, `playwright pdf <url> out.pdf`, `playwright open <url>`.

## Python pytest-playwright
```bash
pytest                                  # chromium, headless
pytest --headed --browser chromium
pytest --browser firefox --browser webkit   # repeatable → multiple browsers
pytest --browser-channel chrome             # branded channel
pytest --slowmo 500                         # ms delay per op
pytest --device "iPhone 13"
pytest --tracing on|off|retain-on-failure
pytest --video on|off|retain-on-failure
pytest --screenshot on|off|only-on-failure [--full-page-screenshot]
pytest --output <dir>                       # artifacts (default test-results)
pytest -k "<expr>"                          # select by name
pytest -n <N>                               # parallel (needs pytest-xdist)
```
Fixtures: `page` (per test), `context` (isolated per test), `browser` (session). View a trace: `playwright show-trace trace.zip`.

## Config essentials
`playwright.config.ts` (or `.js`) at the repo root:
- `projects[]` — browser/device matrix (`{ name: 'chromium', use: devices['Desktop Chrome'] }`, "Mobile Safari", …). Select with `--project=chromium`.
- `use` defaults — `baseURL`, `trace`, `headless`, `viewport`, `storageState`, `screenshot`, `video`.
- `testDir`, `reporter`, `retries`, `webServer` (auto-start your app before tests).
- Override the config file path with `-c, --config`.

Relative `page.goto('/login')` requires `use: { baseURL }` (Node) or `--base-url` / `base_url` fixture (Python).

## Auth / storage state
Record once, reuse the authenticated session:
```bash
# 1) record login + persist storage
npx playwright codegen --save-storage=auth.json https://example.com/login
# 2) reuse it later (codegen or tests)
npx playwright codegen --load-storage=auth.json https://example.com/dashboard
```
In tests: `use: { storageState: 'auth.json' }` (config or per-project), or a setup project that logs in once and writes `auth.json`.

### Quick examples
```bash
npx playwright screenshot --full-page --viewport-size=1280,800 https://playwright.dev shot.png
npx playwright test --headed --trace on -g "checkout" && npx playwright show-trace trace.zip
# Python
pytest --headed --tracing on -k checkout
playwright codegen --target=python -o login.py --save-storage=auth.json https://example.com/login
```

## Gotchas
- **"Executable doesn't exist"** → ran package install but not browsers: `npx playwright install` / `playwright install`.
- **CI/Linux missing libs** → `--with-deps` (or `install-deps`); plain `install` doesn't pull OS packages.
- **Headless by default**; add `--headed`. **PDF = headless Chromium only.**
- **`--project=<name>` must match** a `projects[].name`.
- **`@playwright/test` (tests) vs `playwright` (lib + open/screenshot/pdf utilities)** — import the right one.
- **`baseURL` unset** → relative URLs fail.
- **Chrome for Testing era:** headed launches `chrome`, headless launches `chrome-headless-shell`; pin a branded channel with `--browser-channel` / `channel`.
- **Node↔Python mixups:** `npx playwright test` is Node-only; Python uses `pytest`. `python -m playwright …` is Python-only.

## The 2026 agent CLI (@playwright/cli)
A **separate** tool for coding agents, distinct from everything above:
```bash
npm install -g @playwright/cli      # invoked as `playwright-cli` (NOT `npx playwright`)
```
Daemon-based, ref-based accessibility snapshots, token-efficient output. Commands include `open [url]`, `click <ref>`, `fill <ref> <text>`, `type <text>`, `press <key>`, `select <ref> <val>`, `screenshot [ref] --filename=… --full-page`, `pdf --filename=…`, `go-back`/`go-forward`/`reload`, `resize <w> <h>`, `console`, `tracing-start`, `video-start`. Different binary, different flags than `npx playwright screenshot <url> <out.png>`. For interactive read-and-react browser sessions, the `agent-browser` skill covers the same niche. Docs: https://playwright.dev/agent-cli/introduction

## Docs
Test CLI https://playwright.dev/docs/test-cli · Codegen https://playwright.dev/docs/codegen ·
Trace Viewer https://playwright.dev/docs/trace-viewer (hosted https://trace.playwright.dev) ·
Browsers https://playwright.dev/docs/browsers · Python https://playwright.dev/python/docs/intro ·
pytest plugin https://playwright.dev/python/docs/test-runners · Release notes https://playwright.dev/docs/release-notes
