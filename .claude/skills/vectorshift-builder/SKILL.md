---
name: vectorshift-builder
description: Use when building, updating, deploying, or debugging any VectorShift pipeline using the SDK or REST API. Trigger this skill whenever the user mentions VectorShift pipeline creation, pipeline nodes, pipeline config, running a pipeline via API, knowledge base wiring, LLM node setup, variable references like {{node.output}}, or asks how to connect nodes together. Always invoke this skill before writing any VectorShift pipeline code — it enforces doc-first accuracy and prevents hallucinated node names, wrong variable syntax, and invalid API calls.
---

# VectorShift Builder

## Overview

VectorShift is a no-code/low-code AI workflow platform. Pipelines are composed of typed nodes connected by edges. Node outputs are referenced using `{{node_id.output_field}}` variable syntax. This skill ensures every pipeline build is grounded in the actual documentation.

## DOC-FIRST RULE

Before writing any pipeline code or config, read the relevant doc file from `docs/vectorshift/`. The local docs are the source of truth — never guess node parameters, output field names, or API request shapes.

| What you're building | Read this doc |
|---------------------|---------------|
| LLM node | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_llms_llm-node.md` |
| Input / Output nodes | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_start_input.md` |
| Knowledge Base Reader | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_knowledge_knowledge-base-reader.md` |
| Knowledge Base Loader | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_knowledge_knowledge-base-loader.md` |
| File node | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_data-loaders_file.md` |
| Condition / Logic | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_logic_condition.md` |
| Data types | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_data-types.md` |
| Variables | `docs/vectorshift/docs.vectorshift.ai_platform_pipelines_variables.md` |
| Run pipeline API | `docs/vectorshift/docs.vectorshift.ai_api-reference_pipelines_run.md` |
| Create pipeline API | `docs/vectorshift/docs.vectorshift.ai_api-reference_pipelines_create.md` |
| Fetch pipeline API | `docs/vectorshift/docs.vectorshift.ai_api-reference_pipelines_fetch.md` |
| Bulk run API | `docs/vectorshift/docs.vectorshift.ai_api-reference_pipelines_bulk-run.md` |
| Knowledge base API | `docs/vectorshift/docs.vectorshift.ai_api-reference_knowledge-bases_create.md` |
| Chatbot API | `docs/vectorshift/docs.vectorshift.ai_api-reference_chatbots_run.md` |

---

## Variable Syntax

Variables wire node outputs to downstream node inputs. Format: `{{node_id.output_field}}`

- Type `{{` in any text field to open the variable builder
- Node IDs follow the pattern: `nodetype_index` (e.g., `input_0`, `openai_0`, `knowledge_base_1`)
- Only compatible types are shown in the builder — mismatched types cause red errors

**Common variables:**
```
{{input_0.text}}                  # Text from Input node
{{input_0.processed_text}}        # File converted to text
{{input_0.file}}                  # Raw file from Input node
{{openai_0.response}}             # LLM text response
{{openai_0.tokens_used}}          # Total tokens (Integer)
{{openai_0.input_tokens}}         # Input tokens (Integer)
{{openai_0.output_tokens}}        # Output tokens (Integer)
{{openai_0.credits_used}}         # Cost in USD (Decimal)
{{knowledge_base_0.chunks}}       # List<Text> of relevant chunks
{{knowledge_base_0.documents}}    # List<Text> of document metadata
{{knowledge_base_0.response}}     # Direct answer (if Advanced QA enabled)
{{file_0.file}}                   # Raw file
{{file_0.processed_text}}         # Extracted text from file
```

---

## Data Types

```
Text
  Decimal
    Integer
  JSON
File
  Image
  Audio
  CSV
VSObject
  KnowledgeBase
  Pipeline
List<T>        # e.g., List<Text>, List<File>
Stream<T>      # e.g., Stream<Text> for streamed LLM output
```

Sub-types are compatible with their parent type (Integer → Decimal → Text).

---

## Node Quick Reference

### General
| Node | Key Outputs | Notes |
|------|-------------|-------|
| **Input** | `.text`, `.processed_text`, `.file`, `.audio` | Type set on node: Text / File / Audio |
| **Output** | (none) | Types: Text, Streamed Text, File, Image, Audio, JSON |
| **Text** | `.text` | Static text literal |

### LLM
| Node | Key Outputs | Notes |
|------|-------------|-------|
| **LLM (openai, anthropic, google, etc.)** | `.response`, `.tokens_used`, `.input_tokens`, `.output_tokens`, `.credits_used` | System + Prompt inputs; enable JSON Output for structured response; enable Stream for `Stream<Text>` |

Gemini uses a single unified prompt (no separate system). OpenAI accepts separate system + prompt.

### Knowledge
| Node | Key Outputs | Notes |
|------|-------------|-------|
| **Knowledge Base Reader** | `.chunks` (List\<Text\>), `.documents`, `.response` | Pre-loaded KB; use for static data |
| **Knowledge Base Loader** | (none) | Loads files/URLs into KB at runtime |
| **Semantic Search** | `.chunks` | Use for data loaded at runtime, not pre-loaded |
| **Text Chunking** | `.chunks` | Splits text into chunks for indexing |

### Data Loaders
| Node | Key Outputs | Notes |
|------|-------------|-------|
| **File** | `.file`, `.processed_text` | Processing models: Default / LlamaParse / Textract |
| **Web Scraper** | `.text` | Scrapes URL content |
| **Web Search** | `.results` | Exa, Google, Serper, You.com variants |
| **YouTube** | `.transcript` | |
| **Wikipedia** | `.text` | |
| **CSV Query** | `.result` | |

### Data Transformation
| Node | Notes |
|------|-------|
| **Combine Text** | Merges multiple text inputs |
| **Split Text** | Splits text by delimiter |
| **Find/Replace** | Text substitution |
| **Chunk Text** | Splits text into List\<Text\> chunks |
| **JSON Read/Write** | Extract or set JSON fields |
| **List operations** | Combine, filter, flatten, get item, join, trim, duplicate |
| **File to Text** | Converts file to text |
| **Text to File** | Converts text to downloadable file |
| **CSV Reader/Writer** | Parse or generate CSVs |
| **Email Notification** | Sends email from pipeline |

### Logic
| Node | Notes |
|------|-------|
| **Condition** | Multi-path branching; first `true` path executes; `Path Else` is fallback |
| **Merge** | Combines conditional paths back into single flow |
| **Convert Type** | Cast between compatible types |
| **Text to SQL** | Generates SQL from natural language |
| **Time** | Current timestamp |

### Multi-Modal
| Node | Key Outputs | Notes |
|------|-------------|-------|
| **Image to Text** | `.text` | OCR / vision model |
| **Text to Image** | `.image` | |
| **Speech to Text** | `.text` | Audio → transcript |
| **Text to Speech** | `.audio` | |

### Chat
| Node | Notes |
|------|-------|
| **Chat Memory** | Stores/retrieves conversation history |
| **Chat File Reader** | Makes files available in chat context |
| **Data Collector** | Collects structured data from chat |

---

## REST API Reference

**Base URL:** `https://api.vectorshift.ai/v1`
**Auth:** `Authorization: Bearer YOUR_API_KEY`

### Pipelines

```python
# Run a pipeline (sync)
POST /pipeline/{id}/run
Body: {"inputs": {"input_name": "value"}}
Response: {"status": "success", "run_id": "...", "outputs": {"output_name": "value"}}

# Run a pipeline (streaming)
# Same endpoint — response streams as text/event-stream
# Each event: {"type": "stream|result", "run_id": "...", "output_name": "...", "output_value": {}}

# Bulk run (parallel executions)
POST /pipeline/{id}/bulk_run
Body: {"runs": [{"inputs": {"input_name": "value"}, "conversation_id": "optional"}]}
Response: {"status": "success", "run_outputs": [{"run_id": "...", "outputs": {}}]}

# Create pipeline
POST /pipeline
Body: {"name": "string", "config": {}, "description": "optional"}
Response: {"status": "success", "id": "pipeline_id"}

# Fetch pipeline
GET /pipeline?id=PIPELINE_ID
# OR
GET /pipeline?name=NAME&username=USER&org_name=ORG
Response: {"status": "success", "object": {}}

# List pipelines
GET /pipeline/list

# Delete pipeline
DELETE /pipeline/{id}

# Pause a run
POST /pipeline/{id}/pause
Body: {"run_id": "string"}

# Resume a run
POST /pipeline/{id}/resume
Body: {"run_id": "string"}

# Terminate a run
POST /pipeline/{id}/terminate
Body: {"run_id": "string"}
```

### Knowledge Bases

```python
# Create
POST /knowledge-base
Body: {"name": "string", "description": "optional", "file_processing_implementation": "Default|LlamaParse|Textract", "chunk_size": int, "chunk_overlap": int}
Response: {"status": "success", "id": "kb_id"}

# Fetch
GET /knowledge-base?id=KB_ID

# List
GET /knowledge-base/list

# Query
POST /knowledge-base/{id}/query
Body: {"query": "string", "max_chunks": int}

# Index (add documents)
POST /knowledge-base/{id}/index

# Delete
DELETE /knowledge-base/{id}

# Delete documents
DELETE /knowledge-base/{id}/documents
```

### File Inputs via API

Send files as base64 in JSON, or use `multipart/form-data`:

```python
import base64, requests

with open("file.pdf", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = requests.post(
    f"https://api.vectorshift.ai/v1/pipeline/{PIPELINE_ID}/run",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"inputs": {"file_input": {"type": "file", "content": b64, "name": "file.pdf"}}}
)
result = resp.json()
```

---

## Common Pipeline Patterns

### RAG (Retrieval-Augmented Generation)
```
Input(text) → Knowledge Base Reader(search_query={{input_0.text}})
            ↓
LLM(system="Answer using context", prompt="Q: {{input_0.text}} Context: {{knowledge_base_0.chunks}}")
            ↓
Output({{openai_0.response}})
```

### File Processing + Analysis
```
Input(file) → File Node(processed_text={{input_0.file}})
            ↓
LLM(prompt="Analyze this document: {{file_0.processed_text}}")
            ↓
Output({{openai_0.response}})
```

### Multi-Stage LLM Chain
```
Input(text)
  → LLM_1(prompt="Extract key points: {{input_0.text}}")  → {{openai_0.response}}
  → LLM_2(prompt="Summarize: {{openai_0.response}}")      → {{openai_1.response}}
  → Output({{openai_1.response}})
```

### Knowledge Base Loader
```
Input(file) → Knowledge Base Loader(documents={{input_0.file}}, kb=MyKB)
# No output — KB is updated in-place
```

### Conditional Routing
```
Input(text)
  → Condition(if {{input_0.text}} contains "urgent" → Path 0, else → Path 1)
  → Path 0: LLM_0(urgent handler)
  → Path 1: LLM_1(standard handler)
  → Merge → Output
```

### Cost Tracking (capture credits_used)
```
LLM node outputs: {{openai_0.credits_used}}, {{openai_0.tokens_used}}
→ Pass to Output node or HTTP node to log to your database
```

---

## Python SDK Pattern

```python
from vectorshift.pipeline import Pipeline
import os

API_KEY = os.environ["VECTORSHIFT_API_KEY"]
PIPELINE_ID = "your-pipeline-id"

# Run a pipeline
import requests

response = requests.post(
    f"https://api.vectorshift.ai/v1/pipeline/{PIPELINE_ID}/run",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    json={"inputs": {"input_name": "your value here"}}
)
data = response.json()
output = data["outputs"]["output_name"]
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Wrong variable format | Must be `{{node_id.field}}` — double curly braces, dot notation |
| Guessing output field names | Read the node's doc — `chunks` not `results`, `response` not `output` |
| Sending file as raw string | Base64-encode files or use multipart/form-data |
| Using `Pipeline.fetch()` + `save()` for certain pipelines | Some pipelines fail SDK deserialization — use `Pipeline.new()` instead |
| Gemini LLM with separate system prompt | Gemini uses a single unified prompt — combine system + user content |
| Stream Response enabled but Output type is Text | Set Output node type to "Streamed Text" when streaming is on |
| KB Reader vs Semantic Search confusion | KB Reader = pre-loaded data; Semantic Search = runtime-loaded data |
| Condition node has no data output | Condition only routes — downstream nodes must reference upstream node outputs directly |

---

## Known NGM Pipeline IDs (this project)

| Pipeline | ID | Status |
|----------|----|--------|
| Basic biomarker (ACTIVE) | `69b17ab850276642673f9725` | Use this |
| Advanced analysis | `69583b9abb2cc87ef302c5dd` | Active |
| KB search | `695db9f5724cd19d985269a4` | Active |
| Basic biomarker V4 | `69af1acebe640dbf9b253683` | Deprecated |

API status polling reads `data.result` — not `data.outputs`.
