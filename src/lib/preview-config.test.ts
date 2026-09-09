import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PREVIEW_SECRET_ENV, validatePreviewConfig } from "../../scripts/validate-preview-config.mjs";
import { RLS_FIXTURE_ENV } from "../../scripts/validate-rls-fixtures.mjs";

function configured(): Record<string, string> {
  const project = { adminStorageState: "state.json", pending: { storageState: "state.json" },
    selfServe: { supplier: { storageState: "state.json" }, buyer: { storageState: "state.json" } } };
  return {
    ...Object.fromEntries(Object.keys(PREVIEW_SECRET_ENV).map((name) => [name, "test-not-a-live-secret"])),
    ...Object.fromEntries(Object.entries(RLS_FIXTURE_ENV).map(([key, name]) => [name,
      key === "clerkSecretKey" ? "sk_test_configuration_only"
        : key.endsWith("UserId") ? `user_${key}`
          : key.endsWith("Id") ? "11111111-2222-3333-4444-555555555555"
            : "test-path-or-key",
    ])),
    NEXT_PUBLIC_SUPABASE_URL: "https://isolated-fixture.invalid",
    RLS_TEST_URL: "https://isolated-fixture.invalid",
    E2E_FIXTURE_BUNDLE_JSON: JSON.stringify({
      manifest: { projects: { "company-mobile": project, "admin-desktop": project } },
      storageStates: { "state.json": { cookies: [], origins: [] } },
    }),
  };
}

describe("isolated-preview job configuration", () => {
  it("reports missing Actions secret names together with the scope and provisioning guide", () => {
    let message = "";
    try { validatePreviewConfig({}); } catch (error) { message = (error as Error).message; }
    for (const name of new Set(Object.values(PREVIEW_SECRET_ENV))) expect(message).toContain(name);
    expect(message).toContain("Production environment secrets are not available");
    expect(message).toContain("seed-data/E2E-VERIFICATION.md");
    expect(message.match(/E2E_SUPABASE_URL/g)).toHaveLength(1);
  });

  it("still rejects partial configuration instead of skipping the required gate", () => {
    const environment = configured();
    environment.E2E_FIXTURE_BUNDLE_JSON = " \n ";
    delete environment.APP_BASE_URL;
    expect(() => validatePreviewConfig(environment)).toThrow("PREVIEW_BASE_URL, E2E_FIXTURE_BUNDLE_JSON");
  });

  it("rejects malformed bundle JSON without exposing its contents", () => {
    const environment = configured();
    environment.E2E_FIXTURE_BUNDLE_JSON = "TEST-BEARER-SECRET-not-json";
    expect(() => validatePreviewConfig(environment)).toThrow("not valid JSON");
    expect(() => validatePreviewConfig(environment)).not.toThrow("TEST-BEARER-SECRET");
  });

  it("uses the shared RLS validator to reject production Clerk credentials", () => {
    const environment = configured();
    environment.RLS_TEST_CLERK_SECRET_KEY = "sk_live_TEST-BEARER-SECRET";
    expect(() => validatePreviewConfig(environment)).toThrow("development instance");
    expect(() => validatePreviewConfig(environment)).not.toThrow("TEST-BEARER-SECRET");
  });

  it("CLI fails before live work with no secrets and keeps diagnostic output value-free", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/validate-preview-config.mjs")], {
      encoding: "utf8", timeout: 10_000,
      env: { NODE_ENV: "test", CLERK_SECRET_KEY: "sk_test_TEST-BEARER-SECRET" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E_FIXTURE_BUNDLE_JSON");
    expect(result.stderr).toContain("No preview migration or live test has run");
    expect(result.stdout + result.stderr).not.toContain("TEST-BEARER-SECRET");
  });

  it("CLI validates complete fake configuration without connecting to its unreachable origin", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/validate-preview-config.mjs")], {
      encoding: "utf8", timeout: 10_000, env: { NODE_ENV: "test", ...configured() },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("live verification are still required");
    expect(result.stdout).not.toContain("test-not-a-live-secret");
  });
});
