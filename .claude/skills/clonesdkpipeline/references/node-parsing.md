# Node Parsing — What to Extract From Each SDK Node Type

This reference covers how to read a VectorShift Python SDK pipeline and extract every configuration value you need to reproduce the node exactly.

## Node type cheat sheet

| SDK type | Purpose | JS service file | Complexity |
|---|---|---|---|
| `InputNode` | Receives the user's input | Handled by route's `extractInput()` | Trivial |
| `LlmNode` | Calls Anthropic, Google, OpenAI, AWS Bedrock, etc. | `services/<name>.js` | High — many fields |
| `CodeExecutionNode` | Runs a deterministic Python function | `services/<name>.js` (port to JS) | High — port Python logic exactly |
| `KnowledgeBaseNode` | Queries a VectorShift KB | `services/knowledge-base.js` (shared) | Medium |
| `OutputNode` | Surfaces the final value | Handled by orchestrator return | Trivial |

---

## LlmNode — the complete field list

Always capture every one of these, even if the value is empty string or `False`. The parity test will assert on them. Example:

```python
ip_guard = LlmNode(
    node_name="ip_guard",
    temperature=0,
    aws_region="us-east-1",
    aws_secret_access_key="",
    enable_web_search=False,
    max_tokens=256,
    system="...",                          # long system prompt
    provider="anthropic",
    use_personal_api_key=True,
    deployment_id="",
    model="claude-haiku-4-5-20251001",
    base_url="",
    aws_access_key_id="",
    endpoint="",
    use_finetuned_model=False,
    retry_on_failure=False,
    api_key="sk-ant-...",                  # pipeline's own key — copy to env
    json_response=True,
    max_retries=1,
    retry_interval_ms=1000,
    json_schema="{...}",                   # stringified JSON schema
    thinking_token_limit=4096,
    finetuned_model="",
    prompt=f"...{upstream.field}...",      # templated f-string
)
```

Write this into a `*_CONFIG = Object.freeze({...})` export in the matching service file:

```js
export const IP_GUARD_CONFIG = Object.freeze({
  node_name: 'ip_guard',
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
  temperature: 0,
  max_tokens: 256,
  thinking_token_limit: 4096,
  max_retries: 1,
  retry_interval_ms: 1000,
  retry_on_failure: false,
  json_response: true,
  json_schema: IP_GUARD_JSON_SCHEMA,
  enable_web_search: false,
  use_personal_api_key: true,
  use_finetuned_model: false,
  finetuned_model: '',
  base_url: '',
  endpoint: '',
  deployment_id: '',
  aws_region: 'us-east-1',
  aws_access_key_id: '',
  aws_secret_access_key: '',
});
```

### Provider → client library mapping

| SDK `provider=` | JS client | Install |
|---|---|---|
| `"anthropic"` | `@anthropic-ai/sdk` | `npm i @anthropic-ai/sdk` |
| `"google"` | `@google/generative-ai` | `npm i @google/generative-ai` |
| `"openai"` | `openai` | `npm i openai` |
| `"aws"` (Bedrock) | `@aws-sdk/client-bedrock-runtime` | `npm i @aws-sdk/client-bedrock-runtime` |

### System prompt extraction — critical

The system prompt is often many pages of text with nested quotes, bullet markers, all-caps headers, and examples. Copy it **byte-for-byte** into a JS template string. Do not paraphrase, reflow, or normalize quotes. Use backticks so single/double quotes inside don't need escaping:

```js
// src/prompts/ip-guard-system.js
export const IP_GUARD_SYSTEM = `You are an input security classifier...

EXAMPLE OF FAILURE: "STEP 1: Mobilize the Cellular Workforce (The Migration Gap)"
CORRECT: "## Systemic Cell Mobilization..."
...`;
```

The parity test will assert on 8-12 key phrases — so every header, list marker, and decision rule matters.

### User prompt template extraction

The SDK `prompt=f"..."` uses Python f-strings. Port to a JS builder function:

```python
# SDK
prompt=f"User Question: {ip_guard_gate.safe_input}\n--- SOURCE 1: PATHWAY KB ---\n\n{knowledge_base_1.formatted_text}\n..."
```

```js
// JS
export function buildSynthesizerUserPrompt({ safeInput, pathwayText, interventionText, biomarkerText }) {
  return `User Question: ${safeInput}
