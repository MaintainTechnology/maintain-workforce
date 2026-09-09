import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), client: vi.fn(), admin: vi.fn(), from: vi.fn(),
  update: vi.fn(), save: vi.fn(), removeRegions: vi.fn(), insertRegions: vi.fn(),
  audit: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireCompanyAdmin: mocks.gate,
  requireMaintainAdmin: vi.fn(), getUser: vi.fn(), isMaintainAdmin: vi.fn(),
}));
vi.mock("@/lib/clerk", () => ({
  findUserByEmail: vi.fn(), inviteAdministrator: vi.fn(), userHasSignedIn: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), NOTIFICATION_TRIGGERS: {} }));

const { updateCompanyProfile } = await import("./actions/company");
const companyId = "28282828-0000-4000-8000-000000000010";
const regionId = "28282828-0000-4000-8000-000000000020";

function profileForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    legal_name: "Redgum Civil Pty Ltd", trading_name: "Redgum Civil", abn: "",
    industry_id: "28282828-0000-4000-8000-000000000030",
    contact_name: "Morgan Reid", contact_email: "morgan@example.test",
    contact_phone: "0400000000", primary_region_id: regionId,
    operating_region_ids: regionId,
  })) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.gate.mockResolvedValue({
    user: { id: "user_company_admin", email: "morgan@example.test" },
    companyId, companyStatus: "Active",
  });
  mocks.redirect.mockImplementation((url: string): never => {
    throw Object.assign(new Error(url), { url });
  });
  mocks.save.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.save });
  mocks.removeRegions.mockResolvedValue({ error: null });
  mocks.insertRegions.mockResolvedValue({ error: null });
  mocks.audit.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => {
    if (table === "company") return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { legal_name: "Redgum Civil Pty Ltd", trading_name: "Redgum Works" } }) }),
      }),
      update: mocks.update,
    };
    if (table === "company_operating_region") return {
      delete: () => ({ eq: mocks.removeRegions }), insert: mocks.insertRegions,
    };
    throw new Error(`Unexpected profile table: ${table}`);
  });
  mocks.client.mockResolvedValue({ from: mocks.from });
});

describe("company profile refreshes the persistent workspace", () => {
  it.each(["Pending", "Active"])("refreshes the saved %s company's name after audit and before redirect", async (companyStatus) => {
    mocks.gate.mockResolvedValueOnce({ user: { id: "user_company_admin" }, companyId, companyStatus });

    await expect(updateCompanyProfile(profileForm())).rejects.toMatchObject({ url: "/app/settings?saved=profile" });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ trading_name: "Redgum Civil" }));
    expect(mocks.save).toHaveBeenCalledWith("id", companyId);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "company.profile_updated", entityId: companyId }));
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/(app)", "layout");
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidatePath.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it.each(["Suspended", "Closed"])("does not touch data or refresh a blocked %s account", async (companyStatus) => {
    mocks.gate.mockResolvedValueOnce({ user: { id: "user_company_admin" }, companyId, companyStatus });
    await expect(updateCompanyProfile(profileForm())).rejects.toMatchObject({ url: "/app/settings?error=read_only" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not refresh or open a data client for invalid input", async () => {
    const form = profileForm();
    form.delete("legal_name");
    await expect(updateCompanyProfile(form)).rejects.toMatchObject({ url: "/app/settings?error=invalid" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not refresh or continue writing after a failed profile save", async () => {
    mocks.save.mockResolvedValueOnce({ error: { message: "Profile update failed" } });
    await expect(updateCompanyProfile(profileForm())).rejects.toMatchObject({ url: "/app/settings?error=save_failed" });
    expect(mocks.removeRegions).not.toHaveBeenCalled();
    expect(mocks.insertRegions).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not refresh or report success when the audit fails", async () => {
    mocks.audit.mockRejectedValueOnce(new Error("Audit unavailable"));
    await expect(updateCompanyProfile(profileForm())).rejects.toThrow("Audit unavailable");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
