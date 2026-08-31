"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/lib/actions";
import { requireMaintainAdmin } from "@/lib/auth";
import { brisbaneToday } from "@/lib/matching";
import { notify, NOTIFICATION_TRIGGERS } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinedRow, type EngagementStatus, type PaymentStatus } from "@/lib/supabase/types";

// Engagements — spec module 13.
//
// The commercial identity fields are copied from the match's proposal-time snapshot
// and never re-read from live tables (13.1); the estimates are computed once here and
// then frozen. A later edit to a rate band or the fee config is invisible to every
// engagement that already exists, which is the whole point of the snapshot.

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function pick(value: unknown): Record<string, unknown> | null {
  return joinedRow(value);
}

async function companyEmail(companyId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("company").select("contact_email").eq("id", companyId).maybeSingle();
  return (data?.contact_email as string) ?? "";
}

type EngagementRpcResult = {
  engagement_id: string;
  previous_status: EngagementStatus;
  status: EngagementStatus;
  buyer_company_id: string;
  supplier_company_id: string;
  payment_status?: PaymentStatus;
  triggered?: boolean;
  activated?: boolean;
  end_date?: string;
};

const engagementStatusSchema = z.enum([
  "Awaiting Commercial",
  "Confirmed",
  "Active",
  "Completed",
  "Cancelled",
  "Disputed",
]);

function rpcResult(value: unknown): EngagementRpcResult | null {
  const row = pick(value);
  if (!row || typeof row.engagement_id !== "string" || typeof row.status !== "string") return null;
  return row as EngagementRpcResult;
}

function revalidateEngagement(id: string): void {
  revalidatePath("/admin/engagements");
  revalidatePath(`/admin/engagements/${id}`);
  revalidatePath("/app/engagements");
  revalidatePath(`/app/engagements/${id}`);
}

/** Notification persistence/delivery is post-commit and cannot roll back the workflow. */
async function notifyCompanies(input: {
  companyIds: string[];
  engagementId: string;
  trigger: (typeof NOTIFICATION_TRIGGERS)[keyof typeof NOTIFICATION_TRIGGERS];
  subject: string;
  body: string;
}): Promise<void> {
  await Promise.allSettled(
    input.companyIds.map(async (companyId) => {
      await notify({
        trigger: input.trigger,
        to: await companyEmail(companyId),
        companyId,
        entityType: "engagement",
        entityId: input.engagementId,
        subject: input.subject,
        body: input.body,
        actionPath: `/app/engagements/${input.engagementId}`,
      });
    }),
  );
}

/* ---------------------------------------------- 13.2 / 13.4 commercial trigger -- */

const paymentSchema = z.object({
  engagement_id: z.string().uuid(),
  expected_status: engagementStatusSchema,
  payment_status: z.enum(["none", "pre-authorised", "released", "disputed"]),
  external_payment_ref: z.string().trim().max(200).optional(),
});

/**
 * 13.4 — payment_status is RECORDED, never processed. Setting it to 'pre-authorised'
 * IS the commercial trigger that moves the engagement Awaiting Commercial → Confirmed
 * (13.2), which is also the moment identities are revealed to the counterparty (12.5).
 */
