import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectReportPages,
  listAdminCompanies,
  listAdminWorkers,
  type ReportLoadOptions,
} from "./admin-reporting";
import { COMPANY_EXPORT_COLUMNS, WORKER_EXPORT_COLUMNS, toCsv } from "./csv";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
type Row = Record<string, unknown>;
type Query = { table: string; params: URLSearchParams; offset: number; limit: number; counted: boolean };
type Reply = { data?: unknown; count?: number | null; error?: boolean };

function company(index: number, overrides: Row = {}): Row {
  return {
    id: id(index), legal_name: "Company", trading_name: null, abn: null,
    industry_id: id(80001), contact_name: "Contact", contact_email: "company@example.test",
    contact_phone: null, primary_region_id: id(80002), status: "Active",
    created_at: "2026-08-31T00:00:00Z", company_user: [], ...overrides,
  };
}

function worker(index: number, overrides: Row = {}): Row {
  return {
    id: id(index), first_name: "Worker", last_name: "Example", mobile: "0400000000",
    email: "worker@example.test", status: "Active", base_region_id: id(80002),
    primary_trade_id: id(80003), primary_proficiency_id: id(80004),
    proficiency_overridden_by_maintain: false, proficiency_changed_at: null,
    consent_confirmed_at: "2026-08-31T00:00:00Z", created_at: "2026-08-31T00:00:00Z",
    ...overrides,
  };
}

/** Keep the actual Supabase query builder and count-header parser in the test. */
function fixture(overrides: Record<string, Row[]> = {}, cap = 1000) {
  const queries: Query[] = [];
  const state: { reply?: (query: Query, page: Row[], total: number) => Reply } = {};
  const tables: Record<string, Row[]> = {
    company: [company(1)], worker: [worker(1)],
    industry: [{ id: id(80001), name: "Construction" }],
    region: [{ id: id(80002), name: "Brisbane" }],
    trade_role: [{ id: id(80003), name: "Carpenter" }],
    proficiency: [{ id: id(80004), name: "Qualified", rank: 1 }],
    trade_role_proficiency: [{ trade_role_id: id(80003), proficiency_id: id(80004) }],
    worker_employment: [], worker_qualification: [], ...overrides,
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    const params = url.searchParams;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 1000);
    const counted = new Headers(init?.headers).get("prefer")?.includes("count=exact") ?? false;
    const query = { table, params, offset, limit, counted };
    queries.push(query);
    let rows = [...(tables[table] ?? [])];
    for (const [column, filter] of params) {
      if (["select", "order", "offset", "limit"].includes(column)) continue;
      const point = filter.indexOf(".");
      const op = filter.slice(0, point);
      const value = filter.slice(point + 1);
      rows = rows.filter((row) => {
        if (op === "eq") return String(row[column]) === value;
        if (op === "is") return value === "null" && row[column] === null;
        if (op === "in") return value.slice(1, -1).split(",").includes(String(row[column]));
        throw new Error(`Unsupported fixture filter: ${op}`);
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
        const key = field.split("(")[0].trim();
        return [key, row[key]];
      }));
    });
    const reply = state.reply?.(query, page, total) ?? {};
    if (reply.error) {
      return new Response(JSON.stringify({ message: "fixture query failure", code: "XX001" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    const count = reply.count === undefined ? total : reply.count;
    const data = "data" in reply ? reply.data : page;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (counted && count !== null) headers["content-range"] = `${offset}-${offset + page.length - 1}/${count}`;
    return new Response(JSON.stringify(data), { headers });
  };
  const client = createClient("https://report.example.test", "fixture-service-role", {
    auth: { persistSession: false }, global: { fetch: fetcher },
  });
  mocks.admin.mockReturnValue(client);
  return { tables, queries, state };
}

beforeEach(() => vi.clearAllMocks());

describe("exact counted report ranges", () => {
  it("collects all 605 rows when a successful 500-row request is capped at 200", async () => {
    const source = Array.from({ length: 605 }, (_, index) => ({ id: id(index + 1) }));
    const ranges: [number, number][] = [];
    const rows = await collectReportPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, Math.min(to + 1, from + 200)), count: source.length, error: null };
    }, "Capped report");
    expect(rows).toEqual(source);
    expect(ranges).toEqual([[0, 499], [200, 699], [400, 899], [600, 1099]]);
  });

  it.each([
    ["missing", null], ["negative", -1], ["fractional", 1.5],
  ] as const)("rejects a %s exact count", async (_description, count) => {
    await expect(collectReportPages(async () => ({ data: [{ id: id(1) }], error: null, count }), "Report"))
      .rejects.toThrow(/exact count/i);
  });

  it("fails closed when the count changes between successful pages", async () => {
    await expect(collectReportPages(async (from) => ({
      data: [{ id: id(from + 1) }], error: null, count: from === 0 ? 2 : 3,
    }), "Report")).rejects.toThrow(/changed while loading/i);
  });

  it("rejects an empty successful range before reaching the promised total", async () => {
    await expect(collectReportPages(async (from) => ({
      data: from === 0 ? [{ id: id(1) }] : [], error: null, count: 2,
    }), "Report")).rejects.toThrow(/incomplete range/i);
  });

  it.each([
    [{ id: id(1) }, { id: id(1) }], [{ id: id(1) }, { id: "" }], [{ id: id(1) }, null],
  ])("rejects duplicate or invalid stable row identities", async (first, second) => {
    await expect(collectReportPages(async () => ({ data: [first, second], error: null, count: 2 }), "Report"))
      .rejects.toThrow(/duplicate or invalid rows/i);
  });

  it("rejects duplicate identities across ranges even if the total is stable", async () => {
    await expect(collectReportPages(async () => ({ data: [{ id: id(1) }], error: null, count: 2 }), "Report"))
      .rejects.toThrow(/duplicate or invalid rows/i);
  });

  it.each([null, { id: id(1) }])("rejects an invalid successful row set", async (data) => {
    await expect(collectReportPages(async () => ({ data, error: null, count: 0 }), "Report"))
      .rejects.toThrow(/invalid row set/i);
  });

  it("rejects rows exceeding the exact total", async () => {
    await expect(collectReportPages(async () => ({ data: [{ id: id(1) }], error: null, count: 0 }), "Report"))
      .rejects.toThrow(/incomplete range/i);
  });

  it("accepts a counted empty result without another request", async () => {
    const fetchPage = vi.fn(async () => ({ data: [], count: 0, error: null }));
    await expect(collectReportPages(fetchPage, "Empty report")).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledOnce();
  });
});

