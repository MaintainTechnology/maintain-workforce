"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireMaintainAdmin } from "@/lib/auth";
import { retryNotification } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

const retrySchema = z.object({ notification_id: z.string().uuid() });

/** Maintain-only, AAL2-gated retry of the payload already stored on one row. */
export async function retryNotificationAction(
  _previous: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const actor = await requireMaintainAdmin();
  const parsed = retrySchema.safeParse({ notification_id: formData.get("notification_id") });
  if (!parsed.success) {
    return { ok: false, errors: { notification_id: "Notification id is invalid." } };
  }

  // Authorization intentionally precedes this service-role read. The form carries
  // only an id; the recipient and copy are reloaded from the immutable server row.
  const admin = createAdminClient();
  const { data: before, error } = await admin
    .from("notification")
    .select("id, recipient_email, trigger, sent_at, failed_at, attempt_count")
    .eq("id", parsed.data.notification_id)
    .maybeSingle();
  if (error || !before) {
    return { ok: false, message: error?.message ?? "Notification was not found." };
  }

  await audit({
    actor: { userId: actor.id },
    action: "notification.retry_requested",
    entityType: "notification",
    entityId: parsed.data.notification_id,
    before,
    after: { requested_attempt: Number(before.attempt_count ?? 0) + 1 },
  });

  const result = await retryNotification(parsed.data.notification_id, actor.id);
  revalidatePath("/admin/notifications");

  if (!result.sent) {
    return { ok: false, message: `Notification was not re-sent: ${result.reason}` };
  }
  if (result.status === "delivered_unrecorded") {
    return {
      ok: true,
      message: "Notification was delivered, but its sent state could not be recorded. Do not retry it again.",
    };
  }
  return { ok: true, message: "Notification re-sent." };
}
