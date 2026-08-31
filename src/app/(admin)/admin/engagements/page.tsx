import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { recordPaymentStatus } from "@/lib/actions/engagement";
import {
  ENGAGEMENT_REPORT_STATUSES,
  EngagementReportFilterError,
  EngagementReportQueryError,
  engagementExportHref,
  engagementPageHref,
  listAdminEngagements,
  normalizeEngagementReportFilters,
  normalizeEngagementReportPage,
  type AdminEngagementReport,
} from "@/lib/admin-engagement-reporting";
import { formatCentsExGst } from "@/lib/domain/money";
import { BTN_GHOST, H1, LINK } from "@/lib/ui";
import { CARD, FIELD, FIELD_HINT, FIELD_LABEL, MONO, TABLE, TD, TH, INPUT, formatWindow, pill, toneFor } from "@/lib/platform-ui";

// Maintain's engagement register — 14.2 and 14.3. This is the only surface that sees
// the complete commercial picture: supplier rate, fee and buyer rate together (17.1).
// It is also where the commercial trigger is recorded (13.2/13.4).

export const metadata: Metadata = { title: "Engagements" };

export default async function AdminEngagementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let filters = normalizeEngagementReportFilters({});
  let report: AdminEngagementReport | undefined;
  let problem: string | undefined;
  try {
    filters = normalizeEngagementReportFilters(params);
    const page = normalizeEngagementReportPage(params);
    report = await listAdminEngagements(filters, { kind: "page", page });
  } catch (error) {
    if (error instanceof EngagementReportFilterError) problem = error.message;
    else if (error instanceof EngagementReportQueryError) problem = "The engagement report could not be loaded. Please retry.";
    else throw error;
  }
  const rows = report?.rows ?? [];

  const awaiting = rows.filter((r) => r.status === "Awaiting Commercial");
  const overdue = awaiting.filter((r) => r.overdue);

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div className="flex flex-wrap items-end justify-between gap-(--space-4)">
        <div>
          <h1 className={H1}>Engagements</h1>
          <p className="mt-(--space-3) max-w-[62ch] text-body-lg text-on-dark-muted">
            Every engagement, with the full commercial calculation. All figures ex GST.
          </p>
        </div>
        {/* 14.3 — CSV export of the currently filtered rows is the only reporting
            facility in MVP, and it carries every field of 13.1. */}
        {report && <a href={engagementExportHref(filters)} className={BTN_GHOST}>Export CSV</a>}
      </div>

      <section className={CARD} aria-label="Engagement report filters">
        <form key={engagementPageHref(filters, 1)} method="get" className="grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-3">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Status</span>
            <select name="status" defaultValue={filters.status} className={INPUT}>
              <option value="">Any status</option>
              {ENGAGEMENT_REPORT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Timing</span>
            <select name="timing" defaultValue={filters.timing} className={INPUT}>
              <option value="">Any timing</option>
              <option value="overdue">Overdue — awaiting commercial trigger</option>
              <option value="upcoming">Upcoming — confirmed, future start</option>
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Hiring company</span>
            <select name="buyer" defaultValue={filters.buyer} className={INPUT}>
              <option value="">Any hiring company</option>
              {report?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Supplying company</span>
            <select name="supplier" defaultValue={filters.supplier} className={INPUT}>
              <option value="">Any supplying company</option>
              {report?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Window from</span>
            <input type="date" name="from" defaultValue={filters.from} className={INPUT} />
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Window to</span>
            <input type="date" name="to" defaultValue={filters.to} min={filters.from || undefined} className={INPUT} />
          </label>
          <p className={`${FIELD_HINT} sm:col-span-2 lg:col-span-3`}>
            Dates include every engagement whose window overlaps the selected range. Timing uses Australia/Brisbane dates.
          </p>
          <div className="flex flex-wrap items-center gap-(--space-4) sm:col-span-2 lg:col-span-3">
            <button type="submit" className={BTN_GHOST}>Apply filters</button>
            <Link href="/admin/engagements" className={LINK}>Reset filters</Link>
          </div>
        </form>
      </section>

      {problem && <p role="alert" className={`${CARD} text-body text-on-dark`}>{problem}</p>}

      {report && (
        <nav aria-label="Engagement pages" className="flex flex-wrap items-center justify-between gap-(--space-4)">
          <p className="text-body text-on-dark-muted">
            {rows.length} shown of {report.pagination.total} matching engagements · page {report.pagination.page}
          </p>
          <div className="flex gap-(--space-3)">
            {report.pagination.hasPrevious && <Link href={engagementPageHref(filters, report.pagination.page - 1)} className={BTN_GHOST}>Previous</Link>}
            {report.pagination.hasNext && <Link href={engagementPageHref(filters, report.pagination.page + 1)} className={BTN_GHOST}>Next</Link>}
          </div>
        </nav>
      )}

      {overdue.length > 0 && (
        <div className={CARD}>
          <p className="text-body text-on-dark">
            <span className={pill("overdue")}>Overdue</span>{" "}
            <span className="ml-(--space-2)">
              {overdue.length} engagement{overdue.length === 1 ? " on this page has" : "s on this page have"} reached the
              start date without the commercial trigger. They require pre-authorisation to
              become active, or cancellation by Maintain.
            </span>
          </p>
        </div>
      )}

      {awaiting.length > 0 && (
        <section className="flex flex-col gap-(--space-4)">
          <h2 className="font-display text-h3 font-bold text-on-dark">
            Awaiting the commercial trigger on this page
          </h2>
          <div className="flex flex-col gap-(--space-3)">
            {awaiting.map((row) => (
              <div key={row.id} className={CARD}>
                <div className="flex flex-wrap items-end gap-(--space-4)">
                  <div className="min-w-[16rem] flex-1">
                    <p className="text-body font-semibold text-on-dark">
                      {row.trade_role_name} · {row.proficiency_name} · {row.worker_count} crew
                    </p>
                    <p className={`mt-(--space-1) text-body-sm text-on-dark-muted ${MONO}`}>
                      {row.supplier_company_name} → {row.buyer_company_name} ·{" "}
                      {formatWindow(row.start_date, row.end_date)}
                    </p>
                    <Link href={`/admin/engagements/${row.id}`} className={`${LINK} mt-(--space-2) inline-block text-body-sm`}>
                      Open engagement controls
                    </Link>
                  </div>
                  <ActionForm
                    action={recordPaymentStatus}
                    submitLabel="Record pre-authorised"
                    pendingLabel="Recording pre-authorisation…"
                  >
                    <input type="hidden" name="engagement_id" value={row.id} />
                    <input type="hidden" name="expected_status" value="Awaiting Commercial" />
                    <input type="hidden" name="payment_status" value="pre-authorised" />
                    <label className="flex flex-col gap-(--space-2)">
                      <span className="text-label uppercase tracking-[0.08em] text-on-dark-faint">
                        Payment reference
                      </span>
                      <input
                        name="external_payment_ref"
                        className={`${INPUT} w-56`}
                        placeholder="Off-platform reference"
                      />
                    </label>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {report && <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-h3 font-bold text-on-dark">Engagements on this page</h2>
        {rows.length === 0 ? (
          <div className={CARD}>
            <p className="text-body text-on-dark-muted">No engagements match this page and its filters.</p>
          </div>
        ) : (
          <div className={`${CARD} overflow-x-auto`}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Supplying</th>
                  <th scope="col" className={TH}>Hiring</th>
                  <th scope="col" className={TH}>Trade</th>
                  <th scope="col" className={TH}>Window</th>
                  <th scope="col" className={TH}>Crew</th>
                  <th scope="col" className={TH}>Supplier rate</th>
                  <th scope="col" className={TH}>Fee /hr</th>
                  <th scope="col" className={TH}>Buyer rate</th>
                  <th scope="col" className={TH}>Maintain revenue</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Controls</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={TD}>{row.supplier_company_name}</td>
                    <td className={TD}>{row.buyer_company_name}</td>
                    <td className={TD}>
                      {row.trade_role_name}
                      <span className="block text-body-sm text-on-dark-faint">
                        {row.proficiency_name}
                      </span>
                    </td>
                    <td className={`${TD} ${MONO}`}>{formatWindow(row.start_date, row.end_date)}</td>
                    <td className={`${TD} ${MONO}`}>{row.worker_count}</td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(row.supplier_rate_cents)}</td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(row.fee_cents_per_hour)}</td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(row.buyer_rate_cents)}</td>
                    <td className={`${TD} ${MONO}`}>
                      {formatCentsExGst(row.estimated_maintain_revenue_cents)}
                    </td>
                    <td className={TD}>
                      <span className={pill(toneFor(row.overdue ? "Overdue" : row.status))}>
                        {row.overdue ? "Overdue" : row.status}
                      </span>
                      {row.compliance_review_count > 0 && (
                        <span className={`mt-(--space-2) ${pill("critical")}`}>
                          Maintain review · {row.compliance_review_count}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <Link href={`/admin/engagements/${row.id}`} className={LINK}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}
    </div>
  );
}
