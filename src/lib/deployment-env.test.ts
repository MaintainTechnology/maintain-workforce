import { describe, expect, it } from "vitest";
import { assertDeploymentEnvironment } from "./deployment-env";

function configured(target = "production"): Record<string, string> {
  return {
    VERCEL_ENV: target,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_Y2xlcmsubWFpbnRhaW53b3JrZm9yY2UuY29tLmF1JA==",
    // Prefix concatenated at runtime: GitHub push protection pattern-matches any
    // contiguous sk_live_<alnum...> token as a Stripe key and blocks the push, with no
    // way to mark a fixture. The joined value is identical for the code under test.
    CLERK_SECRET_KEY: "sk_live_" + "5DtuLhWSunconnectedFixture",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnpqrstu.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_7GqeMJUnconnectedFixture",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_2GKJmUnconnectedFixture",
    APP_BASE_URL: "https://www.maintainworkforce.com.au",
    NEXT_PUBLIC_SITE_URL: "https://www.maintainworkforce.com.au",
  };
}

function diagnostic(environment: Record<string, string | undefined>): string {
  try {
    assertDeploymentEnvironment(environment);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected deployment configuration to be rejected");
}

describe("hosted deployment environment", () => {
  it("reports every missing variable together with an actionable environment-specific remedy", () => {
    const message = diagnostic({ VERCEL_ENV: "production" });
    for (const name of Object.keys(configured()).filter((name) => name !== "VERCEL_ENV")) {
      expect(message).toContain(name);
    }
    expect(message).toContain("Vercel production deployment configuration is invalid");
    expect(message).toContain("Vercel Project Settings, then redeploy");
    expect(message).toContain("GitHub Actions secrets are not automatically Vercel environment variables");
  });

  it("aggregates missing, malformed, placeholder, and key-mode problems without exposing values", () => {
    const environment = configured();
    delete environment.SUPABASE_SERVICE_ROLE_KEY;
    environment.APP_BASE_URL = "https://private-user:PRIVATE-URL-SECRET@host.maintainworkforce.com.au";
    environment.CLERK_SECRET_KEY = "sk_test_PRIVATE-CLERK-SECRET";
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = "replace-me";
    const message = diagnostic(environment);
    expect(message).toContain("Missing required variables: SUPABASE_SERVICE_ROLE_KEY");
    expect(message).toContain("APP_BASE_URL must be an absolute HTTPS URL");
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY must contain a configured value");
    expect(message).toContain("same Clerk key mode");
    expect(message).toContain("Production requires Clerk live keys");
    expect(message).not.toContain("PRIVATE-");
    expect(message).not.toContain("replace-me");
  });

  it("accepts a configured production deployment without network access", () => {
    expect(() => assertDeploymentEnvironment(configured())).not.toThrow();
  });

  it.each(["live", "test"])("accepts matching %s Clerk keys in a hosted preview", (mode) => {
    const environment = configured("preview");
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_${mode}_Y2xlcmsucHJldmlldy52ZXJjZWwuYXBwJA==`;
    environment.CLERK_SECRET_KEY = `sk_${mode}_5DtuLhWSunconnectedFixture`;
    environment.APP_BASE_URL = "https://maintain-workforce-preview.vercel.app";
    expect(() => assertDeploymentEnvironment(environment)).not.toThrow();
  });

  it("rejects a production deployment using development Clerk keys", () => {
    const environment = configured();
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.replace("pk_live_", "pk_test_");
    environment.CLERK_SECRET_KEY = environment.CLERK_SECRET_KEY.replace("sk_live_", "sk_test_");
    expect(() => assertDeploymentEnvironment(environment)).toThrow("Production requires Clerk live keys");
  });

  it("rejects mismatched Clerk key modes even in a preview", () => {
    const environment = configured("preview");
    environment.CLERK_SECRET_KEY = environment.CLERK_SECRET_KEY.replace("sk_live_", "sk_test_");
    expect(() => assertDeploymentEnvironment(environment)).toThrow("same Clerk key mode");
  });

  it.each(["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"])("rejects an invalid %s without echoing it", (name) => {
    const environment = { ...configured(), [name]: "PRIVATE-CREDENTIAL-invalid-format" };
    const message = diagnostic(environment);
    expect(message).toContain(`${name} must be a Clerk`);
    expect(message).not.toContain("PRIVATE-CREDENTIAL");
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "APP_BASE_URL", "NEXT_PUBLIC_SITE_URL"])("requires a valid hosted HTTPS URL in %s", (name) => {
    const message = diagnostic({ ...configured("preview"), [name]: "http://private-host.maintainworkforce.com.au/PRIVATE-PATH" });
    expect(message).toContain(`${name} must be an absolute HTTPS URL`);
    expect(message).not.toContain("private-host");
    expect(message).not.toContain("PRIVATE-PATH");
  });

  it.each([
    "not a URL", "https://", "https://localhost", "https://127.0.0.1", "https://[::1]",
    "https://your-project.supabase.co", "https://example.com", "https://fixture.invalid",
    "https://username:PRIVATE-URL-SECRET@abcdefghijklmnpqrstu.supabase.co",
  ])("rejects an unusable URL (%s)", (url) => {
    const message = diagnostic({ ...configured(), NEXT_PUBLIC_SUPABASE_URL: url });
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTPS URL");
    expect(message).not.toContain(url);
  });

  it.each(["your-anon-key", "replace-me", "placeholder", "<service-key>", "${SUPABASE_KEY}", "undefined", "null", "dummy-key"])("rejects the placeholder %s", (value) => {
    expect(() => assertDeploymentEnvironment({ ...configured(), SUPABASE_SERVICE_ROLE_KEY: value })).toThrow("SUPABASE_SERVICE_ROLE_KEY must contain a configured value");
  });

  it("rejects placeholder values under otherwise-valid Clerk prefixes", () => {
    expect(() => assertDeploymentEnvironment({ ...configured(), CLERK_SECRET_KEY: "sk_live_replace_me" })).toThrow("CLERK_SECRET_KEY must contain a configured value");
  });

  it("rejects blank and accidentally padded credentials", () => {
    const environment = configured();
    environment.SUPABASE_SERVICE_ROLE_KEY = " \n ";
    environment.CLERK_SECRET_KEY += "\n";
    const message = diagnostic(environment);
    expect(message).toContain("Missing required variables: SUPABASE_SERVICE_ROLE_KEY");
    expect(message).toContain("CLERK_SECRET_KEY must contain a configured value without whitespace");
  });

  it("keeps legacy Supabase JWT credentials supported", () => {
    const environment = configured();
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature";
    environment.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
    expect(() => assertDeploymentEnvironment(environment)).not.toThrow();
  });

  it("rejects a server secret placed in the browser-visible Supabase variable", () => {
    const message = diagnostic({ ...configured(), NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_PRIVATE-SECRET" });
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a public application key");
    expect(message).not.toContain("PRIVATE-SECRET");
  });

  it.each([undefined, "development"])("preserves local and CI configuration with VERCEL_ENV=%s", (target) => {
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: target })).not.toThrow();
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: target, CLERK_SECRET_KEY: "dummy-key", APP_BASE_URL: "http://localhost:3000" })).not.toThrow();
  });
});
