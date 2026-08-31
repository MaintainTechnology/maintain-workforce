import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), notify: vi.fn(), knockoutNotifications: vi.fn(),
  companyGuard: vi.fn(), adminGuard: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/auth", () => ({ requireWritableCompany: mocks.companyGuard, requireMaintainAdmin: mocks.adminGuard }));
vi.mock("@/lib/notify", async (original) => ({ ...(await original<typeof import("./notify")>()), notify: mocks.notify }));
vi.mock("@/lib/match-orchestration", () => ({ notifyWorkerStatusKnockouts: mocks.knockoutNotifications }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { contact_email: "party@transfer.test" }, error: null }) }) }) }),
}) }));

import { adminDecideTransfer, approveTransfer, declineTransfer, requestTransfer, withdrawTransfer } from "./actions/transfer";
import { escalateTransfersForDate } from "./transfer-orchestration";

const ids = {
  transfer: "11111111-1111-4111-8111-111111111111",
  from: "22222222-2222-4222-8222-222222222222",
  to: "33333333-3333-4333-8333-333333333333",
};
function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  Object.entries({ transfer_id: ids.transfer, expected_status: "Awaiting Current Employer", ...values })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}
function result(values: Record<string, unknown> = {}) {
  return { transfer_id: ids.transfer, status: "Completed", from_company_id: ids.from, to_company_id: ids.to,
    transition: "approve", lines_touched: 0, knockouts: [], ...values };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.companyGuard.mockResolvedValue({ user: { id: "company-actor" }, companyId: ids.from });
  mocks.adminGuard.mockResolvedValue({ id: "maintain-actor" });
  mocks.rpc.mockResolvedValue({ data: result(), error: null });
  mocks.notify.mockResolvedValue({ sent: false, status: "failed", reason: "test offline", failureRecorded: true });
  mocks.knockoutNotifications.mockResolvedValue(undefined);
});

