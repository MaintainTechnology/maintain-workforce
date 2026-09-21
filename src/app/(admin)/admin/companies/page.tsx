import type { Metadata } from "next";
import Link from "next/link";
import { reissueInvitation, setCompanyStatus } from "@/lib/actions/company";
import {
  companyExportHref,
  companyPageHref,
  listAdminCompanies,
  normalizeCompanyReportFilters,
  normalizeReportPage,
} from "@/lib/admin-reporting";
import { requireMaintainAdmin } from "@/lib/auth";
import { formatAbn } from "@/lib/domain/abn";
import {
  CARD,
  FIELD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
  PAGE,
  TABLE,
  TD,
  TH,
  formatDate,
  pill,
  toneFor,
} from "@/lib/platform-ui";
import { BTN_GHOST, H1, H2, LINK } from "@/lib/ui";
import type { CompanyStatus } from "@/lib/supabase/types";

// Company statuses and their effects. Pending → Active by Maintain approval,
// Active ⇄ Suspended, any → Closed (terminal). Only a Maintain admin changes a
// company's status (1.5), and every change is audited (18.2).

export const metadata: Metadata = { title: "Companies" };

const STATUSES: CompanyStatus[] = ["Pending", "Active", "Suspended", "Closed"];
const STATUS_TARGETS: Record<CompanyStatus, CompanyStatus[]> = {
  Pending: ["Active", "Closed"],
  Active: ["Suspended", "Closed"],
  Suspended: ["Active", "Closed"],
  Closed: [],
};

const FEEDBACK: Record<string, string> = {
  status: "Company status changed.",
  invited: "A fresh invitation link was sent.",
};

const PROBLEM: Record<string, string> = {
  invalid: "That request was missing something, so nothing changed.",
  invalid_email: "That invitation email is not valid.",
  invite_failed: "That pending invitation could not be re-issued.",
  invite_delivery_failed:
    "The invitation was refreshed, but its email was not delivered. It can be tried again.",
  already_active: "That administrator has already accepted the invitation.",
  not_found: "That company no longer exists.",
  closed_is_terminal: "Closed is terminal — a closed company cannot be reopened.",
  stale: "The company or its matches changed. Refresh before trying again; nothing was changed.",
  checklist_incomplete: "Maintain admins can approve accounts with outstanding checklist items through Account approvals.",
  invalid_transition: "That status change is not available. Closed companies cannot be reopened.",
  save_failed: "The status change could not be saved. Refresh and try again.",
};