export async function recordPaymentStatus(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const actingUser = await requireMaintainAdmin();
  const parsed = paymentSchema.safeParse({
    engagement_id: formData.get("engagement_id"),
    expected_status: formData.get("expected_status"),
    payment_status: formData.get("payment_status"),
    external_payment_ref: formData.get("external_payment_ref") || undefined,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_engagement_payment", {
    p_engagement_id: parsed.data.engagement_id,
    p_expected_status: parsed.data.expected_status,
    p_payment_status: parsed.data.payment_status,
    p_external_payment_ref: parsed.data.external_payment_ref ?? null,
    p_actor_user_id: actingUser.id,
    p_effective_date: brisbaneToday(),
  });
  const outcome = rpcResult(data);
  if (error || !outcome) {
    return {
      ok: false,
      message: "The payment status could not be recorded. Refresh and try again.",
    };
  }

  if (outcome.triggered) {
    await notifyCompanies({
      companyIds: [outcome.buyer_company_id, outcome.supplier_company_id],
      engagementId: outcome.engagement_id,
      trigger: NOTIFICATION_TRIGGERS.ENGAGEMENT_CONFIRMED,
      subject: "Engagement confirmed",
      body: "An engagement you are part of is confirmed. Open it for the site details and the crew going on it.",
    });
  }
  revalidateEngagement(outcome.engagement_id);

  return {
    ok: true,
    message: outcome.triggered
      ? outcome.activated
        ? "Pre-authorisation recorded. The engagement passed through Confirmed and is now Active."
        : "Pre-authorisation recorded. The engagement is Confirmed."
      : "Payment status recorded.",
  };
}

/* --------------------------------------------------------------- 13.5 cancel -- */

const cancelSchema = z.object({
  engagement_id: z.string().uuid(),
  expected_status: engagementStatusSchema,
  reason: z.string().trim().min(3, "Record why the engagement is being cancelled."),
  within_notice_window: z.boolean(),
});

/**
 * 13.2 — Cancelled is Maintain-only in MVP; the parties request it off-platform.
 * 13.5 — cancelling releases the committed dates, which decrements the demand line's
 * derived filled count on its own (10.3 recomputes it at read time).
 */
