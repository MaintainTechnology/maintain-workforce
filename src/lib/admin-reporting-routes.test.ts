import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  requireMaintainAdmin: vi.fn(),
  listAdminCompanies: vi.fn(),
  listAdminWorkers: vi.fn(),
  normalizeCompanyReportFilters: vi.fn(() => ({ status: "Active" })),
  normalizeWorkerReportFilters: vi.fn(() => ({ status: "Inactive", trade: "" })),
}));

vi.mock("@/lib/auth", () => ({
  requireMaintainAdmin: mocks.requireMaintainAdmin,
}));

vi.mock("@/lib/admin-reporting", () => ({
  listAdminCompanies: mocks.listAdminCompanies,
  listAdminWorkers: mocks.listAdminWorkers,
  normalizeCompanyReportFilters: mocks.normalizeCompanyReportFilters,
  normalizeWorkerReportFilters: mocks.normalizeWorkerReportFilters,
}));

const companyRoute = await import("../app/(admin)/admin/companies/export/route");
const workerRoute = await import("../app/(admin)/admin/workers/export/route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.requireMaintainAdmin.mockImplementation(async () => {
    mocks.events.push("auth");
  });
  mocks.listAdminCompanies.mockImplementation(async () => {
    mocks.events.push("companies");
    return { rows: [] };
  });
  mocks.listAdminWorkers.mockImplementation(async () => {
    mocks.events.push("workers");
    return { rows: [], trades: [], proficienciesByTrade: new Map() };
  });
});

describe("Companies and Workers CSV routes", () => {
  it("authorizes before loading the filtered Companies report", async () => {
    const response = await companyRoute.GET(
      new Request("https://maintain.example/admin/companies/export?status=Active"),
    );

    expect(mocks.events).toEqual(["auth", "companies"]);
    expect(mocks.normalizeCompanyReportFilters).toHaveBeenCalledOnce();
    expect(mocks.listAdminCompanies).toHaveBeenCalledWith(
      { status: "Active" },
      { kind: "all" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="companies-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it("authorizes before loading the filtered Workers report", async () => {
    const response = await workerRoute.GET(
      new Request("https://maintain.example/admin/workers/export?status=Inactive"),
    );

    expect(mocks.events).toEqual(["auth", "workers"]);
    expect(mocks.normalizeWorkerReportFilters).toHaveBeenCalledOnce();
    expect(mocks.listAdminWorkers).toHaveBeenCalledWith(
      { status: "Inactive", trade: "" },
      { kind: "all" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="workers-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it("never reaches a service-role loader when authorization fails", async () => {
    mocks.requireMaintainAdmin.mockRejectedValueOnce(new Error("unauthorized"));

    await expect(
      companyRoute.GET(new Request("https://maintain.example/admin/companies/export")),
    ).rejects.toThrow("unauthorized");
    expect(mocks.listAdminCompanies).not.toHaveBeenCalled();
  });
});
