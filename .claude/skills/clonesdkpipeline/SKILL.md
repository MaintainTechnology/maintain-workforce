---
name: clonesdkpipeline
description: Clone a VectorShift SDK pipeline into a production-ready Node/Express API deployed to Railway. Use this skill whenever the user asks to "clone this SDK", "turn this VectorShift pipeline into an API", "make a Node/Express version of this pipeline", "convert VectorShift to Express", "deploy this SDK as an API on Railway", "make an API version of this pipeline", or hands over VectorShift pipeline code (with `Pipeline.new`, `InputNode`, `LlmNode`, `KnowledgeBaseNode`, `CodeExecutionNode`, `OutputNode`) and wants a standalone service. Also trigger when the user mentions replicating, porting, or mirroring a VectorShift pipeline as a HTTP API — even if they don't use the word "clone". The skill produces a complete Express app with SDK-parity tests, biomarker-style stage progress tracking, a styled homepage, Swagger/OpenAPI docs at /api/docs, and full Railway deployment config.
---

# Clone SDK Pipeline → Express API

This skill ports a VectorShift Python SDK pipeline into a standalone Node/Express API with full SDK parity, stage progress tracking, Swagger docs, a landing page, and Railway deployment config.

The **canonical reference implementation** lives at:

```
C:\Users\dalig\Desktop\NexGenMedicine\nextGenOrganization\ngm-knowledge-assistant-lean
```

When the user invokes this skill, treat that repo as the gold-standard template. Read its files to see how specific patterns are implemented, then adapt them to the user's SDK.

---

## Intake — Ask the user for

Before writing any code, gather:

1. **The SDK pipeline code** — the full Python snippet from `vectorshift` containing `Pipeline.new(...)`, all node definitions, and KB IDs. If the user pastes it inline, capture it verbatim. If they give a file path, read it.
2. **Target directory** — where to build the new API (e.g. `C:\Users\dalig\Desktop\NexGenMedicine\nextGenOrganization\ngm-my-pipeline`). Create it if it doesn't exist.
3. **Source `.env`** — the existing project `.env` that has the API keys to copy (typically `C:\Users\dalig\Desktop\ngm-website-official\.env`). The relevant keys will be VectorShift, Anthropic (per-pipeline), and Google AI keys.
4. **Pipeline name slug** — short kebab-case name for the Railway service (e.g. `ngm-peptide-advisor`). Used in `package.json`, README, and Railway domain.

Confirm the intake before scaffolding — a one-line summary is enough ("Cloning the Peptide Advisor pipeline to `ngm-peptide-advisor/`, copying keys from `ngm-website-official/.env`"). The user should correct you if anything is wrong.

---

## The nine-step workflow

Work through these in order. **Do not skip steps.** Each one compounds on the previous.

### 1. Parse every SDK node verbatim

For every node in the pipeline, extract:

- `node_name` (e.g. `ip_guard`, `knowledge_base_0`, `google_0`)
- Node type (`InputNode`, `LlmNode`, `KnowledgeBaseNode`, `CodeExecutionNode`, `OutputNode`)
- Every parameter the SDK assigns — not just the obvious ones. For LlmNodes, capture model, temperature, max_tokens, thinking_token_limit, max_retries, retry_interval_ms, retry_on_failure, json_response, json_schema, enable_web_search, use_personal_api_key, aws_region, base_url, deployment_id, finetuned_model — every single field. For KnowledgeBaseNodes, capture KB ID, top_k, score_cutoff, transform_query, rerank_documents, num_chunks_to_rerank, rerank_model, and the query f-string (watch the leading space in `f" {safe_input}"`).
- System prompts and user prompt templates — preserve **byte-for-byte**, including all caps, punctuation, bullet styles, line breaks.
- Inter-node connections (which node feeds which via `dependencies=`, `node.<field>`, and template string interpolation).

For details on per-node-type parsing, read **`references/node-parsing.md`**.

**Common gotcha:** The SDK may say `gemini-3.1-pro-preview` (with the ".1") — do not "correct" this to `gemini-3-pro-preview`. Copy model IDs literally.

### 2. Scaffold the Express app

Create this exact structure:

