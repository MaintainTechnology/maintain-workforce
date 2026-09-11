import Link from "next/link";
import type { Metadata } from "next";
import { requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMITTING_STATUSES } from "@/lib/domain/availability";
import { BTN_GHOST, BTN_PRIMARY, H1 } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, pill, toneFor } from "@/lib/platform-ui";
import type { WorkerStatus } from "@/lib/supabase/types";

// Your crew — spec module 6. This list is the company's own workers only: 8.1 forbids
// cross-company worker search or browse anywhere, so there is no search box that could
// reach past the tenant boundary, and the RLS policy on `worker` (keyed on the open
// employment row, 6.4/17.1) is what actually holds that line.

export const metadata: Metadata = { title: "Workforce" };

/** 20.5 — calendar dates in Australia/Brisbane; Queensland has no daylight saving. */
function brisbaneToday(): string {
  return new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
}

type MarketplaceState = "Available" | "Partially Available" | "Engaged" | "Unavailable";

/**
 * 6.5 — marketplace state is DERIVED at read time from open capacity lines and
 * committing engagements. It is never stored and never hand-edited; the only stored
 * status on a worker is the account-level Active/Inactive/Suspended.
 *
 * 9.5 — "open capacity line" means exactly {Open, Partially Committed}.
 */
function marketplaceState(input: {
  accountStatus: WorkerStatus;
  openLines: { from: string; until: string }[];
  engagedToday: boolean;
  committedInsideLineWindow: boolean;
  today: string;
}): MarketplaceState {
  if (input.accountStatus !== "Active") return "Unavailable";
  // A commitment remains visible even after its capacity line is fully committed,
  // withdrawn or expired and therefore no longer appears in the open-line query.
  if (input.engagedToday) return "Engaged";

  const live = input.openLines.filter((line) => line.until >= input.today);
  if (live.length === 0) return "Unavailable";

  const coversToday = live.some((line) => line.from <= input.today && input.today <= line.until);
  if (!coversToday) return "Partially Available";
  return input.committedInsideLineWindow ? "Partially Available" : "Available";
}

function stateTone(state: MarketplaceState) {
  if (state === "Available") return "active" as const;
  if (state === "Engaged") return "scheduled" as const;
  if (state === "Partially Available") return "overdue" as const;
  return "neutral" as const;
}

