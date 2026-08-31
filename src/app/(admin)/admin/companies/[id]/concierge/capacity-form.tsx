"use client";

import { useActionState, useState } from "react";

import type { FormResult } from "@/lib/actions";
import { conciergeCreateCapacityListing } from "@/lib/actions/concierge";
import { formatCentsExGst } from "@/lib/domain/money";
import {
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
} from "@/lib/platform-ui";
import { BTN_PRIMARY } from "@/lib/ui";

// 16.1 concierge capacity intake — the same 9.1–9.4 / 5.2 / 20.4 rules as the
// supplying business's own form (capacity.ts / capacity-form.tsx), typed in by a
// Maintain admin from a phone call instead. One line per submission — ponytail: a
// second line is a second submission, which also keeps each line's own evidence
// note (who said what, when) distinct rather than shared across a batch.

export type CrewOption = {
  id: string;
  name: string;
  tradeRoleId: string;
  tradeName: string;
  proficiencyId: string;
  proficiencyName: string;
};
export type RegionOption = { id: string; name: string };
export type BandLookup = Record<string, { lowCents: number; highCents: number }>;

function bandKey(tradeRoleId: string, proficiencyId: string, regionId: string): string {
  return `${tradeRoleId}:${proficiencyId}:${regionId}`;
}

function toCents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

export function ConciergeCapacityForm({
  companyId,
  crew,
  regions,
  bands,
}: {
  companyId: string;
  crew: CrewOption[];
  regions: RegionOption[];
  bands: BandLookup;
}) {
  const [result, formAction, pending] = useActionState<FormResult | null, FormData>(
    conciergeCreateCapacityListing,
    null,
  );

  const [tradeRoleId, setTradeRoleId] = useState("");
  const [proficiencyId, setProficiencyId] = useState("");
  const [locationRegionId, setLocationRegionId] = useState(regions[0]?.id ?? "");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [availableDays, setAvailableDays] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [rateDollars, setRateDollars] = useState("");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [travelRegionIds, setTravelRegionIds] = useState<string[]>([]);
  const [evidenceNote, setEvidenceNote] = useState("");

  // 9.2 — a line's classification is its crew's, so the offered pairs are exactly
  // those present on this target company's roster.
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
  const matchingCrew = crew.filter(
    (worker) => worker.tradeRoleId === tradeRoleId && worker.proficiencyId === proficiencyId,
  );

  function toggleWorker(id: string) {
    setWorkerIds((current) => (current.includes(id) ? current.filter((w) => w !== id) : [...current, id]));
  }
  function toggleTravel(id: string) {
    setTravelRegionIds((current) =>
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id],
    );
  }

  const payload = {
    lines: [
      {
        tradeRoleId,
        proficiencyId,
        locationRegionId,
        availableFrom,
        availableUntil,
        availableDays,
        hoursPerWeek: Number(hoursPerWeek),
        supplierRateCents: toCents(rateDollars),
        workerIds,
        travelRegionIds,
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
          <label className={FIELD_LABEL} htmlFor="cap-classification">
            Trade and proficiency
          </label>
          <select
            id="cap-classification"
            className={INPUT}
            value={tradeRoleId ? `${tradeRoleId}:${proficiencyId}` : ""}
            onChange={(event) => {
              const [t, p] = event.target.value.split(":");
              setTradeRoleId(t ?? "");
              setProficiencyId(p ?? "");
              setWorkerIds([]);
            }}
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
          <p className={FIELD_HINT}>Only classifications this company&rsquo;s roster already carries.</p>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="cap-region">
            Location region
          </label>
          <select
            id="cap-region"
            className={INPUT}
            value={locationRegionId}
            onChange={(event) => setLocationRegionId(event.target.value)}
          >
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="cap-from">
            Available from
          </label>
          <input
            id="cap-from"
            type="date"
            className={`${INPUT} ${MONO}`}
            value={availableFrom}
            onChange={(event) => setAvailableFrom(event.target.value)}
            required
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="cap-until">
            Available until
          </label>
          <input
            id="cap-until"
            type="date"
            className={`${INPUT} ${MONO}`}
            value={availableUntil}
            onChange={(event) => setAvailableUntil(event.target.value)}
            required
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="cap-hours">
            Hours per week
          </label>
          <input
            id="cap-hours"
            type="number"
            min="1"
            max="168"
            step="0.5"
            className={`${INPUT} ${MONO}`}
            value={hoursPerWeek}
            onChange={(event) => setHoursPerWeek(event.target.value)}
            required
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="cap-days">
            Available days (optional)
          </label>
          <input
            id="cap-days"
            type="text"
            className={INPUT}
            placeholder="Mon–Fri"
            value={availableDays}
            onChange={(event) => setAvailableDays(event.target.value)}
          />
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="cap-rate">
            Rate as given, per hour ex GST
          </label>
          <input
            id="cap-rate"
            type="number"
            min="0.01"
            step="0.01"
            className={`${INPUT} ${MONO}`}
            value={rateDollars}
            onChange={(event) => setRateDollars(event.target.value)}
            required
          />
          {/* 9.7 / 5.2 / 20.4 — this is the supplying business's own figure, relayed
              by phone; it is ratified when they accept the resulting match (12.2),
              not decided here. The band, where one exists, is only a reference. */}
          <p className={FIELD_HINT}>
            {tradeRoleId && proficiencyId
              ? (() => {
                  const band = bands[bandKey(tradeRoleId, proficiencyId, locationRegionId)];
                  return band
                    ? `Recommended band ${formatCentsExGst(band.lowCents)} – ${formatCentsExGst(band.highCents)}. Enter the company's own rate as given over the phone.`
                    : "No recommended band for this trade, proficiency and region. Enter the company's own rate as given.";
                })()
              : "The company's own rate as given over the phone — never a figure Maintain sets."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-(--space-2)">
        <span className={FIELD_LABEL}>Crew on this line</span>
        {tradeRoleId === "" ? (
          <p className={FIELD_HINT}>Choose a trade and proficiency first.</p>
        ) : matchingCrew.length === 0 ? (
          <p className={FIELD_HINT}>Nobody on this company&rsquo;s roster carries that classification yet.</p>
        ) : (
          <div className="flex flex-wrap gap-(--space-3)">
            {matchingCrew.map((worker) => (
              <label key={worker.id} className="flex items-center gap-(--space-2) text-body">
                <input
                  type="checkbox"
                  checked={workerIds.includes(worker.id)}
                  onChange={() => toggleWorker(worker.id)}
                />
                {worker.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-(--space-2)">
        <span className={FIELD_LABEL}>Will travel to (optional)</span>
        <div className="flex flex-wrap gap-(--space-3)">
          {regions.map((region) => (
            <label key={region.id} className="flex items-center gap-(--space-2) text-body">
              <input
                type="checkbox"
                checked={travelRegionIds.includes(region.id)}
                onChange={() => toggleTravel(region.id)}
              />
              {region.name}
            </label>
          ))}
        </div>
      </div>

      {lineError ? (
        <p className={FIELD_ERROR} role="alert">
          {lineError}
        </p>
      ) : null}

      {/* 16.1 — mandatory on every concierge write: who was spoken to, and when. */}
      <div className={FIELD}>
        <label className={FIELD_LABEL} htmlFor="cap-evidence">
          Evidence note (required)
        </label>
        <textarea
          id="cap-evidence"
          name="evidence_note"
          className={INPUT}
          rows={2}
          minLength={10}
          placeholder="Spoke to Dana Smith by phone, 27 Aug, confirmed rate and crew."
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
          {pending ? "Saving…" : "List this capacity"}
        </button>
      </div>
    </form>
  );
}
