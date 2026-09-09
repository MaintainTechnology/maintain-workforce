import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  failingTable: "",
  companyStatus: "Active",
}));
vi.mock("@/lib/auth", () => ({
  requireCompanyAdmin: async () => ({ companyId: "company", companyStatus: state.companyStatus }),
}));
vi.mock("@/lib/config", () => ({ getBookingRules: async () => ({ minimumCrewSize: 1, minimumHoursPerLine: 1 }) }));
vi.mock("@/lib/rates", () => ({
  supplierBand: async () => null, indicativeRange: async () => null,
  supplierBandMap: async () => ({}), indicativeRangeMap: async () => ({}),
}));
vi.mock("@/lib/actions/capacity", () => ({ withdrawCapacityLine: vi.fn() }));
vi.mock("@/lib/actions/demand", () => ({ withdrawDemandLine: vi.fn() }));
vi.mock("@/app/(app)/app/capacity/capacity-form", () => ({ CapacityForm: () => createElement("div", null, "Capacity editor") }));
vi.mock("@/app/(app)/app/demand/demand-form", () => ({ DemandForm: () => createElement("div", null, "Requirement editor") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database() }));

function database() {
  return { from: (table: string) => {
    const result = () => state.failingTable === table
      ? { data: null, error: { message: "Connection unavailable" } }
      : { data: state.tables[table] ?? [], error: null };
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query,
      maybeSingle: async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null }; },
      then: <T>(resolve: (response: ReturnType<typeof result>) => T) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } };
}

const CapacityPage = (await import("@/app/(app)/app/capacity/page")).default;
const DemandPage = (await import("@/app/(app)/app/demand/page")).default;
const CapacityDetail = (await import("@/app/(app)/app/capacity/[id]/page")).default;
const DemandDetail = (await import("@/app/(app)/app/demand/[id]/page")).default;
const NewCapacity = (await import("@/app/(app)/app/capacity/new/page")).default;
const NewDemand = (await import("@/app/(app)/app/demand/new/page")).default;
const detailParams = () => ({ params: Promise.resolve({ id: "line" }) });

beforeEach(() => {
  state.failingTable = "";
  state.companyStatus = "Active";
  state.tables = {
    capacity_line: [{ id: "line", trade_role_id: "trade", proficiency_id: "level", location_region_id: "region",
      available_from: "2026-10-01", available_until: "2026-10-07", hours_per_week: 40,
      supplier_rate_cents: 5000, status: "Open", capacity_line_worker: [{ worker_id: "worker" }] }],
    demand_line: [{ id: "line", trade_role_id: "trade", proficiency_id: "level", quantity: 2,
      start_date: "2026-10-01", end_date: "2026-10-07", hours_per_week: 40, status: "Open",
      request: { name: "Shutdown", work_region_id: "region", region: { name: "Perth" } } }],
  };
});

describe("company capacity and requirement read states", () => {
  it.each([
    ["capacity list", "capacity_line", () => CapacityPage()],
    ["capacity counts", "engagement_worker", () => CapacityPage()],
    ["requirement list", "demand_line", () => DemandPage()],
    ["requirement counts", "engagement_worker", () => DemandPage()],
    ["capacity detail", "capacity_line", () => CapacityDetail(detailParams())],
    ["capacity commitments", "engagement_worker", () => CapacityDetail(detailParams())],
    ["capacity match lock", "supplier_match_view", () => CapacityDetail(detailParams())],
    ["capacity crew", "worker", () => CapacityDetail(detailParams())],
    ["capacity regions", "region", () => CapacityDetail(detailParams())],
    ["requirement detail", "demand_line", () => DemandDetail(detailParams())],
    ["requirement commitments", "engagement_worker", () => DemandDetail(detailParams())],
    ["requirement match lock", "match", () => DemandDetail(detailParams())],
    ["requirement skills", "skill", () => DemandDetail(detailParams())],
    ["requirement qualifications", "qualification", () => DemandDetail(detailParams())],
    ["new capacity crew", "worker", () => NewCapacity()],
    ["new capacity regions", "region", () => NewCapacity()],
    ["new requirement industries", "industry", () => NewDemand()],
    ["new requirement regions", "region", () => NewDemand()],
    ["new requirement trades", "trade_role", () => NewDemand()],
    ["new requirement levels", "trade_role_proficiency", () => NewDemand()],
    ["new requirement skills", "skill", () => NewDemand()],
    ["new requirement qualifications", "qualification", () => NewDemand()],
  ] as const)("fails visibly when %s cannot load", async (_label, table, page) => {
    state.failingTable = table;
    await expect(page()).rejects.toThrow("could not be loaded");
  });

  it("keeps valid empty list states distinct from failed reads", async () => {
    state.tables.capacity_line = [];
    state.tables.demand_line = [];
    expect(renderToStaticMarkup(await CapacityPage())).toContain("No capacity listed yet");
    expect(renderToStaticMarkup(await DemandPage())).toContain("No requirements posted yet");
  });

  it("counts an inclusive-window commitment without treating a later engagement as committed", async () => {
    state.tables.engagement_worker = [{ worker_id: "worker", engagement: { start_date: "2026-10-07", end_date: "2026-10-14" } }];
    expect(renderToStaticMarkup(await CapacityPage())).toContain("Fully Committed");
    state.tables.engagement_worker = [{ worker_id: "worker", engagement: { start_date: "2026-10-08", end_date: "2026-10-14" } }];
    expect(renderToStaticMarkup(await CapacityPage())).not.toContain("Fully Committed");
  });

  it("counts sequential engagements for one worker as one filled slot", async () => {
    state.tables.engagement_worker = [
      { worker_id: "worker", engagement: { demand_line_id: "line" } },
      { worker_id: "worker", engagement: { demand_line_id: "line" } },
    ];
    const html = renderToStaticMarkup(await DemandPage());
    expect(html).toContain("1 of 2");
    expect(html).toContain("Partially Filled");
  });

  it("keeps a requirement locked while an open match exists even with zero current nominations", async () => {
    state.tables.match = [{ id: "match", status: "Awaiting Buyer", requested_quantity: 1, match_worker: [] }];
    const html = renderToStaticMarkup(await DemandDetail(detailParams()));
    expect(html).toContain("Maintain has a proposal in progress");
    expect(html).not.toContain("Requirement editor");
    expect(html).not.toContain("Withdraw this line");
  });

  it("offers editing after the final open proposal is resolved", async () => {
    const html = renderToStaticMarkup(await DemandDetail(detailParams()));
    expect(html).toContain("Requirement editor");
    expect(html).toContain("Withdraw this line");
  });
});
