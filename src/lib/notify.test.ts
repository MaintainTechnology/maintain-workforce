import { describe, expect, it, vi, beforeEach } from "vitest";

// The definition of done requires that every trigger in 15.2 writes a Notification row
// and sends via Resend, and that a forced provider failure does not block the workflow
// that triggered it. Both are tested here against mocked edges, because the point is
// the control flow around the send, not the SMTP conversation.

const rows: Array<Record<string, unknown>> = [];
const updates: Array<Record<string, unknown>> = [];
const sendMock = vi.fn();
let insertError: { message: string } | null = null;
let sentUpdateError: { message: string } | null = null;
let failedUpdateError: { message: string } | null = null;
let selectedRow: Record<string, unknown> | null = null;
let selectError: { message: string } | null = null;
let insertThrows = false;
let finishThrows = false;

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "finish_notification_delivery" || name === "record_notification_delivery_uncertain") {
        updates.push(args);
        if (finishThrows) throw new Error("database connection lost");
        const error = args.p_provider_message_id ? sentUpdateError : failedUpdateError;
        return { data: error ? null : true, error };
      }
      if (name === "claim_notification_retry") {
        return { data: selectedRow && { ...selectedRow, claim_token: "retry-lease" }, error: selectError };
      }
      const row = rows[Number(String(args.p_notification_id).slice(1)) - 1];
      return { data: row && { ...row, id: args.p_notification_id, attempt: 1, claim_token: "initial-lease" }, error: null };
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        rows.push(row);
        return {
          select: () => ({
            single: async () => {
              if (insertThrows) throw new Error("notification connection lost");
              return insertError
                ? { data: null, error: insertError }
                : { data: { id: `n${rows.length}` }, error: null };
            },
          }),
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: selectedRow, error: selectError }),
        }),
      }),
    }),
  }),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("../../emails/notification-email", () => ({
  NotificationEmail: (props: unknown) => props,
}));

const { notify, retryNotification, NOTIFICATION_TRIGGERS } = await import("./notify");

beforeEach(() => {
  rows.length = 0;
  updates.length = 0;
  sendMock.mockReset();
  insertError = null;
  sentUpdateError = null;
  failedUpdateError = null;
  selectedRow = null;
  selectError = null;
  insertThrows = false;
  finishThrows = false;
  process.env.RESEND_API_KEY = "test-key";
  process.env.APP_BASE_URL = "https://example.test";
});

describe("notification catalogue (15.2)", () => {
  it("is exhaustive and stable — every trigger is a distinct string", () => {
    const values = Object.values(NOTIFICATION_TRIGGERS);
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBeGreaterThanOrEqual(25);
  });

  it("covers every event the spec body mandates", () => {
    // Named explicitly so a future edit that drops one fails here rather than
    // silently sending nothing — 15.2 says an unlisted event sends nothing.
    for (const key of [
      "COMPANY_REGISTERED", "ABN_COLLISION_REVIEW", "COMPANY_VERIFIED", "COMPANY_REJECTED",
      "ADMIN_INVITATION", "TRANSFER_REQUESTED", "TRANSFER_APPROVED", "TRANSFER_DECLINED",
      "TRANSFER_ESCALATED", "TRANSFER_COMPLETED_CASCADE", "NEW_CAPACITY", "NEW_DEMAND",
      "MATCH_PROPOSED", "SUPPLIER_ACCEPTED", "MATCH_DECLINED_BY_PARTY", "MATCH_AUTO_DECLINED",
      "MATCH_EXPIRED", "MATCH_WITHDRAWN", "NOMINATION_KNOCKED_OUT",
      "COMMERCIAL_TRIGGER_REQUIRED", "ENGAGEMENT_CONFIRMED", "ENGAGEMENT_CANCELLED",
      "CREDENTIAL_EXPIRING", "CREDENTIAL_EXPIRED", "NO_RATE_BAND",
    ]) {
      expect(NOTIFICATION_TRIGGERS).toHaveProperty(key);
    }
  });
});

