import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Notice, PageHeader, Pagination, SectionHeader, TableEmpty, TableFrame } from "@/components/admin-page";
import { Icon } from "@/components/icon";
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
import { BTN_GHOST_SM, LINK, NAV_FOCUS, PANEL } from "@/lib/ui";
import { FIELD, FIELD_HINT, FIELD_LABEL, INPUT_SM, TABLE, TD, TD_NUM, TH, TH_NUM, formatWindow, pill, toneFor } from "@/lib/admin-ui";

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
  const filtered = Boolean(filters.status || filters.timing || filters.buyer || filters.supplier || filters.from || filters.to);

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Engagements"
        lead="Every engagement with the full commercial calculation: supplier rate, platform fee and buyer rate side by side. All figures ex GST."
        meta={
          report && (
            <>
              <span>{rows.length} shown of <strong className="font-semibold text-on-dark">{report.pagination.total}</strong> matching</span>
              <span aria-hidden="true" className="text-on-dark-faint">·</span>
              <span>Page {report.pagination.page}</span>
            </>
          )
        }
        // 14.3 — CSV export of the currently filtered rows is the only reporting
        // facility in MVP, and it carries every field of 13.1.
        actions={report && <a href={engagementExportHref(filters)} className={BTN_GHOST_SM}>Export CSV</a>}
      />

      <section className={`${PANEL} p-(--space-5)`} aria-label="Engagement report filters">
        <form key={engagementPageHref(filters, 1)} method="get" className="grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Status</span>
            <select name="status" defaultValue={filters.status} className={INPUT_SM}>
              <option value="">Any status</option>
              {ENGAGEMENT_REPORT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Timing</span>
            <select name="timing" defaultValue={filters.timing} className={INPUT_SM}>
              <option value="">Any timing</option>
              <option value="overdue">Overdue — awaiting commercial trigger</option>
              <option value="upcoming">Upcoming — confirmed, future start</option>
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Hiring company</span>
            <select name="buyer" defaultValue={filters.buyer} className={INPUT_SM}>
              <option value="">Any hiring company</option>
              {report?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Supplying company</span>
            <select name="supplier" defaultValue={filters.supplier} className={INPUT_SM}>
              <option value="">Any supplying company</option>
              {report?.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Window from</span>
            <input type="date" name="from" defaultValue={filters.from} className={`${INPUT_SM} tabular-nums`} />
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Window to</span>
            <input type="date" name="to" defaultValue={filters.to} min={filters.from || undefined} className={`${INPUT_SM} tabular-nums`} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-(--space-4) sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <p className={FIELD_HINT}>
              Dates include every engagement whose window overlaps the selected range. Timing uses Australia/Brisbane dates.
            </p>
            <div className="flex flex-wrap items-center gap-(--space-4)">
              {filtered && <Link href="/admin/engagements" className={`${LINK} text-sm`}>Reset filters</Link>}
              <button type="submit" className={BTN_GHOST_SM}>Apply filters</button>
            </div>
          </div>
        </form>
      </section>

      {problem && <Notice tone="error">{problem}</Notice>}

      {overdue.length > 0 && (
        <Notice tone="warn">
          <span className="font-semibold">{overdue.length} engagement{overdue.length === 1 ? " on this page has" : "s on this page have"} reached the
          start date without the commercial trigger.</span>{" "}
          They require pre-authorisation to become active, or cancellation by Maintain.
        </Notice>
      )}

      {awaiting.length > 0 && (
        <section className={`${PANEL} p-(--space-5)`} aria-labelledby="awaiting-heading">
          <SectionHeader
            title={<span id="awaiting-heading">Awaiting the commercial trigger</span>}
            hint="On this page. Recording pre-authorisation confirms the engagement and reveals the parties to one another."
          />
          <ul className="mt-(--space-4) divide-y divide-hairline">
            {awaiting.map((row) => (
              <li key={row.id} className="grid gap-(--space-4) py-(--space-4) lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-(--space-3)">
                    <p className="text-body font-semibold text-on-dark">
                      {row.trade_role_name} · {row.proficiency_name} · {row.worker_count} crew
                    </p>
                    {row.overdue && <span className={pill("overdue")}>Overdue</span>}
                  </div>
                  <p className="mt-(--space-1) text-sm text-on-dark-muted">
                    {row.supplier_company_name} → {row.buyer_company_name} ·{" "}
                    <span className="tabular-nums">{formatWindow(row.start_date, row.end_date)}</span>
                  </p>
                  <Link href={`/admin/engagements/${row.id}`} className={`mt-(--space-1) inline-flex min-h-11 items-center gap-(--space-1) text-sm font-semibold text-on-dark-muted hover:text-on-dark ${NAV_FOCUS}`}>
                    Open engagement controls
                    <Icon name="i-arrow-right" className="size-4" />
                  </Link>
                </div>
                <ActionForm
                  action={recordPaymentStatus}
                  submitLabel="Record pre-authorised"
                  pendingLabel="Recording pre-authorisation…"
                  size="sm"
                  className="sm:flex-row sm:flex-wrap sm:items-end"
                >
                  <input type="hidden" name="engagement_id" value={row.id} />
                  <input type="hidden" name="expected_status" value="Awaiting Commercial" />
                  <input type="hidden" name="payment_status" value="pre-authorised" />
                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Payment reference</span>
                    <input
                      name="external_payment_ref"
                      className={`${INPUT_SM} w-full sm:w-56`}
                      placeholder="Off-platform reference"
                    />
                  </label>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report && (
        <section className="flex flex-col gap-(--space-4)" aria-labelledby="register-heading">
          <SectionHeader
            title={<span id="register-heading">Engagements on this page</span>}
            hint="Rates are per hour. Maintain revenue is the estimate frozen at engagement creation."
          />
          <TableFrame>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Supplying</th>
                  <th scope="col" className={TH}>Hiring</th>
                  <th scope="col" className={TH}>Trade</th>
                  <th scope="col" className={TH}>Window</th>
                  <th scope="col" className={TH_NUM}>Crew</th>
                  <th scope="col" className={TH_NUM}>Supplier rate</th>
                  <th scope="col" className={TH_NUM}>Fee /hr</th>
                  <th scope="col" className={TH_NUM}>Buyer rate</th>
                  <th scope="col" className={TH_NUM}>Maintain revenue</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}><span className="sr-only">Controls</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <TableEmpty colSpan={11}>No engagements match this page and its filters.</TableEmpty>
                )}
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD} font-semibold`}>{row.supplier_company_name}</td>
                    <td className={TD}>{row.buyer_company_name}</td>
                    <td className={TD}>
                      {row.trade_role_name}
                      <span className="block text-xs text-on-dark-muted">
                        {row.proficiency_name}
                      </span>
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{formatWindow(row.start_date, row.end_date)}</td>
                    <td className={TD_NUM}>{row.worker_count}</td>
                    <td className={TD_NUM}>{formatCentsExGst(row.supplier_rate_cents)}</td>
                    <td className={TD_NUM}>{formatCentsExGst(row.fee_cents_per_hour)}</td>
                    <td className={TD_NUM}>{formatCentsExGst(row.buyer_rate_cents)}</td>
                    <td className={`${TD_NUM} font-semibold`}>
                      {formatCentsExGst(row.estimated_maintain_revenue_cents)}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col items-start gap-(--space-2)">
                        <span className={pill(toneFor(row.overdue ? "Overdue" : row.status))}>
                          {row.overdue ? "Overdue" : row.status}
                        </span>
                        {row.compliance_review_count > 0 && (
                          <span className={pill("critical")}>
                            Maintain review · {row.compliance_review_count}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} text-right`}>
                      <Link href={`/admin/engagements/${row.id}`} className={`inline-flex min-h-11 items-center gap-(--space-1) text-sm font-semibold text-on-dark-muted hover:text-on-dark ${NAV_FOCUS}`}>
                        Manage
                        <Icon name="i-arrow-right" className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
          <Pagination
            label="Engagement pages"
            summary={<>{rows.length} shown of {report.pagination.total} matching · page {report.pagination.page}</>}
            previousHref={report.pagination.hasPrevious ? engagementPageHref(filters, report.pagination.page - 1) : undefined}
            nextHref={report.pagination.hasNext ? engagementPageHref(filters, report.pagination.page + 1) : undefined}
          />
        </section>
      )}
    </div>
  );
}
