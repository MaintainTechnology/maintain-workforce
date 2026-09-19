"use client";

import { useActionState, useState } from "react";
import { Field, Select, TextArea, TextInput } from "@/components/form";
import { conciergeCreateWorker } from "@/lib/actions/concierge";
import { CARD, FIELD, FIELD_ERROR } from "@/lib/platform-ui";
import { BTN_PRIMARY } from "@/lib/ui";

// 16.1 concierge worker intake — the same 6.1–6.4 rules as the company's own form
// (worker.ts / worker-form.tsx). Unlike the company path, a collision here has no
// transfer control to offer inline: module 8's requestTransfer is scoped to the
// requesting company's own admin session, which a Maintain admin acting on a
// target company's behalf does not have — so the message tells the admin to relay
// the transfer request to the company instead of wiring a control that would need
// to impersonate one.

type Option = { id: string; name: string };

const OPTION_ROW =
  "flex min-h-11 cursor-pointer items-center gap-(--space-3) rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-2) transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-black-3 has-checked:border-teal-mist/60";

export function ConciergeWorkerForm({
  companyId,
  regions,
  trades,
  proficienciesByTrade,
  skillsByTrade,
  today,
}: {
  companyId: string;
  regions: Option[];
  trades: Option[];
  proficienciesByTrade: Record<string, Option[]>;
  skillsByTrade: Record<string, Option[]>;
  today: string;
}) {
  const [result, formAction, pending] = useActionState(conciergeCreateWorker, null);
  const [tradeId, setTradeId] = useState("");

  const errors = result?.errors;
  const values = result?.values;
  const proficiencies = proficienciesByTrade[tradeId] ?? [];
  const skills = skillsByTrade[tradeId] ?? [];
  const checkedSkills = new Set((values?.skills ?? "").split(",").filter(Boolean));
  const checkedRegions = new Set((values?.travel_regions ?? "").split(",").filter(Boolean));

  return (
    <div className="flex flex-col gap-(--space-5)">
      {result?.collision ? (
        <div className={CARD} role="alert">
          <p className="text-body font-semibold text-on-dark">{result.message}</p>
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-(--space-5)">
        <input type="hidden" name="company_id" value={companyId} />

        <div className="grid gap-(--space-4) sm:grid-cols-2">
          <Field label="First name" name="first_name" error={errors?.first_name}>
            <TextInput
              name="first_name"
              autoComplete="off"
              required
              defaultValue={values?.first_name}
              error={errors?.first_name}
            />
          </Field>
          <Field label="Last name" name="last_name" error={errors?.last_name}>
            <TextInput
              name="last_name"
              autoComplete="off"
              required
              defaultValue={values?.last_name}
              error={errors?.last_name}
            />
          </Field>
          <Field label="Mobile" name="mobile" error={errors?.mobile}>
            <TextInput
              name="mobile"
              type="tel"
              inputMode="tel"
              placeholder="0400 000 000"
              required
              defaultValue={values?.mobile}
              error={errors?.mobile}
            />
          </Field>
          <Field label="Email" name="email" error={errors?.email}>
            <TextInput
              name="email"
              type="email"
              required
              defaultValue={values?.email}
              error={errors?.email}
            />
          </Field>
        </div>

        <Field label="Base region" name="base_region_id" error={errors?.base_region_id}>
          <Select name="base_region_id" required defaultValue={values?.base_region_id ?? ""} error={errors?.base_region_id}>
            <option value="">Choose a region</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Primary trade" name="primary_trade_id" error={errors?.primary_trade_id}>
          <Select
            name="primary_trade_id"
            required
            value={tradeId}
            onChange={(event) => setTradeId(event.target.value)}
            error={errors?.primary_trade_id}
          >
            <option value="">Choose a trade</option>
            {trades.map((trade) => (
              <option key={trade.id} value={trade.id}>
                {trade.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Primary proficiency" name="primary_proficiency_id" error={errors?.primary_proficiency_id}>
          <Select
            name="primary_proficiency_id"
            required
            disabled={proficiencies.length === 0}
            defaultValue={values?.primary_proficiency_id ?? ""}
            error={errors?.primary_proficiency_id}
          >
            <option value="">{tradeId ? "Choose a proficiency" : "Choose a trade first"}</option>
            {proficiencies.map((proficiency) => (
              <option key={proficiency.id} value={proficiency.id}>
                {proficiency.name}
              </option>
            ))}
          </Select>
        </Field>

        {skills.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-semibold text-on-dark">Additional skills (optional)</legend>
            <div className="mt-(--space-2) grid gap-(--space-2) sm:grid-cols-2">
              {skills.map((skill) => (
                <label key={`${skill.id}-${values?.skills ?? ""}`} className={OPTION_ROW}>
                  <input
                    type="checkbox"
                    name="skills"
                    value={skill.id}
                    defaultChecked={checkedSkills.has(skill.id)}
                    className="size-4 accent-teal-mist"
                  />
                  <span className="flex-1 text-body text-on-dark">{skill.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset>
          <legend className="text-sm font-semibold text-on-dark">
            Regions this worker will travel to (optional)
          </legend>
          <div className="mt-(--space-2) grid gap-(--space-2) sm:grid-cols-2">
            {regions.map((region) => (
              <label key={`${region.id}-${values?.travel_regions ?? ""}`} className={OPTION_ROW}>
                <input
                  type="checkbox"
                  name="travel_regions"
                  value={region.id}
                  defaultChecked={checkedRegions.has(region.id)}
                  className="size-4 accent-teal-mist"
                />
                <span className="flex-1 text-body text-on-dark">{region.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Employed by that company since" name="start_date" error={errors?.start_date}>
          <TextInput
            name="start_date"
            type="date"
            max={today}
            required
            defaultValue={values?.start_date ?? today}
            error={errors?.start_date}
          />
        </Field>

        {/* 6.3 / 16.1 — the admin confirms the company has told the worker and
            obtained consent by phone or email; it is not Maintain's consent to give. */}
        <div className={FIELD}>
          <label className={OPTION_ROW} key={`consent-${values?.consent ?? ""}`}>
            <input
              type="checkbox"
              name="consent"
              defaultChecked={values?.consent === "on"}
              className="size-4 accent-teal-mist"
            />
            <span className="flex-1 text-body text-on-dark">
              The company confirms this worker has been informed and consents to being listed.
            </span>
          </label>
          {errors?.consent ? (
            <p role="alert" className={FIELD_ERROR}>
              {errors.consent}
            </p>
          ) : null}
        </div>

        {/* 16.1 — mandatory on every concierge write: who was spoken to, and when. */}
        <Field label="Evidence note (required)" name="evidence_note" error={errors?.evidence_note}>
          <TextArea
            name="evidence_note"
            rows={2}
            minLength={10}
            placeholder="Spoke to site manager, 27 Aug, confirmed details and consent."
            defaultValue={values?.evidence_note}
            required
            error={errors?.evidence_note}
          />
        </Field>

        {result && !result.ok && !result.collision && result.message ? (
          <div role="alert" className={CARD}>
            <p className="text-body text-on-dark">{result.message}</p>
          </div>
        ) : null}

        <div>
          <button type="submit" disabled={pending} className={`${BTN_PRIMARY} disabled:opacity-60`}>
            {pending ? "Saving..." : "Add worker"}
          </button>
        </div>
      </form>
    </div>
  );
}
