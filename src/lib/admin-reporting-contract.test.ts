import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function callOrder(file: string, first: string, second: string): void {
  expect(file.indexOf(first)).toBeGreaterThanOrEqual(0);
  expect(file.indexOf(second)).toBeGreaterThan(file.indexOf(first));
}

describe("Companies and Workers reporting contract", () => {
  it("authorizes each export before invoking a service-role report loader", () => {
    for (const [path, loader] of [
      ["src/app/(admin)/admin/companies/export/route.ts", "listAdminCompanies"],
      ["src/app/(admin)/admin/workers/export/route.ts", "listAdminWorkers"],
    ] as const) {
      callOrder(source(path), "await requireMaintainAdmin()", `await ${loader}(`);
    }
  });

  it("uses the same validated report loader for each list and its export", () => {
    for (const [pagePath, exportPath, normalizer, loader] of [
      [
        "src/app/(admin)/admin/companies/page.tsx",
        "src/app/(admin)/admin/companies/export/route.ts",
        "normalizeCompanyReportFilters",
        "listAdminCompanies",
      ],
      [
        "src/app/(admin)/admin/workers/page.tsx",
        "src/app/(admin)/admin/workers/export/route.ts",
        "normalizeWorkerReportFilters",
        "listAdminWorkers",
      ],
    ] as const) {
      const page = source(pagePath);
      const route = source(exportPath);
      expect(page).toContain(normalizer);
      expect(route).toContain(normalizer);
      expect(page).toContain(`await ${loader}(filters,`);
      expect(route).toContain(`await ${loader}(filters,`);
      expect(page).not.toContain("createAdminClient");
      expect(route).not.toContain("createAdminClient");
    }
  });

  it("keeps every supported filter in the shared query layer", () => {
    const reporting = source("src/lib/admin-reporting.ts");

    expect(reporting).toContain('query.eq("status", filters.status)');
    expect(reporting).toContain('workerQuery.eq("status", filters.status)');
    expect(reporting).toContain(
      'workerQuery.eq("primary_trade_id", filters.trade)',
    );
  });

  it("renders filter-aware download links rather than fixed export URLs", () => {
    const companies = source("src/app/(admin)/admin/companies/page.tsx");
    const workers = source("src/app/(admin)/admin/workers/page.tsx");

    expect(companies).toContain("companyExportHref(filters)");
    expect(workers).toContain("workerExportHref(filters)");
    expect(companies).not.toMatch(/href=["']\/admin\/companies\/export["']/);
    expect(workers).not.toMatch(/href=["']\/admin\/workers\/export["']/);
  });

  it("uses explicit pagination for lists and exhaustive pagination for exports", () => {
    const reporting = source("src/lib/admin-reporting.ts");
    const companies = source("src/app/(admin)/admin/companies/page.tsx");
    const workers = source("src/app/(admin)/admin/workers/page.tsx");
    const companyExport = source(
      "src/app/(admin)/admin/companies/export/route.ts",
    );
    const workerExport = source("src/app/(admin)/admin/workers/export/route.ts");

    expect(reporting).not.toContain(".limit(500)");
    expect(reporting).toContain("collectReportPages");
    expect(companies).toContain("normalizeReportPage");
    expect(companies).toContain('kind: "page"');
    expect(companies).toContain("Previous");
    expect(companies).toContain("Next");
    expect(workers).toContain("normalizeReportPage");
    expect(workers).toContain('kind: "page"');
    expect(workers).toContain("Previous");
    expect(workers).toContain("Next");
    expect(companyExport).toContain('kind: "all"');
    expect(workerExport).toContain('kind: "all"');
  });
});
