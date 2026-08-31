import type { Metadata } from "next";
import Link from "next/link";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDecideTransfer } from "@/lib/actions/transfer";
import { ActionForm } from "@/components/action-form";
import { TransferQueuePagination } from "@/components/transfer-queue-pagination";
import { loadTransferPage, type TransferSearchParams } from "@/lib/transfer-queue";
import { COMMITTING_STATUSES } from "@/lib/domain/availability";
import { H1, LINK } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, formatDate, pill, toneFor } from "@/lib/platform-ui";
import type { TransferStatus } from "@/lib/supabase/types";

// Transfer queue — spec 8.3 and 8.4.
//
// Admin Review is where a request lands when the current employer has not answered in
// five business days, when the worker has no current employer at all, or when Maintain
// explicitly takes responsibility with an audited reason. Committing engagements
// must be resolved first; no transfer decision bypasses that database check.

export const metadata: Metadata = { title: "Transfers" };

const NOTICES: Record<string, string> = {
  completed: "Transfer completed. Employment, capacity lines and nominations are updated.",
  declined: "Transfer declined.",
  "blocked-committing":
    "Resolve the worker's committing engagements before approving this transfer.",
  "already-decided": "That request has already been decided.",
  "not-found": "That request no longer exists.",
  invalid: "That decision was not valid.",
  failed: "The transfer could not be confirmed. Refresh and try again.",
};

