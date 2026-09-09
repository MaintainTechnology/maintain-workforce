import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard-overview";
import { requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMITTING_STATUSES } from "@/lib/domain/availability";
import { brisbaneToday } from "@/lib/cron";



// Company dashboard: all six operational metrics retain their spec 14.1 scopes.
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
  const deployedResult = await createAdminClient()
    .from("engagement")
    .select("id, engagement_worker (worker_id)")
    .eq("supplier_company_id", companyId)
    .in("status", COMMITTING_STATUSES as unknown as string[])
    .lte("start_date", today)
    .gte("end_date", today);

  const deployed = new Set<string>();
  for (const engagement of deployedResult.data ?? []) {
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

  return (
    <DashboardOverview
      companyStatus={companyStatus}
      today={today}
      metrics={{
        // A failed read is unknown, never an empty workforce or a cleared queue.
        crew: workerCount.error ? null : workerCount.count ?? 0,
        available: openLines.error || deployedResult.error ? null : availableNow,
        deployed: deployedResult.error ? null : deployed.size,
        requirements: openDemand.error ? null : openDemand.count ?? 0,
        decisions: awaitingSupplier.error || awaitingBuyer.error
          ? null : (awaitingSupplier.count ?? 0) + (awaitingBuyer.count ?? 0),
        engagements: buyerLive.error || supplierLive.error
          ? null : (buyerLive.count ?? 0) + (supplierLive.count ?? 0),
      }}
    />
  );
}
