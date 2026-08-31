"use client";

import { useActionState, useState } from "react";

import { createCapacityListing, updateCapacityLine } from "@/lib/actions/capacity";
import type { FormResult } from "@/lib/actions";
import { formatCentsExGst } from "@/lib/domain/money";
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

// SELL CAPACITY intake — spec 9.1–9.4, 5.2 and 20.4.
//
// One component serves both the bulk create flow (9.3: one form, several lines, one
// submission) and the single-line edit on the detail screen, because the two obey the
// same rules — only the fields that may still move differ.
//
// The server action re-validates everything this form checks. Nothing here is a
// security control; it is the fast feedback in front of one.

export type CrewOption = {
  id: string;
  name: string;
  tradeRoleId: string;
  tradeName: string;
  proficiencyId: string;
  proficiencyName: string;
};

export type RegionOption = { id: string; name: string };

/**
 * 5.2 / 17.1 — bands arrive already scoped to the trades this business runs, keyed
 * `tradeRoleId:proficiencyId:regionId` by the server. The client never queries a band.
 */
export type BandLookup = Record<string, { lowCents: number; highCents: number }>;

export type LineDraft = {
  tradeRoleId: string;
  proficiencyId: string;
  locationRegionId: string;
  availableFrom: string;
  availableUntil: string;
  availableDays: string;
  hoursPerWeek: string;
  rateDollars: string;
  workerIds: string[];
  travelRegionIds: string[];
  rateTouched: boolean;
};

function bandKey(line: Pick<LineDraft, "tradeRoleId" | "proficiencyId" | "locationRegionId">): string {
  return `${line.tradeRoleId}:${line.proficiencyId}:${line.locationRegionId}`;
}

function emptyLine(regionId: string): LineDraft {
  return {
    tradeRoleId: "",
    proficiencyId: "",
    locationRegionId: regionId,
    availableFrom: "",
    availableUntil: "",
    availableDays: "",
    hoursPerWeek: "",
    rateDollars: "",
    workerIds: [],
    travelRegionIds: [],
    rateTouched: false,
  };
}

function toCents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

/** 5.2 — the pre-fill is the middle of the recommended band; the supplier then confirms
 *  or overrides it. Maintain never sets a non-negotiable price, so this is a starting
 *  number, never a locked one. */
function prefillDollars(band: { lowCents: number; highCents: number } | undefined): string {
  if (!band) return "";
  return (Math.round((band.lowCents + band.highCents) / 2) / 100).toFixed(2);
}

