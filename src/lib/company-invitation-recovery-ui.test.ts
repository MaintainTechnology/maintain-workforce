import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCompanyReportRow, CompanyMembership } from "./admin-reporting";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), currentUser: vi.fn(), listCompanies: vi.fn(), admin: vi.fn(),
  reissue: vi.fn(), setStatus: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => { throw Object.assign(new Error(url), { url }); },
}));
vi.mock("@/lib/clerk", () => ({ consumeCompanyInvitation: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/actions/company", () => ({ reissueInvitation: mocks.reissue, setCompanyStatus: mocks.setStatus }));
vi.mock("@/lib/admin-reporting", async (importOriginal) => ({
  ...await importOriginal<typeof import("./admin-reporting")>(),
  listAdminCompanies: mocks.listCompanies,
}));

const CompaniesPage = (await import("../app/(admin)/admin/companies/page")).default;
const companyId = "22222222-2222-4222-8222-222222222222";
const buttonText = "Re-issue first administrator invitation";
const staff = {
  id: "user_MaintainAdmin", primaryEmailAddress: { emailAddress: "maintain@example.test" },
  emailAddresses: [], publicMetadata: { role: "maintain_admin" }, twoFactorEnabled: true,
};

type CompanyFixture = Omit<AdminCompanyReportRow, "company_user" | "contact_email"> & {
  company_user?: CompanyMembership[] | null;
  contact_email?: string | null;
};

function company(overrides: Partial<CompanyFixture> = {}): CompanyFixture {
  return {
    id: companyId, legal_name: "Example Construction", trading_name: null, abn: null,
    status: "Pending", industry_name: null, primary_region_name: null, contact_name: "Sam",
    contact_email: "company-contact@example.test", contact_phone: null, worker_count: 0,
    created_at: "2026-08-31T00:00:00Z", company_user: [], ...overrides,
  };
}

type ElementProps = { children?: ReactNode; action?: unknown; type?: string; name?: string; value?: string };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function invitationForms(node: ReactNode) {
  return elements(node).filter((element) => element.type === "form" && element.props.action === mocks.reissue);
}

function hiddenValues(form: ReactNode): Record<string, string | undefined> {
  return Object.fromEntries(elements(form)
    .filter((element) => element.type === "input" && element.props.type === "hidden")
    .map((element) => [element.props.name, element.props.value]));
}

let companies: CompanyFixture[];
beforeEach(() => {
  vi.resetAllMocks();
  companies = [company()];
  mocks.auth.mockResolvedValue({ userId: staff.id, factorVerificationAge: [0, 0] });
  mocks.currentUser.mockResolvedValue(staff);
  mocks.listCompanies.mockImplementation(async () => ({
    rows: companies, pagination: { page: 1, pageSize: 100, hasPrevious: false, hasNext: false },
  }));
});

const page = () => CompaniesPage({ searchParams: Promise.resolve({}) });

describe("first company-administrator invitation recovery control", () => {
  it.each(["Pending", "Active"] as const)("offers an explicit existing-action form for a loginless %s company", async (status) => {
    companies = [company({ status })];
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain(buttonText);
    const forms = invitationForms(tree);
    expect(forms).toHaveLength(1);
    expect(hiddenValues(forms[0])).toEqual({ company_id: companyId, email: "company-contact@example.test" });
    expect(renderToStaticMarkup(forms[0])).toContain('type="submit"');
    expect(mocks.listCompanies).toHaveBeenCalledExactlyOnceWith({ status: "" }, { kind: "page", page: 1 });
    expect(mocks.reissue).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    { label: "null memberships", company_user: null },
    { label: "absent memberships", company_user: undefined },
  ])("handles $label without inventing a pending membership", async ({ company_user }) => {
    companies = [company({ company_user })];
    const tree = await page();
    expect(renderToStaticMarkup(tree)).toContain(buttonText);
    expect(invitationForms(tree)).toHaveLength(1);
    expect(hiddenValues(invitationForms(tree)[0])).toEqual({ company_id: companyId, email: "company-contact@example.test" });
    expect(companies[0].company_user).toBe(company_user);
    expect(mocks.reissue).not.toHaveBeenCalled();
  });

  it("binds each first invitation to that row's loaded company and contact, not query parameters", async () => {
    const otherId = "33333333-3333-4333-8333-333333333333";
    companies = [company(), company({ id: otherId, status: "Active", contact_email: "other-contact@example.test" })];
    const tree = await CompaniesPage({ searchParams: Promise.resolve({ company_id: "forged", email: "wrong@example.test" }) });
    renderToStaticMarkup(tree);
    expect(invitationForms(tree).map(hiddenValues)).toEqual([
      { company_id: companyId, email: "company-contact@example.test" },
      { company_id: otherId, email: "other-contact@example.test" },
    ]);
    expect(mocks.reissue).not.toHaveBeenCalled();
  });

  it.each(["Closed", "Suspended"] as const)("does not offer first-invitation recovery for a %s company", async (status) => {
    companies = [company({ status })];
    const tree = await page();
    expect(renderToStaticMarkup(tree)).not.toContain(buttonText);
    expect(invitationForms(tree)).toEqual([]);
  });

  it.each([null, undefined, "", " \t "])("does not offer first-invitation recovery with a missing contact email (%j)", async (contact_email) => {
    companies = [company({ contact_email })];
    const tree = await page();
    expect(renderToStaticMarkup(tree)).not.toContain(buttonText);
    expect(invitationForms(tree)).toEqual([]);
  });

  it.each([
    { label: "accepted membership", invited_email: "accepted@example.test", accepted_at: "2026-08-31T00:00:00Z" },
    { label: "membership without an email", invited_email: null, accepted_at: null },
    { label: "accepted membership without an email", invited_email: null, accepted_at: "2026-08-31T00:00:00Z" },
  ])("does not label a company with $label as needing its first administrator", async ({ invited_email, accepted_at }) => {
    companies = [company({ company_user: [{ user_id: "user_Member", invited_email, accepted_at }] })];
    const tree = await page();
    expect(renderToStaticMarkup(tree)).not.toContain(buttonText);
    expect(invitationForms(tree)).toEqual([]);
  });

  it("preserves legacy unaccepted-membership controls without adding a first-administrator fallback", async () => {
    companies = [company({ company_user: [
      { user_id: "user_Pending", invited_email: "legacy@example.test", accepted_at: null },
      { user_id: "user_Accepted", invited_email: "accepted@example.test", accepted_at: "2026-08-31T00:00:00Z" },
    ] })];
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    expect(html).not.toContain(buttonText);
    expect(html).toContain("Re-send legacy@example.test");
    expect(invitationForms(tree).map(hiddenValues)).toEqual([{ company_id: companyId, email: "legacy@example.test" }]);
    expect(mocks.reissue).not.toHaveBeenCalled();
  });
});

describe("invitation-recovery page authorization", () => {
  it.each([
    { label: "missing evidence", factorVerificationAge: undefined },
    { label: "unverified second factor", factorVerificationAge: [0, -1] },
    { label: "malformed evidence", factorVerificationAge: [0, "0"] },
  ])("does not load company details with $label", async ({ factorVerificationAge }) => {
    mocks.auth.mockResolvedValue({ userId: staff.id, factorVerificationAge });
    await expect(page()).rejects.toMatchObject({ url: "/admin/mfa" });
    expect(mocks.listCompanies).not.toHaveBeenCalled();
    expect(mocks.reissue).not.toHaveBeenCalled();
  });

  it("still requires second-factor enrollment", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, twoFactorEnabled: false });
    await expect(page()).rejects.toMatchObject({ url: "/admin/mfa" });
    expect(mocks.listCompanies).not.toHaveBeenCalled();
  });

  it("requires the Maintain role even with verified second-factor evidence", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {} });
    await expect(page()).rejects.toMatchObject({ url: "/app" });
    expect(mocks.listCompanies).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(page()).rejects.toMatchObject({ url: "/signin" });
    expect(mocks.listCompanies).not.toHaveBeenCalled();
  });
});
