import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Engagement report route wiring", () => {
  it("uses the same server-only filtered loader for the list and CSV", () => {
    const page = source("src/app/(admin)/admin/engagements/page.tsx");
    const route = source("src/app/(admin)/admin/engagements/export/route.ts");
    const report = source("src/lib/admin-engagement-reporting.ts");
    expect(report).toMatch(/^import "server-only";/);
    for (const file of [page, route]) {
      expect(file).toContain("normalizeEngagementReportFilters");
      expect(file).toContain("await listAdminEngagements(filters,");
      expect(file).not.toContain("createAdminClient");
    }
    expect(page).toContain('kind: "page"');
    expect(route).toContain('kind: "all"');
  });

  it("renders every filter, filter-preserving export and explicit list navigation", () => {
    const page = source("src/app/(admin)/admin/engagements/page.tsx");
    expect(page).toContain("normalizeEngagementReportPage");
    expect(page).toContain("engagementExportHref(filters)");
    expect(page).toContain("engagementPageHref(filters,");
    expect(page).toContain("key={engagementPageHref(filters, 1)}");
    expect(page).toContain("Previous");
    expect(page).toContain("Next");
    for (const filter of ["status", "timing", "buyer", "supplier", "from", "to"]) {
      expect(page).toContain(`name="${filter}"`);
    }
  });

  it("reads details by exact id while retaining every lifecycle and actual-outcome control", () => {
    const detail = source("src/app/(admin)/admin/engagements/[id]/page.tsx");
    expect(detail).toContain("await getAdminEngagement(id)");
    expect(detail).not.toContain("adminEngagements()");
    for (const action of ["recordPaymentStatus", "completeEngagement", "disputeEngagement", "recordEngagementOutcome", "cancelEngagement"]) {
      expect(detail).toContain(`action={${action}}`);
    }
    expect(source("src/lib/actions/engagement.ts")).not.toContain("export async function adminEngagements");
  });

  it("shows Maintain compliance warnings on list and detail without adding automatic mutations", () => {
    const page = source("src/app/(admin)/admin/engagements/page.tsx");
    const detail = source("src/app/(admin)/admin/engagements/[id]/page.tsx");
    expect(page).toContain("row.compliance_review_count");
    expect(page).toContain("Maintain review");
    expect(detail).toContain("engagement.compliance_issues.map");
    expect(detail).toContain("Maintain compliance review");
    expect(detail).toContain("not been automatically cancelled");
    expect(source("src/lib/admin-engagement-reporting.ts")).not.toMatch(/\.(rpc|update|insert|delete)\(/);
  });
});
