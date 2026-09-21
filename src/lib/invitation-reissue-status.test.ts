import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyStatus } from "@/lib/supabase/types";

const io = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
  getUserList: vi.fn(),
  getUser: vi.fn(),
  createInvitation: vi.fn(),
  updateUserMetadata: vi.fn(),
  from: vi.fn(),
  membership: vi.fn(),
  membershipFilter: vi.fn(),
  auditInsert: vi.fn(),
  notificationInsert: vi.fn(),
  rpc: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw Object.assign(new Error(`redirect:${url}`), { url });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: io.auth,
  currentUser: io.currentUser,
  clerkClient: io.clerkClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: io.from, rpc: io.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => { throw new Error("Unexpected request-scoped database client"); },
}));
vi.mock("resend", () => ({
  Resend: class { emails = { send: io.sendEmail }; },
}));

// Exercise the real action, auth/status/MFA checks, Clerk helper, audit and outbox.
// Only framework control flow and provider/database I/O are replaced; no live sends.
const { reissueInvitation } = await import("./actions/company");

const OWN_COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "user_company_admin";
const STAFF_ID = "user_maintain_admin";
const INVITEE = "invitee@example.test";

function companyMembership(status: CompanyStatus) {
  return {
    data: {
      company_id: OWN_COMPANY,
      accepted_at: "2026-08-28T00:00:00Z",
      company: { status },
    },
    error: null,
  };
}

function invitationForm() {
  const form = new FormData();
  form.set("email", " Invitee@Example.Test ");
  // Neither an alternate company nor a claimed role may elevate a company caller.
  form.set("company_id", OTHER_COMPANY);
  form.set("role", "maintain_admin");
  return form;
}

async function destination(form = invitationForm()): Promise<string> {
  try {
    await reissueInvitation(form);
  } catch (error) {
    if (error instanceof Error && "url" in error) return String(error.url);
    throw error;
  }
  throw new Error("Expected reissueInvitation to redirect");
}

function expectNoInvitationEffects() {
  expect(io.clerkClient).not.toHaveBeenCalled();
  expect(io.getUserList).not.toHaveBeenCalled();
  expect(io.getUser).not.toHaveBeenCalled();
  expect(io.createInvitation).not.toHaveBeenCalled();
  expect(io.updateUserMetadata).not.toHaveBeenCalled();
  expect(io.auditInsert).not.toHaveBeenCalled();
  expect(io.notificationInsert).not.toHaveBeenCalled();
  expect(io.rpc).not.toHaveBeenCalled();
  expect(io.sendEmail).not.toHaveBeenCalled();
}

