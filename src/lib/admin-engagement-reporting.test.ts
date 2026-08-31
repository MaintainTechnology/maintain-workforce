import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Engagement } from "./supabase/types";
import { GET } from "../app/(admin)/admin/engagements/export/route";
import {
  engagementExportHref,
  engagementPageHref,
  getAdminEngagement,
  listAdminEngagements,
  normalizeEngagementReportFilters,
  normalizeEngagementReportPage,
} from "./admin-engagement-reporting";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const blank = { status: "", timing: "", buyer: "", supplier: "", from: "", to: "" } as const;
type Row = Record<string, unknown>;
type Query = { table: string; params: URLSearchParams; offset: number; limit: number };

function engagement(index: number, overrides: Partial<Engagement> = {}): Engagement & Row {
  return {
    id: id(index), match_id: id(index + 10000), demand_line_id: id(80001),
    capacity_line_id: id(80002), buyer_company_id: id(80003), supplier_company_id: id(80004),
    trade_role_id: id(80005), proficiency_id: id(80006), work_region_id: id(80007),
    start_date: "2026-09-01", end_date: "2026-09-30", hours_per_week: 38,
    supplier_rate_cents: 5000, fee_bp: 500, fee_cents_per_hour: 250,
    buyer_rate_cents: 5250, expected_hours: 170, estimated_supplier_value_cents: 850000,
    estimated_maintain_revenue_cents: 42500, estimated_buyer_value_cents: 892500,
    status: "Confirmed", payment_status: "pre-authorised", external_payment_ref: "pay-1",
    commercial_confirmed_at: "2026-08-30T00:00:00Z", actual_hours: null,
    actual_value_cents: null, completed_at: null, dispute_notes: null, cancelled_by: null,
    cancel_reason: null, within_notice_window: null, created_at: "2026-08-30T00:00:00Z",
    buyer: { legal_name: "Buyer legal", trading_name: "Buyer" },
    supplier: [{ legal_name: "Supplier legal", trading_name: null }],
    trade: { name: "Carpenter" }, proficiency: [{ name: "Qualified" }],
    region: { name: "Brisbane" },
    ...overrides,
  };
}

