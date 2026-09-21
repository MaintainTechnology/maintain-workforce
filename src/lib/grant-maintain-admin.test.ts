import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  getUserList: vi.fn(),
  updateUserMetadata: vi.fn(),
  replaceUserMetadata: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: io }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (table: string) => {
    if (table !== "audit_event") throw new Error(`Unexpected table ${table}`);
    return { insert: io.insert };
  } }),
}));

const previousMetadata = {
  isAdmin: false,
  role: "maintain_admin",
  company_id: "company_1",
  preferences: { alerts: true },
};
const target = { id: "user_staff", publicMetadata: previousMetadata, twoFactorEnabled: false };
const operator = { id: "user_operator" };
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_stub");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.argv = ["node", "grant-maintain-admin.mjs", "STAFF@example.test", "--by", "operator@example.test"];
  process.exitCode = undefined;
  io.getUserList.mockResolvedValueOnce({ data: [target] }).mockResolvedValueOnce({ data: [operator] });
  io.updateUserMetadata.mockResolvedValue({});
  io.replaceUserMetadata.mockResolvedValue({});
  io.insert.mockResolvedValue({ error: null });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function runGrant() {
  await import("../../scripts/grant-maintain-admin.mjs");
}

describe("audited Clerk isAdmin grant", () => {
  it("grants the boolean flag without changing other metadata or requiring MFA enrollment", async () => {
    await runGrant();

    expect(io.updateUserMetadata).toHaveBeenCalledExactlyOnceWith("user_staff", {
      publicMetadata: { isAdmin: true },
    });
    expect(io.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actor_user_id: "user_operator",
      actor_is_system: false,
      action: "user.maintain_admin_granted",
      entity_id: "user_staff",
      before_data: { email: "staff@example.test", public_metadata: previousMetadata },
      after_data: {
        email: "staff@example.test",
        public_metadata: { ...previousMetadata, isAdmin: true },
        granted_by: "operator@example.test",
      },
    }));
    expect(previousMetadata.isAdmin).toBe(false);
    expect(io.replaceUserMetadata).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it.each(["returned", "thrown"])("restores the explicit denial and exact prior metadata after a %s audit failure", async (failure) => {
    if (failure === "returned") io.insert.mockResolvedValue({ error: { message: "audit unavailable" } });
    else io.insert.mockRejectedValue(new Error("audit unavailable"));

    await runGrant();

    expect(io.replaceUserMetadata).toHaveBeenCalledExactlyOnceWith("user_staff", {
      publicMetadata: previousMetadata,
    });
    expect(process.exitCode).toBe(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each(["target", "operator"])("refuses an unattributable grant when the %s account is absent", async (missing) => {
    io.getUserList.mockReset();
    if (missing === "target") io.getUserList.mockResolvedValue({ data: [] });
    else io.getUserList.mockResolvedValueOnce({ data: [target] }).mockResolvedValueOnce({ data: [] });

    await runGrant();

    expect(io.updateUserMetadata).not.toHaveBeenCalled();
    expect(io.insert).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports uncertain access when an unaudited grant cannot be rolled back", async () => {
    io.insert.mockResolvedValue({ error: { message: "audit unavailable" } });
    io.replaceUserMetadata.mockRejectedValue(new Error("Clerk unavailable"));

    await runGrant();

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("admin access state"));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("uncertain"));
    expect(console.log).not.toHaveBeenCalled();
  });
});
