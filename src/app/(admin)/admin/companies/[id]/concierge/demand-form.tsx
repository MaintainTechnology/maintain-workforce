"use client";

import { useActionState, useState } from "react";

import type { FormResult } from "@/lib/actions";
import { conciergeCreateDemandRequest } from "@/lib/actions/concierge";
import { inclusiveDays } from "@/lib/domain/availability";
import { expectedHours, formatCentsExGst, hoursPerWeekFromTotal } from "@/lib/domain/money";
import {
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
} from "@/lib/platform-ui";
import { BTN_PRIMARY } from "@/lib/ui";

// 16.1 concierge demand intake — the same 10.1–10.3 / 5.5 / 20.4 rules as the hiring
// business's own form (demand.ts / demand-form.tsx), typed in by a Maintain admin
// from a phone call. One line per submission — see capacity-form.tsx for why.

export type CatalogueOption = { id: string; name: string };
export type TradeProficiency = { tradeRoleId: string; proficiencyId: string; proficiencyName: string };
export type SkillOption = { id: string; name: string; tradeRoleId: string };
export type RangeLookup = Record<string, { lowCents: number; highCents: number }>;

function derivedHoursPerWeek(
  hoursMode: "week" | "total",
  hours: string,
  startDate: string,
  endDate: string,
): number | null {
  const value = Number(hours);
  if (!value || !startDate || !endDate) return null;
  if (hoursMode === "week") return value;
  const days = inclusiveDays({ start: startDate, end: endDate });
  if (days === 0) return null;
  return hoursPerWeekFromTotal(value, days);
}

