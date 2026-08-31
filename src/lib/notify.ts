import "server-only";
import { Resend } from "resend";
import { NotificationEmail } from "../../emails/notification-email";
import { createAdminClient } from "@/lib/supabase/admin";

// Notifications — spec module 15. Email only; SMS and push are out of MVP (15.4).

/**
 * 15.2 — the trigger catalogue is exhaustive: an event not listed here sends nothing,
 * and the definition-of-done test covers exactly this list. Adding a notification means
 * adding a key here first.
 */
export const NOTIFICATION_TRIGGERS = {
  COMPANY_REGISTERED: "company registered",
  ABN_COLLISION_REVIEW: "ABN-collision registration routed to review",
  COMPANY_VERIFIED: "company verified",
  COMPANY_REJECTED: "company rejected",
  ADMIN_INVITATION: "admin invitation",
  TRANSFER_REQUESTED: "transfer requested",
  TRANSFER_APPROVED: "transfer approved",
  TRANSFER_DECLINED: "transfer declined",
  TRANSFER_ESCALATED: "transfer escalated",
  TRANSFER_COMPLETED_CASCADE: "transfer completed — listings withdrawn and nominations auto-declined",
  NEW_CAPACITY: "new capacity",
  NEW_DEMAND: "new demand",
  MATCH_PROPOSED: "match proposed",
  SUPPLIER_ACCEPTED: "supplier accepted",
  MATCH_DECLINED_BY_PARTY: "match declined by a party",
  MATCH_AUTO_DECLINED: "match auto-Declined by knockout below minimum crew size",
  MATCH_EXPIRED: "match expired",
  MATCH_WITHDRAWN: "match withdrawn by Maintain",
  NOMINATION_KNOCKED_OUT: "nomination knocked out with substitution prompt",
  COMMERCIAL_TRIGGER_REQUIRED: "match accepted — commercial trigger required",
  ENGAGEMENT_CONFIRMED: "engagement confirmed",
  ENGAGEMENT_CANCELLED: "engagement cancelled",
  CREDENTIAL_EXPIRING: "document/qualification expiring in 30 days",
  CREDENTIAL_EXPIRED: "document or qualification expired",
  NO_RATE_BAND: "no applicable rate band on a capacity or demand line",
} as const;

export type NotificationTrigger =
  (typeof NOTIFICATION_TRIGGERS)[keyof typeof NOTIFICATION_TRIGGERS];

export type NotifyInput = {
  trigger: NotificationTrigger;
  to: string;
  companyId?: string | null;
  entityType?: string;
  entityId?: string;
  subject: string;
  /**
   * 15.3 — bodies carry no rates, no worker names, and no counterparty company names
   * before the related engagement is Confirmed. They state the event and deep-link
   * into the app, where the projections in 17.1 decide what the reader may see.
   */
  body: string;
  actionPath?: string;
  actionUrl?: string;
};

export type NotifyResult =
  | {
      sent: false;
      status: "deferred";
      reason: string;
    }
  | {
      sent: true;
      status: "sent";
      providerMessageId: string;
    }
  | {
      sent: true;
      status: "delivered_unrecorded";
      providerMessageId: string;
      persistenceError: string;
    }
  | {
      sent: false;
      status: "failed";
      reason: string;
      failureRecorded: boolean;
      persistenceError?: string;
    };

type AdminClient = ReturnType<typeof createAdminClient>;

type StoredNotification = {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  action_url: string | null;
  attempt: number;
  claim_token: string;
  outcome_unknown?: boolean;
};

const PROVIDER_DEADLINE_MS = 8_000;
const DISPATCH_BUDGET_MS = 35_000;

