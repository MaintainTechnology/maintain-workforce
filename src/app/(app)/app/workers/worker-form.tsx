"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, Select, TextInput } from "@/components/form";
import { createWorker } from "@/lib/actions/worker";
import { requestTransfer } from "@/lib/actions/transfer";
import { BTN_GHOST, BTN_PRIMARY } from "@/lib/ui";
import { CARD, FIELD_HINT } from "@/lib/platform-ui";

// The worker intake form — spec 6.1–6.4, and the one door into module 8.
//
// 6.2 is the reason this form is worth its own component: when the details collide with
// an existing record the server answers with a single generic sentence, and the only
// thing this screen may offer in response is "Request transfer". It never learns which
// field matched, and it never learns who currently employs the worker.

type Option = { id: string; name: string };

const OPTION_ROW =
  "flex min-h-11 cursor-pointer items-center gap-(--space-3) rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-2) transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-black-3 has-checked:border-teal-mist/60";

export function WorkerForm({
  regions,
  trades,
  proficienciesByTrade,
  skillsByTrade,
  today,
}: {
  regions: Option[];
  trades: Option[];
  proficienciesByTrade: Record<string, Option[]>;
  skillsByTrade: Record<string, Option[]>;
  today: string;
}) {
  const [result, formAction, pending] = useActionState(createWorker, null);
  const [transfer, transferAction, transferPending] = useActionState(requestTransfer, null);
  const [tradeId, setTradeId] = useState("");

  const errors = result?.errors;
  const values = result?.values;
  // 4.2 — only the proficiencies this trade supports, and only its own skills.
  const proficiencies = proficienciesByTrade[tradeId] ?? [];
  const skills = skillsByTrade[tradeId] ?? [];
  // React 19 resets uncontrolled fields after an action, so a failed submit would
  // silently clear every tick. The echoed values re-apply them; the remount key is what
  // makes defaultChecked take effect on the re-render.
  const checkedSkills = new Set((values?.skills ?? "").split(",").filter(Boolean));
  const checkedRegions = new Set((values?.travel_regions ?? "").split(",").filter(Boolean));

  return (
    <div className="flex flex-col gap-(--space-6)">
      {result?.collision ? (
        <div className={CARD} role="alert">
          <p className="text-body font-semibold text-on-dark">{result.message}</p>
          <p className={`mt-(--space-3) ${FIELD_HINT} max-w-[60ch]`}>
            We cannot tell you anything further about that record. If this worker is
            joining your business, request a transfer and we will take it from there.
          </p>

          {transfer ? (
            <p className="mt-(--space-4) text-body text-on-dark" role="status">
              {transfer.message}
            </p>
          ) : (
            <form action={transferAction} className="mt-(--space-4)">
              {/* The worker is resolved server-side from these two fields: no worker id
                  is ever handed to a business that does not employ them (8.1). */}
              <input type="hidden" name="email" value={values?.email ?? ""} />
              <input type="hidden" name="mobile" value={values?.mobile ?? ""} />
              <button type="submit" disabled={transferPending} className={`${BTN_PRIMARY} disabled:opacity-60`}>
                {transferPending ? "Requesting..." : "Request transfer"}
              </button>
            </form>
          )}
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-(--space-5)">
        <div className="grid gap-(--space-5) sm:grid-cols-2">
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
          <p className={FIELD_HINT}>
            Only the levels this trade supports are offered. Maintain can adjust a
            proficiency later, and the change is recorded.
          </p>
        </Field>

        {skills.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-semibold text-on-dark">
              Additional skills (optional)
            </legend>
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

        {/* 6.4 — employment is a dated row, and this is its start. Changing employer
            later never creates a second worker record. */}
        <Field label="Employed by you since" name="start_date" error={errors?.start_date}>
          <TextInput
            name="start_date"
            type="date"
            max={today}
            required
            defaultValue={values?.start_date ?? today}
            error={errors?.start_date}
          />
        </Field>

        {/* 6.3 — consent, recorded against the user who confirms it and the moment they did. */}
        <div>
          <label className={OPTION_ROW}>
            <input type="checkbox" name="consent" className="size-4 accent-teal-mist" />
            <span className="flex-1 text-body text-on-dark">
              This worker has been informed and consents to being listed.
            </span>
          </label>
          {errors?.consent ? (
            <p role="alert" className="mt-(--space-2) flex items-center gap-(--space-2) text-sm font-semibold text-on-dark">
              <span className="size-2 shrink-0 rounded-(--radius-pill) bg-status-critical" aria-hidden="true" />
              {errors.consent}
            </p>
          ) : null}
        </div>

        {result && !result.ok && !result.collision && result.message ? (
          <div role="alert" className={CARD}>
            <p className="text-body text-on-dark">{result.message}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-(--space-3)">
          <button type="submit" disabled={pending} className={`${BTN_PRIMARY} disabled:opacity-60`}>
            {pending ? "Saving..." : "Add worker"}
          </button>
          <Link href="/app/workers" className={BTN_GHOST}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
