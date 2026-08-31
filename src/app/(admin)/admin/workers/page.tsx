import type { Metadata } from "next";
import Link from "next/link";
import {
  listAdminWorkers,
  normalizeReportPage,
  normalizeWorkerReportFilters,
  workerExportHref,
  workerPageHref,
} from "@/lib/admin-reporting";
import { requireMaintainAdmin } from "@/lib/auth";
import { maintainSetWorkerStatus, overrideWorkerProficiency } from "@/lib/actions/worker";
import { BTN_GHOST, H1, LINK } from "@/lib/ui";
import {
  CARD,
  FIELD,
  FIELD_LABEL,
  INPUT,
  MONO,
  TABLE,
  TD,
  TH,
  formatDate,
  pill,
  toneFor,
} from "@/lib/platform-ui";
import type { WorkerStatus } from "@/lib/supabase/types";

// Maintain's worker register — spec 6.5, 6.6 and 17.3.
//
// This is the one surface in the product that sees across companies, and it exists
// because Maintain sits at the centre of every transaction (module 16). It is not a
// marketplace browse: 8.1's ban on cross-company worker search applies to companies,
// and nothing here is reachable without the maintain_admin claim.

export const metadata: Metadata = { title: "Workers" };

const NOTICES: Record<string, string> = {
  "proficiency-overridden": "Proficiency overridden and recorded against your account.",
  "proficiency-unchanged": "The worker already has that proficiency. No change was made.",
  "proficiency-update-failed": "The proficiency update could not be confirmed. Refresh the worker's details before trying again.",
  "worker-changed": "The worker changed or is no longer available. Review the current details before trying again.",
  "status-updated": "Worker status updated.",
  "invalid-proficiency": "That proficiency is not offered for the worker's trade.",
  "not-found": "That worker no longer exists.",
  invalid: "That entry was not valid.",
};

const STATUSES: WorkerStatus[] = ["Active", "Inactive", "Suspended"];

export default async function AdminWorkersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaintainAdmin();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : "");
  const notice = one("notice");
  const filters = normalizeWorkerReportFilters(params);
  const page = normalizeReportPage(params);
  const { rows: workers, trades, proficienciesByTrade, pagination } =
    await listAdminWorkers(filters, { kind: "page", page });
  const exportHref = workerExportHref(filters);

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div className="flex flex-wrap items-end justify-between gap-(--space-4)">
        <div>
          <h1 className={H1}>Workers</h1>
          <p className="mt-(--space-3) max-w-[68ch] text-body-lg text-on-dark-muted">
            Every worker on the platform, with their current employer and proficiency
            provenance. Records hold facts only — there is no rating anywhere in the schema.
          </p>
        </div>
        <a href={exportHref} className={BTN_GHOST}>
          Export CSV
        </a>
      </div>

      {notice && NOTICES[notice] ? (
        <div className={CARD} role="status">
          <p className="text-body text-on-dark">{NOTICES[notice]}</p>
        </div>
      ) : null}

      <section className={CARD}>
        <form method="get" className="flex flex-wrap items-end gap-(--space-4)">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Account status</span>
            <select className={INPUT} name="status" defaultValue={filters.status}>
              <option value="">Any status</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Primary trade</span>
            <select className={INPUT} name="trade" defaultValue={filters.trade}>
              <option value="">Any trade</option>
              {trades.map((trade) => (
                <option key={trade.id} value={trade.id}>
                  {trade.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={BTN_GHOST}>
            Apply filters
          </button>
          <Link href="/admin/workers" className={LINK}>
            Clear
          </Link>
        </form>
      </section>

      <div className={`${CARD} overflow-x-auto p-0`}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Worker</th>
              <th className={TH}>Current employer</th>
              <th className={TH}>Trade</th>
              <th className={TH}>Proficiency</th>
              <th className={TH}>Account</th>
              <th className={TH}>Consent</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td className={TD} colSpan={6}>
                  No workers match these filters.
                </td>
              </tr>
            ) : (
              workers.map((worker) => {
                const id = worker.id;
                const tradeId = worker.primary_trade_id;
                const options = proficienciesByTrade.get(tradeId) ?? [];
                return (
                  <tr key={id}>
                    <td className={TD}>
                      {worker.first_name} {worker.last_name}
                    </td>
                    <td className={TD}>{worker.employer_name ?? "None"}</td>
                    <td className={`${TD} ${MONO}`}>{worker.trade_role_name ?? "—"}</td>
                    <td className={TD}>
                      {/* 6.6 — Maintain can override proficiency; the override is audited
                          and stamped on the worker, so its provenance stays readable. */}
                      <form action={overrideWorkerProficiency} className="flex flex-wrap items-center gap-(--space-2)">
                        <input type="hidden" name="worker_id" value={id} />
                        <select
                          name="proficiency_id"
                          defaultValue={worker.primary_proficiency_id}
                          className="min-h-11 rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-3) py-(--space-2) text-body text-on-dark"
                        >
                          {options.length === 0 ? (
                            <option value={worker.primary_proficiency_id}>
                              {worker.proficiency_name ?? "—"}
                            </option>
                          ) : (
                            options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))
                          )}
                        </select>
                        <button type="submit" className={BTN_GHOST}>
                          Override
                        </button>
                      </form>
                      {worker.proficiency_overridden_by_maintain ? (
                        <p className="mt-(--space-1) text-body-sm text-on-dark-muted">
                          Maintain-set {formatDate(worker.proficiency_changed_at)}
                        </p>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <form action={maintainSetWorkerStatus} className="flex flex-wrap items-center gap-(--space-2)">
                        <input type="hidden" name="worker_id" value={id} />
                        <select
                          name="status"
                          defaultValue={worker.status}
                          className="min-h-11 rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-3) py-(--space-2) text-body text-on-dark"
                        >
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={BTN_GHOST}>
                          Set
                        </button>
                      </form>
                      <span className={`${pill(toneFor(String(worker.status)))} mt-(--space-2) inline-flex`}>
                        {worker.status}
                      </span>
                    </td>
                    <td className={`${TD} ${MONO}`}>
                      {formatDate(worker.consent_confirmed_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="Workers pagination"
        className="flex flex-wrap items-center justify-between gap-(--space-3)"
      >
        <span className={`${MONO} text-body-sm text-on-dark-muted`}>
          {workers.length} shown · page {pagination.page}
        </span>
        <div className="flex items-center gap-(--space-2)">
          {pagination.hasPrevious ? (
            <Link
              className={BTN_GHOST}
              href={workerPageHref(filters, pagination.page - 1)}
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
              href={workerPageHref(filters, pagination.page + 1)}
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
    </div>
  );
}