/** Covers the whole provider operation, including a response body that never ends. */
async function withProviderDeadline<T>(send: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Email provider did not acknowledge delivery within 8 seconds"));
    }, PROVIDER_DEADLINE_MS);
  });
  try {
    return await Promise.race([send(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 15.1 — the Notification row is written first so a failure is visible and re-sendable,
 * and a failed send never blocks the workflow that triggered it.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const admin = createAdminClient();
    const actionUrl = resolveActionUrl(input);
    const { data: row, error: rowError } = await admin
      .from("notification")
      .insert({
        trigger: input.trigger,
        recipient_email: input.to,
        recipient_company_id: input.companyId ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        subject: input.subject,
        body: input.body,
        action_url: actionUrl ?? null,
      })
      .select("id")
      .single();
    if (rowError || !row?.id) {
      return failed(rowError?.message ?? "Notification row was not returned");
    }
    return await claimAndDeliver(admin, row.id);
  } catch (error) {
    return failed(errorMessage(error));
  }
}

/**
 * Re-send the immutable payload already stored on a failed Notification row.
 * The admin action accepts only the row id; recipient and copy never round-trip
 * through a browser where they could be changed or widened.
 */
export async function retryNotification(id: string, actorUserId: string): Promise<NotifyResult> {
  try {
    return await claimAndDeliver(createAdminClient(), id, actorUserId);
  } catch (error) {
    return failed(errorMessage(error));
  }
}

/** Deliver an already-persisted outbox row without inserting a second notification. */
export async function deliverQueuedNotification(id: string): Promise<NotifyResult> {
  try {
    return await claimAndDeliver(createAdminClient(), id);
  } catch (error) {
    return failed(errorMessage(error));
  }
}

async function claimAndDeliver(admin: AdminClient, id: string, actorUserId?: string): Promise<NotifyResult> {
  const { data, error } = actorUserId === undefined
    ? await admin.rpc("claim_queued_notification", { p_notification_id: id })
    : await admin.rpc("claim_notification_retry", {
        p_notification_id: id,
        p_actor_user_id: actorUserId,
      });
  const row = data as StoredNotification | null;
  if (error) return failed(error.message);
  if (!row) {
    return { sent: false, status: "deferred", reason: "Already sent, failed, or claimed by another delivery." };
  }
  return deliverNotification(admin, row);
}

async function deliverNotification(
  admin: AdminClient,
  row: StoredNotification,
): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return recordFailure(admin, row, "RESEND_API_KEY is not configured");
  }

  let providerMessageId: string;
  try {
    const delivery = await withProviderDeadline((signal) => {
      // The installed SDK forwards these options to fetch. Keep the signal on the
      // options object so abort also stops its response-body reader where supported.
      const options = { idempotencyKey: `notification-${row.id}-attempt-${row.attempt}`, signal };
      return new Resend(apiKey).emails.send(
        {
          from: `Maintain Workforce <notifications@${emailDomain()}>`,
          to: row.recipient_email,
          subject: row.subject,
          react: NotificationEmail({
            heading: row.subject,
            body: row.body,
            actionUrl: row.action_url ?? undefined,
          }),
          // Plain-text alternative: some site offices read mail on a device that
          // renders nothing else, and the spec's audience is not a design studio.
          text: row.action_url ? `${row.body}\n\n${row.action_url}` : row.body,
        },
        options,
      );
    });
    // A transport failure (or missing acknowledgement) is not proof that the
    // provider rejected the email. Do not advance its idempotency key on retry.
    const rejectionCode = delivery.error?.statusCode;
    const explicitRejection = typeof rejectionCode === "number" && rejectionCode >= 400 && rejectionCode < 500 &&
      rejectionCode !== 408 && rejectionCode !== 409;
    if ((delivery.error && !explicitRejection) || (!delivery.error && !delivery.data?.id)) {
      return recordUncertainDelivery(admin, row, delivery.error?.message ?? "Email provider returned no acknowledgement");
    }
    if (delivery.error) {
      return recordFailure(
        admin,
        row,
        delivery.error.message,
      );
    }
    providerMessageId = delivery.data!.id;
  } catch (error) {
    return recordUncertainDelivery(admin, row, errorMessage(error));
  }

  // Once the provider accepted the email, a thrown DB/network error must NOT be
  // mistaken for a provider failure. Leave the lease recoverable with its same key.
  try {
    const { data, error } = await admin.rpc("finish_notification_delivery", {
      p_notification_id: row.id,
      p_claim_token: row.claim_token,
      p_attempt: row.attempt,
      p_provider_message_id: providerMessageId,
      p_failure_reason: null,
    });
    if (error || data !== true) {
      throw new Error(error?.message ?? "Delivery lease changed before its result was recorded");
    }
    return { sent: true, status: "sent", providerMessageId };
  } catch (error) {
    return { sent: true, status: "delivered_unrecorded", providerMessageId, persistenceError: errorMessage(error) };
  }
}

