import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, TableEmpty, TableFrame } from "@/components/admin-page";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDecideTransfer } from "@/lib/actions/transfer";
import { ActionForm } from "@/components/action-form";
import { TransferQueuePagination } from "@/components/transfer-queue-pagination";
import { loadTransferPage, type TransferSearchParams } from "@/lib/transfer-queue";
import { COMMITTING_STATUSES } from "@/lib/domain/availability";
import { LINK } from "@/lib/ui";
import { FIELD_LABEL, INPUT_SM, TABLE, TD, TH, formatDate, pill, toneFor } from "@/lib/platform-ui";
import type { TransferStatus } from "@/lib/supabase/types";

// Transfer queue — spec 8.3 and 8.4.
//
// Admin Review is where a request lands when the current employer has not answered in
// five business days, when the worker has no current employer at all, or when Maintain
// explicitly takes responsibility with an audited reason. Committing engagements
// must be resolved first; no transfer decision bypasses that database check.

export const metadata: Metadata = { title: "Transfers" };

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  completed: { tone: "ok", text: "Transfer completed. Employment, capacity lines and nominations are updated." },
  declined: { tone: "ok", text: "Transfer declined." },
  "blocked-committing": { tone: "error", text: "Resolve the worker's committing engagements before approving this transfer." },
  "already-decided": { tone: "error", text: "That request has already been decided." },
  "not-found": { tone: "error", text: "That request no longer exists." },
  invalid: { tone: "error", text: "That decision was not valid." },
  failed: { tone: "error", text: "The transfer could not be confirmed. Refresh and try again." },
};

export default async function AdminTransfersPage({
  searchParams,
}: {
  searchParams: Promise<TransferSearchParams>;
}) {
  await requireMaintainAdmin();
  const search = await searchParams;
  const notice = NOTICES[typeof search.notice === "string" ? search.notice : ""];
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

  const inReview = rows.filter((row) => row.status === "Admin Review").length;

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Transfers"
        lead="Requests escalate here after five business days without a response, or straight away when the worker has no current employer. Approving a transfer moves the worker's employment, capacity lines and nominations together."
        meta={
          <>
            <span><strong className="font-semibold text-on-dark">{inReview}</strong> in Admin Review on this page</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>Newest first</span>
          </>
        }
      />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <TableFrame>
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
              <TableEmpty colSpan={6}>No transfer requests on this page.</TableEmpty>
            ) : (
              rows.map((row) => {
                const id = row.id as string;
                const status = row.status as TransferStatus;
                const isCommitted = committed.has(row.worker_id as string);
                return (
                  <tr key={id}>
                    <td className={`${TD} font-semibold`}>{workerName.get(row.worker_id as string) ?? "—"}</td>
                    <td className={TD}>
                      {row.from_company_id
                        ? (companyName.get(row.from_company_id as string) ?? "—")
                        : <span className="text-on-dark-muted">No current employer</span>}
                    </td>
                    <td className={TD}>{companyName.get(row.to_company_id as string) ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums text-on-dark-muted`}>{formatDate(row.created_at as string)}</td>
                    <td className={`${TD} max-w-[22rem]`}>
                      <span className={pill(toneFor(status))}>{status}</span>
                      {row.reason ? (
                        <p className="mt-(--space-2) text-xs leading-relaxed text-on-dark-muted">
                          {row.reason as string}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${TD} min-w-[18rem]`}>
                      {status === "Admin Review" ? (
                        <div className="flex flex-col gap-(--space-4)">
                          {isCommitted ? (
                            <div className="max-w-[35ch] text-sm text-on-dark-muted">
                              <p>Resolve committing engagements before approving this transfer.</p>
                              <Link href="/admin/engagements" className={`${LINK} text-sm`}>Review engagements</Link>
                            </div>
                          ) : (
                            <ActionForm action={adminDecideTransfer} submitLabel="Approve transfer" pendingLabel="Approving…" size="sm">
                              <input type="hidden" name="transfer_id" value={id} />
                              <input type="hidden" name="expected_status" value={status} />
                              <input type="hidden" name="decision" value="approve" />
                            </ActionForm>
                          )}
                          <ActionForm action={adminDecideTransfer} submitLabel="Decline transfer" pendingLabel="Declining…" tone="ghost" size="sm">
                            <input type="hidden" name="transfer_id" value={id} />
                            <input type="hidden" name="expected_status" value={status} />
                            <input type="hidden" name="decision" value="decline" />
                            <input
                              name="reason"
                              aria-label="Reason for declining (optional)"
                              placeholder="Reason (optional)"
                              maxLength={1000}
                              className={INPUT_SM}
                            />
                          </ActionForm>
                        </div>
                      ) : status === "Requested" || status === "Awaiting Current Employer" ? (
                        <ActionForm action={adminDecideTransfer} submitLabel="Move to Admin Review" pendingLabel="Moving…" tone="ghost" size="sm">
                          <input type="hidden" name="transfer_id" value={id} />
                          <input type="hidden" name="expected_status" value={status} />
                          <input type="hidden" name="decision" value="review" />
                          <label className="flex flex-col gap-(--space-2)">
                            <span className={FIELD_LABEL}>Reason for exceptional review</span>
                            <textarea
                              name="reason" required minLength={10} maxLength={1000} rows={3}
                              className={INPUT_SM}
                            />
                          </label>
                        </ActionForm>
                      ) : (
                        <span className="text-sm tabular-nums text-on-dark-muted">
                          Decided {row.decided_at ? formatDate(row.decided_at as string) : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableFrame>
      <TransferQueuePagination pathname="/admin/transfers" search={search} pagination={pagination} shown={rows.length} />
    </div>
  );
}
