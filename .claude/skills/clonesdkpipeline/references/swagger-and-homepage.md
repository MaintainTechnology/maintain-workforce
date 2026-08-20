# Swagger Docs + Landing Page

Two public surfaces that every cloned API must ship:

- `GET /` — HTML landing page showing capabilities, pipeline flow, stage list, quick-start
- `GET /api/docs` — Swagger UI with every endpoint documented
- `GET /api/openapi.json` — raw OpenAPI 3.0.3 spec (for codegen + tooling)

Both should be **public** (no API key). They're discovery surfaces; the endpoints they document still require keys.

## Dependencies

```json
"dependencies": {
  "swagger-ui-express": "^5.0.1"
}
```

No swagger-jsdoc or similar — we define the spec as a JS object for full control.

## OpenAPI spec structure

`src/swagger/openapi-spec.js` exports a single object following OpenAPI 3.0.3:

```js
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: '<Pipeline Name> API',
    version: '1.0.0',
    description: `... (markdown, includes pipeline diagram + capabilities) ...`,
    contact: { name: 'NGM Engineering', url: 'https://nextgenerationmedicine.co' },
    license: { name: 'Private / Internal' },
  },
  servers: [
    { url: '/', description: 'Current server' },
    { url: 'https://<slug>-production.up.railway.app', description: 'Railway (production)' },
  ],
  tags: [
    { name: 'Pipeline', description: 'Run the pipeline and track stage progress.' },
    { name: 'Tasks', description: 'List, inspect, manage async tasks.' },
    { name: 'Capacity', description: 'Live concurrency + stage metadata.' },
    { name: 'Keys (Admin)', description: 'Issue and revoke consumer API keys.' },
    { name: 'Health', description: 'Service status and node configuration.' },
  ],
  components: {
    securitySchemes: {
      ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      BearerAuth:   { type: 'http', scheme: 'bearer' },
      AdminKey:     { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
    schemas: { /* PipelineInput, JobProgress, StatusResponse, etc. */ },
  },
  security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
  paths: {
    '/api/health':                                { get: { /*...*/ } },
    '/api/pipeline/run':                          { post: { /*...*/ } },
    '/api/pipeline/run/async':                    { post: { /*...*/ } },
    '/api/pipeline/start':                        { post: { /*...*/ } },
    '/api/pipeline/run/status/{taskId}':          { get: { /*...*/ } },
    '/api/pipeline/status/{taskId}':              { get: { /*...*/ } },
    '/api/pipeline/run/result/{taskId}':          { get: { /*...*/ } },
    '/api/pipeline/run/stream/{taskId}':          { get: { /*...*/ } },
    '/api/pipeline/run/terminate/{taskId}':       { post: { /*...*/ } },
    '/api/pipeline/tasks':                        { get: { /*...*/ }, delete: { /*...*/ } },
    '/api/pipeline/capacity':                     { get: { /*...*/ } },
    '/api/keys/generate':                         { post: { security: [{ AdminKey: [] }], /*...*/ } },
    '/api/keys':                                  { get:  { security: [{ AdminKey: [] }], /*...*/ } },
    '/api/keys/{id}/revoke':                      { post: { security: [{ AdminKey: [] }], /*...*/ } },
    '/api/keys/{id}':                             { delete: { security: [{ AdminKey: [] }], /*...*/ } },
  },
};
```

See the canonical repo at `src/swagger/openapi-spec.js` for the full schema definitions — 11 reusable schemas (`PipelineInput`, `JobProgress`, `PipelineResult`, `SyncRunResponse`, `AsyncStartResponse`, `StatusResponse`, `TasksListResponse`, `CapacityResponse`, `HealthResponse`, `GeneratedKey`, `KeyList`, `ErrorResponse`, `CapacityError429`).

## Docs route

```js
// src/routes/docs.js
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from '../swagger/openapi-spec.js';

const router = Router();
const swaggerCustomCss = `/* NGM editorial theme — see below */`;

router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customCss: swaggerCustomCss,
  customSiteTitle: '<Pipeline Name> — API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 0,
    filter: true,
    tryItOutEnabled: true,
  },
}));

router.get('/openapi.json', (_req, res) => res.json(openapiSpec));

export default router;
```

Mount in `index.js`:

```js
import docsRoutes from './routes/docs.js';
app.use('/api', docsRoutes);   // /api/docs + /api/openapi.json
```

