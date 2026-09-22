import { createClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeEngagementReportFilters } from "./admin-engagement-reporting";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

const MarketplaceDashboard = (await import("../app/(admin)/admin/page")).default;
const today = "2026-09-09";
const aggregateTables = ["capacity_line", "demand_line", "match", "engagement"] as const;
const allTables = [...aggregateTables, "company", "worker"] as const;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
type Row = Record<string, unknown>;
type Query = { table: string; method: string; params: URLSearchParams; offset: number; limit: number; counted: boolean };
type Reply = { count?: number | null; data?: Row[]; error?: boolean };

/** Exercise the real query builder, range parameters, and count-header parser;
 *  only the database HTTP boundary and the authenticated session are replaced. */
function fixture(cap = 200) {
  const tables: Record<string, Row[]> = {};
  const queries: Query[] = [];
  const state: { reply?: (query: Query, total: number) => Reply } = {};
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.split("/").at(-1)!;
    const params = url.searchParams;
    const method = init?.method ?? "GET";
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 1000);
    const counted = new Headers(init?.headers).get("prefer")?.includes("count=exact") ?? false;
    const query = { table, method, params, offset, limit, counted };
    queries.push(query);
    let rows = [...(tables[table] ?? [])];
    for (const [column, filter] of params) {
      if (["select", "order", "offset", "limit"].includes(column)) continue;
      const point = filter.indexOf(".");
      const operator = filter.slice(0, point);
      const value = filter.slice(point + 1);
      rows = rows.filter((row) => {
        if (operator === "eq") return String(row[column]) === value;
        if (operator === "in") return value.slice(1, -1).split(",").map((entry) => entry.replaceAll('"', "")).includes(String(row[column]));
        throw new Error(`Unsupported marketplace fixture filter: ${operator}`);
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
    const fields = (params.get("select") ?? "*").split(/,(?![^(]*\))/).map((field) => field.trim());
    const page = rows.slice(offset, offset + Math.min(cap, limit)).map((row) => {
      if (fields.includes("*")) return row;
      return Object.fromEntries(fields.map((field) => {
        const key = field.split("(")[0].trim().split(":")[0];
        return [key, row[key]];
      }));
    });
    const reply = state.reply?.(query, total) ?? {};
    if (reply.error) {
      return new Response(method === "HEAD" ? null : JSON.stringify({ code: "42501", message: "Fixture read failed" }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    }
    const count = reply.count === undefined ? total : reply.count;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (counted && count !== null) headers["content-range"] = `${offset}-${offset + page.length - 1}/${count}`;
    return new Response(method === "HEAD" ? null : JSON.stringify(reply.data ?? page), { headers });
  };
  mocks.admin.mockReturnValue(createClient("https://marketplace.example.test", "fixture-service-role", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  }));
  return { tables, queries, state };
}

function metric(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const result = html.match(new RegExp(`<p\\b[^>]*>${escaped}</p>\\s*<p\\b[^>]*>([^<]+)</p>`));
  expect(result, `Missing visible metric: ${label}`).not.toBeNull();
  return result![1];
}

function engagement(index: number, overrides: Row = {}): Row {
  return {
    id: id(index), status: "Completed", demand_line_id: id(index), start_date: today, end_date: today,
    estimated_buyer_value_cents: 10001, estimated_maintain_revenue_cents: 2001,
    engagement_worker: [], ...overrides,
  };
}

let db: ReturnType<typeof fixture>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The UTC date is still 8 September; operational timing must use Brisbane's 9th.
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  mocks.auth.mockResolvedValue({ user: { id: "user_MaintainAdmin" } });
  db = fixture();
});
afterEach(() => vi.useRealTimers());

