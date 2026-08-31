import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { retryNotificationAction } from "@/lib/actions/notification";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_GHOST, H1 } from "@/lib/ui";
import { CARD, MONO, PAGE, TABLE, TD, TH } from "@/lib/platform-ui";

export const metadata: Metadata = { title: "Notification delivery" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type FailedNotification = {
  id: string;
  trigger: string;
  recipient_email: string;
  entity_type: string | null;
  entity_id: string | null;
  subject: string | null;
  body: string | null;
  failure_reason: string | null;
  failed_at: string | null;
  created_at: string;
  retry_claimed_at: string | null;
  attempt_count: number;
};

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  // Keep an explicit page-level gate: the service role must never become reachable
  // merely because this page is later moved under a different layout.
  await requireMaintainAdmin();
  const query = await searchParams;
  const page = positivePage(query.page);
  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count, activeLeaseCutoff } = await loadQueue(from);

  if (error) throw new Error(`Unsent notifications could not be loaded: ${error.message}`);
  const failures = (data ?? []) as FailedNotification[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total > 0 && page > totalPages) redirect(`/admin/notifications?page=${totalPages}`);

  return (
    <div className={`${PAGE} flex flex-col gap-(--space-6)`}>
      <div>
        <p className="text-label uppercase tracking-[0.08em] text-on-dark-faint">Delivery operations</p>
        <h1 className={H1}>Notification delivery</h1>
        <p className="mt-(--space-2) max-w-[70ch] text-body text-on-dark-muted">
          Failed email never rolls back its workflow. Queued and interrupted deliveries stay here
          until sent. Re-send the exact stored payload; recipient and copy cannot be edited.
        </p>
        <p className="mt-(--space-2) text-label text-on-dark-faint">
          {total} unsent {total === 1 ? "notification" : "notifications"}
        </p>
      </div>

      {failures.length === 0 ? (
        <section className={CARD}>
          <h2 className="font-display text-h2 font-bold text-on-dark">No unsent notifications</h2>
          <p className="mt-(--space-2) text-body text-on-dark-muted">
            All recorded notifications have been sent.
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-lg) border border-hairline">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Event</th>
                <th className={TH}>Recipient</th>
                <th className={TH}>Delivery state</th>
                <th className={TH}>Completed attempts</th>
                <th className={TH}>Action</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((row) => {
                const retryable = Boolean(row.subject && row.body);
                const inProgress = row.retry_claimed_at !== null &&
                  Date.parse(row.retry_claimed_at) > activeLeaseCutoff;
                return (
                  <tr key={row.id}>
                    <td className={TD}>
                      <p className="font-semibold text-on-dark">{row.trigger}</p>
                      {row.subject && (
                        <p className="mt-(--space-1) text-body-sm text-on-dark-muted">{row.subject}</p>
                      )}
                      {row.entity_type && row.entity_id && (
                        <p className={`${MONO} mt-(--space-1) text-label text-on-dark-faint`}>
                          {row.entity_type} · {row.entity_id}
                        </p>
                      )}
                    </td>
                    <td className={`${TD} ${MONO} text-body-sm`}>{row.recipient_email}</td>
                    <td className={TD}>
                      <p className="text-body-sm text-status-critical">
                        {row.failure_reason ?? (row.retry_claimed_at
                          ? "Delivery interrupted or still in progress. Check its provider receipt before re-sending."
                          : "Awaiting its first delivery attempt.")}
                      </p>
                      <p className="mt-(--space-1) text-label text-on-dark-faint">
                        {formatTimestamp(row.failed_at ?? row.created_at)}
                      </p>
                    </td>
                    <td className={`${TD} ${MONO}`}>{row.attempt_count}</td>
                    <td className={TD}>
                      {inProgress ? (
                        <p className="text-body-sm text-on-dark-muted">Delivery in progress.</p>
                      ) : retryable ? (
                        <ActionForm
                          action={retryNotificationAction}
                          submitLabel="Re-send notification"
                          pendingLabel="Re-sending…"
                          tone="ghost"
                        >
                          <input type="hidden" name="notification_id" value={row.id} />
                        </ActionForm>
                      ) : (
                        <p className="max-w-[28ch] text-body-sm text-on-dark-faint">
                          Legacy row — the original payload was not stored, so it cannot be safely re-sent.
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Notification failure pages" className="flex items-center gap-(--space-3)">
          {page > 1 ? (
            <Link href={`/admin/notifications?page=${page - 1}`} className={BTN_GHOST}>
              Previous
            </Link>
          ) : null}
          <span className="text-body-sm text-on-dark-muted">
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/admin/notifications?page=${page + 1}`} className={BTN_GHOST}>
              Next
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}

/** Request-time queue snapshot; lease authority remains the transactional RPC. */
async function loadQueue(from: number) {
  const result = await createAdminClient()
    .from("notification")
    .select(
      "id, trigger, recipient_email, entity_type, entity_id, subject, body, failure_reason, failed_at, created_at, retry_claimed_at, attempt_count",
      { count: "exact" },
    )
    .is("sent_at", null)
    .order("failed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  return { ...result, activeLeaseCutoff: Date.now() - 15 * 60_000 };
}

function positivePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Time unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Brisbane",
  }).format(new Date(value));
}
