import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Use the real YAML parser already locked by ESLint, rather than matching comments.
const { load } = createRequire(import.meta.url)("js-yaml") as {
  load: (text: string) => unknown;
};

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
  "continue-on-error"?: boolean;
};

type Concurrency = { group: string; "cancel-in-progress": boolean | string };
type Job = {
  needs?: string | string[];
  if?: string;
  environment?: string;
  concurrency?: Concurrency;
  steps: Step[];
  "continue-on-error"?: boolean;
};

type Workflow = {
  on: {
    push: { branches: string[] };
    pull_request: null;
    workflow_dispatch?: { inputs: Record<string, unknown> };
  };
  concurrency: Concurrency;
  jobs: Record<string, Job>;
};

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function parsedWorkflow(): Workflow {
  return load(source(".github/workflows/ci.yml")) as Workflow;
}

function expression(value: string | undefined): string {
  expect(value).toMatch(/^\$\{\{[\s\S]*\}\}$/);
  return value!.slice(3, -2).trim().replace(/\s+/g, " ");
}

const releaseSha = "a".repeat(40);
const otherSha = "b".repeat(40);
function context(event: string, ref = "refs/heads/main", acknowledged = true, reviewedSha = releaseSha) {
  return {
    github: { event_name: event, ref, sha: releaseSha, workflow: "ci" },
    inputs: { coordinated_cutover: acknowledged, reviewed_sha: reviewedSha },
  };
}

// These pinned expressions use only operators with the same semantics in JS and
// GitHub Actions for the string/boolean contexts exercised below. No API calls run.
function evaluate(value: string, values: ReturnType<typeof context>): unknown {
  return runInNewContext(expression(value), values, { timeout: 100 });
}

function concurrencyGroup(group: string, values: ReturnType<typeof context>): string {
  return group.replace(/\$\{\{[^}]+\}\}/g, (value) => String(evaluate(value, values)));
}

