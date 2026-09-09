// No network calls, account creation, credentials written, or migrations. Report
// all missing secret NAMES together before installing the live verification tools.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseE2eFixtureBundle } from "./prepare-e2e-fixtures.mjs";
import { readRlsFixtureConfig, RLS_FIXTURE_ENV } from "./validate-rls-fixtures.mjs";

// Runtime environment name -> repository/organization Actions secret name.
export const PREVIEW_SECRET_ENV = Object.freeze({
  SUPABASE_ACCESS_TOKEN: "SUPABASE_ACCESS_TOKEN",
  SUPABASE_DB_URL: "SUPABASE_PREVIEW_DB_URL",
  APP_BASE_URL: "PREVIEW_BASE_URL",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "E2E_CLERK_PUBLISHABLE_KEY",
  CLERK_SECRET_KEY: "E2E_CLERK_SECRET_KEY",
  NEXT_PUBLIC_SUPABASE_URL: "E2E_SUPABASE_URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "E2E_SUPABASE_ANON_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "E2E_SUPABASE_SERVICE_ROLE_KEY",
  E2E_FIXTURE_BUNDLE_JSON: "E2E_FIXTURE_BUNDLE_JSON",
  RLS_TEST_URL: "E2E_SUPABASE_URL",
  RLS_TEST_ANON_KEY: "E2E_SUPABASE_ANON_KEY",
  ...Object.fromEntries(Object.values(RLS_FIXTURE_ENV).map((name) => [name,
    name === "RLS_TEST_CLERK_SECRET_KEY" ? "E2E_CLERK_SECRET_KEY"
      : name === "RLS_TEST_SERVICE_KEY" ? "E2E_SUPABASE_SERVICE_ROLE_KEY" : name,
  ])),
});

/** @param {Record<string, string | undefined>} environment */
export function validatePreviewConfig(environment) {
  const missing = [...new Set(Object.entries(PREVIEW_SECRET_ENV)
    .filter(([name]) => !environment[name]?.trim()).map(([, secret]) => secret))];
  if (missing.length) {
    throw new Error(`Isolated-preview verification is blocked by missing Actions secrets: ${missing.join(", ")}. Configure repository secrets (or organization secrets shared with this repository) using seed-data/E2E-VERIFICATION.md. Production environment secrets are not available to this job. No preview migration or live test has run.`);
  }
  parseE2eFixtureBundle(environment.E2E_FIXTURE_BUNDLE_JSON);
  readRlsFixtureConfig(environment, { required: true });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    validatePreviewConfig(process.env);
    console.log("Required preview secrets are present; bundle envelope and RLS configuration validated. Browser preflight and live verification are still required.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Isolated-preview configuration is invalid.");
    process.exitCode = 1;
  }
}
