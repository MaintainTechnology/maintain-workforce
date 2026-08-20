# Templates

Copy-paste starter files referenced by `SKILL.md`. Each `.template` file is a
drop-in replacement — just rename and fill in the placeholders.

| File | Target location | Purpose |
|---|---|---|
| `package.json.template`         | `<repo>/package.json`         | Base dependencies (Anthropic, Google, Express, Swagger UI, uuid) |
| `railway.json.template`         | `<repo>/railway.json`         | Railway build + deploy config |
| `nixpacks.toml.template`        | `<repo>/nixpacks.toml`        | Node 22 LTS pin + install command |
| `Procfile.template`             | `<repo>/Procfile`             | Fallback start command |
| `.nvmrc.template`               | `<repo>/.nvmrc`               | Local + CI Node version |
| `.railwayignore.template`       | `<repo>/.railwayignore`       | Keep secrets + tests out of Railway build |
| `.gitignore.template`           | `<repo>/.gitignore`           | Don't commit .env or data/api-keys.json |
| `preflight.js.template`         | `<repo>/scripts/preflight.js` | Env validator — customize REQUIRED array |
| `sdk-parity.test.js.template`   | `<repo>/tests/sdk-parity.test.js` | 100+ assertion scaffold — fill in SDK values |

## Placeholder conventions

- `<slug>` — the pipeline's kebab-case slug (e.g. `ngm-peptide-advisor`)
- `<pipeline-name>` — human-readable name (e.g. "Peptide Advisor")
- `<PIPELINE>` — UPPER_SNAKE env-var suffix (e.g. `PEPTIDE_ADVISOR`)
- `<SDK_KB_ID>` / `<SDK_KB_ID_0>` — the KB ID from the SDK (e.g. `69a9...`)
- `<SDK value>` — the exact string from the SDK (e.g. `gemini-3.1-pro-preview`)
- `<role>` — semantic KB role (e.g. `intervention`, `pathway`, `biomarker`, `protocol`)

## Why these are separate from SKILL.md

`SKILL.md` stays under the progressive-disclosure budget by pointing at
templates instead of inlining them. Claude only reads a template when the
workflow actually needs it — no upfront cost.

For files that are highly SDK-specific (service implementations, prompt
contents, OpenAPI spec), read the canonical reference implementation at:

```
C:\Users\dalig\Desktop\NexGenMedicine\nextGenOrganization\ngm-knowledge-assistant-lean
```

The canonical repo passes 107/107 SDK parity tests — use it as the gold
standard for anything not explicitly templated here.
