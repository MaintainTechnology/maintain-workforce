import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; queued: boolean }>,
  send: vi.fn(),
  pages: [] as Array<string | undefined>,
  claims: [] as string[],
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: async (name: string, args: Record<string, unknown>) => {
    const row = mocks.rows.find((item) => item.id === args.p_notification_id)!;
    if (name === "claim_queued_notification") {
      mocks.claims.push(row.id);
      return { data: { id: row.id, recipient_email: "fixture@example.test", subject: "Fixture", body: "Open the app.", action_url: null, attempt: 1, claim_token: row.id }, error: null };
    }
    row.queued = false; // Both acknowledged and uncertain deliveries leave the automatic queue.
    return { data: true, error: null };
  },
  from: () => {
    let afterId: string | undefined;
    const query = {
      select: () => query, is: () => query, not: () => query, order: () => query, limit: () => query,
      gt: (_column: string, value: string) => { afterId = value; return query; },
      then: (resolve: (value: unknown) => void) => {
        mocks.pages.push(afterId);
        resolve({ data: mocks.rows.filter((row) => row.queued && (!afterId || row.id > afterId)).slice(0, 100), error: null });
      },
    };
    return query;
  },
}) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("../../emails/notification-email", () => ({ NotificationEmail: () => null }));
const { dispatchPendingNotifications } = await import("./notify");

function seed(count: number) {
  mocks.rows.push(...Array.from({ length: count }, (_, index) => ({ id: `fixture-${String(index).padStart(4, "0")}`, queued: true })));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "fixture-test-key");
  mocks.rows.length = 0;
  mocks.pages.length = 0;
  mocks.claims.length = 0;
  mocks.send.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("bounded durable outbox dispatcher", () => {
  it("keyset-paginates through more than a REST page without skipping rows removed by delivery", async () => {
    seed(205);
    mocks.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });
    await expect(dispatchPendingNotifications()).resolves.toEqual({ sent: 205, failed: 0, deferred: 0, budgetExhausted: false });
    expect(new Set(mocks.claims).size).toBe(205);
    expect(mocks.pages).toEqual([undefined, "fixture-0099", "fixture-0199", "fixture-0204"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves unclaimed rows durable when slow provider batches exhaust the invocation budget", async () => {
    seed(101);
    mocks.send.mockImplementation(() => new Promise(() => {}));
    let settled = false;
    const dispatch = dispatchPendingNotifications().then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(41_000);
    expect(settled).toBe(true);
    await expect(dispatch).resolves.toEqual({ sent: 0, failed: 25, deferred: 0, budgetExhausted: true });
    expect(mocks.rows.filter((row) => row.queued)).toHaveLength(76);
    mocks.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });
    await expect(dispatchPendingNotifications()).resolves.toMatchObject({ sent: 76, budgetExhausted: false });
    expect(mocks.claims).toHaveLength(101);
  });

  it("does not claim a delivery when the preceding transaction used the remaining route budget", async () => {
    seed(1);
    await expect(dispatchPendingNotifications(-1)).resolves.toEqual({ sent: 0, failed: 0, deferred: 0, budgetExhausted: true });
    expect(mocks.claims).toHaveLength(0);
    expect(mocks.pages).toHaveLength(0);
    expect(mocks.rows[0].queued).toBe(true);
  });
});
