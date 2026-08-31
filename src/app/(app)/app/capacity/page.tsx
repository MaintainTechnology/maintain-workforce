import type { Metadata } from "next";
import Link from "next/link";

import { requireCompanyAdmin } from "@/lib/auth";
import { COMMITTING_STATUSES, overlaps } from "@/lib/domain/availability";
import { formatCentsExGst } from "@/lib/domain/money";
import { CARD, MONO, PAGE, TABLE, TD, TH, formatWindow, pill, toneFor } from "@/lib/platform-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CapacityLineStatus } from "@/lib/supabase/types";
import { BTN_PRIMARY, H1 } from "@/lib/ui";

// SELL CAPACITY — the supplying business's own lines (spec module 9).

export const metadata: Metadata = { title: "Capacity" };

type LineRow = {
  id: string;
  available_from: string;
  available_until: string;
  hours_per_week: number;
  supplier_rate_cents: number;
  status: CapacityLineStatus;
  trade: { name: string } | null;
  proficiency: { name: string } | null;
  region: { name: string } | null;
  capacity_line_worker: { worker_id: string }[] | null;
};

type Commitment = { workerId: string; start: string; end: string };

/**
 * 9.5 — remaining headcount is the attached workers less those on engagements in a
 * committing status (13.0) overlapping the line window. engagement_worker is revoked
 * from authenticated (17.1), so the count is read server-side and scoped to this
 * company's own engagements before it is used.
 */
async function committingCommitments(companyId: string): Promise<Commitment[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("engagement_worker")
    .select("worker_id, engagement:engagement_id!inner(supplier_company_id, start_date, end_date)")
    .in("status", [...COMMITTING_STATUSES])
    .eq("engagement.supplier_company_id", companyId);

  return ((data ?? []) as unknown as {
    worker_id: string;
    engagement: { start_date: string; end_date: string };
  }[]).map((row) => ({
    workerId: row.worker_id,
    start: row.engagement.start_date,
    end: row.engagement.end_date,
  }));
}

function remainingHeadcount(line: LineRow, commitments: Commitment[]): number {
  const attached = (line.capacity_line_worker ?? []).map((link) => link.worker_id);
  return attached.filter(
    (workerId) =>
      !commitments.some(
        (commitment) =>
          commitment.workerId === workerId &&
          overlaps(
            { start: commitment.start, end: commitment.end },
            { start: line.available_from, end: line.available_until },
          ),
      ),
  ).length;
}

/**
 * 9.5 / module 19 — commit status is a supply-count display concept, derived at read
 * time and never stored. Withdrawn and Expired are the only stored line states that
 * survive this derivation.
 */
function derivedCapacityStatus(line: LineRow, remaining: number): CapacityLineStatus {
  if (line.status === "Withdrawn" || line.status === "Expired") return line.status;
  const attached = (line.capacity_line_worker ?? []).length;
  if (attached > 0 && remaining === 0) return "Fully Committed";
  if (remaining < attached) return "Partially Committed";
  return "Open";
}

export default async function CapacityPage() {
  const { companyId, companyStatus } = await requireCompanyAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("capacity_line")
    .select(
      "id, available_from, available_until, hours_per_week, supplier_rate_cents, status, trade:trade_role_id (name), proficiency:proficiency_id (name), region:location_region_id (name), capacity_line_worker (worker_id)",
    )
    .eq("company_id", companyId)
    .order("available_from", { ascending: false });

  const lines = (data ?? []) as unknown as LineRow[];
  const commitments = await committingCommitments(companyId);

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-end justify-between gap-(--space-4)">
        <div>
          <h1 className={H1}>Capacity</h1>
          <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
            The crew you have spare, by window and rate. Every line names its people, and
            the rate on it is yours to set.
          </p>
        </div>
        {/* 1.3 — a Pending or Suspended company can look, but cannot list. */}
        {companyStatus === "Active" ? (
          <Link href="/app/capacity/new" className={BTN_PRIMARY}>
            List capacity
          </Link>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div className={`${CARD} mt-(--space-6)`}>
          <p className="text-body text-on-dark-muted">
            No capacity listed yet. A listing can carry as many lines as you have crew
            groupings — one submission covers the lot.
          </p>
        </div>
      ) : (
        <div className={`${CARD} mt-(--space-6) overflow-x-auto`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH} scope="col">Window</th>
                <th className={TH} scope="col">Trade</th>
                <th className={TH} scope="col">Region</th>
                <th className={TH} scope="col">Hours/week</th>
                <th className={TH} scope="col">Crew</th>
                <th className={TH} scope="col">Your rate</th>
                <th className={TH} scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const remaining = remainingHeadcount(line, commitments);
                const attached = (line.capacity_line_worker ?? []).length;
                const status = derivedCapacityStatus(line, remaining);
                return (
                  <tr key={line.id}>
                    <td className={TD}>
                      <Link
                        href={`/app/capacity/${line.id}`}
                        className={`${MONO} underline underline-offset-4`}
                      >
                        {formatWindow(line.available_from, line.available_until)}
                      </Link>
                    </td>
                    <td className={TD}>
                      <span className={MONO}>{line.trade?.name ?? "—"}</span>
                      <span className="block text-sm text-on-dark-muted">
                        {line.proficiency?.name ?? "—"}
                      </span>
                    </td>
                    <td className={TD}>{line.region?.name ?? "—"}</td>
                    <td className={`${TD} ${MONO}`}>{line.hours_per_week}</td>
                    <td className={`${TD} ${MONO}`}>
                      {remaining} of {attached}
                    </td>
                    <td className={`${TD} ${MONO}`}>
                      {formatCentsExGst(line.supplier_rate_cents)}
                    </td>
                    <td className={TD}>
                      <span className={pill(toneFor(status))}>{status}</span>
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
