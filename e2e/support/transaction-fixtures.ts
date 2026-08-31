import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const text = z.string().trim().min(1);
const uuid = z.string().uuid();
const amount = z.number().int().positive().max(1_000_000);
const namedId = z.object({ id: uuid, name: text });
const company = z.object({ id: uuid, legalName: text, displayName: text });
const signedInCompany = company.extend({ storageState: text });
const loginlessCompany = company.extend({ neverLoggedIn: z.literal(true) });

const lineSchema = z.object({
  tradeRoleId: uuid,
  proficiencyId: uuid,
  regionId: uuid,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  hoursPerWeek: z.number().positive().max(168).multipleOf(0.5),
  capacityHoursPerWeek: z.number().positive().max(168).multipleOf(0.5),
  supplierRateCents: amount,
  bandLowCents: amount,
  bandHighCents: amount,
  workers: z.array(z.object({
    id: uuid,
    name: text,
    mobile: text.min(8),
    email: z.email(),
    ticketNumbers: z.array(text).min(1),
  })).min(2).max(30),
  shortlistWorkerIds: z.array(uuid).min(1).max(29),
  nomineeWorkerIds: z.array(uuid).min(1).max(29),
  skills: z.array(namedId).min(1),
  qualifications: z.array(namedId).min(1),
});

const projectSchema = z.object({
  adminStorageState: text,
  pending: signedInCompany,
  selfServe: z.object({
    supplier: signedInCompany,
    buyer: signedInCompany,
    lines: z.array(lineSchema).length(2),
  }),
  concierge: z.object({
    supplier: loginlessCompany,
    buyer: loginlessCompany,
    line: lineSchema,
    supplierContact: text.min(3),
    buyerContact: text.min(3),
  }),
});

const manifestSchema = z.object({
  version: z.literal(1),
  runId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,39}$/),
  target: z.object({
    purpose: z.literal("isolated-preview"),
    appOrigin: z.url(),
    supabaseUrl: z.url(),
    databaseIsDisposable: z.literal(true),
    reservedTestAccountsOnly: z.literal(true),
    emailDeliveryIsSandboxed: z.literal(true),
  }),
  rules: z.object({
    feeBp: z.number().int().min(1).max(10000),
    minimumCrewSize: z.number().int().min(1).max(29),
    minimumHoursPerLine: z.number().positive(),
  }),
  projects: z.object({
    "company-mobile": projectSchema,
    "admin-desktop": projectSchema,
  }),
});

export type TransactionFixtures = z.infer<typeof manifestSchema>;
export type TransactionProject = z.infer<typeof projectSchema>;
export type TransactionLine = z.infer<typeof lineSchema>;
export type CompanyFixture = z.infer<typeof company>;
export type SignedInCompanyFixture = z.infer<typeof signedInCompany>;

function jsonFile(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // Neither malformed cookies nor credential-bearing paths belong in CI logs.
    throw new Error(`Cannot read the ${label} JSON file.`);
  }
}

function exactOrigin(value: string | undefined, label: string): string {
  if (!value) throw new Error(`An explicit ${label} origin is required.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${label} origin.`); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username || url.password || value.replace(/\/$/, "") !== url.origin) {
    throw new Error(`The ${label} must be an HTTP localhost or HTTPS origin without a path, query or credentials.`);
  }
  return url.origin;
}

// Validate the complete saved-state shape before CI can migrate preview. This
// mirrors the installed Playwright cookie/origin contract, including its optional
// IndexedDB representation; it does not interpret or rewrite credential values.
const keyPathFields = { keyPath: z.string().optional(), keyPathArray: z.array(z.string()).optional() };
const savedStateSchema = z.strictObject({
  // Virtual WebAuthn credential restoration is not part of this harness. Use
  // ordinary state captured after a real Clerk challenge, not an authenticator clone.
  credentials: z.never().optional(),
  cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string().min(1).regex(/^[^\s/]+$/),
    path: z.string().startsWith("/"),
    expires: z.number().refine((value) => value === -1 || (value >= 0 && value <= 253402300799)),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    sameSite: z.enum(["Strict", "Lax", "None"]),
    partitionKey: z.string().optional(),
    _crHasCrossSiteAncestor: z.boolean().optional(),
    // Saved cookies have domain+path; a simultaneous url is rejected by Playwright.
    url: z.never().optional(),
  })),
  origins: z.array(z.object({
    origin: z.url().refine((value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && value === url.origin;
      } catch {
        return false;
      }
    }),
    localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
    indexedDB: z.array(z.object({
      name: z.string(),
      version: z.number().int().positive(),
      stores: z.array(z.object({
        name: z.string(),
        autoIncrement: z.boolean(),
        ...keyPathFields,
        records: z.array(z.object({
          key: z.unknown().optional(), keyEncoded: z.unknown().optional(),
          value: z.unknown().optional(), valueEncoded: z.unknown().optional(),
        })),
        indexes: z.array(z.object({
          name: z.string(), ...keyPathFields, multiEntry: z.boolean(), unique: z.boolean(),
        })),
      })),
    })).optional(),
  })),
});

function sessionFile(path: string, directory: string, appOrigin: string, now: Date): string {
  const absolute = resolve(directory, path);
  const state = savedStateSchema.safeParse(jsonFile(absolute, "storage state"));
  if (!state.success) throw new Error("Malformed Playwright storage state.");
  const host = new URL(appOrigin).hostname;
  const hasClerkCookie = state.data.cookies.some((cookie) => {
    const domain = cookie.domain.replace(/^\./, "");
    return /^__session(?:_|$)/.test(cookie.name) && cookie.value.length > 10 &&
      (host === domain || host.endsWith(`.${domain}`)) &&
      (cookie.expires === -1 || cookie.expires > now.getTime() / 1000);
  });
  if (!hasClerkCookie) throw new Error("Saved storage state needs an unexpired Clerk session cookie for this preview origin.");
  // This is input-shape validation, NOT authentication or MFA verification. The
  // suite must still reach a real requireMaintainAdmin-protected page before writes.
  return absolute;
}

