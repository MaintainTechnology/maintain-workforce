#!/usr/bin/env node
// Read-only: inspect PostgREST's service-role schema without executing any RPC.
// Run with environment variables already set, or node --env-file=<file> ...
import { pathToFileURL } from "node:url";

export const REQUIRED_RPCS = [
  "create_worker_transactional",
  "company_verification_checklist",
  "verify_company_document_atomic",
  "transition_company_status_atomic",
  "update_company_profile_atomic",
  "save_company_document_atomic",
];

/** @param {Record<string, string | undefined>} env */
export async function checkDatabaseReadiness(env = process.env, fetcher = fetch) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the intended environment.");
  }
  const endpoint = new URL("/rest/v1/", url);
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("The Supabase URL must use HTTPS outside localhost.");
  }
  let response;
  try {
    response = await fetcher(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    throw new Error("Could not read the database API schema. Check connectivity and the selected environment.");
  }
  if (!response.ok) throw new Error(`Database API schema request failed (HTTP ${response.status}). Check the server credentials.`);
  let schema;
  try { schema = await response.json(); }
  catch { throw new Error("Database API schema response was not valid JSON."); }
  if (!schema?.paths || typeof schema.paths !== "object" || Array.isArray(schema.paths)) {
    throw new Error("Database API did not return an OpenAPI paths object; readiness is unverified.");
  }
  return REQUIRED_RPCS.filter((name) => !schema.paths[`/rpc/${name}`]?.post);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const missing = await checkDatabaseReadiness();
    if (missing.length) {
      console.error(`Database is missing required worker/approval RPCs: ${missing.join(", ")}.`);
      console.error("Apply the reviewed missing migrations using seed-data/PRODUCTION-CUTOVER.md, then rerun this check. No data was changed.");
      process.exitCode = 1;
    } else {
      console.log("Worker creation and company approval RPCs are present. This read-only check does not prove an authenticated workflow.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