/** Exercise the real PostgREST builder against deterministic paginated HTTP responses. */
function fixture(engagements: Row[], workers: Row[] = [], cap = 1000) {
  const events: string[] = [];
  const queries: Query[] = [];
  const state: { error?: { table: string; offset: number }; missingCount?: boolean } = {};
  const tables: Record<string, Row[]> = {
    engagement: engagements,
    engagement_worker: workers,
    company: [
      { id: id(80003), legal_name: "Buyer legal", trading_name: "Buyer" },
      { id: id(80004), legal_name: "Supplier legal", trading_name: null },
    ],
  };
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    const params = url.searchParams;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 1000);
    queries.push({ table, params, offset, limit });
    events.push(table);
    if (state.error?.table === table && state.error.offset === offset) {
      return new Response(JSON.stringify({ message: "fixture database failure", code: "XX001" }), {
        status: 500, headers: { "content-type": "application/json" },
      });
    }
    let rows = [...(tables[table] ?? [])];
    for (const [column, filter] of params) {
      if (["select", "order", "offset", "limit"].includes(column)) continue;
      const point = filter.indexOf(".");
      const op = filter.slice(0, point);
      const value = filter.slice(point + 1);
      rows = rows.filter((row) => {
        const actual = String(row[column]);
        if (op === "eq") return actual === value;
        if (op === "gt") return actual > value;
        if (op === "gte") return actual >= value;
        if (op === "lt") return actual < value;
        if (op === "lte") return actual <= value;
        if (op === "in") return value.slice(1, -1).split(",").includes(actual);
        throw new Error(`Unhandled fixture operator ${op}`);
      });
    }
    const ordering = (params.get("order") ?? "").split(",").filter(Boolean);
    rows.sort((a, b) => {
      for (const entry of ordering) {
        const [column, direction] = entry.split(".");
        const comparison = String(a[column]).localeCompare(String(b[column]));
        if (comparison) return direction === "desc" ? -comparison : comparison;
      }
      return 0;
    });
    const total = rows.length;
    const selected = (params.get("select") ?? "*").split(/,(?![^(]*\))/).map((field) => field.trim());
    const page = rows.slice(offset, offset + Math.min(cap, limit)).map((row) => {
      if (selected.includes("*")) return row;
      return Object.fromEntries(selected.map((field) => {
        const key = field.split(":")[0];
        return [key, row[key]];
      }));
    });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!state.missingCount) headers["content-range"] = `${offset}-${offset + page.length - 1}/${total}`;
    return new Response(JSON.stringify(page), { headers });
  };
  const client = createClient("https://report.example.test", "fixture-service-role", {
    auth: { persistSession: false }, global: { fetch: fetcher },
  });
  mocks.auth.mockImplementation(async () => { events.push("auth"); return { id: "admin" }; });
  mocks.admin.mockImplementation(() => { events.push("client"); return client; });
  return { events, queries, state, tables };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-31T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Engagement report filters", () => {
  it("normalizes record and URL filters identically without treating upcoming as a status", () => {
    const params = { status: "Confirmed", timing: "upcoming", buyer: id(80003).toUpperCase(),
      supplier: id(80004), from: "2026-08-01", to: "2026-10-01" };
    const filters = normalizeEngagementReportFilters(params);
    expect(filters).toEqual({ ...params, buyer: id(80003) });
    expect(normalizeEngagementReportFilters(new URLSearchParams(params))).toEqual(filters);
    expect(() => normalizeEngagementReportFilters({ status: "upcoming" })).toThrow(/status/i);
  });

  it("rejects invalid dates, inverted windows, invalid UUIDs and ambiguous duplicate filters", () => {
    for (const params of [
      { from: "2026-02-30" }, { from: "2026-09-02", to: "2026-09-01" },
      { buyer: "not-a-company" }, { timing: "future" }, { status: ["Active", "Completed"] },
      new URLSearchParams("status=Active&status=Completed"),
    ]) expect(() => normalizeEngagementReportFilters(params)).toThrow();
  });

  it("preserves every filter in list links and excludes pagination from downloads", () => {
    const filters = normalizeEngagementReportFilters({ status: "Confirmed", timing: "upcoming",
      buyer: id(80003), supplier: id(80004), from: "2026-08-01", to: "2026-10-01" });
    const page = new URL(engagementPageHref(filters, 3), "https://app.example.test");
    const download = new URL(engagementExportHref(filters), page);
    expect(page.searchParams.get("page")).toBe("3");
    page.searchParams.delete("page");
    expect(download.search).toBe(page.search);
    expect(normalizeEngagementReportPage({ page: "3" })).toBe(3);
    expect(() => normalizeEngagementReportPage({ page: "1.5" })).toThrow(/page/i);
  });
});

