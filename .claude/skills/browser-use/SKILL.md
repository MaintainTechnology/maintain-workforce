---
name: browser-use
description: >-
  Build and run a Python AI agent that autonomously drives a real Chromium
  browser from a natural-language task, using the open-source browser-use
  library (the `Agent` class). Use when the user wants to write or run a script
  where an LLM perceives a web page and decides the clicks/typing/navigation
  itself — e.g. "build a browser agent that logs into X and extracts Y",
  "scrape this site with an AI agent", "automate this multi-step web workflow in
  Python", "use an LLM to fill out this form", "have an agent book/search/
  monitor something on the web", or any mention of `browser-use`, `Agent(task=…)`,
  `ChatBrowserUse`, or Browser Use Cloud. Also covers the browser-use CLI and its
  MCP server. Prefer this skill for autonomous, LLM-in-the-loop Python automation;
  for Claude itself to drive a browser live from the terminal use the
  agent-browser skill, and for deterministic scripted automation or E2E tests
  use the playwright-cli skill.
allowed-tools: Bash(pip install browser-use:*), Bash(playwright install:*), Bash(browser-use:*), Bash(uvx browser-use:*), Bash(uv add browser-use:*)
---

# browser-use

`browser-use` is an open-source Python library where an **LLM drives a real
browser** to complete a task you describe in natural language. You construct an
`Agent` with a `task` + an `llm`, call `await agent.run()`, and it loops
(perceive the page → choose an action → act) until done. Reach for this when you
want an **autonomous, LLM-in-the-loop Python program** — not Claude driving the
browser turn-by-turn (`agent-browser`) and not a deterministic script
(`playwright-cli`).

> Verified against latest **v0.12.9** (2026-05). Requires **Python ≥ 3.11**.
> The API moves fast — when something here conflicts with the installed version,
> trust `browser-use --help` and the docs. See [reference.md](reference.md) for
> the full parameter tables, model list, Cloud SDK, and the complete gotcha list.

## ⚠ Two different products — don't cross their APIs