--- SOURCE 1: PATHWAY KB (Broad + Targeted) ---

${pathwayText}

--- SOURCE 2: INTERVENTION KB (Broad + Targeted) ---
${interventionText}
...`;
}
```

**Watch the source ordering** — SDK template may interleave nodes in non-obvious order (e.g. SOURCE 1 uses `knowledge_base_1`, SOURCE 2 uses `knowledge_base_0`). Copy the order literally.

### Runtime adapter considerations

Some SDK flags can't map 1:1 to the provider's real API:

- **`thinking_token_limit` + `temperature=0`** — Anthropic's extended thinking requires `temperature=1`. The VectorShift runtime silently no-ops thinking when temp=0. Replicate this: only pass `thinking: { type: 'enabled', budget_tokens: N }` when temperature > 0; otherwise store the config value but don't send it. Document this in a comment.
- **`max_retries=1` + `retry_on_failure=False`** — means 1 attempt, no retries (not "retry once on failure"). Implement as a plain try/catch with a single try.
- **`retry_interval_ms=1000` + `max_retries>1`** — use a constant 1000ms sleep between retries, NOT exponential backoff. The SDK's semantics are fixed-interval.
- **`json_response=True` + `json_schema="{...}"`** — Anthropic's JSON mode is best done by asking for strict JSON in the prompt and parsing the text block. Google Gemini has native `responseMimeType: "application/json"`. Choose per provider.

---

## CodeExecutionNode — port the Python logic exactly

These nodes contain Python functions (typically 20-80 lines) that do deterministic transforms. Port them to JS **with the same semantics**.

### Faithful-port checklist

When porting, match:

- **Type coercion** — Python `bool()`, `str()`, `list()` behave slightly differently. Use `Boolean()`, `String()`, `Array.from()` carefully.
- **String operations** — Python `lstrip`, `rstrip`, `strip` strip specific characters. `.lstrip("#")` is NOT the same as regex `^#+` when followed by other transforms. Use imperative `while s.startsWith('#') s = s.slice(1)` to match exactly.
- **Regex flavor** — Python `re` uses PCRE-ish syntax. JS regex is ECMA. `(?:...)` non-capture groups work in both. `\b` word boundaries work in both. Named groups differ — stick to numbered groups.
- **JSON parse fallback** — Python `json.loads` with `try/except (JSONDecodeError, TypeError)` → JS `try { JSON.parse } catch {...}`.
- **Default return shape** — keep the SAME return key names (e.g. `{ is_blocked: "true", block_category: ..., block_message: ..., safe_input: ... }`). The next node in the chain depends on these names.

### Common pattern: "gate" nodes

Gate nodes check upstream LLM output and decide whether to block. Always ship defense-in-depth:

```js
export function runGateNode({ guardResponse, userInput }) {
  let blocked = true;
  let category = 'parse_error';

  // 1. Try to parse the LLM's JSON — treat parse errors as blocking
  try {
    const result = JSON.parse(guardResponse);
    blocked = Boolean(result.blocked);
    category = typeof result.category === 'string' ? result.category : 'unknown';
  } catch {
    blocked = true;
    category = 'parse_error';
  }

  // 2. Regex override — catch attacks the LLM may have missed
  if (detectThreat(userInput)) {
    blocked = true;
    category = 'explicit_threat_type';
  }

  // 3. Map category → user-facing message
  if (blocked) {
    return {
      is_blocked: 'true',
      block_category: category,
      block_message: MESSAGES[category] || DEFAULT_MESSAGE,
      safe_input: SAFE_INPUT_PLACEHOLDER,
    };
  }

  // 4. Pass-through
  return { is_blocked: 'false', block_category: category, block_message: '', safe_input: userInput };
}
```

Export the regex array, message map, and placeholder as named exports so the parity test can assert on counts and values.

### Common pattern: "router" / "sanitizer" nodes

These run AFTER the synthesizer and strip process leaks. Port the Python line-by-line loop to JS:

