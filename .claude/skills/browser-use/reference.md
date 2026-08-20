# browser-use — reference

Deep reference for the open-source `browser-use` library. Verified against
**v0.12.9** (2026-05). Python **≥ 3.11**. When in doubt, trust the installed
version: `browser-use --help` and https://docs.browser-use.com/llms-full.txt.

## Contents
- [Two products](#two-products-oss-vs-cloud)
- [Install](#install)
- [LLM wrappers & models](#llm-wrappers--models)
- [Agent parameters](#agent-parameters)
- [Browser / BrowserSession parameters](#browser--browsersession-parameters)
- [run() & history](#run--history)
- [Structured output](#structured-output)
- [Sensitive data](#sensitive-data)
- [Custom actions (Tools)](#custom-actions-tools)
- [CLI & MCP server](#cli--mcp-server)
- [Browser Use Cloud (separate SDK)](#browser-use-cloud-separate-sdk)
- [Gotchas](#gotchas)
- [2026 changelog highlights](#2026-changelog-highlights)

## Two products (OSS vs Cloud)
| | Open-source `browser-use` | Browser Use **Cloud** |
|---|---|---|
| pip | `browser-use` | `browser-use-sdk` |
| Entry | `Agent(task=…, llm=…)` → `await agent.run()` | `AsyncBrowserUse()` → `await client.run(…)` |
| Structured output | `output_model_schema=` (ctor) → `history.structured_output` | `output_schema=` (on `client.run`) → `result.output` |
| Persistence | `user_data_dir` / `storage_state` | `profile_id` |
| Secrets | `sensitive_data={…}` | `secrets={…}` |

This skill targets the **OSS `Agent`**. Don't pass Cloud args to it (and vice-versa).

## Install
```bash
pip install "browser-use>=0.12.8"     # pin ≥0.12.8 (patched CVEs)
playwright install chromium            # engine (required)
# or with uv:
uv init && uv add browser-use && uv sync && uvx browser-use install
pip install "browser-use[cli]"         # adds the CLI + MCP server
```
Linux runtime libs: `playwright install-deps` (or libnss3/libatk*/libgbm1…). CLI 2.0 (v0.12.3+) can also drive real Chrome directly over CDP and reuse a Chrome profile.

## LLM wrappers & models
Import wrappers from **`browser_use`** (not langchain):
```python
from browser_use import (
    Agent, Browser, BrowserSession, Tools, ActionResult,
    ChatBrowserUse,    # default; model "bu-2-0"; BROWSER_USE_API_KEY
    ChatAnthropic,     # ANTHROPIC_API_KEY
    ChatOpenAI,        # OPENAI_API_KEY
    ChatGoogle,        # GOOGLE_API_KEY
    ChatGroq, ChatAzureOpenAI, ChatOllama, ChatDeepSeek,
    ChatMistral, ChatOpenRouter, ChatCerebras, ChatVercel,
)
from browser_use.llm import ChatAWSBedrock, ChatAnthropicBedrock
```
Example model strings (mid-2026): `ChatAnthropic(model="claude-sonnet-4-6")`,
`ChatOpenAI(model="gpt-5")` / `"gpt-4.1-mini"`, `ChatGoogle(model="gemini-2.5-flash")`,
`ChatBrowserUse()`. **Set the model explicitly** — defaults drift between releases.

Env vars by wrapper: `BROWSER_USE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GOOGLE_API_KEY`, `GROQ_API_KEY`, `AZURE_OPENAI_API_KEY`, `AWS_ACCESS_KEY_ID`,
`OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`,
`VERCEL_API_KEY`. Also `BROWSER_USE_HEADLESS`, `BROWSER_USE_DISABLE_SECURITY`.

## Agent parameters
```python
Agent(
    task: str,
    llm,                              # a browser_use Chat* instance
    browser=None,                     # Browser/BrowserSession (alias: browser_session=)
    tools: Tools = None,              # actions registry (alias: controller=)
    output_model_schema: type = None, # Pydantic model for structured output
    sensitive_data: dict = None,      # {placeholder: real} or {domain: {placeholder: real}}
    use_vision: bool | "auto" = True, # screenshots to the model
    vision_detail_level="auto",       # "low" | "high" | "auto"
    page_extraction_llm=None,         # cheaper model for big text extraction
    fallback_llm=None,
    max_actions_per_step=5,           # source default (a doc page says 4 — trust source)
    max_failures=3,
    use_thinking=True,
    flash_mode=False,
    save_conversation_path=None,
)
```

## Browser / BrowserSession parameters
`Browser` **is an alias for `BrowserSession`** (same class); `BrowserProfile` is a legacy wrapper with the same kwargs.
```python
Browser(
    headless=None,            # None = auto-detect display; True/False to force
    user_data_dir=None,       # persistent profile dir; None = incognito
    executable_path=None,
    channel="chromium",       # "chrome" | "chrome-beta" | "msedge" | "chromium"
    allowed_domains=None,     # e.g. ["https://example.com"] — lock navigation
    storage_state=None,       # cookies/localStorage file or dict
    proxy=None,               # ProxySettings(server=..., username=..., password=...)
    window_size=None,
)
```

## run() & history
```python
async def run(self, max_steps: int = 500, on_step_start=None, on_step_end=None): ...
```
`run()` is **async** → always `asyncio.run(main())`. `max_steps` is here, not on the ctor.
History helpers: `history.final_result()`, `history.structured_output`,
`history.is_done()`, `history.urls()`, `history.errors()`.

## Structured output
```python
from pydantic import BaseModel
class Out(BaseModel):
    items: list[str]

agent = Agent(task="...", llm=..., output_model_schema=Out)
result = (await agent.run()).structured_output    # parsed Out instance
```
(OSS uses `output_model_schema`; the Cloud SDK uses `output_schema` — different.)

## Sensitive data
Keep real secrets out of the model context; pair with `use_vision=False` and `allowed_domains`.
```python
creds = {"x_user": "me@corp.com", "x_pass": "real-pw"}
# flat:
sensitive_data = creds
# domain-scoped (recommended):
sensitive_data = {
    "https://*.example-staging.com": creds,
    "https://example.com": creds,
    "https://google.com": {"g_email": "me@gmail.com", "g_pass": "real"},
}
agent = Agent(
    task="Log into example.com with username x_user and password x_pass",
    llm=ChatOpenAI(model="gpt-4.1-mini"),
    sensitive_data=sensitive_data,
    use_vision=False,
    browser=Browser(allowed_domains=["https://example.com"]),
)
```
The model only sees the `x_*` placeholders; real values are injected into fields.

## Custom actions (Tools)
`Tools` is the actions registry (formerly `Controller`, still an alias).
```python
from browser_use import Tools, ActionResult, BrowserSession
tools = Tools()

@tools.action("Save the current finding")
async def save(text: str, browser_session: BrowserSession) -> ActionResult:
    # ⚠ injected param MUST be exactly `browser_session: BrowserSession`
    return ActionResult(extracted_content="ok")

agent = Agent(task="...", llm=..., tools=tools)
```

## CLI & MCP server
```bash
pip install "browser-use[cli]"
uvx "browser-use[cli]"                         # interactive TUI
uvx "browser-use[cli]" -p "Go to github.com and search browser-use"   # one-shot
uvx "browser-use[cli]" --headless -p "Extract prices from example.com"
uvx browser-use install                        # install Chromium
uvx --from "browser-use[cli]" browser-use --mcp   # stdio MCP server
```
Flags confirmed: `-p/--prompt`, `--headless`, `--model` (historically defaulted `gpt-4o` — set it), `--mcp`. Config `~/.config/browseruse/config.json`; env override e.g. `BROWSER_USE_HEADLESS=true`. Run `browser-use --help` for the full list.

MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):
```json
{ "mcpServers": { "browser-use": {
    "command": "uvx",
    "args": ["--from", "browser-use[cli]", "browser-use", "--mcp"],
    "env": { "OPENAI_API_KEY": "..." }
}}}
```
On macOS/Linux use the absolute path to `uvx` (`which uvx`) to dodge PATH issues. Exposes `browser_navigate`, `browser_click`, `browser_type`, `browser_get_state`, `retry_with_browser_use_agent`, …

## Browser Use Cloud (separate SDK)
Hosted stealth browsers, CAPTCHA solving, residential proxies, managed profiles. Keys at cloud.browser-use.com/settings (`BROWSER_USE_API_KEY`).
```python
from browser_use_sdk.v3 import AsyncBrowserUse
client = AsyncBrowserUse()
result = await client.run(
    "List the top 20 Hacker News posts with points",
    output_schema=MyModel,          # note: output_schema (not output_model_schema)
)
print(result.output)
```
Uses `profile_id` and `secrets={"github.com": "user:pass"}`. **SDK 3.0 (2026-02-25) was a breaking rewrite.**

## Gotchas
- `run()` is **async-only** → `asyncio.run`.
- LLM wrappers come from **`browser_use`**, not langchain (langchain only via an adapter).
- **`output_model_schema`** (OSS) vs **`output_schema`** (Cloud) — don't swap.
- Custom-action injected param must be exactly **`browser_session: BrowserSession`** (wrong name = silent no-op).
- With `sensitive_data`, set **`use_vision=False`** and scope `allowed_domains` (else secrets can leak via screenshots/navigation).
- Forgetting **`playwright install chromium`** → no browser at runtime.
- **`Controller` deprecated → use `Tools`** (alias works).
- Agent runs are long → they **time out on short-timeout serverless** (Vercel Hobby etc.); run on a worker / long-lived process.
- **Pin `>=0.12.8`** for security fixes.

## 2026 changelog highlights
- **0.12.0** (02-26): pinned all deps.
- **0.12.3** (03): CLI 2.0 — rebuilt on direct CDP (not Playwright); element indices, real-Chrome-profile reuse, multi-session.
- **0.12.5** (03-25): removed `litellm` from core deps (supply-chain) → `ChatLiteLLM` now optional (`from browser_use.llm.litellm import ChatLiteLLM`).
- **0.12.8** (05-23): `ChatBrowserUse` default → `bu-2-0`; socket-auth hardening.
- **0.12.9** (05-26): current; skip screenshots on new-tab pages.
- **Cloud SDK 3.0** (02-25): breaking new agent API.
- **`Controller` → `Tools`** rename (alias retained).

> Low-confidence (verify against the live version): full CLI flag table beyond `-p/--prompt/--headless/--model/--mcp`; the exact release that landed `Controller`→`Tools`; Cloud REST endpoint paths (use the SDK + llms-full.txt).

## Docs
Intro https://docs.browser-use.com/open-source/introduction · Quickstart https://docs.browser-use.com/quickstart ·
Models https://docs.browser-use.com/supported-models · Agent params https://docs.browser-use.com/customize/agent/all-parameters ·
Output https://docs.browser-use.com/customize/agent/output-format · Sensitive data https://docs.browser-use.com/examples/templates/sensitive-data ·
Tools https://docs.browser-use.com/customize/tools/basics · Browser params https://docs.browser-use.com/customize/browser/all-parameters ·
MCP https://docs.browser-use.com/open-source/customize/integrations/mcp-server · Cloud https://docs.browser-use.com/cloud/quickstart ·
GitHub https://github.com/browser-use/browser-use · LLM dump https://docs.browser-use.com/llms-full.txt
