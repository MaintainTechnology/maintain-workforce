import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyStatus } from "./supabase/types";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCompanyAdmin: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.tenant }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/lib/actions/worker", () => ({
  createWorker: vi.fn(), addWorkerQualification: vi.fn(), setWorkerAccountStatus: vi.fn(),
}));
vi.mock("@/lib/actions/transfer", () => ({
  requestTransfer: vi.fn(), approveTransfer: vi.fn(), declineTransfer: vi.fn(), withdrawTransfer: vi.fn(),
}));

const WorkersPage = (await import("../app/(app)/app/workers/page")).default;
const NewWorkerPage = (await import("../app/(app)/app/workers/new/page")).default;
const WorkerDetailPage = (await import("../app/(app)/app/workers/[id]/page")).default;
const TransfersPage = (await import("../app/(app)/app/transfers/page")).default;
const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const today = "2026-09-09";
type Row = Record<string, unknown>;

/** Execute the pages and real PostgREST/storage clients; replace external I/O only. */
function database() {
  const tables: Record<string, Row[]> = {
    worker: [{ id: workerId, first_name: "Alex", last_name: "Worker", mobile: "0400000000", email: "alex@example.test", status: "Active", base_region_id: "region", primary_trade_id: "trade", primary_proficiency_id: "level" }],
    trade_role: [{ id: "trade", name: "Trade", is_active: true }],
    proficiency: [{ id: "level", name: "Level", is_active: true, rank: 1 }],
    region: [{ id: "region", name: "Region", is_active: true }],
    qualification: [{ id: "current", name: "Current credential", is_active: true }, { id: "legacy", name: "Legacy credential", is_active: false }],
    company_transfer_view: [
      { id: "received", worker_id: workerId, from_company_id: companyId, to_company_id: "another-company", status: "Awaiting Current Employer", created_at: today },
      { id: "requested", worker_id: "other-worker", from_company_id: null, to_company_id: companyId, status: "Admin Review", created_at: today },
    ],
  };
  const signed: { path: string; expiresIn: number; client: string }[] = [];
  const failed = new Set<string>();
  let signingFails = false;

  function client(kind: "tenant" | "service") {
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.includes("/storage/v1/object/sign/")) {
        const path = url.pathname.split("/object/sign/")[1];
        const body = JSON.parse(String(init?.body)) as { expiresIn: number };
        signed.push({ path, expiresIn: body.expiresIn, client: kind });
        return signingFails
          ? Response.json({ error: "Unavailable", message: "Unavailable" }, { status: 503 })
          : Response.json({ signedURL: `/object/sign/${path}?token=temporary-test-token` });
      }
      const table = url.pathname.split("/").at(-1)!;
      if (failed.has(table)) {
        // What PostgREST answers when the bearer token's issuer is not trusted.
        return Response.json({ code: "PGRST301", message: "No suitable key or wrong key type" }, { status: 401 });
      }
      let rows = tables[table] ?? [];
      for (const [column, filter] of url.searchParams) {
        if (["select", "order", "offset", "limit"].includes(column)) continue;
        const dot = filter.indexOf(".");
        const operator = filter.slice(0, dot);
        const value = filter.slice(dot + 1);
        rows = rows.filter((row) => {
          if (operator === "eq") return String(row[column]) === value;
          if (operator === "in") return value.slice(1, -1).split(",").map((item) => item.replaceAll('"', "")).includes(String(row[column]));
          if (operator === "cs" || operator === "ov") {
            const [start, end] = value.slice(1, -1).split(",");
            const [from, until] = String(row[column]).slice(1, -1).split(",");
            return operator === "cs" ? from <= start && until >= end : from <= end && until >= start;
          }
          throw new Error(`Unexpected filter ${operator}`);
        });
      }
      const columns = url.searchParams.get("select");
      if (columns && columns !== "*") rows = rows.map((row) => Object.fromEntries(columns.split(",").map((column) => [column, row[column]])));
      return Response.json(rows);
    };
    return createSupabaseClient("https://workforce.example.test", `fixture-${kind}`, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
    });
  }
  mocks.tenant.mockResolvedValue(client("tenant"));
  mocks.admin.mockReturnValue(client("service"));
  return { tables, signed, failSigning: () => { signingFails = true; }, failTable: (table: string) => { failed.add(table); } };
}

