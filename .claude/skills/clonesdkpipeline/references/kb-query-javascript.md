# JavaScript KB Query — VectorShift REST Format

**Important:** Do not install `vectorshift` npm packages or use the Python SDK. Every knowledge base query is a direct HTTPS POST to VectorShift's REST endpoint.

## The endpoint

```
POST https://api.vectorshift.ai/v1/knowledge-base/{id}/query
Authorization: Bearer <VECTORSHIFT_API_KEY>
Content-Type: application/json
```

## The full request body schema

```js
{
  queries: ['<string>'],                   // array — even for single query
  context: '<string>',                     // optional — extra context
  search_metadata: {
    filter: '<string>',                    // optional — metadata filter expr
    opensearch_filter: '<string>',         // optional
    top_k: 10,                             // match SDK KnowledgeBaseNode.top_k
    group_by_key: '<string>'               // optional
  },
  config: {
    rerank_documents: true,                // match SDK rerank_documents
    generate_metadata_filters: true,       // SDK exposes this — usually true
    transform_query: true,                 // match SDK transform_query
    answer_multi_query: true,              // SDK exposes — leave true
    expand_query: true,                    // SDK exposes — leave true
    do_advanced_qa: true,                  // SDK exposes — leave true
    format_context_for_llm: true,
    generate_ai_doc_summaries: true,
    retrieval_unit: '<string>',            // usually "chunk"
    retrieval_config: {
      max_documents: 10,                   // = top_k
      data_fusion_method: '<string>'
    },
    reranking_config: {
      reranking_model: 'cohere/rerank-english-v3.0',  // match SDK rerank_model
      api_key: '<string>',                  // usually empty — VS handles
      num_chunks_to_rerank: 10              // match SDK num_chunks_to_rerank
    },
    question_answering_config: {
      qa_model: '<string>',
      advanced_qa_mode: '<string>'
    },
    hybrid_search_config: {
      alpha: 0.5,
      fusion_method: '<string>'
    },
    score_cutoff: 0                        // match SDK score_cutoff
  }
}
```

Most fields are optional. The minimum viable body that matches SDK `KnowledgeBaseNode` parity:

```js
{
  queries: [query],
  search_metadata: { top_k: 10 },
  config: {
    rerank_documents: true,
    transform_query: true,
    retrieval_config: { max_documents: 10 },
    reranking_config: {
      reranking_model: 'cohere/rerank-english-v3.0',
      num_chunks_to_rerank: 10
    },
    score_cutoff: 0
  }
}
```

## Complete service implementation

```js
// src/services/knowledge-base.js

const VS_BASE = 'https://api.vectorshift.ai/v1/knowledge-base';

export const KB_CONFIG = Object.freeze({
  endpoint_base: VS_BASE,
  top_k: 10,
  score_cutoff: 0,
  transform_query: true,
  rerank_documents: true,
  num_chunks_to_rerank: 10,
  rerank_model: 'cohere/rerank-english-v3.0',
  query_prefix: ' ',      // leading space from SDK f" {safe_input}"
  nodes: Object.freeze({
    knowledge_base_0: Object.freeze({ node_name: 'knowledge_base_0', kb_id: '<ID>', role: 'intervention' }),
    knowledge_base_1: Object.freeze({ node_name: 'knowledge_base_1', kb_id: '<ID>', role: 'pathway' }),
    knowledge_base_2: Object.freeze({ node_name: 'knowledge_base_2', kb_id: '<ID>', role: 'biomarker' }),
  }),
});

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Exposed for parity tests
export function buildKbQueryBody(query) {
  return {
    queries: [query],
    search_metadata: { top_k: KB_CONFIG.top_k },
    config: {
      rerank_documents: KB_CONFIG.rerank_documents,
      transform_query: KB_CONFIG.transform_query,
      retrieval_config: { max_documents: KB_CONFIG.top_k },
      reranking_config: {
        reranking_model: KB_CONFIG.rerank_model,
        num_chunks_to_rerank: KB_CONFIG.num_chunks_to_rerank,
      },
      score_cutoff: KB_CONFIG.score_cutoff,
    },
  };
}

function formatKbResult(label, result) {
  if (!result || typeof result !== 'object') return `[${label}] No results returned.`;

  // Walk common container shapes — VS API response shape varies
  const candidates =
    result.chunks ||
    result.documents ||
    result.results ||
    result.matches ||
    result.data?.chunks ||
    result.data?.documents ||
    result.data?.results ||
    (Array.isArray(result) ? result : null) ||
    [];

  if (!Array.isArray(candidates) || candidates.length === 0) {
    if (typeof result.formatted_text === 'string') return result.formatted_text;
    if (typeof result.context === 'string') return result.context;
    return `[${label}] No results returned.`;
  }

  return candidates.map((chunk, i) => {
    const idx = i + 1;
    const text =
      chunk.text || chunk.content || chunk.chunk || chunk.page_content || chunk.document ||
      (typeof chunk === 'string' ? chunk : JSON.stringify(chunk));

    const score =
      typeof chunk.score === 'number' ? ` | score=${chunk.score.toFixed(4)}` :
      typeof chunk.rerank_score === 'number' ? ` | rerank=${chunk.rerank_score.toFixed(4)}` : '';

    const source = chunk.source || chunk.metadata?.source || chunk.metadata?.file_name ||
                   chunk.metadata?.document_name || chunk.document_name || '';

    const header = `--- [${label} #${idx}]${source ? ` source=${source}` : ''}${score} ---`;
    return `${header}\n${text}`;
  }).join('\n\n');
}

