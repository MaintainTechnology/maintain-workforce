"use client";

import { useActionState, useState } from "react";

import { createDemandRequest, updateDemandLine } from "@/lib/actions/demand";
import type { FormResult } from "@/lib/actions";
import { inclusiveDays } from "@/lib/domain/availability";
import { expectedHours, formatCentsExGst, hoursPerWeekFromTotal } from "@/lib/domain/money";
import {
  CARD,
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
} from "@/lib/platform-ui";
import { BTN_GHOST, BTN_PRIMARY } from "@/lib/ui";

// BUY CAPACITY intake — spec 10.1–10.4, with the booking minimums of 5.6 and the
// indicative range of 5.5.
//
// The ranges this form displays arrive already marked up by the fee, computed on the
// server (@/lib/rates). No raw band value is ever sent to a hiring business (17.1), so
// there is nothing here to leak even in the client bundle.

export type CatalogueOption = { id: string; name: string };
export type TradeProficiency = {
  tradeRoleId: string;
  proficiencyId: string;
  proficiencyName: string;
};
export type SkillOption = { id: string; name: string; tradeRoleId: string };

/** Keyed `tradeRoleId:proficiencyId:regionId`, values already fee-marked-up (5.5). */
export type RangeLookup = Record<string, { lowCents: number; highCents: number }>;

export type LineDraft = {
  tradeRoleId: string;
  proficiencyId: string;
  quantity: string;
  startDate: string;
  endDate: string;
  hoursMode: "week" | "total";
  hours: string;
  skillIds: string[];
  qualificationIds: string[];
  notes: string;
};

function emptyLine(): LineDraft {
  return {
    tradeRoleId: "",
    proficiencyId: "",
    quantity: "1",
    startDate: "",
    endDate: "",
    hoursMode: "week",
    hours: "",
    skillIds: [],
    qualificationIds: [],
    notes: "",
  };
}

/**
 * 10.1 — hours per week is canonical. When the buyer thinks in total hours the
 * canonical figure is derived and shown back for confirmation before it is saved.
 */
function derivedHoursPerWeek(line: LineDraft): number | null {
  const hours = Number(line.hours);
  if (!hours || !line.startDate || !line.endDate) return null;
  if (line.hoursMode === "week") return hours;
  const days = inclusiveDays({ start: line.startDate, end: line.endDate });
  if (days === 0) return null;
  return hoursPerWeekFromTotal(hours, days);
}

