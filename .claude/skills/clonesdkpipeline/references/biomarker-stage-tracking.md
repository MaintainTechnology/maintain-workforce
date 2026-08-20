# Biomarker-Style Stage Tracking

Pattern ported from `ngm-biomarker-analysis`. The goal: give every pipeline run a visible, pollable, streamable progress trace — `{ stage, stageIndex, totalStages }` — so clients watching a 60-second Gemini synthesis see "STAGE 2 of 4: Knowledge Retrieval" instead of a spinner.

## Core types

Document these as JSDoc-style comments in `src/pipeline/orchestrator.js`:

```js
/**
 * JobProgress — emitted BEFORE each stage runs.
 *   { stage, stageIndex, totalStages }
 *
 * JobStatus — one of:
 *   "queued" | "running" | "completed" | "blocked" | "failed" | "cancelled"
 *
 * StatusResponse — what GET /api/pipeline/run/status/:taskId returns:
 *   {
 *     task_id, status, completed, stage, stageIndex, totalStages,
 *     started_at, completed_at, elapsed_seconds, result?, error?
 *   }
 */
```

## STAGES array pattern

The orchestrator declares every stage in a single array with `{ name, run }`:

```js
// src/pipeline/orchestrator.js
import { runIpGuard } from '../services/ip-guard.js';
import { runIpGuardGate } from '../services/ip-guard-gate.js';
import { runKnowledgeBases } from '../services/knowledge-base.js';
import { runSynthesizer } from '../services/synthesizer.js';
import { runOutputRouter } from '../services/output-router.js';
import { logger } from '../utils/logger.js';

// ── Stage implementations — thin wrappers over services ──

async function stageIpGuard(ctx) {
  logger.info('[Stage 01] IP Guard — screening input');
  const guard = await runIpGuard(ctx.input.input_0);
  const gate = runIpGuardGate({ guardResponse: guard.raw, userInput: ctx.input.input_0 });
  ctx.guard = {
    classifier_category: guard.category,
    is_blocked: gate.is_blocked === 'true',
    block_category: gate.block_category,
    block_message: gate.block_message,
    safe_input: gate.safe_input,
  };
  logger.info(`[Stage 01] IP Guard complete — blocked=${ctx.guard.is_blocked}`);
  return ctx;
}

async function stageKnowledgeRetrieval(ctx) {
  logger.info('[Stage 02] Knowledge Retrieval — querying 3 KBs in parallel');
  ctx.knowledge_bases = await runKnowledgeBases(ctx.guard.safe_input);
  logger.info('[Stage 02] Knowledge Retrieval complete');
  return ctx;
}

async function stageClinicalSynthesis(ctx) {
  logger.info('[Stage 03] Clinical Synthesis — Gemini 3.1 Pro Preview');
  ctx.synthesis = await runSynthesizer({
    safeInput: ctx.guard.safe_input,
    knowledgeBases: ctx.knowledge_bases,
  });
  logger.info('[Stage 03] Clinical Synthesis complete');
  return ctx;
}

// ── Stage registry ──
const STAGES = [
  { name: 'IP Guard', run: stageIpGuard },
  { name: 'Knowledge Retrieval', run: stageKnowledgeRetrieval },
  { name: 'Clinical Synthesis', run: stageClinicalSynthesis },
  // Stage 04 (Output Routing) is handled separately because it returns PipelineOutput, not PipelineContext.
];

const TOTAL_STAGES = STAGES.length + 1; // +1 for output routing

export function getTotalStages() { return TOTAL_STAGES; }
export function getStageNames() {
  return [...STAGES.map(s => s.name), 'Output Routing'];
}

// ── Orchestrator ──
export async function runPipeline(input, onProgress) {
  logger.info('Pipeline started');
  const startTime = Date.now();

  let ctx = createInitialContext(input);
  const stageMeta = {};

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];

    // Emit progress BEFORE running (matches biomarker semantics)
    onProgress?.({
      stage: stage.name,
      stageIndex: i + 1,
      totalStages: TOTAL_STAGES,
    });

    // Short-circuit on block
    if (i > 0 && ctx.guard.is_blocked) {
      logger.blocked(ctx.guard.block_category);
      break;
    }

    const stageStart = Date.now();
    ctx = await stage.run(ctx);
    stageMeta[stage.name] = { duration_ms: Date.now() - stageStart, completed: true };
  }

  // Stage 04: Output Routing — always runs (handles blocked + clean paths)
  onProgress?.({ stage: 'Output Routing', stageIndex: TOTAL_STAGES, totalStages: TOTAL_STAGES });
  const routingStart = Date.now();
  const routed = runOutputRouter({
    isBlocked: ctx.guard.is_blocked ? 'true' : 'false',
    blockMessage: ctx.guard.block_message,
    report: ctx.synthesis?.text || '',
  });
  stageMeta['Output Routing'] = { duration_ms: Date.now() - routingStart, completed: true };

  const elapsedMs = Date.now() - startTime;
  return {
    output_0: routed.final_output,
    stages: stageMeta,
    totalStages: TOTAL_STAGES,
    blocked: ctx.guard.is_blocked,
    block_category: ctx.guard.is_blocked ? ctx.guard.block_category : null,
    elapsed_seconds: parseFloat((elapsedMs / 1000).toFixed(1)),
  };
}
```

