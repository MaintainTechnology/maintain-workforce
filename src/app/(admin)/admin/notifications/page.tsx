import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader, Pagination, TableFrame } from "@/components/admin-page";
import { ActionForm } from "@/components/action-form";
import { retryNotificationAction } from "@/lib/actions/notification";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLE, TD, TD_NUM, TH, TH_NUM } from "@/lib/admin-ui";

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
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Notification delivery"
        lead="Review failed or interrupted email deliveries. Re-sending uses the original recipient and message, so you can retry without changing the completed workflow."
        meta={
          <span>
            <strong className="font-semibold text-on-dark">{total}</strong> unsent {total === 1 ? "notification" : "notifications"}
          </span>
        }
      />

      {failures.length === 0 ? (
        <EmptyState title="No unsent notifications">
          Every recorded notification has been delivered. Failed or interrupted sends will appear here with their provider reason.
        </EmptyState>
      ) : (
        <TableFrame>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Event</th>
                <th className={TH}>Recipient</th>
                <th className={TH}>Delivery state</th>
                <th className={TH_NUM}>Attempts</th>
                <th className={TH}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {failures.map((row) => {
                const retryable = Boolean(row.subject && row.body);
                const inProgress = row.retry_claimed_at !== null &&
                  Date.parse(row.retry_claimed_at) > activeLeaseCutoff;
                return (
                  <tr key={row.id}>
                    <td className={`${TD} min-w-[14rem]`}>
                      <p className="font-semibold">{row.trigger}</p>
                      {row.subject && (
                        <p className="mt-(--space-1) text-xs text-on-dark-muted">{row.subject}</p>
                      )}
                      {row.entity_type && row.entity_id && (
                        <p className="mt-(--space-1) text-xs tabular-nums text-on-dark-faint [overflow-wrap:anywhere]">
                          {row.entity_type} · {row.entity_id}
                        </p>
                      )}
                    </td>
                    <td className={`${TD} text-on-dark-muted [overflow-wrap:anywhere]`}>{row.recipient_email}</td>
                    <td className={`${TD} max-w-[26rem]`}>
                      {/* Dot-and-Label: the failure hue is on the dot; the reason reads in white. */}
                      <p className="flex items-start gap-(--space-2) text-sm leading-relaxed">
                        <span
                          aria-hidden="true"
                          className={`mt-[0.45em] size-2 shrink-0 rounded-(--radius-pill) ${row.failure_reason ? "bg-status-critical" : "bg-status-pending"}`}
                        />
                        <span>
                          {row.failure_reason ?? (row.retry_claimed_at
                            ? "Delivery interrupted or still in progress. Check its provider receipt before re-sending."
                            : "Awaiting its first delivery attempt.")}
                        </span>
                      </p>
                      <p className="mt-(--space-1) pl-(--space-4) text-xs tabular-nums text-on-dark-faint">
                        {formatTimestamp(row.failed_at ?? row.created_at)}
                      </p>
                    </td>
                    <td className={TD_NUM}>{row.attempt_count}</td>
                    <td className={`${TD} text-right`}>
                      {inProgress ? (
                        <p className="text-sm text-on-dark-muted">Delivery in progress</p>
                      ) : retryable ? (
                        <ActionForm
                          action={retryNotificationAction}
                          submitLabel="Re-send"
                          pendingLabel="Re-sending…"
                          tone="ghost"
                          size="sm"
                          className="items-end"
                        >
                          <input type="hidden" name="notification_id" value={row.id} />
                        </ActionForm>
                      ) : (
                        <p className="ml-auto max-w-[24ch] text-xs text-on-dark-faint">
                          Legacy row — the original payload was not stored, so it cannot be safely re-sent.
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}

      {totalPages > 1 && (
        <Pagination
          label="Notification failure pages"
          summary={<>Page {Math.min(page, totalPages)} of {totalPages}</>}
          previousHref={page > 1 ? `/admin/notifications?page=${page - 1}` : undefined}
          nextHref={page < totalPages ? `/admin/notifications?page=${page + 1}` : undefined}
        />
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