function company(status: CompanyStatus) {
  mocks.auth.mockResolvedValue({ companyId, companyStatus: status, user: { id: "user_CompanyAdmin" } });
}

function detail() {
  return WorkerDetailPage({ params: Promise.resolve({ id: workerId }), searchParams: Promise.resolve({}) });
}

let db: ReturnType<typeof database>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  company("Active");
  db = database();
});
afterEach(() => vi.useRealTimers());

describe("company workforce lifecycle controls — MVP 1.3 and 3.2", () => {
  it.each(["Suspended", "Closed"] as const)("keeps %s records readable without offering worker or transfer mutations", async (status) => {
    company(status);
    const list = renderToStaticMarkup(await WorkersPage());
    expect(list).toContain(`/app/workers/${workerId}`);
    expect(list).not.toContain('href="/app/workers/new"');

    const intake = renderToStaticMarkup(await NewWorkerPage());
    expect(intake).toContain("This account is read-only");
    expect(intake).not.toContain("<form");

    const record = renderToStaticMarkup(await detail());
    expect(record).toContain("Alex");
    expect(record).not.toContain("<form");

    const transfers = renderToStaticMarkup(await TransfersPage({ searchParams: Promise.resolve({}) }));
    expect(transfers).toContain("Awaiting Current Employer");
    expect(transfers).not.toContain("<form");
    expect(transfers).toContain("Read-only");
  });

  it.each(["Pending", "Active"] as const)("preserves %s worker preparation and transfer decisions", async (status) => {
    company(status);
    expect(renderToStaticMarkup(await WorkersPage())).toContain('href="/app/workers/new"');
    expect(renderToStaticMarkup(await NewWorkerPage())).toContain('name="first_name"');
    const record = renderToStaticMarkup(await detail());
    expect(record).toContain("Mark inactive");
    expect(record).toContain("Save qualification");
    const transfers = renderToStaticMarkup(await TransfersPage({ searchParams: Promise.resolve({}) }));
    expect(transfers).toContain("Approve transfer");
    expect(transfers).toContain("Decline transfer");
    expect(transfers).toContain("Withdraw request");
  });
});

