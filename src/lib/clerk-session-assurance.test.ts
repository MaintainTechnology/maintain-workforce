import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  createAdminClient: vi.fn(),
  listAdminCompanies: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/clerk", () => ({ consumeCompanyInvitation: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/admin-reporting", () => ({
  listAdminCompanies: mocks.listAdminCompanies,
  normalizeCompanyReportFilters: () => ({ status: "" }),
}));
vi.mock("@clerk/nextjs", async () => {
  const { createElement } = await import("react");
  return {
    UserProfile: () => createElement("div", { "data-clerk-profile": true }),
    SignOutButton: ({ children, redirectUrl }: { children: ReactNode; redirectUrl: string }) =>
      createElement("div", { "data-sign-out-redirect": redirectUrl }, children),
  };
});

const { requireMaintainAdmin, requireMaintainAdminAtAal1 } = await import("./auth");
const { default: AdminMfaPage } = await import("../app/(admin)/admin/mfa/page");
const companyExport = await import("../app/(admin)/admin/companies/export/route");

const staffUser = {
  id: "user_staff",
  primaryEmailAddress: { emailAddress: "staff@example.com" },
  emailAddresses: [],
  publicMetadata: { role: "maintain_admin" },
  twoFactorEnabled: true,
};

function sessionWithAges(factorVerificationAge: unknown) {
  return {
    userId: staffUser.id,
    sessionId: "sess_staff",
    factorVerificationAge,
    sessionClaims: { sub: staffUser.id, sid: "sess_staff", fva: factorVerificationAge },
    // Clerk's convenience reverification check may downgrade to the first factor.
    has: vi.fn(() => true),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentUser.mockResolvedValue(staffUser);
  mocks.auth.mockResolvedValue(sessionWithAges([4, 0]));
  mocks.listAdminCompanies.mockResolvedValue({ rows: [] });
});

describe("Clerk Maintain admin session assurance", () => {
  it("does not treat enrollment or a permissive has() result as session MFA", async () => {
    mocks.auth.mockResolvedValue(sessionWithAges([0, -1]));

    await expect(requireMaintainAdmin()).rejects.toThrow("REDIRECT:/admin/mfa");
  });

  it.each([
    { label: "missing claim", ages: undefined },
    { label: "null claim", ages: null },
    { label: "empty tuple", ages: [] },
    { label: "short tuple", ages: [0] },
    { label: "long tuple", ages: [0, 0, 0] },
    { label: "unverified factors", ages: [-1, -1] },
    { label: "invalid negative age", ages: [0, -2] },
    { label: "string second age", ages: [0, "0"] },
    { label: "string first age", ages: ["0", 0] },
    { label: "NaN second age", ages: [0, NaN] },
    { label: "infinite second age", ages: [0, Infinity] },
    { label: "fractional second age", ages: [0, 0.5] },
    { label: "invalid first age", ages: [-2, 0] },
    { label: "NaN first age", ages: [NaN, 0] },
    { label: "infinite first age", ages: [Infinity, 0] },
  ])("fails closed for $label", async ({ ages }) => {
    mocks.auth.mockResolvedValue(sessionWithAges(ages));

    await expect(requireMaintainAdmin()).rejects.toThrow("REDIRECT:/admin/mfa");
  });

  it("does not substitute user metadata or legacy Supabase AAL claims for Clerk proof", async () => {
    mocks.auth.mockResolvedValue({
      ...sessionWithAges(null),
      sessionClaims: { aal: "aal2", metadata: { fva: [0, 0] } },
    });
    mocks.currentUser.mockResolvedValue({
      ...staffUser,
      publicMetadata: { role: "maintain_admin", fva: [0, 0], aal: "aal2" },
    });

    await expect(requireMaintainAdmin()).rejects.toThrow("REDIRECT:/admin/mfa");
  });

  it.each([
    { label: "just verified", ages: [0, 0] },
    { label: "previously verified in this session", ages: [1200, 1200] },
    { label: "first-factor age unavailable", ages: [-1, 0] },
  ])("accepts an enrolled admin with $label second-factor evidence", async ({ ages }) => {
    mocks.auth.mockResolvedValue(sessionWithAges(ages));

    await expect(requireMaintainAdmin()).resolves.toEqual({
      id: staffUser.id,
      email: "staff@example.com",
    });
  });

  it("still requires MFA enrollment", async () => {
    mocks.currentUser.mockResolvedValue({ ...staffUser, twoFactorEnabled: false });

    await expect(requireMaintainAdmin()).rejects.toThrow("REDIRECT:/admin/mfa");
  });

  it("still rejects signed-out and non-admin users", async () => {
    mocks.auth.mockResolvedValue({ userId: null, factorVerificationAge: null });
    await expect(requireMaintainAdmin()).rejects.toThrow("REDIRECT:/signin");

    mocks.auth.mockResolvedValue(sessionWithAges([0, 0]));
    mocks.currentUser.mockResolvedValue({ ...staffUser, publicMetadata: {} });
    await expect(requireMaintainAdmin()).rejects.toThrow("REDIRECT:/app");
  });

  it("keeps the role-only recovery guard reachable without session MFA", async () => {
    mocks.auth.mockResolvedValue(sessionWithAges([0, -1]));

    await expect(requireMaintainAdminAtAal1()).resolves.toEqual({
      id: staffUser.id,
      email: "staff@example.com",
    });
  });

  it("blocks direct report downloads before a service-role loader runs", async () => {
    mocks.auth.mockResolvedValue(sessionWithAges([0, -1]));

    await expect(
      companyExport.GET(new Request("https://maintain.example/admin/companies/export")),
    ).rejects.toThrow("REDIRECT:/admin/mfa");
    expect(mocks.listAdminCompanies).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe("Clerk MFA recovery page", () => {
  it("offers native sign-in again for an enrolled but unverified session without looping", async () => {
    mocks.auth.mockResolvedValue(sessionWithAges([0, -1]));
    const page = await AdminMfaPage({ searchParams: Promise.resolve({ next: "/admin/reports" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Sign out and verify again");
    expect(html).toContain('data-sign-out-redirect="/signin?redirect_url=%2Fadmin%2Freports"');
    expect(html).not.toContain("data-clerk-profile");
  });

  it("keeps Clerk enrollment available without granting access", async () => {
    mocks.currentUser.mockResolvedValue({ ...staffUser, twoFactorEnabled: false });
    mocks.auth.mockResolvedValue(sessionWithAges([0, -1]));
    const page = await AdminMfaPage({ searchParams: Promise.resolve({}) });

    expect(renderToStaticMarkup(page)).toContain("data-clerk-profile");
  });

  it("continues only when both enrollment and current-session proof exist", async () => {
    await expect(
      AdminMfaPage({ searchParams: Promise.resolve({ next: "/admin/companies" }) }),
    ).rejects.toThrow("REDIRECT:/admin/companies");
  });

  it.each([
    "/admin/mfa",
    "/admin/mfa/",
    "/admin/mfa?next=/admin",
    "/admin/%6dfa",
    "/admin/mfa#security",
    "/bad%encoding",
    "//evil.example",
  ])(
    "does not redirect back to the MFA page or off-origin for %s",
    async (next) => {
      await expect(AdminMfaPage({ searchParams: Promise.resolve({ next }) })).rejects.toThrow(
        /^REDIRECT:\/admin$/,
      );
    },
  );
});
