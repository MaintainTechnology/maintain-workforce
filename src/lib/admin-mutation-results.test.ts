import { createClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), admin: vi.fn(), revalidate: vi.fn(), invite: vi.fn(), notify: vi.fn(),
  redirect: vi.fn((url: string): never => { throw Object.assign(new Error(url), { url }); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: mocks.gate, requireWritableCompany: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/match-orchestration", () => ({ notifyWorkerStatusKnockouts: vi.fn() }));
vi.mock("@/lib/clerk", () => ({ inviteAdministrator: mocks.invite }));
vi.mock("@/lib/notify", () => ({ notify: mocks.notify, NOTIFICATION_TRIGGERS: {} }));

const { overrideWorkerProficiency } = await import("./actions/worker");
const { renameCatalogueItem, setCatalogueItemActive } = await import("./actions/catalogue");
const { markLeadContacted, disqualifyLead, qualifyLead } = await import("./actions/lead");
const LeadsPage = (await import("../app/(admin)/admin/leads/page")).default;

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const workerId = id(1);
const tradeId = id(2);
const oldProficiency = id(3);
const newProficiency = id(4);
const catalogueId = id(5);
const leadId = id(6);
const actorId = "user_MaintainAdmin";
type Row = Record<string, unknown>;
type RequestLog = { table: string; method: string; query: URLSearchParams; body?: Row };
const uuidColumns = new Set(["id", "primary_trade_id", "primary_proficiency_id", "trade_role_id", "proficiency_id", "company_id"]);

function databaseFailure(): Response {
  return Response.json({ code: "42501", message: "Test operation rejected" }, { status: 403 });
}

/** Exercise the real actions, audit helper and Supabase builders; only replace HTTP. */
function database() {
  const tables: Record<string, Row[]> = {
    worker: [{
      id: workerId, primary_trade_id: tradeId, primary_proficiency_id: oldProficiency,
      proficiency_assigned_by: "user_CompanyAdmin", proficiency_overridden_by_maintain: false,
      proficiency_changed_at: null,
    }],
    trade_role_proficiency: [oldProficiency, newProficiency].map((proficiency_id) => ({
      trade_role_id: tradeId, proficiency_id,
    })),
    industry: [{ id: catalogueId, name: "Construction", is_active: true }],
    region: [],
    lead: [{ id: leadId, status: "New", company_id: null, disqualified_reason: null }],
    audit_event: [],
  };
  const requests: RequestLog[] = [];
  const hooks: { before?: (request: RequestLog) => Response | undefined } = {};
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const request: RequestLog = {
      table: url.pathname.split("/").at(-1)!, method: init?.method ?? "GET", query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) as Row : undefined,
    };
    requests.push(request);
    const intercepted = hooks.before?.(request);
    if (intercepted) return intercepted;
    const matches = (row: Row) => [...request.query].every(([key, value]) => {
      if (["select", "order", "limit"].includes(key)) return true;
      if (value === "is.null") return row[key] === null;
      if (value.startsWith("eq.")) {
        if (row[key] == null) return false;
        // PostgreSQL UUID equality is case-insensitive; text columns remain case-sensitive.
        return uuidColumns.has(key)
          ? String(row[key]).toLowerCase() === value.slice(3).toLowerCase()
          : String(row[key]) === value.slice(3);
      }
      throw new Error(`Unexpected fixture filter: ${key}=${value}`);
    });
    const source = tables[request.table];
    if (!source) throw new Error(`Unexpected fixture table: ${request.table}`);
    let rows: Row[];
    if (request.method === "GET") rows = source.filter(matches);
    else if (request.method === "PATCH") {
      rows = source.filter(matches);
      for (const row of rows) {
        for (const [column, value] of Object.entries(request.body ?? {})) {
          row[column] = uuidColumns.has(column) && typeof value === "string" ? value.toLowerCase() : value;
        }
      }
    } else if (request.method === "POST" && request.table === "audit_event") {
      rows = [{ ...request.body }];
      source.push(...rows);
    } else throw new Error(`Unexpected fixture mutation: ${request.method} ${request.table}`);

    if (request.method !== "GET" && !headers.get("prefer")?.includes("return=representation")) {
      return new Response(null, { status: 204 });
    }
    const columns = (request.query.get("select") ?? "*").split(",").map((column) => column.trim());
    return Response.json(rows.map((row) => columns.includes("*") ? { ...row }
      : Object.fromEntries(columns.map((column) => [column, row[column]]))));
  };
  const client = createClient("https://admin-mutation.example.test", "test-only-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  });
  return { client, tables, requests, hooks };
}

function form(fields: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}

const workerForm = () => form({ worker_id: workerId, proficiency_id: newProficiency });
const renameForm = () => form({ table: "industry", id: catalogueId, name: "Building" });
const activeForm = () => form({ table: "industry", id: catalogueId, is_active: "false" });
const leadForm = () => form({ lead_id: leadId, reason: "Outside the current service area" });

async function destination(action: (data: FormData) => Promise<void>, data: FormData): Promise<URL> {
  const result: unknown = await action(data).then(() => null, (error: unknown) => error);
  expect(result).toBeInstanceOf(Error);
  expect(result).toHaveProperty("url");
  return new URL((result as { url: string }).url, "https://app.example.test");
}

function expectFailure(url: URL) {
  expect(url.searchParams.has("saved")).toBe(false);
  expect(url.searchParams.has("ok")).toBe(false);
  expect(url.searchParams.get("notice")).not.toBe("proficiency-overridden");
  expect(db.tables.audit_event).toEqual([]);
}

let db: ReturnType<typeof database>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ id: actorId });
  db = database();
  mocks.admin.mockReturnValue(db.client);
});