## NGM Editorial design system

**Fonts:**
```
Cormorant Garamond   — display headings (400, 500, 600 + italic)
Source Serif 4       — body (400, 600)
DM Sans              — UI/kicker/code (400, 500, 600, 700)
SF Mono / Fira Code  — code blocks
```

Import via Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Color palette (CSS custom properties):**

```css
:root {
  --font-display: "Cormorant Garamond", Georgia, serif;
  --font-body:    "Source Serif 4", Georgia, serif;
  --font-ui:      "DM Sans", system-ui, sans-serif;
  --font-mono:    'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace;

  --paper:       #FEFDFB;   /* warm white */
  --paper-warm:  #F5F3EE;   /* cream */
  --ink:         #1A1A1A;
  --ink-2:       #3A3A3A;
  --ink-3:       #6A6A6A;
  --ink-4:       #9A9A9A;
  --rule:        #D4D0C8;
  --rule-light:  #E8E5DE;
  --accent:      #8B7355;   /* warm tan */
  --green:       #4A7A5A;
  --blue:        #4A6A7A;
  --orange:      #B06840;
  --purple:      #6A5A7A;
}
```

**Method-color convention for endpoints:** GET = blue, POST = green, DELETE = orange.

## Landing page structure

`src/pages/home.html` is a single self-contained HTML file (no external JS). Sections:

1. **Hero** — kicker ("NGM Pipeline API"), h1 title, italic tagline, status badges (Live, version, 4 stages, parity tests passed)
2. **Quick nav cards** (3 columns) — links to `/api/docs`, `/api/openapi.json`, `/api/health`
3. **Pipeline section** — ASCII diagram of the flow (use colored spans for stage labels)
4. **Stage list** — 4-row card showing STAGE 01, 02, 03, 04 with model/provider details
5. **Capabilities grid** — 6 cards with emoji + short description (security guard, KB retrieval, synthesis, sanitizer, stage tracking, key-gated access)
6. **Endpoints table** — method pills + path + purpose, one row per endpoint
7. **Quick start** — 3-4 curl examples showing key generation, sync run, async+SSE
8. **SDK parity note** — references the exported `*_CONFIG` objects + test count
9. **Footer** — links to `/api/docs`, `/api/openapi.json`, `/api/health`

See the canonical `src/pages/home.html` — 20KB fully styled, copy and swap out text/stage count/model names.

## Swagger custom CSS

Apply the NGM theme to Swagger UI by passing `customCss` into `swaggerUi.setup`. The key overrides:

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Source+Serif+4:wght@400;600&family=DM+Sans:wght@400;500;600;700&display=swap');

html, body { background: #FEFDFB; }
.swagger-ui { max-width: 960px; margin: 0 auto; padding: 32px 24px; font-family: "Source Serif 4", Georgia, serif; color: #3A3A3A; }
.swagger-ui .topbar { display: none; }
.swagger-ui .info .title { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 400; font-size: 2.4rem; color: #1A1A1A; }
.swagger-ui .opblock-tag { font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.4rem; font-weight: 500; color: #1A1A1A; border-bottom: 1px solid #E8E5DE; }

/* Method color convention */
.swagger-ui .opblock.opblock-get    .opblock-summary-method { background: #4A6A7A; }
.swagger-ui .opblock.opblock-post   .opblock-summary-method { background: #4A7A5A; }
.swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #B06840; }

/* Execute button */
.swagger-ui .btn.execute { background: #1A1A1A; border-color: #1A1A1A; color: #FEFDFB; }
.swagger-ui .btn.authorize { color: #8B7355; border-color: #8B7355; }
```

Full CSS in the canonical repo's `src/routes/docs.js`.

## Linking everything

Update `index.js` to mount in this order:

```js
// Public landing page
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'pages', 'home.html')));

// Public docs
app.use('/api', docsRoutes);

// Admin-gated key management
app.use('/api/keys', apiKeyRoutes);

// Consumer-key-gated pipeline
app.use('/api/pipeline', requireApiKey, pipelineRoutes);

// Public health
app.get('/api/health', (_req, res) => res.json({ /* ... */ }));

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    hint: 'See /api/docs for the full endpoint list.',
  });
});
```

Order matters — `/api/keys` and `/api/pipeline` are registered AFTER the docs route so auth middleware doesn't block `/api/docs` or `/api/openapi.json`.