| | Open-source `browser-use` (this skill's focus) | Browser Use **Cloud** |
|---|---|---|
| Install | `pip install browser-use` | `pip install browser-use-sdk` |
| Entry point | `Agent(task=…, llm=…)` → `await agent.run()` | `AsyncBrowserUse()` → `await client.run(…)` |
| Structured output arg | `output_model_schema=` (on the `Agent` ctor) | `output_schema=` (on `client.run`) |
| Persistence | `user_data_dir` / `storage_state` | managed `profile_id` |
| Secrets | `sensitive_data={…}` | `secrets={…}` |

Mixing these up (e.g. passing `output_schema` to the local `Agent`) is the most
common error. This skill is the **open-source `Agent`** unless you specifically
need hosted browsers/CAPTCHA/proxies.

## Install

```bash
pip install "browser-use>=0.12.8"   # pin ≥0.12.8 — earlier versions have patched CVEs
playwright install chromium          # the browser engine (required), or: uvx browser-use install
```

API key via env / `.env` (pick one matching your LLM wrapper): `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `BROWSER_USE_API_KEY` (for `ChatBrowserUse`).

## Minimal working agent

```python
import asyncio
from dotenv import load_dotenv
from browser_use import Agent, Browser, ChatAnthropic

load_dotenv()

async def main():
    agent = Agent(
        task="Find the current star count of the browser-use/browser-use GitHub repo",
        llm=ChatAnthropic(model="claude-sonnet-4-6"),
        browser=Browser(headless=False),   # omit/None to auto-detect
    )
    history = await agent.run(max_steps=30)
    print(history.final_result())

if __name__ == "__main__":
    asyncio.run(main())
```

`run()` is **async** — always drive it from `asyncio.run(...)`. `max_steps` lives
on `run()` (default 500), *not* on the constructor.

## Core API essentials

- **LLM wrappers import from `browser_use` directly — not langchain.** Available:
  `ChatBrowserUse` (vendor default, needs `BROWSER_USE_API_KEY`), `ChatAnthropic`,
  `ChatOpenAI`, `ChatGoogle`, `ChatGroq`, `ChatOllama`, `ChatDeepSeek`,
  `ChatOpenRouter`, `ChatAzureOpenAI`, … (Bedrock lives at `browser_use.llm`).
  Importing `ChatOpenAI` from `langchain` is a classic mistake.
- **`Browser` is an alias for `BrowserSession`.** Key config: `headless`,
  `user_data_dir` (persistent profile; `None`=incognito), `channel`
  (`'chromium'|'chrome'|…`), `allowed_domains`, `storage_state`, `proxy`.
- **`Agent(...)`** key params: `task`, `llm`, `browser`, `tools` (the actions
  registry — formerly `controller`), `output_model_schema`, `sensitive_data`,
  `use_vision` (default `True`), `page_extraction_llm`, `max_actions_per_step`.

### Structured (JSON) output

Pass a Pydantic model to the **constructor**, read it off the history:

```python
from pydantic import BaseModel
class Repo(BaseModel):
    name: str
    stars: int

agent = Agent(task="...", llm=..., output_model_schema=Repo)
history = await agent.run()
repo = history.structured_output      # parsed Repo instance
```

(Constructor arg is `output_model_schema` for the OSS Agent — `output_schema` is the *Cloud* SDK.)

### Handling credentials safely

Keep real secrets out of the model context with `sensitive_data` + `use_vision=False`,
scoped per domain, and lock navigation with `allowed_domains`:

```python
creds = {"x_user": "me@corp.com", "x_pass": "real-password"}
agent = Agent(
    task="Log into example.com using x_user and x_pass",
    llm=ChatOpenAI(model="gpt-4.1-mini"),
    sensitive_data={"https://example.com": creds},
    use_vision=False,                                   # so secrets can't leak via screenshots
    browser=Browser(allowed_domains=["https://example.com"]),
)
```

The LLM only ever sees the `x_user` / `x_pass` placeholders.

### Custom actions (give the agent new tools)

```python
from browser_use import Tools, ActionResult, BrowserSession

tools = Tools()

@tools.action("Save the current finding to the database")
async def save_finding(text: str, browser_session: BrowserSession) -> ActionResult:
    ...  # the injected param MUST be named exactly `browser_session: BrowserSession`
    return ActionResult(extracted_content="saved")

agent = Agent(task="...", llm=..., tools=tools)
```

⚠ If you name that injected parameter anything other than `browser_session: BrowserSession`,
injection silently fails. (`Controller` is the deprecated alias of `Tools` — use `Tools`.)

## CLI & MCP server

```bash
pip install "browser-use[cli]"
uvx "browser-use[cli]"                                  # interactive TUI
uvx "browser-use[cli]" -p "Go to github.com and search browser-use"   # one-shot
uvx --from "browser-use[cli]" browser-use --mcp         # run as an MCP server (stdio)
```

The MCP server exposes tools like `browser_navigate`, `browser_click`,
`browser_type`, `browser_get_state` — wire it into an MCP client (e.g. Claude
Desktop) via `command: uvx`, `args: ["--from","browser-use[cli]","browser-use","--mcp"]`.
Run `browser-use --help` for the authoritative flag list.

## Top gotchas

- `run()` is **async-only** — wrap in `asyncio.run`.
- LLM wrappers come from **`browser_use`**, not langchain.
- **`output_model_schema`** (OSS `Agent`) vs **`output_schema`** (Cloud) — don't swap.
- Custom-action param must be exactly **`browser_session: BrowserSession`**.
- With `sensitive_data`, always set **`use_vision=False`** and scope `allowed_domains`.
- Forgetting **`playwright install chromium`** → no browser at runtime.
- Agent runs are long — they **time out on short-timeout serverless** (e.g. Vercel Hobby); run on a worker/long-lived process.
- **Pin `>=0.12.8`** for the security fixes; set the model explicitly (defaults drift).

See [reference.md](reference.md) for all `Agent`/`Browser` parameters, the full
model-name list, the Cloud SDK, and the complete change/gotcha log.

## Docs

Open-source intro https://docs.browser-use.com/open-source/introduction · Quickstart
https://docs.browser-use.com/quickstart · All params
https://docs.browser-use.com/customize/agent/all-parameters · MCP
https://docs.browser-use.com/open-source/customize/integrations/mcp-server ·
LLM-friendly dump https://docs.browser-use.com/llms-full.txt
