"use client";

import { useActionState, useState } from "react";
import { Field, Honeypot, Select, TextInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { completeCompanyRegistration } from "@/lib/actions/company";
import { isValidAbn, normaliseAbn } from "@/lib/domain/abn";
import { BTN_PRIMARY } from "@/lib/ui";

// Clerk has already created the account. This form collects company information only;
// useActionState adds pending state and inline validation around the server action.

type Option = { id: string; name: string };

const OPTION_ROW =
  "flex min-h-11 cursor-pointer items-center gap-(--space-3) rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-2) transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-black-3 has-checked:border-teal-mist/60";

function GroupError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-(--space-2) flex items-center gap-(--space-2) text-sm font-semibold text-on-dark"
    >
      <span className="size-2 shrink-0 rounded-(--radius-pill) bg-status-critical" aria-hidden="true" />
      {message}
    </p>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="font-display text-h4 font-bold text-on-dark">{children}</legend>
  );
}

export function OnboardingForm({
  industries,
  regions,
}: {
  industries: Option[];
  regions: Option[];
}) {
  const [result, formAction, pending] = useActionState(completeCompanyRegistration, null);
  // ABN is optional during onboarding. When one is supplied, live checksum feedback
  // catches a mistype before submit; the server still re-validates it.
  const [abnTyped, setAbnTyped] = useState("");
  const abnDigits = normaliseAbn(abnTyped);
  const abnLooksWrong = abnDigits.length === 11 && !isValidAbn(abnDigits);

  // Success redirects to /app because Clerk already has an active session.
  const errors = result?.errors;
  const values = result?.values;
  const checkedRegions = (values?.operating_region_ids ?? "").split(",").filter(Boolean);

  return (
    <form action={formAction} className="flex w-full max-w-[640px] flex-col gap-(--space-7)">
      <Honeypot />

      <fieldset className="flex flex-col gap-(--space-5)">
        <Legend>Your company</Legend>

        <Field label="Registered legal name" name="legal_name" error={errors?.legal_name}>
          <TextInput
            name="legal_name"
            autoComplete="organization"
            required
            defaultValue={values?.legal_name}
            error={errors?.legal_name}
          />
        </Field>

        <Field label="Trading name (optional)" name="trading_name" error={errors?.trading_name}>
          <TextInput
            name="trading_name"
            defaultValue={values?.trading_name}
            error={errors?.trading_name}
          />
        </Field>

        <Field label="ABN (optional)" name="abn" error={errors?.abn}>
          <TextInput
            name="abn"
            inputMode="numeric"
            placeholder="51 824 753 556"
            defaultValue={values?.abn}
            error={errors?.abn}
            onChange={(event) => setAbnTyped(event.target.value)}
          />
          {abnLooksWrong && !errors?.abn ? (
            <GroupError
              id="abn-live-error"
              message="This has 11 digits, but it is not a valid ABN. Check it against your ABR record."
            />
          ) : null}
        </Field>

        <Field label="Industry" name="industry_id" error={errors?.industry_id}>
          <Select name="industry_id" required defaultValue={values?.industry_id} error={errors?.industry_id}>
            <option value="">Choose an industry</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Primary location" name="primary_region_id" error={errors?.primary_region_id}>
          <Select
            name="primary_region_id"
            required
            defaultValue={values?.primary_region_id}
            error={errors?.primary_region_id}
          >
            <option value="">Choose a region</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset aria-describedby={errors?.operating_region_ids ? "regions-error" : undefined}>
          <legend className="text-sm font-semibold text-on-dark">Regions you operate in</legend>
          <div className="mt-(--space-2) grid gap-(--space-2) sm:grid-cols-2">
            {regions.map((region) => (
              <label key={`${region.id}-${values?.operating_region_ids ?? ""}`} className={OPTION_ROW}>
                <input
                  type="checkbox"
                  name="operating_region_ids"
                  value={region.id}
                  defaultChecked={checkedRegions.includes(region.id)}
                  className="size-4 accent-teal-mist"
                />
                <span className="flex-1 text-body text-on-dark">{region.name}</span>
              </label>
            ))}
          </div>
          <GroupError id="regions-error" message={errors?.operating_region_ids} />
        </fieldset>
      </fieldset>

      {/* Credentials belong to Clerk and never pass through this company form. */}

      <fieldset className="flex flex-col gap-(--space-5)">
        <Legend>Primary contact</Legend>

        <Field label="Contact name" name="contact_name" error={errors?.contact_name}>
          <TextInput
            name="contact_name"
            autoComplete="name"
            required
            defaultValue={values?.contact_name}
            error={errors?.contact_name}
          />
        </Field>

        <Field label="Contact email" name="contact_email" error={errors?.contact_email}>
          <TextInput
            name="contact_email"
            type="email"
            autoComplete="email"
            required
            defaultValue={values?.contact_email}
            error={errors?.contact_email}
          />
        </Field>

        <Field label="Contact phone" name="contact_phone" error={errors?.contact_phone}>
          <TextInput
            name="contact_phone"
            type="tel"
            autoComplete="tel"
            required
            defaultValue={values?.contact_phone}
            error={errors?.contact_phone}
          />
        </Field>
      </fieldset>

      {result?.message ? (
        <div
          role={result.ok ? "status" : "alert"}
          className="rounded-(--radius-md) border border-hairline bg-black-2 p-(--space-4)"
        >
          <p className="text-sm text-on-dark">{result.message}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${BTN_PRIMARY} w-full disabled:opacity-60 sm:w-auto sm:self-start`}
      >
        <span className={`mw-swap ${pending ? "mw-swap-out" : ""}`}>
          {pending ? "Saving…" : "Create your company"}
        </span>
        <Icon name="i-arrow-right" className="size-5" />
      </button>
    </form>
  );
}
