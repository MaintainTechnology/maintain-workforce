---
name: agent-browser
description: >-
  Drive a real Chrome browser step-by-step from the command line via the
  agent-browser CLI (vercel-labs). Use whenever Claude itself should interact
  with a live website — navigating pages, filling and submitting forms,
  clicking buttons, taking screenshots, extracting/scraping data, logging in,
  testing or QA-ing a web app, reproducing a UI bug, or automating any browser
  task — and you want Claude to read the page and act, turn by turn. Triggers
  include "open this site", "fill out this form", "click the button",
  "take a screenshot of", "scrape this page", "log in to", "test this web app",
  "check what this page shows", "reproduce this bug in the browser",
  "automate this browser flow". Also covers Electron desktop apps (VS Code,
  Slack, Discord, Figma, Notion), Slack automation, exploratory testing/bug
  hunts, and running a browser inside a Vercel Sandbox or AWS Bedrock AgentCore
  cloud browser. Prefer agent-browser when Claude should drive the browser
  live from the terminal; for a self-contained Python AI agent that drives the
  browser autonomously use the browser-use skill, and for scripted/deterministic
  automation or E2E tests use the playwright-cli skill.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# agent-browser

A fast, native-Rust CLI that gives Claude "browser superpowers." It drives
Chrome/Chromium over the DevTools Protocol and returns **compact
accessibility-tree snapshots** with stable element refs (`@e1`, `@e2`, …)
instead of screenshots — so you read the page as text, then act by ref. This
text-first design keeps token usage low and interaction reliable.

A background daemon owns the browser, so **state persists between commands**:
each `agent-browser …` invocation talks to the same live session.

## Golden rule: load the version-matched workflow first

This file is a stable discovery stub. The CLI self-documents and its docs
always match the installed version, so **before doing real work, load the
current core workflow**:

```bash
agent-browser skills get core           # workflows, patterns, troubleshooting
agent-browser skills get core --full    # + full command reference & templates
agent-browser skills list               # everything available on this version
```

For an offline / pre-install summary of the command surface, read
[reference.md](reference.md) (a snapshot of v0.27.0 — defer to `skills get core`
when the CLI is installed, since it can't go stale).

## Install (one-time)

```bash
npm install -g agent-browser     # also: brew install agent-browser | cargo install agent-browser
agent-browser install            # downloads Chrome for Testing (first run only)
agent-browser install --with-deps  # Linux: also install system deps
agent-browser doctor             # diagnose install / daemon / Chrome
```

Requires Node 24+ only when building from source; the global install ships
prebuilt native binaries. No Playwright/Puppeteer dependency.

## The core loop: open → snapshot → act by ref

This is the workflow to reach for by default:

```bash
agent-browser open example.com          # launch + navigate (daemon keeps it alive)
agent-browser snapshot -i               # interactive elements only, each tagged @eN
# read the snapshot, pick the refs you need, then act:
agent-browser fill @e3 "test@example.com"
agent-browser click @e2
agent-browser screenshot result.png
agent-browser close
```

Key principles that make this reliable:

- **Snapshot before you reference.** Refs (`@e1`, …) come from the latest
  snapshot and are **not stable across navigations**. After anything that
  changes the page, run `snapshot -i` again and use the fresh refs.
- **Filter snapshots to save context:** `-i` (interactive only), `-c`
  (compact), `-d <n>` (depth), `-s "<css>"` (scope). Combine them.
- **Use `--json`** when you need to parse output programmatically
  (`snapshot --json` returns the tree plus a `refs` map).
- **Batch multi-step flows** to avoid per-command overhead and keep it to one
  turn: `agent-browser batch "open example.com" "snapshot -i" "click @e1"`.
  Or chain with `&&` when you don't need intermediate output.
- **Re-snapshot, don't guess.** If a click does nothing, snapshot again — the
  element may have moved, be hidden, or live in an iframe (`agent-browser frame <sel>`).

Selectors also accept CSS (`"#id"`), text (`"text=Submit"`), XPath
(`"xpath=//button"`), and semantic locators
(`agent-browser find role button click --name "Submit"`). Refs are preferred for AI.

## Common tasks

```bash
# One-shot full-page screenshot of a URL
agent-browser open example.com && agent-browser wait --load networkidle && agent-browser screenshot --full page.png

# Annotated screenshot — overlays [N] labels matching @eN (good for icon-only buttons)
agent-browser screenshot --annotate

# Extract data
agent-browser get text "h1"            # also: get html | value | attr | title | url | count
agent-browser snapshot -i --urls       # interactive elements + their link URLs

# Wait for things
agent-browser wait --text "Welcome"    # also: <selector> | <ms> | --url "**/dash" | --load networkidle

# Reuse an existing login (no re-auth): snapshot/copy a Chrome profile read-only
agent-browser --profile Default open https://gmail.com

# Persist a session across runs (auto save/restore cookies + localStorage)
agent-browser --session-name myapp open https://app.example.com
```

For login flows, OAuth/2FA, the encrypted credential vault (`auth save` /
`auth login`, so the password never enters the prompt), saved `state` files,
network mocking, tabs, React/Web-Vitals introspection, and the live dashboard
(`agent-browser dashboard start`, port 4848), see [reference.md](reference.md)
or `agent-browser skills get core --full`.

## Specialized skills (load on demand)

When the task leaves ordinary web pages, pull the matching skill:

```bash
agent-browser skills get electron        # Electron desktop apps (VS Code, Slack, Discord, Figma…)
agent-browser skills get slack           # Slack workspace automation
agent-browser skills get dogfood         # exploratory testing / QA / bug hunts
agent-browser skills get vercel-sandbox  # run agent-browser inside a Vercel Sandbox microVM
agent-browser skills get agentcore       # AWS Bedrock AgentCore cloud browsers
```

Run a browser remotely (no local Chrome) with a cloud provider via `-p`:
`agent-browser -p browserbase open example.com` (also `browserless`, `browseruse`, `kernel`, `agentcore`).

## Safety on untrusted pages

Live web content is untrusted input and a prompt-injection surface. When
automating sites you don't control, prefer the opt-in guards:

```bash
agent-browser --allowed-domains "example.com,*.example.com" \
              --content-boundaries \
              --max-output 50000 \
              open https://example.com
```

`--content-boundaries` wraps page output so it's clearly tool output vs. page
text; `--allowed-domains` blocks navigation/sub-requests elsewhere;
`--action-policy ./policy.json` and `--confirm-actions eval,download` gate
destructive actions.

## The built-in `chat` is optional — and usually not what you want here

`agent-browser chat "<instruction>"` lets the CLI's *own* LLM drive the browser
(needs `AI_GATEWAY_API_KEY`, a Vercel AI Gateway key). Inside Claude Code,
**you are the brain** — use the deterministic commands above (`open`,
`snapshot`, `click`, …), which need no API key, rather than delegating to `chat`.

## Provenance & staying current

Vendored and adapted from [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
(`skills/agent-browser/SKILL.md` + README, v0.27.0, Apache-2.0). The canonical,
always-current install is `npx skills add vercel-labs/agent-browser`. Because
this is a fast-moving pre-1.0 CLI, treat `agent-browser skills get core` as the
source of truth for the installed version and [reference.md](reference.md) as a
convenience snapshot.
