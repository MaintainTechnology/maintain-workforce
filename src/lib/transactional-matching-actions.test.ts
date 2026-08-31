import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ids = vi.hoisted(() => ({
  match: "10000000-0000-4000-8000-000000000001",
  supplier: "10000000-0000-4000-8000-000000000002",
  buyer: "10000000-0000-4000-8000-000000000003",
  worker: "10000000-0000-4000-8000-000000000004",
  line: "10000000-0000-4000-8000-000000000005",
}));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  notify: vi.fn(),
  requireActiveCompany: vi.fn(),
  requireMaintainAdmin: vi.fn(),
  loadMatchRow: vi.fn(),
  revalidatePath: vi.fn(),
  notifyWorkerStatusKnockouts: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireActiveCompany: mocks.requireActiveCompany,
  requireMaintainAdmin: mocks.requireMaintainAdmin,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/matching", () => ({
  brisbaneToday: () => "2026-08-31",
  loadMatchRow: mocks.loadMatchRow,
}));
vi.mock("@/lib/match-orchestration", () => ({
  notifyWorkerStatusKnockouts: mocks.notifyWorkerStatusKnockouts,
}));
vi.mock("@/lib/notify", async (importOriginal) => {
  const original = await importOriginal<typeof import("./notify")>();
  return { ...original, notify: mocks.notify };
});

const actions = await import("./actions/match");

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

