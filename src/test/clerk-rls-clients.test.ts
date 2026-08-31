import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClerkClient: vi.fn(),
  createSession: vi.fn(),
  getToken: vi.fn(),
  revokeSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({ createClerkClient: mocks.createClerkClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { createClerkRlsClients } from "./clerk-rls-clients";

const config = {
  url: "https://fixture.supabase.co",
  anonKey: "fixture-anon",
  clerkSecretKey: "sk_test_fixture",
  userIds: ["user_fixtureA", "user_fixtureB"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClerkClient.mockReturnValue({
    sessions: {
      createSession: mocks.createSession,
      getToken: mocks.getToken,
      revokeSession: mocks.revokeSession,
    },
  });
  mocks.createSession.mockImplementation(async ({ userId }: { userId: string }) => ({
    id: `session_${userId}`,
  }));
  mocks.getToken.mockResolvedValue({ jwt: "fixture-jwt" });
  mocks.revokeSession.mockResolvedValue({});
  mocks.createClient.mockImplementation((url, key, options) => ({ url, key, options }));
});

describe("Clerk-backed live RLS fixture clients", () => {
  it("refuses production keys and malformed fixture ids before creating any session", async () => {
    expect(() => createClerkRlsClients({ ...config, clerkSecretKey: "sk_live_no" }))
      .toThrow(/development/i);
    expect(() => createClerkRlsClients({ ...config, userIds: ["user_fixtureA", ""] }))
      .toThrow(/fixture user/i);
    expect(mocks.createClerkClient).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("carries fresh Clerk supabase-template tokens without Supabase password sessions", async () => {
    const fixture = createClerkRlsClients(config);
    expect(await fixture.ready).toHaveLength(2);
    expect(mocks.createSession).toHaveBeenCalledWith({ userId: "user_fixtureA" });
    expect(mocks.createSession).toHaveBeenCalledWith({ userId: "user_fixtureB" });
    const options = mocks.createClient.mock.calls[0][2];
    expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false });
    mocks.getToken.mockResolvedValueOnce({ jwt: "refreshed-fixture-jwt" });
    await expect(options.accessToken()).resolves.toBe("refreshed-fixture-jwt");
    expect(mocks.getToken).toHaveBeenLastCalledWith("session_user_fixtureA", "supabase");
    await fixture.close();
  });

  it("fails closed if Clerk cannot issue the configured RLS token", async () => {
    mocks.getToken.mockResolvedValue({ jwt: "" });
    await expect(createClerkRlsClients(config).ready).rejects.toThrow(/fixture session/i);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revokeSession).toHaveBeenCalledTimes(2);
  });

  it("waits for all in-flight creations and revokes successful sessions after partial setup failure", async () => {
    let finishLate!: (session: { id: string }) => void;
    const lateSession = new Promise<{ id: string }>((resolve) => { finishLate = resolve; });
    mocks.createSession.mockImplementation(({ userId }: { userId: string }) => (
      userId === "user_fixtureA" ? Promise.reject(new Error("fixture missing")) : lateSession
    ));
    const setup = createClerkRlsClients(config).ready;
    const failure = expect(setup).rejects.toThrow(/fixture session/i);
    await Promise.resolve();
    expect(mocks.revokeSession).not.toHaveBeenCalled();
    finishLate({ id: "session_created_by_this_test" });
    await failure;
    expect(mocks.revokeSession).toHaveBeenCalledExactlyOnceWith("session_created_by_this_test");
  });

  it("revokes only newly created sessions and makes successful cleanup idempotent", async () => {
    const fixture = createClerkRlsClients(config);
    await fixture.ready;
    await fixture.close();
    await fixture.close();
    expect(mocks.revokeSession.mock.calls).toEqual([
      ["session_user_fixtureA"], ["session_user_fixtureB"],
    ]);
  });

  it("surfaces cleanup failures and allows retrying only the failed revocations", async () => {
    const fixture = createClerkRlsClients(config);
    await fixture.ready;
    mocks.revokeSession.mockRejectedValueOnce(new Error("temporary failure"));
    await expect(fixture.close()).rejects.toThrow(/revoke 1/i);
    await fixture.close();
    expect(mocks.revokeSession.mock.calls).toEqual([
      ["session_user_fixtureA"], ["session_user_fixtureB"], ["session_user_fixtureA"],
    ]);
  });

  it("exposes cleanup before setup and revokes late-created sessions after the caller closes", async () => {
    const pending = new Map<string, (session: { id: string }) => void>();
    mocks.createSession.mockImplementation(({ userId }: { userId: string }) =>
      new Promise((resolve) => { pending.set(userId, resolve); }));
    const fixture = createClerkRlsClients(config);
    expect(typeof fixture.close).toBe("function");
    const setupFailure = expect(fixture.ready).rejects.toThrow(/fixture session/i);
    // Equivalent to afterAll running after a beforeAll timeout, before setup
    // returns. The cleanup handle must already exist at this point.
    const cleanup = fixture.close();
    pending.get("user_fixtureA")!({ id: "session_lateA" });
    pending.get("user_fixtureB")!({ id: "session_lateB" });
    await cleanup;
    await setupFailure;
    expect(mocks.revokeSession.mock.calls).toEqual([["session_lateA"], ["session_lateB"]]);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("revokes already-known sessions immediately even while token setup is still pending", async () => {
    let finishTokens!: (token: { jwt: string }) => void;
    const tokens = new Promise((resolve) => { finishTokens = resolve; });
    mocks.getToken.mockReturnValue(tokens);
    const fixture = createClerkRlsClients(config);
    const setupFailure = expect(fixture.ready).rejects.toThrow(/fixture session/i);
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(2));
    const cleanup = fixture.close();
    await vi.waitFor(() => expect(mocks.revokeSession).toHaveBeenCalledTimes(2));
    finishTokens({ jwt: "late-token-not-a-real-credential" });
    await cleanup;
    await setupFailure;
    expect(mocks.revokeSession).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("shares concurrent cleanup and refuses token refresh after closure", async () => {
    const fixture = createClerkRlsClients(config);
    await fixture.ready;
    const options = mocks.createClient.mock.calls[0][2];
    const first = fixture.close();
    const second = fixture.close();
    expect(first).toBe(second);
    await first;
    expect(mocks.revokeSession).toHaveBeenCalledTimes(2);
    mocks.getToken.mockClear();
    await expect(options.accessToken()).rejects.toThrow(/closed/i);
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
