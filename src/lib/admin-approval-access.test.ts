import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), admin: vi.fn(), rpc: vi.fn(), notify: vi.fn(), revalidate: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: io.auth, currentUser: io.currentUser }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw Object.assign(new Error(url), { url }); } }));
vi.mock("next/cache", () => ({ revalidatePath: io.revalidate }));
vi.mock("@/lib/clerk", () => ({ consumeCompanyInvitation: vi.fn(), findUserByEmail: vi.fn(), inviteAdministrator: vi.fn(), userHasSignedIn: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: io.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: io.notify, NOTIFICATION_TRIGGERS: { COMPANY_VERIFIED: "company verified" } }));

// Exercise the real server action and its real auth guard. Provider I/O is mocked,
// so these approval tests cannot change a customer account or send an email.
const { approveCompany } = await import("./actions/company");
const companyId = "13131313-0000-4000-8000-000000000010";
const staff = { id: "user_staff", primaryEmailAddress: { emailAddress: "staff@example.test" }, publicMetadata: { isAdmin: true }, twoFactorEnabled: false };
function approval() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ company_id: companyId, expected_status: "Pending", isAdmin: "true", actor_user_id: "forged" })) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  io.auth.mockResolvedValue({ userId: staff.id, factorVerificationAge: [0, -1], sessionClaims: { metadata: { isAdmin: true } } });
  io.currentUser.mockResolvedValue(staff);
  io.admin.mockReturnValue({ rpc: io.rpc });
  io.rpc.mockResolvedValue({ data: { company_id: companyId, status_before: "Pending", status_after: "Active", contact_email: "company@example.test", withdrawn_matches: [] }, error: null });
  io.notify.mockResolvedValue(undefined);
});

describe("metadata-authorized company approval", () => {
  it("allows isAdmin staff to approve incomplete accounts and attributes the decision to the signed-in user", async () => {
    await expect(approveCompany(approval())).rejects.toMatchObject({ url: "/admin/verification?saved=approved" });
    expect(io.rpc).toHaveBeenCalledExactlyOnceWith("approve_company_as_maintain_atomic", {
      p_company_id: companyId, p_expected_status: "Pending", p_actor_user_id: staff.id,
    });
    expect(io.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      subject: "Your company account is active",
      body: "Maintain has approved your company account. You can now list spare capacity and post requirements.",
    }));
    expect(io.revalidate).toHaveBeenCalledWith("/(app)", "layout");
  });

  it.each([{}, { isAdmin: false, role: "maintain_admin" }, { isAdmin: "true" }])("blocks forged or revoked permission before privileged database access (%j)", async (publicMetadata) => {
    io.currentUser.mockResolvedValue({ ...staff, publicMetadata, unsafeMetadata: { isAdmin: true } });
    await expect(approveCompany(approval())).rejects.toMatchObject({ url: "/app" });
    expect(io.admin).not.toHaveBeenCalled();
    expect(io.notify).not.toHaveBeenCalled();
  });

  it("blocks signed-out approval", async () => {
    io.auth.mockResolvedValue({ userId: null });
    await expect(approveCompany(approval())).rejects.toMatchObject({ url: "/signin" });
    expect(io.admin).not.toHaveBeenCalled();
  });

  it("preserves second-factor verification for an enrolled administrator", async () => {
    io.currentUser.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    await expect(approveCompany(approval())).rejects.toMatchObject({ url: "/admin/mfa" });
    expect(io.admin).not.toHaveBeenCalled();
  });

  it("does not turn the metadata flag into permission to overwrite a newer status", async () => {
    io.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "company status changed; refresh before retrying" } });
    await expect(approveCompany(approval())).rejects.toMatchObject({ url: expect.stringContaining("error=stale") });
    expect(io.notify).not.toHaveBeenCalled();
    expect(io.revalidate).not.toHaveBeenCalled();
  });
});
