import { pathToFileURL } from "node:url";

// One contract for the no-network deployment preflight and the live test suite.
// Values are deliberately never included in diagnostics: some are bearer secrets.
export const RLS_FIXTURE_ENV = Object.freeze({
  clerkSecretKey: "RLS_TEST_CLERK_SECRET_KEY",
  companyAUserId: "RLS_TEST_COMPANY_A_CLERK_USER_ID",
  companyAWorkerId: "RLS_TEST_COMPANY_A_WORKER_ID",
  companyBUserId: "RLS_TEST_COMPANY_B_CLERK_USER_ID",
  companyBWorkerId: "RLS_TEST_COMPANY_B_WORKER_ID",
  companyBCapacityLineId: "RLS_TEST_COMPANY_B_CAPACITY_LINE_ID",
  companyBDemandLineId: "RLS_TEST_COMPANY_B_DEMAND_LINE_ID",
  companyBDocumentId: "RLS_TEST_COMPANY_B_DOCUMENT_ID",
  buyerUserId: "RLS_TEST_BUYER_CLERK_USER_ID",
  supplierUserId: "RLS_TEST_SUPPLIER_CLERK_USER_ID",
  buyerMatchId: "RLS_TEST_BUYER_MATCH_ID",
  supplierMatchId: "RLS_TEST_SUPPLIER_MATCH_ID",
  buyerEngagementId: "RLS_TEST_BUYER_ENGAGEMENT_ID",
  supplierEngagementId: "RLS_TEST_SUPPLIER_ENGAGEMENT_ID",
  transferId: "RLS_TEST_TRANSFER_ID",
  cancelledBuyerEngagementId: "RLS_TEST_CANCELLED_BUYER_ENGAGEMENT_ID",
  cancelledSupplierEngagementId: "RLS_TEST_CANCELLED_SUPPLIER_ENGAGEMENT_ID",
  pendingUserId: "RLS_TEST_PENDING_CLERK_USER_ID",
  pendingWorkerId: "RLS_TEST_PENDING_WORKER_ID",
  suspendedUserId: "RLS_TEST_SUSPENDED_CLERK_USER_ID",
  suspendedWorkerId: "RLS_TEST_SUSPENDED_WORKER_ID",
  closedUserId: "RLS_TEST_CLOSED_CLERK_USER_ID",
  closedWorkerId: "RLS_TEST_CLOSED_WORKER_ID",
  companyDocumentPath: "RLS_TEST_COMPANY_DOCUMENT_PATH",
  workerQualificationPath: "RLS_TEST_WORKER_QUALIFICATION_PATH",
  serviceKey: "RLS_TEST_SERVICE_KEY",
  committingEngagementWorkerId: "RLS_TEST_COMMITTING_ENGAGEMENT_WORKER_ID",
  overlapEngagementId: "RLS_TEST_OVERLAP_ENGAGEMENT_ID",
});

/** @param {string} value @param {string} name */
function databaseOrigin(value, name) {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local))
        || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Invalid origin");
    }
    return url.origin;
  } catch {
    throw new Error(`${name} must be an HTTPS database origin (or local loopback HTTP).`);
  }
}

/**
 * This only validates configuration. It must not connect to Clerk/Supabase, create
 * sessions, mutate fixtures, or prove claims about data that requires live checks.
 * @param {Record<string, string | undefined>} environment
 * @param {{ required?: boolean }} [options]
 */
export function readRlsFixtureConfig(environment, options = {}) {
  /** @param {string} name */
  const read = (name) => environment[name]?.trim() ?? "";
  const requested = options.required || read("RLS_TEST_REQUIRED") === "1"
    || Object.keys(environment).some((name) => name.startsWith("RLS_TEST_")
      && name !== "RLS_TEST_REQUIRED" && read(name) !== "");
  if (!requested) return null;

  const url = read("RLS_TEST_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = read("RLS_TEST_ANON_KEY") || read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const values = /** @type {{ [K in keyof typeof RLS_FIXTURE_ENV]: string }} */ (
    Object.fromEntries(Object.entries(RLS_FIXTURE_ENV).map(([key, name]) => [key, read(name)]))
  );
  const missing = [
    ["RLS_TEST_URL", url], ["RLS_TEST_ANON_KEY", anonKey],
    ...Object.entries(RLS_FIXTURE_ENV).map(([key, name]) => [name, values[key]]),
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`RLS live verification requires seeded environment values: ${missing.join(", ")}`);
  }
  if (!values.clerkSecretKey.startsWith("sk_test_") || values.clerkSecretKey === "sk_test_") {
    throw new Error("RLS_TEST_CLERK_SECRET_KEY must belong to a Clerk development instance (sk_test_).");
  }
  for (const [key, name] of Object.entries(RLS_FIXTURE_ENV)) {
    if (key.endsWith("UserId") && !/^user_[A-Za-z0-9]+$/.test(values[key])) {
      throw new Error(`${name} must be an existing Clerk fixture user ID.`);
    }
    if (key.endsWith("Id") && !key.endsWith("UserId")
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values[key])) {
      throw new Error(`${name} must be a seeded database fixture UUID.`);
    }
  }
  const origin = databaseOrigin(url, "RLS_TEST_URL");
  if (read("NEXT_PUBLIC_SUPABASE_URL")
      && databaseOrigin(read("NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL") !== origin) {
    throw new Error("RLS_TEST_URL must match NEXT_PUBLIC_SUPABASE_URL for the preview under test.");
  }
  return { url: origin, anonKey, values };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    readRlsFixtureConfig(process.env, { required: true });
    console.log("RLS fixture configuration validated; no sessions or database connections were opened.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "RLS fixture configuration is invalid.");
    process.exitCode = 1;
  }
}
