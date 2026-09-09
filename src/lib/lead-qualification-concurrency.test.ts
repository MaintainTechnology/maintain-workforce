import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), admin: vi.fn(), clerkClient: vi.fn(), createInvitation: vi.fn(), audit: vi.fn(), notify: vi.fn(),
  redirect: vi.fn((url: string): never => { throw Object.assign(new Error(url), { url }); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: mocks.gate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mocks.clerkClient }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/notify", () => ({
  notify: mocks.notify,
  NOTIFICATION_TRIGGERS: { ABN_COLLISION_REVIEW: "collision", ADMIN_INVITATION: "invitation" },
}));

const clerk = await import("./clerk");
const { qualifyLead } = await import("./actions/lead");
const leadId = "11111111-1111-4111-8111-111111111111";
const otherCompanyId = "33333333-3333-4333-8333-333333333333";
const regionId = "44444444-4444-4444-8444-444444444444";
const back = `/admin/leads?lead=${leadId}`;
type Row = Record<string, unknown>;
type RequestLog = { table: string; method: string; query: URLSearchParams; body: Row | undefined };

function response(rows: Row[], request: RequestLog, headers: Headers): Response {
  if (request.method !== "GET" && !headers.get("prefer")?.includes("return=representation")) {
    return new Response(null, { status: 204 });
  }
  const data = headers.get("accept")?.includes("application/vnd.pgrst.object+json") ? rows[0] : rows;
  return Response.json(data ?? null);
}

function databaseFailure(): Response {
  return Response.json({ code: "42501", message: "Test database operation rejected" }, { status: 403 });
}

/** Only the HTTP/database boundary is replaced: the action and Supabase builders are real. */
function database() {
  const currentLead: Row = { id: leadId, status: "Contacted", company_id: null, notes: null, disqualified_reason: null };
  const companies = new Map<string, Row>();
  const requests: RequestLog[] = [];
  let nextCompany = 0;
  let initialReads = 0;
  let releaseReads: () => void = () => undefined;
  const bothRead = new Promise<void>((resolve) => { releaseReads = resolve; });
  const hooks: {
    synchronizeInitialReads: boolean;
    before?: (request: RequestLog) => Response | undefined;
    after?: (request: RequestLog) => Response | undefined;
  } = { synchronizeInitialReads: false };

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const request: RequestLog = {
      table: url.pathname.split("/").at(-1)!, method: init?.method ?? "GET",
      query: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) as Row : undefined,
    };
    requests.push(request);
    const intercepted = hooks.before?.(request);
    if (intercepted) return intercepted;
    const matches = (row: Row) => [...request.query].every(([key, value]) => {
      if (["select", "limit", "order"].includes(key)) return true;
      if (value === "is.null") return row[key] === null;
      if (value.startsWith("eq.")) return row[key] !== null && String(row[key]) === value.slice(3);
      throw new Error(`Unexpected test query filter: ${key}=${value}`);
    });

    if (request.method === "GET") {
      const source = request.table === "lead" ? [currentLead] : request.table === "company" ? [...companies.values()] : [];
      const rows = source.filter(matches).map((row) => ({ ...row }));
      if (hooks.synchronizeInitialReads && request.table === "lead" && request.query.has("id") && initialReads < 2) {
        // Both requests retain the same pre-qualification snapshot before either can insert.
        initialReads += 1;
        if (initialReads === 2) releaseReads();
        await bothRead;
      }
      return response(rows, request, headers);
    }

    let rows: Row[] = [];
    if (request.method === "POST" && request.table === "company") {
      if (request.body?.abn != null && [...companies.values()].some((row) => row.abn === request.body?.abn)) {
        return Response.json({ code: "23505", message: "duplicate company ABN" }, { status: 409 });
      }
      const id = `22222222-2222-4222-8222-${String(++nextCompany).padStart(12, "0")}`;
      const company = { ...request.body, id };
      companies.set(id, company);
      rows = [company];
    } else if (request.method === "POST" && request.table === "company_operating_region") {
      rows = [{ ...request.body }];
    } else if (request.method === "PATCH" && request.table === "lead") {
      if (matches(currentLead)) {
        Object.assign(currentLead, request.body);
        rows = [{ ...currentLead }];
      }
    } else if (request.method === "DELETE" && request.table === "company") {
      rows = [...companies.values()].filter(matches);
      // lead.company_id's existing NO ACTION FK prevents deletion if a link races cleanup.
      if (rows.some((row) => row.id === currentLead.company_id)) {
        return Response.json({ code: "23503", message: "company is linked to a lead" }, { status: 409 });
      }
      for (const row of rows) companies.delete(String(row.id));
    } else throw new Error(`Unexpected test operation: ${request.method} ${request.table}`);
    return hooks.after?.(request) ?? response(rows, request, headers);
  };

  const client = createClient("https://qualification-unit.example.test", "test-only-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  });
  return { client, currentLead, companies, requests, hooks };
}