function maintainSession(twoFactorEnabled: boolean, factorVerificationAge: unknown) {
  io.auth.mockResolvedValue({ userId: STAFF_ID, factorVerificationAge });
  io.currentUser.mockResolvedValue({
    id: STAFF_ID,
    primaryEmailAddress: { emailAddress: "staff@example.test" },
    publicMetadata: { role: "maintain_admin" },
    twoFactorEnabled,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  io.auth.mockResolvedValue({ userId: MEMBER_ID, factorVerificationAge: [0, -1] });
  io.currentUser.mockResolvedValue({
    id: MEMBER_ID,
    primaryEmailAddress: { emailAddress: "member@example.test" },
    publicMetadata: {},
    twoFactorEnabled: false,
  });
  io.clerkClient.mockResolvedValue({
    users: {
      getUserList: io.getUserList,
      getUser: io.getUser,
      updateUserMetadata: io.updateUserMetadata,
    },
    invitations: { createInvitation: io.createInvitation },
  });
  io.getUserList.mockResolvedValue({ data: [] });
  io.createInvitation.mockResolvedValue({ id: "invitation_fixture" });
  io.membership.mockResolvedValue(companyMembership("Pending"));
  io.auditInsert.mockResolvedValue({ error: null });
  io.notificationInsert.mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: "notification_fixture" }, error: null }) }),
  });
  // Keep the real outbox path, but do not claim a delivery or reach an email provider.
  io.rpc.mockResolvedValue({ data: null, error: null });
  const membershipQuery = {
    select: () => membershipQuery,
    eq: io.membershipFilter,
    maybeSingle: io.membership,
  };
  io.membershipFilter.mockReturnValue(membershipQuery);
  io.from.mockImplementation((table: string) => {
    if (table === "company_user") return membershipQuery;
    if (table === "audit_event") return { insert: io.auditInsert };
    if (table === "notification") return { insert: io.notificationInsert };
    throw new Error(`Unexpected table: ${table}`);
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("invitation reissue company write boundary", () => {
  it.each(["Suspended", "Closed"] as const)(
    "blocks an accepted %s company member before any invitation effects",
    async (status) => {
      io.membership.mockResolvedValue(companyMembership(status));
      const redirectedTo = await destination();
      expect({
        redirectedTo,
        lookups: io.getUserList.mock.calls.length,
        invitations: io.createInvitation.mock.calls.length,
        audits: io.auditInsert.mock.calls.length,
        notifications: io.notificationInsert.mock.calls.length,
      }).toEqual({
        redirectedTo: "/app/settings?error=read_only",
        lookups: 0,
        invitations: 0,
        audits: 0,
        notifications: 0,
      });
      expectNoInvitationEffects();
      expect(io.from).toHaveBeenCalledExactlyOnceWith("company_user");
      expect(io.membershipFilter).toHaveBeenCalledExactlyOnceWith("user_id", MEMBER_ID);
    },
  );

  it.each(["Pending", "Active"] as const)(
    "allows %s company members but ignores forged company and role fields",
    async (status) => {
      io.membership.mockResolvedValue(companyMembership(status));
      expect(await destination()).toBe("/app/settings?saved=invited");
      expect(io.membershipFilter).toHaveBeenCalledExactlyOnceWith("user_id", MEMBER_ID);
      expect(io.getUserList).toHaveBeenCalledExactlyOnceWith({ emailAddress: [INVITEE], limit: 1 });
      expect(io.createInvitation).toHaveBeenCalledExactlyOnceWith({
        emailAddress: INVITEE,
        redirectUrl: "https://app.example.test/signup",
        ignoreExisting: true,
        expiresInDays: 3,
        publicMetadata: { company_id: OWN_COMPANY, invited_email: INVITEE },
      });
      expect(io.auditInsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        actor_user_id: MEMBER_ID,
        action: "company_user.invitation_reissued",
        after_data: { company_id: OWN_COMPANY, email: INVITEE },
      }));
      expect(io.notificationInsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        recipient_email: INVITEE,
        recipient_company_id: OWN_COMPANY,
      }));
      expect(io.rpc).toHaveBeenCalledExactlyOnceWith("claim_queued_notification", {
        p_notification_id: "notification_fixture",
      });
      expect(io.sendEmail).not.toHaveBeenCalled();
    },
  );

  it("still requires authentication", async () => {
    io.auth.mockResolvedValue({ userId: null });
    io.currentUser.mockResolvedValue(null);
    expect(await destination()).toBe("/signin");
    expect(io.from).not.toHaveBeenCalled();
    expectNoInvitationEffects();
  });

  it("still requires acceptance of a company membership", async () => {
    const membership = companyMembership("Active");
    io.membership.mockResolvedValue({
      ...membership,
      data: { ...membership.data, accepted_at: null },
    });
    expect(await destination()).toBe("/accept-invitation");
    expectNoInvitationEffects();
  });

  it("preserves the MFA-verified Maintain-admin recovery path without a company membership", async () => {
    maintainSession(true, [3, 1]);
    expect(await destination()).toBe("/admin/companies?saved=invited");
    expect(io.membership).not.toHaveBeenCalled();
    expect(io.createInvitation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      publicMetadata: { company_id: OTHER_COMPANY, invited_email: INVITEE },
    }));
    expect(io.auditInsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actor_user_id: STAFF_ID,
      after_data: { company_id: OTHER_COMPANY, email: INVITEE },
    }));
    expect(io.notificationInsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      recipient_company_id: OTHER_COMPANY,
    }));
  });

  it.each([
    { label: "enrollment without session proof", enrolled: true, ages: [0, -1] },
    { label: "missing session claims", enrolled: true, ages: undefined },
  ])("denies Maintain admins with $label before invitation effects", async ({ enrolled, ages }) => {
    maintainSession(enrolled, ages);
    expect(await destination()).toBe("/admin/mfa");
    expect(io.from).not.toHaveBeenCalled();
    expectNoInvitationEffects();
  });

  it("allows isAdmin staff who have not enabled MFA through the same audited action", async () => {
    maintainSession(false, [0, -1]);
    io.currentUser.mockResolvedValue({
      id: STAFF_ID, primaryEmailAddress: { emailAddress: "staff@example.test" },
      publicMetadata: { isAdmin: true }, twoFactorEnabled: false,
    });
    expect(await destination()).toBe("/admin/companies?saved=invited");
    expect(io.membership).not.toHaveBeenCalled();
    expect(io.createInvitation).toHaveBeenCalledOnce();
    expect(io.auditInsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ actor_user_id: STAFF_ID }));
  });
});
