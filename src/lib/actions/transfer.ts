"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/lib/actions";
import { requireMaintainAdmin, requireWritableCompany } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { escalateTransfersForDate, notifyTransferTransition, parseTransferResult } from "@/lib/transfer-orchestration";

// Module 8: contact-only request input and session-derived actors. The database owns
// the entire lifecycle/CAS, employment history, match cascade and audit transaction.
export type TransferRequestResult = FormResult;

const pendingStatus = z.enum(["Requested", "Awaiting Current Employer", "Admin Review"]);
const decisionSchema = z.object({
  transfer_id: z.uuid(),
  expected_status: pendingStatus,
  reason: z.string().trim().max(1000),
});
type Decision = "approve" | "decline" | "withdraw" | "review";

function parseDecision(formData: FormData) {
  return decisionSchema.safeParse({
    transfer_id: formData.get("transfer_id"), expected_status: formData.get("expected_status"),
    reason: String(formData.get("reason") ?? ""),
  });
}

function failure(error?: { code?: string; message?: string } | null): FormResult {
  if (error?.code === "40001" || error?.code === "40P01") {
    return { ok: false, message: "This request changed while you were deciding. Refresh and review its current status." };
  }
  if (error?.code === "23514" && error.message?.includes("committing")) {
    return { ok: false, message: "Maintain must resolve the worker's committing engagements before this transfer can complete." };
  }
  if (error?.code === "42501") return { ok: false, message: "You cannot make that change. Check the request's current status or contact Maintain." };
  if (error?.code === "23505") return { ok: false, message: "A transfer request is already pending. Contact Maintain if you need help." };
  return { ok: false, message: "We could not complete that request. Check the details, refresh and try again, or contact Maintain." };
}

function refreshTransfers(): void {
  for (const path of ["/app/transfers", "/app/workers", "/app/capacity", "/app/matches", "/admin/transfers", "/admin/workers", "/admin/matching"]) {
    revalidatePath(path);
  }
}

export async function requestTransfer(_previous: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireWritableCompany();
  const parsed = z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    mobile: z.string().trim().transform((value) => value.replace(/[\s().-]/g, "")).pipe(z.string().regex(/^\+?\d{6,18}$/)),
  }).safeParse({ email: formData.get("email"), mobile: formData.get("mobile") });
  if (!parsed.success) return { ok: false, message: "Enter the worker's email and mobile, then try again." };

  let outcome;
  try {
    const { data, error } = await createAdminClient().rpc("request_worker_transfer", {
      p_email: parsed.data.email, p_mobile: parsed.data.mobile, p_to_company_id: companyId, p_actor_user_id: user.id,
    });
    if (error) return failure(error);
    outcome = parseTransferResult(data);
  } catch {
    return failure();
  }
  if (!outcome || outcome.transition !== "requested" || typeof outcome.created !== "boolean"
      || (outcome.created && !["Awaiting Current Employer", "Admin Review"].includes(outcome.status))) return failure();
  await notifyTransferTransition(outcome);
  refreshTransfers();
  // No worker UUID, matching field, name or current employer is returned to the requester.
  return {
    ok: true,
    message: outcome.created === false ? "A transfer request is already with us. Check your transfer queue."
      : outcome.status === "Admin Review" ? "Transfer requested. Maintain will review it and be in touch."
        : "Transfer requested. The current employer has five business days to respond.",
  };
}

async function decide(
  input: z.infer<typeof decisionSchema>, decision: Decision, actorId: string, actorCompanyId: string | null,
): Promise<FormResult> {
  let outcome;
  try {
    const { data, error } = await createAdminClient().rpc("decide_worker_transfer", {
      p_transfer_id: input.transfer_id, p_expected_status: input.expected_status, p_decision: decision,
      p_actor_user_id: actorId, p_actor_company_id: actorCompanyId, p_reason: input.reason || null,
    });
    if (error) return failure(error);
    outcome = parseTransferResult(data);
  } catch {
    return failure();
  }
  const expectedStatus = { approve: "Completed", decline: "Declined", withdraw: "Withdrawn", review: "Admin Review" };
  if (!outcome || outcome.transfer_id !== input.transfer_id || outcome.transition !== decision
      || outcome.status !== expectedStatus[decision]) return failure();
  await notifyTransferTransition(outcome);
  refreshTransfers();
  const messages = {
    approve: "Transfer completed. Employment, capacity and nominations are updated.",
    decline: "Transfer declined.", withdraw: "Request withdrawn.", review: "Request moved to Admin Review. Your reason is recorded in the audit trail.",
  };
  return { ok: true, message: messages[decision] };
}

export async function approveTransfer(_previous: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireWritableCompany();
  const parsed = parseDecision(formData);
  if (!parsed.success || parsed.data.expected_status !== "Awaiting Current Employer") return failure();
  return decide(parsed.data, "approve", user.id, companyId);
}

export async function declineTransfer(_previous: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireWritableCompany();
  const parsed = parseDecision(formData);
  if (!parsed.success) return failure();
  if (parsed.data.expected_status !== "Awaiting Current Employer") return failure();
  return decide(parsed.data, "decline", user.id, companyId);
}

export async function withdrawTransfer(_previous: FormResult | null, formData: FormData): Promise<FormResult> {
  const { user, companyId } = await requireWritableCompany();
  const parsed = parseDecision(formData);
  if (!parsed.success) return failure();
  return decide(parsed.data, "withdraw", user.id, companyId);
}

export async function adminDecideTransfer(_previous: FormResult | null, formData: FormData): Promise<FormResult> {
  const user = await requireMaintainAdmin();
  const parsed = parseDecision(formData);
  const decision = z.enum(["approve", "decline", "review"]).safeParse(formData.get("decision"));
  if (!parsed.success || !decision.success) return failure();
  if (decision.data === "review") {
    if (parsed.data.expected_status === "Admin Review" || parsed.data.reason.length < 10) {
      return { ok: false, message: "Explain why this pending request needs exceptional Admin Review (at least 10 characters)." };
    }
  } else if (parsed.data.expected_status !== "Admin Review") {
    return { ok: false, message: "Move the pending request to Admin Review with an audited reason before deciding it." };
  }
  return decide(parsed.data, decision.data, user.id, null);
}

/** Manual escalation remains authenticated; the daily executor is server-only. */
export async function escalateStaleTransfers(): Promise<{ escalated: number }> {
  const user = await requireMaintainAdmin();
  const today = new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
  const result = await escalateTransfersForDate(today, user.id);
  refreshTransfers();
  return result;
}