describe("notify (15.1)", () => {
  it("writes the Notification row before attempting the send", async () => {
    sendMock.mockResolvedValue({ data: { id: "sent" }, error: null });
    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.MATCH_PROPOSED,
      to: "supplier@example.test",
      subject: "A match is waiting on you",
      body: "Open the app to review it.",
      actionPath: "/app/matches",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      trigger: NOTIFICATION_TRIGGERS.MATCH_PROPOSED,
      recipient_email: "supplier@example.test",
      subject: "A match is waiting on you",
      body: "Open the app to review it.",
      action_url: "https://example.test/app/matches",
    });
    expect(result.sent).toBe(true);
    expect(result.status).toBe("sent");
    expect(updates[0]).toMatchObject({
      p_provider_message_id: "sent",
      p_claim_token: "initial-lease",
    });
  });

  it("does not send when the Notification row cannot be inserted", async () => {
    insertError = { message: "notification insert denied" };
    sendMock.mockResolvedValue({ data: { id: "should-not-send" }, error: null });

    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.MATCH_PROPOSED,
      to: "supplier@example.test",
      subject: "A match is waiting on you",
      body: "Open the app to review it.",
    });

    expect(result.sent).toBe(false);
    expect(result.status).toBe("failed");
    expect(sendMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("records a resolved Resend error and does not mark the notification sent", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "provider rejected recipient", statusCode: 422 },
    });

    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.ADMIN_INVITATION,
      to: "invitee@example.test",
      subject: "Invitation",
      body: "Open the secure link.",
    });

    expect(result.sent).toBe(false);
    expect(result.status).toBe("failed");
    expect(updates.some((update) => update.p_provider_message_id)).toBe(false);
    expect(updates[0]?.p_failure_reason).toBe(
      "provider rejected recipient",
    );
  });

  it("reports provider delivery even when sent-state persistence fails", async () => {
    sentUpdateError = { message: "database unavailable after delivery" };
    sendMock.mockResolvedValue({ data: { id: "provider-42" }, error: null });

    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.MATCH_PROPOSED,
      to: "supplier@example.test",
      subject: "A match is waiting on you",
      body: "Open the app.",
    });

    expect(result).toMatchObject({
      sent: true,
      status: "delivered_unrecorded",
      providerMessageId: "provider-42",
      persistenceError: "database unavailable after delivery",
    });
  });

  it("reports when provider-failure persistence also fails", async () => {
    failedUpdateError = { message: "failed_at write denied" };
    sendMock.mockResolvedValue({ data: null, error: { message: "mailbox rejected", statusCode: 422 } });

    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.ADMIN_INVITATION,
      to: "invitee@example.test",
      subject: "Invitation",
      body: "Open the app.",
    });

    expect(result).toMatchObject({
      sent: false,
      status: "failed",
      reason: "mailbox rejected",
      failureRecorded: false,
      persistenceError: "failed_at write denied",
    });
  });

  it("does not block the workflow when the provider fails, and records why", async () => {
    sendMock.mockRejectedValue(new Error("provider down"));

    // The call resolves rather than throwing: a failed email must never roll back
    // the match, engagement or transfer that triggered it.
    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.ENGAGEMENT_CONFIRMED,
      to: "buyer@example.test",
      subject: "Engagement confirmed",
      body: "Open the app for the details.",
    });

    expect(result.sent).toBe(false);
    expect(rows).toHaveLength(1);
    const failure = updates.find((u) => u.p_failure_reason);
    expect(failure).toBeDefined();
    expect(failure?.p_failure_reason).toMatch(/outcome is unknown: provider down/);
  });

  it("records a failure when the provider is not configured at all", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await notify({
      trigger: NOTIFICATION_TRIGGERS.NEW_DEMAND,
      to: "ops@example.test",
      subject: "New requirement",
      body: "Open the app.",
    });
    expect(result.sent).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(updates.some((u) => u.p_failure_reason)).toBe(true);
  });

  it("retries only the stored payload and updates the same row's attempt state", async () => {
    selectedRow = {
      id: "bdfdbedc-f831-42f0-9108-fc763683c860",
      recipient_email: "stored@example.test",
      subject: "Stored subject",
      body: "Stored body",
      action_url: "https://example.test/app/matches/stored",
      attempt: 2,
    };
    sendMock.mockResolvedValue({ data: { id: "retry-provider-id" }, error: null });

    const result = await retryNotification(
      "bdfdbedc-f831-42f0-9108-fc763683c860",
      "user_maintain_admin",
    );

    expect(result).toMatchObject({ sent: true, status: "sent" });
    expect(rows).toHaveLength(0);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "stored@example.test",
        subject: "Stored subject",
        text: "Stored body\n\nhttps://example.test/app/matches/stored",
      }),
      expect.objectContaining({ idempotencyKey: "notification-bdfdbedc-f831-42f0-9108-fc763683c860-attempt-2" }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        p_provider_message_id: "retry-provider-id",
        p_attempt: 2,
        p_failure_reason: null,
        p_claim_token: "retry-lease",
      }),
    );
  });

  it("does not re-send an already delivered row", async () => {
    selectError = { message: "Notification has already been sent" };

    const result = await retryNotification(
      "bdfdbedc-f831-42f0-9108-fc763683c860",
      "user_maintain_admin",
    );

    expect(result).toMatchObject({ sent: false, reason: expect.stringMatching(/already been sent/i) });
    expect(sendMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("keeps legacy rows visible but does not invent a retry payload", async () => {
    selectError = { message: "Legacy notification has no stored delivery payload" };

    const result = await retryNotification(
      "bdfdbedc-f831-42f0-9108-fc763683c860",
      "user_maintain_admin",
    );

    expect(result).toMatchObject({ sent: false, reason: expect.stringMatching(/legacy/i) });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not throw on a rejected insert/network promise", async () => {
    insertThrows = true;
    await expect(notify({ trigger: NOTIFICATION_TRIGGERS.NEW_DEMAND, to: "ops@example.test", subject: "Event", body: "Open the app." }))
      .resolves.toMatchObject({ sent: false, failureRecorded: false });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("never reports a delivered email as failed when sent-state persistence throws", async () => {
    finishThrows = true;
    sendMock.mockResolvedValue({ data: { id: "provider-accepted" }, error: null });
    const result = await notify({ trigger: NOTIFICATION_TRIGGERS.NEW_DEMAND, to: "ops@example.test", subject: "Event", body: "Open the app." });
    expect(result).toMatchObject({ sent: true, status: "delivered_unrecorded", providerMessageId: "provider-accepted" });
    expect(updates).toHaveLength(1);
    expect(updates[0].p_failure_reason).toBeNull();
  });

  it("does not throw when provider failure and failure persistence both reject", async () => {
    finishThrows = true;
    sendMock.mockRejectedValue(new Error("provider connection lost"));
    await expect(notify({ trigger: NOTIFICATION_TRIGGERS.NEW_DEMAND, to: "ops@example.test", subject: "Event", body: "Open the app." }))
      .resolves.toMatchObject({ sent: false, failureRecorded: false, persistenceError: "database connection lost" });
  });
});
