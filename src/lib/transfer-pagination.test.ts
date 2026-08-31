import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const mock = vi.hoisted(() => ({
  transfers: [] as Row[],
  tables: [] as string[],
  ranges: [] as [number, number][],
  orders: [] as string[],
  workers: undefined as Row[] | undefined,
  companies: undefined as Row[] | undefined,
  errors: {} as Record<string, { message: string }>,
}));

// This adapter models PostgREST's finite default response cap, ordering and explicit
// inclusive range. Only I/O is replaced: both real page components are executed.
function database() {
  return {
    from(table: string) {
      mock.tables.push(table);
      let rows: Row[] = table === "worker_transfer" || table === "company_transfer_view"
        ? mock.transfers.slice()
        : table === "worker"
          ? mock.workers ?? mock.transfers.map((row) => ({ id: row.worker_id, first_name: row.id === "oldest" ? "Oldest" : "Recent", last_name: "Worker" }))
          : table === "company" ? mock.companies ?? [{ id: "holder", legal_name: "Holder" }, { id: "requester", legal_name: "Requester" }] : [];
      let start = 0;
      let end = 999;
      const ordering: { field: string; ascending: boolean }[] = [];
      const query = {
        select() { return query; },
        order(field: string, options: { ascending: boolean }) {
          ordering.push({ field, ascending: options.ascending });
          if (table === "worker_transfer" || table === "company_transfer_view") mock.orders.push(field);
          return query;
        },
        limit(count: number) { end = count - 1; return query; },
        range(from: number, to: number) { start = from; end = to; mock.ranges.push([from, to]); return query; },
        in(field: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[field])); return query; },
        then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) {
          rows.sort((a, b) => {
            for (const { field, ascending } of ordering) {
              const comparison = String(a[field]).localeCompare(String(b[field]));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          const error = mock.errors[table] ?? null;
          return Promise.resolve({ data: error ? null : rows.slice(start, end + 1), error }).then(resolve);
        },
      };
      return query;
    },
  };
}