const reportCases = [
  { table: "company", makeRow: company, load: (options: ReportLoadOptions) => listAdminCompanies({ status: "Active" }, options) },
  { table: "worker", makeRow: worker, load: (options: ReportLoadOptions) => listAdminWorkers({ status: "Active", trade: id(80003) }, options) },
];

describe.each(reportCases)("$table list and export pagination", ({ table, makeRow, load }) => {
  it("exports every stable filtered row beyond 1,000 with a 200-row server cap", async () => {
    const source = Array.from({ length: 1205 }, (_, index) => makeRow(index + 1)).reverse();
    const data = fixture({ [table]: [...source, makeRow(9999, { status: "Suspended" })] }, 200);
    const report = await load({ kind: "all" });
    expect(report.rows.map((row) => row.id)).toEqual(Array.from({ length: 1205 }, (_, index) => id(index + 1)));
    expect(new Set(report.rows.map((row) => row.id)).size).toBe(1205);
    const ranges = data.queries.filter((query) => query.table === table);
    expect(ranges.map(({ offset }) => offset)).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
    expect(ranges.every(({ limit, params }) => limit <= 500 && params.get("order")?.endsWith("id.asc"))).toBe(true);
    expect(data.queries.every(({ counted }) => counted)).toBe(true);
  });

  it("fills only the requested 100-row UI window when the server cap is 25", async () => {
    const data = fixture({ [table]: Array.from({ length: 255 }, (_, index) => makeRow(index + 1)).reverse() }, 25);
    const middle = await load({ kind: "page", page: 2 });
    expect(middle.rows.map((row) => row.id)).toEqual(Array.from({ length: 100 }, (_, index) => id(index + 101)));
    expect(middle.pagination).toEqual({ page: 2, pageSize: 100, hasPrevious: true, hasNext: true });
    const ranges = data.queries.filter((query) => query.table === table);
    expect(ranges.map(({ offset, limit }) => [offset, limit])).toEqual([[100, 100], [125, 75], [150, 50], [175, 25]]);
    const last = await load({ kind: "page", page: 3 });
    expect(last.rows.map((row) => row.id)).toEqual(Array.from({ length: 55 }, (_, index) => id(index + 201)));
    expect(last.pagination.hasNext).toBe(false);
  });

  it.each(["page", "all"] as const)("fails closed on an omitted count for %s reads", async (kind) => {
    const data = fixture({ [table]: [makeRow(1)] });
    data.state.reply = (query) => query.table === table ? { count: null } : {};
    await expect(load(kind === "all" ? { kind } : { kind, page: 1 })).rejects.toThrow(/exact count/i);
  });

  it("fails closed on a later query error instead of exporting a partial report", async () => {
    const data = fixture({ [table]: Array.from({ length: 605 }, (_, index) => makeRow(index + 1)) }, 200);
    data.state.reply = (query) => ({ error: query.table === table && query.offset === 200 });
    await expect(load({ kind: "all" })).rejects.toThrow(/query failed/i);
  });
});