function result(extra: Record<string, unknown> = {}) {
  return {
    match_id: ids.match,
    supplier_company_id: ids.supplier,
    buyer_company_id: ids.buyer,
    status_before: "Awaiting Supplier",
    status_after: "Awaiting Buyer",
    nomination_version: 1,
    nominated_count: 1,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requireActiveCompany.mockResolvedValue({ user: { id: "user_supplier" }, companyId: ids.supplier });
  mocks.requireMaintainAdmin.mockResolvedValue({ id: "user_maintain" });
  mocks.loadMatchRow.mockResolvedValue({
    id: ids.match,
    supplier_company_id: ids.supplier,
    buyer_company_id: ids.buyer,
    status: "Awaiting Supplier",
    nomination_version: 1,
  });
  mocks.from.mockImplementation((table: string) => {
    if (table !== "company") throw new Error(`Unexpected non-RPC database access: ${table}`);
    let companyId = "";
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => { companyId = value; return query; },
      maybeSingle: async () => ({ data: { contact_email: `${companyId}@example.test` }, error: null }),
    };
    return query;
  });
  mocks.rpc.mockResolvedValue({ data: result(), error: null });
  mocks.notify.mockResolvedValue({ sent: true });
  mocks.notifyWorkerStatusKnockouts.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("transactional matching action boundary", () => {
  it("submits a whole proposal group to one transaction without partial writes", async () => {
    mocks.rpc.mockResolvedValue({ data: { matches: [result()] }, error: null });
    const response = await actions.proposeMatches(null, form({
      demand_line_id: ids.line,
      candidate: `${ids.line}:${ids.worker}`,
    }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("propose_matches_atomic", expect.objectContaining({
      p_demand_line_id: ids.line,
      p_candidates: [{ capacity_line_id: ids.line, worker_id: ids.worker }],
      p_actor_user_id: "user_maintain",
      p_effective_date: "2026-08-31",
    }));
  });

  it("uses the authenticated supplier and exact state when accepting nominations", async () => {
    const response = await actions.supplierAcceptMatch(null, form({ match_id: ids.match, worker_id: ids.worker }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("accept_match_as_supplier", expect.objectContaining({
      p_match_id: ids.match,
      p_supplier_company_id: ids.supplier,
      p_actor_user_id: "user_supplier",
      p_expected_status: "Awaiting Supplier",
      p_worker_ids: [ids.worker],
      p_admin_entered: false,
    }));
  });

  it("does not claim success or send messages when the transaction fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "match status changed" } });
    const response = await actions.supplierAcceptMatch(null, form({ match_id: ids.match, worker_id: ids.worker }));
    expect(response.ok).toBe(false);
    expect(response.message).toMatch(/changed|refresh/i);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does not let postcommit notification failures report a failed acceptance", async () => {
    mocks.notify.mockRejectedValue(new Error("delivery unavailable"));
    const response = await actions.supplierAcceptMatch(null, form({ match_id: ids.match, worker_id: ids.worker }));
    expect(response.ok).toBe(true);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it("returns a recoverable form result when the database transport rejects", async () => {
    mocks.rpc.mockRejectedValue(new Error("network interrupted"));
    const response = await actions.supplierAcceptMatch(null, form({ match_id: ids.match, worker_id: ids.worker }));
    expect(response.ok).toBe(false);
    expect(response.message).toMatch(/refresh|try again/i);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("re-presents same-size substitutions with the displayed nomination version", async () => {
    const response = await actions.supplierSubstituteNominations(null, form({
      match_id: ids.match, worker_id: ids.worker, expected_nomination_version: "7",
    }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("substitute_match_nominations", expect.objectContaining({
      p_expected_status: "Awaiting Buyer", p_expected_nomination_version: 7,
      p_supplier_company_id: ids.supplier, p_worker_ids: [ids.worker],
    }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ companyId: ids.buyer }));
  });

  it("binds buyer acceptance to both the displayed count and version", async () => {
    mocks.requireActiveCompany.mockResolvedValue({ user: { id: "user_buyer" }, companyId: ids.buyer });
    mocks.rpc.mockResolvedValue({ data: result({ accepted: true, engagement_id: ids.line, competing_matches: [] }), error: null });
    const response = await actions.buyerAcceptMatch(null, form({
      match_id: ids.match, presented_quantity: "1", presented_nomination_version: "7",
    }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("accept_match_as_buyer", expect.objectContaining({
      p_expected_status: "Awaiting Buyer", p_presented_quantity: 1,
      p_presented_nomination_version: 7, p_buyer_company_id: ids.buyer,
    }));
  });

  it("rejects a buyer form with no displayed nomination version", async () => {
    const response = await actions.buyerAcceptMatch(null, form({ match_id: ids.match, presented_quantity: "1" }));
    expect(response.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns the re-review outcome rather than pretending a knocked-out proposal was accepted", async () => {
    mocks.rpc.mockResolvedValue({ data: result({
      accepted: false, remaining_count: 1, declined: false,
      knocked_out: [{ worker_id: ids.worker, reason: "worker left Active" }],
    }), error: null });
    const response = await actions.buyerAcceptMatch(null, form({
      match_id: ids.match, presented_quantity: "2", presented_nomination_version: "7",
    }));
    expect(response.ok).toBe(false);
    expect(response.message).toMatch(/review|changed/i);
    expect(mocks.notifyWorkerStatusKnockouts).toHaveBeenCalled();
  });

  it("notifies the buyer and Maintain after a supplier decline", async () => {
    mocks.rpc.mockResolvedValue({ data: result({ status_after: "Declined" }), error: null });
    const response = await actions.supplierDeclineMatch(null, form({
      match_id: ids.match, expected_status: "Awaiting Supplier", reason: "Cannot cover these dates",
    }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("decline_match_atomic", expect.objectContaining({
      p_party: "supplier", p_company_id: ids.supplier, p_expected_status: "Awaiting Supplier",
    }));
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ companyId: ids.buyer }));
  });

  it("requires evidence for a concierge acceptance before any database call", async () => {
    const response = await actions.recordSupplierAcceptance(null, form({ match_id: ids.match, worker_id: ids.worker }));
    expect(response.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not leak raw database internals from an unexpected transaction failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret schema internal stack" } });
    const response = await actions.supplierAcceptMatch(null, form({ match_id: ids.match, worker_id: ids.worker }));
    expect(response.ok).toBe(false);
    expect(response.message).not.toContain("secret schema");
  });
});