vi.mock("@/lib/auth", () => ({
  requireMaintainAdmin: async () => ({ id: "admin" }),
  requireCompanyAdmin: async () => ({ companyId: "holder" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database() }));
vi.mock("@/lib/actions/transfer", () => ({
  adminDecideTransfer: vi.fn(), approveTransfer: vi.fn(), declineTransfer: vi.fn(), withdrawTransfer: vi.fn(),
}));

import AdminTransfersPage from "@/app/(admin)/admin/transfers/page";
import TransfersPage from "@/app/(app)/app/transfers/page";
import { transferPageHref, transferPageNumber } from "@/lib/transfer-queue";
import { TransferQueuePagination } from "@/components/transfer-queue-pagination";

function textIn(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textIn).join(" ");
  if (node && typeof node === "object" && "props" in node) {
    return textIn((node.props as { children?: unknown }).children);
  }
  return "";
}

function rowKeys(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(rowKeys);
  if (node && typeof node === "object" && "props" in node) {
    const element = node as { type: unknown; key: string | null; props: { children?: unknown } };
    return [
      ...(element.type === "tr" && element.key ? [element.key] : []),
      ...rowKeys(element.props.children),
    ];
  }
  return [];
}

function hrefs(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(hrefs);
  if (node && typeof node === "object" && "props" in node) {
    const props = node.props as { href?: string; children?: unknown };
    return [...(typeof props.href === "string" ? [props.href] : []), ...hrefs(props.children)];
  }
  return [];
}

function formLabels(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(formLabels);
  if (node && typeof node === "object" && "props" in node) {
    const props = node.props as { submitLabel?: string; children?: unknown };
    return [...(props.submitLabel ? [props.submitLabel] : []), ...formLabels(props.children)];
  }
  return [];
}

function seed(newerCount: number) {
  const base = { from_company_id: "holder", to_company_id: "requester", decided_at: null };
  mock.transfers = [
    ...Array.from({ length: newerCount }, (_, index) => ({ ...base,
      id: `recent-${String(index).padStart(5, "0")}`, worker_id: `worker-${index}`,
      status: "Completed", created_at: "2026-08-30T00:00:00Z", reason: null,
    })),
    { ...base, id: "oldest", worker_id: "old-worker", status: "Admin Review",
      created_at: "2026-01-01T00:00:00Z", reason: "Old escalated request" },
  ];
}

beforeEach(() => {
  mock.tables = [];
  mock.ranges = [];
  mock.orders = [];
  mock.workers = undefined;
  mock.companies = undefined;
  mock.errors = {};
});

describe("transfer decision identities", () => {
  it.each(["worker", "company"])("fails the admin queue closed when the %s identity read errors", async (table) => {
    seed(0);
    mock.errors[table] = { message: "Identity lookup unavailable" };
    await expect(AdminTransfersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/identit|details/i);
  });

  it.each(["worker", "from company", "to company"])("rejects an admin decision without the required %s identity", async (identity) => {
    seed(0);
    if (identity === "worker") mock.workers = [];
    else mock.companies = identity === "from company"
      ? [{ id: "requester", legal_name: "Requester" }]
      : [{ id: "holder", legal_name: "Holder" }];
    await expect(AdminTransfersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/identit|details/i);
  });

  it("allows Maintain to decide a fully identified worker with no current employer", async () => {
    seed(0);
    mock.transfers[0].from_company_id = null;
    const page = await AdminTransfersPage({ searchParams: Promise.resolve({}) });
    expect(textIn(page)).toContain("No current employer");
    expect(formLabels(page)).toContain("Approve transfer");
  });

  it("fails the company queue closed when the worker identity read errors", async () => {
    seed(0);
    mock.transfers[0].status = "Awaiting Current Employer";
    mock.errors.worker = { message: "Identity lookup unavailable" };
    await expect(TransfersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/identit|details/i);
  });

  it("rejects a current-employer decision when RLS returns no worker identity", async () => {
    seed(0);
    mock.transfers[0].status = "Awaiting Current Employer";
    mock.workers = [];
    await expect(TransfersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/identit|details/i);
  });

  it("keeps a former employer's completed history readable when the live worker profile is hidden", async () => {
    seed(0);
    mock.transfers[0].status = "Completed";
    mock.workers = [];
    const page = await TransfersPage({ searchParams: Promise.resolve({}) });
    expect(rowKeys(page)).toContain("oldest");
    expect(textIn(page)).toContain("Completed");
    expect(formLabels(page)).not.toContain("Approve transfer");
  });

  it("keeps requester withdrawal available without revealing a deliberately hidden worker", async () => {
    seed(0);
    mock.transfers[0] = { ...mock.transfers[0], worker_id: null, from_company_id: null, to_company_id: "holder" };
    const page = await TransfersPage({ searchParams: Promise.resolve({}) });
    expect(formLabels(page)).toContain("Withdraw request");
    expect(mock.tables).not.toContain("worker");
    expect(textIn(page)).not.toContain("Oldest Worker");
  });
});

describe("transfer queue pagination", () => {
  it("renders an old escalated Admin Review after 301 newer terminal requests", async () => {
    seed(301);
    const page = await AdminTransfersPage({ searchParams: Promise.resolve({ page: "7" }) });
    expect(textIn(page)).toContain("Old escalated request");
    expect(mock.ranges).toContainEqual([300, 350]);
  });

  it("keeps company history reachable past the implicit 1000-row response cap", async () => {
    seed(1001);
    const page = await TransfersPage({ searchParams: Promise.resolve({ page: "21" }) });
    expect(textIn(page)).toContain("Oldest Worker");
    expect(mock.tables).toContain("company_transfer_view");
    expect(mock.tables).not.toContain("worker_transfer");
    expect(mock.ranges).toContainEqual([1000, 1050]);
  });

  it("uses a unique order and non-overlapping bounded pages when creation timestamps tie", async () => {
    seed(120);
    const first = rowKeys(await AdminTransfersPage({ searchParams: Promise.resolve({ page: "1" }) }));
    const second = rowKeys(await AdminTransfersPage({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(first).toHaveLength(50);
    expect(second).toHaveLength(50);
    expect(first.some((id) => second.includes(id))).toBe(false);
    expect(mock.orders).toEqual(["created_at", "id", "created_at", "id"]);
  });

  it("preserves existing query parameters and offers working links all the way to the next page", () => {
    const search = { page: "7", notice: "completed", status: ["Admin Review", "Awaiting Current Employer"] };
    const pager = TransferQueuePagination({
      pathname: "/admin/transfers", search, shown: 50,
      pagination: { page: 7, hasNext: true, hasPrevious: true },
    });
    const links = hrefs(pager).map((href) => new URL(href, "https://maintain.test"));
    expect(links.map((url) => url.searchParams.get("page"))).toEqual([null, "6", "8"]);
    for (const url of links) {
      expect(url.pathname).toBe("/admin/transfers");
      expect(url.searchParams.get("notice")).toBe("completed");
      expect(url.searchParams.getAll("status")).toEqual(search.status);
    }
    expect(transferPageHref("/app/transfers", {}, 1)).toBe("/app/transfers");
  });

  it("does not show a next-page link past the final page and normalises invalid page input", () => {
    const pager = TransferQueuePagination({
      pathname: "/app/transfers", search: {}, shown: 2,
      pagination: { page: 21, hasNext: false, hasPrevious: true },
    });
    expect(hrefs(pager)).toEqual(["/app/transfers", "/app/transfers?page=20"]);
    for (const invalid of [undefined, "0", "-1", "2.5", "2oops", "9007199254740991", ["2", "3"]]) {
      expect(transferPageNumber(invalid)).toBe(1);
    }
    expect(transferPageNumber("21")).toBe(21);
  });
});