/** No credentials are minted here. A provided but invalid setup always fails. */
export function loadTransactionFixtures(
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): TransactionFixtures | null {
  if (!env.E2E_FIXTURES_FILE) {
    if (env.E2E_REQUIRED === "1" || env.E2E_ALLOW_TEST_WRITES || env.E2E_TARGET) {
      throw new Error("E2E_FIXTURES_FILE is required for the requested browser verification.");
    }
    return null;
  }
  if (env.E2E_ALLOW_TEST_WRITES !== "1" || env.E2E_TARGET !== "isolated-preview") {
    throw new Error("Browser mutations require E2E_ALLOW_TEST_WRITES=1 and E2E_TARGET=isolated-preview.");
  }
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    throw new Error("Browser fixtures require a Clerk development instance (pk_test_).");
  }
  const parsed = manifestSchema.safeParse(jsonFile(env.E2E_FIXTURES_FILE, "E2E fixture"));
  if (!parsed.success) {
    throw new Error(`Invalid E2E fixture manifest: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}.`);
  }
  const fixtures = parsed.data;
  const appOrigin = exactOrigin(env.APP_BASE_URL, "APP_BASE_URL");
  if (exactOrigin(fixtures.target.appOrigin, "fixture app") !== appOrigin) {
    throw new Error("APP_BASE_URL does not match the exact fixture preview origin.");
  }
  if (exactOrigin(fixtures.target.supabaseUrl, "fixture Supabase") !==
    exactOrigin(env.NEXT_PUBLIC_SUPABASE_URL, "Supabase")) {
    throw new Error("The configured Supabase endpoint does not match the disposable fixture database.");
  }

  const companyIds = new Set<string>();
  const companyNames = new Set<string>();
  const workerIds = new Set<string>();
  const workerNames = new Set<string>();
  const projects = Object.values(fixtures.projects);
  for (const project of projects) {
    for (const item of [project.pending, project.selfServe.supplier, project.selfServe.buyer,
      project.concierge.supplier, project.concierge.buyer]) {
      if (companyIds.has(item.id) || companyNames.has(item.legalName)) {
        throw new Error("Use separate company fixtures for every project and transaction flow.");
      }
      companyIds.add(item.id);
      companyNames.add(item.legalName);
    }
    for (const line of [...project.selfServe.lines, project.concierge.line]) {
      for (const worker of line.workers) {
        if (workerIds.has(worker.id) || workerNames.has(worker.name)) {
          throw new Error("Use separate worker fixtures with distinct names for every project and capacity line.");
        }
        workerIds.add(worker.id);
        workerNames.add(worker.name);
      }
    }
  }

  const today = new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
  for (const project of projects) {
    if (project.selfServe.lines[0].regionId !== project.selfServe.lines[1].regionId) {
      throw new Error("The two self-serve demand lines need one shared request region.");
    }
    for (const line of [...project.selfServe.lines, project.concierge.line]) {
      if (line.startDate <= today) throw new Error("Fixture start dates must be in the future in Australia/Brisbane.");
      if (line.endDate < line.startDate) throw new Error("Fixture date windows must be ordered.");
      const days = (Date.parse(`${line.endDate}T00:00:00Z`) - Date.parse(`${line.startDate}T00:00:00Z`)) / 86_400_000 + 1;
      if (line.nomineeWorkerIds.length < fixtures.rules.minimumCrewSize ||
        Math.floor(line.hoursPerWeek * days / 7 + 0.5) < fixtures.rules.minimumHoursPerLine ||
        line.capacityHoursPerWeek < line.hoursPerWeek) {
        throw new Error("Fixture crew, hours and capacity must satisfy the configured booking minimums.");
      }
      if (line.bandLowCents > line.bandHighCents ||
        line.supplierRateCents === Math.floor((line.bandLowCents + line.bandHighCents) / 2 + 0.5)) {
        throw new Error("Fixture bands must be ordered and the supplier's override must differ from the pre-filled rate.");
      }
      const roster = new Set(line.workers.map((worker) => worker.id));
      const shortlist = new Set(line.shortlistWorkerIds);
      const nominees = new Set(line.nomineeWorkerIds);
      if (shortlist.size !== line.shortlistWorkerIds.length || nominees.size !== line.nomineeWorkerIds.length ||
        shortlist.size !== nominees.size || [...shortlist, ...nominees].some((workerId) => !roster.has(workerId))) {
        throw new Error("Fixture shortlist and nomination must be equal-sized unique subsets of the stated capacity roster.");
      }
      if (![...nominees].some((workerId) => !shortlist.has(workerId))) {
        throw new Error("A supplier nomination must differ from Maintain's feasibility shortlist.");
      }
    }
  }

  const directory = dirname(resolve(env.E2E_FIXTURES_FILE));
  for (const project of projects) {
    project.adminStorageState = sessionFile(project.adminStorageState, directory, appOrigin, now);
    for (const company of [project.pending, project.selfServe.supplier, project.selfServe.buyer]) {
      company.storageState = sessionFile(company.storageState, directory, appOrigin, now);
    }
  }
  return fixtures;
}
