import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withdrawCapacityLine } from "@/lib/actions/capacity";
import { requireCompanyAdmin } from "@/lib/auth";
import { COMMITTING_STATUSES, overlaps } from "@/lib/domain/availability";
import { formatCentsExGst } from "@/lib/domain/money";
import { CARD, MONO, PAGE, formatDate, formatWindow, pill, toneFor } from "@/lib/platform-ui";
import { supplierBand } from "@/lib/rates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CapacityLineStatus } from "@/lib/supabase/types";
import { BTN_GHOST, H1, H2 } from "@/lib/ui";
import { CapacityForm, type CrewOption } from "../capacity-form";

// One capacity line — spec 9.1, 9.5, 9.7, 5.2, 20.4.

export const metadata: Metadata = { title: "Capacity line" };

type LineRow = {
  id: string;
  trade_role_id: string;
  proficiency_id: string;
  location_region_id: string;
  available_from: string;
  available_until: string;
  available_days: string | null;
  hours_per_week: number;
  supplier_rate_cents: number;
  rate_entered_by_admin: boolean;
  rate_ratified_at: string | null;
  status: CapacityLineStatus;
  trade: { name: string } | null;
  proficiency: { name: string } | null;
  region: { name: string } | null;
  capacity_line_worker: { worker_id: string }[] | null;
  capacity_line_travel_region: { region_id: string }[] | null;
};

type WorkerRow = {
  id: string;
  first_name: string;
  last_name: string;
  primary_trade_id: string;
  primary_proficiency_id: string;
  trade: { name: string } | null;
  proficiency: { name: string } | null;
};

/** 12.1 — an "open match" is one in {Awaiting Supplier, Awaiting Buyer}. */
const OPEN_MATCH_STATUSES = ["Awaiting Supplier", "Awaiting Buyer"];

/**
 * 9.5 — remaining headcount is the attached crew less those on engagements in a
 * committing status (13.0) overlapping this window. engagement_worker is revoked from
 * authenticated (17.1), so the count is read server-side against this line's own crew.
 */
async function committedWorkerIds(line: LineRow): Promise<Set<string>> {
  const attached = (line.capacity_line_worker ?? []).map((link) => link.worker_id);
  if (attached.length === 0) return new Set();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("engagement_worker")
    .select("worker_id, engagement:engagement_id!inner(start_date, end_date)")
    .in("status", [...COMMITTING_STATUSES])
    .in("worker_id", attached);

  if (error) throw new Error("Capacity commitments could not be loaded. Please try again.");

  const rows = (data ?? []) as unknown as {
    worker_id: string;
    engagement: { start_date: string; end_date: string };
  }[];

  return new Set(
    rows
      .filter((row) =>
        overlaps(
          { start: row.engagement.start_date, end: row.engagement.end_date },
          { start: line.available_from, end: line.available_until },
        ),
      )
      .map((row) => row.worker_id),
  );
}