**Key rules:**

- Emit `onProgress` **before** each stage runs, not after. Clients polling see the current stage, not the last one finished.
- If the guard blocks, break the loop — but the Output Routing stage still runs so clients see "STAGE 4 of 4: Output Routing" as the final state.
- Track per-stage `duration_ms` in `stageMeta` so the response payload shows where time went.

## Route layer — tasks, concurrency, SSE

```js
// src/routes/pipeline.js
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runPipeline, getTotalStages, getStageNames } from '../pipeline/orchestrator.js';

const router = Router();
const tasks = new Map();             // taskId → job state
const subscribers = new Map();       // taskId → Set<res> for SSE

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_PIPELINES || '5', 10);
let activePipelines = 0;

// Cleanup sweep — keep finished jobs 30min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [taskId, task] of tasks) {
    const ended = task.completedAt ? new Date(task.completedAt).getTime() : 0;
    if (task.status !== 'running' && ended && ended < cutoff) tasks.delete(taskId);
  }
}, 10 * 60 * 1000);

function buildStatusResponse(taskId, task) {
  const elapsed = task.startedAt
    ? ((Date.now() - new Date(task.startedAt).getTime()) / 1000).toFixed(1)
    : 0;
  const progress = task.progress || {
    stage: task.stage || 'initializing',
    stageIndex: 0,
    totalStages: getTotalStages(),
  };
  return {
    task_id: taskId,
    status: task.status,
    completed: ['completed', 'failed', 'cancelled', 'blocked'].includes(task.status),
    stage: progress.stage,
    stageIndex: progress.stageIndex,
    totalStages: progress.totalStages,
    started_at: task.startedAt,
    completed_at: task.completedAt || null,
    elapsed_seconds: parseFloat(elapsed),
    ...(task.result && { result: task.result, outputs: task.result }),
    ...(task.error && { error: task.error, failed_stage: task.failedStage }),
  };
}

function emitTaskEvent(taskId, event, data) {
  const subs = subscribers.get(taskId);
  if (subs) for (const res of subs) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function updateTask(taskId, updates) {
  const task = tasks.get(taskId);
  if (!task) return;
  Object.assign(task, updates);
  emitTaskEvent(taskId, updates.status || 'progress', buildStatusResponse(taskId, task));
}

// ── POST /api/pipeline/run — synchronous ──
router.post('/run', async (req, res) => {
  const input_0 = req.body.input_0 ?? req.body.inputs?.input_0 ?? req.body.query;
  if (!input_0) return res.status(400).json({ error: 'input_0 is required' });

  try {
    const result = await runPipeline({ input_0 }, p => {
      console.log(`[sync] ${p.stage} (${p.stageIndex}/${p.totalStages})`);
    });
    res.json({
      status: result.blocked ? 'blocked' : 'completed',
      completed: true,
      stage: 'Output Routing',
      stageIndex: result.totalStages,
      totalStages: result.totalStages,
      elapsed_seconds: result.elapsed_seconds,
      result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pipeline/run/async — with concurrency limiter ──
function startAsync(req, res) {
  const input_0 = req.body.input_0 ?? req.body.inputs?.input_0 ?? req.body.query;
  if (!input_0) return res.status(400).json({ error: 'input_0 is required' });

  if (activePipelines >= MAX_CONCURRENT) {
    return res.status(429).json({
      error: 'Server is at capacity. Please try again in a few minutes.',
      active_pipelines: activePipelines,
      max_concurrent: MAX_CONCURRENT,
      retry_after_seconds: 60,
    });
  }

  const taskId = uuidv4();
  const totalStages = getTotalStages();
  tasks.set(taskId, {
    status: 'running',
    stage: 'Initializing',
    progress: { stage: 'Initializing', stageIndex: 0, totalStages },
    startedAt: new Date().toISOString(),
    result: null, error: null, failedStage: null, completedAt: null,
  });

  activePipelines++;
  res.json({
    task_id: taskId,
    taskId,
    status: 'running',
    stage: 'Initializing',
    stageIndex: 0,
    totalStages,
    stages: getStageNames(),
    active_pipelines: activePipelines,
    max_concurrent: MAX_CONCURRENT,
    poll_url: `/api/pipeline/run/status/${taskId}`,
    result_url: `/api/pipeline/run/result/${taskId}`,
    stream_url: `/api/pipeline/run/stream/${taskId}`,
  });

  runPipeline({ input_0 }, p => {
    updateTask(taskId, { stage: p.stage, progress: p });
  })
    .then(result => {
      activePipelines--;
      const finalStatus = result.blocked ? 'blocked' : 'completed';
      updateTask(taskId, {
        status: finalStatus,
        progress: { stage: 'Output Routing', stageIndex: result.totalStages, totalStages: result.totalStages },
        completedAt: new Date().toISOString(),
        result,
      });
      emitTaskEvent(taskId, finalStatus, buildStatusResponse(taskId, tasks.get(taskId)));
      const subs = subscribers.get(taskId);
      if (subs) { for (const r of subs) r.end(); subscribers.delete(taskId); }
    })
    .catch(err => {
      activePipelines--;
      updateTask(taskId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: err.message,
        failedStage: tasks.get(taskId)?.stage || 'unknown',
      });
      emitTaskEvent(taskId, 'error', buildStatusResponse(taskId, tasks.get(taskId)));
      const subs = subscribers.get(taskId);
      if (subs) { for (const r of subs) r.end(); subscribers.delete(taskId); }
    });
}

router.post('/run/async', startAsync);
router.post('/start', startAsync);                                    // biomarker-style alias

router.get('/run/status/:taskId', getStatus);
router.get('/status/:taskId', getStatus);                             // biomarker alias
function getStatus(req, res) {
  const task = tasks.get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(buildStatusResponse(req.params.taskId, task));
}

// ── SSE stream ──
router.get('/run/stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (['completed', 'failed', 'cancelled', 'blocked'].includes(task.status)) {
    res.write(`event: ${task.status}\ndata: ${JSON.stringify(buildStatusResponse(taskId, task))}\n\n`);
    return res.end();
  }

  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify(buildStatusResponse(taskId, task))}\n\n`);

  if (!subscribers.has(taskId)) subscribers.set(taskId, new Set());
  subscribers.get(taskId).add(res);

  req.on('close', () => {
    const subs = subscribers.get(taskId);
    if (subs) { subs.delete(res); if (subs.size === 0) subscribers.delete(taskId); }
  });
});

