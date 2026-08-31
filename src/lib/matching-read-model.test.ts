import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DemandLineContext } from "@/lib/matching";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  reads: [] as { table: string; select: string; offset: number; client: "tenant" | "service" }[],
  failingTable: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: vi.fn() }));
vi.mock("@/lib/config", () => ({ getBookingRules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database("service") }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database("tenant") }));

// PostgREST-shaped test transport: filtering/ordering precede its real 1000-row
// default cap. The loader, not this transport, must request subsequent ranges.
class Query {
  private selected = "*";
  private predicates: ((row: Row) => boolean)[] = [];
  private ordering: string[] = [];
  private offset = 0;
  private end = 999;
  constructor(private table: string, private client: "tenant" | "service") {}
  select(columns: string) { this.selected = columns; return this; }
  eq(key: string, value: unknown) { this.predicates.push((r) => r[key] === value); return this; }
  neq(key: string, value: unknown) { this.predicates.push((r) => r[key] !== value); return this; }
  in(key: string, values: unknown[]) { this.predicates.push((r) => values.includes(r[key])); return this; }
  lte(key: string, value: string) { this.predicates.push((r) => String(r[key]) <= value); return this; }
  gte(key: string, value: string) { this.predicates.push((r) => String(r[key]) >= value); return this; }
  order(key: string) { this.ordering.push(key); return this; }
  range(from: number, to: number) { this.offset = from; this.end = to; return this; }
  private execute() {
    state.reads.push({ table: this.table, select: this.selected, offset: this.offset, client: this.client });
    if (state.failingTable === this.table) return { data: null, error: { message: "read failed" }, count: null };
    const rows = (state.tables[this.table] ?? []).filter((r) => this.predicates.every((p) => p(r)));
    rows.sort((a, b) => {
      for (const key of this.ordering) {
        const comparison = String(a[key]).localeCompare(String(b[key]));
        if (comparison) return comparison;
      }
      return 0;
    });
    const data = rows.slice(this.offset, Math.min(this.end + 1, this.offset + 1000)).map((row) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => this.selected === "*" ||
        new RegExp(`(?:^|[\\s,])${key}(?:[\\s,(:]|$)`).test(this.selected))),
    );
    return { data, error: null, count: rows.length };
  }
  then<T>(resolve: (value: ReturnType<Query["execute"]>) => T) { return Promise.resolve(this.execute()).then(resolve); }
  async maybeSingle() { const result = this.execute(); return { ...result, data: result.data?.[0] ?? null }; }
}
const database = (client: "tenant" | "service") => ({
  from: (table: string) => new Query(table, client), rpc: async () => ({ data: true, error: null }),
});
const matching = await import("@/lib/matching");

