import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getBookingRules: vi.fn(async () => ({ minimumHoursPerLine: 1, minimumCrewSize: 1 })),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireActiveCompany: vi.fn(async () => ({ user: { id: "buyer-admin" }, companyId: "buyer" })),
  requireMaintainAdmin: vi.fn(async () => ({ id: "maintain-admin" })),
}));
vi.mock("@/lib/config", () => ({ getBookingRules: mocks.getBookingRules }));
vi.mock("@/lib/notify", () => ({
  NOTIFICATION_TRIGGERS: { NEW_DEMAND: "new_demand", NO_RATE_BAND: "no_rate_band" },
  notify: vi.fn(),
}));
vi.mock("@/lib/rates", () => ({ indicativeRange: vi.fn(), supplierBand: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

const { createDemandRequest, updateDemandLine } = await import("./actions/demand");
const { conciergeCreateDemandRequest } = await import("./actions/concierge");

function queryFor(table: string) {
  const query: Record<string, unknown> = {
    data:
      table === "trade_role_proficiency"
        ? [{ trade_role_id: "trade", proficiency_id: "proficiency" }]
        : [],
    error: null,
  };
  for (const method of ["select", "eq", "in", "limit", "update", "insert", "delete"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => {
    if (table === "demand_line") {
      return {
        data: {
          id: "line-1",
          quantity: 1,
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          hours_per_week: 40,
          notes: null,
          status: "Open",
        },
        error: null,
      };
    }
    if (table === "company") return { data: { status: "Active" }, error: null };
    return { data: null, error: null };
  });
  query.single = vi.fn(async () => ({
    data:
      table === "demand_request"
        ? { id: "request-1" }
        : table === "demand_line"
          ? { id: "line-1" }
          : null,
    error: null,
  }));
  return query;
}

function demandPayload(startDate: string, endDate: string) {
  return {
    name: "Shutdown crew",
    workRegionId: "region",
    lines: [
      {
        tradeRoleId: "trade",
        proficiencyId: "proficiency",
        quantity: 1,
        startDate,
        endDate,
        hoursMode: "total",
        hours: 80,
        skillIds: [],
        qualificationIds: [],
      },
    ],
  };
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.createAdminClient.mockReset();
  mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => queryFor(table)) });
  mocks.createAdminClient.mockReturnValue({ from: vi.fn((table: string) => queryFor(table)) });
});

describe("total-hours demand date validation", () => {
  it("returns a line error for a reversed create window instead of throwing", async () => {
    const formData = new FormData();
    formData.set("payload", JSON.stringify(demandPayload("2026-08-31", "2026-08-01")));

    await expect(createDemandRequest(null, formData)).resolves.toMatchObject({
      ok: false,
      errors: { "line-0": "The window ends before it starts." },
    });
  });

  it("returns a line error for an impossible create date instead of normalising it", async () => {
    const formData = new FormData();
    formData.set("payload", JSON.stringify(demandPayload("2026-02-30", "2026-03-10")));

    await expect(createDemandRequest(null, formData)).resolves.toMatchObject({
      ok: false,
      errors: { "line-0": "Give valid start and end dates." },
    });
  });

  it("returns a line error for a reversed update window instead of throwing", async () => {
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        lineId: "line-1",
        quantity: 1,
        startDate: "2026-09-30",
        endDate: "2026-09-01",
        hoursMode: "total",
        hours: 80,
      }),
    );

    await expect(updateDemandLine(null, formData)).resolves.toMatchObject({
      ok: false,
      errors: { "line-0": "The window ends before it starts." },
    });
  });

  it("applies the same impossible-date guard to concierge demand entry", async () => {
    const formData = new FormData();
    formData.set("company_id", "company-1");
    formData.set("evidence_note", "Spoke to Alex at 10:00 AEST");
    formData.set("payload", JSON.stringify(demandPayload("2026-04-31", "2026-05-10")));

    await expect(conciergeCreateDemandRequest(null, formData)).resolves.toMatchObject({
      ok: false,
      errors: { "line-0": "Give valid start and end dates." },
    });
  });
});
