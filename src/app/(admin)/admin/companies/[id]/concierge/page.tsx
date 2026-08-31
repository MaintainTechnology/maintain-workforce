import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMaintainAdmin } from "@/lib/auth";
import { getBookingRules } from "@/lib/config";
import { formatAbn } from "@/lib/domain/abn";
import { CARD, MONO, PAGE, pill, toneFor } from "@/lib/platform-ui";
import { indicativeRangeMap, supplierBandMap } from "@/lib/rates";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_GHOST, H1, H2, LINK } from "@/lib/ui";
import { ConciergeCapacityForm, type CrewOption } from "./capacity-form";
import { ConciergeDemandForm, type SkillOption, type TradeProficiency } from "./demand-form";
import { ConciergeWorkerForm } from "./worker-form";

// 16.1 — one screen where a Maintain admin transcribes what a company gave over the
// phone or by email onto that company's own records: a capacity listing, a demand
// request, or a new worker. Every write below routes through @/lib/actions/concierge,
// which flags admin_entered, requires the evidence note and audits the acting admin.
// This screen never decides a rate or a nomination on the company's behalf (guardrail
// 2, spec 16.1) — it is the form the admin fills in from what was said.

export const metadata: Metadata = { title: "Concierge entry" };

const FEEDBACK: Record<string, string> = {
  capacity: "Capacity listed on the company's behalf.",
  demand: "Requirement posted on the company's behalf.",
  worker: "Worker added on the company's behalf.",
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

/** 20.5 — calendar dates in Australia/Brisbane; Queensland has no daylight saving. */
function brisbaneToday(): string {
  return new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
}

export default async function CompanyConciergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaintainAdmin();
  const { id: companyId } = await params;
  const search = await searchParams;
  const saved = FEEDBACK[typeof search.saved === "string" ? search.saved : ""];

  const admin = createAdminClient();

  const { data: company } = await admin
    .from("company")
    .select("id, legal_name, trading_name, abn, status")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) notFound();

  const [
    { data: employmentData },
    { data: regionData },
    { data: industryData },
    { data: tradeData },
    { data: proficiencyData },
    { data: pairData },
    { data: skillData },
    { data: qualificationData },
    rules,
    ranges,
  ] = await Promise.all([
    admin
      .from("worker_employment")
      .select(
        "worker:worker_id (id, first_name, last_name, primary_trade_id, primary_proficiency_id, trade:primary_trade_id (name), proficiency:primary_proficiency_id (name))",
      )
      .eq("company_id", companyId)
      .is("end_date", null),
    admin.from("region").select("id, name").eq("is_active", true).order("name"),
    admin.from("industry").select("id, name").eq("is_active", true).order("name"),
    admin.from("trade_role").select("id, name").eq("is_active", true).order("name"),
    admin.from("proficiency").select("id, name, rank").eq("is_active", true).order("rank"),
    admin
      .from("trade_role_proficiency")
      .select("trade_role_id, proficiency_id, proficiency:proficiency_id (name, rank, is_active)"),
    admin.from("skill").select("id, name, trade_role_id").eq("is_active", true).order("name"),
    admin.from("qualification").select("id, name").eq("is_active", true).order("name"),
    getBookingRules(),
    // 5.5 / 17.1 — already fee-marked-up; a hiring business's demand line never
    // carries a raw band value, concierge-entered or not.
    indicativeRangeMap(),
  ]);

  const workers = ((employmentData ?? []) as unknown as { worker: WorkerRow | null }[])
    .map((row) => row.worker)
    .filter((worker): worker is WorkerRow => worker !== null);

  const crew: CrewOption[] = workers.map((worker) => ({
    id: worker.id,
    name: `${worker.first_name} ${worker.last_name}`,
    tradeRoleId: worker.primary_trade_id,
    tradeName: worker.trade?.name ?? "Trade",
    proficiencyId: worker.primary_proficiency_id,
    proficiencyName: worker.proficiency?.name ?? "Level",
  }));

  const regions = (regionData ?? []) as { id: string; name: string }[];
  const industries = (industryData ?? []) as { id: string; name: string }[];
  const trades = (tradeData ?? []) as { id: string; name: string }[];

  // 5.2 / 17.1 — the band projection scoped to the trades this company's crew runs,
  // same as the company's own capacity form.
  const bands = await supplierBandMap([...new Set(crew.map((worker) => worker.tradeRoleId))]);

  const proficiencyById = new Map(
    ((proficiencyData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p]),
  );
  const proficienciesByTrade: Record<string, { id: string; name: string }[]> = {};
  for (const pair of (pairData ?? []) as { trade_role_id: string; proficiency_id: string }[]) {
    const proficiency = proficiencyById.get(pair.proficiency_id);
    if (!proficiency) continue;
    proficienciesByTrade[pair.trade_role_id] = [
      ...(proficienciesByTrade[pair.trade_role_id] ?? []),
      proficiency,
    ];
  }

  type PairRow = {
    trade_role_id: string;
    proficiency_id: string;
    proficiency: { name: string; rank: number; is_active: boolean } | null;
  };
  const tradeProficiencies: TradeProficiency[] = ((pairData ?? []) as unknown as PairRow[])
    .filter((pair) => pair.proficiency?.is_active)
    .sort((a, b) => (a.proficiency?.rank ?? 0) - (b.proficiency?.rank ?? 0))
    .map((pair) => ({
      tradeRoleId: pair.trade_role_id,
      proficiencyId: pair.proficiency_id,
      proficiencyName: pair.proficiency?.name ?? "Level",
    }));

  const skillsData = (skillData ?? []) as { id: string; name: string; trade_role_id: string }[];
  const skills: SkillOption[] = skillsData.map((skill) => ({
    id: skill.id,
    name: skill.name,
    tradeRoleId: skill.trade_role_id,
  }));
  const skillsByTrade: Record<string, { id: string; name: string }[]> = {};
  for (const skill of skillsData) {
    skillsByTrade[skill.trade_role_id] = [
      ...(skillsByTrade[skill.trade_role_id] ?? []),
      { id: skill.id, name: skill.name },
    ];
  }
  const qualifications = (qualificationData ?? []) as { id: string; name: string }[];

  return (
    <div className={`${PAGE} flex flex-col gap-(--space-6)`}>
      <div>
        <Link href="/admin/companies" className={LINK}>
          Back to companies
        </Link>
        <header className="mt-(--space-4) flex flex-wrap items-baseline gap-(--space-4)">
          <h1 className={H1}>Concierge — {company.legal_name}</h1>
          <span className={pill(toneFor(company.status))}>{company.status}</span>
          <span className={`${MONO} text-body text-on-dark-muted`}>
            {company.abn ? formatAbn(company.abn) : "ABN not provided"}
          </span>
        </header>
        <p className="mt-(--space-3) max-w-[70ch] text-body-lg text-on-dark-muted">
          Everything below is entered on {company.legal_name}&rsquo;s behalf from what they gave by
          phone or email (16.1). Each write is flagged admin-entered, carries the evidence note you
          record, and is audited under your account.
        </p>
      </div>

      {saved && (
        <p role="status" className={`${CARD} text-body text-on-dark`}>
          {saved}
        </p>
      )}

      {company.status !== "Active" ? (
        <p className={`${CARD} text-body text-on-dark-muted`}>
          Capacity and requirement entry are only available once this company is Active (3.2). Crew
          can still be added while it is Pending.
        </p>
      ) : null}

      <section className={CARD}>
        <h2 className={H2}>List capacity</h2>
        <p className="mt-(--space-2) max-w-[60ch] text-body-sm text-on-dark-muted">
          One line, naming the crew on it — 9.1–9.4.
        </p>
        {company.status !== "Active" ? (
          <p className="mt-(--space-4) text-body text-on-dark-muted">Not available until Active.</p>
        ) : crew.length === 0 ? (
          <p className="mt-(--space-4) text-body text-on-dark-muted">
            This company has no crew yet — add a worker below first.
          </p>
        ) : (
          <div className="mt-(--space-5)">
            <ConciergeCapacityForm companyId={companyId} crew={crew} regions={regions} bands={bands} />
          </div>
        )}
      </section>

      <section className={CARD}>
        <h2 className={H2}>Post a requirement</h2>
        <p className="mt-(--space-2) max-w-[60ch] text-body-sm text-on-dark-muted">
          One line, with what the site needs — 10.1–10.3.
        </p>
        {company.status !== "Active" ? (
          <p className="mt-(--space-4) text-body text-on-dark-muted">Not available until Active.</p>
        ) : (
          <div className="mt-(--space-5)">
            <ConciergeDemandForm
              companyId={companyId}
              industries={industries}
              regions={regions}
              trades={trades}
              tradeProficiencies={tradeProficiencies}
              skills={skills}
              qualifications={qualifications}
              ranges={ranges}
              rules={rules}
            />
          </div>
        )}
      </section>

      <section className={CARD}>
        <h2 className={H2}>Add a worker</h2>
        <p className="mt-(--space-2) max-w-[60ch] text-body-sm text-on-dark-muted">
          Facts only, and the company&rsquo;s own consent confirmation — 6.1–6.4.
        </p>
        <div className="mt-(--space-5)">
          <ConciergeWorkerForm
            companyId={companyId}
            regions={regions}
            trades={trades}
            proficienciesByTrade={proficienciesByTrade}
            skillsByTrade={skillsByTrade}
            today={brisbaneToday()}
          />
        </div>
      </section>

      <div>
        <Link href="/admin/companies" className={BTN_GHOST}>
          Done
        </Link>
      </div>
    </div>
  );
}