describe("counted secondary report reads", () => {
  it("keeps all crew and credential counts under lower successful response caps", async () => {
    const data = fixture({
      worker_employment: Array.from({ length: 1205 }, (_, index) => ({
        id: id(index + 10000), worker_id: id(index + 1), company_id: id(1), end_date: null,
      })),
      worker_qualification: Array.from({ length: 1205 }, (_, index) => ({
        id: id(index + 20000), worker_id: id(1), status: index < 1000 ? "Current" : "Expiring Soon",
      })),
    }, 200);
    const companies = await listAdminCompanies({ status: "Active" }, { kind: "all" });
    const workers = await listAdminWorkers({ status: "Active", trade: id(80003) }, { kind: "all" });
    expect(companies.rows[0]).toMatchObject({ worker_count: 1205, industry_name: "Construction", primary_region_name: "Brisbane" });
    expect(workers.rows[0]).toMatchObject({ qualifications_current: 1000, qualifications_expiring: 205, qualifications_expired: 0, employer_name: "Company" });
    expect(toCsv(COMPANY_EXPORT_COLUMNS, companies.rows)).toContain('"1205"');
    expect(toCsv(WORKER_EXPORT_COLUMNS, workers.rows)).toContain('"1000","205","0"');
    expect(data.queries.every(({ counted }) => counted)).toBe(true);
  });

  it("paginates trade/proficiency pairs by their compound key without inventing an id", async () => {
    const proficiencies = Array.from({ length: 205 }, (_, index) => ({ id: id(index + 80004), name: `Level ${index}`, rank: index }));
    fixture({
      proficiency: proficiencies,
      trade_role_proficiency: proficiencies.map((row) => ({ trade_role_id: id(80003), proficiency_id: row.id })),
    }, 17);
    const result = await listAdminWorkers({ status: "", trade: "" }, { kind: "page", page: 1 });
    expect(result.proficienciesByTrade.get(id(80003))?.map((row) => row.id)).toEqual(proficiencies.map((row) => row.id));
  });

  it("rejects duplicate compound-key catalogue rows", async () => {
    fixture({ trade_role_proficiency: [
      { trade_role_id: id(80003), proficiency_id: id(80004) },
      { trade_role_id: id(80003), proficiency_id: id(80004) },
    ] });
    await expect(listAdminWorkers({ status: "", trade: "" }, { kind: "all" })).rejects.toThrow(/duplicate or invalid rows/i);
  });

  it("rejects duplicate secondary identities across separate IN-filter chunks", async () => {
    const duplicate = { id: id(20000), worker_id: id(20001), company_id: id(1), end_date: null };
    const data = fixture({
      company: Array.from({ length: 101 }, (_, index) => company(index + 1)),
      worker_employment: [duplicate],
    });
    data.state.reply = (query) => query.table === "worker_employment" ? { data: [duplicate], count: 1 } : {};
    await expect(listAdminCompanies({ status: "Active" }, { kind: "all" })).rejects.toThrow(/duplicate or invalid rows/i);
  });
});