const actions = [
  { name: "worker proficiency", action: overrideWorkerProficiency, form: workerForm, table: "worker", idField: "worker_id" },
  { name: "catalogue rename", action: renameCatalogueItem, form: renameForm, table: "industry", idField: "id" },
  { name: "catalogue visibility", action: setCatalogueItemActive, form: activeForm, table: "industry", idField: "id" },
  { name: "lead contacted", action: markLeadContacted, form: leadForm, table: "lead", idField: "lead_id" },
  { name: "lead disqualified", action: disqualifyLead, form: leadForm, table: "lead", idField: "lead_id" },
];

describe.each(actions)("checked $name mutations", ({ name, action, form: makeForm, table, idField }) => {
  beforeEach(() => { if (name === "lead disqualified") db.tables.lead[0].status = "Contacted"; });

  it("requires the existing MFA admin gate before any service client or database access", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("second-factor proof required"));
    await expect(action(makeForm())).rejects.toThrow("second-factor proof required");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(db.requests).toEqual([]);
  });

  it("rejects malformed UUIDs before creating a service client", async () => {
    const input = makeForm();
    input.set(idField, "not-a-uuid");
    expectFailure(await destination(action, input));
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(db.requests).toEqual([]);
  });

  it("does not write after a failed read", async () => {
    db.hooks.before = (request) => request.table === table && request.method === "GET" ? databaseFailure() : undefined;
    expectFailure(await destination(action, makeForm()));
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("does not manufacture success for a missing row", async () => {
    db.tables[table] = [];
    expectFailure(await destination(action, makeForm()));
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("does not audit or report a rejected database write as saved", async () => {
    const before = structuredClone(db.tables[table]);
    db.hooks.before = (request) => request.method === "PATCH" ? databaseFailure() : undefined;
    expectFailure(await destination(action, makeForm()));
    expect(db.tables[table]).toEqual(before);
  });

  it("does not audit or report a successful zero-row write as saved", async () => {
    const before = structuredClone(db.tables[table]);
    db.hooks.before = (request) => request.method === "PATCH" ? Response.json([]) : undefined;
    expectFailure(await destination(action, makeForm()));
    expect(db.tables[table]).toEqual(before);
  });

  it("does not report success if the post-write audit cannot be recorded", async () => {
    db.hooks.before = (request) => request.table === "audit_event" ? databaseFailure() : undefined;
    await expect(action(makeForm())).rejects.toThrow(/Audit event .* could not be recorded/);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(db.tables.audit_event).toEqual([]);
  });
});

describe("worker proficiency provenance", () => {
  it("validates the requested proficiency UUID before database access", async () => {
    const input = workerForm();
    input.set("proficiency_id", "bad");
    expectFailure(await destination(overrideWorkerProficiency, input));
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(["error", "missing"])("rejects a %s trade/proficiency mapping before any write", async (mode) => {
    if (mode === "missing") db.tables.trade_role_proficiency = [];
    else db.hooks.before = (request) => request.table === "trade_role_proficiency" ? databaseFailure() : undefined;
    expectFailure(await destination(overrideWorkerProficiency, workerForm()));
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each([
    { primary_trade_id: id(7) }, { primary_proficiency_id: id(8) },
    { proficiency_assigned_by: "user_OtherAdmin" }, { proficiency_changed_at: "2026-08-31T01:00:00Z" },
    { proficiency_overridden_by_maintain: true },
  ])("does not overwrite concurrently changed classification/provenance %j", async (change) => {
    db.hooks.before = (request) => {
      if (request.table === "worker" && request.method === "PATCH") Object.assign(db.tables.worker[0], change);
      return undefined;
    };
    expectFailure(await destination(overrideWorkerProficiency, workerForm()));
    expect(db.tables.worker[0]).toMatchObject(change);
    expect(db.tables.worker[0].primary_proficiency_id).not.toBe(newProficiency);
  });

  it("does not replace provenance or invent an override when proficiency is unchanged", async () => {
    const before = structuredClone(db.tables.worker[0]);
    const input = workerForm();
    input.set("proficiency_id", oldProficiency);
    const url = await destination(overrideWorkerProficiency, input);
    expect(url.searchParams.get("notice")).toBe("proficiency-unchanged");
    expect(db.tables.worker[0]).toEqual(before);
    expect(db.tables.audit_event).toEqual([]);
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("treats uppercase UUIDs for the existing worker/proficiency as unchanged", async () => {
    const storedWorkerId = "aabbccdd-aabb-4cdd-8eef-aabbccddeeff";
    const storedProficiencyId = "bbccddee-bbcc-4dee-8ffa-bbccddeeffaa";
    db.tables.worker[0].id = storedWorkerId;
    db.tables.worker[0].primary_proficiency_id = storedProficiencyId;
    db.tables.trade_role_proficiency[0].proficiency_id = storedProficiencyId;
    const before = structuredClone(db.tables.worker[0]);
    const input = form({ worker_id: storedWorkerId.toUpperCase(), proficiency_id: storedProficiencyId.toUpperCase() });

    const url = await destination(overrideWorkerProficiency, input);
    expect(url.searchParams.get("notice")).toBe("proficiency-unchanged");
    expect(db.tables.worker[0]).toEqual(before);
    expect(db.tables.audit_event).toEqual([]);
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each([null, "2026-08-30T01:00:00Z"])("records actual before/after provenance with prior timestamp %s", async (timestamp) => {
    db.tables.worker[0].proficiency_changed_at = timestamp;
    db.tables.worker[0].proficiency_assigned_by = timestamp === null ? null : "user_CompanyAdmin";
    const before = structuredClone(db.tables.worker[0]);
    const url = await destination(overrideWorkerProficiency, workerForm());
    expect(url.searchParams.get("notice")).toBe("proficiency-overridden");
    expect(db.tables.worker[0]).toMatchObject({
      primary_trade_id: tradeId, primary_proficiency_id: newProficiency,
      proficiency_assigned_by: actorId, proficiency_overridden_by_maintain: true,
      proficiency_changed_at: expect.any(String),
    });
    expect(db.tables.audit_event).toEqual([expect.objectContaining({
      actor_user_id: actorId, action: "worker.proficiency_overridden_by_maintain", entity_id: workerId,
      before_data: before, after_data: db.tables.worker[0],
    })]);
  });
});

describe("catalogue edits preserve real history", () => {
  it.each([renameCatalogueItem, setCatalogueItemActive])("rejects non-catalogue tables before service access", async (action) => {
    const input = action === renameCatalogueItem ? renameForm() : activeForm();
    input.set("table", "company");
    expectFailure(await destination(action, input));
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([renameCatalogueItem, setCatalogueItemActive])("does not invent a change for an unchanged value", async (action) => {
    const input = action === renameCatalogueItem ? renameForm() : activeForm();
    input.set(action === renameCatalogueItem ? "name" : "is_active", action === renameCatalogueItem ? "Construction" : "true");
    const url = await destination(action, input);
    expect(url.searchParams.get("ok")).toMatch(/no change/i);
    expect(db.tables.audit_event).toEqual([]);
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each([renameCatalogueItem, setCatalogueItemActive])("does not overwrite a stale catalogue value", async (action) => {
    const change = action === renameCatalogueItem ? { name: "A concurrent name" } : { is_active: false };
    db.hooks.before = (request) => {
      if (request.method === "PATCH") Object.assign(db.tables.industry[0], change);
      return undefined;
    };
    expectFailure(await destination(action, action === renameCatalogueItem ? renameForm() : activeForm()));
    expect(db.tables.industry[0]).toMatchObject(change);
  });

  it("renames using returned values for an accurate audit and preserves the row id", async () => {
    const input = renameForm();
    input.set("name", "  Building  ");
    const url = await destination(renameCatalogueItem, input);
    expect(url.searchParams.get("ok")).toBe("Renamed.");
    expect(db.tables.industry).toEqual([{ id: catalogueId, name: "Building", is_active: true }]);
    expect(db.tables.audit_event).toEqual([expect.objectContaining({
      actor_user_id: actorId, action: "catalogue.industry_renamed", entity_id: catalogueId,
      before_data: { id: catalogueId, name: "Construction" }, after_data: { id: catalogueId, name: "Building" },
    })]);
  });

  it.each([true, false])("soft-hides/reactivates an existing item from actual prior state %s", async (beforeActive) => {
    db.tables.industry[0].is_active = beforeActive;
    const input = activeForm();
    input.set("is_active", String(!beforeActive));
    const url = await destination(setCatalogueItemActive, input);
    expect(url.searchParams.get("ok")).toBe(beforeActive ? "Hidden from new entry." : "Reactivated.");
    expect(db.tables.industry).toEqual([{ id: catalogueId, name: "Construction", is_active: !beforeActive }]);
    expect(db.tables.audit_event).toEqual([expect.objectContaining({
      actor_user_id: actorId, action: `catalogue.industry_${beforeActive ? "deactivated" : "reactivated"}`,
      before_data: { id: catalogueId, is_active: beforeActive }, after_data: { id: catalogueId, is_active: !beforeActive },
    })]);
    expect(db.requests.some((request) => request.method === "DELETE")).toBe(false);
  });
});

describe("lead contact and disqualification transitions", () => {
  it.each(["New", "Qualified", "Disqualified"])("does not qualify an unlinked %s lead", async (status) => {
    db.tables.lead[0].status = status;
    const input = leadForm();
    input.set("legal_name", "Example Construction");
    input.set("contact_email", "ops@example.test");
    const url = await destination(qualifyLead, input);
    expect(url.searchParams.get("error")).toBe("not_contacted");
    expectFailure(url);
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("offers Mark Contacted, not qualification/disqualification forms, for New leads", async () => {
    const html = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({ lead: leadId }) }));
    expect(html).toContain("Mark Contacted");
    expect(html).not.toContain("Qualify and invite");
    expect(html).not.toContain("Disqualify lead");
  });

  it.each(["Contacted", "Qualified", "Disqualified"])("does not mark a %s lead Contacted", async (status) => {
    db.tables.lead[0].status = status;
    expectFailure(await destination(markLeadContacted, leadForm()));
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each(["New", "Qualified", "Disqualified"])("does not disqualify a %s lead", async (status) => {
    db.tables.lead[0].status = status;
    expectFailure(await destination(disqualifyLead, leadForm()));
    expect(db.tables.lead[0].status).toBe(status);
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("requires a reason before accessing the database", async () => {
    const input = leadForm();
    input.set("reason", "   ");
    expectFailure(await destination(disqualifyLead, input));
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("does not accept an uploaded file as a disqualification reason", async () => {
    db.tables.lead[0].status = "Contacted";
    const input = leadForm();
    input.set("reason", new File(["Not a text field"], "reason.txt"));
    const url = await destination(disqualifyLead, input);
    expect(url.searchParams.get("error")).toBe("reason_required");
    expectFailure(url);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([markLeadContacted, disqualifyLead])("does not mutate a company-linked lead", async (action) => {
    db.tables.lead[0].company_id = id(9);
    if (action === disqualifyLead) db.tables.lead[0].status = "Contacted";
    expectFailure(await destination(action, leadForm()));
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each([markLeadContacted, disqualifyLead])("does not overwrite concurrent qualification", async (action) => {
    if (action === disqualifyLead) db.tables.lead[0].status = "Contacted";
    db.hooks.before = (request) => {
      if (request.method === "PATCH") Object.assign(db.tables.lead[0], { status: "Qualified", company_id: id(9) });
      return undefined;
    };
    expectFailure(await destination(action, leadForm()));
    expect(db.tables.lead[0]).toMatchObject({ status: "Qualified", company_id: id(9), disqualified_reason: null });
  });

  it("records the actual New → Contacted change", async () => {
    const url = await destination(markLeadContacted, leadForm());
    expect(url.searchParams.get("saved")).toBe("contacted");
    expect(db.tables.lead[0].status).toBe("Contacted");
    expect(db.tables.audit_event).toEqual([expect.objectContaining({
      actor_user_id: actorId, action: "lead.contacted", before_data: { status: "New" }, after_data: { status: "Contacted" },
    })]);
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("records the actual Contacted → Disqualified change and its trimmed reason", async () => {
    db.tables.lead[0].status = "Contacted";
    const input = leadForm();
    input.set("reason", "  Outside the current service area  ");
    const url = await destination(disqualifyLead, input);
    expect(url.searchParams.get("saved")).toBe("disqualified");
    expect(db.tables.lead[0]).toMatchObject({ status: "Disqualified", disqualified_reason: "Outside the current service area" });
    expect(db.tables.audit_event).toEqual([expect.objectContaining({
      actor_user_id: actorId, action: "lead.disqualified",
      before_data: { status: "Contacted", disqualified_reason: null },
      after_data: { status: "Disqualified", disqualified_reason: "Outside the current service area" },
    })]);
  });
});
