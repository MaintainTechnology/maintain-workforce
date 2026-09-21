import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), limit: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(),
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
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), NOTIFICATION_TRIGGERS: {} }));

const { updateCompanyProfile } = await import("./actions/company");
const companyId = "28282828-0000-4000-8000-000000000010";
const regionId = "28282828-0000-4000-8000-000000000020";
const industryId = "28282828-0000-4000-8000-000000000030";
const expectedProfile = {
  legal_name: "Redgum Civil Pty Ltd",
  trading_name: "Redgum Works",
  abn: null,
  industry_id: industryId,
  contact_name: "Morgan Reid",
  contact_email: "morgan@example.test",
  contact_phone: "0400000000",
  primary_region_id: regionId,
  operating_region_ids: [regionId],
};

function profileForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    expected_profile: JSON.stringify(expectedProfile),
    legal_name: "Redgum Civil Pty Ltd", trading_name: "Redgum Civil", abn: "",
    industry_id: industryId,
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
  mocks.rpc.mockResolvedValue({
    data: {
      ...expectedProfile,
      trading_name: "Redgum Civil",
      company_id: companyId,
      status: "Active",
    },
    error: null,
  });
  mocks.limit.mockResolvedValue({ data: [], error: null });
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    limit: mocks.limit,
  };
  mocks.from.mockReturnValue(query);
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
});

describe("company profile refreshes the persistent workspace", () => {
  it.each(["Pending", "Active"])("atomically saves and refreshes a %s company's profile", async (companyStatus) => {
    mocks.gate.mockResolvedValueOnce({ user: { id: "user_company_admin" }, companyId, companyStatus });
    mocks.rpc.mockResolvedValueOnce({
      data: { ...expectedProfile, trading_name: "Redgum Civil", company_id: companyId, status: companyStatus },
      error: null,
    });

    await expect(updateCompanyProfile(profileForm())).rejects.toMatchObject({ url: "/app/settings?saved=profile" });

    expect(mocks.rpc).toHaveBeenCalledWith("update_company_profile_atomic", expect.objectContaining({
      p_company_id: companyId,
      p_expected_status: companyStatus,
      p_expected_profile: expectedProfile,
      p_actor_user_id: "user_company_admin",
      p_actor_scope: "company",
      p_trading_name: "Redgum Civil",
      p_operating_region_ids: [regionId],
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/(app)", "layout");
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidatePath.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it.each(["Suspended", "Closed"])("does not touch data or refresh a blocked %s account", async (companyStatus) => {
    mocks.gate.mockResolvedValueOnce({ user: { id: "user_company_admin" }, companyId, companyStatus });
    await expect(updateCompanyProfile(profileForm())).rejects.toMatchObject({ url: "/app/settings?error=read_only" });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not open a privileged client for invalid input or a missing snapshot", async () => {
    const form = profileForm();
    form.delete("expected_profile");
    await expect(updateCompanyProfile(form)).rejects.toMatchObject({ url: "/app/settings?error=invalid" });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["40001", "stale"],
    ["23505", "abn_collision"],
    ["23514", "invalid"],
  ])("does not refresh or report success for database error %s", async (code, problem) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
    await expect(updateCompanyProfile(profileForm())).rejects.toMatchObject({
      url: `/app/settings?error=${problem}`,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a stable collision error without creating profile-review work", async () => {
    const form = profileForm();
    form.set("abn", "51 824 753 556");
    mocks.limit.mockResolvedValueOnce({
      data: [{ id: "28282828-0000-4000-8000-000000000099" }],
      error: null,
    });

    await expect(updateCompanyProfile(form)).rejects.toMatchObject({
      url: "/app/settings?error=abn_collision",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("company");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("explains a late ABN uniqueness collision without claiming a review was created", () => {
    const settings = readFileSync(
      join(process.cwd(), "src/app/(app)/app/settings/page.tsx"),
      "utf8",
    );
    expect(settings).toContain("abn_collision:");
    expect(settings).toContain(
      "That ABN was registered by another company before this change was saved. Contact Maintain for help.",
    );
  });
});
