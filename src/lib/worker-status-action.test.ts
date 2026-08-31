import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw Object.assign(new Error(`redirect:${url}`), { url });
  }),
  revalidatePath: vi.fn(),
  notifyWorkerStatusKnockouts: vi.fn(),
  requireMaintainAdmin: vi.fn(),
  runWorkerKnockouts: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireCompanyAdmin: vi.fn(async () => ({ user: { id: "company-admin" }, companyId: "company" })),
  requireWritableCompany: vi.fn(async () => ({ user: { id: "company-admin" }, companyId: "company" })),
  requireMaintainAdmin: mocks.requireMaintainAdmin,
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/match-orchestration", () => ({
  notifyWorkerStatusKnockouts: mocks.notifyWorkerStatusKnockouts,
  runWorkerKnockouts: mocks.runWorkerKnockouts,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

const { maintainSetWorkerStatus, setWorkerAccountStatus } = await import("./actions/worker");

function statusClient(
  beforeStatus: "Active" | "Inactive" | "Suspended" | null,
  result: Record<string, string[]> = {},
  rpcError: { message: string } | null = null,
) {
  const readQuery = {
    select: vi.fn(() => readQuery),
    eq: vi.fn(() => readQuery),
    maybeSingle: vi.fn(async () => ({
      data: beforeStatus ? { status: beforeStatus } : null,
      error: null,
    })),
  };
  const rpc = vi.fn(async () => ({ data: result, error: rpcError }));
  const client = {
    from: vi.fn(() => ({ select: readQuery.select })),
    rpc,
  };
  return { client, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("company worker status controls", () => {
  it("does not render a company status form for a Maintain-suspended worker", () => {
    const source = readFileSync(
      new URL("../app/(app)/app/workers/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('worker.status !== "Suspended" ? (');
  });

  it("rejects a forged company reactivation when the stored worker is Suspended", async () => {
    const { client, rpc } = statusClient("Suspended");
    mocks.createClient.mockResolvedValue(client);

    const formData = new FormData();
    formData.set("worker_id", "worker-1");
    formData.set("status", "Active");

    await expect(setWorkerAccountStatus(formData)).rejects.toMatchObject({
      url: "/app/workers/worker-1?notice=not-permitted",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.runWorkerKnockouts).not.toHaveBeenCalled();
  });

  it("passes the exact successfully read prior status to the transactional RPC", async () => {
    const { client, rpc } = statusClient("Inactive");
    mocks.createClient.mockResolvedValue(client);

    const formData = new FormData();
    formData.set("worker_id", "worker-1");
    formData.set("status", "Active");

    await expect(setWorkerAccountStatus(formData)).rejects.toMatchObject({
      url: "/app/workers/worker-1?notice=status-updated",
    });
    expect(rpc).toHaveBeenCalledWith("set_company_worker_status", {
      p_worker_id: "worker-1",
      p_expected_status: "Inactive",
      p_status: "Active",
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not attempt an update when the prior worker row is unavailable", async () => {
    const { client, rpc } = statusClient(null);
    mocks.createClient.mockResolvedValue(client);

    const formData = new FormData();
    formData.set("worker_id", "worker-1");
    formData.set("status", "Inactive");

    await expect(setWorkerAccountStatus(formData)).rejects.toMatchObject({
      url: "/app/workers/worker-1?notice=not-permitted",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("uses returned match ids only for post-commit notification fanout", async () => {
    const result = {
      knocked_out_match_ids: ["match-1"],
      declined_match_ids: ["match-1"],
      buyer_declined_match_ids: ["match-1"],
      buyer_renotification_match_ids: [],
    };
    const { client } = statusClient("Active", result);
    mocks.createClient.mockResolvedValue(client);

    const formData = new FormData();
    formData.set("worker_id", "worker-1");
    formData.set("status", "Inactive");

    await expect(setWorkerAccountStatus(formData)).rejects.toMatchObject({
      url: "/app/workers/worker-1?notice=status-updated",
    });
    expect(mocks.notifyWorkerStatusKnockouts).toHaveBeenCalledWith({
      knockedOutMatchIds: ["match-1"],
      declinedMatchIds: ["match-1"],
      buyerDeclinedMatchIds: ["match-1"],
      buyerRenotificationMatchIds: [],
    });
    expect(mocks.runWorkerKnockouts).not.toHaveBeenCalled();
  });

  it("routes Maintain suspension through the same exact-CAS transaction", async () => {
    mocks.requireMaintainAdmin.mockResolvedValue({ id: "maintain-admin" });
    const result = {
      knocked_out_match_ids: ["match-1"],
      declined_match_ids: [],
      buyer_declined_match_ids: [],
      buyer_renotification_match_ids: ["match-1"],
    };
    const { client, rpc } = statusClient("Active", result);
    mocks.createAdminClient.mockReturnValue(client);

    const formData = new FormData();
    formData.set("worker_id", "worker-1");
    formData.set("status", "Suspended");

    await expect(maintainSetWorkerStatus(formData)).rejects.toMatchObject({
      url: "/admin/workers?notice=status-updated",
    });
    expect(rpc).toHaveBeenCalledWith("set_company_worker_status", {
      p_worker_id: "worker-1",
      p_expected_status: "Active",
      p_status: "Suspended",
      p_actor_user_id: "maintain-admin",
    });
    expect(mocks.notifyWorkerStatusKnockouts).toHaveBeenCalledWith({
      knockedOutMatchIds: ["match-1"],
      declinedMatchIds: [],
      buyerDeclinedMatchIds: [],
      buyerRenotificationMatchIds: ["match-1"],
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.runWorkerKnockouts).not.toHaveBeenCalled();
  });

  it("checks a failed Maintain status RPC before reporting success", async () => {
    mocks.requireMaintainAdmin.mockResolvedValue({ id: "maintain-admin" });
    const { client } = statusClient("Active", {}, { message: "stale status" });
    mocks.createAdminClient.mockReturnValue(client);

    const formData = new FormData();
    formData.set("worker_id", "worker-1");
    formData.set("status", "Suspended");

    await expect(maintainSetWorkerStatus(formData)).rejects.toMatchObject({
      url: "/admin/workers?notice=not-permitted",
    });
    expect(mocks.notifyWorkerStatusKnockouts).not.toHaveBeenCalled();
  });
});
