import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, Pagination, TableEmpty, TableFrame } from "@/components/admin-page";
import { Icon } from "@/components/icon";
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
  FIELD,
  FIELD_LABEL,
  INPUT_SM,
  SUBSECTION_TITLE,
  TABLE,
  TD,
  TH,
  formatDate,
  pill,
  toneFor,
} from "@/lib/platform-ui";
import { BTN_GHOST_SM, LINK, NAV_FOCUS, PANEL } from "@/lib/ui";
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

type Membership = { user_id: string; invited_email: string | null; accepted_at: string | null };

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
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Companies"
        lead="Every registered company, its status, and the controls that change it. Status changes are audited and take effect immediately."
        meta={
          <>
            <span>{companies.length} shown</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>Page {pagination.page}</span>
            {status && (
              <>
                <span aria-hidden="true" className="text-on-dark-faint">·</span>
                <span>Filtered to {status}</span>
              </>
            )}
          </>
        }
        actions={
          <a href={exportHref} className={BTN_GHOST_SM}>
            Export CSV
          </a>
        }
      />

      {saved && <Notice tone="ok">{saved}</Notice>}
      {problem && <Notice tone="error">{problem}</Notice>}

      <form method="get" className="flex flex-wrap items-end gap-(--space-3)" aria-label="Company filters">
        <label className={FIELD}>
          <span className={FIELD_LABEL}>Status</span>
          <select className={`${INPUT_SM} w-44`} name="status" defaultValue={status}>
            <option value="">Any status</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={BTN_GHOST_SM}>
          Apply filter
        </button>
        {status && (
          <Link href="/admin/companies" className={`${LINK} text-sm`}>
            Clear
          </Link>
        )}
      </form>

      <TableFrame>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Registered</th>
              <th className={TH}>Company</th>
              <th className={TH}>Contact</th>
              <th className={TH}>Status</th>
              <th className={TH}>Invitations</th>
              <th className={TH}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <TableEmpty colSpan={6}>No companies match this filter.</TableEmpty>
            )}
            {companies.map((company) => {
              const memberships = (company.company_user ?? []) as Membership[];
              const pendingInvites = memberships.filter((m) => m.invited_email && !m.accepted_at);
              // Clerk binds the first membership only after acceptance. A loginless
              // company still needs a manual invitation recovery path.
              const canReissueFirst =
                pendingInvites.length === 0 &&
                (company.status === "Pending" || company.status === "Active") &&
                memberships.length === 0 &&
                Boolean(company.contact_email?.trim());

              return (
                <tr key={company.id}>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-on-dark-muted`}>{formatDate(company.created_at)}</td>
                  <td className={`${TD} min-w-[16rem]`}>
                    <span className="font-semibold">{company.legal_name}</span>
                    {company.trading_name && (
                      <span className="block text-xs text-on-dark-muted">trading as {company.trading_name}</span>
                    )}
                    <span className="mt-(--space-1) block text-xs tabular-nums text-on-dark-faint">
                      {company.abn ? `ABN ${formatAbn(company.abn)}` : "ABN not provided"}
                    </span>
                  </td>
                  <td className={`${TD} min-w-[12rem]`}>
                    {company.contact_name ?? "—"}
                    <span className="block text-xs text-on-dark-muted [overflow-wrap:anywhere]">{company.contact_email}</span>
                  </td>
                  <td className={TD}>
                    <span className={pill(toneFor(company.status))}>{company.status}</span>
                  </td>
                  <td className={TD}>
                    {pendingInvites.length > 0 ? (
                      <div className="flex flex-col items-start gap-(--space-2)">
                        {pendingInvites.map((membership) => (
                          <form key={membership.user_id} action={reissueInvitation}>
                            <input type="hidden" name="company_id" value={company.id} />
                            <input type="hidden" name="email" value={membership.invited_email ?? ""} />
                            <button type="submit" className={BTN_GHOST_SM} title={`Re-send to ${membership.invited_email}`}>
                              Re-send
                              <span className="max-w-[14ch] truncate font-normal text-on-dark-muted">{membership.invited_email}</span>
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : canReissueFirst ? (
                      <form action={reissueInvitation}>
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="email" value={company.contact_email} />
                        <button type="submit" className={BTN_GHOST_SM}>
                          Re-issue first invitation
                        </button>
                      </form>
                    ) : (
                      <span className="text-on-dark-muted">None pending</span>
                    )}
                  </td>
                  <td className={`${TD} min-w-[16rem]`}>
                    <div className="flex flex-col items-start gap-(--space-2)">
                      {company.status === "Closed" ? (
                        <span className="text-on-dark-muted">Closed is terminal</span>
                      ) : (
                        <form action={setCompanyStatus} className="flex items-center gap-(--space-2)">
                          <input type="hidden" name="company_id" value={company.id} />
                          <input type="hidden" name="expected_status" value={company.status} />
                          <select
                            className={`${INPUT_SM} w-36`}
                            name="status"
                            defaultValue=""
                            required
                            aria-label={`Change status for ${company.legal_name}`}
                          >
                            <option value="" disabled>Set status…</option>
                            {STATUS_TARGETS[company.status].map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={BTN_GHOST_SM}>
                            Apply
                          </button>
                        </form>
                      )}
                      <div className="flex flex-wrap items-center gap-x-(--space-4) text-sm">
                        {company.status !== "Closed" && (
                          <Link className={`inline-flex min-h-11 items-center gap-(--space-1) font-semibold text-on-dark-muted hover:text-on-dark ${NAV_FOCUS}`} href={`/admin/verification?company=${company.id}`}>
                            {company.status === "Pending" ? "Review and approve" : "Review account"}
                            <Icon name="i-arrow-right" className="size-4" />
                          </Link>
                        )}
                        {/* 16.1 — the concierge entry point for a company that phones or
                            emails its capacity, requirements and crew in rather than
                            logging in itself (0.3). */}
                        <Link className={`inline-flex min-h-11 items-center gap-(--space-1) font-semibold text-on-dark-muted hover:text-on-dark ${NAV_FOCUS}`} href={`/admin/companies/${company.id}/concierge`}>
                          Concierge
                          <Icon name="i-arrow-right" className="size-4" />
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFrame>

      <Pagination
        label="Companies pagination"
        summary={<>Page {pagination.page} · {companies.length} shown</>}
        previousHref={pagination.hasPrevious ? companyPageHref(filters, pagination.page - 1) : undefined}
        nextHref={pagination.hasNext ? companyPageHref(filters, pagination.page + 1) : undefined}
      />

      <details className={`group ${PANEL}`}>
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-(--space-4) rounded-(--radius-lg) px-(--space-5) py-(--space-4) [&::-webkit-details-marker]:hidden ${NAV_FOCUS}`}>
          <span>
            <span className={SUBSECTION_TITLE}>What each status means</span>
            <span className="mt-(--space-1) block text-sm text-on-dark-muted">The effect of every status on the company, its crew and its open matches.</span>
          </span>
          <Icon name="i-arrow-right" className="size-4 shrink-0 text-on-dark-muted transition-transform duration-(--dur-base) ease-(--ease-out) group-open:rotate-90" />
        </summary>
        <dl className="grid gap-(--space-5) border-t border-hairline px-(--space-5) py-(--space-5) md:grid-cols-2">
          {STATUSES.map((value) => (
            <div key={value}>
              <dt>
                <span className={pill(toneFor(value))}>{value}</span>
              </dt>
              <dd className="mt-(--space-2) max-w-[60ch] text-sm leading-relaxed text-on-dark-muted">{EFFECTS[value]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
