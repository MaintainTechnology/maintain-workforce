import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: mocks.rpc,
  from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: "notice-id" }, error: null }) }) }) }),
}) }));
vi.mock("../../emails/notification-email", () => ({ NotificationEmail: () => null }));
// Deliberately use the installed Resend SDK: a mock send() cannot prove that the
// deadline covers fetch AND parsing a response body after headers have arrived.
const { notify, retryNotification, NOTIFICATION_TRIGGERS } = await import("./notify");
const input = { trigger: NOTIFICATION_TRIGGERS.NEW_CAPACITY, to: "fixture@example.test", subject: "Fixture event", body: "Open the app." };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "re_test_fixture");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: name === "claim_queued_notification"
      ? { id: "notice-id", recipient_email: input.to, subject: input.subject, body: input.body, action_url: null, attempt: 1, claim_token: "lease-id" }
      : true,
    error: null,
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("bounded notification delivery through the real SDK", () => {
  it.each(["headers", "body"])("returns after a stalled %s without advancing the uncertain provider attempt", async (stage) => {
    mocks.fetch.mockImplementation(async () => stage === "headers"
      ? new Promise(() => {})
      : { ok: true, headers: new Headers(), json: () => new Promise(() => {}) });
    let settled = false;
    const result = notify(input).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(8_100);
    expect(settled).toBe(true);
    expect(await result).toMatchObject({ sent: false, status: "failed", failureRecorded: true, reason: expect.stringMatching(/outcome.*unknown/i) });
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("record_notification_delivery_uncertain", expect.objectContaining({ p_attempt: 1, p_claim_token: "lease-id" }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("finish_notification_delivery", expect.anything());
  });

  it("ignores a late parsed response after the deadline and keeps the retry on the same attempt", async () => {
    let resolveBody!: (value: unknown) => void;
    mocks.fetch.mockResolvedValue({ ok: true, headers: new Headers(), json: () => new Promise((resolve) => { resolveBody = resolve; }) });
    const result = notify(input);
    await vi.advanceTimersByTimeAsync(8_100);
    await result;
    resolveBody({ id: "late-provider-id" });
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "record_notification_delivery_uncertain")).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "finish_notification_delivery")).toHaveLength(0);
  });

  it("clears its timer after an acknowledged delivery", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "provider-id" }), { status: 200 }));
    await expect(notify(input)).resolves.toMatchObject({ sent: true, status: "sent", providerMessageId: "provider-id" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a server error uncertain instead of assuming the provider rejected the email", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ name: "internal_server_error", message: "Provider unavailable" }), { status: 500 }));
    await expect(notify(input)).resolves.toMatchObject({ sent: false, failureRecorded: true, reason: expect.stringMatching(/outcome.*unknown/i) });
    expect(mocks.rpc).toHaveBeenCalledWith("record_notification_delivery_uncertain", expect.objectContaining({ p_attempt: 1 }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("finish_notification_delivery", expect.anything());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("records an explicit provider rejection as a completed failed attempt", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", message: "Invalid recipient", statusCode: 422 }), { status: 422 }));
    await expect(notify(input)).resolves.toMatchObject({ sent: false, failureRecorded: true, reason: "Invalid recipient" });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notification_delivery", expect.objectContaining({ p_attempt: 1, p_failure_reason: "Invalid recipient" }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_notification_delivery_uncertain", expect.anything());
  });

  it("keeps a provider idempotency conflict uncertain instead of starting a second delivery key", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ name: "concurrent_idempotent_requests", message: "Same key is still in progress", statusCode: 409 }), { status: 409 }));
    await expect(notify(input)).resolves.toMatchObject({ sent: false, failureRecorded: true, reason: expect.stringMatching(/outcome.*unknown/i) });
    expect(mocks.rpc).toHaveBeenCalledWith("record_notification_delivery_uncertain", expect.objectContaining({ p_attempt: 1 }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("finish_notification_delivery", expect.anything());
  });

  it.each(["configuration", "rejection"])("does not forget an earlier uncertain send when its retry fails at %s", async (stage) => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_notification_retry"
      ? { id: "notice-id", recipient_email: input.to, subject: input.subject, body: input.body, action_url: null, attempt: 1, claim_token: "retry-lease", outcome_unknown: true }
      : true, error: null }));
    if (stage === "configuration") vi.stubEnv("RESEND_API_KEY", "");
    else mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", message: "Invalid recipient", statusCode: 422 }), { status: 422 }));
    await expect(retryNotification("notice-id", "user_maintain")).resolves.toMatchObject({ sent: false, failureRecorded: true, reason: expect.stringMatching(/outcome.*unknown/i) });
    expect(mocks.rpc).toHaveBeenCalledWith("record_notification_delivery_uncertain", expect.objectContaining({ p_attempt: 1, p_claim_token: "retry-lease" }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("finish_notification_delivery", expect.anything());
  });
});