```js
export function sanitizeReportOutput(text) {
  if (typeof text !== 'string') return '';

  const cleanedLines = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const stripped = line.trim();
    const lowered = stripped.toLowerCase();
    const bare = computeBare(lowered); // Python lstrip/rstrip sequence

    if (bare.startsWith('thought process')) continue;
    if (bare.startsWith('network rationale')) continue;
    // ... more banned prefixes

    if (lowered.startsWith('step ') && lowered.slice(0, 12).includes(':')) {
      if (ANALYTIC_KEYWORDS.some(k => lowered.includes(k))) continue;
    }

    if (DROP_PATTERNS.some(p => lowered.includes(p))) continue;

    cleanedLines.push(line);
  }

  let cleaned = cleanedLines.join('\n');
  cleaned = cleaned.replace(/\(The\s+[^)]+\s+(Gap|Bottleneck)\)/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

function computeBare(lowered) {
  // Matches Python: lstrip("#") → lstrip("*") → strip() → rstrip("*") → strip()
  let s = lowered;
  while (s.length && s[0] === '#') s = s.slice(1);
  while (s.length && s[0] === '*') s = s.slice(1);
  s = s.trim();
  while (s.length && s[s.length - 1] === '*') s = s.slice(0, -1);
  s = s.trim();
  return s;
}
```

The Python `lstrip`/`rstrip`/`strip` sequence is order-sensitive — don't collapse it into chained regex replaces.

---

## KnowledgeBaseNode — one service file for all of them

All KB nodes share the same JS service (`src/services/knowledge-base.js`). Extract:

- **KB ID** — the `KnowledgeBase.fetch(id="...")` value. Store as a config constant with env override.
- **`top_k`** — usually 10
- **`score_cutoff`** — usually 0
- **`transform_query`** — usually `True`
- **`rerank_documents`** — usually `True`
- **`num_chunks_to_rerank`** — usually 10
- **`rerank_model`** — usually `"cohere/rerank-english-v3.0"`
- **`query`** — watch for leading space: `f" {ip_guard_gate.safe_input}"`

Build a `KB_CONFIG` export that includes a `nodes` map so tests can verify each KB's role:

```js
export const KB_CONFIG = Object.freeze({
  endpoint_base: 'https://api.vectorshift.ai/v1/knowledge-base',
  top_k: 10,
  score_cutoff: 0,
  transform_query: true,
  rerank_documents: true,
  num_chunks_to_rerank: 10,
  rerank_model: 'cohere/rerank-english-v3.0',
  query_prefix: ' ',
  nodes: Object.freeze({
    knowledge_base_0: { node_name: 'knowledge_base_0', kb_id: '...', role: 'intervention' },
    knowledge_base_1: { node_name: 'knowledge_base_1', kb_id: '...', role: 'pathway' },
    knowledge_base_2: { node_name: 'knowledge_base_2', kb_id: '...', role: 'biomarker' },
  }),
});
```

The `role` field is your call — name it semantically based on what the KB contains (intervention, pathway, biomarker, protocol, etc.).

---

## Common gotchas

### Model ID drift

The SDK string is the source of truth. Do NOT "fix" these:

| SDK string | Don't rewrite to |
|---|---|
| `gemini-3.1-pro-preview` | `gemini-3-pro-preview` |
| `claude-haiku-4-5-20251001` | `claude-haiku-4-5` |
| `gpt-4o-mini-2024-07-18` | `gpt-4o-mini` |

### KB role mis-assignment

The SDK variables are named `knowledge_base_0`, `_1`, `_2` but their **roles** are assigned by the prompt template order, not by their numeric suffix. In the canonical implementation:

- `knowledge_base_0` → Intervention KB (id `69a9126b0aa78275abf93509`)
- `knowledge_base_1` → Pathway KB (id `69a90a410aa78275abf3d082`)
- `knowledge_base_2` → Biomarker KB (id `69a909860aa78275abf349f4`)

But the SYNTHESIZER prompt uses:

```
--- SOURCE 1: PATHWAY KB ---        ← uses knowledge_base_1
--- SOURCE 2: INTERVENTION KB ---   ← uses knowledge_base_0
--- SOURCE 3: BIOMARKER KB ---      ← uses knowledge_base_2
```

Always cross-reference the prompt template against the node assignments. Copy the role names from the prompt, not the variable indices.

### SDK prompt trailing characters

Python f-strings can end with a trailing newline or space that matters. Compare:

```python
prompt=f"... {knowledge_base_2.formatted_text}\n\n"   # trailing blank line
prompt=f"... {knowledge_base_2.formatted_text}"       # no trailing
```

Preserve whatever the SDK has. When in doubt, keep it.
