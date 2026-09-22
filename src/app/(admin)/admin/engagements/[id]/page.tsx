import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { Fact, FactList, PageHeader, SectionHeader } from "@/components/admin-page";
import {
  cancelEngagement,
  completeEngagement,
  disputeEngagement,
  recordEngagementOutcome,
  recordPaymentStatus,
} from "@/lib/actions/engagement";
import { getAdminEngagement } from "@/lib/admin-engagement-reporting";
import { formatCentsExGst } from "@/lib/domain/money";
import { CHECKBOX, CHECK_OPTION, FIELD, FIELD_LABEL, INPUT, formatWindow, pill, toneFor } from "@/lib/admin-ui";
import { PANEL } from "@/lib/ui";

export const metadata: Metadata = { title: "Engagement controls" };

export default async function AdminEngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const engagement = await getAdminEngagement(id);
  if (!engagement) notFound();

  const canChangePayment = engagement.status !== "Cancelled" || engagement.commercial_confirmed_at != null;
  const canCancel = ["Awaiting Commercial", "Confirmed", "Active", "Disputed"].includes(
    engagement.status,
  );
  const canComplete = engagement.status === "Active" || engagement.status === "Disputed";
  const canDispute = engagement.status === "Active" || engagement.status === "Completed";
  const canRecordOutcome = engagement.status === "Completed";
  const awaitingTrigger = engagement.status === "Awaiting Commercial";

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        back={{ href: "/admin/engagements", label: "Back to engagements" }}
        title="Engagement controls"
        lead={`${engagement.supplier_company_name} → ${engagement.buyer_company_name}`}
        meta={
          <>
            <span>{engagement.trade_role_name} · {engagement.proficiency_name}</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>{formatWindow(engagement.start_date, engagement.end_date)}</span>
          </>
        }
        actions={
          <span className={pill(toneFor(engagement.overdue ? "Overdue" : engagement.status))}>
            {engagement.overdue ? "Overdue" : engagement.status}
          </span>
        }
      />

      {engagement.compliance_review_count > 0 && (
        <section className={`${PANEL} p-(--space-5)`} aria-labelledby="engagement-compliance-heading">
          <div className="flex items-start gap-(--space-3)">
            <span aria-hidden="true" className="mt-[0.55em] size-2 shrink-0 rounded-(--radius-pill) bg-status-critical" />
            <SectionHeader
              title={<span id="engagement-compliance-heading">Maintain compliance review</span>}
              hint={`${engagement.compliance_review_count} compliance issue${engagement.compliance_review_count === 1 ? " requires" : "s require"} review. This commitment has not been automatically cancelled. Review the affected records and agree the next steps.`}
            />
          </div>
          <ul className="mt-(--space-4) divide-y divide-hairline">
            {engagement.compliance_issues.map((issue) => (
              <li key={`${issue.source_type}/${issue.source_id}`} className="py-(--space-3) text-sm text-on-dark">
                {issue.reason}
                <span className="mt-(--space-1) block text-xs tabular-nums text-on-dark-muted [overflow-wrap:anywhere]">
                  {issue.source_type === "company" ? "Company" : "Worker"} record {issue.source_id}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${PANEL} p-(--space-5)`} aria-labelledby="snapshot-heading">
        <SectionHeader title={<span id="snapshot-heading">Commercial snapshot</span>} hint="Frozen when the engagement was created. Rates are per hour, ex GST." />
        <FactList columns={3} className="mt-(--space-5)">
          <Fact label="Trade" value={`${engagement.trade_role_name} · ${engagement.proficiency_name}`} />
          <Fact label="Window" value={formatWindow(engagement.start_date, engagement.end_date)} numeric />
          <Fact label="Crew" value={engagement.worker_count} numeric />
          <Fact label="Supplier rate" value={`${formatCentsExGst(engagement.supplier_rate_cents)} /hr`} numeric />
          <Fact label="Buyer rate" value={`${formatCentsExGst(engagement.buyer_rate_cents)} /hr`} numeric />
          <Fact
            label="Payment"
            value={`${engagement.payment_status}${engagement.external_payment_ref ? ` · ${engagement.external_payment_ref}` : ""}`}
            numeric
          />
        </FactList>
      </section>

      <div className="grid gap-(--space-5) lg:grid-cols-2">
        {canChangePayment && (
          <Control
            title={awaitingTrigger ? "Commercial trigger" : "Payment record"}
            hint={awaitingTrigger
              ? "Pre-authorisation confirms the engagement and reveals the parties to one another."
              : "Record an off-platform payment-state change against the engagement audit trail."}
            emphasis={awaitingTrigger}
          >
            <ActionForm
              action={recordPaymentStatus}
              submitLabel={awaitingTrigger ? "Record pre-authorised" : "Record payment change"}
              pendingLabel="Recording payment…"
              tone={awaitingTrigger ? "primary" : "ghost"}
            >
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              {awaitingTrigger ? (
                <input type="hidden" name="payment_status" value="pre-authorised" />
              ) : (
                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Payment status</span>
                  <select name="payment_status" defaultValue="" className={INPUT} required>
                    <option value="" disabled>Select a new payment status</option>
                    <option value="none">None</option>
                    <option value="released">Released</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </label>
              )}
              <label className={FIELD}>
                <span className={FIELD_LABEL}>External payment reference</span>
                <input
                  name="external_payment_ref"
                  defaultValue={engagement.external_payment_ref ?? ""}
                  className={INPUT}
                  maxLength={200}
                />
              </label>
            </ActionForm>
          </Control>
        )}

        {canComplete && (
          <Control
            title={engagement.status === "Disputed" ? "Resolve as completed" : "Complete engagement"}
            hint="For an early completion, enter the actual final date inside the original window."
            emphasis={!awaitingTrigger}
          >
            <ActionForm
              action={completeEngagement}
              submitLabel={engagement.status === "Disputed" ? "Resolve as completed" : "Complete engagement"}
              pendingLabel="Completing engagement…"
            >
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Actual end date (required for early completion)</span>
                <input
                  type="date"
                  name="end_date"
                  min={engagement.start_date}
                  max={engagement.end_date}
                  className={`${INPUT} tabular-nums`}
                />
              </label>
              <div className="grid gap-(--space-3) sm:grid-cols-2">
                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Actual hours</span>
                  <input type="number" name="actual_hours" min="0" step="0.25" className={`${INPUT} tabular-nums`} />
                </label>
                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Actual value (cents, ex GST)</span>
                  <input type="number" name="actual_value_cents" min="0" step="1" className={`${INPUT} tabular-nums`} />
                </label>
              </div>
            </ActionForm>
          </Control>
        )}

        {canRecordOutcome && (
          <Control
            title="Record actual outcome"
            hint="Add or correct the actual hours and value after automatic completion."
            emphasis
          >
            <ActionForm
              action={recordEngagementOutcome}
              submitLabel="Record engagement outcome"
              pendingLabel="Recording outcome…"
            >
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <div className="grid gap-(--space-3) sm:grid-cols-2">
                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Actual hours</span>
                  <input
                    type="number"
                    name="actual_hours"
                    min="0"
                    step="0.25"
                    defaultValue={engagement.actual_hours ?? ""}
                    className={`${INPUT} tabular-nums`}
                  />
                </label>
                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Actual value (cents, ex GST)</span>
                  <input
                    type="number"
                    name="actual_value_cents"
                    min="0"
                    step="1"
                    defaultValue={engagement.actual_value_cents ?? ""}
                    className={`${INPUT} tabular-nums`}
                  />
                </label>
              </div>
            </ActionForm>
          </Control>
        )}

        {canDispute && (
          <Control title="Record a dispute" hint="Marks the engagement Disputed and records the notes against its audit trail.">
            <ActionForm action={disputeEngagement} submitLabel="Mark disputed" pendingLabel="Recording dispute…" tone="ghost">
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Dispute notes</span>
                <textarea name="dispute_notes" rows={4} className={INPUT} required />
              </label>
            </ActionForm>
          </Control>
        )}

        {canCancel && (
          <Control title="Cancel engagement" hint="Cancellation is recorded with its reason and whether it fell inside the contractual notice window.">
            <ActionForm action={cancelEngagement} submitLabel="Cancel engagement" pendingLabel="Cancelling engagement…" tone="ghost">
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Cancellation reason</span>
                <textarea name="reason" rows={4} className={INPUT} required />
              </label>
              <label className={`${CHECK_OPTION} w-fit`}>
                <input type="checkbox" name="within_notice_window" className={CHECKBOX} />
                Cancellation falls within the contractual notice window
              </label>
            </ActionForm>
          </Control>
        )}
      </div>
    </div>
  );
}

/** One lifecycle control. `emphasis` spans both columns so the next action leads. */
function Control({
  title,
  hint,
  emphasis,
  children,
}: {
  title: string;
  hint?: string;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${PANEL} p-(--space-5) ${emphasis ? "lg:col-span-2" : ""}`}>
      <SectionHeader title={title} hint={hint} />
      <div className={`mt-(--space-4) ${emphasis ? "lg:max-w-[40rem]" : ""}`}>{children}</div>
    </section>
  );
}