function form(fields: Record<string, string> = {}): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries({ lead_id: leadId, legal_name: "Example Construction", contact_email: "ops@example.test", ...fields })) {
    result.set(key, value);
  }
  return result;
}

let db: ReturnType<typeof database>;
let invite: MockInstance<typeof clerk.inviteAdministrator>;
beforeEach(() => {
  vi.clearAllMocks();
  invite = vi.spyOn(clerk, "inviteAdministrator");
  db = database();
  mocks.admin.mockReturnValue(db.client);
  mocks.gate.mockResolvedValue({ id: "user_Admin" });
  mocks.clerkClient.mockResolvedValue({ invitations: { createInvitation: mocks.createInvitation } });
  mocks.createInvitation.mockReset().mockResolvedValue({ id: "inv_Test" });
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue({ sent: true });
});
afterEach(() => { vi.restoreAllMocks(); });

const isClaim = (request: RequestLog) => request.table === "lead" && request.method === "PATCH" && request.body?.status === "Qualified";
const isRollback = (request: RequestLog) => request.table === "lead" && request.method === "PATCH" && request.body?.company_id === null;
const isDelete = (request: RequestLog) => request.table === "company" && request.method === "DELETE";

describe("lead-based qualification ownership", () => {
  it("retains one null-ABN company and sends one invitation when both requests read the unqualified lead", async () => {
    db.hooks.synchronizeInitialReads = true;
    const outcomes = await Promise.allSettled([qualifyLead(form()), qualifyLead(form({ abn: "  " }))]);
    expect(outcomes.map((outcome) => outcome.status === "rejected" ? outcome.reason.url : "returned").sort()).toEqual([
      `${back}&error=lead_changed`, `${back}&saved=qualified`,
    ].sort());
    expect(db.companies.size).toBe(1);
    const retained = [...db.companies.values()][0];
    expect(retained).toMatchObject({ id: db.currentLead.company_id, abn: null, status: "Pending" });
    expect(invite).toHaveBeenCalledExactlyOnceWith("ops@example.test", retained.id);
    expect(mocks.audit).toHaveBeenCalledTimes(3);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const deletion = db.requests.find(isDelete)!;
    expect(deletion.query.get("id")).not.toBe(`eq.${retained.id}`);
    expect(deletion.query.get("status")).toBe("eq.Pending");
  });

  it("requires both the original status and a null company association in the atomic claim", async () => {
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&saved=qualified` });
    const claim = db.requests.find(isClaim)!;
    expect(Object.fromEntries(claim.query)).toMatchObject({ id: `eq.${leadId}`, status: "eq.Contacted", company_id: "is.null" });
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=already_qualified` });
    expect(db.companies.size).toBe(1);
    expect(invite).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a concurrently disqualified lead", async () => {
    db.hooks.after = (request) => {
      if (request.table === "company" && request.method === "POST") {
        Object.assign(db.currentLead, { status: "Disqualified", disqualified_reason: "Not suitable" });
      }
      return undefined;
    };
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=lead_changed` });
    expect(db.currentLead).toMatchObject({ status: "Disqualified", company_id: null, disqualified_reason: "Not suitable" });
    expect(db.companies.size).toBe(0);
    expect(invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("only deletes its own unlinked company when another request has linked a different company", async () => {
    db.companies.set(otherCompanyId, { id: otherCompanyId, status: "Pending", abn: null });
    db.hooks.after = (request) => {
      if (request.table === "company" && request.method === "POST") {
        Object.assign(db.currentLead, { status: "Qualified", company_id: otherCompanyId });
      }
      return undefined;
    };
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=lead_changed` });
    expect([...db.companies.keys()]).toEqual([otherCompanyId]);
    expect(db.currentLead.company_id).toBe(otherCompanyId);
    expect(invite).not.toHaveBeenCalled();
  });

  it.each(["error", "zero rows"])("requires a confirmed returned claim, not just a request (%s)", async (failure) => {
    db.hooks.before = (request) => isClaim(request) ? failure === "error" ? databaseFailure() : Response.json([]) : undefined;
    await expect(qualifyLead(form())).rejects.toMatchObject({
      url: `${back}&error=${failure === "error" ? "company_create_failed" : "lead_changed"}`,
    });
    expect(db.companies.size).toBe(0);
    expect(db.currentLead.company_id).toBeNull();
    expect(invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("retains a linked company if the claim committed but its response was lost", async () => {
    db.hooks.after = (request) => isClaim(request) ? databaseFailure() : undefined;
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=qualification_recovery_required` });
    expect(db.companies.size).toBe(1);
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("fails closed before writes when reading the lead fails", async () => {
    db.hooks.before = (request) => request.table === "lead" && request.method === "GET" ? databaseFailure() : undefined;
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=company_create_failed` });
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
    expect(invite).not.toHaveBeenCalled();
  });

  it("fails closed before writes when the supplied-ABN uniqueness read fails", async () => {
    db.hooks.before = (request) => request.table === "company" && request.method === "GET" ? databaseFailure() : undefined;
    await expect(qualifyLead(form({ abn: "51824753556" }))).rejects.toMatchObject({ url: `${back}&error=company_create_failed` });
    expect(db.requests.every((request) => request.method === "GET")).toBe(true);
    expect(invite).not.toHaveBeenCalled();
  });

  it("does not link or invite a company whose required operating-region write fails", async () => {
    db.hooks.before = (request) => request.table === "company_operating_region" ? databaseFailure() : undefined;
    await expect(qualifyLead(form({ primary_region_id: regionId }))).rejects.toMatchObject({ url: `${back}&error=company_create_failed` });
    expect(db.companies.size).toBe(0);
    expect(db.requests.some(isClaim)).toBe(false);
    expect(invite).not.toHaveBeenCalled();
  });
});