export function ConciergeDemandForm({
  companyId,
  industries,
  regions,
  trades,
  tradeProficiencies,
  skills,
  qualifications,
  ranges,
  rules,
}: {
  companyId: string;
  industries: CatalogueOption[];
  regions: CatalogueOption[];
  trades: CatalogueOption[];
  tradeProficiencies: TradeProficiency[];
  skills: SkillOption[];
  qualifications: CatalogueOption[];
  ranges: RangeLookup;
  rules: { minimumHoursPerLine: number; minimumCrewSize: number };
}) {
  const [result, formAction, pending] = useActionState<FormResult | null, FormData>(
    conciergeCreateDemandRequest,
    null,
  );

  const [name, setName] = useState("");
  const [industryId, setIndustryId] = useState("");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [tradeRoleId, setTradeRoleId] = useState("");
  const [proficiencyId, setProficiencyId] = useState("");
  const [quantity, setQuantity] = useState(String(rules.minimumCrewSize));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hoursMode, setHoursMode] = useState<"week" | "total">("week");
  const [hours, setHours] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [qualificationIds, setQualificationIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");

  const proficiencies = tradeProficiencies.filter((pair) => pair.tradeRoleId === tradeRoleId);
  const tradeSkills = skills.filter((skill) => skill.tradeRoleId === tradeRoleId);
  const range = ranges[`${tradeRoleId}:${proficiencyId}:${regionId}`];
  const perWeek = derivedHoursPerWeek(hoursMode, hours, startDate, endDate);
  const days = startDate && endDate ? inclusiveDays({ start: startDate, end: endDate }) : 0;

  function toggle(setter: typeof setSkillIds, id: string) {
    setter((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  }

  const payload = {
    name,
    industryId: industryId || undefined,
    workRegionId: regionId,
    description: description || undefined,
    lines: [
      {
        tradeRoleId,
        proficiencyId,
        quantity: Number(quantity),
        startDate,
        endDate,
        hoursMode,
        hours: Number(hours),
        skillIds,
        qualificationIds,
        notes: notes || undefined,
      },
    ],
  };

  const lineError = result?.errors?.["line-0"];

  return (
    <form action={formAction} className="flex flex-col gap-(--space-4)">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {result?.message ? (
        <p className={FIELD_ERROR} role="alert">
          {result.message}
        </p>
      ) : null}

      <div className="grid gap-(--space-4) md:grid-cols-2">
        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-name">
            Project or site name
          </label>
          <input
            id="dem-name"
            className={INPUT}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-region">
            Work location region
          </label>
          <select
            id="dem-region"
            className={INPUT}
            value={regionId}
            onChange={(event) => setRegionId(event.target.value)}
          >
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-industry">
            Industry (optional)
          </label>
          <select
            id="dem-industry"
            className={INPUT}
            value={industryId}
            onChange={(event) => setIndustryId(event.target.value)}
          >
            <option value="">Not specified</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-description">
            Description (optional)
          </label>
          <textarea
            id="dem-description"
            rows={2}
            className={INPUT}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-trade">
            Trade
          </label>
          <select
            id="dem-trade"
            className={INPUT}
            value={tradeRoleId}
            onChange={(event) => {
              setTradeRoleId(event.target.value);
              setProficiencyId("");
              setSkillIds([]);
            }}
          >
            <option value="">Select…</option>
            {trades.map((trade) => (
              <option key={trade.id} value={trade.id}>
                {trade.name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-proficiency">
            Proficiency
          </label>
          <select
            id="dem-proficiency"
            className={INPUT}
            value={proficiencyId}
            onChange={(event) => setProficiencyId(event.target.value)}
          >
            <option value="">Select…</option>
            {proficiencies.map((pair) => (
              <option key={pair.proficiencyId} value={pair.proficiencyId}>
                {pair.proficiencyName}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-quantity">
            How many
          </label>
          <input
            id="dem-quantity"
            type="number"
            min={rules.minimumCrewSize}
            step="1"
            className={`${INPUT} ${MONO}`}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
          <p className={FIELD_HINT}>Minimum crew size is {rules.minimumCrewSize}.</p>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-start">
            Start date
          </label>
          <input
            id="dem-start"
            type="date"
            className={`${INPUT} ${MONO}`}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-end">
            End date
          </label>
          <input
            id="dem-end"
            type="date"
            className={`${INPUT} ${MONO}`}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="dem-hours">
            Hours
          </label>
          <div className="flex gap-(--space-3)">
            <input
              id="dem-hours"
              type="number"
              min="1"
              step="0.5"
              className={`${INPUT} ${MONO}`}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              required
            />
            <select
              aria-label="Hours basis"
              className={INPUT}
              value={hoursMode}
              onChange={(event) => setHoursMode(event.target.value as "week" | "total")}
            >
              <option value="week">per week</option>
              <option value="total">in total</option>
            </select>
          </div>
          {perWeek ? (
            <p className={FIELD_HINT}>
              <span className={MONO}>{perWeek}</span> hours per week over{" "}
              <span className={MONO}>{days}</span> days — <span className={MONO}>{expectedHours(perWeek, days)}</span>{" "}
              hours in all. Minimum booking is {rules.minimumHoursPerLine} hours.
            </p>
          ) : (
            <p className={FIELD_HINT}>Hours per week is what the exchange books against.</p>
          )}
        </div>
      </div>

      <p className="text-body text-on-dark-muted">
        {tradeRoleId && proficiencyId ? (
          range ? (
            <>
              Indicative all-in rate{" "}
              <span className={MONO}>
                {formatCentsExGst(range.lowCents)} – {formatCentsExGst(range.highCents)}
              </span>{" "}
              per hour. The rate is fixed when Maintain proposes a match.
            </>
          ) : (
            <>No indicative range is published for this trade, proficiency and region yet.</>
          )
        ) : (
          <>Choose a trade and proficiency to see the indicative all-in range.</>
        )}
      </p>

      <div className="flex flex-col gap-(--space-2)">
        <span className={FIELD_LABEL}>Required skills (optional)</span>
        {tradeSkills.length === 0 ? (
          <p className={FIELD_HINT}>Choose a trade to list its skills.</p>
        ) : (
          <div className="flex flex-wrap gap-(--space-3)">
            {tradeSkills.map((skill) => (
              <label key={skill.id} className="flex items-center gap-(--space-2) text-body">
                <input
                  type="checkbox"
                  checked={skillIds.includes(skill.id)}
                  onChange={() => toggle(setSkillIds, skill.id)}
                />
                {skill.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-(--space-2)">
        <span className={FIELD_LABEL}>Required tickets (optional)</span>
        <div className="flex flex-wrap gap-(--space-3)">
          {qualifications.map((qualification) => (
            <label key={qualification.id} className="flex items-center gap-(--space-2) text-body">
              <input
                type="checkbox"
                checked={qualificationIds.includes(qualification.id)}
                onChange={() => toggle(setQualificationIds, qualification.id)}
              />
              {qualification.name}
            </label>
          ))}
        </div>
      </div>

      <div className={FIELD}>
        <label className={FIELD_LABEL} htmlFor="dem-notes">
          Notes (optional)
        </label>
        <textarea
          id="dem-notes"
          rows={2}
          className={INPUT}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {lineError ? (
        <p className={FIELD_ERROR} role="alert">
          {lineError}
        </p>
      ) : null}

      {/* 16.1 — mandatory on every concierge write: who was spoken to, and when. */}
      <div className={FIELD}>
        <label className={FIELD_LABEL} htmlFor="dem-evidence">
          Evidence note (required)
        </label>
        <textarea
          id="dem-evidence"
          name="evidence_note"
          className={INPUT}
          rows={2}
          minLength={10}
          placeholder="Emailed by site manager Priya Nair, 27 Aug, confirmed dates and quantity."
          value={evidenceNote}
          onChange={(event) => setEvidenceNote(event.target.value)}
          required
        />
        {result?.errors?.evidence_note ? (
          <p className={FIELD_ERROR} role="alert">
            {result.errors.evidence_note}
          </p>
        ) : null}
      </div>

      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "Saving…" : "Post this requirement"}
        </button>
      </div>
    </form>
  );
}
