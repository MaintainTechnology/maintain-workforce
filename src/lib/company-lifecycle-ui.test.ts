import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
describe("company lifecycle form contracts", () => {
  it("uses the same server-derived checklist as approval and supplies displayed status", () => {
    const page = source("src/app/(admin)/admin/verification/page.tsx");
    expect(page).toContain('.rpc("company_verification_checklist"');
    expect(page).toContain('name="expected_status"');
    expect(page).toContain('name="expected_abn" value={selected.abn ?? ""}');
    expect(page).toContain('name="qualification_id"');
    expect(page).toContain('selected.status === "Pending"');
    expect(page).toContain("<ApprovalSubmitButton");
    expect(page).toContain("outstandingLabels={outstanding.map((item) => item.label)}");
    expect(page).toContain("action={updatePendingCompanyProfileAsMaintain}");
    expect(page).toContain("Onboarding company details");
    for (const name of [
      "legal_name", "trading_name", "abn", "industry_id", "contact_name",
      "contact_email", "contact_phone", "primary_region_id", "operating_region_ids",
    ]) expect(page).toContain(`name=\"${name}\"`);
    expect(page).toContain('name="expected_profile"');
  });
  it("limits status controls to canonical targets, separately from report filters", () => {
    const page = source("src/app/(admin)/admin/companies/page.tsx");
    expect(page).toContain('name="expected_status" value={company.status}');
    expect(page).toContain("STATUS_TARGETS[company.status]");
    expect(page).toContain('Pending: ["Closed"]');
    expect(page).toContain('Active: ["Suspended", "Closed"]');
    expect(page).toContain('Suspended: ["Active", "Closed"]');
    expect(page).toContain("companyExportHref(filters)");
    expect(page).toContain("companyPageHref(filters, pagination.page + 1)");
  });
});
