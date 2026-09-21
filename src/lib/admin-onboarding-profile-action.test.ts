import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), admin: vi.fn(), from: vi.fn(), rpc: vi.fn(), limit: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string): never => { throw Object.assign(new Error(url), { url }); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireMaintainAdmin: mocks.gate,
  requireCompanyAdmin: vi.fn(), getUser: vi.fn(), isMaintainAdmin: vi.fn(),
}));
vi.mock("@/lib/clerk", () => ({
  findUserByEmail: vi.fn(), inviteAdministrator: vi.fn(), userHasSignedIn: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), NOTIFICATION_TRIGGERS: {} }));

const { updatePendingCompanyProfileAsMaintain } = await import("./actions/company");

const companyId = "30303030-0000-4000-8000-000000000010";
const industryId = "30303030-0000-4000-8000-000000000020";
const regionId = "30303030-0000-4000-8000-000000000030";
const snapshot = {
  legal_name: "Original Civil Pty Ltd",
  trading_name: "Original Civil",
  abn: null,
  industry_id: industryId,
  contact_name: "Alex Morgan",
  contact_email: "alex@example.test",
  contact_phone: "0400000000",
  primary_region_id: regionId,
  operating_region_ids: [regionId],
};

function profileForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    company_id: companyId,
    expected_status: "Pending",
    expected_profile: JSON.stringify(snapshot),
    legal_name: "Updated Civil Pty Ltd",
    trading_name: "Updated Civil",
    abn: "",
    industry_id: industryId,
    contact_name: "Taylor Morgan",
    contact_email: "taylor@example.test",
    contact_phone: "0411111111",
    primary_region_id: regionId,
    operating_region_ids: regionId,
    actor_user_id: "forged-actor",
    ...overrides,
  })) form.set(key, value);
  return form;
}

const result = {
  company_id: companyId,
  status: "Pending",
  legal_name: "Updated Civil Pty Ltd",
  trading_name: "Updated Civil",
  abn: null,
  industry_id: industryId,
  contact_name: "Taylor Morgan",
  contact_email: "taylor@example.test",
  contact_phone: "0411111111",
  primary_region_id: regionId,
  operating_region_ids: [regionId],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ id: "maintain-admin" });
  mocks.limit.mockResolvedValue({ data: [], error: null });
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    limit: mocks.limit,
  };
  mocks.from.mockReturnValue(query);
  mocks.rpc.mockResolvedValue({ data: result, error: null });
  mocks.admin.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
});

describe("Maintain onboarding-profile correction", () => {
  it("authenticates before opening a privileged database client", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("Admin access required"));
    await expect(updatePendingCompanyProfileAsMaintain(profileForm()))
      .rejects.toThrow("Admin access required");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects malformed profile data before any database call", async () => {
    const form = profileForm();
    form.delete("contact_phone");
    await expect(updatePendingCompanyProfileAsMaintain(form)).rejects.toMatchObject({
      url: `/admin/verification?company=${companyId}&error=invalid`,
    });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the authenticated staff identity and the displayed profile snapshot", async () => {
    await expect(updatePendingCompanyProfileAsMaintain(profileForm())).rejects.toMatchObject({
      url: `/admin/verification?company=${companyId}&saved=profile`,
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "update_company_profile_atomic",
      {
        p_company_id: companyId,
        p_expected_status: "Pending",
        p_expected_profile: snapshot,
        p_actor_user_id: "maintain-admin",
        p_actor_scope: "maintain",
        p_legal_name: "Updated Civil Pty Ltd",
        p_trading_name: "Updated Civil",
        p_abn: null,
        p_industry_id: industryId,
        p_contact_name: "Taylor Morgan",
        p_contact_email: "taylor@example.test",
        p_contact_phone: "0411111111",
        p_primary_region_id: regionId,
        p_operating_region_ids: [regionId],
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/verification");
    expect(mocks.revalidatePath.mock.invocationCallOrder.at(-1))
      .toBeLessThan(mocks.redirect.mock.invocationCallOrder.at(-1)!);
  });

  it.each([
    ["40001", "stale"],
    ["23505", "abn_collision"],
    ["23514", "invalid"],
  ])("maps database error %s to %s without reporting success", async (code, problem) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
    await expect(updatePendingCompanyProfileAsMaintain(profileForm())).rejects.toMatchObject({
      url: `/admin/verification?company=${companyId}&error=${problem}`,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
