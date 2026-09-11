import Link from "next/link";
import type { Metadata } from "next";
import { requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { H1, LINK } from "@/lib/ui";
import { CARD } from "@/lib/platform-ui";
import { WorkerForm } from "../worker-form";

// Add a worker — spec 6.1–6.4. 1.3 lets a Pending company prepare its crew before
// verification. Suspended and Closed accounts remain read-only (3.2).

export const metadata: Metadata = { title: "Add a worker" };

/** 20.5 — calendar dates in Australia/Brisbane; Queensland has no daylight saving. */
function brisbaneToday(): string {
  return new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
}

export default async function NewWorkerPage() {
  const { companyStatus } = await requireCompanyAdmin();
  if (companyStatus === "Suspended" || companyStatus === "Closed") {
    return (
      <div className="flex max-w-[720px] flex-col gap-(--space-6)">
        <Link href="/app/workers" className={LINK}>Back to your crew</Link>
        <h1 className={H1}>Add a worker</h1>
        <p className={`${CARD} text-body text-on-dark-muted`}>
          This account is read-only. You can view existing worker records, but cannot add workers or request transfers.
        </p>
      </div>
    );
  }
  const supabase = await createClient();

  // 4.1/4.3 — the catalogue is data, and inactive rows are hidden from new entry while
  // staying on existing records.
  const [regionsResult, tradesResult, proficienciesResult, pairsResult, skillsResult] =
    await Promise.all([
      supabase.from("region").select("id, name").eq("is_active", true).order("name"),
      supabase.from("trade_role").select("id, name").eq("is_active", true).order("name"),
      supabase.from("proficiency").select("id, name, rank").eq("is_active", true).order("rank"),
      supabase.from("trade_role_proficiency").select("trade_role_id, proficiency_id"),
      supabase.from("skill").select("id, name, trade_role_id").eq("is_active", true).order("name"),
    ]);

  // A required select with no options is not a form, it is a dead end. The catalogue
  // is never legitimately empty (4.1 seeds it), so a failed read is surfaced, not
  // rendered as "no regions" — see supabase/server.ts for the usual cause.
  if ([regionsResult, tradesResult, proficienciesResult, pairsResult, skillsResult].some((result) => result.error)) {
    throw new Error("Worker options could not be loaded. Please try again.");
  }

  const proficiencies = (proficienciesResult.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));
  const proficiencyById = new Map(proficiencies.map((p) => [p.id, p]));

  // 4.2 — valid proficiencies vary per trade, so the form only ever offers the pairs
  // the TradeRoleProficiency join declares. The server action re-checks the pair, since
  // a filtered select is a convenience and never the rule.
  const proficienciesByTrade: Record<string, { id: string; name: string }[]> = {};
  for (const pair of pairsResult.data ?? []) {
    const trade = pair.trade_role_id as string;
    const proficiency = proficiencyById.get(pair.proficiency_id as string);
    if (!proficiency) continue;
    proficienciesByTrade[trade] = [...(proficienciesByTrade[trade] ?? []), proficiency];
  }

  const skillsByTrade: Record<string, { id: string; name: string }[]> = {};
  for (const skill of skillsResult.data ?? []) {
    const trade = skill.trade_role_id as string;
    skillsByTrade[trade] = [
      ...(skillsByTrade[trade] ?? []),
      { id: skill.id as string, name: skill.name as string },
    ];
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-(--space-6)">
      <div>
        <Link href="/app/workers" className={LINK}>
          Back to your crew
        </Link>
        <h1 className={`${H1} mt-(--space-4)`}>Add a worker</h1>
        <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
          Facts only. There are no ratings or scores on a worker record, and the details
          below stay inside your business and Maintain.
        </p>
      </div>

      <WorkerForm
        regions={(regionsResult.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }))}
        trades={(tradesResult.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
        proficienciesByTrade={proficienciesByTrade}
        skillsByTrade={skillsByTrade}
        today={brisbaneToday()}
      />
    </div>
  );
}
