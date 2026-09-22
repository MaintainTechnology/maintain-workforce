import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), currentUser: vi.fn(), admin: vi.fn(), client: vi.fn(),
  membership: vi.fn(), company: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
  clerkMiddleware: (handler: (auth: typeof mocks.auth, request: NextRequest) => unknown) =>
    (request: NextRequest) => handler(mocks.auth, request),
}));
vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => { throw Object.assign(new Error(url), { url }); },
  usePathname: () => "/app",
}));
vi.mock("@/lib/clerk", () => ({ consumeCompanyInvitation: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/app/onboarding/onboarding-form", () => ({
  OnboardingForm: () => createElement("form", { "aria-label": "Company setup" }),
}));

const { proxy } = await import("../proxy");
const { requireMaintainAdmin, requireCompanyAdmin, isMaintainAdmin } = await import("./auth");
const { default: ContinueAfterAuthentication } = await import("../app/auth/continue/page");
const { default: AppLayout } = await import("../app/(app)/layout");
const { default: OnboardingPage } = await import("../app/onboarding/page");
const { AdminTopBar } = await import("@/components/admin-navigation");

const staff = {
  id: "user_staff",
  primaryEmailAddress: { emailAddress: "staff@example.test" },
  emailAddresses: [],
  publicMetadata: { isAdmin: true },
  twoFactorEnabled: false,
};
const membership = {
  company_id: "11111111-1111-4111-8111-111111111111",
  accepted_at: "2026-09-21T00:00:00Z",
  company: { status: "Pending" },
};

function session(metadata: Record<string, unknown> = { role: "company_admin" }) {
  return {
    userId: staff.id,
    factorVerificationAge: [0, 0],
    sessionClaims: { metadata },
    redirectToSignIn: ({ returnBackUrl }: { returnBackUrl: string }) =>
      NextResponse.redirect(new URL(`/signin?redirect_url=${encodeURIComponent(returnBackUrl)}`, returnBackUrl)),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session());
  mocks.currentUser.mockResolvedValue(staff);
  mocks.membership.mockResolvedValue({ data: membership, error: null });
  mocks.company.mockResolvedValue({ data: { legal_name: "Test Company", trading_name: "" }, error: null });
  mocks.admin.mockReturnValue({
    from: (table: string) => {
      if (table === "industry" || table === "region") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) };
      }
      if (table !== "company_user") throw new Error(`Unexpected admin table: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: mocks.membership }) }) };
    },
  });
  mocks.client.mockResolvedValue({
    from: (table: string) => {
      if (table !== "company") throw new Error(`Unexpected company table: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: mocks.company }) }) };
    },
  });
});

