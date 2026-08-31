import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withdrawDemandLine } from "@/lib/actions/demand";
import { requireCompanyAdmin } from "@/lib/auth";
import { getBookingRules } from "@/lib/config";
import { COMMITTING_STATUSES, inclusiveDays } from "@/lib/domain/availability";
import { expectedHours, formatCentsExGst } from "@/lib/domain/money";
import { CARD, MONO, PAGE, formatWindow, pill, toneFor } from "@/lib/platform-ui";
import { indicativeRange } from "@/lib/rates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DemandLineStatus } from "@/lib/supabase/types";
import { BTN_GHOST, H1, H2 } from "@/lib/ui";
import { DemandForm } from "../demand-form";

// One demand line — spec 10.1, 10.3, 10.4, 5.5, 20.4.

export const metadata: Metadata = { title: "Demand line" };

type LineRow = {
  id: string;
  trade_role_id: string;
  proficiency_id: string;
  quantity: number;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  notes: string | null;
  status: DemandLineStatus;
  trade: { name: string } | null;
  proficiency: { name: string } | null;
  request: { name: string; work_region_id: string; region: { name: string } | null } | null;
  demand_line_skill: { skill_id: string; skill: { name: string } | null }[] | null;
  demand_line_qualification: {
    qualification_id: string;
    qualification: { name: string } | null;
  }[] | null;
};

/** 12.1 — an "open match" is one in {Awaiting Supplier, Awaiting Buyer}. */
const OPEN_MATCH_STATUSES = ["Awaiting Supplier", "Awaiting Buyer"];

/**
 * 10.3 — quantity_filled counts DISTINCT workers in a committing status (13.0) on the
 * line; quantity_pending is the requested quantity of each open match while Awaiting
 * Supplier, or its live nomination count once Awaiting Buyer. Both read server-side:
 * match and engagement_worker are revoked from authenticated (17.1).
 */
async function lineCounts(lineId: string): Promise<{ filled: number; pending: number }> {
  const admin = createAdminClient();

  const [{ data: workers }, { data: matches }] = await Promise.all([
    admin
      .from("engagement_worker")
      .select("worker_id, engagement:engagement_id!inner(demand_line_id)")
      .in("status", [...COMMITTING_STATUSES])
      .eq("engagement.demand_line_id", lineId),
    admin
      .from("match")
      .select("id, status, requested_quantity, match_worker (worker_id, knocked_out)")
      .eq("demand_line_id", lineId)
      .in("status", OPEN_MATCH_STATUSES),
  ]);

  const filled = new Set(((workers ?? []) as { worker_id: string }[]).map((row) => row.worker_id))
    .size;

  const pending = ((matches ?? []) as {
    status: string;
    requested_quantity: number;
    match_worker: { knocked_out: boolean }[] | null;
  }[]).reduce((total, match) => {
    if (match.status === "Awaiting Supplier") return total + match.requested_quantity;
    return total + (match.match_worker ?? []).filter((row) => !row.knocked_out).length;
  }, 0);

  return { filled, pending };
}