```
<target-dir>/
├── package.json
├── railway.json
├── nixpacks.toml
├── Procfile
├── .nvmrc
├── .railwayignore
├── .gitignore
├── .env                      ← populated from step 5
├── .env.example              ← redacted version
├── README.md
├── LICENSE                   (MIT)
├── scripts/
│   └── preflight.js          ← env validator
├── tests/
│   └── sdk-parity.test.js    ← 100+ parity assertions
├── data/                     (gitignored — api-keys.json lives here)
└── src/
    ├── index.js              ← Express app + boot-time env check + graceful SIGTERM
    ├── middleware/
    │   └── auth.js           ← requireApiKey + requireAdmin
    ├── routes/
    │   ├── api-keys.js       ← /api/keys admin CRUD
    │   ├── docs.js           ← Swagger UI + /api/openapi.json
    │   └── pipeline.js       ← /api/pipeline/run, /async, /status, /stream, /capacity
    ├── services/             ← one file per SDK node
    │   ├── api-keys.js       ← key generate/validate/revoke with DATA_DIR support
    │   ├── ip-guard.js       ← or whatever the LlmNode classifier is named
    │   ├── ip-guard-gate.js  ← deterministic JS port of the CodeExecutionNode
    │   ├── knowledge-base.js ← JavaScript fetch KB query (CRITICAL — not Python SDK)
    │   ├── synthesizer.js    ← the main LlmNode
    │   └── output-router.js  ← final sanitizer CodeExecutionNode
    ├── prompts/              ← SDK prompts held verbatim, NO paraphrasing
    │   ├── <classifier>-system.js
    │   └── <synthesizer>-system.js
    ├── pipeline/
    │   └── orchestrator.js   ← STAGES array + JobProgress callback
    ├── utils/
    │   └── logger.js         ← colored terminal with progress bar
    ├── swagger/
    │   └── openapi-spec.js   ← OpenAPI 3.0.3 JSON
    └── pages/
        └── home.html         ← landing page
```

Use `@anthropic-ai/sdk` for Anthropic LlmNodes, `@google/generative-ai` for Google LlmNodes, and plain `fetch` for VectorShift KB queries. See **`templates/package.json.template`** for the base dependencies.

### 3. Implement KB retrieval with the JavaScript fetch format

This is the most important deviation from the Python SDK. **Do not use `vectorshift` npm package or the Python SDK.** Every KB call is a direct REST call:

```js
POST https://api.vectorshift.ai/v1/knowledge-base/{id}/query
Authorization: Bearer <VECTORSHIFT_API_KEY>
Content-Type: application/json

{
  queries: [` ${safe_input}`],          // leading space matches SDK f-string
  search_metadata: { top_k: 10 },
  config: {
    rerank_documents: true,
    transform_query: true,
    retrieval_config: { max_documents: 10 },
    reranking_config: {
      reranking_model: "cohere/rerank-english-v3.0",
      num_chunks_to_rerank: 10
    },
    score_cutoff: 0
  }
}
```

All KB-node parameters the SDK exposes map into this body. Run all KB queries in parallel with `Promise.all`. For the full implementation, read **`references/kb-query-javascript.md`** and look at `src/services/knowledge-base.js` in the canonical repo.

### 4. Export `*_CONFIG` objects from every service

Every service file must export a frozen config object mirroring the SDK node 1:1. This is non-negotiable — the parity test suite depends on introspecting these values.

```js
// src/services/synthesizer.js
export const SYNTH_CONFIG = Object.freeze({
  node_name: 'google_0',
  provider: 'google',
  model: 'gemini-3.1-pro-preview',
  max_tokens: 65535,
  thinking_token_limit: 24576,
  max_retries: 10,
  retry_interval_ms: 1000,
  json_response: false,
  json_schema: '',
  base_url: '',
});
```

Do the same for `IP_GUARD_CONFIG`, `IP_GUARD_GATE_CONFIG`, `KB_CONFIG`, and `OUTPUT_ROUTER_CONFIG`. Also export any helper builders (`buildKbQueryBody`, `buildGenerationConfig`, `_buildAnthropicRequest`) so tests can assert on the wire-format shape.

### 5. Copy env keys from the source `.env`

