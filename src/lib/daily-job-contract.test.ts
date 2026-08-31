import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/notify", () => ({ dispatchPendingNotifications: mocks.dispatch }));
const { runDailyJob } = await import("./cron");
const summary = {
  company_documents_recomputed: 1, worker_qualifications_recomputed: 2,
  capacity_lines_expired: 0, demand_lines_expired: 0, matches_expired: 0,
  engagements_activated: 1, engagements_completed: 0, engagements_flagged_overdue: 1,
  transfers_escalated: 0, nominations_knocked_out: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ data: summary, error: null });
  mocks.dispatch.mockResolvedValue({ sent: 2, failed: 1, deferred: 0 });
});

describe("daily job transaction boundary", () => {
  it("sends only after the complete state/audit/outbox transaction succeeds", async () => {
    const result = await runDailyJob("2026-08-31");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("run_daily_state_transitions", expect.objectContaining({ p_today: "2026-08-31" }));
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({ ...summary, notifications: { sent: 2, failed: 1, deferred: 0 } });
  });

  it("does not turn an RPC error or malformed result into a successful no-op", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "audit insert rejected" } });
    await expect(runDailyJob("2026-08-31")).rejects.toThrow("audit insert rejected");
    expect(mocks.dispatch).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(runDailyJob("2026-08-31")).rejects.toThrow("invalid summary");
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30", "2026-99-99", "not-a-date"])("rejects invalid calendar input %s", async (today) => {
    await expect(runDailyJob(today)).rejects.toThrow("exact Brisbane calendar date");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