export default async function CapacityLinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { companyStatus } = await requireCompanyAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("capacity_line")
    .select(
      "id, trade_role_id, proficiency_id, location_region_id, available_from, available_until, available_days, hours_per_week, supplier_rate_cents, rate_entered_by_admin, rate_ratified_at, status, trade:trade_role_id (name), proficiency:proficiency_id (name), region:location_region_id (name), capacity_line_worker (worker_id), capacity_line_travel_region (region_id)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Capacity line could not be loaded. Please try again.");

  // RLS scopes the read to the owning company (17.1): a miss is a 404, never a hint
  // that the line belongs to someone else.
  if (!data) notFound();
  const line = data as unknown as LineRow;

  const [workerResult, regionResult, matchResult, band, committed] =
    await Promise.all([
      supabase
        .from("worker")
        .select(
          "id, first_name, last_name, primary_trade_id, primary_proficiency_id, trade:primary_trade_id (name), proficiency:primary_proficiency_id (name)",
        )
        .eq("status", "Active")
        .order("last_name"),
      supabase.from("region").select("id, name").eq("is_active", true).order("name"),
      supabase
        .from("supplier_match_view")
        .select("id")
        .eq("capacity_line_id", id)
        .in("status", OPEN_MATCH_STATUSES),
      supplierBand(line.trade_role_id, line.proficiency_id, line.location_region_id),
      committedWorkerIds(line),
    ]);

  if (workerResult.error || regionResult.error || matchResult.error) {
    throw new Error("Capacity line details could not be loaded. Please try again.");
  }
  const { data: workerData } = workerResult;
  const { data: regionData } = regionResult;
  const { data: openMatches } = matchResult;

  const workers = (workerData ?? []) as unknown as WorkerRow[];
  const regions = (regionData ?? []) as { id: string; name: string }[];
  const attached = (line.capacity_line_worker ?? []).map((link) => link.worker_id);
  const remaining = attached.filter((workerId) => !committed.has(workerId)).length;
  const matchIsOpen = (openMatches ?? []).length > 0;
  const isHistory = line.status === "Withdrawn" || line.status === "Expired";

  // 9.5 / module 19 — commit status is a display derivation, never stored.
  const status: CapacityLineStatus = isHistory
    ? line.status
    : attached.length > 0 && remaining === 0
      ? "Fully Committed"
      : remaining < attached.length
        ? "Partially Committed"
        : "Open";

  const crew: CrewOption[] = workers.map((worker) => ({
    id: worker.id,
    name: `${worker.first_name} ${worker.last_name}`,
    tradeRoleId: worker.primary_trade_id,
    tradeName: worker.trade?.name ?? "Trade",
    proficiencyId: worker.primary_proficiency_id,
    proficiencyName: worker.proficiency?.name ?? "Level",
  }));

  const bands = band
    ? {
        [`${line.trade_role_id}:${line.proficiency_id}:${line.location_region_id}`]: band,
      }
    : {};

  const named = crew.filter((worker) => attached.includes(worker.id));
  const canEdit = companyStatus === "Active" && !isHistory && !matchIsOpen;

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-center gap-(--space-4)">
        <h1 className={H1}>
          <span className={MONO}>{formatWindow(line.available_from, line.available_until)}</span>
        </h1>
        <span className={pill(toneFor(status))}>{status}</span>
      </div>

      <div className={`${CARD} mt-(--space-6) grid gap-(--space-4) md:grid-cols-2`}>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Trade and proficiency</span>
          <span className={MONO}>
            {line.trade?.name ?? "—"} · {line.proficiency?.name ?? "—"}
          </span>
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Location region</span>
          {line.region?.name ?? "—"}
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Hours per week</span>
          <span className={MONO}>{line.hours_per_week}</span>
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Available days</span>
          {line.available_days ?? "Not stated"}
        </p>
        <p className="text-body">
          <span className="block text-sm text-on-dark-faint">Your rate</span>
          <span className={MONO}>{formatCentsExGst(line.supplier_rate_cents)}</span> per hour
        </p>
        <p className="text-body">
          {/* 9.7 — rate provenance, and the ratification that a supplier's match
              acceptance records for a concierge-entered rate. */}
          <span className="block text-sm text-on-dark-faint">Rate provenance</span>
          {line.rate_entered_by_admin
            ? `Entered by Maintain on your instruction${
                line.rate_ratified_at
                  ? `, ratified ${formatDate(line.rate_ratified_at)}`
                  : ", ratified when you accept a match"
              }`
            : "Set by your own team"}
        </p>
        <p className="text-body md:col-span-2">
          {/* 5.2 / 20.4 — the band is a recommendation, and a missing one never
              invents a rate. */}
          <span className="block text-sm text-on-dark-faint">Recommended band</span>
          {band ? (
            <span className={MONO}>
              {formatCentsExGst(band.lowCents)} – {formatCentsExGst(band.highCents)}
            </span>
          ) : (
            "No recommended band for this trade, proficiency and region."
          )}
        </p>
      </div>

      <section className="mt-(--space-7)">
        <h2 className={H2}>Crew on this line</h2>
        <p className="mt-(--space-3) text-body text-on-dark-muted">
          <span className={MONO}>{remaining}</span> of <span className={MONO}>{attached.length}</span>{" "}
          still uncommitted across this window.
        </p>
        <ul className={`${CARD} mt-(--space-4) flex flex-col gap-(--space-2)`}>
          {named.map((worker) => (
            <li key={worker.id} className="text-body">
              {worker.name}
              {committed.has(worker.id) ? (
                <span className="ml-(--space-3) text-sm text-on-dark-faint">
                  committed in this window
                </span>
              ) : null}
            </li>
          ))}
          {named.length === 0 ? (
            <li className="text-body text-on-dark-muted">
              The crew on this line are no longer on your roster.
            </li>
          ) : null}
        </ul>
      </section>

      {/* 9.5 — while an open match references the line, neither withdrawal nor any
          matchable edit is possible until Maintain withdraws the match. */}
      {matchIsOpen ? (
        <div className={`${CARD} mt-(--space-7)`}>
          <p className="text-body text-on-dark-muted">
            Maintain has a match open on this line. The window, crew, rate and hours are
            held until that match is withdrawn or decided.
          </p>
        </div>
      ) : null}

      {canEdit ? (
        <section className="mt-(--space-7)">
          <h2 className={H2}>Edit this line</h2>
          <div className="mt-(--space-4)">
            <CapacityForm
              mode="edit"
              crew={crew}
              regions={regions}
              bands={bands}
              lineId={line.id}
              initialLine={{
                tradeRoleId: line.trade_role_id,
                proficiencyId: line.proficiency_id,
                locationRegionId: line.location_region_id,
                availableFrom: line.available_from,
                availableUntil: line.available_until,
                availableDays: line.available_days ?? "",
                hoursPerWeek: String(line.hours_per_week),
                rateDollars: (line.supplier_rate_cents / 100).toFixed(2),
                workerIds: attached,
                travelRegionIds: (line.capacity_line_travel_region ?? []).map(
                  (link) => link.region_id,
                ),
                rateTouched: true,
              }}
            />
          </div>

          <form action={withdrawCapacityLine} className="mt-(--space-5)">
            <input type="hidden" name="lineId" value={line.id} />
            <button type="submit" className={BTN_GHOST}>
              Withdraw this line
            </button>
          </form>
        </section>
      ) : null}

      <Link href="/app/capacity" className={`${BTN_GHOST} mt-(--space-7)`}>
        Back to capacity
      </Link>
    </div>
  );
}