describe("transfer Server Actions", () => {
  it("normalises contact input, calls one atomic request, and returns no worker/company identifiers", async () => {
    mocks.rpc.mockResolvedValue({ data: result({ status: "Awaiting Current Employer", transition: "requested", created: true }), error: null });
    const response = await requestTransfer(null, form({ email: " WORKER@EXAMPLE.TEST ", mobile: "04 1234 5678", worker_id: "forged-worker" }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("request_worker_transfer", {
      p_email: "worker@example.test", p_mobile: "0412345678", p_to_company_id: ids.from, p_actor_user_id: "company-actor",
    });
    expect(Object.keys(response).sort()).toEqual(["message", "ok"]);
  });

  it("does not repeat notifications when the same pending request already exists", async () => {
    mocks.rpc.mockResolvedValue({ data: result({ status: "Awaiting Current Employer", transition: "requested", created: false }), error: null });
    expect((await requestTransfer(null, form({ email: "worker@example.test", mobile: "0412345678" }))).ok).toBe(true);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("requires a writable company before any company decision reaches the database", async () => {
    mocks.companyGuard.mockRejectedValue(new Error("Company is read-only"));
    for (const action of [approveTransfer, declineTransfer, withdrawTransfer]) {
      await expect(action(null, form())).rejects.toThrow("read-only");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("binds approvals to the authenticated party and the displayed state", async () => {
    const response = await approveTransfer(null, form({ actor_company_id: ids.to, actor_user_id: "forged-actor" }));
    expect(response.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("decide_worker_transfer", {
      p_transfer_id: ids.transfer, p_expected_status: "Awaiting Current Employer", p_decision: "approve",
      p_actor_user_id: "company-actor", p_actor_company_id: ids.from, p_reason: null,
    });
  });

  it("reports stale CAS and database failures without success or raw SQL data", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "private worker row" } });
    const stale = await approveTransfer(null, form());
    expect(stale.ok).toBe(false);
    expect(stale.message).toMatch(/changed|refresh/i);
    expect(stale.message).not.toContain("private worker");
    expect(mocks.notify).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "resolve committing engagements before transfer approval" } });
    expect((await approveTransfer(null, form())).message).toMatch(/resolve|Maintain/i);
  });

  it("surfaces malformed or thrown RPC failures instead of claiming completion", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    expect((await approveTransfer(null, form())).ok).toBe(false);
    mocks.rpc.mockRejectedValue(new Error("network unavailable"));
    expect((await approveTransfer(null, form())).ok).toBe(false);
  });

  it("rejects a mismatched successful RPC payload instead of claiming the wrong transfer completed", async () => {
    mocks.rpc.mockResolvedValue({ data: result({ status: "Declined" }), error: null });
    expect((await approveTransfer(null, form())).ok).toBe(false);
    mocks.rpc.mockResolvedValue({ data: result({ transfer_id: ids.to }), error: null });
    expect((await approveTransfer(null, form())).ok).toBe(false);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("requires Admin Review for admin approval and evidence for exceptional review", async () => {
    expect((await adminDecideTransfer(null, form({ decision: "approve" }))).ok).toBe(false);
    expect((await adminDecideTransfer(null, form({ decision: "review", reason: "short" }))).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: result({ status: "Admin Review", transition: "review" }), error: null });
    expect((await adminDecideTransfer(null, form({ decision: "review", reason: "Employer requested Maintain intervention" }))).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("decide_worker_transfer", expect.objectContaining({
      p_decision: "review", p_actor_user_id: "maintain-actor", p_actor_company_id: null,
      p_reason: "Employer requested Maintain intervention",
    }));
  });

  it("does not let a failed email undo or misreport a completed transfer", async () => {
    mocks.notify.mockRejectedValue(new Error("delivery unavailable"));
    expect((await approveTransfer(null, form())).ok).toBe(true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/workers");
  });

  it("maps every knockout to the correct postcommit buyer re-presentation or decline notification", async () => {
    mocks.rpc.mockResolvedValue({ data: result({ lines_touched: 1, knockouts: [
      { changed: true, match_id: ids.from, status_before: "Awaiting Buyer", status_after: "Awaiting Buyer" },
      { changed: true, match_id: ids.to, status_before: "Awaiting Buyer", status_after: "Declined" },
    ] }), error: null });
    expect((await approveTransfer(null, form())).ok).toBe(true);
    expect(mocks.knockoutNotifications).toHaveBeenCalledWith({
      knockedOutMatchIds: [ids.from, ids.to], declinedMatchIds: [ids.to],
      buyerDeclinedMatchIds: [ids.to], buyerRenotificationMatchIds: [ids.from],
    });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ actionPath: "/app/capacity", companyId: ids.from }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ actionPath: "/admin/transfers" }));
  });

  it("requires the displayed CAS state and validates contact details before any RPC", async () => {
    const missingState = form();
    missingState.delete("expected_status");
    expect((await approveTransfer(null, missingState)).ok).toBe(false);
    expect((await requestTransfer(null, form({ email: "invalid", mobile: "123" }))).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("server-only transfer escalation", () => {
  it("fails loudly on a DB or malformed response and never sends an uncommitted notification", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "injected rollback" } });
    await expect(escalateTransfersForDate("2026-08-31")).rejects.toThrow("escalation failed");
    mocks.rpc.mockResolvedValue({ data: [{}], error: null });
    await expect(escalateTransfersForDate("2026-08-31")).rejects.toThrow("invalid result");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("uses the system actor for clock execution and returns only committed escalation count", async () => {
    mocks.rpc.mockResolvedValue({ data: [result({ transition: "escalated", status: "Admin Review" })], error: null });
    await expect(escalateTransfersForDate("2026-08-31")).resolves.toEqual({ escalated: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("escalate_worker_transfers", { p_effective_date: "2026-08-31", p_actor_user_id: null });
    expect(mocks.notify).toHaveBeenCalledTimes(3);
  });
});
