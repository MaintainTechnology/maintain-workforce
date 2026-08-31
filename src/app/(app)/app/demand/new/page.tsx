import type { Metadata } from "next";
import Link from "next/link";

import { requireCompanyAdmin } from "@/lib/auth";
import { getBookingRules } from "@/lib/config";
import { CARD, PAGE } from "@/lib/platform-ui";
import { indicativeRangeMap } from "@/lib/rates";
import { createClient } from "@/lib/supabase/server";
import { BTN_GHOST, H1 } from "@/lib/ui";
import { DemandForm, type SkillOption, type TradeProficiency } from "../demand-form";

// 10.1 — one request carries one or more demand lines.

export const metadata: Metadata = { title: "Post a requirement" };

type PairRow = {
  trade_role_id: string;
  proficiency_id: string;
  proficiency: { name: string; rank: number; is_active: boolean } | null;
};

export default async function NewDemandPage() {
  const { companyStatus } = await requireCompanyAdmin();

  // 1.3 / 3.2 — the form is not offered to a company that cannot post. The server
  // action enforces the same rule.
  if (companyStatus !== "Active") {
    return (
      <div className={PAGE}>
        <h1 className={H1}>Post a requirement</h1>
        <div className={`${CARD} mt-(--space-6)`}>
          <p className="text-body text-on-dark-muted">
            {companyStatus === "Pending"
              ? "Verification is still in progress. Posting requirements opens once Maintain activates the account."
              : "This account is read-only. Contact Maintain to resolve it."}
          </p>
          <Link href="/app/demand" className={`${BTN_GHOST} mt-(--space-5)`}>
            Back to requirements
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const [
    { data: industryData },
    { data: regionData },
    { data: tradeData },
    { data: pairData },
    { data: skillData },
    { data: qualificationData },
    rules,
    // 5.5 / 17.1 — already marked up by the fee, computed server-side. A hiring
    // business never receives a raw band value.
    ranges,
  ] = await Promise.all([
    supabase.from("industry").select("id, name").eq("is_active", true).order("name"),
    supabase.from("region").select("id, name").eq("is_active", true).order("name"),
    supabase.from("trade_role").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("trade_role_proficiency")
      .select("trade_role_id, proficiency_id, proficiency:proficiency_id (name, rank, is_active)"),
    supabase.from("skill").select("id, name, trade_role_id").eq("is_active", true).order("name"),
    supabase.from("qualification").select("id, name").eq("is_active", true).order("name"),
    getBookingRules(),
    indicativeRangeMap(),
  ]);

  const pairs = (pairData ?? []) as unknown as PairRow[];

  const skills: SkillOption[] = (
    (skillData ?? []) as { id: string; name: string; trade_role_id: string }[]
  ).map((skill) => ({ id: skill.id, name: skill.name, tradeRoleId: skill.trade_role_id }));

  // 4.2 / 4.3 — only combinations the trade actually supports, and only levels still
  // active for new data entry.
  const tradeProficiencies: TradeProficiency[] = pairs
    .filter((pair) => pair.proficiency?.is_active)
    .sort((a, b) => (a.proficiency?.rank ?? 0) - (b.proficiency?.rank ?? 0))
    .map((pair) => ({
      tradeRoleId: pair.trade_role_id,
      proficiencyId: pair.proficiency_id,
      proficiencyName: pair.proficiency?.name ?? "Level",
    }));

  return (
    <div className={PAGE}>
      <h1 className={H1}>Post a requirement</h1>
      <p className="mt-(--space-3) max-w-[60ch] text-body-lg text-on-dark-muted">
        Say what the site needs — trade, level, how many, and when. Maintain works the
        lines and brings back a shape for you to approve.
      </p>

      <div className="mt-(--space-6)">
        <DemandForm
          mode="create"
          industries={(industryData ?? []) as { id: string; name: string }[]}
          regions={(regionData ?? []) as { id: string; name: string }[]}
          trades={(tradeData ?? []) as { id: string; name: string }[]}
          tradeProficiencies={tradeProficiencies}
          skills={skills}
          qualifications={(qualificationData ?? []) as { id: string; name: string }[]}
          ranges={ranges}
          rules={rules}
        />
      </div>
    </div>
  );
}