describe("Maintain admin metadata activation", () => {
  it("lets isAdmin staff without MFA reach verification despite stale session metadata", async () => {
    mocks.auth.mockResolvedValue({ ...session(), factorVerificationAge: [0, -1] });
    const response = await proxy(
      new NextRequest("https://workforce.example/admin/verification"), {} as NextFetchEvent,
    );

    expect(response?.headers.get("location")).toBeNull();
    expect(response?.headers.get("x-middleware-request-x-pathname")).toBe("/admin/verification");
    await expect(requireMaintainAdmin()).resolves.toEqual({ id: staff.id, email: "staff@example.test" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects a revoked backend role even when the session still claims staff access", async () => {
    mocks.auth.mockResolvedValue(session({ isAdmin: true }));
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {} });

    await expect(requireMaintainAdmin()).rejects.toMatchObject({ url: "/app" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("still accepts legacy staff roles when the explicit isAdmin flag is absent", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: { role: "maintain_admin" } });
    await expect(requireMaintainAdmin()).resolves.toEqual({ id: staff.id, email: "staff@example.test" });
  });

  it.each([false, "true", "false", 1, 0, null])("denies an explicit non-boolean-true isAdmin value (%j), even with a legacy role", async (isAdmin) => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: { isAdmin, role: "maintain_admin" } });
    await expect(requireMaintainAdmin()).rejects.toMatchObject({ url: "/app" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("does not trust user-editable metadata or nested claims as public admin permission", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {}, unsafeMetadata: { isAdmin: true } });
    await expect(requireMaintainAdmin()).rejects.toMatchObject({ url: "/app" });
    expect(isMaintainAdmin({ metadata: { isAdmin: true }, user_metadata: { role: "maintain_admin" } })).toBe(false);
  });

  it("rejects a user that disappears during the backend access check", async () => {
    mocks.currentUser.mockResolvedValueOnce(staff).mockResolvedValueOnce(staff).mockResolvedValueOnce(null);
    await expect(requireMaintainAdmin()).rejects.toMatchObject({ url: "/app" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("requires current-session MFA for an administrator who already enabled it", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    mocks.auth.mockResolvedValue({ ...session(), factorVerificationAge: [0, -1] });
    await expect(requireMaintainAdmin()).rejects.toMatchObject({ url: "/admin/mfa" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("still redirects signed-out admin requests to Clerk sign-in", async () => {
    mocks.auth.mockResolvedValue({ ...session(), userId: null });
    const response = await proxy(
      new NextRequest("https://workforce.example/admin/verification"), {} as NextFetchEvent,
    );
    expect(response?.headers.get("location")).toContain("/signin?redirect_url=");
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it("routes a newly promoted company user directly to the admin dashboard after sign-in", async () => {
    await expect(ContinueAfterAuthentication()).rejects.toMatchObject({ url: "/admin" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("keeps accepted customers in their workspace and ignores client-editable roles", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {}, unsafeMetadata: { role: "maintain_admin" } });
    await expect(ContinueAfterAuthentication()).rejects.toMatchObject({ url: "/app" });
    expect(mocks.membership).toHaveBeenCalledOnce();
  });

  it("still requires invited company users to accept membership", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {} });
    mocks.membership.mockResolvedValue({ data: { ...membership, accepted_at: null } });
    await expect(ContinueAfterAuthentication()).rejects.toMatchObject({ url: "/accept-invitation" });
  });
});

describe("workspace activation access and status", () => {
  it("exposes the separate admin view to staff on desktop and mobile", async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: createElement("p", null, "Workspace content") }));
    expect([...html.matchAll(/href="\/admin"/g)]).toHaveLength(3);
    expect(html).toContain('aria-label="Switch to admin view"');
    expect(html).toContain("Verification is in progress");
  });

  it("does not show staff navigation for customer accounts or client-editable role metadata", async () => {
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {}, unsafeMetadata: { role: "maintain_admin" } });
    const html = renderToStaticMarkup(await AppLayout({ children: null }));
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain("Switch to admin view");
  });

  it("removes the Pending banner when the workspace reloads after approval", async () => {
    const before = renderToStaticMarkup(await AppLayout({ children: null }));
    expect(before).toContain("Verification is in progress");

    mocks.membership.mockResolvedValue({ data: { ...membership, company: { status: "Active" } } });
    const after = renderToStaticMarkup(await AppLayout({ children: null }));
    expect(after).not.toContain("Verification is in progress");
    expect(after).toContain("Active</span>");
  });
});

describe("admin and end-user view separation", () => {
  it("provides a visible user-view switch in the admin header", () => {
    const html = renderToStaticMarkup(createElement(AdminTopBar, { email: staff.primaryEmailAddress.emailAddress, signOut: null }));
    expect(html).toContain('aria-label="Switch to user view"');
    expect(html).toContain('href="/app"');
  });

  it("lets staff without a company reach setup instead of looping back to admin", async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    await expect(requireCompanyAdmin()).rejects.toMatchObject({ url: "/onboarding" });
    const html = renderToStaticMarkup(await OnboardingPage());
    expect(html).toContain("Set up your user workspace");
    expect(html).toContain('aria-label="Company setup"');
    expect(html).toContain('aria-label="Switch to admin view"');
  });

  it("uses the staff member's accepted company membership for user view", async () => {
    await expect(requireCompanyAdmin()).resolves.toMatchObject({
      companyId: membership.company_id,
      companyStatus: "Pending",
      user: { id: staff.id },
    });
    await expect(OnboardingPage()).rejects.toMatchObject({ url: "/app" });
  });

  it("does not bypass invitation acceptance for staff switching to user view", async () => {
    mocks.membership.mockResolvedValue({ data: { ...membership, accepted_at: null }, error: null });
    await expect(requireCompanyAdmin()).rejects.toMatchObject({ url: "/accept-invitation" });
    await expect(OnboardingPage()).rejects.toMatchObject({ url: "/accept-invitation" });
  });

  it("keeps customer setup separate from staff navigation", async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    mocks.currentUser.mockResolvedValue({ ...staff, publicMetadata: {} });
    const html = renderToStaticMarkup(await OnboardingPage());
    expect(html).toContain("Step 2 of 2");
    expect(html).not.toContain('href="/admin"');
  });

  it("requires sign-in for company setup", async () => {
    mocks.auth.mockResolvedValue({ ...session(), userId: null });
    await expect(OnboardingPage()).rejects.toMatchObject({ url: "/signup" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