const demand: DemandLineContext = {
  id: "demand", requestName: "Project", buyerCompanyId: "buyer", tradeRoleId: "trade", tradeName: "Trade",
  proficiencyId: "level", proficiencyName: "Level", proficiencyRank: 1, quantity: 2000,
  startDate: "2026-09-01", endDate: "2026-09-28", hoursPerWeek: 40, workRegionId: "region", workRegionName: "Region",
  description: null, notes: null, status: "Open", requiredSkills: [], requiredQualifications: ["One", "Two", "Three"],
  quantityFilled: 0, quantityPending: 0, remaining: 2000, feeBp: 2000,
};
const workerId = (n: number) => `worker-${String(n).padStart(4, "0")}`;
function candidateFixture(count = 500) {
  state.tables.capacity_line = [{ id: "line", company_id: "supplier", trade_role_id: "trade", proficiency_id: "level",
    available_from: demand.startDate, available_until: demand.endDate, hours_per_week: 40,
    location_region_id: "region", supplier_rate_cents: 5000, status: "Open",
    company: { legal_name: "Supplier", status: "Active" }, proficiency: { rank: 1 } }];
  state.tables.capacity_line_worker = Array.from({ length: count }, (_, n) => ({ capacity_line_id: "line", worker_id: workerId(n) }));
  state.tables.worker = Array.from({ length: count }, (_, n) => ({ id: workerId(n), first_name: "Worker", last_name: String(n), status: "Active" }));
  state.tables.demand_line_qualification = [0, 1, 2].map((n) => ({ demand_line_id: "demand", qualification_id: `ticket-${n}` }));
  state.tables.worker_qualification = state.tables.worker.flatMap((w) => [0, 1, 2].map((n) => ({
    id: `${w.id}-${n}`, worker_id: w.id, qualification_id: `ticket-${n}`, expiry_date: "2027-09-28", status: "Current",
    qualification: { name: `Ticket ${n}` },
  })));
}
beforeEach(() => {
  state.tables = {};
  state.reads = [];
  state.failingTable = "";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-31T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("complete candidate read model", () => {
  it("keeps all 500 candidates when their three tickets exceed the default row cap", async () => {
    candidateFixture();
    const rows = await matching.getCandidates({ demandLine: demand, includeHigherProficiency: false });
    expect(rows).toHaveLength(500);
    expect(rows.every((row) => row.qualifications.length === 3 && row.qualifications.every((q) => q.held))).toBe(true);
  });
  it("does not omit worker or capacity membership rows beyond 1000", async () => {
    candidateFixture(1101);
    expect(await matching.getCandidates({ demandLine: demand, includeHigherProficiency: false })).toHaveLength(1101);
  });
  it("includes a conflicting commitment after 1000 earlier commitments for the same worker", async () => {
    candidateFixture(1);
    state.tables.engagement_worker = Array.from({ length: 1101 }, (_, n) => ({
      id: `commit-${String(n).padStart(4, "0")}`, worker_id: workerId(0), status: "Awaiting Commercial",
      engagement: n === 1100 ? { start_date: "2026-09-01", end_date: "2026-09-14" }
        : { start_date: "2026-07-01", end_date: "2026-07-02" },
    }));
    const [candidate] = await matching.getCandidates({ demandLine: demand, includeHigherProficiency: false });
    expect(candidate.klass).toBe("Greyed");
    expect(candidate.availabilityPercent).toBe(50);
  });
  it("fails closed when eligibility reads fail instead of displaying an eligible partial crew", async () => {
    candidateFixture(1);
    state.failingTable = "engagement_worker";
    await expect(matching.getCandidates({ demandLine: demand, includeHigherProficiency: false })).rejects.toThrow();
  });
});

describe("buyer ticket facts", () => {
  it("excludes actually expired Current credentials from aggregate coverage before cron catches up", async () => {
    state.tables.buyer_match_view = [{ id: "match", demand_line_id: "demand", engagement_start: demand.startDate,
      engagement_end: demand.endDate, hours_per_week: 40, buyer_rate_cents: 6000, nominated_count: 1 }];
    state.tables.match_worker = [{ id: "nominee", match_id: "match", worker_id: "worker", knocked_out: false }];
    state.tables.demand_line_qualification = [{ demand_line_id: "demand", qualification_id: "ticket" }];
    state.tables.worker_qualification = [{ id: "expired", worker_id: "worker", qualification_id: "ticket", status: "Current",
      expiry_date: "2026-08-30", qualification: { name: "Ticket" } }];
    const result = await matching.buyerMatch("match");
    expect(result?.qualificationCoverage[0].heldBy).toBe(0);
  });
  it.each([null, "2026-08-30T00:00:00Z"])("gates named ticket facts with the immutable marker %s, not Cancelled status", async (marker) => {
    state.tables.buyer_engagement_view = [{ id: "engagement", status: "Cancelled", commercial_confirmed_at: marker,
      supplier_company_id: marker ? "supplier" : null }];
    state.tables.engagement_worker = [{ id: "crew", engagement_id: "engagement", worker_id: "worker",
      worker: { id: "worker", first_name: "Site", last_name: "Worker", mobile: "PRIVATE-MOBILE", email: "PRIVATE-EMAIL" } }];
    state.tables.worker_qualification = [{ id: "credential", worker_id: "worker", qualification_id: "ticket", number: "LIC-123",
      issue_date: "2025-01-01", expiry_date: "2027-01-01", status: "Current", file_path: "PRIVATE-STORAGE-PATH",
      qualification: { name: "Site ticket" } }];
    state.tables.engagement_worker_profile_view = [{ id: "crew", engagement_id: "engagement",
      profile_snapshot: { name: "Site Worker", tickets: [{ name: "Site ticket", number: "LIC-123",
        issueDate: "2025-01-01", expiryDate: "2027-01-01", status: "Current" }] },
      profile_snapshot_captured_at: "2026-08-30T00:00:00Z" }];
    const result = await matching.partyEngagement("engagement", "buyer");
    expect(result?.workerTickets).toEqual(marker ? [{ name: "Site Worker", capturedAt: "2026-08-30T00:00:00Z", tickets: [{ name: "Site ticket", number: "LIC-123",
      issueDate: "2025-01-01", expiryDate: "2027-01-01", status: "Current" }] }] : []);
    const encoded = JSON.stringify(result);
    for (const privateValue of ["PRIVATE-MOBILE", "PRIVATE-EMAIL", "PRIVATE-STORAGE-PATH"]) expect(encoded).not.toContain(privateValue);
    if (!marker) expect(state.reads.some((read) => read.table === "worker_qualification")).toBe(false);
  });
});

describe("historical engagement crew privacy", () => {
  const capturedAt = "2026-08-31T00:00:00Z";
  const historical = { name: "Original Worker", tickets: [{ name: "Original ticket", number: "OLD-TICKET-001",
    issueDate: "2025-01-01", expiryDate: "2027-01-01", status: "Current" }] };
  function historicalFixture(marker: string | null = capturedAt) {
    const engagement = { id: "engagement", status: "Completed", commercial_confirmed_at: marker };
    state.tables.supplier_engagement_view = [engagement];
    state.tables.buyer_engagement_view = [engagement];
    state.tables.engagement_worker_profile_view = [{ id: "crew", engagement_id: "engagement",
      profile_snapshot: historical, profile_snapshot_captured_at: capturedAt }];
    state.tables.engagement_worker = [{ id: "crew", engagement_id: "engagement", worker_id: "worker",
      worker: { first_name: "POST-TRANSFER-NAME", last_name: "Private", mobile: "PRIVATE-MOBILE", email: "PRIVATE-EMAIL" } }];
    state.tables.worker_qualification = [{ id: "new-private-ticket", worker_id: "worker", qualification_id: "ticket",
      number: "NEW-EMPLOYER-PRIVATE-TICKET-001", issue_date: "2026-08-31", expiry_date: "2027-08-31",
      status: "Current", qualification: { name: "New employer ticket" }, file_path: "PRIVATE-STORAGE-PATH" }];
  }

  it.each(["supplier", "buyer"] as const)("preserves the %s's historical crew without joining transferred live profiles", async (role) => {
    historicalFixture();
    const result = await matching.partyEngagement("engagement", role);
    expect(result?.workerTickets).toEqual([{ ...historical, capturedAt }]);
    expect(result?.workers).toEqual(["Original Worker"]);
    const encoded = JSON.stringify(result);
    for (const value of ["POST-TRANSFER-NAME", "NEW-EMPLOYER-PRIVATE-TICKET-001", "PRIVATE-MOBILE", "PRIVATE-EMAIL", "PRIVATE-STORAGE-PATH"]) {
      expect(encoded).not.toContain(value);
    }
    expect(state.reads.some((read) => ["worker", "worker_qualification", "worker_employment", "engagement_worker"].includes(read.table))).toBe(false);
    expect(state.reads.filter((read) => read.table === "engagement_worker_profile_view")
      .every((read) => read.client === "tenant")).toBe(true);
  });

  it("does not backfill missing legacy snapshots from a later employer's profile", async () => {
    historicalFixture();
    state.tables.engagement_worker_profile_view[0].profile_snapshot = null;
    state.tables.engagement_worker_profile_view[0].profile_snapshot_captured_at = null;
    const result = await matching.partyEngagement("engagement", "supplier");
    expect(result?.workerTickets).toEqual([{ name: "Historical worker details unavailable", tickets: [], capturedAt: null }]);
    expect(JSON.stringify(result)).not.toContain("NEW-EMPLOYER-PRIVATE-TICKET-001");
  });

  it("returns supplier snapshots before commercial confirmation but no buyer crew", async () => {
    historicalFixture(null);
    const supplier = await matching.partyEngagement("engagement", "supplier");
    expect(supplier?.workerTickets).toEqual([{ ...historical, capturedAt }]);
    state.reads = [];
    expect((await matching.partyEngagement("engagement", "buyer"))?.workerTickets).toEqual([]);
    expect(state.reads.some((read) => read.table === "engagement_worker_profile_view")).toBe(false);
  });

  it("fails closed when the historical snapshot query fails", async () => {
    historicalFixture();
    state.failingTable = "engagement_worker_profile_view";
    await expect(matching.partyEngagement("engagement", "supplier")).rejects.toThrow();
  });

  it("fails closed when the entitlement read fails instead of returning a misleading empty result", async () => {
    historicalFixture();
    state.failingTable = "supplier_engagement_view";
    await expect(matching.partyEngagement("engagement", "supplier")).rejects.toThrow();
    await expect(matching.partyEngagements("supplier")).rejects.toThrow();
  });

  it("does not truncate a historical crew at the PostgREST default row limit", async () => {
    historicalFixture();
    state.tables.engagement_worker_profile_view = Array.from({ length: 1101 }, (_, index) => ({
      id: `crew-${String(index).padStart(4, "0")}`, engagement_id: "engagement",
      profile_snapshot: { name: `Historical ${index}`, tickets: [] }, profile_snapshot_captured_at: capturedAt,
    }));
    const result = await matching.partyEngagement("engagement", "supplier");
    expect(result?.workers).toHaveLength(1101);
    expect(result?.workers.at(-1)).toBe("Historical 1100");
  });

  it("does not spread extra stored JSON fields into either party's response", async () => {
    historicalFixture();
    state.tables.engagement_worker_profile_view[0].profile_snapshot = { ...historical,
      mobile: "PRIVATE-MOBILE", email: "PRIVATE-EMAIL", tickets: historical.tickets.map((ticket) => ({
        ...ticket, file_path: "PRIVATE-STORAGE-PATH", internal_note: "PRIVATE-INTERNAL-NOTE",
      })),
    };
    for (const role of ["buyer", "supplier"] as const) {
      expect((await matching.partyEngagement("engagement", role))?.workerTickets).toEqual([{ ...historical, capturedAt }]);
    }
  });

  it.each([
    { profile: [], capturedAt },
    { profile: { name: 123, tickets: [] }, capturedAt },
    { profile: { name: "Original Worker", tickets: [{ name: "Broken" }] }, capturedAt },
    { profile: historical, capturedAt: null },
    { profile: historical, capturedAt: "invalid capture time" },
  ])("treats an untrustworthy stored snapshot as unavailable (%j)", async (invalid) => {
    historicalFixture();
    state.tables.engagement_worker_profile_view[0].profile_snapshot = invalid.profile;
    state.tables.engagement_worker_profile_view[0].profile_snapshot_captured_at = invalid.capturedAt;
    expect((await matching.partyEngagement("engagement", "buyer"))?.workerTickets).toEqual([
      { name: "Historical worker details unavailable", tickets: [], capturedAt: null },
    ]);
  });

  it.each(["engagement", "company"])("fails closed on %s detail read errors", async (table) => {
    historicalFixture();
    state.tables.buyer_engagement_view[0].supplier_company_id = "supplier";
    state.failingTable = table;
    await expect(matching.partyEngagement("engagement", "buyer")).rejects.toThrow();
  });

  it("loads a complete historical engagement list beyond the default row limit", async () => {
    historicalFixture();
    state.tables.supplier_engagement_view = Array.from({ length: 1101 }, (_, index) => ({
      id: `engagement-${String(index).padStart(4, "0")}`, start_date: "2026-09-01", status: "Completed",
      commercial_confirmed_at: capturedAt,
    }));
    state.tables.engagement_worker_profile_view = state.tables.supplier_engagement_view.map((row) => ({
      id: `crew-${row.id}`, engagement_id: row.id, profile_snapshot: historical, profile_snapshot_captured_at: capturedAt,
    }));
    const results = await matching.partyEngagements("supplier");
    expect(results).toHaveLength(1101);
    expect(results.at(-1)?.id).toBe("engagement-1100");
    expect(results.every((row) => row.workers[0] === historical.name)).toBe(true);
  });
});
