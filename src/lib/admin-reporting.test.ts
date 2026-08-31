import { describe, expect, it } from "vitest";
import * as reporting from "./admin-reporting";
import {
  companyExportHref,
  normalizeCompanyReportFilters,
  normalizeWorkerReportFilters,
  workerExportHref,
} from "./admin-reporting";

type CollectReportPages = <T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message?: string } | null;
    count: number | null;
  }>,
  report: string,
  batchSize?: number,
) => Promise<T[]>;

describe("admin reporting filters", () => {
  it("accepts only supported company statuses", () => {
    expect(normalizeCompanyReportFilters({ status: "Suspended" })).toEqual({
      status: "Suspended",
    });
    expect(normalizeCompanyReportFilters({ status: "not-a-status" })).toEqual({
      status: "",
    });
    expect(normalizeCompanyReportFilters({ status: ["Active", "Closed"] })).toEqual({
      status: "",
    });
  });

  it("normalizes worker status and UUID trade filters independently", () => {
    expect(
      normalizeWorkerReportFilters({
        status: "Inactive",
        trade: "A3B52C30-4E6B-4D6B-A8E7-1C2F176BDBB0",
      }),
    ).toEqual({
      status: "Inactive",
      trade: "a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0",
    });
    expect(
      normalizeWorkerReportFilters({ status: "pending", trade: "not-a-uuid" }),
    ).toEqual({ status: "", trade: "" });
  });

  it("builds deterministic export links from validated filters only", () => {
    expect(companyExportHref({ status: "Active" })).toBe(
      "/admin/companies/export?status=Active",
    );
    expect(companyExportHref({ status: "" })).toBe("/admin/companies/export");

    expect(
      workerExportHref({
        status: "Suspended",
        trade: "a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0",
      }),
    ).toBe(
      "/admin/workers/export?status=Suspended&trade=a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0",
    );
    expect(workerExportHref({ status: "", trade: "" })).toBe(
      "/admin/workers/export",
    );
  });

  it("normalizes URLSearchParams with the same contract as page search params", () => {
    const company = new URLSearchParams("status=Closed&status=Active");
    const worker = new URLSearchParams(
      "status=Active&trade=a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0",
    );

    expect(normalizeCompanyReportFilters(company)).toEqual({ status: "Closed" });
    expect(normalizeWorkerReportFilters(worker)).toEqual({
      status: "Active",
      trade: "a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0",
    });
  });

  it("normalizes a bounded positive report page", () => {
    const normalizeReportPage = Reflect.get(reporting, "normalizeReportPage") as
      | ((params: Record<string, string | string[] | undefined>) => number)
      | undefined;

    expect(normalizeReportPage).toBeTypeOf("function");
    expect(normalizeReportPage?.({ page: "3" })).toBe(3);
    expect(normalizeReportPage?.({ page: "0" })).toBe(1);
    expect(normalizeReportPage?.({ page: "not-a-page" })).toBe(1);
    expect(normalizeReportPage?.({ page: ["2", "3"] })).toBe(1);
  });

  it("preserves filters in deterministic list pagination links", () => {
    const companyPageHref = Reflect.get(reporting, "companyPageHref") as
      | ((filters: { status: "Active" | "" }, page: number) => string)
      | undefined;
    const workerPageHref = Reflect.get(reporting, "workerPageHref") as
      | ((
          filters: { status: "Suspended" | ""; trade: string },
          page: number,
        ) => string)
      | undefined;

    expect(companyPageHref).toBeTypeOf("function");
    expect(companyPageHref?.({ status: "Active" }, 2)).toBe(
      "/admin/companies?status=Active&page=2",
    );
    expect(companyPageHref?.({ status: "" }, 1)).toBe("/admin/companies");
    expect(workerPageHref).toBeTypeOf("function");
    expect(
      workerPageHref?.(
        {
          status: "Suspended",
          trade: "a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0",
        },
        4,
      ),
    ).toBe(
      "/admin/workers?status=Suspended&trade=a3b52c30-4e6b-4d6b-a8e7-1c2f176bdbb0&page=4",
    );
  });

  it("collects every explicit query page beyond the Supabase row cap", async () => {
    const collectReportPages = Reflect.get(reporting, "collectReportPages") as
      | CollectReportPages
      | undefined;
    const source = Array.from({ length: 1_205 }, (_, id) => ({ id: String(id) }));
    const ranges: [number, number][] = [];

    expect(collectReportPages).toBeTypeOf("function");
    const rows = await collectReportPages?.(
      async (from, to) => {
        ranges.push([from, to]);
        return { data: source.slice(from, to + 1), error: null, count: source.length };
      },
      "Regression report",
      500,
    );

    expect(rows).toEqual(source);
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });
});