describe("MVP 14.2 marketplace totals", () => {
  it("aggregates every counted page beyond 1,000 rows under a 200-row API cap", async () => {
    const indexes = Array.from({ length: 1205 }, (_, index) => index + 1).reverse();
    db.tables.capacity_line = indexes.map((index) => ({
      id: id(index), status: "Open", available_from: today, available_until: today,
      hours_per_week: 40, capacity_line_worker: [{ worker_id: `available-${index}` }],
    }));
    db.tables.capacity_line.push({ id: id(9999), status: "Withdrawn" });
    db.tables.demand_line = indexes.map((index) => ({
      id: id(index), status: "Open", quantity: 2, hours_per_week: 30, start_date: today, end_date: today,
    }));
    db.tables.demand_line.push({ id: id(9999), status: "Filled" });
    db.tables.match = indexes.map((index) => ({ id: id(index), status: "Awaiting Supplier", demand_line: { status: "Open" } }));
    db.tables.engagement = indexes.map((index) => engagement(index, { status: index === 1205 ? "Cancelled" : "Completed" }));
    db.tables.company = Array.from({ length: 200 }, (_, index) => ({ id: id(index + 1), status: "Active" }));
    db.tables.company.push({ id: id(9999), status: "Suspended" });
    db.tables.company.push(...indexes.map((index) => ({ id: id(2000 + index), status: "Pending" })));
    db.tables.worker = Array.from({ length: 1500 }, (_, index) => ({ id: id(index + 1) }));

    const html = renderToStaticMarkup(await MarketplaceDashboard());
    for (const [label, value] of Object.entries({
      "Available crew": "1205", "Available hours": "48200", "Upcoming capacity": "0",
      "Open requirements": "1205", "Crew required": "2410", "Hours required": "72300", "Unfilled demand": "2410",
      "Awaiting supplier": "1205", "Completed": "1204", "Active companies": "200", "Crew on the platform": "1500",
      "Account approvals": "1205",
      "Estimated transaction value": "$120,412.04 ex GST", "Estimated Maintain revenue": "$24,092.04 ex GST",
    })) expect(metric(html, label)).toBe(value);

    for (const table of aggregateTables) {
      const reads = db.queries.filter((query) => query.table === table);
      expect(reads.map(({ offset }) => offset)).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
      expect(reads.every(({ limit, params, counted, method }) => limit === 500 && params.get("order") === "id.asc" && counted && method === "GET")).toBe(true);
    }
    for (const table of ["company", "worker"]) {
      const reads = db.queries.filter((query) => query.table === table);
      expect(reads).toHaveLength(table === "company" ? 2 : 1);
      expect(reads.every((read) => read.method === "HEAD" && read.counted)).toBe(true);
    }
    expect(db.queries.find(({ table }) => table === "company")?.params.get("status")).toBe("eq.Active");
    expect(db.queries.filter(({ table }) => table === "company").map(({ params }) => params.get("status")))
      .toEqual(["eq.Active", "eq.Pending"]);
  });

  it("uses Brisbane dates and links timing subsets separately from engagement statuses", async () => {
    db.tables.engagement = [
      engagement(1, { status: "Awaiting Commercial", start_date: "2026-09-10", end_date: "2026-09-12" }),
      engagement(2, { status: "Awaiting Commercial" }),
      engagement(3, { status: "Awaiting Commercial", start_date: "2026-09-08" }),
      engagement(4, { status: "Confirmed", start_date: "2026-09-10", end_date: "2026-09-12" }),
      engagement(5, { status: "Confirmed" }), engagement(6, { status: "Active" }),
      engagement(7, { start_date: "2026-09-07", end_date: "2026-09-08" }),
      engagement(8, { status: "Cancelled", start_date: "2026-09-08" }),
    ];
    const html = renderToStaticMarkup(await MarketplaceDashboard());
    const expected = [
      ["Awaiting commercial", "3", "Awaiting Commercial", ""], ["Overdue", "2", "", "overdue"],
      ["Confirmed", "2", "Confirmed", ""], ["Upcoming", "1", "", "upcoming"],
      ["Active", "1", "Active", ""], ["Completed", "1", "Completed", ""],
    ];
    for (const [label, value, status, timing] of expected) {
      expect(metric(html, label)).toBe(value);
      const anchor = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find((match) => match[2].includes(`>${label}</p>`));
      expect(anchor, `Missing linked metric: ${label}`).toBeDefined();
      const href = anchor![1].match(/href="([^"]+)"/)![1];
      const destination = new URL(href.replaceAll("&amp;", "&"), "https://marketplace.example.test");
      expect(destination.pathname).toBe("/admin/engagements");
      expect(normalizeEngagementReportFilters(destination.searchParams)).toMatchObject({ status, timing });
    }
  });

  it("preserves verified empty results as true zeroes", async () => {
    const html = renderToStaticMarkup(await MarketplaceDashboard());
    for (const label of ["Available crew", "Open requirements", "Awaiting supplier", "Overdue", "Active companies", "Crew on the platform", "Account approvals"]) {
      expect(metric(html, label)).toBe("0");
    }
    expect(metric(html, "Estimated transaction value")).toBe("$0.00 ex GST");
    expect(db.queries).toHaveLength(7);
  });

  it("prioritizes overdue work before approvals, then offers matching when those queues are clear", async () => {
    db.tables.company = [
      { id: id(1), status: "Pending" },
      { id: id(2), status: "Active" },
      { id: id(3), status: "Rejected" },
    ];
    db.tables.engagement = [engagement(1, { status: "Awaiting Commercial" })];
    const overdueHtml = renderToStaticMarkup(await MarketplaceDashboard());
    expect(metric(overdueHtml, "Account approvals")).toBe("1");
    expect(metric(overdueHtml, "Commercial overdue")).toBe("1");
    expect(overdueHtml.match(/<header\b[\s\S]*?<\/header>/)?.[0]).toContain("Review overdue work");

    db.tables.engagement = [];
    const approvalsHtml = renderToStaticMarkup(await MarketplaceDashboard());
    expect(approvalsHtml.match(/<header\b[\s\S]*?<\/header>/)?.[0]).toContain("Review account approvals");

    db.tables.company = [{ id: id(2), status: "Active" }];
    const clearHtml = renderToStaticMarkup(await MarketplaceDashboard());
    expect(clearHtml.match(/<header\b[\s\S]*?<\/header>/)?.[0]).toContain("Open matching");
    expect(clearHtml).toContain("No companies waiting for approval.");
  });

  it("requires admin authorization before opening the service client", async () => {
    mocks.auth.mockRejectedValue(new Error("Admin MFA required"));
    await expect(MarketplaceDashboard()).rejects.toThrow("Admin MFA required");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(db.queries).toEqual([]);
  });
});