async function recordFailure(
  admin: AdminClient,
  row: StoredNotification,
  reason: string,
): Promise<Extract<NotifyResult, { status: "failed" }>> {
  // A failed retry cannot tell us whether an earlier request with this key was
  // delivered. Retain that uncertainty even for local config errors or HTTP 4xx.
  if (row.outcome_unknown) return recordUncertainDelivery(admin, row, reason);
  try {
    const { data, error } = await admin.rpc("finish_notification_delivery", {
      p_notification_id: row.id,
      p_claim_token: row.claim_token,
      p_attempt: row.attempt,
      p_provider_message_id: null,
      p_failure_reason: reason,
    });
    if (error || data !== true) throw new Error(error?.message ?? "Delivery lease changed");
    return { sent: false, status: "failed", reason, failureRecorded: true };
  } catch (error) {
    return { ...failed(reason), persistenceError: errorMessage(error) };
  }
}

async function recordUncertainDelivery(
  admin: AdminClient,
  row: StoredNotification,
  detail: string,
): Promise<Extract<NotifyResult, { status: "failed" }>> {
  const reason = `Email delivery outcome is unknown: ${detail}. Check the provider receipt before retrying.`;
  try {
    const { data, error } = await admin.rpc("record_notification_delivery_uncertain", {
      p_notification_id: row.id,
      p_claim_token: row.claim_token,
      p_attempt: row.attempt,
      p_failure_reason: reason,
    });
    if (error || data !== true) throw new Error(error?.message ?? "Delivery lease changed");
    return { sent: false, status: "failed", reason, failureRecorded: true };
  } catch (error) {
    return { ...failed(reason), persistenceError: errorMessage(error) };
  }
}

function failed(reason: string): Extract<NotifyResult, { status: "failed" }> {
  return { sent: false, status: "failed", reason, failureRecorded: false };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown notification failure";
}

export type NotificationDispatchSummary = {
  sent: number;
  failed: number;
  deferred: number;
  budgetExhausted: boolean;
};

/**
 * Keyset pagination avoids skipping rows as successful sends leave the outbox.
 * A bounded batch leaves unclaimed rows durable for the next invocation or an
 * explicit Maintain retry instead of running past the cron execution limit.
 */
export async function dispatchPendingNotifications(timeBudgetMs = DISPATCH_BUDGET_MS): Promise<NotificationDispatchSummary> {
  const admin = createAdminClient();
  const result = { sent: 0, failed: 0, deferred: 0, budgetExhausted: false };
  const startedAt = performance.now();
  const budget = Math.max(0, Math.min(timeBudgetMs, DISPATCH_BUDGET_MS));
  let afterId: string | undefined;
  for (;;) {
    if (performance.now() - startedAt >= budget) return { ...result, budgetExhausted: true };
    let query = admin.from("notification").select("id")
      .is("sent_at", null).is("failed_at", null)
      .not("subject", "is", null).not("body", "is", null)
      .order("id", { ascending: true }).limit(100);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error(`Notification outbox could not be read: ${error.message}`);
    if (!data?.length) break;
    for (let offset = 0; offset < data.length; offset += 5) {
      if (performance.now() - startedAt >= budget) {
        return { ...result, budgetExhausted: true };
      }
      const deliveries = await Promise.all(data.slice(offset, offset + 5).map((row) => deliverQueuedNotification(row.id)));
      for (const delivery of deliveries) {
        if (delivery.sent) result.sent += 1;
        else if (delivery.status === "deferred") result.deferred += 1;
        else result.failed += 1;
      }
    }
    afterId = data[data.length - 1].id;
  }
  return result;
}

function resolveActionUrl(input: Pick<NotifyInput, "actionPath" | "actionUrl">): string | undefined {
  if (input.actionUrl) return input.actionUrl;
  if (!input.actionPath) return undefined;
  const base =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://maintainworkforce.com.au";
  try {
    return new URL(input.actionPath, base).toString();
  } catch {
    return undefined;
  }
}

function emailDomain(): string {
  const base = process.env.APP_BASE_URL ?? "https://maintainworkforce.com.au";
  try {
    return new URL(base).hostname.replace(/^www\./, "");
  } catch {
    return "maintainworkforce.com.au";
  }
}