export async function cancelEngagement(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const actingUser = await requireMaintainAdmin();
  const parsed = cancelSchema.safeParse({
    engagement_id: formData.get("engagement_id"),
    expected_status: formData.get("expected_status"),
    reason: formData.get("reason"),
    within_notice_window: formData.get("within_notice_window") === "on",
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("transition_engagement_lifecycle", {
    p_engagement_id: parsed.data.engagement_id,
    p_expected_status: parsed.data.expected_status,
    p_target_status: "Cancelled" satisfies EngagementStatus,
    p_actor_user_id: actingUser.id,
    p_actor_is_system: false,
    p_effective_date: brisbaneToday(),
    p_end_date: null,
    p_actual_hours: null,
    p_actual_value_cents: null,
    p_cancel_reason: parsed.data.reason,
    p_within_notice_window: parsed.data.within_notice_window,
    p_dispute_notes: null,
  });
  const outcome = rpcResult(data);
  if (error || !outcome) {
    return {
      ok: false,
      message: "The engagement could not be cancelled. Refresh and try again.",
    };
  }

  await notifyCompanies({
    companyIds: [outcome.buyer_company_id, outcome.supplier_company_id],
    engagementId: outcome.engagement_id,
    trigger: NOTIFICATION_TRIGGERS.ENGAGEMENT_CANCELLED,
    subject: "Engagement cancelled",
    body: "An engagement you are part of has been cancelled and the committed dates are released.",
  });
  revalidateEngagement(outcome.engagement_id);
  return { ok: true, message: "Engagement cancelled and the committed dates are released." };
}

/* ------------------------------------------------------------- 13.3 complete -- */

const completeSchema = z.object({
  engagement_id: z.string().uuid(),
  expected_status: engagementStatusSchema,
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  actual_hours: z.coerce.number().min(0).optional(),
  actual_value_cents: z.coerce.number().int().min(0).optional(),
});

/**
 * 13.2 / 13.3 — Maintain records the outcome. Completed is normally reached by the
 * daily job once end_date has passed; this is the manual path, including the
 * resolution of a Disputed engagement to Completed.
 */
export async function completeEngagement(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const actingUser = await requireMaintainAdmin();
  const parsed = completeSchema.safeParse({
    engagement_id: formData.get("engagement_id"),
    expected_status: formData.get("expected_status"),
    end_date: formData.get("end_date") || undefined,
    actual_hours: formData.get("actual_hours") || undefined,
    actual_value_cents: formData.get("actual_value_cents") || undefined,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("transition_engagement_lifecycle", {
    p_engagement_id: parsed.data.engagement_id,
    p_expected_status: parsed.data.expected_status,
    p_target_status: "Completed" satisfies EngagementStatus,
    p_actor_user_id: actingUser.id,
    p_actor_is_system: false,
    p_effective_date: brisbaneToday(),
    p_end_date: parsed.data.end_date ?? null,
    p_actual_hours: parsed.data.actual_hours ?? null,
    p_actual_value_cents: parsed.data.actual_value_cents ?? null,
    p_cancel_reason: null,
    p_within_notice_window: null,
    p_dispute_notes: null,
  });
  const outcome = rpcResult(data);
  if (error || !outcome) {
    return {
      ok: false,
      message: "The engagement could not be completed. Check the end date, refresh and try again.",
    };
  }

  revalidateEngagement(outcome.engagement_id);
  return { ok: true, message: "Engagement completed and the outcome recorded." };
}

const outcomeSchema = z
  .object({
    engagement_id: z.string().uuid(),
    actual_hours: z.coerce.number().min(0).optional(),
    actual_value_cents: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => value.actual_hours !== undefined || value.actual_value_cents !== undefined, {
    message: "Enter actual hours, actual value, or both.",
    path: ["actual_hours"],
  });

/** 13.3 — record or correct actuals after the daily job has completed the engagement. */
export async function recordEngagementOutcome(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const actingUser = await requireMaintainAdmin();
  const parsed = outcomeSchema.safeParse({
    engagement_id: formData.get("engagement_id"),
    actual_hours: formData.get("actual_hours") || undefined,
    actual_value_cents: formData.get("actual_value_cents") || undefined,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const { data, error } = await createAdminClient().rpc("record_engagement_outcome", {
    p_engagement_id: parsed.data.engagement_id,
    p_actual_hours: parsed.data.actual_hours ?? null,
    p_actual_value_cents: parsed.data.actual_value_cents ?? null,
    p_actor_user_id: actingUser.id,
  });
  const outcome = rpcResult(data);
  if (error || !outcome) {
    return {
      ok: false,
      message: "The engagement outcome could not be recorded. Refresh and try again.",
    };
  }

  revalidateEngagement(outcome.engagement_id);
  return { ok: true, message: "Engagement outcome recorded." };
}

/* -------------------------------------------------------------- 13.2 dispute -- */

const disputeSchema = z.object({
  engagement_id: z.string().uuid(),
  expected_status: engagementStatusSchema,
  dispute_notes: z.string().trim().min(3, "Record what the dispute is about."),
});

/** 13.2 — Active/Completed → Disputed (Maintain-set), resolved to Completed or Cancelled. */
export async function disputeEngagement(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const actingUser = await requireMaintainAdmin();
  const parsed = disputeSchema.safeParse({
    engagement_id: formData.get("engagement_id"),
    expected_status: formData.get("expected_status"),
    dispute_notes: formData.get("dispute_notes"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("transition_engagement_lifecycle", {
    p_engagement_id: parsed.data.engagement_id,
    p_expected_status: parsed.data.expected_status,
    p_target_status: "Disputed" satisfies EngagementStatus,
    p_actor_user_id: actingUser.id,
    p_actor_is_system: false,
    p_effective_date: brisbaneToday(),
    p_end_date: null,
    p_actual_hours: null,
    p_actual_value_cents: null,
    p_cancel_reason: null,
    p_within_notice_window: null,
    p_dispute_notes: parsed.data.dispute_notes,
  });
  const outcome = rpcResult(data);
  if (error || !outcome) {
    return {
      ok: false,
      message: "The engagement could not be disputed. Refresh and try again.",
    };
  }

  revalidateEngagement(outcome.engagement_id);
  return { ok: true, message: "Engagement marked Disputed." };
}