describe("marketplace read failures", () => {
  it.each(["error", "missing count"])("rejects an approvals-only %s instead of showing a cleared queue", async (failure) => {
    db.state.reply = (query) => query.table === "company" && query.params.get("status") === "eq.Pending"
      ? failure === "error" ? { error: true } : { count: null }
      : {};
    await expect(MarketplaceDashboard()).rejects.toThrow(/totals could not be loaded/i);
  });

  it.each(allTables)("rejects a failed %s read instead of displaying a false zero", async (table) => {
    db.state.reply = (query) => ({ error: query.table === table });
    await expect(MarketplaceDashboard()).rejects.toThrow(/query failed|totals could not be loaded/i);
  });

  it.each(allTables)("rejects %s responses without the promised exact count", async (table) => {
    db.state.reply = (query) => query.table === table ? { count: null } : {};
    await expect(MarketplaceDashboard()).rejects.toThrow(/exact count|totals could not be loaded/i);
  });

  it.each(aggregateTables)("rejects a later %s page failure instead of publishing partial totals", async (table) => {
    db.tables[table] = Array.from({ length: 201 }, (_, index) => ({ id: id(index + 1), status: "Open" }));
    db.state.reply = (query) => ({ error: query.table === table && query.offset === 200 });
    await expect(MarketplaceDashboard()).rejects.toThrow(/query failed/i);
    expect(db.queries.filter((query) => query.table === table).map(({ offset }) => offset)).toEqual([0, 200]);
  });

  it("rejects a changing engagement count during pagination", async () => {
    db.tables.engagement = Array.from({ length: 201 }, (_, index) => engagement(index + 1));
    db.state.reply = (query, total) => query.table === "engagement" && query.offset === 200 ? { count: total + 1 } : {};
    await expect(MarketplaceDashboard()).rejects.toThrow(/changed while loading/i);
  });
});
