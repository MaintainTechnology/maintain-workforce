import type { Metadata } from "next";
import Link from "next/link";

import { requireCompanyAdmin } from "@/lib/auth";
import { CARD, PAGE } from "@/lib/platform-ui";
import { supplierBandMap } from "@/lib/rates";
import { createClient } from "@/lib/supabase/server";
import { BTN_GHOST, H1 } from "@/lib/ui";
import { CapacityForm, type CrewOption } from "../capacity-form";

// 9.1 / 9.3 — one form creates a listing of one or more lines in a single submission.

export const metadata: Metadata = { title: "List capacity" };

type WorkerRow = {
  id: string;
  first_name: string;
  last_name: string;
  primary_trade_id: string;
  primary_proficiency_id: string;
  trade: { name: string } | null;
  proficiency: { name: string } | null;
};

export default async function NewCapacityPage() {
  const { companyStatus } = await requireCompanyAdmin();

  // 1.3 / 3.2 — the form is not offered to a company that cannot list. The server
  // action enforces the same rule, so this is courtesy rather than control.
  if (companyStatus !== "Active") {
    return (
      <div className={PAGE}>
        <h1 className={H1}>List capacity</h1>
        <div className={`${CARD} mt-(--space-6)`}>
          <p className="text-body text-on-dark-muted">
            {companyStatus === "Pending"
              ? "Verification is still in progress. You can add crew and upload documents now; listing capacity opens once Maintain activates the account."
              : "This account is read-only. Contact Maintain to resolve it."}
          </p>
          <Link href="/app/capacity" className={`${BTN_GHOST} mt-(--space-5)`}>
            Back to capacity
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: workerData }, { data: regionData }] = await Promise.all([
    // RLS scopes this to the crew the company currently employs (17.1). Only Active
    // workers are offered: 6.5's stored status is the account-level fact, and 11.1
    // excludes anyone else from matching anyway.
    supabase
      .from("worker")
      .select(
        "id, first_name, last_name, primary_trade_id, primary_proficiency_id, trade:primary_trade_id (name), proficiency:primary_proficiency_id (name)",
      )
      .eq("status", "Active")
      .order("last_name"),
    supabase.from("region").select("id, name").eq("is_active", true).order("name"),
  ]);

  const workers = (workerData ?? []) as unknown as WorkerRow[];
  const regions = (regionData ?? []) as { id: string; name: string }[];

  const crew: CrewOption[] = workers.map((worker) => ({
    id: worker.id,
    name: `${worker.first_name} ${worker.last_name}`,
    tradeRoleId: worker.primary_trade_id,
    tradeName: worker.trade?.name ?? "Trade",
    proficiencyId: worker.primary_proficiency_id,
    proficiencyName: worker.proficiency?.name ?? "Level",
  }));

  // 5.2 / 17.1 — the band projection is scoped to the trades this business runs, which
  // is exactly the set of trades any line it creates can carry (9.2).
  const bands = await supplierBandMap([...new Set(crew.map((worker) => worker.tradeRoleId))]);

  return (
    <div className={PAGE}>
      <h1 className={H1}>List capacity</h1>
      <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
        One submission, as many lines as you need. Each line carries one trade and
        proficiency, its window, and the people on it.
      </p>

      {crew.length === 0 ? (
        <div className={`${CARD} mt-(--space-6)`}>
          <p className="text-body text-on-dark-muted">
            Add your crew first — capacity is never anonymous, so every line names the
            people on it.
          </p>
          <Link href="/app/workers" className={`${BTN_GHOST} mt-(--space-5)`}>
            Go to the workforce
          </Link>
        </div>
      ) : (
        <div className="mt-(--space-6)">
          <CapacityForm mode="create" crew={crew} regions={regions} bands={bands} />
        </div>
      )}
    </div>
  );
}
