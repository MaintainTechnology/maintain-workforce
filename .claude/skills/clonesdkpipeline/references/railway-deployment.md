# Railway Deployment

All the files needed to deploy a cloned SDK pipeline to Railway.

## Files to add to the repo root

### `railway.json`

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

### `nixpacks.toml` — pins Node 22 LTS

```toml
[phases.setup]
nixPkgs = ["nodejs_22"]

[phases.install]
cmds = ["npm ci --omit=dev --no-audit --prefer-offline || npm install --omit=dev --no-audit"]

[start]
cmd = "node src/index.js"

[variables]
NODE_ENV = "production"
NPM_CONFIG_PRODUCTION = "true"
```

### `Procfile` — fallback start command

```
web: node src/index.js
```

### `.nvmrc`

```
22
```

### `.railwayignore`

```
node_modules/
.git/
.github/
.vscode/
.idea/

# Secrets — never push to Railway build context
.env
.env.*
!.env.example

# Tests
tests/
*.test.js

# Local artifacts
boot.log
smoke.log
*.log
data/api-keys.json

.DS_Store
Thumbs.db
```

### `package.json` engines pin

```json
"engines": { "node": ">=22.0.0 <23" }
```

## Persistent storage — the Railway Volume pattern

Railway containers are ephemeral. The default `./data/api-keys.json` vanishes on every redeploy. Fix: let operators mount a Volume and point `DATA_DIR` at it.

Update `src/services/api-keys.js` so the keys file location honors `DATA_DIR`:

```js
function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  return path.join(__dirname, '..', '..', 'data');
}
const DATA_DIR = resolveDataDir();
const KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');
```

In production:
1. Railway UI → Service → **Volumes** → New Volume, mount at `/data`
2. `railway variables set DATA_DIR=/data`
3. Redeploy

Now keys survive redeploys.

## Preflight env validator

`scripts/preflight.js` is runnable as `npm run preflight`. It validates required env vars and warns on placeholder admin keys:

```js
#!/usr/bin/env node
import 'dotenv/config';

const REQUIRED = [
  { key: 'VECTORSHIFT_API_KEY',                          why: 'KB retrieval.' },
  { key: 'ANTHROPIC_API_KEY_<PIPELINE>',                 why: 'Classifier LlmNode.' },
  { key: 'GOOGLE_AI_KEY_<PIPELINE>',                     why: 'Synthesis LlmNode.' },
  { key: 'KB_INTERVENTION_ID', defaultOk: '<id>',        why: 'knowledge_base_0.' },
  { key: 'KB_PATHWAY_ID',      defaultOk: '<id>',        why: 'knowledge_base_1.' },
  { key: 'KB_BIOMARKER_ID',    defaultOk: '<id>',        why: 'knowledge_base_2.' },
  { key: 'ADMIN_API_KEY',                                why: 'Issue/revoke consumer keys.' },
];

let missing = 0, warnings = 0;
for (const { key, why, defaultOk } of REQUIRED) {
  const value = process.env[key];
  if (!value) { console.log(`  ✗ ${key}  (${why})`); missing++; }
  else if (key === 'ADMIN_API_KEY' && /change.?me/i.test(value)) {
    console.log(`  ⚠ ${key}  still default "change me" value — rotate for production`);
    warnings++;
  } else {
    const masked = key.includes('KEY') || key.includes('SECRET')
      ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
    console.log(`  ✓ ${key}  = ${masked}`);
  }
}

if (missing > 0) { console.log(`\n  ✗ ${missing} missing`); process.exit(1); }
if (warnings > 0) console.log(`\n  ⚠ ${warnings} warning(s) — review before production`);
else console.log('\n  ✓ All required env vars present. Ready to deploy.');
```

Wire it into package.json:

```json
"scripts": {
  "preflight": "node scripts/preflight.js",
  "railway:check": "node scripts/preflight.js && echo 'Ready for Railway deploy.'"
}
```

## Runtime hardening in `src/index.js`