export function DemandForm({
  mode,
  industries,
  regions,
  trades,
  tradeProficiencies,
  skills,
  qualifications,
  ranges,
  rules,
  lineId,
  workRegionId,
  initialLine,
}: {
  mode: "create" | "edit";
  industries: CatalogueOption[];
  regions: CatalogueOption[];
  trades: CatalogueOption[];
  tradeProficiencies: TradeProficiency[];
  skills: SkillOption[];
  qualifications: CatalogueOption[];
  ranges: RangeLookup;
  rules: { minimumHoursPerLine: number; minimumCrewSize: number };
  lineId?: string;
  workRegionId?: string;
  initialLine?: LineDraft;
}) {
  const action = mode === "create" ? createDemandRequest : updateDemandLine;
  const [result, formAction, pending] = useActionState<FormResult | null, FormData>(action, null);

  const [name, setName] = useState("");
  const [industryId, setIndustryId] = useState("");
  const [regionId, setRegionId] = useState(workRegionId ?? regions[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([initialLine ?? emptyLine()]);

  function patch(index: number, change: Partial<LineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));
  }

  function toggle(index: number, key: "skillIds" | "qualificationIds", id: string) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const held = line[key];
        return {
          ...line,
          [key]: held.includes(id) ? held.filter((value) => value !== id) : [...held, id],
        };
      }),
    );
  }

  const payload =
    mode === "create"
      ? {
          name,
          industryId: industryId || undefined,
          workRegionId: regionId,
          description: description || undefined,
          lines: lines.map((line) => ({
            tradeRoleId: line.tradeRoleId,
            proficiencyId: line.proficiencyId,
            quantity: Number(line.quantity),
            startDate: line.startDate,
            endDate: line.endDate,
            hoursMode: line.hoursMode,
            hours: Number(line.hours),
            skillIds: line.skillIds,
            qualificationIds: line.qualificationIds,
            notes: line.notes || undefined,
          })),
        }
      : {
          lineId,
          quantity: Number(lines[0].quantity),
          startDate: lines[0].startDate,
          endDate: lines[0].endDate,
          hoursMode: lines[0].hoursMode,
          hours: Number(lines[0].hours),
          skillIds: lines[0].skillIds,
          qualificationIds: lines[0].qualificationIds,
          notes: lines[0].notes || undefined,
        };

  return (
    <form action={formAction} className="flex flex-col gap-(--space-5)">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {result?.message ? (
        <p className={FIELD_ERROR} role="alert">
          {result.message}
        </p>
      ) : null}

      {mode === "create" ? (
        <fieldset className={CARD}>
          <legend className={FIELD_LABEL}>The requirement</legend>
          <div className="mt-(--space-4) grid gap-(--space-4) md:grid-cols-2">
            <div className={FIELD}>
              <label className={FIELD_LABEL} htmlFor="request-name">
                Project or site name
              </label>
              <input
                id="request-name"
                className={INPUT}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className={FIELD}>
              <label className={FIELD_LABEL} htmlFor="request-region">
                Work location region
              </label>
              <select
                id="request-region"
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
              <label className={FIELD_LABEL} htmlFor="request-industry">
                Industry (optional)
              </label>
              <select
                id="request-industry"
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
              <label className={FIELD_LABEL} htmlFor="request-description">
                Description (optional)
              </label>
              <textarea
                id="request-description"
                rows={3}
                className={INPUT}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      {lines.map((line, index) => {
        const proficiencies = tradeProficiencies.filter(
          (pair) => pair.tradeRoleId === line.tradeRoleId,
        );
        const tradeSkills = skills.filter((skill) => skill.tradeRoleId === line.tradeRoleId);
        const range = ranges[`${line.tradeRoleId}:${line.proficiencyId}:${regionId}`];
        const perWeek = derivedHoursPerWeek(line);
        const days =
          line.startDate && line.endDate
            ? inclusiveDays({ start: line.startDate, end: line.endDate })
            : 0;
        const lineError = result?.errors?.[`line-${index}`];

        return (
          <fieldset key={index} className={CARD}>
            <legend className={FIELD_LABEL}>
              {mode === "create" ? `Line ${index + 1}` : "Demand line"}
            </legend>

            <div className="mt-(--space-4) grid gap-(--space-4) md:grid-cols-2">
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`trade-${index}`}>
                  Trade
                </label>
                <select
                  id={`trade-${index}`}
                  className={INPUT}
                  value={line.tradeRoleId}
                  disabled={mode === "edit"}
                  onChange={(event) =>
                    patch(index, {
                      tradeRoleId: event.target.value,
                      proficiencyId: "",
                      skillIds: [],
                    })
                  }
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
                <label className={FIELD_LABEL} htmlFor={`proficiency-${index}`}>
                  Proficiency
                </label>
                {/* 4.2 — only the levels this trade actually supports. */}
                <select
                  id={`proficiency-${index}`}
                  className={INPUT}
                  value={line.proficiencyId}
                  disabled={mode === "edit"}
                  onChange={(event) => patch(index, { proficiencyId: event.target.value })}
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
                <label className={FIELD_LABEL} htmlFor={`quantity-${index}`}>
                  How many
                </label>
                <input
                  id={`quantity-${index}`}
                  type="number"
                  min={rules.minimumCrewSize}
                  step="1"
                  className={`${INPUT} ${MONO}`}
                  value={line.quantity}
                  onChange={(event) => patch(index, { quantity: event.target.value })}
                  required
                />
                <p className={FIELD_HINT}>Minimum crew size is {rules.minimumCrewSize}.</p>
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`start-${index}`}>
                  Start date
                </label>
                <input
                  id={`start-${index}`}
                  type="date"
                  className={`${INPUT} ${MONO}`}
                  value={line.startDate}
                  onChange={(event) => patch(index, { startDate: event.target.value })}
                  required
                />
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`end-${index}`}>
                  End date
                </label>
                <input
                  id={`end-${index}`}
                  type="date"
                  className={`${INPUT} ${MONO}`}
                  value={line.endDate}
                  onChange={(event) => patch(index, { endDate: event.target.value })}
                  required
                />
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`hours-${index}`}>
                  Hours
                </label>
                <div className="flex gap-(--space-3)">
                  <input
                    id={`hours-${index}`}
                    type="number"
                    min="1"
                    step="0.5"
                    className={`${INPUT} ${MONO}`}
                    value={line.hours}
                    onChange={(event) => patch(index, { hours: event.target.value })}
                    required
                  />
                  <select
                    aria-label="Hours basis"
                    className={INPUT}
                    value={line.hoursMode}
                    onChange={(event) =>
                      patch(index, { hoursMode: event.target.value as "week" | "total" })
                    }
                  >
                    <option value="week">per week</option>
                    <option value="total">in total</option>
                  </select>
                </div>
                {perWeek ? (
                  <p className={FIELD_HINT}>
                    <span className={MONO}>{perWeek}</span> hours per week over{" "}
                    <span className={MONO}>{days}</span> days —{" "}
                    <span className={MONO}>{expectedHours(perWeek, days)}</span> hours in all.
                    Minimum booking is {rules.minimumHoursPerLine} hours.
                  </p>
                ) : (
                  <p className={FIELD_HINT}>
                    Hours per week is what the exchange books against; a total is converted
                    to it.
                  </p>
                )}
              </div>
            </div>

            {/* 5.5 / 20.4 — the all-in indicative range, computed server-side. Where no
                band exists the buyer sees no range at all rather than an invented one. */}
            <p className="mt-(--space-4) text-body text-on-dark-muted">
              {line.tradeRoleId && line.proficiencyId ? (
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

            <div className="mt-(--space-4) flex flex-col gap-(--space-2)">
              <span className={FIELD_LABEL}>Required skills (optional)</span>
              {tradeSkills.length === 0 ? (
                <p className={FIELD_HINT}>Choose a trade to list its skills.</p>
              ) : (
                <div className="flex flex-wrap gap-(--space-3)">
                  {tradeSkills.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-(--space-2) text-body">
                      <input
                        type="checkbox"
                        checked={line.skillIds.includes(skill.id)}
                        onChange={() => toggle(index, "skillIds", skill.id)}
                      />
                      {skill.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-(--space-4) flex flex-col gap-(--space-2)">
              <span className={FIELD_LABEL}>Required tickets (optional)</span>
              <div className="flex flex-wrap gap-(--space-3)">
                {qualifications.map((qualification) => (
                  <label
                    key={qualification.id}
                    className="flex items-center gap-(--space-2) text-body"
                  >
                    <input
                      type="checkbox"
                      checked={line.qualificationIds.includes(qualification.id)}
                      onChange={() => toggle(index, "qualificationIds", qualification.id)}
                    />
                    {qualification.name}
                  </label>
                ))}
              </div>
            </div>

            <div className={`${FIELD} mt-(--space-4)`}>
              <label className={FIELD_LABEL} htmlFor={`notes-${index}`}>
                Notes (optional)
              </label>
              <textarea
                id={`notes-${index}`}
                rows={2}
                className={INPUT}
                value={line.notes}
                onChange={(event) => patch(index, { notes: event.target.value })}
              />
            </div>

            {lineError ? (
              <p className={`${FIELD_ERROR} mt-(--space-4)`} role="alert">
                {lineError}
              </p>
            ) : null}

            {mode === "create" && lines.length > 1 ? (
              <button
                type="button"
                className={`${BTN_GHOST} mt-(--space-4)`}
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                Remove line {index + 1}
              </button>
            ) : null}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap gap-(--space-4)">
        {mode === "create" ? (
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            Add another line
          </button>
        ) : null}
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Post this requirement" : "Save this line"}
        </button>
      </div>
    </form>
  );
}
