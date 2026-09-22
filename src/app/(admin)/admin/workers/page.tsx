import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, Pagination, TableEmpty, TableFrame } from "@/components/admin-page";
import {
  listAdminWorkers,
  normalizeReportPage,
  normalizeWorkerReportFilters,
  workerExportHref,
  workerPageHref,
} from "@/lib/admin-reporting";
import { requireMaintainAdmin } from "@/lib/auth";
import { maintainSetWorkerStatus, overrideWorkerProficiency } from "@/lib/actions/worker";
import { BTN_GHOST_SM, LINK } from "@/lib/ui";
import {
  FIELD,
  FIELD_LABEL,
  INPUT_SM,
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

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  "proficiency-overridden": { tone: "ok", text: "Proficiency overridden and recorded against your account." },
  "proficiency-unchanged": { tone: "ok", text: "The worker already has that proficiency. No change was made." },
  "proficiency-update-failed": { tone: "error", text: "The proficiency update could not be confirmed. Refresh the worker's details before trying again." },
  "worker-changed": { tone: "error", text: "The worker changed or is no longer available. Review the current details before trying again." },
  "status-updated": { tone: "ok", text: "Worker status updated." },
  "invalid-proficiency": { tone: "error", text: "That proficiency is not offered for the worker's trade." },
  "not-found": { tone: "error", text: "That worker no longer exists." },
  invalid: { tone: "error", text: "That entry was not valid." },
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
  const notice = NOTICES[one("notice")];
  const filters = normalizeWorkerReportFilters(params);
  const page = normalizeReportPage(params);
  const { rows: workers, trades, proficienciesByTrade, pagination } =
    await listAdminWorkers(filters, { kind: "page", page });
  const exportHref = workerExportHref(filters);
  const filtered = Boolean(filters.status || filters.trade);

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Workers"
        lead="Every worker on the platform, with their current employer and proficiency provenance. Records hold facts only — there is no rating anywhere in the schema."
        meta={
          <>
            <span>{workers.length} shown</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>Page {pagination.page}</span>
          </>
        }
        actions={
          <a href={exportHref} className={BTN_GHOST_SM}>
            Export CSV
          </a>
        }
      />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <form method="get" className="flex flex-wrap items-end gap-(--space-3)" aria-label="Worker filters">
        <label className={FIELD}>
          <span className={FIELD_LABEL}>Account status</span>
          <select className={`${INPUT_SM} w-44`} name="status" defaultValue={filters.status}>
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
          <select className={`${INPUT_SM} w-48`} name="trade" defaultValue={filters.trade}>
            <option value="">Any trade</option>
            {trades.map((trade) => (
              <option key={trade.id} value={trade.id}>
                {trade.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={BTN_GHOST_SM}>
          Apply filters
        </button>
        {filtered && (
          <Link href="/admin/workers" className={`${LINK} text-sm`}>
            Clear
          </Link>
        )}
      </form>

      <TableFrame>
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
              <TableEmpty colSpan={6}>
                {filtered ? "No workers match these filters." : "No workers on the platform yet."}
              </TableEmpty>
            ) : (
              workers.map((worker) => {
                const id = worker.id;
                const tradeId = worker.primary_trade_id;
                const options = proficienciesByTrade.get(tradeId) ?? [];
                return (
                  <tr key={id}>
                    <td className={`${TD} font-semibold`}>
                      {worker.first_name} {worker.last_name}
                    </td>
                    <td className={TD}>{worker.employer_name ?? <span className="text-on-dark-muted">None</span>}</td>
                    <td className={TD}>{worker.trade_role_name ?? "—"}</td>
                    <td className={TD}>
                      {/* 6.6 — Maintain can override proficiency; the override is audited
                          and stamped on the worker, so its provenance stays readable. */}
                      <form action={overrideWorkerProficiency} className="flex items-center gap-(--space-2)">
                        <input type="hidden" name="worker_id" value={id} />
                        <select
                          name="proficiency_id"
                          defaultValue={worker.primary_proficiency_id}
                          aria-label={`Proficiency for ${worker.first_name} ${worker.last_name}`}
                          className={`${INPUT_SM} w-40`}
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
                        <button type="submit" className={BTN_GHOST_SM}>
                          Override
                        </button>
                      </form>
                      {worker.proficiency_overridden_by_maintain ? (
                        <p className="mt-(--space-2) text-xs text-on-dark-muted">
                          Set by Maintain <span className="tabular-nums">{formatDate(worker.proficiency_changed_at)}</span>
                        </p>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col items-start gap-(--space-2)">
                        <span className={pill(toneFor(String(worker.status)))}>{worker.status}</span>
                        <form action={maintainSetWorkerStatus} className="flex items-center gap-(--space-2)">
                          <input type="hidden" name="worker_id" value={id} />
                          <select
                            name="status"
                            defaultValue={worker.status}
                            aria-label={`Account status for ${worker.first_name} ${worker.last_name}`}
                            className={`${INPUT_SM} w-32`}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={BTN_GHOST_SM}>
                            Set
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums text-on-dark-muted`}>
                      {formatDate(worker.consent_confirmed_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableFrame>

      <Pagination
        label="Workers pagination"
        summary={<>Page {pagination.page} · {workers.length} shown</>}
        previousHref={pagination.hasPrevious ? workerPageHref(filters, pagination.page - 1) : undefined}
        nextHref={pagination.hasNext ? workerPageHref(filters, pagination.page + 1) : undefined}
      />
    </div>
  );
}
