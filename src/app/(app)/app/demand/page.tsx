import type { Metadata } from "next";
import Link from "next/link";

import { requireCompanyAdmin } from "@/lib/auth";
import { COMMITTING_STATUSES } from "@/lib/domain/availability";
import { CARD, MONO, PAGE, TABLE, TD, TH, formatWindow, pill, toneFor } from "@/lib/platform-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DemandLineStatus } from "@/lib/supabase/types";
import { BTN_PRIMARY, H1 } from "@/lib/ui";

// BUY CAPACITY — the hiring business's own requirements (spec module 10).

export const metadata: Metadata = { title: "Requirements" };

type LineRow = {
  id: string;
  quantity: number;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  status: DemandLineStatus;
  trade: { name: string } | null;
  proficiency: { name: string } | null;
  request: { name: string; region: { name: string } | null } | null;
};

/**
 * 10.3 — quantity_filled counts DISTINCT workers in a committing status (13.0) on the
 * line, so a worker covering it through sequential engagements occupies one slot.
 * engagement_worker is revoked from authenticated (17.1), so the count is read
 * server-side against line ids RLS has already scoped to this company.
 */
async function filledByLine(lineIds: string[]): Promise<Map<string, number>> {
  if (lineIds.length === 0) return new Map();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("engagement_worker")
    .select("worker_id, engagement:engagement_id!inner(demand_line_id)")
    .in("status", [...COMMITTING_STATUSES])
    .in("engagement.demand_line_id", lineIds);

  if (error) throw new Error("Requirement commitments could not be loaded. Please try again.");

  const distinct = new Map<string, Set<string>>();
  for (const row of (data ?? []) as unknown as {
    worker_id: string;
    engagement: { demand_line_id: string };
  }[]) {
    const held = distinct.get(row.engagement.demand_line_id) ?? new Set<string>();
    held.add(row.worker_id);
    distinct.set(row.engagement.demand_line_id, held);
  }

  return new Map([...distinct].map(([lineId, workers]) => [lineId, workers.size]));
}

/** 10.3 — fill status is derived at read time; only Withdrawn and Expired are stored. */
function derivedDemandStatus(line: LineRow, filled: number): DemandLineStatus {
  if (line.status === "Withdrawn" || line.status === "Expired") return line.status;
  if (filled >= line.quantity) return "Filled";
  if (filled > 0) return "Partially Filled";
  return "Open";
}

export default async function DemandPage() {
  const { companyId, companyStatus } = await requireCompanyAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("demand_line")
    .select(
      "id, quantity, start_date, end_date, hours_per_week, status, trade:trade_role_id (name), proficiency:proficiency_id (name), request:request_id (name, region:work_region_id (name))",
    )
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });

  if (error) throw new Error("Requirements could not be loaded. Please try again.");

  const lines = (data ?? []) as unknown as LineRow[];
  const filled = await filledByLine(lines.map((line) => line.id));

  // 10.3 — unfilled demand is the sum of (quantity − filled) across Open and Partially
  // Filled lines.
  const unfilled = lines.reduce((total, line) => {
    const status = derivedDemandStatus(line, filled.get(line.id) ?? 0);
    if (status !== "Open" && status !== "Partially Filled") return total;
    return total + (line.quantity - (filled.get(line.id) ?? 0));
  }, 0);

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-end justify-between gap-(--space-4)">
        <div>
          <h1 className={H1}>Requirements</h1>
          <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
            What you need on site, by trade and window. Maintain works each line and
            brings you a shape to approve — never a name to pick.
          </p>
        </div>
        {companyStatus === "Active" ? (
          <Link href="/app/demand/new" className={BTN_PRIMARY}>
            Post a requirement
          </Link>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div className={`${CARD} mt-(--space-6)`}>
          <p className="text-body text-on-dark-muted">
            No requirements posted yet. One request can carry every line a project needs.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-(--space-5) text-body text-on-dark-muted">
            Still to fill: <span className={MONO}>{unfilled}</span>
          </p>
          <div className={`${CARD} mt-(--space-4) overflow-x-auto`}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH} scope="col">Window</th>
                  <th className={TH} scope="col">Project</th>
                  <th className={TH} scope="col">Trade</th>
                  <th className={TH} scope="col">Region</th>
                  <th className={TH} scope="col">Hours/week</th>
                  <th className={TH} scope="col">Filled</th>
                  <th className={TH} scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const count = filled.get(line.id) ?? 0;
                  return (
                    <tr key={line.id}>
                      <td className={TD}>
                        <Link
                          href={`/app/demand/${line.id}`}
                          className={`${MONO} underline underline-offset-4`}
                        >
                          {formatWindow(line.start_date, line.end_date)}
                        </Link>
                      </td>
                      <td className={TD}>{line.request?.name ?? "—"}</td>
                      <td className={TD}>
                        <span className={MONO}>{line.trade?.name ?? "—"}</span>
                        <span className="block text-sm text-on-dark-muted">
                          {line.proficiency?.name ?? "—"}
                        </span>
                      </td>
                      <td className={TD}>{line.request?.region?.name ?? "—"}</td>
                      <td className={`${TD} ${MONO}`}>{line.hours_per_week}</td>
                      <td className={`${TD} ${MONO}`}>
                        {count} of {line.quantity}
                      </td>
                      <td className={TD}>
                        <span className={pill(toneFor(derivedDemandStatus(line, count)))}>
                          {derivedDemandStatus(line, count)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
