# agent-browser — command reference

Deep reference for the `agent-browser` CLI. **Snapshot of v0.27.0.** When the CLI
is installed, the authoritative, version-matched reference is:

```bash
agent-browser skills get core --full      # full workflows + command reference + templates
agent-browser --help                      # live command list for the installed version
```

Use this file for offline / pre-install context. Treat `skills get core` as truth if they differ.

## Contents
- [Install & setup](#install--setup)
- [The core loop](#the-core-loop)
- [Command reference](#command-reference)
- [Snapshot options](#snapshot-options)
- [Selectors](#selectors)
- [Global options / flags](#global-options--flags)
- [Authentication, sessions, profiles](#authentication-sessions-profiles)
- [Security](#security)
- [Config file & timeouts](#config-file--timeouts)
- [Agent mode, batch, chaining](#agent-mode-batch-chaining)
- [Cloud providers & serverless](#cloud-providers--serverless)

## Install & setup

```bash
npm install -g agent-browser     # or: brew install agent-browser | cargo install agent-browser
agent-browser install            # download Chrome for Testing (first run)
agent-browser install --with-deps  # Linux: also OS deps
agent-browser upgrade            # update (auto-detects npm/brew/cargo)
agent-browser doctor [--fix] [--offline --quick]   # diagnose install/daemon/Chrome
```
From source needs Node 24+, pnpm 11+, Rust. Existing Chrome/Brave/Playwright/Puppeteer installs are auto-detected.

## The core loop

A background daemon owns the browser; state persists between invocations.

```bash
agent-browser open <url>     # launch + navigate (alias: goto, navigate); bare `open` = about:blank
agent-browser snapshot -i    # accessibility tree, interactive only, refs @eN
# read snapshot → pick refs → act:
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser screenshot out.png
agent-browser close
```
Refs are **not stable across navigations** — re-`snapshot` after the page changes.

## Command reference

### Core actions
```
open [url]            Launch / navigate (aliases: goto, navigate)
click <sel>           Click (--new-tab to open in new tab)
dblclick <sel>        Double-click
focus <sel>           Focus
type <sel> <text>     Type into element
fill <sel> <text>     Clear + fill
press <key>           Press key (Enter, Tab, Control+a) (alias: key)
keyboard type <text>  Real keystrokes at current focus (no selector)
keyboard inserttext <text>   Insert text without key events
keydown/keyup <key>   Hold / release key
hover <sel>           Hover
select <sel> <val>    Select dropdown option
check / uncheck <sel> Checkbox
scroll <dir> [px]     up/down/left/right (--selector <sel>)
scrollintoview <sel>  Scroll element into view (alias: scrollinto)
drag <src> <tgt>      Drag and drop
upload <sel> <files>  Upload file(s)
screenshot [path]     Screenshot (--full full page; --annotate numbered labels;
                        --screenshot-dir/-format/-quality)
pdf <path>            Save page as PDF
snapshot              Accessibility tree with refs (best for AI; see options below)
eval <js>             Run JS (-b base64, --stdin piped)
connect <port>        Connect to a browser via CDP
close [--all]         Close browser (aliases: quit, exit)
chat "<instruction>"  AI natural-language control (needs AI_GATEWAY_API_KEY; usually skip in Claude Code)
```

### Get info / check state
```
get text|html|value <sel>      Content / innerHTML / input value
get attr <sel> <attr>          Attribute
get title | url | cdp-url      Page title / URL / CDP WS URL
get count|box|styles <sel>     Count matches / bounding box / computed styles
is visible|enabled|checked <sel>   Boolean state
```

### Find elements (semantic locators)
```
find role <role> <action> [value]      e.g. find role button click --name "Submit"
find text <text> <action>              find text "Sign In" click
find label|placeholder|alt|title|testid <v> <action> [value]
find first|last <sel> <action>
find nth <n> <sel> <action>
# actions: click fill type hover focus check uncheck text
# options: --name <accessible name>, --exact
```

### Wait
```
wait <selector>            visible
wait <ms>                  time
wait --text "Welcome"      substring appears
wait --url "**/dash"       URL pattern
wait --load networkidle    load state (load|domcontentloaded|networkidle)
wait --fn "window.ready"   JS condition
wait "#spinner" --state hidden    disappearance
```

### Batch (one process, many steps)
```
agent-browser batch "open https://x.com" "snapshot -i" "click @e1"
agent-browser batch --bail ...                          # stop on first error
echo '[["open","https://x.com"],["snapshot","-i"],["click","@e1"]]' | agent-browser batch --json
```

### Clipboard / mouse
```
clipboard read|write <text>|copy|paste
mouse move <x> <y> | down [btn] | up [btn] | wheel <dy> [dx]
```

### Browser settings
```
set viewport <w> <h> [scale]   set device <name>   set geo <lat> <lng>
set offline [on|off]   set headers <json>   set credentials <u> <p>   set media [dark|light]
```

### Cookies & storage
```
cookies | cookies set <name> <val> | cookies set --curl <file> | cookies clear
storage local [key] | storage local set <k> <v> | storage local clear
storage session ...   (same for sessionStorage)
```

### Network
```
network route <url> [--abort | --body <json>] [--resource-type script]
network unroute [url]
network requests [--filter|--type xhr,fetch|--method POST|--status 2xx]
network request <requestId>
network har start | har stop [output.har]
```

### Tabs / windows / frames / dialogs
```
tab | tab new [url] | tab new --label <name> [url] | tab <tN|label> | tab close [tN|label]
window new
frame <sel> | frame main
dialog accept [text] | dialog dismiss | dialog status     # alert/beforeunload auto-accepted unless --no-auto-dialog
```
Tab ids are stable strings `t1`,`t2`,… (never reused); positional `tab 2` is **not** accepted. Labels are yours to name and persist across navigation.

### Diff
```
diff snapshot [--baseline before.txt] [--selector "#main"] [--compact]
diff screenshot --baseline before.png [-o diff.png] [-t 0.2]
diff url <urlA> <urlB> [--screenshot] [--wait-until networkidle] [--selector "#main"]
```

### Debug
```
trace start|stop [path]      profiler start|stop [path]
console [--json|--clear]      errors [--clear]
highlight <sel>      inspect (open DevTools)
state save|load <path> | state list | state show <file> | state rename <old> <new>
state clear [name|--all] | state clean --older-than <days>
```

### Navigation
```
back | forward | reload | pushstate <url>      # pushstate: SPA client-side nav
```

### React / Web Vitals (need `open --enable react-devtools`)
```
open --enable react-devtools <url>
react tree | react inspect <fiberId> | react renders start|stop [--json]
react suspense [--only-dynamic] [--json]
vitals [url] [--json]        # LCP/CLS/TTFB/FCP/INP (+ React hydration); framework-agnostic
```

### Init scripts / setup / skills
```
open --init-script <path> | addinitscript <js> | removeinitscript <id>
install [--with-deps] | upgrade | doctor [--fix]
skills | skills list | skills get <name> [--full] | skills get --all | skills path [name]
# specialized: skills get electron|slack|dogfood|vercel-sandbox|agentcore
```

## Snapshot options
```
-i, --interactive   only buttons/links/inputs
-u, --urls          include href URLs for links
-c, --compact       drop empty structural elements
-d, --depth <n>     limit tree depth
-s, --selector <s>  scope to a CSS selector
# combine: snapshot -i -c -d 5
```
`snapshot --json` → `{ success, data:{ snapshot, refs:{ e1:{role,name}, … } } }`.
Annotated screenshots: `screenshot --annotate` overlays `[N]` labels matching `@eN`; refs are cached so you can click `@e2` right after.

## Selectors
- **Refs (best for AI):** `@e1` from the latest snapshot — deterministic, fast.
- **CSS:** `"#id"`, `".class"`, `"div > button"`.
- **Text / XPath:** `"text=Submit"`, `"xpath=//button"`.
- **Semantic:** `find role button click --name "Submit"`.

## Global options / flags
```
--session <name>            isolated session (AGENT_BROWSER_SESSION)
--session-name <name>       auto-save/restore state (AGENT_BROWSER_SESSION_NAME)
--profile <name|path>       Chrome profile name or persistent dir (AGENT_BROWSER_PROFILE)
--state <path>              load storage state JSON (AGENT_BROWSER_STATE)
--headed                    show the window (AGENT_BROWSER_HEADED)
--headers <json>            extra HTTP headers (origin-scoped)
--executable-path <path>    custom browser binary (AGENT_BROWSER_EXECUTABLE_PATH)
--extension <path>          load extension (repeatable)
--init-script <path>        page init script before first nav (repeatable)
--enable <feature>          built-in init scripts, e.g. react-devtools
--args <a,b>                browser launch args
--user-agent <ua>           custom UA
--proxy <url> / --proxy-bypass <hosts>
--ignore-https-errors       accept self-signed certs
--allow-file-access         allow file:// to read local files (Chromium)
--hide-scrollbars <bool>    default true in headless screenshots
-p, --provider <name>       cloud browser provider (AGENT_BROWSER_PROVIDER)
--device <name>             iOS device emulation, e.g. "iPhone 15 Pro"
--json                      machine-readable output (use for parsing)
--annotate                  numbered element labels on screenshots
--color-scheme dark|light|no-preference
--download-path <path>
--cdp <port|url> / --auto-connect      connect to running Chrome via CDP
--engine chrome|lightpanda
--no-auto-dialog            don't auto-accept alert/beforeunload
--model <name>              AI model for `chat` (AI_GATEWAY_MODEL)
-v/--verbose | -q/--quiet   chat output verbosity
--config <path> | --debug
```

## Authentication, sessions, profiles
| Approach | Flag / env | Notes |
|---|---|---|
| Chrome profile reuse | `--profile <name>` | Read-only snapshot of your real profile's cookies/logins. On Windows, close Chrome first (locked files). |
| Persistent profile | `--profile <path>` | Full state (cookies, IndexedDB, SW, cache) across restarts. |
| Session persistence | `--session-name <name>` | Auto-save/restore cookies+localStorage in `~/.agent-browser/sessions/`. |
| State file | `--state <path>` | Load a saved storage-state JSON on launch. |
| Import from your Chrome | `--auto-connect` + `state save` | Launch Chrome with `--remote-debugging-port=9222`, then `agent-browser --auto-connect state save ./auth.json`. |
| Auth vault | `auth save` / `auth login` | Encrypted credential store; LLM never sees passwords: `echo "pass" \| agent-browser auth save github --url https://github.com/login --username user --password-stdin` then `agent-browser auth login github`. |

Isolated sessions: `--session agent1` (or `AGENT_BROWSER_SESSION`); each has its own browser, cookies, history, auth. `session list` / `session`.

> **Security:** `--remote-debugging-port` exposes full browser control on localhost — trusted machines only. State files hold session tokens in plaintext → `.gitignore` them; encrypt at rest with `AGENT_BROWSER_ENCRYPTION_KEY` (`openssl rand -hex 32`).

## Security
All opt-in. On untrusted pages (prompt-injection surface) prefer:
```
--allowed-domains "example.com,*.example.com"   # also blocks sub-resources/WS to other domains; include CDNs
--content-boundaries                            # wrap page output so LLM separates it from instructions
--max-output 50000                              # prevent context flooding
--action-policy ./policy.json                   # gate destructive actions
--confirm-actions eval,download                 # require approval for categories
```
Env equivalents: `AGENT_BROWSER_ALLOWED_DOMAINS`, `_CONTENT_BOUNDARIES`, `_MAX_OUTPUT`, `_ACTION_POLICY`, `_CONFIRM_ACTIONS`, `_CONFIRM_INTERACTIVE`.

## Config file & timeouts
`agent-browser.json` (camelCase keys mirror the flags). Precedence low→high:
`~/.agent-browser/config.json` → `./agent-browser.json` → `AGENT_BROWSER_*` env → CLI flags.
```json
{ "$schema": "https://agent-browser.dev/schema.json", "headed": true, "ignoreHttpsErrors": true }
```
Default operation timeout **25s** (`AGENT_BROWSER_DEFAULT_TIMEOUT`, ms); keep ≤30000 or the CLI's 30s IPC read can EAGAIN.

## Agent mode, batch, chaining
- `--json` everywhere for parsing; `snapshot -i --json` is the optimal perceive step.
- `batch` runs many steps in one process (no per-command startup); ideal for one-turn flows and pre-navigation setup (`open` → set cookies/routes/init-scripts → `navigate`).
- `&&` chaining works because the daemon persists the browser: `agent-browser open x.com && agent-browser wait --load networkidle && agent-browser snapshot -i`. Run separately when you must parse intermediate output (e.g., snapshot before clicking).

## Cloud providers & serverless
Run the browser remotely (no local Chrome) via `-p`: `browserless`, `browserbase`, `browseruse`, `kernel`, `agentcore` — e.g. `agent-browser -p browserbase open example.com` (load `skills get <provider>` for setup/keys).

Inside a **Vercel Sandbox** microVM:
```typescript
import { Sandbox } from "@vercel/sandbox";
const sandbox = await Sandbox.create({ runtime: "node24" });
await sandbox.runCommand("agent-browser", ["open", "https://example.com"]);
const result = await sandbox.runCommand("agent-browser", ["screenshot", "--json"]);
await sandbox.stop();
```
AWS Lambda: set `AGENT_BROWSER_EXECUTABLE_PATH` to `@sparticuz/chromium`'s path, then exec `agent-browser open … && agent-browser snapshot -i --json`.

Live dashboard: `agent-browser dashboard start` (port 4848) → live viewport, activity feed, console, session creation, optional AI chat.

---
Source: [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) README + bundled SKILL.md (v0.27.0, Apache-2.0). Homepage https://agent-browser.dev · Security https://agent-browser.dev/security