/** 3.2, stated on the screen so the consequence of the click is never a surprise. */
const EFFECTS: Record<CompanyStatus, string> = {
  Pending:
    "Can complete its profile, upload documents and add crew. Cannot list capacity or post requirements, and is absent from matching.",
  Active: "Full access. Can both sell spare capacity and post requirements. Maintain admins can approve incomplete accounts; document verification stays unchanged.",
  Suspended:
    "Read-only for its users. Its crew is excluded from matching, new supply and demand are blocked, its open matches are withdrawn and both parties notified, and engagements in a committing status are flagged for Maintain review.",
  Closed: "Terminal. Set by Maintain only; the account cannot be reopened.",
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaintainAdmin();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const filters = normalizeCompanyReportFilters(params);
  const page = normalizeReportPage(params);
  const status = filters.status;
  const saved = FEEDBACK[one("saved")];
  const problem = PROBLEM[one("error")];
  const { rows: companies, pagination } = await listAdminCompanies(filters, {
    kind: "page",
    page,
  });
  const exportHref = companyExportHref(filters);

  return (
    <div className={`${PAGE} flex flex-col gap-(--space-6)`}>
      <header className="flex flex-wrap items-center gap-(--space-4)">
        <h1 className={H1}>Companies</h1>
        <span className={`${MONO} text-body text-on-dark-muted`}>
          {companies.length} shown · page {pagination.page}
        </span>
        <a href={exportHref} className={`${BTN_GHOST} ml-auto`}>
          Export CSV
        </a>
      </header>

      {saved && (
        <p role="status" className={`${CARD} text-body text-on-dark`}>
          {saved}
        </p>
      )}
      {problem && (
        <p role="alert" className={`${CARD} text-body text-on-dark`}>
          {problem}
        </p>
      )}

      <section className={CARD}>
        <form method="get" className="flex flex-wrap items-end gap-(--space-4)">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Status</span>
            <select className={INPUT} name="status" defaultValue={status}>
              <option value="">Any status</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={BTN_GHOST}>
            Apply filter
          </button>
          <Link href="/admin/companies" className={LINK}>
            Clear
          </Link>
        </form>
      </section>

      <section className={CARD}>
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Registered</th>
                <th className={TH}>Company</th>
                <th className={TH}>ABN</th>
                <th className={TH}>Contact</th>
                <th className={TH}>Status</th>
                <th className={TH}>Change status</th>
                <th className={TH}>Pending invitations</th>
                <th className={TH}>Concierge</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 && (
                <tr>
                  <td className={TD} colSpan={8}>
                    <span className="text-on-dark-muted">No companies match this filter.</span>
                  </td>
                </tr>
              )}
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className={`${TD} ${MONO}`}>{formatDate(company.created_at)}</td>
                  <td className={TD}>
                    {company.legal_name}
                    {company.trading_name && (
                      <>
                        <br />
                        <span className="text-body-sm text-on-dark-muted">
                          trading as {company.trading_name}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={`${TD} ${MONO}`}>
                    {company.abn ? formatAbn(company.abn) : "—"}
                  </td>
                  <td className={TD}>
                    {company.contact_name ?? "—"}
                    <br />
                    <span className={`${MONO} text-body-sm text-on-dark-muted`}>
                      {company.contact_email}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className={pill(toneFor(company.status))}>{company.status}</span>
                  </td>
                  <td className={TD}>
                    {company.status === "Closed" ? (
                      <span className="text-on-dark-muted">terminal</span>
                    ) : (
                      <form action={setCompanyStatus} className="flex flex-wrap items-center gap-(--space-2)">
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="expected_status" value={company.status} />
                        <select
                          className={INPUT}
                          name="status"
                          defaultValue=""
                          required
                          aria-label={`Status for ${company.legal_name}`}
                        >
                          <option value="" disabled>Choose action</option>
                          {STATUS_TARGETS[company.status].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={BTN_GHOST}>
                          Apply
                        </button>
                        <Link className={LINK} href={`/admin/verification?company=${company.id}`}>
                          {company.status === "Pending" ? "Review and approve" : "Review account"}
                        </Link>
                      </form>
                    )}
                  </td>
                  <td className={TD}>
                    {(company.company_user ?? []).filter(
                      (membership: { invited_email: string | null; accepted_at: string | null }) =>
                        membership.invited_email && !membership.accepted_at,
                    ).length === 0 ? (
                      // Clerk binds the first membership only after acceptance. A
                      // loginless company still needs a manual invitation recovery path.
                      (company.status === "Pending" || company.status === "Active") &&
                      (company.company_user ?? []).length === 0 && company.contact_email?.trim() ? (
                        <form action={reissueInvitation}>
                          <input type="hidden" name="company_id" value={company.id} />
                          <input type="hidden" name="email" value={company.contact_email} />
                          <button type="submit" className={BTN_GHOST}>
                            Re-issue first administrator invitation
                          </button>
                        </form>
                      ) : (
                        <span className="text-on-dark-muted">None</span>
                      )
                    ) : (
                      <div className="flex flex-col items-start gap-(--space-2)">
                        {(company.company_user ?? [])
                          .filter(
                            (membership: {
                              invited_email: string | null;
                              accepted_at: string | null;
                            }) => membership.invited_email && !membership.accepted_at,
                          )
                          .map(
                            (membership) => (
                              <form key={membership.user_id} action={reissueInvitation}>
                                <input type="hidden" name="company_id" value={company.id} />
                                <input
                                  type="hidden"
                                  name="email"
                                  value={membership.invited_email ?? ""}
                                />
                                <button type="submit" className={BTN_GHOST}>
                                  Re-send {membership.invited_email}
                                </button>
                              </form>
                            ),
                          )}
                      </div>
                    )}
                  </td>
                  <td className={TD}>
                    {/* 16.1 — the concierge entry point for a company that phones or
                        emails its capacity, requirements and crew in rather than
                        logging in itself (0.3). */}
                    <Link className={LINK} href={`/admin/companies/${company.id}/concierge`}>
                      Concierge
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav
          aria-label="Companies pagination"
          className="mt-(--space-4) flex flex-wrap items-center justify-between gap-(--space-3)"
        >
          <span className={`${MONO} text-body-sm text-on-dark-muted`}>
            Page {pagination.page}
          </span>
          <div className="flex items-center gap-(--space-2)">
            {pagination.hasPrevious ? (
              <Link
                className={BTN_GHOST}
                href={companyPageHref(filters, pagination.page - 1)}
              >
                Previous
              </Link>
            ) : (
              <span className="text-body-sm text-on-dark-muted" aria-disabled="true">
                Previous
              </span>
            )}
            {pagination.hasNext ? (
              <Link
                className={BTN_GHOST}
                href={companyPageHref(filters, pagination.page + 1)}
              >
                Next
              </Link>
            ) : (
              <span className="text-body-sm text-on-dark-muted" aria-disabled="true">
                Next
              </span>
            )}
          </div>
        </nav>
      </section>

      <section className={CARD}>
        <h2 className={H2}>What each status means</h2>
        <dl className="mt-(--space-4) grid gap-(--space-4) md:grid-cols-2">
          {STATUSES.map((value) => (
            <div key={value}>
              <dt>
                <span className={pill(toneFor(value))}>{value}</span>
              </dt>
              <dd className={`${FIELD_HINT} mt-(--space-2) max-w-[60ch]`}>{EFFECTS[value]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