Read the source `.env` the user specified. Extract only the keys this pipeline actually uses (don't pollute the new service with unrelated vars). Typical set:

| Var | Purpose |
|---|---|
| `VECTORSHIFT_API_KEY` | KB retrieval |
| `ANTHROPIC_API_KEY_<PIPELINE_NAME>` | LlmNodes using provider=anthropic |
| `GOOGLE_AI_KEY_<PIPELINE_NAME>` | LlmNodes using provider=google |
| `KB_*_ID` | one env var per KnowledgeBaseNode, with the real ID as default |

Write two files:

- **`.env`** — populated with the real keys for local dev (gitignored)
- **`.env.example`** — same keys with redacted example values (committed)

Also add these operational vars:

```
PORT=3200
NODE_ENV=development
ADMIN_API_KEY=ngm_admin_change_me_in_production_<random>
MAX_CONCURRENT_PIPELINES=5
# DATA_DIR=/data         ← uncomment in production with Railway Volume
```

### 6. Add biomarker-style stage tracking

Stage tracking comes from `ngm-biomarker-analysis`. Every run emits `JobProgress { stage, stageIndex, totalStages }` **before** each stage runs, via an `onProgress` callback passed into `runPipeline`.

The orchestrator uses a `STAGES` array pattern:

```js
const STAGES = [
  { name: 'IP Guard', run: stageIpGuard },
  { name: 'Knowledge Retrieval', run: stageKnowledgeRetrieval },
  { name: 'Clinical Synthesis', run: stageClinicalSynthesis },
  // Stage N (Output Routing) is handled separately — it returns final output, not ctx
];
const TOTAL_STAGES = STAGES.length + 1;
```

The routes layer needs:

- **In-memory task store** with 30min TTL and 10min cleanup sweep
- **Concurrency limiter** — `MAX_CONCURRENT_PIPELINES` env, 429 response with `retry_after_seconds`
- **SSE streaming** at `GET /api/pipeline/run/stream/:taskId` — events: `connected`, `progress`, `completed`, `blocked`, `error`, `cancelled`
- **`GET /api/pipeline/capacity`** — returns `{ active_pipelines, max_concurrent, available_slots, accepting_requests, total_stages, stage_names }`
- **Biomarker-compatible aliases**: `POST /start`, `GET /status/:taskId`

Status response shape (exactly matches biomarker):

```json
{
  "task_id": "...",
  "status": "running|completed|blocked|failed|cancelled",
  "completed": false,
  "stage": "Knowledge Retrieval",
  "stageIndex": 2,
  "totalStages": 4,
  "elapsed_seconds": 3.7
}
```

Read **`references/biomarker-stage-tracking.md`** for the full pattern including the colored terminal logger.

### 7. Build the landing page + Swagger/OpenAPI docs

Two public surfaces:

**`GET /`** — HTML landing page. Use the NGM editorial design system (Cormorant Garamond + Source Serif 4 + DM Sans, `#FEFDFB` warm paper, `#8B7355` accent, `#4A6A7A` blue). Must contain:

- Hero with pipeline name, tagline, live/version/stages badges
- 3-card quick nav (API Docs / OpenAPI / Health)
- Pipeline ASCII diagram
- Numbered stage list (STAGE 01, STAGE 02, ...)
- 6 capability cards
- Endpoints table with GET/POST/DELETE color pills
- 4-step quick start with curl examples
- SDK parity note (reference the `*_CONFIG` exports + test count)

**`GET /api/docs`** — Swagger UI via `swagger-ui-express`. The raw spec lives at `GET /api/openapi.json`. Mount on `/api` so both routes work.

The OpenAPI 3.0.3 spec must document every endpoint: `/api/health`, `/api/pipeline/run`, `/api/pipeline/run/async`, `/api/pipeline/start`, `/api/pipeline/run/status/:taskId`, `/api/pipeline/status/:taskId`, `/api/pipeline/run/result/:taskId`, `/api/pipeline/run/stream/:taskId`, `/api/pipeline/run/terminate/:taskId`, `/api/pipeline/tasks` (GET+DELETE), `/api/pipeline/capacity`, `/api/keys/generate`, `/api/keys`, `/api/keys/:id/revoke`, `/api/keys/:id` (DELETE).

Use the NGM-styled Swagger custom CSS — read **`references/swagger-and-homepage.md`** for the exact theme.

### 8. Generate the SDK parity test suite

Write `tests/sdk-parity.test.js` using Node's built-in test runner (`node --test`). **No external test dependencies.** Target 100+ assertions across 10 suites:

1. `<classifier>` LlmNode parity — every SDK field
2. `<classifier>` json_schema parity — root type, properties, enum values, required, additionalProperties
3. `<classifier>` system prompt parity — verify 8-12 key phrases verbatim
4. `<gate>` CodeExecutionNode parity — pattern count, message keys, placeholder, plus functional tests of `detectProcessExtraction` / `runIpGuardGate`
5. Every `KnowledgeBaseNode` — KB ID, top_k, score_cutoff, transform_query, rerank_documents, num_chunks_to_rerank, rerank_model, leading-space query, plus `buildKbQueryBody` wire-format check
6. `<synthesizer>` LlmNode parity — every SDK field
7. `<synthesizer>` system prompt parity — 15-20 section headers verbatim
8. `<synthesizer>` user prompt template — source order, placeholder substitution
9. `<router>` CodeExecutionNode parity — pattern counts, fallback message, block short-circuit, strong-leak detection, header stripping, parenthetical stripping, Python-exact `bare` strip
10. Pipeline orchestrator — `getTotalStages()` value, `getStageNames()` order

Add a script: `"test": "node --test tests/"` in package.json.

**Acceptance criterion: all tests pass.** Run `npm test` before declaring done.

### 9. Prepare for Railway deployment

Drop in these files:

**`railway.json`:**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci --omit=dev --no-audit --prefer-offline || npm install --omit=dev --no-audit"
  },
  "deploy": {
    "startCommand": "node src/index.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5,
    "numReplicas": 1,
    "sleepApplication": false
  }
}
```

**`nixpacks.toml`** — pins Node 22 LTS, see `templates/nixpacks.toml.template`.

**`.nvmrc`** — contains `22`.

**`.railwayignore`** — excludes `node_modules/`, `.env`, `tests/`, `data/api-keys.json`, logs.

**`Procfile`** — `web: node src/index.js`.

**`scripts/preflight.js`** — validates every required env var, warns on default "change me" admin key, exits non-zero on missing config. See `templates/preflight.js.template`.

**Runtime hardening in `src/index.js`:**

- Boot-time env check — server refuses to start if any of `VECTORSHIFT_API_KEY`, `ANTHROPIC_API_KEY_*`, `GOOGLE_AI_KEY_*`, `ADMIN_API_KEY` are missing
- Graceful SIGTERM handler — stops accepting connections, waits up to 25s for in-flight requests to drain (Railway force-kills at 30s)
- HTTP timeouts — `server.keepAliveTimeout = 125_000`, `server.headersTimeout = 130_000`, `server.requestTimeout = 0`
- Crash guards — log `unhandledRejection`, exit 1 on `uncaughtException` so Railway's restart policy kicks in
- `DATA_DIR` env support in `src/services/api-keys.js` — defaults to `./data/` for dev, set to `/data` on Railway with a mounted Volume

Read **`references/railway-deployment.md`** for the step-by-step user-facing deploy instructions to include in the README.

---

## Working order checklist

Keep track of this as you execute:

- [ ] Intake captured (SDK, target dir, source .env, slug)
- [ ] All SDK nodes parsed — config tables written down
- [ ] Directory tree scaffolded
- [ ] `package.json` with correct deps (including `swagger-ui-express`)
- [ ] `.env` + `.env.example` populated from source
- [ ] Every service file (one per SDK node) implemented with exported `*_CONFIG`
- [ ] System prompts extracted verbatim into `src/prompts/`
- [ ] KB service uses **JavaScript fetch**, not Python SDK
- [ ] Orchestrator has STAGES array + onProgress callback
- [ ] Routes layer: sync, async, status, stream, result, terminate, tasks, capacity
- [ ] Concurrency limiter + 429 handling
- [ ] Landing page at `/` with NGM design system
- [ ] Swagger UI at `/api/docs`, OpenAPI JSON at `/api/openapi.json`
- [ ] `tests/sdk-parity.test.js` has 100+ assertions
- [ ] `npm test` passes (all tests green)
- [ ] `npm run preflight` passes with all required env vars green
- [ ] Railway files present (railway.json, nixpacks.toml, .nvmrc, .railwayignore, Procfile)
- [ ] Graceful SIGTERM + HTTP timeouts wired in `src/index.js`
- [ ] `DATA_DIR` env honored in `src/services/api-keys.js`
- [ ] README.md has Railway deploy section

---

## Deeper dives

When you hit a specific area that needs more care, read the corresponding reference:

| Topic | File |
|---|---|
| Per-node-type SDK parsing (what fields to capture) | `references/node-parsing.md` |
| JavaScript KB query wire format (full body schema) | `references/kb-query-javascript.md` |
| Biomarker stage tracking pattern (STAGES, JobProgress, SSE) | `references/biomarker-stage-tracking.md` |
| Swagger theme + landing page design system | `references/swagger-and-homepage.md` |
| Railway deployment steps + troubleshooting | `references/railway-deployment.md` |
| Copy-paste file templates | `templates/*.template` |

---

## Why this matters

A VectorShift pipeline is great for prototyping in their web UI, but production teams need:

- **Ownership of the runtime** — no vendor-locked inference
- **Exact model/parameter control** — pin model IDs, token budgets, retry policy
- **Observable stage progress** — users watching a 60-second synthesis need a progress bar, not a spinner
- **Security gating** — consumer API keys with usage tracking and revocation
- **Auditable parity** — when the SDK changes upstream, `npm test` tells you exactly what drifted

The cloned API gives all of that while preserving every SDK setting byte-for-byte. The test suite is the contract: if it passes, the new service is behaviorally identical to the SDK pipeline on every parameter the SDK exposes.