async function queryVectorShiftKb({ kbId, query, label }) {
  const apiKey = requireEnv('VECTORSHIFT_API_KEY');
  const body = buildKbQueryBody(query);

  const res = await fetch(`${VS_BASE}/${kbId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`VectorShift KB ${label} (${kbId}) returned ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = await res.json();
  return {
    label,
    kbId,
    raw: json,
    formatted_text: formatKbResult(label, json.data || json),
  };
}

export async function runKnowledgeBases(safeInput) {
  const query = `${KB_CONFIG.query_prefix}${safeInput}`;  // matches SDK f" {safe_input}"

  const [intervention, pathway, biomarker] = await Promise.all([
    queryVectorShiftKb({ kbId: process.env.KB_INTERVENTION_ID || KB_CONFIG.nodes.knowledge_base_0.kb_id, query, label: 'INTERVENTION' }),
    queryVectorShiftKb({ kbId: process.env.KB_PATHWAY_ID       || KB_CONFIG.nodes.knowledge_base_1.kb_id, query, label: 'PATHWAY' }),
    queryVectorShiftKb({ kbId: process.env.KB_BIOMARKER_ID     || KB_CONFIG.nodes.knowledge_base_2.kb_id, query, label: 'BIOMARKER' }),
  ]);

  return { intervention, pathway, biomarker };
}
```

## Why these patterns matter

### Parallel queries with Promise.all

The SDK runs the three KB nodes concurrently by default (they share the same input and have no dependencies on each other). Match that — sequential queries would triple latency.

### Leading space on the query

Python f-string `f" {ip_guard_gate.safe_input}"` — there's a single leading space. Preserve it. Some KBs treat leading whitespace as a signal to disable stemming/normalization. Drop it and retrieval scores can shift.

### Defensive response shape walk

VectorShift's KB response shape has changed across API versions (`chunks` → `documents` → `results` → nested under `data`). The canonical implementation walks all common paths and falls back to `formatted_text` / `context` strings. Don't hard-code a single path.

### Formatting for the synthesizer

The synthesizer prompt expects a numbered, plain-text block with optional source and score metadata. Format:

```
--- [INTERVENTION #1] source=peptides-guide.pdf | score=0.8421 ---
<chunk text here>

--- [INTERVENTION #2] | score=0.7912 ---
<chunk text here>
```

Do NOT ship JSON into the synthesizer prompt — Gemini has been shown to under-weight structured blobs compared to prose. The plain-text format matches what VectorShift's native pipeline output looks like.

## Parity test assertions

The parity suite should hit these:

```js
test('KB endpoint_base is the VS v1 REST URL', () => {
  assert.equal(KB_CONFIG.endpoint_base, 'https://api.vectorshift.ai/v1/knowledge-base');
});
test('KB top_k is 10', () => assert.equal(KB_CONFIG.top_k, 10));
test('KB score_cutoff is 0', () => assert.equal(KB_CONFIG.score_cutoff, 0));
test('KB transform_query is true', () => assert.equal(KB_CONFIG.transform_query, true));
test('KB rerank_documents is true', () => assert.equal(KB_CONFIG.rerank_documents, true));
test('KB rerank_model is cohere/rerank-english-v3.0', () => {
  assert.equal(KB_CONFIG.rerank_model, 'cohere/rerank-english-v3.0');
});
test('KB query_prefix is a leading space', () => assert.equal(KB_CONFIG.query_prefix, ' '));
test('KB body shape matches SDK wire format', () => {
  const body = buildKbQueryBody(' test');
  assert.deepEqual(body.queries, [' test']);
  assert.equal(body.search_metadata.top_k, 10);
  assert.equal(body.config.rerank_documents, true);
  assert.equal(body.config.transform_query, true);
  assert.equal(body.config.retrieval_config.max_documents, 10);
  assert.equal(body.config.reranking_config.reranking_model, 'cohere/rerank-english-v3.0');
  assert.equal(body.config.reranking_config.num_chunks_to_rerank, 10);
  assert.equal(body.config.score_cutoff, 0);
});
```

Per-KB-node assertions for ID + role:

```js
test('knowledge_base_0 maps to Intervention KB', () => {
  assert.equal(KB_CONFIG.nodes.knowledge_base_0.kb_id, '<ID from SDK>');
  assert.equal(KB_CONFIG.nodes.knowledge_base_0.role, 'intervention');
});
```
