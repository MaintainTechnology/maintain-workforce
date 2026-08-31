import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readRlsFixtureConfig, RLS_FIXTURE_ENV } from "../../scripts/validate-rls-fixtures.mjs";

function configured(): Record<string, string> {
  return {
    RLS_TEST_REQUIRED: "1",
    RLS_TEST_URL: "https://isolated-fixture.supabase.co",
    RLS_TEST_ANON_KEY: "fixture-anon-not-a-secret",
    ...Object.fromEntries(Object.entries(RLS_FIXTURE_ENV).map(([key, name]) => [name,
      key === "clerkSecretKey" ? "sk_test_configuration_only"
        : key.endsWith("UserId") ? `user_${key}`
          : key.endsWith("Id") ? "11111111-2222-3333-4444-555555555555"
            : key.endsWith("Path") ? "11111111-2222-3333-4444-555555555555/fixture.pdf"
              : "fixture-service-not-a-secret",
    ])),
  };
}

describe("shared no-network RLS configuration preflight", () => {
  it("skips ordinary local development even when ordinary app credentials exist", () => {
    expect(readRlsFixtureConfig({})).toBeNull();
    expect(readRlsFixtureConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://app.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "app-key",
      RLS_TEST_REQUIRED: "0",
    })).toBeNull();
  });

  it("returns complete normalised config without using a network transport", () => {
    const environment = configured();
    environment.RLS_TEST_URL += "/";
    environment.RLS_TEST_CLERK_SECRET_KEY = "  sk_test_configuration_only  ";
    const config = readRlsFixtureConfig(environment)!;
    expect(config.url).toBe("https://isolated-fixture.supabase.co");
    expect(config.values.clerkSecretKey).toBe("sk_test_configuration_only");
    expect(Object.keys(config.values)).toEqual(Object.keys(RLS_FIXTURE_ENV));
  });

  it.each(["RLS_TEST_URL", "RLS_TEST_ANON_KEY", ...Object.values(RLS_FIXTURE_ENV)])(
    "rejects a missing required %s before a deployment can proceed", (name) => {
      const environment = configured();
      delete environment[name];
      expect(() => readRlsFixtureConfig(environment)).toThrow(name);
      environment[name] = " \n\t ";
      expect(() => readRlsFixtureConfig(environment)).toThrow(name);
    },
  );

  it("does not silently skip partially configured live verification", () => {
    expect(() => readRlsFixtureConfig({ RLS_TEST_CLOSED_CLERK_USER_ID: "user_closed" }))
      .toThrow("RLS_TEST_CLOSED_WORKER_ID");
    expect(() => readRlsFixtureConfig({}, { required: true })).toThrow("RLS_TEST_URL");
  });

  it("shares the existing URL and anon-key fallbacks with the live suite", () => {
    const environment = configured();
    environment.NEXT_PUBLIC_SUPABASE_URL = environment.RLS_TEST_URL;
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = environment.RLS_TEST_ANON_KEY;
    delete environment.RLS_TEST_URL;
    delete environment.RLS_TEST_ANON_KEY;
    expect(readRlsFixtureConfig(environment)).toMatchObject({
      url: environment.NEXT_PUBLIC_SUPABASE_URL, anonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  });

  it.each(["sk_live_do_not_disclose", "sk_test_", "malformed_secret_do_not_disclose"])(
    "rejects a non-development or incomplete Clerk secret without exposing it (%#)", (secret) => {
      const environment = configured();
      environment.RLS_TEST_CLERK_SECRET_KEY = secret;
      let message = "";
      try { readRlsFixtureConfig(environment); } catch (error) { message = (error as Error).message; }
      expect(message).toContain("RLS_TEST_CLERK_SECRET_KEY");
      expect(message).not.toContain("do_not_disclose");
    },
  );

  it.each(Object.entries(RLS_FIXTURE_ENV).filter(([key]) => key.endsWith("Id")))(
    "validates fixture identity %s before any session request", (key, name) => {
      const environment = configured();
      environment[name] = key.endsWith("UserId") ? "not_a_clerk_user" : "not-a-database-uuid";
      expect(() => readRlsFixtureConfig(environment)).toThrow(name);
    },
  );

  it.each([
    "http://remote.supabase.co", "https://user:password@fixture.supabase.co",
    "https://fixture.supabase.co/path", "https://fixture.supabase.co?secret=not-for-logs",
    "https://fixture.supabase.co#fragment", "not-a-url",
  ])("rejects unsafe or non-origin database URLs (%#)", (url) => {
    const environment = configured();
    environment.RLS_TEST_URL = url;
    expect(() => readRlsFixtureConfig(environment)).toThrow("RLS_TEST_URL must be an HTTPS database origin");
  });

  it("rejects RLS and browser database origin mismatches", () => {
    const environment = configured();
    environment.NEXT_PUBLIC_SUPABASE_URL = "https://another-fixture.supabase.co";
    expect(() => readRlsFixtureConfig(environment)).toThrow("must match NEXT_PUBLIC_SUPABASE_URL");
  });

  it.each(["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"])(
    "supports isolated loopback databases at %s", (url) => {
      const environment = configured();
      environment.RLS_TEST_URL = url;
      expect(readRlsFixtureConfig(environment)?.url).toBe(url);
    },
  );

  it("CLI fails missing fixtures even without a required flag and never logs secret values", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/validate-rls-fixtures.mjs")], {
      encoding: "utf8", env: { NODE_ENV: "test", RLS_TEST_CLERK_SECRET_KEY: "sk_test_do_not_disclose" }, timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("RLS_TEST_CLOSED_WORKER_ID");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sk_test_do_not_disclose");
  });

  it("CLI accepts only complete fixture configuration without connecting to its fake origin", () => {
    const environment = configured();
    delete environment.RLS_TEST_REQUIRED;
    const result = spawnSync(process.execPath, [resolve("scripts/validate-rls-fixtures.mjs")], {
      encoding: "utf8", env: { ...environment, NODE_ENV: "test" }, timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no sessions or database connections");
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(environment.RLS_TEST_CLERK_SECRET_KEY);
  });
});
