import Link from "next/link";
import type { Metadata } from "next";
import { requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { approveTransfer, declineTransfer, withdrawTransfer } from "@/lib/actions/transfer";
import { ActionForm } from "@/components/action-form";
import { TransferQueuePagination } from "@/components/transfer-queue-pagination";
import { loadTransferPage, type TransferSearchParams } from "@/lib/transfer-queue";
import { H1, LINK } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, formatDate, pill, toneFor } from "@/lib/platform-ui";
import type { TransferStatus } from "@/lib/supabase/types";

// Transfers — spec module 8.
//
// 8.1: there is no cross-company worker search anywhere, and a transfer starts only from
// the 6.2 duplicate-detection path on the "Add a worker" form. This screen is therefore a
// queue of things already in motion, never a place to go looking for someone.
//
// Rows come from company_transfer_view, not from worker_transfer: the base table is
// revoked from `authenticated` (17.1) and the view withholds the current employer from
// the requesting side until the transfer completes, which is what keeps 6.2's promise.

export const metadata: Metadata = { title: "Transfers" };

const NOTICES: Record<string, string> = {
  completed: "Transfer approved. The worker's employment record has moved across.",
  declined: "Transfer declined.",
  withdrawn: "Request withdrawn.",
  "blocked-committing":
    "That worker is on a committed engagement, so the transfer cannot complete. Maintain can review it.",
  "already-decided": "That request has already been decided.",
  "not-permitted": "That request is not yours to decide.",
  failed: "The transfer could not be confirmed. Refresh and try again, or contact Maintain.",
};

/** 8.6 — statuses a request can still move out of. */
const LIVE: TransferStatus[] = ["Requested", "Awaiting Current Employer", "Admin Review"];

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<TransferSearchParams>;
}) {
  const { companyId } = await requireCompanyAdmin();
  const search = await searchParams;
  const notice = typeof search.notice === "string" ? search.notice : undefined;
  const supabase = await createClient();

  const { rows, pagination } = await loadTransferPage(supabase, "company_transfer_view", search.page);
  const incoming = rows.filter((row) => row.from_company_id === companyId);
  const outgoing = rows.filter((row) => row.to_company_id === companyId);

  // Names are resolvable only for workers this business currently employs, which is
  // exactly the incoming side. On the outgoing side the worker is someone else's until
  // the transfer completes, and RLS returns nothing — as 6.2 requires.
  const workerName = new Map<string, string>();
  const incomingWorkerIds = incoming.map((row) => row.worker_id as string);
  if (incomingWorkerIds.length > 0) {
    const { data: workers, error } = await supabase
      .from("worker")
      .select("id, first_name, last_name")
      .in("id", incomingWorkerIds);
    if (error) throw new Error("Transfer identities could not be loaded. Please refresh before deciding.");
    for (const worker of workers ?? []) {
      workerName.set(worker.id as string, `${worker.first_name} ${worker.last_name}`);
    }
  }
  // A former employer legitimately loses live profile access after completion.
  // A current-employer decision, however, must never be offered without its worker.
  if (incoming.some((row) => row.status === "Awaiting Current Employer"
    && !workerName.get(row.worker_id as string)?.trim())) {
    throw new Error("Required transfer identities are missing. Please refresh before deciding.");
  }

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <h1 className={H1}>Transfers</h1>
        <p className="mt-(--space-3) max-w-[62ch] text-body-lg text-on-dark-muted">
          When a business tries to add a worker who is already on the platform, we ask
          the current employer instead of creating a second record. Requests wait five
          business days before Maintain steps in.
        </p>
        <Link href="/app/workers" className={`${LINK} mt-(--space-4) inline-block`}>
          Back to your crew
        </Link>
      </div>

      {notice && NOTICES[notice] ? (
        <div className={CARD} role="status">
          <p className="text-body text-on-dark">{NOTICES[notice]}</p>
        </div>
      ) : null}

      <TransferQueuePagination pathname="/app/transfers" search={search} pagination={pagination} shown={rows.length} />

      <section className={CARD}>
        <h2 className="text-title font-display font-bold text-on-dark">
          Requests received
        </h2>
        <p className="mt-(--space-2) text-body-sm text-on-dark-muted">
          Approving closes this worker&rsquo;s employment with you and opens it with the
          requesting business straight away.
        </p>

        {incoming.length === 0 ? (
          <p className="mt-(--space-4) text-body text-on-dark-muted">No received requests on this page.</p>
        ) : (
          <div className="mt-(--space-4) overflow-x-auto">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Worker</th>
                  <th className={TH}>Requested</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {incoming.map((row) => {
                  const id = row.id as string;
                  const status = row.status as TransferStatus;
                  return (
                    <tr key={id}>
                      <td className={TD}>{workerName.get(row.worker_id as string) ?? "—"}</td>
                      <td className={`${TD} ${MONO}`}>{formatDate(row.created_at as string)}</td>
                      <td className={TD}>
                        <span className={pill(toneFor(status))}>{status}</span>
                      </td>
                      <td className={TD}>
                        {status === "Awaiting Current Employer" ? (
                          <div className="flex flex-wrap items-center gap-(--space-3)">
                            <ActionForm action={approveTransfer} submitLabel="Approve transfer" pendingLabel="Approving…">
                              <input type="hidden" name="transfer_id" value={id} />
                              <input type="hidden" name="expected_status" value={status} />
                            </ActionForm>
                            <ActionForm action={declineTransfer} submitLabel="Decline transfer" pendingLabel="Declining…" tone="ghost">
                              <input type="hidden" name="transfer_id" value={id} />
                              <input type="hidden" name="expected_status" value={status} />
                              <input
                                name="reason"
                                aria-label="Reason for declining (optional)"
                                placeholder="Reason (optional)"
                                maxLength={1000}
                                className="min-h-11 rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-3) py-(--space-2) text-body text-on-dark"
                              />
                            </ActionForm>
                          </div>
                        ) : (
                          <span className="text-body-sm text-on-dark-muted">
                            {row.decided_at ? formatDate(row.decided_at as string) : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-title font-display font-bold text-on-dark">Requests you made</h2>
        <p className="mt-(--space-2) max-w-[62ch] text-body-sm text-on-dark-muted">
          We cannot show you the worker or their current employer until the transfer
          completes. You can withdraw a request at any time before it is decided.
        </p>

        {outgoing.length === 0 ? (
          <p className="mt-(--space-4) text-body text-on-dark-muted">
            No requests you made on this page. New requests start from the &ldquo;Add a worker&rdquo; form when the details
            you enter match a record we already hold.
          </p>
        ) : (
          <div className="mt-(--space-4) overflow-x-auto">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Requested</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Reason given</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {outgoing.map((row) => {
                  const id = row.id as string;
                  const status = row.status as TransferStatus;
                  return (
                    <tr key={id}>
                      <td className={`${TD} ${MONO}`}>{formatDate(row.created_at as string)}</td>
                      <td className={TD}>
                        <span className={pill(toneFor(status))}>{status}</span>
                      </td>
                      <td className={TD}>{(row.reason as string | null) ?? "—"}</td>
                      <td className={TD}>
                        {LIVE.includes(status) ? (
                          <ActionForm action={withdrawTransfer} submitLabel="Withdraw request" pendingLabel="Withdrawing…" tone="ghost">
                            <input type="hidden" name="transfer_id" value={id} />
                            <input type="hidden" name="expected_status" value={status} />
                          </ActionForm>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <TransferQueuePagination pathname="/app/transfers" search={search} pagination={pagination} shown={rows.length} />
    </div>
  );
}