export function CapacityForm({
  mode,
  crew,
  regions,
  bands,
  lineId,
  initialLine,
}: {
  mode: "create" | "edit";
  crew: CrewOption[];
  regions: RegionOption[];
  bands: BandLookup;
  lineId?: string;
  initialLine?: LineDraft;
}) {
  const action = mode === "create" ? createCapacityListing : updateCapacityLine;
  const [result, formAction, pending] = useActionState<FormResult | null, FormData>(action, null);
  const [lines, setLines] = useState<LineDraft[]>([
    initialLine ?? emptyLine(regions[0]?.id ?? ""),
  ]);

  // 9.2 — a line's trade and proficiency are its crew's, so the selectable
  // classifications are exactly those present on this company's roster.
  const classifications = [
    ...new Map(
      crew.map((worker) => [
        `${worker.tradeRoleId}:${worker.proficiencyId}`,
        {
          tradeRoleId: worker.tradeRoleId,
          proficiencyId: worker.proficiencyId,
          label: `${worker.tradeName} · ${worker.proficiencyName}`,
        },
      ]),
    ).values(),
  ];

  function patch(index: number, change: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...change } : line)),
    );
  }

  function setClassification(index: number, value: string) {
    const [tradeRoleId, proficiencyId] = value.split(":");
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, tradeRoleId, proficiencyId, workerIds: [] };
        if (!next.rateTouched) next.rateDollars = prefillDollars(bands[bandKey(next)]);
        return next;
      }),
    );
  }

  function setRegion(index: number, regionId: string) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, locationRegionId: regionId };
        if (!next.rateTouched) next.rateDollars = prefillDollars(bands[bandKey(next)]);
        return next;
      }),
    );
  }

  function toggle(index: number, key: "workerIds" | "travelRegionIds", id: string) {
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
          lines: lines.map((line) => ({
            tradeRoleId: line.tradeRoleId,
            proficiencyId: line.proficiencyId,
            locationRegionId: line.locationRegionId,
            availableFrom: line.availableFrom,
            availableUntil: line.availableUntil,
            availableDays: line.availableDays,
            hoursPerWeek: Number(line.hoursPerWeek),
            supplierRateCents: toCents(line.rateDollars),
            workerIds: line.workerIds,
            travelRegionIds: line.travelRegionIds,
          })),
        }
      : {
          lineId,
          availableFrom: lines[0].availableFrom,
          availableUntil: lines[0].availableUntil,
          availableDays: lines[0].availableDays,
          hoursPerWeek: Number(lines[0].hoursPerWeek),
          supplierRateCents: toCents(lines[0].rateDollars),
          workerIds: lines[0].workerIds,
          travelRegionIds: lines[0].travelRegionIds,
        };

  return (
    <form action={formAction} className="flex flex-col gap-(--space-5)">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {result?.message ? (
        <p className={FIELD_ERROR} role="alert">
          {result.message}
        </p>
      ) : null}

      {lines.map((line, index) => {
        const band = bands[bandKey(line)];
        const matching = crew.filter(
          (worker) =>
            worker.tradeRoleId === line.tradeRoleId &&
            worker.proficiencyId === line.proficiencyId,
        );
        const lineError = result?.errors?.[`line-${index}`];

        return (
          <fieldset key={index} className={CARD}>
            <legend className={FIELD_LABEL}>
              {mode === "create" ? `Line ${index + 1}` : "Capacity line"}
            </legend>

            <div className="mt-(--space-4) grid gap-(--space-4) md:grid-cols-2">
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`classification-${index}`}>
                  Trade and proficiency
                </label>
                <select
                  id={`classification-${index}`}
                  className={INPUT}
                  value={line.tradeRoleId ? `${line.tradeRoleId}:${line.proficiencyId}` : ""}
                  disabled={mode === "edit"}
                  onChange={(event) => setClassification(index, event.target.value)}
                >
                  <option value="">Select…</option>
                  {classifications.map((option) => (
                    <option
                      key={`${option.tradeRoleId}:${option.proficiencyId}`}
                      value={`${option.tradeRoleId}:${option.proficiencyId}`}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className={FIELD_HINT}>
                  Everyone on a line shares its trade and proficiency. A different
                  classification is a separate line.
                </p>
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`region-${index}`}>
                  Location region
                </label>
                <select
                  id={`region-${index}`}
                  className={INPUT}
                  value={line.locationRegionId}
                  disabled={mode === "edit"}
                  onChange={(event) => setRegion(index, event.target.value)}
                >
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`from-${index}`}>
                  Available from
                </label>
                <input
                  id={`from-${index}`}
                  type="date"
                  className={`${INPUT} ${MONO}`}
                  value={line.availableFrom}
                  onChange={(event) => patch(index, { availableFrom: event.target.value })}
                  required
                />
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`until-${index}`}>
                  Available until
                </label>
                <input
                  id={`until-${index}`}
                  type="date"
                  className={`${INPUT} ${MONO}`}
                  value={line.availableUntil}
                  onChange={(event) => patch(index, { availableUntil: event.target.value })}
                  required
                />
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`hours-${index}`}>
                  Hours per week
                </label>
                <input
                  id={`hours-${index}`}
                  type="number"
                  min="1"
                  max="168"
                  step="0.5"
                  className={`${INPUT} ${MONO}`}
                  value={line.hoursPerWeek}
                  onChange={(event) => patch(index, { hoursPerWeek: event.target.value })}
                  required
                />
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`days-${index}`}>
                  Available days (optional)
                </label>
                <input
                  id={`days-${index}`}
                  type="text"
                  className={INPUT}
                  placeholder="Mon–Fri"
                  value={line.availableDays}
                  onChange={(event) => patch(index, { availableDays: event.target.value })}
                />
              </div>

              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor={`rate-${index}`}>
                  Your rate, per hour ex GST
                </label>
                <input
                  id={`rate-${index}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={`${INPUT} ${MONO}`}
                  value={line.rateDollars}
                  onChange={(event) =>
                    patch(index, { rateDollars: event.target.value, rateTouched: true })
                  }
                  required
                />
                {/* 5.2 / 20.4 — the band is a recommendation the supplier confirms or
                    overrides, and a missing band never invents a rate. */}
                {band ? (
                  <p className={FIELD_HINT}>
                    Recommended band{" "}
                    <span className={MONO}>
                      {formatCentsExGst(band.lowCents)} – {formatCentsExGst(band.highCents)}
                    </span>
                    . This rate is yours to set.
                  </p>
                ) : (
                  <p className={FIELD_HINT}>
                    No recommended band for this trade, proficiency and region. Set your own
                    rate; Maintain is told so a band can be published.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-(--space-4) flex flex-col gap-(--space-2)">
              <span className={FIELD_LABEL}>Crew on this line</span>
              {/* 9.1 / 9.3 — every line names its individual workers. There is no
                  anonymous capacity anywhere in the exchange. */}
              {line.tradeRoleId === "" ? (
                <p className={FIELD_HINT}>Choose a trade and proficiency first.</p>
              ) : matching.length === 0 ? (
                <p className={FIELD_HINT}>
                  Nobody on the roster carries that classification yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-(--space-3)">
                  {matching.map((worker) => (
                    <label key={worker.id} className="flex items-center gap-(--space-2) text-body">
                      <input
                        type="checkbox"
                        checked={line.workerIds.includes(worker.id)}
                        onChange={() => toggle(index, "workerIds", worker.id)}
                      />
                      {worker.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-(--space-4) flex flex-col gap-(--space-2)">
              <span className={FIELD_LABEL}>Will travel to (optional)</span>
              <div className="flex flex-wrap gap-(--space-3)">
                {regions.map((region) => (
                  <label key={region.id} className="flex items-center gap-(--space-2) text-body">
                    <input
                      type="checkbox"
                      checked={line.travelRegionIds.includes(region.id)}
                      onChange={() => toggle(index, "travelRegionIds", region.id)}
                    />
                    {region.name}
                  </label>
                ))}
              </div>
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
            onClick={() =>
              setLines((current) => [...current, emptyLine(regions[0]?.id ?? "")])
            }
          >
            Add another line
          </button>
        ) : null}
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "List this capacity"
              : "Save this line"}
        </button>
      </div>
    </form>
  );
}