describe("checked qualification compensation", () => {
  it.each(["link lookup", "delete error", "delete zero rows"])("does not report successful compensation when %s fails", async (failure) => {
    db.hooks.before = (request) => {
      if (isClaim(request)) return Response.json([]);
      if (failure === "link lookup" && request.table === "lead" && request.query.has("company_id")) return databaseFailure();
      if (isDelete(request)) return failure === "delete error" ? databaseFailure() : Response.json([]);
      return undefined;
    };
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=qualification_recovery_required` });
    expect(db.companies.size).toBe(1);
    if (failure === "link lookup") expect(db.requests.some(isDelete)).toBe(false);
    expect(invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves a company linked between the cleanup read and delete", async () => {
    db.hooks.before = (request) => {
      if (isClaim(request)) return Response.json([]);
      if (isDelete(request)) db.currentLead.company_id = [...db.companies.keys()][0];
      return undefined;
    };
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=qualification_recovery_required` });
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(invite).not.toHaveBeenCalled();
  });
});

describe("invitation recovery after a successful qualification claim", () => {
  const recoveryUrl = `${back}&error=qualification_invitation_unconfirmed`;
  const qualificationActions = ["lead.qualified", "company.created_from_lead"];
  const auditActions = () => mocks.audit.mock.calls.map(([event]) => event.action);

  it("keeps the null-ABN company when the actual Clerk helper loses an accepted invitation response", async () => {
    const providerInvitations: Row[] = [];
    let auditsAtInvitation: string[] = [];
    mocks.createInvitation.mockImplementationOnce(async (input: Row) => {
      providerInvitations.push(input);
      auditsAtInvitation = auditActions();
      throw new Error("Response lost after provider acceptance");
    });

    const outcome = await qualifyLead(form({ abn: " \t " })).catch((error: unknown) => error);
    expect(invite).toHaveBeenCalledTimes(1);
    await expect(invite.mock.results[0].value).resolves.toEqual({ ok: false, reason: "Response lost after provider acceptance" });
    expect(providerInvitations).toEqual([expect.objectContaining({
      emailAddress: "ops@example.test",
      publicMetadata: { company_id: db.currentLead.company_id, invited_email: "ops@example.test" },
    })]);
    expect(db.currentLead).toMatchObject({ status: "Qualified" });
    expect([...db.companies.values()]).toEqual([expect.objectContaining({ id: db.currentLead.company_id, status: "Pending", abn: null })]);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(auditsAtInvitation).toEqual(qualificationActions);
    expect(auditActions()).toEqual(qualificationActions);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ url: recoveryUrl });

    // Refresh/re-submit must not mint another company or send a second invitation.
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&error=already_qualified` });
    expect(db.companies.size).toBe(1);
    expect(mocks.createInvitation).toHaveBeenCalledTimes(1);
    expect(auditActions()).toEqual(qualificationActions);
  });

  it("also retains qualification when the helper reports a definitive provider rejection without classifying it", async () => {
    mocks.createInvitation.mockRejectedValueOnce(Object.assign(new Error("Provider rejected invitation"), { status: 422 }));
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: recoveryUrl });
    await expect(invite.mock.results[0].value).resolves.toEqual({ ok: false, reason: "Provider rejected invitation" });
    expect(db.currentLead).toMatchObject({ status: "Qualified" });
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(auditActions()).toEqual(qualificationActions);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("audits the retained qualification before inviting and records invitation success only after acknowledgement", async () => {
    let auditsAtInvitation: string[] = [];
    mocks.createInvitation.mockImplementationOnce(async () => {
      auditsAtInvitation = auditActions();
      return { id: "inv_Test" };
    });
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: `${back}&saved=qualified` });
    expect(auditsAtInvitation).toEqual(qualificationActions);
    expect(auditActions()).toEqual([...qualificationActions, "company_user.invited"]);
    expect(mocks.createInvitation).toHaveBeenCalledExactlyOnceWith({
      emailAddress: "ops@example.test", redirectUrl: expect.stringMatching(/\/signup$/), ignoreExisting: true,
      expiresInDays: 3,
      publicMetadata: { company_id: db.currentLead.company_id, invited_email: "ops@example.test" },
    });
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      trigger: "invitation", to: "ops@example.test", companyId: db.currentLead.company_id,
    }));
  });

  it.each(["lead.qualified", "company.created_from_lead"])("does not attempt an invitation before %s is recorded", async (action) => {
    mocks.audit.mockImplementation(async (event) => {
      if (event.action === action) throw new Error("Audit unavailable");
    });
    await expect(qualifyLead(form())).rejects.toThrow("Audit unavailable");
    expect(mocks.createInvitation).not.toHaveBeenCalled();
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does not undo a newer lead status after an unconfirmed invitation", async () => {
    invite.mockImplementationOnce(async () => {
      Object.assign(db.currentLead, { status: "Disqualified", disqualified_reason: "Reviewed again" });
      return { ok: false, reason: "Clerk rejected invitation" };
    });
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: recoveryUrl });
    expect(db.currentLead).toMatchObject({ status: "Disqualified", disqualified_reason: "Reviewed again" });
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(auditActions()).toEqual(qualificationActions);
  });

  it("does not delete the invited company or reset a newer lead association after an unconfirmed invitation", async () => {
    let invitedCompanyId: string | undefined;
    invite.mockImplementationOnce(async (_email, companyId) => {
      invitedCompanyId = companyId;
      db.companies.set(otherCompanyId, { id: otherCompanyId, status: "Pending", abn: null });
      db.currentLead.company_id = otherCompanyId;
      return { ok: false, reason: "Clerk rejected invitation" };
    });
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: recoveryUrl });
    expect(db.currentLead).toMatchObject({ status: "Qualified", company_id: otherCompanyId });
    expect([...db.companies.keys()]).toEqual([invitedCompanyId, otherCompanyId]);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(auditActions()).toEqual(qualificationActions);
  });

  it("leaves unrelated concurrent lead notes intact without rolling back qualification", async () => {
    invite.mockImplementationOnce(async () => {
      db.currentLead.notes = "A newer administrator note";
      return { ok: false, reason: "Clerk rejected invitation" };
    });
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: recoveryUrl });
    expect(db.currentLead).toMatchObject({ status: "Qualified", notes: "A newer administrator note" });
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(auditActions()).toEqual(qualificationActions);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does not erase the company on an unexpected invitation transport exception", async () => {
    invite.mockRejectedValueOnce(new Error("Invitation outcome unavailable"));
    await expect(qualifyLead(form())).rejects.toMatchObject({ url: recoveryUrl });
    expect(db.companies.has(String(db.currentLead.company_id))).toBe(true);
    expect(db.requests.some(isRollback)).toBe(false);
    expect(db.requests.some(isDelete)).toBe(false);
    expect(auditActions()).toEqual(qualificationActions);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
