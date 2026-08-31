import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import {
  cancelEngagement,
  completeEngagement,
  disputeEngagement,
  recordEngagementOutcome,
  recordPaymentStatus,
} from "@/lib/actions/engagement";
import { getAdminEngagement } from "@/lib/admin-engagement-reporting";
import { formatCentsExGst } from "@/lib/domain/money";
import { CARD, FIELD, FIELD_HINT, FIELD_LABEL, INPUT, MONO, formatWindow, pill, toneFor } from "@/lib/platform-ui";
import { H1, LINK } from "@/lib/ui";

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

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <Link href="/admin/engagements" className={LINK}>
          Back to engagements
        </Link>
        <div className="mt-(--space-4) flex flex-wrap items-end justify-between gap-(--space-4)">
          <div>
            <h1 className={H1}>Engagement controls</h1>
            <p className="mt-(--space-3) text-body-lg text-on-dark-muted">
              {engagement.supplier_company_name} → {engagement.buyer_company_name}
            </p>
          </div>
          <span className={pill(toneFor(engagement.overdue ? "Overdue" : engagement.status))}>
            {engagement.overdue ? "Overdue" : engagement.status}
          </span>
        </div>
      </div>

      {engagement.compliance_review_count > 0 && (
        <section className={CARD} aria-labelledby="engagement-compliance-heading">
          <h2 id="engagement-compliance-heading" className="font-display text-h3 font-bold text-on-dark">
            Maintain compliance review
          </h2>
          <p className={`mt-(--space-2) ${FIELD_HINT}`}>
            {engagement.compliance_review_count} compliance issue{engagement.compliance_review_count === 1 ? " requires" : "s require"} review.
            This commitment has not been automatically cancelled. Review the affected records and agree the next steps.
          </p>
          <ul className="mt-(--space-4) flex list-disc flex-col gap-(--space-3) pl-(--space-5)">
            {engagement.compliance_issues.map((issue) => (
              <li key={`${issue.source_type}/${issue.source_id}`} className="text-body text-on-dark">
                {issue.reason}
                <span className="mt-(--space-1) block break-all text-body-sm text-on-dark-muted">
                  {issue.source_type === "company" ? "Company" : "Worker"} record: {issue.source_id}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-display text-h3 font-bold text-on-dark">Commercial snapshot</h2>
        <dl className="mt-(--space-4) grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Trade</dt>
            <dd className="mt-(--space-1) text-body text-on-dark">
              {engagement.trade_role_name} · {engagement.proficiency_name}
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Window</dt>
            <dd className={`mt-(--space-1) text-body text-on-dark ${MONO}`}>
              {formatWindow(engagement.start_date, engagement.end_date)}
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Crew</dt>
            <dd className={`mt-(--space-1) text-body text-on-dark ${MONO}`}>
              {engagement.worker_count}
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Supplier rate</dt>
            <dd className={`mt-(--space-1) text-body text-on-dark ${MONO}`}>
              {formatCentsExGst(engagement.supplier_rate_cents)} /hr
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Buyer rate</dt>
            <dd className={`mt-(--space-1) text-body text-on-dark ${MONO}`}>
              {formatCentsExGst(engagement.buyer_rate_cents)} /hr
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Payment</dt>
            <dd className={`mt-(--space-1) text-body text-on-dark ${MONO}`}>
              {engagement.payment_status}
              {engagement.external_payment_ref ? ` · ${engagement.external_payment_ref}` : ""}
            </dd>
          </div>
        </dl>
      </section>

      {canChangePayment && (
        <section className={CARD}>
          <h2 className="font-display text-h3 font-bold text-on-dark">
            {engagement.status === "Awaiting Commercial" ? "Commercial trigger" : "Payment record"}
          </h2>
          <p className={`mt-(--space-2) ${FIELD_HINT}`}>
            {engagement.status === "Awaiting Commercial"
              ? "Pre-authorisation confirms the engagement and reveals the parties to one another."
              : "Record an off-platform payment-state change against the engagement audit trail."}
          </p>
          <div className="mt-(--space-4)">
            <ActionForm
              action={recordPaymentStatus}
              submitLabel={
                engagement.status === "Awaiting Commercial"
                  ? "Record pre-authorised"
                  : "Record payment change"
              }
              pendingLabel="Recording payment…"
            >
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              {engagement.status === "Awaiting Commercial" ? (
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
          </div>
        </section>
      )}

      {canComplete && (
        <section className={CARD}>
          <h2 className="font-display text-h3 font-bold text-on-dark">
            {engagement.status === "Disputed" ? "Resolve as completed" : "Complete engagement"}
          </h2>
          <p className={`mt-(--space-2) ${FIELD_HINT}`}>
            For an early completion, enter the actual final date inside the original window.
          </p>
          <div className="mt-(--space-4)">
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
                  className={INPUT}
                />
              </label>
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Actual hours</span>
                <input type="number" name="actual_hours" min="0" step="0.25" className={INPUT} />
              </label>
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Actual value (cents, ex GST)</span>
                <input type="number" name="actual_value_cents" min="0" step="1" className={INPUT} />
              </label>
            </ActionForm>
          </div>
        </section>
      )}

      {canDispute && (
        <section className={CARD}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Record a dispute</h2>
          <div className="mt-(--space-4)">
            <ActionForm action={disputeEngagement} submitLabel="Mark disputed" pendingLabel="Recording dispute…" tone="ghost">
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Dispute notes</span>
                <textarea name="dispute_notes" rows={4} className={INPUT} required />
              </label>
            </ActionForm>
          </div>
        </section>
      )}

      {canRecordOutcome && (
        <section className={CARD}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Record actual outcome</h2>
          <p className={`mt-(--space-2) ${FIELD_HINT}`}>
            Add or correct the actual hours and value after automatic completion.
          </p>
          <div className="mt-(--space-4)">
            <ActionForm
              action={recordEngagementOutcome}
              submitLabel="Record engagement outcome"
              pendingLabel="Recording outcome…"
            >
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Actual hours</span>
                <input
                  type="number"
                  name="actual_hours"
                  min="0"
                  step="0.25"
                  defaultValue={engagement.actual_hours ?? ""}
                  className={INPUT}
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
                  className={INPUT}
                />
              </label>
            </ActionForm>
          </div>
        </section>
      )}

      {canCancel && (
        <section className={CARD}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Cancel engagement</h2>
          <div className="mt-(--space-4)">
            <ActionForm action={cancelEngagement} submitLabel="Cancel engagement" pendingLabel="Cancelling engagement…" tone="ghost">
              <input type="hidden" name="engagement_id" value={engagement.id} />
              <input type="hidden" name="expected_status" value={engagement.status} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Cancellation reason</span>
                <textarea name="reason" rows={4} className={INPUT} required />
              </label>
              <label className="flex items-start gap-(--space-3) text-body text-on-dark">
                <input type="checkbox" name="within_notice_window" className="mt-1 size-5" />
                Cancellation falls within the contractual notice window
              </label>
            </ActionForm>
          </div>
        </section>
      )}
    </div>
  );
}
