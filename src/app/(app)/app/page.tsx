import type { Metadata } from "next";
import Link from "next/link";
import { requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMITTING_STATUSES } from "@/lib/domain/availability";
import { brisbaneToday } from "@/lib/cron";
import { H1, PANEL, BTN_PRIMARY, BTN_GHOST, LABEL } from "@/lib/ui";
import { MONO } from "@/lib/platform-ui";

// Company dashboard — spec 14.1.
//
// Six figures and two calls to action. Both postures live behind one account (3.3), so
// this screen never asks whether the company is a supplier or a buyer: it shows what it
// has spare, what it needs, and what is waiting on a decision.
//
// Amber budget (DESIGN.md): one — SELL CAPACITY. Listing spare capacity is the action
// this marketplace exists to make easy, and BUY CAPACITY sits beside it in ghost.

export const metadata: Metadata = { title: "Dashboard" };

export default async function CompanyDashboard() {
  const { companyId, companyStatus } = await requireCompanyAdmin();
  const today = brisbaneToday();

  // RLS is the boundary (17.1): everything the company owns is read with its own
  // session. The one exception is noted below.
  const supabase = await createClient();

  const [workerCount, openLines, openDemand, awaitingSupplier, awaitingBuyer, buyerLive, supplierLive] =
    await Promise.all([
      supabase
        .from("worker_employment")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("end_date", null),
      // 6.5 / 9.6 — marketplace state is derived from open capacity lines, never stored.
      supabase
        .from("capacity_line")
        .select("id, capacity_line_worker (worker_id)")
        .eq("company_id", companyId)
        .in("status", ["Open", "Partially Committed"])
        .lte("available_from", today)
        .gte("available_until", today),
      supabase
        .from("demand_line")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["Open", "Partially Filled"]),
      supabase
        .from("supplier_match_view")
        .select("id", { count: "exact", head: true })
        .eq("status", "Awaiting Supplier"),
      supabase
        .from("buyer_match_view")
        .select("id", { count: "exact", head: true })
        .eq("status", "Awaiting Buyer"),
      supabase
        .from("buyer_engagement_view")
        .select("id", { count: "exact", head: true })
        .in("status", COMMITTING_STATUSES as unknown as string[]),
      supabase
        .from("supplier_engagement_view")
        .select("id", { count: "exact", head: true })
        .in("status", COMMITTING_STATUSES as unknown as string[]),
    ]);

  // 13.0 — "deployed" means a worker on an engagement in a committing status covering
  // today. engagement_worker is projection-only for companies (17.1) and no projection
  // carries worker identities, so this one derived count runs with the service role,
  // filtered to the caller's own company. It leaves the page's boundary intact: the
  // company already owns these people, and only a count reaches the response.
  const { data: deployedRows } = await createAdminClient()
    .from("engagement")
    .select("id, engagement_worker (worker_id)")
    .eq("supplier_company_id", companyId)
    .in("status", COMMITTING_STATUSES as unknown as string[])
    .lte("start_date", today)
    .gte("end_date", today);

  const deployed = new Set<string>();
  for (const engagement of deployedRows ?? []) {
    for (const row of (engagement.engagement_worker ?? []) as { worker_id: string }[]) {
      deployed.add(row.worker_id);
    }
  }

  const onOpenLines = new Set<string>();
  for (const line of openLines.data ?? []) {
    for (const row of (line.capacity_line_worker ?? []) as { worker_id: string }[]) {
      onOpenLines.add(row.worker_id);
    }
  }
  const availableNow = [...onOpenLines].filter((id) => !deployed.has(id)).length;

  const canTrade = companyStatus === "Active"; // 1.3 / 3.2
  const awaitingMe = (awaitingSupplier.count ?? 0) + (awaitingBuyer.count ?? 0);
  const engagements = (buyerLive.count ?? 0) + (supplierLive.count ?? 0);

  return (
    <div className="flex flex-col gap-(--space-7)">
      <header>
        <h1 className={H1}>Your exchange</h1>
        <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
          What you have spare, what you need, and what is waiting on you.
        </p>

        <div className="mt-(--space-6) flex flex-wrap items-center gap-(--space-4)">
          {canTrade ? (
            <>
              <Link href="/app/capacity/new" className={BTN_PRIMARY}>
                SELL CAPACITY
              </Link>
              <Link href="/app/demand/new" className={BTN_GHOST}>
                BUY CAPACITY
              </Link>
            </>
          ) : (
            // 1.3 — a Pending company prepares crew and documents but cannot list or
            // post. The buttons are absent rather than dead: an inert control that looks
            // live is worse than a sentence saying why.
            <p className="max-w-[60ch] text-body text-on-dark-muted">
              {companyStatus === "Pending"
                ? "Listing capacity and posting requirements opens once Maintain verifies the account."
                : "This account is read-only. Contact Maintain to resolve it."}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-(--space-5) sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Crew on record"
          value={workerCount.count ?? 0}
          note="People currently employed by this business"
        />
        <Stat
          label="Available today"
          value={availableNow}
          note="On an open capacity line and not committed"
          href="/app/capacity"
        />
        <Stat
          label="Deployed today"
          value={deployed.size}
          note="On an engagement covering today"
          href="/app/engagements"
        />
        <Stat
          label="Open requirements"
          value={openDemand.count ?? 0}
          note="Your lines still seeking crew"
          href="/app/demand"
        />
        <Stat
          label="Awaiting your decision"
          value={awaitingMe}
          note="Proposed matches that need an answer"
          href="/app/matches"
        />
        <Stat
          label="Current engagements"
          value={engagements}
          note="Awaiting commercial, confirmed or on site"
          href="/app/engagements"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number;
  note: string;
  href?: string;
}) {
  const body = (
    <>
      <p className={LABEL}>{label}</p>
      {/* Monospace carries operational truth (DESIGN.md): figures line up column-wise. */}
      <p className={`${MONO} mt-(--space-3) text-h1 font-extrabold text-on-dark`}>{value}</p>
      <p className="mt-(--space-2) text-sm text-on-dark-muted">{note}</p>
    </>
  );

  if (!href) return <div className={`${PANEL} p-(--space-5)`}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${PANEL} block p-(--space-5) transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark`}
    >
      {body}
    </Link>
  );
}