// ── Capacity endpoint ──
router.get('/capacity', (_req, res) => {
  res.json({
    active_pipelines: activePipelines,
    max_concurrent: MAX_CONCURRENT,
    available_slots: Math.max(0, MAX_CONCURRENT - activePipelines),
    accepting_requests: activePipelines < MAX_CONCURRENT,
    total_stages: getTotalStages(),
    stage_names: getStageNames(),
  });
});

export default router;
```

## Colored terminal logger

`src/utils/logger.js` uses ANSI escapes to format stage transitions:

```
14:32:15  ▶ Stage 01 START  IP Guard — screening input
14:32:18  ✓ Stage 01 DONE   IP Guard — blocked=false
14:32:18  ▶ Stage 02 START  Knowledge Retrieval — querying 3 KBs in parallel
14:32:28  ✓ Stage 02 DONE   Knowledge Retrieval
14:32:28  ▶ Stage 03 START  Clinical Synthesis — Gemini 3.1 Pro Preview
14:33:45  ✓ Stage 03 DONE   Clinical Synthesis (42.1KB)
```

The logger's `info()` function pattern-matches on substrings like `[Stage NN]` and applies the right formatting. Full implementation lives in the canonical repo at `src/utils/logger.js` — copy it verbatim and adjust only the stage count / names.

## Graceful shutdown

When Railway redeploys, it sends SIGTERM then force-kills after 30s. Drain in-flight pipelines before exit:

```js
// src/index.js (tail)
const server = app.listen(PORT, HOST, () => { /* ... */ });

// Long-running Gemini calls need generous keep-alive
server.keepAliveTimeout = 125_000;
server.headersTimeout = 130_000;
server.requestTimeout = 0;

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${signal} received — draining connections...`);

  server.close(err => {
    if (err) { console.error('  Shutdown error:', err.message); process.exit(1); }
    console.log('  Server closed cleanly.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('  Forced exit — connections did not drain within 25s.');
    process.exit(1);
  }, 25_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', r => console.error('  ✗ Unhandled rejection:', r));
process.on('uncaughtException', err => {
  console.error('  ✗ Uncaught exception:', err.message);
  process.exit(1);
});
```

## Status response shape — parity with biomarker

The exact field names matter because existing biomarker-style clients depend on them:

```json
{
  "task_id":        "uuid",
  "status":         "queued | running | completed | blocked | failed | cancelled",
  "completed":      true,
  "stage":          "Knowledge Retrieval",
  "stageIndex":     2,
  "totalStages":    4,
  "started_at":     "2026-04-17T14:32:08.421Z",
  "completed_at":   null,
  "elapsed_seconds": 3.7,
  "result":         { ... },
  "outputs":        { ... }
}
```

Include both `result` and `outputs` (aliases of each other) so callers written against either convention work.