describe("auth-gated shared Engagement report loaders", () => {
  it("authorizes every list and detail read before creating a service-role client", async () => {
    const data = fixture([engagement(1)]);
    await listAdminEngagements(blank, { kind: "page", page: 1 });
    expect(data.events.slice(0, 2)).toEqual(["auth", "client"]);
    mocks.admin.mockClear();
    mocks.auth.mockRejectedValue(new Error("unauthorized"));
    await expect(listAdminEngagements(blank, { kind: "all" })).rejects.toThrow("unauthorized");
    await expect(getAdminEngagement(id(1))).rejects.toThrow("unauthorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("applies the same full filter set to list and export, including date-window intersection", async () => {
    fixture([
      engagement(1), engagement(2, { status: "Active" }),
      engagement(3, { buyer_company_id: id(999) }),
      engagement(4, { supplier_company_id: id(999) }),
      engagement(5, { end_date: "2026-09-02" }),
      engagement(6, { start_date: "2026-10-01", end_date: "2026-10-31" }),
    ]);
    const filters = normalizeEngagementReportFilters({ status: "Confirmed", timing: "upcoming",
      buyer: id(80003), supplier: id(80004), from: "2026-09-15", to: "2026-09-20" });
    const page = await listAdminEngagements(filters, { kind: "page", page: 1 });
    const all = await listAdminEngagements(filters, { kind: "all" });
    expect(page.rows.map((row) => row.id)).toEqual([id(1)]);
    expect(all.rows).toEqual(page.rows);
    expect(all.rows[0]).toMatchObject({ buyer_company_name: "Buyer", supplier_company_name: "Supplier legal",
      trade_role_name: "Carpenter", proficiency_name: "Qualified", work_region_name: "Brisbane", upcoming: true });
    expect(Object.keys(all.rows[0])).toEqual(expect.arrayContaining(Object.keys(engagement(1)).filter(
      (field) => !["buyer", "supplier", "trade", "proficiency", "region"].includes(field),
    )));
  });

  it("derives Overdue at Brisbane midnight and keeps future Confirmed separate", async () => {
    vi.setSystemTime(new Date("2026-08-30T14:00:00Z"));
    fixture([
      engagement(1, { status: "Awaiting Commercial", start_date: "2026-08-31", commercial_confirmed_at: null }),
      engagement(2, { status: "Awaiting Commercial", start_date: "2026-09-01", commercial_confirmed_at: null }),
      engagement(3, { start_date: "2026-08-31" }), engagement(4),
    ]);
    const overdue = await listAdminEngagements({ ...blank, timing: "overdue" }, { kind: "all" });
    const upcoming = await listAdminEngagements({ ...blank, timing: "upcoming" }, { kind: "all" });
    expect(overdue.rows.map((row) => row.id)).toEqual([id(1)]);
    expect(overdue.rows[0].overdue).toBe(true);
    expect(upcoming.rows.map((row) => row.id)).toEqual([id(4)]);
  });

  it("paginates 100-row lists explicitly and exports all 1,205 stable rows in <=500 ranges", async () => {
    const data = fixture(Array.from({ length: 1205 }, (_, i) => engagement(i + 1)).reverse());
    const page = await listAdminEngagements(blank, { kind: "page", page: 2 });
    expect(page.rows.map((row) => row.id)).toEqual(Array.from({ length: 100 }, (_, i) => id(i + 101)));
    expect(page.pagination).toMatchObject({ page: 2, pageSize: 100, total: 1205, hasPrevious: true, hasNext: true });
    data.queries.length = 0;
    const all = await listAdminEngagements(blank, { kind: "all" });
    expect(all.rows).toHaveLength(1205);
    const ranges = data.queries.filter((query) => query.table === "engagement");
    expect(ranges.map((query) => [query.offset, query.limit])).toEqual([[0, 500], [500, 500], [1000, 500]]);
    expect(ranges.every((query) => query.params.get("order") === "start_date.asc,id.asc")).toBe(true);
  });

  it("continues to the exact count when the server returns less than the requested batch", async () => {
    fixture(Array.from({ length: 605 }, (_, i) => engagement(i + 1)), [], 200);
    const all = await listAdminEngagements(blank, { kind: "all" });
    expect(all.rows).toHaveLength(605);
    expect(all.rows.at(-1)?.id).toBe(id(605));
  });

  it("batches worker counts and pages through >1,000 child rows without N+1 reads", async () => {
    const data = fixture(Array.from({ length: 205 }, (_, i) => engagement(i + 1)), [
      ...Array.from({ length: 1205 }, (_, i) => ({ id: id(i + 30000), engagement_id: id(1) })),
      { id: id(40000), engagement_id: id(205) },
    ]);
    const all = await listAdminEngagements(blank, { kind: "all" });
    expect(all.rows[0].worker_count).toBe(1205);
    expect(all.rows[1].worker_count).toBe(0);
    expect(all.rows.at(-1)?.worker_count).toBe(1);
    const workerQueries = data.queries.filter((query) => query.table === "engagement_worker");
    expect(workerQueries).toHaveLength(5);
    expect(workerQueries.every((query) => query.limit <= 500)).toBe(true);
    expect(workerQueries.every((query) => query.params.get("engagement_id")!.slice(4, -1).split(",").length <= 100)).toBe(true);
  });

  it("fetches a detail by exact id rather than loading the register and finding a row", async () => {
    const data = fixture(Array.from({ length: 1205 }, (_, i) => engagement(i + 1)));
    const result = await getAdminEngagement(id(1205));
    expect(result?.id).toBe(id(1205));
    const reads = data.queries.filter((query) => query.table === "engagement");
    expect(reads).toHaveLength(1);
    expect(reads[0].params.get("id")).toBe(`eq.${id(1205)}`);
    expect(await getAdminEngagement(id(9999))).toBeNull();
  });

  it("batches and pages compliance warnings without changing a committing status", async () => {
    const data = fixture(Array.from({ length: 205 }, (_, i) => engagement(i + 1)));
    data.tables.engagement_compliance_review = [
      ...Array.from({ length: 1205 }, (_, i) => ({
        engagement_id: id(1), source_type: "worker", source_id: id(40000 + i),
        reason: "A nominated worker is inactive or has an expired required qualification.",
      })),
      { engagement_id: id(205), source_type: "company", source_id: id(80003),
        reason: "A party is inactive or has an expired mandatory company document." },
    ];
    const report = await listAdminEngagements(blank, { kind: "all" });
    expect(report.rows[0].compliance_review_count).toBe(1205);
    expect(report.rows[0].status).toBe("Confirmed");
    expect(report.rows.at(-1)?.compliance_review_count).toBe(1);
    const queries = data.queries.filter((query) => query.table === "engagement_compliance_review");
    expect(queries).toHaveLength(5);
    expect(queries.every((query) => query.limit <= 500)).toBe(true);
    expect(queries.every((query) => query.params.get("engagement_id")!.slice(4, -1).split(",").length <= 100)).toBe(true);
    expect(queries.every((query) => query.params.get("order") === "engagement_id.asc,source_type.asc,source_id.asc")).toBe(true);
  });

  it("loads compliance reason/source details fresh so renewal clears the warning without cancellation", async () => {
    const data = fixture([engagement(1, { status: "Active" })]);
    const issue = { source_type: "company", source_id: id(80003), reason: "Expired mandatory company document." };
    data.tables.engagement_compliance_review = [{ engagement_id: id(1), ...issue }];
    const flagged = await getAdminEngagement(id(1));
    expect(flagged?.compliance_issues).toEqual([issue]);
    expect(flagged?.compliance_review_count).toBe(1);
    data.tables.engagement_compliance_review = [];
    const renewed = await getAdminEngagement(id(1));
    expect(renewed?.compliance_issues).toEqual([]);
    expect(renewed?.compliance_review_count).toBe(0);
    expect(renewed?.status).toBe("Active");
  });

  it("does not silently hide compliance warnings when the view query fails", async () => {
    const data = fixture([engagement(1)]);
    data.state.error = { table: "engagement_compliance_review", offset: 0 };
    await expect(listAdminEngagements(blank, { kind: "page", page: 1 })).rejects.toThrow(/compliance/i);
    await expect(getAdminEngagement(id(1))).rejects.toThrow(/compliance/i);
  });

  it("fails closed on a later export page, child failure, or missing exact count", async () => {
    const data = fixture(Array.from({ length: 605 }, (_, i) => engagement(i + 1)));
    data.state.error = { table: "engagement", offset: 500 };
    await expect(listAdminEngagements(blank, { kind: "all" })).rejects.toThrow(/report/i);
    data.state.error = { table: "engagement_worker", offset: 0 };
    await expect(listAdminEngagements(blank, { kind: "page", page: 1 })).rejects.toThrow(/report/i);
    data.state.error = undefined;
    data.state.missingCount = true;
    await expect(listAdminEngagements(blank, { kind: "all" })).rejects.toThrow(/count/i);
  });
});

describe("filtered Engagement CSV route", () => {
  it("downloads all matching rows beyond 1,000 and does not export just the list page", async () => {
    const data = fixture([
      ...Array.from({ length: 1205 }, (_, i) => engagement(i + 1)),
      engagement(2000, { status: "Active" }),
    ]);
    const response = await GET(new Request("https://app.example.test/admin/engagements/export?status=Confirmed&timing=upcoming&page=2"));
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(csv.split("\r\n")).toHaveLength(1207);
    expect(csv).toContain(`"${id(1205)}"`);
    expect(csv).not.toContain(`"${id(2000)}"`);
    expect(data.events.indexOf("auth")).toBeLessThan(data.events.indexOf("client"));
  });

  it("does not mask failed authorization or return partial CSV after a query failure", async () => {
    const data = fixture(Array.from({ length: 605 }, (_, i) => engagement(i + 1)));
    data.state.error = { table: "engagement", offset: 500 };
    const failed = await GET(new Request("https://app.example.test/admin/engagements/export"));
    expect(failed.status).toBe(503);
    expect(failed.headers.get("content-type")).not.toContain("text/csv");
    mocks.auth.mockRejectedValue(new Error("unauthorized"));
    mocks.admin.mockClear();
    await expect(GET(new Request("https://app.example.test/admin/engagements/export"))).rejects.toThrow("unauthorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("returns an explicit 400 rather than silently exporting an invalid filter", async () => {
    const data = fixture([engagement(1)]);
    const response = await GET(new Request("https://app.example.test/admin/engagements/export?from=2026-02-30"));
    expect(response.status).toBe(400);
    expect(data.queries).toHaveLength(0);
  });
});
