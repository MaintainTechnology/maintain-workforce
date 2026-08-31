import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/config", () => ({
  getBookingRules: vi.fn(async () => ({ minimumCrewSize: 1 })),
}));
vi.mock("@/lib/matching", () => ({ loadMatchRow: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/notify", () => ({
  NOTIFICATION_TRIGGERS: {
    NOMINATION_KNOCKED_OUT: "nomination knocked out",
    MATCH_AUTO_DECLINED: "match auto declined",
  },
  notify: mocks.notify,
}));

const { notifyWorkerStatusKnockouts } = await import("./match-orchestration");

function adminClient() {
  return {
    from(table: string) {
      if (table === "match") {
        const query = {
          select: vi.fn(() => query),
          in: vi.fn(async () => ({
            data: [
              {
                id: "match-1",
                supplier_company_id: "supplier-1",
                buyer_company_id: "buyer-1",
              },
            ],
          })),
        };
        return query;
      }
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((_column: string, companyId: string) => ({
          maybeSingle: vi.fn(async () => ({ data: { contact_email: `${companyId}@example.test` } })),
        })),
      };
      return query;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.createAdminClient.mockImplementation(adminClient);
  mocks.notify.mockResolvedValue({ sent: true });
});
afterEach(() => vi.restoreAllMocks());

describe("worker status cascade notifications", () => {
  it("still attempts the buyer message when the supplier delivery rejects", async () => {
    mocks.notify.mockRejectedValueOnce(new Error("delivery unavailable"));
    await expect(notifyWorkerStatusKnockouts({
      knockedOutMatchIds: ["match-1"], declinedMatchIds: [], buyerDeclinedMatchIds: [],
      buyerRenotificationMatchIds: ["match-1"],
    })).resolves.toBeUndefined();
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it("does not fail the committed workflow if notification recipients cannot be loaded", async () => {
    mocks.createAdminClient.mockImplementation(() => ({ from() { throw new Error("lookup unavailable"); } }));
    await expect(notifyWorkerStatusKnockouts({
      knockedOutMatchIds: ["match-1"], declinedMatchIds: [], buyerDeclinedMatchIds: [],
      buyerRenotificationMatchIds: ["match-1"],
    })).resolves.toBeUndefined();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("re-notifies the buyer without a worker name when an Awaiting Buyer match remains valid", async () => {
    await notifyWorkerStatusKnockouts({
      knockedOutMatchIds: ["match-1"],
      declinedMatchIds: [],
      buyerDeclinedMatchIds: [],
      buyerRenotificationMatchIds: ["match-1"],
    });

    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "supplier-1",
        trigger: "nomination knocked out",
      }),
    );
    const buyerCall = mocks.notify.mock.calls.find(([input]) => input.companyId === "buyer-1")?.[0];
    expect(buyerCall).toMatchObject({
      trigger: "nomination knocked out",
      to: "buyer-1@example.test",
      entityId: "match-1",
    });
    expect(buyerCall.body).not.toMatch(/Alice|worker name/i);
  });
});
