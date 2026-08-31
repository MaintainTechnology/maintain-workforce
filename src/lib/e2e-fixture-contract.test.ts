import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTransactionFixtures } from "../../e2e/support/transaction-fixtures";
import { commercialExpectation, csvRecords } from "../../e2e/support/transaction-evidence";

const directories: string[] = [];
const now = new Date("2030-01-01T00:00:00Z");
let sequence = 0;
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;

function savedState(): { cookies: Record<string, unknown>[]; origins: unknown[] } {
  return { cookies: [{ name: "__session", value: "unit-test-placeholder-not-a-real-session",
    domain: "isolated-preview.example.test", path: "/", expires: -1,
    httpOnly: false, secure: true, sameSite: "Lax" }], origins: [] };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "mw-e2e-contract-"));
  directories.push(directory);
  const appOrigin = "https://isolated-preview.example.test";
  const supabaseUrl = "https://isolated-preview.supabase.co";
  function state(label: string) {
    const path = join(directory, `${label}.json`);
    writeFileSync(path, JSON.stringify({ cookies: [{
      name: "__session", value: "unit-test-placeholder-not-a-real-session",
      domain: "isolated-preview.example.test", path: "/", expires: -1,
      httpOnly: false, secure: true, sameSite: "Lax",
    }], origins: [] }));
    return path;
  }
  function company(label: string) {
    return { id: id(), legalName: `Reserved test business ${label}`, displayName: `Reserved test business ${label}` };
  }
  function line() {
    const workers = Array.from({ length: 2 }, () => {
      const workerId = id();
      return { id: workerId, name: `Fixture person ${workerId}`, mobile: `040${String(sequence).padStart(7, "0")}`,
        email: `worker-${sequence}@example.test`, ticketNumbers: [`TEST-TICKET-${sequence}`] };
    });
    return { tradeRoleId: id(), proficiencyId: id(), regionId: id(),
      startDate: "2030-02-01", endDate: "2030-02-14", hoursPerWeek: 32, capacityHoursPerWeek: 40,
      supplierRateCents: 7123, bandLowCents: 6000, bandHighCents: 8000,
      workers, shortlistWorkerIds: [workers[0].id], nomineeWorkerIds: [workers[1].id],
      skills: [{ id: id(), name: `Seed skill ${sequence}` }],
      qualifications: [{ id: id(), name: `Seed qualification ${sequence}` }] };
  }
  function project(label: string) {
    const lines = [line(), line()];
    lines[1].regionId = lines[0].regionId;
    return {
      adminStorageState: state(`${label}-admin`),
      pending: { ...company(`${label}-pending`), storageState: state(`${label}-pending`) },
      selfServe: {
        supplier: { ...company(`${label}-supplier`), storageState: state(`${label}-supplier`) },
        buyer: { ...company(`${label}-buyer`), storageState: state(`${label}-buyer`) },
        lines,
      },
      concierge: {
        supplier: { ...company(`${label}-phone-supplier`), neverLoggedIn: true },
        buyer: { ...company(`${label}-phone-buyer`), neverLoggedIn: true },
        line: line(), supplierContact: `${label} supplier test operator`, buyerContact: `${label} buyer test operator`,
      },
    };
  }
  const manifest = {
    version: 1, runId: "contract-run",
    target: { appOrigin, supabaseUrl, purpose: "isolated-preview", databaseIsDisposable: true,
      reservedTestAccountsOnly: true, emailDeliveryIsSandboxed: true },
    rules: { feeBp: 1500, minimumCrewSize: 1, minimumHoursPerLine: 8 },
    projects: { "company-mobile": project("mobile"), "admin-desktop": project("desktop") },
  };
  const path = join(directory, "fixtures.json");
  const env = { E2E_REQUIRED: "1", E2E_ALLOW_TEST_WRITES: "1", E2E_TARGET: "isolated-preview",
    APP_BASE_URL: appOrigin, NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_unit_test_placeholder", E2E_FIXTURES_FILE: path };
  const save = () => writeFileSync(path, JSON.stringify(manifest));
  save();
  return { manifest, env, save, directory };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("real-browser fixture safety contract", () => {
  it("skips only an ordinary unconfigured developer run", () => {
    expect(loadTransactionFixtures({}, now)).toBeNull();
    expect(() => loadTransactionFixtures({ E2E_REQUIRED: "1" }, now)).toThrow(/E2E_FIXTURES_FILE/);
    expect(() => loadTransactionFixtures({ E2E_ALLOW_TEST_WRITES: "1" }, now)).toThrow(/E2E_FIXTURES_FILE/);
  });

  it("requires both a disposable preview target and explicit mutation opt-in", () => {
    const { env } = fixture();
    for (const patch of [{ E2E_ALLOW_TEST_WRITES: "" }, { E2E_TARGET: "production" },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_do_not_use" }]) {
      expect(() => loadTransactionFixtures({ ...env, ...patch }, now)).toThrow();
    }
  });

  it("matches the exact app origin and Supabase endpoint before loading sessions", () => {
    const { env } = fixture();
    expect(() => loadTransactionFixtures({ ...env, APP_BASE_URL: "https://another.example.test" }, now)).toThrow(/origin/i);
    expect(() => loadTransactionFixtures({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://another.supabase.co" }, now)).toThrow(/Supabase/i);
    expect(() => loadTransactionFixtures({ ...env, APP_BASE_URL: `${env.APP_BASE_URL}/admin` }, now)).toThrow(/origin/i);
  });

  it("rejects incomplete or malformed manifests instead of quietly skipping", () => {
    const { env, manifest, save } = fixture();
    manifest.target.databaseIsDisposable = false;
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/fixture/i);
    writeFileSync(env.E2E_FIXTURES_FILE, "{not json");
    expect(() => loadTransactionFixtures({ ...env, E2E_REQUIRED: "0" }, now)).toThrow(/fixture/i);
  });

  it("requires existing Clerk-cookie state files, without treating them as MFA proof", () => {
    const { env, manifest, save, directory } = fixture();
    const loaded = loadTransactionFixtures(env, now);
    expect(loaded?.projects["company-mobile"].adminStorageState).toBe(manifest.projects["company-mobile"].adminStorageState);
    manifest.projects["company-mobile"].adminStorageState = join(directory, "missing-admin.json");
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/storage state/i);
    writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify({ cookies: [], origins: [] }));
    expect(() => loadTransactionFixtures(env, now)).toThrow(/Clerk/i);
  });

  it("rejects expired or wrong-origin saved sessions before a browser can mutate", () => {
    const { env, manifest } = fixture();
    for (const cookie of [
      { domain: "production.example.test", expires: -1 },
      { domain: "isolated-preview.example.test", expires: now.getTime() / 1000 - 1 },
    ]) {
      writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify({ cookies: [{
        ...cookie, name: "__session", value: "unit-test-cookie-placeholder", path: "/",
        httpOnly: false, secure: true, sameSite: "Lax",
      }], origins: [] }));
      expect(() => loadTransactionFixtures(env, now)).toThrow(/Clerk/i);
    }
  });

  it.each(["path", "httpOnly", "secure", "sameSite"])(
    "rejects a saved cookie missing %s before CI migration", (field) => {
      const { env, manifest } = fixture();
      const state = savedState();
      delete state.cookies[0][field];
      writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify(state));
      expect(() => loadTransactionFixtures(env, now)).toThrow("Malformed Playwright storage state");
    },
  );

  it.each([
    ["path", 123], ["path", ""], ["path", "admin"], ["httpOnly", "false"],
    ["secure", 1], ["sameSite", "anything"], ["partitionKey", true],
    ["_crHasCrossSiteAncestor", "false"], ["expires", -2], ["expires", 253402300800],
    ["url", "https://isolated-preview.example.test/"],
  ])("rejects invalid saved cookie %s (%#)", (field, value) => {
    const { env, manifest } = fixture();
    const state = savedState();
    state.cookies[0][field as string] = value;
    writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify(state));
    expect(() => loadTransactionFixtures(env, now)).toThrow("Malformed Playwright storage state");
  });

  it.each([
    null, "not-an-origin-record", {},
    { origin: "https://isolated-preview.example.test" },
    { origin: "not-a-url", localStorage: [] },
    { origin: "https://isolated-preview.example.test", localStorage: {} },
    { origin: "https://isolated-preview.example.test", localStorage: [{ name: "fixture" }] },
    { origin: "https://isolated-preview.example.test", localStorage: [{ name: "fixture", value: 123 }] },
    { origin: "https://isolated-preview.example.test", localStorage: [], indexedDB: {} },
    { origin: "https://isolated-preview.example.test", localStorage: [], indexedDB: [{ name: "fixture", version: 1 }] },
    { origin: "https://isolated-preview.example.test", localStorage: [], indexedDB: [{ name: "fixture", version: 1, stores: [{ name: "fixture" }] }] },
  ])("rejects malformed origin/storage records before CI migration (%#)", (origin) => {
    const { env, manifest } = fixture();
    const state = savedState();
    state.origins = [origin];
    writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify(state));
    expect(() => loadTransactionFixtures(env, now)).toThrow("Malformed Playwright storage state");
  });

  it("preserves genuine optional partitioned cookies and IndexedDB saved-state structure", () => {
    const { env, manifest } = fixture();
    const state = savedState();
    state.cookies[0].partitionKey = "https://isolated-preview.example.test";
    state.cookies[0]._crHasCrossSiteAncestor = false;
    state.origins = [{ origin: env.APP_BASE_URL, localStorage: [{ name: "fixture-empty", value: "" }],
      indexedDB: [{ name: "fixture-db", version: 1, stores: [{ name: "fixture-store", autoIncrement: false,
        keyPathArray: ["id", "category"], records: [{ value: { id: "one", category: "test" } },
          { valueEncoded: { o: [{ k: "id", v: { d: "2030-01-01T00:00:00.000Z" } }], id: 1 } }],
        indexes: [{ name: "category", keyPath: "category", multiEntry: false, unique: false }],
      }] }],
    }];
    writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify(state));
    expect(loadTransactionFixtures(env, now)?.projects["company-mobile"].adminStorageState)
      .toBe(manifest.projects["company-mobile"].adminStorageState);
  });

  it.each([{ credentials: [] }, { credentials: [{ id: "fixture" }] }, { credentials: [{ id: "fixture", rpId: "example.test", userHandle: "fixture",
    privateKey: "fixture-not-real", publicKey: "fixture-not-real" }] }])(
    "rejects out-of-scope virtual-authenticator credentials before CI migration (%#)", ({ credentials }) => {
      const { env, manifest } = fixture();
      writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify({ ...savedState(), credentials }));
      expect(() => loadTransactionFixtures(env, now)).toThrow("Malformed Playwright storage state");
    },
  );

  it("fails closed on unsupported top-level saved-state extensions", () => {
    const { env, manifest } = fixture();
    writeFileSync(manifest.projects["company-mobile"].adminStorageState, JSON.stringify({ ...savedState(), futureExtension: [] }));
    expect(() => loadTransactionFixtures(env, now)).toThrow("Malformed Playwright storage state");
  });

  it("requires separate company and worker fixtures across projects and flows", () => {
    const { env, manifest, save } = fixture();
    const mobile = manifest.projects["company-mobile"];
    manifest.projects["admin-desktop"].selfServe.supplier.id = mobile.selfServe.supplier.id;
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/separate.*compan/i);
    manifest.projects["admin-desktop"].selfServe.supplier.id = id();
    manifest.projects["admin-desktop"].concierge.line.workers[0] = mobile.selfServe.lines[0].workers[0];
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/separate.*worker/i);
  });

  it("requires a supplier nomination different from Maintain's shortlist", () => {
    const { env, manifest, save } = fixture();
    const line = manifest.projects["company-mobile"].selfServe.lines[0];
    line.nomineeWorkerIds = [...line.shortlistWorkerIds];
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/nomination.*shortlist/i);
  });

  it("requires future valid windows and booking minimums, so Confirmed cannot silently mean Active", () => {
    const { env, manifest, save } = fixture();
    const line = manifest.projects["company-mobile"].selfServe.lines[0];
    line.startDate = "2030-01-01";
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/future/i);
    line.startDate = "2030-02-30";
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/date|window/i);
    line.startDate = "2030-02-01";
    manifest.rules.minimumCrewSize = 2;
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/minimum/i);
  });

  it("cannot label logged-in companies as the concierge never-logged-in fixture", () => {
    const { env, manifest, save } = fixture();
    manifest.projects["company-mobile"].concierge.supplier.neverLoggedIn = false;
    save();
    expect(() => loadTransactionFixtures(env, now)).toThrow(/fixture/i);
  });

  it("reads money evidence from real quoted CSV rows without losing commas or newlines", () => {
    expect(csvRecords('\uFEFFEngagement id,Name,Value\r\none,"Reserved, \"\"test\"\"\nbusiness",75.05\r\n'))
      .toEqual([{ "Engagement id": "one", Name: 'Reserved, "test"\nbusiness', Value: "75.05" }]);
    expect(() => csvRecords('id,name\n1,"unfinished')).toThrow(/unterminated/);
    expect(() => csvRecords("id,id\n1,2")).toThrow(/duplicate/);
    expect(() => csvRecords("id,name\n1")).toThrow(/malformed/);
  });

  it("uses a half-up independent money oracle and demand hours, not capacity hours", () => {
    const { manifest } = fixture();
    const line = { ...manifest.projects["company-mobile"].selfServe.lines[0], supplierRateCents: 5003 };
    expect(commercialExpectation(line, 5000)).toEqual({ buyerRate: 7505, hours: 64,
      supplierValue: 320192, buyerValue: 480320, feePerHour: 2502, maintainRevenue: 160128 });
  });
});