export default async function AdminTransfersPage({
  searchParams,
}: {
  searchParams: Promise<TransferSearchParams>;
}) {
  await requireMaintainAdmin();
  const search = await searchParams;
  const notice = typeof search.notice === "string" ? search.notice : undefined;
  const admin = createAdminClient();

  const { rows, pagination } = await loadTransferPage(admin, "worker_transfer", search.page);
  const workerIds = [...new Set(rows.map((row) => row.worker_id as string))];
  const companyIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.from_company_id, row.to_company_id].filter((id): id is string => Boolean(id)),
      ),
    ),
  ];

  const [workersResult, companiesResult] = await Promise.all([
    workerIds.length
      ? admin.from("worker").select("id, first_name, last_name").in("id", workerIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[], error: null }),
    companyIds.length
      ? admin.from("company").select("id, legal_name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; legal_name: string }[], error: null }),
  ]);
  if (workersResult.error || companiesResult.error) {
    throw new Error("Transfer identities could not be loaded. Please refresh before deciding.");
  }

  const workerName = new Map(
    (workersResult.data ?? []).map((w) => [w.id as string, `${w.first_name} ${w.last_name}`]),
  );
  const companyName = new Map(
    (companiesResult.data ?? []).map((c) => [c.id as string, c.legal_name as string]),
  );
  // An unavailable identity is not a safe basis for approval or exceptional review.
  // Terminal history has no decision controls and may retain a missing old profile.
  if (rows.some((row) => ["Requested", "Awaiting Current Employer", "Admin Review"].includes(row.status)
    && (!workerName.get(row.worker_id as string)?.trim()
      || !companyName.get(row.to_company_id)?.trim()
      || (row.from_company_id !== null && !companyName.get(row.from_company_id)?.trim())))) {
    throw new Error("Required transfer identities are missing. Please refresh before deciding.");
  }

  // 8.4 — this is an informational check; the transactional RPC checks again under lock.
  const committed = new Set<string>();
  if (workerIds.length > 0) {
    const { data, error } = await admin
      .from("engagement_worker")
      .select("worker_id")
      .in("worker_id", workerIds)
      .in("status", [...COMMITTING_STATUSES]);
    if (error) throw new Error("Committing engagements could not be checked. Please refresh before deciding.");
    for (const row of data ?? []) committed.add(row.worker_id as string);
  }

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <h1 className={H1}>Transfers</h1>
        <p className="mt-(--space-3) max-w-[68ch] text-body-lg text-on-dark-muted">
          Requests escalate here after five business days without a response, or straight
          away when the worker has no current employer.
        </p>
      </div>

      {notice && NOTICES[notice] ? (
        <div className={CARD} role="status">
          <p className="text-body text-on-dark">{NOTICES[notice]}</p>
        </div>
      ) : null}

      <TransferQueuePagination pathname="/admin/transfers" search={search} pagination={pagination} shown={rows.length} />

      <div className={`${CARD} overflow-x-auto p-0`}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Worker</th>
              <th className={TH}>From</th>
              <th className={TH}>To</th>
              <th className={TH}>Requested</th>
              <th className={TH}>Status</th>
              <th className={TH}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={TD} colSpan={6}>
                  No transfer requests on this page.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = row.id as string;
                const status = row.status as TransferStatus;
                const isCommitted = committed.has(row.worker_id as string);
                return (
                  <tr key={id}>
                    <td className={TD}>{workerName.get(row.worker_id as string) ?? "—"}</td>
                    <td className={TD}>
                      {row.from_company_id
                        ? (companyName.get(row.from_company_id as string) ?? "—")
                        : "No current employer"}
                    </td>
                    <td className={TD}>{companyName.get(row.to_company_id as string) ?? "—"}</td>
                    <td className={`${TD} ${MONO}`}>{formatDate(row.created_at as string)}</td>
                    <td className={TD}>
                      <span className={pill(toneFor(status))}>{status}</span>
                      {row.reason ? (
                        <p className="mt-(--space-1) text-body-sm text-on-dark-muted">
                          {row.reason as string}
                        </p>
                      ) : null}
                    </td>
                    <td className={TD}>
                      {status === "Admin Review" ? (
                        <div className="flex flex-col gap-(--space-3)">
                          {isCommitted ? (
                            <div className="max-w-[35ch] text-body-sm text-on-dark-muted">
                              <p>Resolve committing engagements before approving this transfer.</p>
                              <Link href="/admin/engagements" className={LINK}>Review engagements</Link>
                            </div>
                          ) : (
                            <ActionForm action={adminDecideTransfer} submitLabel="Approve transfer" pendingLabel="Approving…">
                              <input type="hidden" name="transfer_id" value={id} />
                              <input type="hidden" name="expected_status" value={status} />
                              <input type="hidden" name="decision" value="approve" />
                            </ActionForm>
                          )}
                          <ActionForm action={adminDecideTransfer} submitLabel="Decline transfer" pendingLabel="Declining…" tone="ghost">
                            <input type="hidden" name="transfer_id" value={id} />
                            <input type="hidden" name="expected_status" value={status} />
                            <input type="hidden" name="decision" value="decline" />
                            <input
                              name="reason"
                              aria-label="Reason for declining (optional)"
                              placeholder="Reason (optional)"
                              maxLength={1000}
                              className="min-h-11 rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-3) py-(--space-2) text-body text-on-dark"
                            />
                          </ActionForm>
                        </div>
                      ) : status === "Requested" || status === "Awaiting Current Employer" ? (
                        <ActionForm action={adminDecideTransfer} submitLabel="Move to Admin Review" pendingLabel="Moving…" tone="ghost">
                          <input type="hidden" name="transfer_id" value={id} />
                          <input type="hidden" name="expected_status" value={status} />
                          <input type="hidden" name="decision" value="review" />
                          <label className="text-body-sm text-on-dark">
                            Reason for exceptional review
                            <textarea
                              name="reason" required minLength={10} maxLength={1000} rows={3}
                              className="mt-(--space-2) block min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-3) py-(--space-2) text-body text-on-dark"
                            />
                          </label>
                        </ActionForm>
                      ) : (
                        <span className={`${MONO} text-body-sm text-on-dark-muted`}>
                          {row.decided_at ? formatDate(row.decided_at as string) : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TransferQueuePagination pathname="/admin/transfers" search={search} pagination={pagination} shown={rows.length} />
    </div>
  );
}