export default async function DemandLinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { companyStatus } = await requireCompanyAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("demand_line")
    .select(
      "id, trade_role_id, proficiency_id, quantity, start_date, end_date, hours_per_week, notes, status, trade:trade_role_id (name), proficiency:proficiency_id (name), request:request_id (name, work_region_id, region:work_region_id (name)), demand_line_skill (skill_id, skill:skill_id (name)), demand_line_qualification (qualification_id, qualification:qualification_id (name))",
    )
    .eq("id", id)
    .maybeSingle();

  // RLS scopes the read to the owning company (17.1): a miss is a 404.
  if (!data) notFound();
  const line = data as unknown as LineRow;
  const workRegionId = line.request?.work_region_id ?? "";

  const [counts, range, rules, skillResult, qualificationResult] = await Promise.all([
    lineCounts(line.id),
    // 5.5 — the all-in indicative range, already marked up. No raw band value reaches
    // a buyer-facing surface (17.1).
    indicativeRange(line.trade_role_id, line.proficiency_id, workRegionId),
    getBookingRules(),
    supabase
      .from("skill")
      .select("id, name, trade_role_id")
      .eq("trade_role_id", line.trade_role_id)
      .eq("is_active", true)
      .order("name"),
    supabase.from("qualification").select("id, name").eq("is_active", true).order("name"),
  ]);

  const isHistory = line.status === "Withdrawn" || line.status === "Expired";

  // 10.3 — Filled when filled = quantity; Partially Filled when 0 < filled < quantity;
  // Open otherwise. Derived at read time, never stored.
  const status: DemandLineStatus = isHistory
    ? line.status
    : counts.filled >= line.quantity
      ? "Filled"
      : counts.filled > 0
        ? "Partially Filled"
        : "Open";

  const matchIsOpen = counts.pending > 0;
  const canEdit = companyStatus === "Active" && !isHistory && !matchIsOpen;
  const days = inclusiveDays({ start: line.start_date, end: line.end_date });

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-center gap-(--space-4)">
        <h1 className={H1}>
          <span className={MONO}>{formatWindow(line.start_date, line.end_date)}</span>
        </h1>
        <span className={pill(toneFor(status))}>{status}</span>
      </div>

      <div className={`${CARD} mt-(--space-6) grid gap-(--space-4) md:grid-cols-2`}>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Project</span>
          {line.request?.name ?? "—"}
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Work region</span>
          {line.request?.region?.name ?? "—"}
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Trade and proficiency</span>
          <span className={MONO}>
            {line.trade?.name ?? "—"} · {line.proficiency?.name ?? "—"}
          </span>
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Crew needed</span>
          <span className={MONO}>
            {counts.filled} of {line.quantity}
          </span>{" "}
          filled
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Hours</span>
          <span className={MONO}>{line.hours_per_week}</span> per week —{" "}
          <span className={MONO}>{expectedHours(line.hours_per_week, days)}</span> hours
          expected over <span className={MONO}>{days}</span> days
        </p>
        <p className="text-body">
          {/* 10.4 / 5.5 — the buyer sees the indicative all-in range at creation and the
              fixed all-in rate at proposal. Never a supplier rate, never a fee split. */}
          <span className="block text-sm text-on-dark-faint">Indicative all-in rate</span>
          {range ? (
            <span className={MONO}>
              {formatCentsExGst(range.lowCents)} – {formatCentsExGst(range.highCents)}
            </span>
          ) : (
            "Not published for this trade, proficiency and region yet."
          )}
        </p>
        {(line.demand_line_skill ?? []).length > 0 ? (
          <p className="text-body">
            <span className="block text-sm text-on-dark-faint">Required skills</span>
            {(line.demand_line_skill ?? []).map((row) => row.skill?.name).filter(Boolean).join(", ")}
          </p>
        ) : null}
        {(line.demand_line_qualification ?? []).length > 0 ? (
          <p className="text-body">
            <span className="block text-sm text-on-dark-faint">Required tickets</span>
            {(line.demand_line_qualification ?? [])
              .map((row) => row.qualification?.name)
              .filter(Boolean)
              .join(", ")}
          </p>
        ) : null}
        {line.notes ? (
          <p className="text-body md:col-span-2">
            <span className="block text-sm text-on-dark-faint">Notes</span>
            {line.notes}
          </p>
        ) : null}
      </div>

      {/* 10.3 — a line with an open match cannot be withdrawn and none of its matchable
          fields edited until Maintain withdraws the match. */}
      {matchIsOpen ? (
        <div className={`${CARD} mt-(--space-7)`}>
          <p className="text-body text-on-dark-muted">
            Maintain has a proposal in progress on this line. The quantity, window and
            hours are held until it is withdrawn or decided.
          </p>
        </div>
      ) : null}

      {canEdit ? (
        <section className="mt-(--space-7)">
          <h2 className={H2}>Edit this line</h2>
          <div className="mt-(--space-4)">
            <DemandForm
              mode="edit"
              industries={[]}
              regions={[{ id: workRegionId, name: line.request?.region?.name ?? "Region" }]}
              trades={[{ id: line.trade_role_id, name: line.trade?.name ?? "Trade" }]}
              tradeProficiencies={[
                {
                  tradeRoleId: line.trade_role_id,
                  proficiencyId: line.proficiency_id,
                  proficiencyName: line.proficiency?.name ?? "Level",
                },
              ]}
              skills={(skillResult.data ?? []).map((skill) => ({
                id: skill.id,
                name: skill.name,
                tradeRoleId: skill.trade_role_id,
              }))}
              qualifications={(qualificationResult.data ?? []).map((qualification) => ({
                id: qualification.id,
                name: qualification.name,
              }))}
              ranges={
                range
                  ? { [`${line.trade_role_id}:${line.proficiency_id}:${workRegionId}`]: range }
                  : {}
              }
              rules={rules}
              lineId={line.id}
              workRegionId={workRegionId}
              initialLine={{
                tradeRoleId: line.trade_role_id,
                proficiencyId: line.proficiency_id,
                quantity: String(line.quantity),
                startDate: line.start_date,
                endDate: line.end_date,
                hoursMode: "week",
                hours: String(line.hours_per_week),
                skillIds: (line.demand_line_skill ?? []).map((row) => row.skill_id),
                qualificationIds: (line.demand_line_qualification ?? []).map(
                  (row) => row.qualification_id,
                ),
                notes: line.notes ?? "",
              }}
            />
          </div>

          <form action={withdrawDemandLine} className="mt-(--space-5)">
            <input type="hidden" name="lineId" value={line.id} />
            <button type="submit" className={BTN_GHOST}>
              Withdraw this line
            </button>
          </form>
        </section>
      ) : null}

      <Link href="/app/demand" className={`${BTN_GHOST} mt-(--space-7)`}>
        Back to requirements
      </Link>
    </div>
  );
}
