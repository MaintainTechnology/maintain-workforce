import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyStatus } from "./supabase/types";
import { isWorkspaceDestinationActive, workspaceDestination } from "./workspace-navigation";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCompanyAdmin: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.tenant }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

const CompanyDashboard = (await import("../app/(app)/app/page")).default;
const companyId = "11111111-1111-4111-8111-111111111111";
const today = "2026-09-09";
type Row = Record<string, unknown>;
type RequestLog = { table: string; client: "tenant" | "service"; method: string; query: URLSearchParams };

/** Keep the real PostgREST query builder; only external HTTP and session lookup are replaced. */
function database() {
  const tables: Record<string, Row[]> = {};
  const requests: RequestLog[] = [];
  const failed = new Set<string>();

  function client(kind: "tenant" | "service") {
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const table = url.pathname.split("/").at(-1)!;
      const method = init?.method ?? "GET";
      requests.push({ table, client: kind, method, query: url.searchParams });
      if (failed.has(table)) {
        return Response.json({ code: "42501", message: "Fixture read unavailable" }, { status: 403 });
      }
      let rows = tables[table] ?? [];
      for (const [column, filter] of url.searchParams) {
        if (column === "select") continue;
        const point = filter.indexOf(".");
        const operator = filter.slice(0, point);
        const value = filter.slice(point + 1);
        rows = rows.filter((row) => {
          if (operator === "is") return value === "null" && row[column] === null;
          const actual = String(row[column]);
          if (operator === "eq") return actual === value;
          if (operator === "lte") return actual <= value;
          if (operator === "gte") return actual >= value;
          if (operator === "in") return value.slice(1, -1).split(",").map((part) => part.replaceAll('"', "")).includes(actual);
          throw new Error(`Unexpected dashboard filter: ${operator}`);
        });
      }
      return new Response(method === "HEAD" ? null : JSON.stringify(rows), {
        headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
      });
    };
    return createSupabaseClient("https://dashboard.example.test", `fixture-${kind}`, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    });
  }

  mocks.tenant.mockResolvedValue(client("tenant"));
  mocks.admin.mockReturnValue(client("service"));
  return { tables, requests, failed };
}

function company(status: CompanyStatus) {
  mocks.auth.mockResolvedValue({
    user: { id: "user_CompanyAdmin", email: "operator@example.test" }, companyId, companyStatus: status,
  });
}

function hrefs(html: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
}

let db: ReturnType<typeof database>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The UTC date is still 8 September; the dashboard must use Brisbane's 9 September.
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  company("Active");
  db = database();
});
afterEach(() => vi.useRealTimers());