export default async function WorkersPage() {
  const { companyId, companyStatus } = await requireCompanyAdmin();
  const readOnly = companyStatus === "Suspended" || companyStatus === "Closed";
  const supabase = await createClient();
  const today = brisbaneToday();

  const [workersResult, tradesResult, proficienciesResult, linesResult] = await Promise.all([
    supabase
      .from("worker")
      .select("id, first_name, last_name, status, primary_trade_id, primary_proficiency_id")
      .order("last_name"),
    supabase.from("trade_role").select("id, name"),
    supabase.from("proficiency").select("id, name"),
    // 9.5 — open lines only; Withdrawn and Expired keep their rows as history and must
    // never make a worker look available.
    supabase
      .from("capacity_line")
      .select("id, available_from, available_until")
      .eq("company_id", companyId)
      .in("status", ["Open", "Partially Committed"]),
  ]);

  // "No workers yet" is a fact about the crew; a failed read must not impersonate it.
  if ([workersResult, tradesResult, proficienciesResult, linesResult].some((result) => result.error)) {
    throw new Error("Your crew could not be loaded. Please try again.");
  }

  const workers = workersResult.data ?? [];
  const tradeName = new Map((tradesResult.data ?? []).map((t) => [t.id as string, t.name as string]));
  const proficiencyName = new Map(
    (proficienciesResult.data ?? []).map((p) => [p.id as string, p.name as string]),
  );

  const lines = linesResult.data ?? [];
  const lineById = new Map(
    lines.map((line) => [
      line.id as string,
      { from: String(line.available_from), until: String(line.available_until) },
    ]),
  );

  const linesByWorker = new Map<string, { from: string; until: string }[]>();
  if (lines.length > 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from("capacity_line_worker")
      .select("capacity_line_id, worker_id")
      .in(
        "capacity_line_id",
        lines.map((line) => line.id as string),
      );
    if (membershipError) throw new Error("Your crew could not be loaded. Please try again.");
    for (const row of memberships ?? []) {
      const window = lineById.get(row.capacity_line_id as string);
      if (!window) continue;
      const key = row.worker_id as string;
      linesByWorker.set(key, [...(linesByWorker.get(key) ?? []), window]);
    }
  }

  // engagement_worker is revoked from `authenticated` (17.1) because it is a dual-party
  // table. Reading it here with the service role is scoped to this company's own worker
  // ids and takes only the committed window — never the counterparty, the rate, or the
  // engagement itself, none of which 6.5 needs.
  const workerIds = workers.map((w) => w.id as string);
  const engagedToday = new Set<string>();
  const committedInWindow = new Set<string>();
  if (workerIds.length > 0) {
    const admin = createAdminClient();
    const horizon = [...lineById.values()].reduce((latest, w) => (w.until > latest ? w.until : latest), today);
    const [todayRows, windowRows] = await Promise.all([
      admin
        .from("engagement_worker")
        .select("worker_id")
        .in("worker_id", workerIds)
        .in("status", [...COMMITTING_STATUSES])
        .contains("committed_window", `[${today},${today}]`),
      admin
        .from("engagement_worker")
        .select("worker_id")
        .in("worker_id", workerIds)
        .in("status", [...COMMITTING_STATUSES])
        .overlaps("committed_window", `[${today},${horizon}]`),
    ]);
    if (todayRows.error || windowRows.error) {
      throw new Error("Your crew could not be loaded. Please try again.");
    }
    for (const row of todayRows.data ?? []) engagedToday.add(row.worker_id as string);
    for (const row of windowRows.data ?? []) committedInWindow.add(row.worker_id as string);
  }

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div className="flex flex-wrap items-end justify-between gap-(--space-4)">
        <div>
          <h1 className={H1}>Your crew</h1>
          <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
            Every worker your business employs. Availability is read from your open
            capacity lines and current engagements — it is never typed in.
          </p>
        </div>
        <div className="flex flex-wrap gap-(--space-3)">
          <Link href="/app/transfers" className={BTN_GHOST}>
            Transfers
          </Link>
          {!readOnly && (
            <Link href="/app/workers/new" className={BTN_PRIMARY}>
              Add a worker
            </Link>
          )}
        </div>
      </div>

      {workers.length === 0 ? (
        <div className={CARD}>
          <p className="text-body text-on-dark-muted">
            {readOnly ? "No workers recorded." : "No workers yet. Add your first one to start listing capacity."}
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-x-auto p-0`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Worker</th>
                <th className={TH}>Trade</th>
                <th className={TH}>Proficiency</th>
                <th className={TH}>Account</th>
                <th className={TH}>Marketplace</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => {
                const id = worker.id as string;
                const state = marketplaceState({
                  accountStatus: worker.status as WorkerStatus,
                  openLines: linesByWorker.get(id) ?? [],
                  engagedToday: engagedToday.has(id),
                  committedInsideLineWindow: committedInWindow.has(id),
                  today,
                });
                return (
                  <tr key={id}>
                    <td className={TD}>
                      <Link
                        href={`/app/workers/${id}`}
                        className="font-semibold text-on-dark underline underline-offset-4"
                      >
                        {worker.first_name} {worker.last_name}
                      </Link>
                    </td>
                    <td className={`${TD} ${MONO}`}>
                      {tradeName.get(worker.primary_trade_id as string) ?? "—"}
                    </td>
                    <td className={`${TD} ${MONO}`}>
                      {proficiencyName.get(worker.primary_proficiency_id as string) ?? "—"}
                    </td>
                    <td className={TD}>
                      <span className={pill(toneFor(String(worker.status)))}>{worker.status}</span>
                    </td>
                    <td className={TD}>
                      <span className={pill(stateTone(state))}>{state}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