### Boot-time env check (fail fast)

```js
const REQUIRED_ENV = [
  'VECTORSHIFT_API_KEY',
  'ANTHROPIC_API_KEY_<PIPELINE>',
  'GOOGLE_AI_KEY_<PIPELINE>',
  'ADMIN_API_KEY',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error('\n  ✗ Missing required env vars:');
  for (const k of missingEnv) console.error(`      - ${k}`);
  console.error('\n  Run `npm run preflight` for details.');
  console.error('  On Railway: `railway variables set KEY=value`\n');
  process.exit(1);
}
```

### HTTP timeouts — long Gemini calls

```js
const server = app.listen(PORT, HOST, () => { /* ... */ });

// Gemini 3.1 Pro with 24K thinking budget can take 60-90s
server.keepAliveTimeout = 125_000;  // 125s — longer than any plausible single request
server.headersTimeout = 130_000;    // must be > keepAliveTimeout
server.requestTimeout = 0;          // no cap (we use SSE + long polls)
```

### Graceful SIGTERM handler

```js
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
  // Railway force-kills at 30s — we hard-stop at 25s
  setTimeout(() => process.exit(1), 25_000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', r => console.error('  ✗ Unhandled rejection:', r));
process.on('uncaughtException', err => {
  console.error('  ✗ Uncaught exception:', err.message);
  process.exit(1);  // Let Railway's restart policy recover
});
```

## User-facing deploy instructions (include in README)

```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login + link the project
railway login
cd <target-dir>
railway init          # new project, OR
railway link          # attach to existing

# 3. Push env vars from local .env (never commit .env)
while IFS='=' read -r key val; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  railway variables set "$key=$val"
done < .env

# 4. (Optional) Attach a Volume for API-key persistence
#    Railway UI → Volumes → mount at /data
railway variables set DATA_DIR=/data

# 5. Deploy
railway up

# 6. Verify
railway domain
curl https://<your-domain>/api/health
```

## Verification checklist post-deploy

```bash
# 1. Health should show all env vars configured
curl https://<your>.up.railway.app/api/health | jq '.env'

# 2. Docs should load
open https://<your>.up.railway.app/api/docs

# 3. Generate a consumer key
curl -X POST https://<your>.up.railway.app/api/keys/generate \
  -H "x-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-test"}'

# 4. Test the pipeline end-to-end
curl -X POST https://<your>.up.railway.app/api/pipeline/run \
  -H "x-api-key: <consumer-key>" \
  -H "Content-Type: application/json" \
  -d '{"input_0":"test question"}'
```

## Troubleshooting table

Add this to the README so operators have a runbook:

| Symptom | Fix |
|---|---|
| Build fails at `npm ci` | Check `package-lock.json` is committed. Nixpacks config falls back to `npm install` if missing. |
| Healthcheck fails after deploy | Hit `/api/health` directly — if env vars are missing, the server refuses to start. Run `npm run preflight` locally to see which are unset. |
| 429 errors in production | Raise `MAX_CONCURRENT_PIPELINES` or scale up `numReplicas` in `railway.json`. |
| API keys disappear on redeploy | Attach a Railway Volume and set `DATA_DIR=/data`. |
| Pipeline times out after ~60s | Check Railway region vs LLM region. Synthesizer retries 10× at 1s intervals — verify in logs. |
| SSE stream disconnects | Client-side timeout likely. Server keep-alive is 125s; short client timeouts drop early. |
| "Server is at capacity" immediately | Concurrency counter not decremented on error — check that the `.catch` block calls `activePipelines--` before returning. |

## Rotating the admin key

Before first production deploy:

```bash
# Generate a secure random admin key
ADMIN=$(node -e "console.log('ngm_admin_' + require('crypto').randomBytes(32).toString('hex'))")
railway variables set ADMIN_API_KEY="$ADMIN"
echo "Save this: $ADMIN"   # stash in 1Password — can't recover from Railway
```

Then re-issue all consumer keys using the new admin key.