describe("company dashboard operational metrics", () => {
  it("counts distinct current workers, subtracts commitments, and keeps every read in its permitted scope", async () => {
    db.tables.worker_employment = [
      ...Array.from({ length: 8 }, (_, index) => ({ id: `employment-${index}`, company_id: companyId, end_date: null })),
      { id: "past-employment", company_id: companyId, end_date: "2026-09-08" },
      { id: "other-employment", company_id: "other-company", end_date: null },
    ];
    const capacity = (id: string, workers: string[], overrides: Row = {}) => ({
      id, company_id: companyId, status: "Open", available_from: today, available_until: today,
      capacity_line_worker: workers.map((worker_id) => ({ worker_id })), ...overrides,
    });
    db.tables.capacity_line = [
      capacity("first", ["worker-one", "worker-two", "worker-three"]),
      capacity("duplicate", ["worker-two", "worker-three", "worker-four"], { status: "Partially Committed" }),
      capacity("other", ["foreign-worker"], { company_id: "other-company" }),
      capacity("future", ["future-worker"], { available_from: "2026-09-10", available_until: "2026-09-12" }),
      capacity("past", ["past-worker"], { available_from: "2026-09-01", available_until: "2026-09-08" }),
      capacity("withdrawn", ["withdrawn-worker"], { status: "Withdrawn" }),
    ];
    const engagement = (id: string, workers: string[], overrides: Row = {}) => ({
      id, supplier_company_id: companyId, status: "Active", start_date: today, end_date: today,
      engagement_worker: workers.map((worker_id) => ({ worker_id })), ...overrides,
    });
    db.tables.engagement = [
      engagement("current", ["worker-one", "worker-five"]),
      engagement("duplicate", ["worker-one"], { status: "Awaiting Commercial" }),
      engagement("other", ["worker-two"], { supplier_company_id: "other-company" }),
      engagement("finished", ["worker-three"], { status: "Completed" }),
      engagement("future", ["worker-three"], { start_date: "2026-09-10", end_date: "2026-09-12" }),
      engagement("past", ["worker-four"], { start_date: "2026-09-01", end_date: "2026-09-08" }),
    ];
    db.tables.demand_line = ["Open", "Partially Filled", "Filled"].map((status) => ({ id: status, company_id: companyId, status }));
    db.tables.demand_line.push({ id: "foreign-demand", company_id: "other-company", status: "Open" });
    db.tables.supplier_match_view = ["Awaiting Supplier", "Awaiting Supplier", "Awaiting Buyer"].map((status) => ({ status }));
    db.tables.buyer_match_view = ["Awaiting Buyer", "Awaiting Supplier"].map((status) => ({ status }));
    db.tables.buyer_engagement_view = ["Awaiting Commercial", "Confirmed", "Active", "Completed"].map((status) => ({ status }));
    db.tables.supplier_engagement_view = ["Confirmed", "Cancelled"].map((status) => ({ status }));

    const tree = await CompanyDashboard();
    expect(tree.props).toMatchObject({ companyStatus: "Active", today, metrics: {
      crew: 8, available: 3, deployed: 2, requirements: 2, decisions: 3, engagements: 4,
    } });
    const serviceReads = db.requests.filter((request) => request.client === "service");
    expect(serviceReads).toHaveLength(1);
    expect(serviceReads[0].table).toBe("engagement");
    expect(serviceReads[0].query.get("supplier_company_id")).toBe(`eq.${companyId}`);
    expect(serviceReads[0].query.get("start_date")).toBe(`lte.${today}`);
    expect(serviceReads[0].query.get("end_date")).toBe(`gte.${today}`);
    expect(db.requests.filter((request) => request.client === "tenant").map((request) => request.table).sort()).toEqual([
      "buyer_engagement_view", "buyer_match_view", "capacity_line", "demand_line",
      "supplier_engagement_view", "supplier_match_view", "worker_employment",
    ]);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("09/09/2026");
    expect(html).not.toContain("worker-one");
    expect(html).not.toContain("foreign-worker");
  });

  it.each([
    ["worker_employment", ["crew"]],
    ["capacity_line", ["available"]],
    ["engagement", ["available", "deployed"]],
    ["demand_line", ["requirements"]],
    ["supplier_match_view", ["decisions"]],
    ["buyer_match_view", ["decisions"]],
    ["buyer_engagement_view", ["engagements"]],
    ["supplier_engagement_view", ["engagements"]],
  ] as const)("shows unavailable figures when %s fails instead of treating failure as no work", async (table, unavailable) => {
    db.failed.add(table);
    const tree = await CompanyDashboard();
    const expected: Record<string, number | null> = { crew: 0, available: 0, deployed: 0, requirements: 0, decisions: 0, engagements: 0 };
    for (const key of unavailable) expected[key] = null;
    expect(tree.props).toMatchObject({ metrics: expected });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Unavailable");
    if (unavailable.some((key) => key === "decisions")) {
      expect(html).not.toMatch(/all clear|all caught up|no (?:decisions|proposed matches)|nothing (?:needs|is waiting)/i);
    }
  });

  it("preserves successful empty data as real zeroes", async () => {
    const tree = await CompanyDashboard();
    expect(tree.props).toMatchObject({ metrics: { crew: 0, available: 0, deployed: 0, requirements: 0, decisions: 0, engagements: 0 } });
    expect(renderToStaticMarkup(tree)).not.toContain("Unavailable");
  });

  it("requires company authorization before opening database clients", async () => {
    mocks.auth.mockRejectedValue(new Error("Sign in required"));
    await expect(CompanyDashboard()).rejects.toThrow("Sign in required");
    expect(mocks.tenant).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});

describe("company dashboard navigation and lifecycle", () => {
  it.each([
    ["/app", "Dashboard"],
    ["/app/workers/new", "Workforce"],
    ["/app/capacity/listing-id", "Capacity"],
    ["/app/demand/new", "Requirements"],
    ["/app/matches/match-id", "Matches"],
    ["/app/engagements/engagement-id", "Engagements"],
    ["/app/transfers", "Transfers"],
    ["/app/settings", "Company"],
  ])("keeps %s selected in its owning workspace destination", (pathname, label) => {
    expect(workspaceDestination(pathname)?.label).toBe(label);
    expect(isWorkspaceDestinationActive(pathname, "/app")).toBe(pathname === "/app");
  });

  it.each(["/app/workers-archive", "/app/matches-old", "/application", "/contact"])("does not select a partial path prefix for %s", (pathname) => {
    expect(workspaceDestination(pathname)).toBeUndefined();
  });

  it("provides real destinations for all workspace areas and both Active trading actions", async () => {
    const html = renderToStaticMarkup(await CompanyDashboard());
    expect(hrefs(html)).toEqual(expect.arrayContaining([
      "/app/workers", "/app/capacity", "/app/demand", "/app/matches", "/app/engagements",
      "/app/transfers", "/app/settings", "/app/capacity/new", "/app/demand/new",
    ]));
    expect(html).toContain("Sell capacity");
    expect(html).toContain("Buy capacity");
    expect(hrefs(html)).not.toContain("#");
  });

  it("lets Pending companies prepare their crew without offering trade creation", async () => {
    company("Pending");
    const html = renderToStaticMarkup(await CompanyDashboard());
    expect(hrefs(html)).toContain("/app/workers/new");
    expect(hrefs(html)).toContain("/app/settings");
    expect(hrefs(html)).not.toContain("/app/capacity/new");
    expect(hrefs(html)).not.toContain("/app/demand/new");
  });

  it.each(["Suspended", "Closed"] as const)("keeps %s companies browsing without new-work controls", async (status) => {
    company(status);
    const html = renderToStaticMarkup(await CompanyDashboard());
    expect(hrefs(html)).toEqual(expect.arrayContaining(["/app/workers", "/app/settings", "/app/matches"]));
    expect(hrefs(html).some((href) => href.endsWith("/new"))).toBe(false);
  });
});
