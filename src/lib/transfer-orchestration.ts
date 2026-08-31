import "server-only";

import { z } from "zod";
import { notifyWorkerStatusKnockouts } from "@/lib/match-orchestration";
import { notify, NOTIFICATION_TRIGGERS, type NotificationTrigger } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

const transferResultSchema = z.object({
  transfer_id: z.uuid(),
  status: z.enum(["Requested", "Awaiting Current Employer", "Admin Review", "Approved", "Completed", "Declined", "Withdrawn"]),
  from_company_id: z.uuid().nullable(),
  to_company_id: z.uuid(),
  transition: z.enum(["requested", "approve", "decline", "withdraw", "review", "escalated"]),
  created: z.boolean().optional(),
  lines_touched: z.number().int().nonnegative(),
  knockouts: z.array(z.object({
    match_id: z.uuid(),
    changed: z.boolean(),
    status_before: z.string(),
    status_after: z.string(),
  })),
});
export type TransferRpcResult = z.infer<typeof transferResultSchema>;

export function parseTransferResult(value: unknown): TransferRpcResult | null {
  const parsed = transferResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function companyMessage(input: {
  companyId: string;
  result: TransferRpcResult;
  trigger: NotificationTrigger;
  subject: string;
  body: string;
  actionPath?: string;
}): Promise<void> {
  const { data, error } = await createAdminClient().from("company")
    .select("contact_email").eq("id", input.companyId).maybeSingle();
  if (error) throw new Error("Transfer notification contact could not be loaded");
  await notify({
    trigger: input.trigger, to: (data?.contact_email as string) ?? "", companyId: input.companyId,
    entityType: "worker_transfer", entityId: input.result.transfer_id,
    subject: input.subject, body: input.body, actionPath: input.actionPath ?? "/app/transfers",
  });
}

async function maintainMessage(input: {
  result: TransferRpcResult;
  trigger: NotificationTrigger;
  subject: string;
  body: string;
}): Promise<void> {
  await notify({
    trigger: input.trigger,
    to: process.env.MAINTAIN_NOTIFICATION_EMAIL ?? process.env.BOOKING_NOTIFICATION_EMAIL ?? "",
    entityType: "worker_transfer", entityId: input.result.transfer_id,
    subject: input.subject, body: input.body, actionPath: "/admin/transfers",
  });
}

/** Only post-commit delivery: this helper cannot mutate employment or match state. */
export async function notifyTransferTransition(result: TransferRpcResult): Promise<void> {
  if (result.created === false || result.transition === "withdraw") return;
  const jobs: Promise<unknown>[] = [];
  const companyIds = [result.from_company_id, result.to_company_id].filter((id): id is string => id !== null);

  if (result.transition === "requested" && result.from_company_id) {
    jobs.push(companyMessage({
      result, companyId: result.from_company_id, trigger: NOTIFICATION_TRIGGERS.TRANSFER_REQUESTED,
      subject: "A transfer request is waiting on you",
      body: "Another business requested a worker transfer. Review the request in your workspace within five business days.",
    }));
  } else if (["requested", "review", "escalated"].includes(result.transition)) {
    const input = {
      result, trigger: NOTIFICATION_TRIGGERS.TRANSFER_ESCALATED,
      subject: "A transfer request is with Maintain",
      body: "A transfer request is now in Admin Review. Open the workspace for its current status.",
    };
    jobs.push(...companyIds.map((companyId) => companyMessage({ ...input, companyId })), maintainMessage(input));
  } else if (result.transition === "approve" || result.transition === "decline") {
    const approved = result.transition === "approve";
    jobs.push(...companyIds.map((companyId) => companyMessage({
      result, companyId,
      trigger: approved ? NOTIFICATION_TRIGGERS.TRANSFER_APPROVED : NOTIFICATION_TRIGGERS.TRANSFER_DECLINED,
      subject: approved ? "A transfer request was approved" : "A transfer request was declined",
      body: approved
        ? "A transfer request was approved and the worker's employment record has been updated."
        : "A transfer request was declined. The current status is available in your workspace.",
    })));
  }

  if (result.transition === "approve" && (result.lines_touched > 0 || result.knockouts.length > 0)) {
    const input = {
      result, trigger: NOTIFICATION_TRIGGERS.TRANSFER_COMPLETED_CASCADE,
      subject: "A completed transfer changed capacity and nominations",
      body: "A completed transfer removed a worker from old open capacity lines and released pending nominations. Review the updated workspace.",
    };
    if (result.from_company_id) {
      jobs.push(companyMessage({ ...input, companyId: result.from_company_id, actionPath: "/app/capacity" }));
    }
    jobs.push(maintainMessage(input));
    const changed = result.knockouts.filter((row) => row.changed);
    jobs.push(notifyWorkerStatusKnockouts({
      knockedOutMatchIds: changed.map((row) => row.match_id),
      declinedMatchIds: changed.filter((row) => row.status_after === "Declined").map((row) => row.match_id),
      buyerDeclinedMatchIds: changed.filter((row) => row.status_before === "Awaiting Buyer" && row.status_after === "Declined").map((row) => row.match_id),
      buyerRenotificationMatchIds: changed.filter((row) => row.status_before === "Awaiting Buyer" && row.status_after === "Awaiting Buyer").map((row) => row.match_id),
    }));
  }
  // Notification persistence/delivery failures must never misreport a committed transfer.
  await Promise.allSettled(jobs);
}

/** Server-only manual executor; the daily database executor may call the RPC directly. */
export async function escalateTransfersForDate(
  effectiveDate: string,
  actorUserId: string | null = null,
): Promise<{ escalated: number }> {
  const { data, error } = await createAdminClient().rpc("escalate_worker_transfers", {
    p_effective_date: effectiveDate, p_actor_user_id: actorUserId,
  });
  if (error) throw new Error("Transfer escalation failed; no escalation transaction was committed");
  const parsed = z.array(transferResultSchema).safeParse(data);
  if (!parsed.success) throw new Error("Transfer escalation returned an invalid result");
  await Promise.allSettled(parsed.data.map(notifyTransferTransition));
  return { escalated: parsed.data.length };
}
