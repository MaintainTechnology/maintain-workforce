import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getBookingRules: vi.fn(),
  indicativeRange: vi.fn(),
  notify: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw Object.assign(new Error(`redirect:${url}`), { url });
  }),
  rpc: vi.fn(),
  supplierBand: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/auth", () => ({
  requireActiveCompany: vi.fn(async () => ({
    user: { id: "company-admin" },
    companyId: "11111111-1111-4111-8111-111111111110",
  })),
  requireWritableCompany: vi.fn(async () => ({
    user: { id: "company-admin" },
    companyId: "11111111-1111-4111-8111-111111111110",
  })),
  requireMaintainAdmin: vi.fn(async () => ({ id: "maintain-admin" })),
}));
vi.mock("@/lib/config", () => ({ getBookingRules: mocks.getBookingRules }));
vi.mock("@/lib/notify", () => ({
  NOTIFICATION_TRIGGERS: {
    NEW_CAPACITY: "new_capacity",
    NEW_DEMAND: "new_demand",
    NO_RATE_BAND: "no_rate_band",
  },
  notify: mocks.notify,
}));
vi.mock("@/lib/rates", () => ({
  indicativeRange: mocks.indicativeRange,
  supplierBand: mocks.supplierBand,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

const { createCapacityListing } = await import("./actions/capacity");
const { createDemandRequest } = await import("./actions/demand");
const { createWorker } = await import("./actions/worker");
const { conciergeCreateWorker } = await import("./actions/concierge");

const ids = {
  company: "11111111-1111-4111-8111-111111111110",
  worker: "22222222-2222-4222-8222-222222222220",
  region: "33333333-3333-4333-8333-333333333332",
  trade: "44444444-4444-4444-8444-444444444444",
  proficiency: "55555555-5555-4555-8555-555555555553",
};

function queryFor(table: string) {
  let data: unknown[] = [];
  if (table === "worker") {
    data = [
      {
        id: ids.worker,
        first_name: "Alex",
        last_name: "Worker",
        primary_trade_id: ids.trade,
        primary_proficiency_id: ids.proficiency,
      },
    ];
  }
  if (table === "worker_employment") {
    data = [
      {
        worker_id: ids.worker,
        worker: {
          id: ids.worker,
          first_name: "Alex",
          last_name: "Worker",
          primary_trade_id: ids.trade,
          primary_proficiency_id: ids.proficiency,
        },
      },
    ];
  }
  if (table === "trade_role_proficiency") {
    data = [{ trade_role_id: ids.trade, proficiency_id: ids.proficiency }];
  }

  const query: Record<string, unknown> = { data, error: null };
  for (const method of ["select", "eq", "in", "is", "limit", "order"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => {
    if (table === "company") return { data: { status: "Active" }, error: null };
    if (table === "trade_role_proficiency") {
      return { data: { trade_role_id: ids.trade }, error: null };
    }
    return { data: null, error: null };
  });
  return query;
}

function capacityPayload() {
  return {
    lines: [
      {
        tradeRoleId: ids.trade,
        proficiencyId: ids.proficiency,
        availableFrom: "2026-09-01",
        availableUntil: "2026-09-10",
        hoursPerWeek: 40,
        locationRegionId: ids.region,
        travelRegionIds: [ids.region],
        supplierRateCents: 10000,
        workerIds: [ids.worker],
      },
    ],
  };
}

function demandPayload() {
  return {
    name: "Shutdown crew",
    workRegionId: ids.region,
    lines: [
      {
        tradeRoleId: ids.trade,
        proficiencyId: ids.proficiency,
        quantity: 1,
        startDate: "2026-09-01",
        endDate: "2026-09-10",
        hoursMode: "week",
        hours: 40,
        skillIds: [],
        qualificationIds: [],
      },
    ],
  };
}

function workerFormData(concierge = false): FormData {
  const formData = new FormData();
  if (concierge) {
    formData.set("company_id", ids.company);
    formData.set("evidence_note", "Spoke to Alex at 10:00 AEST");
  }
  formData.set("first_name", "Alex");
  formData.set("last_name", "Worker");
  formData.set("mobile", "0400 000 000");
  formData.set("email", "alex@example.test");
  formData.set("base_region_id", ids.region);
  formData.set("primary_trade_id", ids.trade);
  formData.set("primary_proficiency_id", ids.proficiency);
  formData.set("start_date", "2026-09-01");
  formData.set("consent", "on");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getBookingRules.mockResolvedValue({ minimumHoursPerLine: 8, minimumCrewSize: 1 });
  mocks.indicativeRange.mockResolvedValue({ lowCents: 10000, highCents: 12000 });
  mocks.supplierBand.mockResolvedValue({ lowCents: 9000, highCents: 11000 });
  const client = { from: vi.fn((table: string) => queryFor(table)), rpc: mocks.rpc };
  mocks.createClient.mockResolvedValue(client);
  mocks.createAdminClient.mockReturnValue(client);
});

afterEach(() => vi.restoreAllMocks());

function noWorkerCollision() {
  const client = mocks.createAdminClient();
  client.from = vi.fn((table: string) => {
    const query = queryFor(table);
    if (table === "worker") query.data = [];
    return query;
  });
}

describe("transactional intake server actions", () => {
  it.each([false, true])("surfaces missing worker setup and preserves the form (concierge=%s)", async (concierge) => {
    noWorkerCollision();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "private database internals" },
    });
    const action = concierge ? conciergeCreateWorker : createWorker;

    const result = await action(null, workerFormData(concierge));

    expect(result).toMatchObject({
      ok: false,
      message: "Worker setup needs attention from Maintain. Your details have been kept. Please contact Maintain support.",
      values: { first_name: "Alex", consent: "on", start_date: "2026-09-01" },
    });
    expect(JSON.stringify(result)).not.toContain("private database internals");
    expect(console.error).toHaveBeenCalledWith(
      "[worker-intake] Could not complete worker intake",
      { stage: "save", code: "PGRST202" },
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([false, true])("rejects an impossible calendar date before a database write (concierge=%s)", async (concierge) => {
    const form = workerFormData(concierge);
    form.set("start_date", "2026-02-30");
    const action = concierge ? conciergeCreateWorker : createWorker;

    await expect(action(null, form)).resolves.toMatchObject({
      ok: false,
      errors: { start_date: "Give a valid date this worker joined." },
      values: { start_date: "2026-02-30", consent: "on" },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])("requires consent before creating a worker (concierge=%s)", async (concierge) => {
    const form = workerFormData(concierge);
    form.delete("consent");
    const action = concierge ? conciergeCreateWorker : createWorker;
    await expect(action(null, form)).resolves.toMatchObject({
      ok: false,
      errors: { consent: expect.stringContaining("Confirm") },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])("reports catalogue read failures without blaming the chosen proficiency (concierge=%s)", async (concierge) => {
    const client = mocks.createAdminClient();
    client.from = vi.fn((table: string) => {
      const query = queryFor(table);
      if (table === "trade_role_proficiency") {
        query.maybeSingle = vi.fn(async () => ({ data: null, error: { code: "PGRST205" } }));
      }
      return query;
    });
    const action = concierge ? conciergeCreateWorker : createWorker;

    await expect(action(null, workerFormData(concierge))).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Worker setup needs attention"),
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a useful message for worker options removed after the form loaded", async () => {
    noWorkerCollision();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "worker region is not active" },
    });
    await expect(createWorker(null, workerFormData())).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Some selected worker options are no longer available"),
      values: { consent: "on" },
    });
  });

  it("checks a capacity RPC failure before any post-commit delivery", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "overlap" } });
    const formData = new FormData();
    formData.set("payload", JSON.stringify(capacityPayload()));

    await expect(createCapacityListing(null, formData)).resolves.toMatchObject({
      ok: false,
      message: "The listing could not be saved. Try again.",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_capacity_listing_transactional",
      expect.objectContaining({ p_admin_entered: false, p_company_id: ids.company }),
    );
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("delivers demand notifications only after the aggregate RPC commits", async () => {
    mocks.rpc.mockResolvedValue({ data: "request-1", error: null });
    const formData = new FormData();
    formData.set("payload", JSON.stringify(demandPayload()));

    await expect(createDemandRequest(null, formData)).rejects.toMatchObject({
      url: "/app/demand",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_demand_request_transactional",
      expect.objectContaining({ p_admin_entered: false, p_company_id: ids.company }),
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "request-1", trigger: "new_demand" }),
    );
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.notify.mock.invocationCallOrder[0],
    );
  });

  it("maps a transactional worker uniqueness failure to the existence-only collision result", async () => {
    // The worker duplicate pre-check receives no rows; this error simulates the unique
    // index winning a race after that read.
    const admin = mocks.createAdminClient();
    const originalFrom = admin.from;
    admin.from = vi.fn((table: string) => {
      const query = originalFrom(table);
      if (table === "worker") query.data = [];
      return query;
    });
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "collision" } });

    await expect(createWorker(null, workerFormData())).resolves.toMatchObject({
      ok: false,
      collision: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_worker_transactional",
      expect.objectContaining({ p_admin_entered: false, p_company_id: ids.company }),
    );
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves concierge evidence and provenance in the worker RPC payload", async () => {
    const admin = mocks.createAdminClient();
    const originalFrom = admin.from;
    admin.from = vi.fn((table: string) => {
      const query = originalFrom(table);
      if (table === "worker") query.data = [];
      return query;
    });
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.rpc.mockResolvedValue({ data: "worker-1", error: null });

    await expect(conciergeCreateWorker(null, workerFormData(true))).rejects.toMatchObject({
      url: `/admin/companies/${ids.company}/concierge?saved=worker`,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_worker_transactional",
      expect.objectContaining({
        p_actor_user_id: "maintain-admin",
        p_admin_entered: true,
        p_evidence_note: "Spoke to Alex at 10:00 AEST",
      }),
    );
  });
});