describe("blocking deploy-pipeline contract", () => {
  it("blocks on verification, production build and a client-secret scan", () => {
    const workflow = source(".github/workflows/ci.yml");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("npm run verify");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run check:client-secrets");
    expect(workflow).toContain("CLIENT_SECRET_SENTINEL:");
  });

  it("proves migrations on a clean local database before touching preview", () => {
    const workflow = source(".github/workflows/ci.yml");
    const resetAt = workflow.indexOf("supabase db reset --local");
    const previewAt = workflow.indexOf('supabase db push --include-all --db-url "$SUPABASE_DB_URL"');

    expect(workflow).toContain("local-database:");
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db lint --local --fail-on error");
    expect(resetAt).toBeGreaterThanOrEqual(0);
    expect(previewAt).toBeGreaterThan(resetAt);
    expect(workflow).toContain("needs: [verify, local-database]");
  });

  it("cannot skip the starred browser suite when required credentials are absent", () => {
    const workflow = source(".github/workflows/ci.yml");
    const e2e = source("e2e/starred-flows.spec.ts");
    const playwright = source("playwright.config.ts");

    expect(workflow).toContain('E2E_REQUIRED: "1"');
    expect(workflow).toContain("APP_BASE_URL: ${{ secrets.PREVIEW_BASE_URL }}");
    expect(workflow).not.toContain("PLAYWRIGHT_BASE_URL");
    expect(e2e).toContain('process.env.E2E_REQUIRED === "1"');
    expect(e2e).toMatch(/if \(required && !configured\) \{\s*throw new Error/);
    expect(playwright).toContain("baseURL: process.env.APP_BASE_URL");
    expect(workflow).toContain('E2E_ALLOW_TEST_WRITES: "1"');
    expect(workflow).toContain("E2E_TARGET: isolated-preview");
    expect(workflow).toContain("E2E_FIXTURE_BUNDLE_JSON:");
    expect(workflow).not.toContain("E2E_PASSWORD:");
    const fixturesAt = workflow.indexOf("node scripts/prepare-e2e-fixtures.mjs");
    const discoveryAt = workflow.indexOf("npx playwright test --list");
    const migrationAt = workflow.indexOf('supabase db push --include-all --db-url "$SUPABASE_DB_URL"');
    expect(fixturesAt).toBeGreaterThanOrEqual(0);
    expect(discoveryAt).toBeGreaterThan(fixturesAt);
    expect(migrationAt).toBeGreaterThan(discoveryAt);
    expect(workflow).toContain("node scripts/prepare-e2e-fixtures.mjs --cleanup");
    expect(workflow).toContain("if: ${{ always() }}");
  });

  it("makes seeded live RLS evidence mandatory before Playwright", () => {
    const workflow = source(".github/workflows/ci.yml");
    const rlsAt = workflow.indexOf("npx vitest run src/lib/rls.integration.test.ts");
    const browserAt = workflow.indexOf("npm run test:e2e");

    expect(workflow).toContain('RLS_TEST_REQUIRED: "1"');
    expect(workflow).toContain("RLS_TEST_COMPANY_B_WORKER_ID:");
    expect(workflow).toContain("RLS_TEST_OVERLAP_ENGAGEMENT_ID:");
    expect(workflow).toContain("RLS_TEST_CLERK_SECRET_KEY:");
    expect(workflow).toContain("RLS_TEST_COMPANY_A_CLERK_USER_ID:");
    expect(workflow).not.toContain("RLS_TEST_COMPANY_A_PASSWORD:");
    expect(rlsAt).toBeGreaterThanOrEqual(0);
    expect(browserAt).toBeGreaterThan(rlsAt);
  });

  it("validates all live RLS fixture configuration without network calls before preview migration", () => {
    const workflow = source(".github/workflows/ci.yml");
    const preflightAt = workflow.indexOf("node scripts/validate-rls-fixtures.mjs");
    const migrationAt = workflow.indexOf('supabase db push --include-all --db-url "$SUPABASE_DB_URL"');
    const sessionsAt = workflow.indexOf("npx vitest run src/lib/rls.integration.test.ts");
    expect(preflightAt).toBeGreaterThanOrEqual(0);
    expect(migrationAt).toBeGreaterThan(preflightAt);
    expect(sessionsAt).toBeGreaterThan(migrationAt);
  });

  it("accounts explicitly for remote migration 007 preceding pending 006", () => {
    const workflow = source(".github/workflows/ci.yml");
    expect(workflow.match(/supabase db push --include-all/g)).toHaveLength(2);
  });

  it("requires a default-off manual cutover acknowledgement and reviewed commit", () => {
    expect(parsedWorkflow().on.workflow_dispatch).toEqual({
      inputs: {
        coordinated_cutover: expect.objectContaining({ type: "boolean", required: true, default: false }),
        reviewed_sha: expect.objectContaining({ type: "string", required: true }),
      },
    });
  });

  it("pins production authorization to the acknowledged manual main checkout", () => {
    const job = parsedWorkflow().jobs["migrate-production"];
    expect(expression(job.if)).toBe(
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.coordinated_cutover == true && inputs.reviewed_sha == github.sha",
    );
    expect(job.environment).toBe("production");
    expect(job.needs).toEqual(["verify", "local-database", "starred-flows"]);
  });

  it.each([
    { label: "push", values: context("push"), allowed: false },
    { label: "pull request", values: context("pull_request"), allowed: false },
    { label: "false acknowledgement", values: context("workflow_dispatch", undefined, false), allowed: false },
    { label: "different reviewed commit", values: context("workflow_dispatch", undefined, true, otherSha), allowed: false },
    { label: "missing reviewed commit", values: context("workflow_dispatch", undefined, true, ""), allowed: false },
    { label: "non-main branch", values: context("workflow_dispatch", "refs/heads/feature"), allowed: false },
    { label: "tag", values: context("workflow_dispatch", "refs/tags/release"), allowed: false },
    { label: "acknowledged reviewed main commit", values: context("workflow_dispatch"), allowed: true },
  ])("production condition handles $label", ({ values, allowed }) => {
    expect(evaluate(parsedWorkflow().jobs["migrate-production"].if!, values)).toBe(allowed);
  });

  it("runs all prerequisite gates on an acknowledged manual release without bypassing failed jobs", () => {
    const { jobs } = parsedWorkflow();
    expect(jobs.verify.if).toBeUndefined();
    expect(jobs["local-database"].if).toBeUndefined();
    expect(jobs["local-database"].needs).toBe("verify");
    expect(jobs["starred-flows"].needs).toEqual(["verify", "local-database"]);
    expect(expression(jobs["starred-flows"].if)).toBe(
      "github.ref == 'refs/heads/main' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.coordinated_cutover == true && inputs.reviewed_sha == github.sha))",
    );
    expect(evaluate(jobs["starred-flows"].if!, context("workflow_dispatch"))).toBe(true);
    expect(evaluate(jobs["starred-flows"].if!, context("pull_request"))).toBe(false);
    expect(evaluate(jobs["starred-flows"].if!, context("workflow_dispatch", undefined, false))).toBe(false);
    for (const job of Object.values(jobs)) {
      expect(job["continue-on-error"]).toBeUndefined();
      expect(job.if ?? "").not.toMatch(/always\(|failure\(|cancelled\(/);
      for (const step of job.steps) expect(step["continue-on-error"]).toBeUndefined();
    }
  });

  it("checks out the same immutable SHA in every verification and migration job", () => {
    for (const job of Object.values(parsedWorkflow().jobs)) {
      const checkouts = job.steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
      expect(checkouts).toHaveLength(1);
      expect(checkouts[0].with?.ref).toBe("${{ github.sha }}");
    }
  });

  it("fails an invalid manual request before checkout or any remote migration", () => {
    const preflight = parsedWorkflow().jobs.verify.steps[0];
    expect(preflight.name).toBe("Validate coordinated cutover request");
    expect(expression(preflight.if)).toBe("github.event_name == 'workflow_dispatch' && inputs.coordinated_cutover == true");
    expect(preflight.env).toEqual({
      REVIEWED_SHA: "${{ inputs.reviewed_sha }}",
      WORKFLOW_SHA: "${{ github.sha }}",
      WORKFLOW_REF: "${{ github.ref }}",
    });
    const inlineNode = preflight.run?.match(/^node --input-type=module <<'NODE'\n([\s\S]+)\nNODE\s*$/)?.[1];
    expect(inlineNode).toBeTruthy();
    for (const [ref, reviewed, expectedStatus] of [
      ["refs/heads/main", releaseSha, 0],
      ["refs/heads/main", otherSha, 1],
      ["refs/heads/main", "", 1],
      ["refs/heads/main", "not-a-commit-secret-looking-value", 1],
      ["refs/heads/feature", releaseSha, 1],
    ] as const) {
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", inlineNode!], {
        encoding: "utf8",
        timeout: 10_000,
        env: { NODE_ENV: "test", REVIEWED_SHA: reviewed, WORKFLOW_SHA: releaseSha, WORKFLOW_REF: ref },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(expectedStatus);
      if (reviewed) expect(result.stdout + result.stderr).not.toContain(reviewed);
    }
  });

  it("separates manual release concurrency from routine CI and never cancels an active production job", () => {
    const workflow = parsedWorkflow();
    expect(workflow.concurrency.group).toBe("maintain-workforce-${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}");
    expect(expression(String(workflow.concurrency["cancel-in-progress"]))).toBe("github.event_name != 'workflow_dispatch'");
    expect(workflow.jobs["migrate-production"].concurrency).toEqual({
      group: "maintain-workforce-production-cutover",
      "cancel-in-progress": false,
    });
    for (const [runningEvent, incomingEvent, shouldCancel] of [
      ["workflow_dispatch", "push", false],
      ["workflow_dispatch", "pull_request", false],
      ["workflow_dispatch", "workflow_dispatch", false],
      ["push", "push", true],
      ["pull_request", "pull_request", true],
    ] as const) {
      const running = context(runningEvent);
      const incoming = context(incomingEvent);
      const sameGroup = concurrencyGroup(workflow.concurrency.group, running) === concurrencyGroup(workflow.concurrency.group, incoming);
      const cancels = sameGroup && evaluate(String(workflow.concurrency["cancel-in-progress"]), incoming);
      expect(cancels).toBe(shouldCancel);
    }
  });

  it("keeps the production credential and mutation confined to the protected job", () => {
    const jobs = Object.entries(parsedWorkflow().jobs);
    expect(jobs.filter(([, job]) => JSON.stringify(job).includes("SUPABASE_PRODUCTION_DB_URL")).map(([name]) => name)).toEqual(["migrate-production"]);
    expect(jobs.filter(([, job]) => job.environment === "production").map(([name]) => name)).toEqual(["migrate-production"]);
  });

  it("does not claim additive-only compatibility, instant schema rollback, or automatic Vercel promotion blocking", () => {
    const workflow = source(".github/workflows/ci.yml");
    expect(workflow).not.toMatch(/migrations are additive-only|old\s+code on the new schema is the safe ordering|rollback is Vercel's instant rollback|this workflow is the blocking gate in front of promotion/);
    expect(existsSync(join(process.cwd(), "seed-data/PRODUCTION-CUTOVER.md"))).toBe(true);
  });
});