describe("worker qualification evidence — MVP 4.3 and 7.1", () => {
  function qualification() {
    db.tables.worker_qualification = [{ id: "evidence", worker_id: workerId, qualification_id: "legacy", number: "TICKET-1", issue_date: "2025-09-09", expiry_date: "2026-10-01", file_path: `${workerId}/earlier-employer.pdf` }];
  }

  it("opens existing evidence through a short-lived current-employer URL and retains inactive credential history", async () => {
    qualification();
    const html = renderToStaticMarkup(await detail());
    expect(html).toContain("Legacy credential");
    expect(html).toContain("Open evidence");
    expect(html).toContain("token=temporary-test-token");
    expect(html).toContain("Expiring Soon");
    expect(html).toContain('<option value="current">');
    expect(html).not.toContain('<option value="legacy">');
    expect(db.signed).toEqual([{ path: `worker-qualifications/${workerId}/earlier-employer.pdf`, expiresIn: 300, client: "tenant" }]);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("keeps document reading available for a read-only current employer", async () => {
    company("Suspended");
    qualification();
    const html = renderToStaticMarkup(await detail());
    expect(html).toContain("Open evidence");
    expect(html).not.toContain("<form");
  });

  it("never attempts to sign evidence when the worker is outside the readable employment scope", async () => {
    qualification();
    db.tables.worker = [];
    await expect(detail()).rejects.toThrow("not-found");
    expect(db.signed).toEqual([]);
  });

  it("distinguishes temporarily unavailable evidence from a record with no document", async () => {
    qualification();
    db.tables.worker_qualification.push({ id: "no-file", worker_id: workerId, qualification_id: "current", file_path: null });
    db.failSigning();
    const html = renderToStaticMarkup(await detail());
    expect(html).toContain("Unavailable — refresh to retry");
    expect(html).toContain("No document");
    expect(html).not.toContain("earlier-employer.pdf");
  });
});

describe("workforce read failures — MVP 4.1 and 17.1", () => {
  const plain = () => {};
  // Reads that only happen once earlier rows exist need those rows first.
  const openLine = () => {
    db.tables.capacity_line = [{ id: "line", company_id: companyId, status: "Open", available_from: today, available_until: today }];
  };
  const taggedSkill = () => {
    db.tables.worker_skill = [{ worker_id: workerId, skill_id: "skill" }];
  };

  it.each([
    ["crew list", "worker", () => WorkersPage(), plain],
    ["crew trades", "trade_role", () => WorkersPage(), plain],
    ["crew proficiencies", "proficiency", () => WorkersPage(), plain],
    ["crew capacity lines", "capacity_line", () => WorkersPage(), plain],
    ["crew line members", "capacity_line_worker", () => WorkersPage(), openLine],
    ["crew commitments", "engagement_worker", () => WorkersPage(), plain],
    ["intake regions", "region", () => NewWorkerPage(), plain],
    ["intake trades", "trade_role", () => NewWorkerPage(), plain],
    ["intake proficiencies", "proficiency", () => NewWorkerPage(), plain],
    ["intake trade levels", "trade_role_proficiency", () => NewWorkerPage(), plain],
    ["intake skills", "skill", () => NewWorkerPage(), plain],
    ["record", "worker", () => detail(), plain],
    ["record trades", "trade_role", () => detail(), plain],
    ["record proficiencies", "proficiency", () => detail(), plain],
    ["record regions", "region", () => detail(), plain],
    ["record qualifications", "qualification", () => detail(), plain],
    ["record credentials", "worker_qualification", () => detail(), plain],
    ["record employment", "worker_employment", () => detail(), plain],
    ["record skills", "worker_skill", () => detail(), plain],
    ["record skill names", "skill", () => detail(), taggedSkill],
    ["record travel regions", "worker_travel_region", () => detail(), plain],
  ] as const)("fails visibly when the %s cannot load", async (_label, table, page, arrange) => {
    arrange();
    db.failTable(table);
    await expect(page()).rejects.toThrow("could not be loaded");
  });

  it("treats a malformed worker id as a missing record, not a failed read", async () => {
    const page = WorkerDetailPage({ params: Promise.resolve({ id: "not-a-worker" }), searchParams: Promise.resolve({}) });
    await expect(page).rejects.toThrow("not-found");
  });

  it("offers every catalogue option once the reads succeed", async () => {
    const html = renderToStaticMarkup(await NewWorkerPage());
    expect(html).toContain('<option value="region">Region</option>');
    expect(html).toContain('<option value="trade">Trade</option>');
  });
});

describe("derived worker marketplace state — MVP 6.5", () => {
  it("shows today's committed worker as Engaged even when no capacity line is open", async () => {
    db.tables.engagement_worker = [{ worker_id: workerId, status: "Awaiting Commercial", committed_window: `[${today},${today}]` }];
    expect(renderToStaticMarkup(await WorkersPage())).toContain(">Engaged</span>");
  });

  it("does not mark cancelled commitments as Engaged", async () => {
    db.tables.engagement_worker = [{ worker_id: workerId, status: "Cancelled", committed_window: `[${today},${today}]` }];
    const html = renderToStaticMarkup(await WorkersPage());
    expect(html).toContain(">Unavailable</span>");
    expect(html).not.toContain(">Engaged</span>");
  });
});
