"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TradePill } from "@/components/chip";
import { Field, Honeypot, TextArea, TextInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { registerCompany } from "@/lib/actions";
import { TRADES } from "@/lib/content";
import { site } from "@/lib/site";
import { BTN_PRIMARY, PANEL } from "@/lib/ui";

// The site's primary conversion. The server action validates and delivers, so
// the form works without JavaScript; useActionState adds pending state and
// inline errors. Values are echoed back on every failure (React 19 resets
// uncontrolled fields after an action), and checkbox/radio rows carry a
// remount key off the echoed value so defaultChecked re-applies.

const POSTURES = [
  { value: "need", label: "We need labour" },
  { value: "have", label: "We have labour available" },
  { value: "both", label: "Both, depending on the month" },
] as const;

// Fieldset legends and inline errors mirror the Field primitive's shape with
// the current tokens: critical hue on the dot, text stays readable.
function GroupError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-(--space-2) flex items-center gap-(--space-2) text-sm font-semibold text-on-dark"
    >
      <span
        className="size-2 shrink-0 rounded-(--radius-pill) bg-status-critical"
        aria-hidden="true"
      />
      {message}
    </p>
  );
}

// Hover steps the row up one tonal notch; a checked row holds a teal-mist
// hairline so the selection reads at a glance (state indication, not amber:
// the submit button owns this page's accent).
const OPTION_ROW =
  "flex min-h-11 cursor-pointer items-center gap-(--space-3) rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-2) transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-black-3 has-checked:border-teal-mist/60";

export function RegisterForm() {
  const [result, formAction, pending] = useActionState(registerCompany, null);

  if (result?.ok) {
    // The one submit this page exists for just landed: the success card gets
    // the entrance stagger (rare tier — the delight budget lives here).
    return (
      <div className={`${PANEL} max-w-[560px] p-(--space-6)`}>
        <div className="mw-enter" style={{ "--enter-step": 0 } as React.CSSProperties}>
          <Icon name="i-check" className="size-8 text-primary" />
        </div>
        <h2
          className="mw-enter mt-(--space-4) font-display text-h2 font-bold tracking-(--tracking-display) text-on-dark"
          style={{ "--enter-step": 1 } as React.CSSProperties}
        >
          Registration in.
        </h2>
        <p
          className="mw-enter mt-(--space-3) max-w-[52ch] text-body-lg text-on-dark-muted"
          style={{ "--enter-step": 2 } as React.CSSProperties}
        >
          We verify your ABN, usually within [verification window], and email
          the address you gave once your company is on the board.
        </p>
        <p
          className="mw-enter mt-(--space-5) border-t border-hairline pt-(--space-4) text-body text-on-dark-muted"
          style={{ "--enter-step": 3 } as React.CSSProperties}
        >
          Want to talk first?{" "}
          <Link
            href="/contact"
            className="font-semibold text-on-dark underline underline-offset-4"
          >
            Talk to the team
          </Link>
        </p>
      </div>
    );
  }

  const errors = result?.errors;

  return (
    <form
      action={formAction}
      className="flex w-full max-w-[560px] flex-col gap-(--space-5)"
    >
      <Honeypot />

      <Field label="Company name" name="company" error={errors?.company}>
        <TextInput
          name="company"
          autoComplete="organization"
          required
          defaultValue={result?.values?.company}
          error={errors?.company}
        />
      </Field>

      <Field label="ABN" name="abn" error={errors?.abn}>
        <TextInput
          name="abn"
          inputMode="numeric"
          placeholder="51 824 753 556"
          required
          defaultValue={result?.values?.abn}
          error={errors?.abn}
        />
      </Field>

      <Field label="Who should we speak to" name="contact" error={errors?.contact}>
        <TextInput
          name="contact"
          autoComplete="name"
          required
          defaultValue={result?.values?.contact}
          error={errors?.contact}
        />
      </Field>

      <Field label="Email" name="email" error={errors?.email}>
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={result?.values?.email}
          error={errors?.email}
        />
      </Field>

      <Field label="Phone" name="phone" error={errors?.phone}>
        <TextInput
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          defaultValue={result?.values?.phone}
          error={errors?.phone}
        />
      </Field>

      <fieldset aria-describedby={errors?.trades ? "trades-error" : undefined}>
        <legend className="text-sm font-semibold text-on-dark">Trades</legend>
        <div className="mt-(--space-2) grid gap-(--space-2) sm:grid-cols-2">
          {TRADES.map((t) => (
            <label
              key={`${t.code}-${result?.values?.trades ?? ""}`}
              className={OPTION_ROW}
            >
              <input
                type="checkbox"
                name="trades"
                value={t.name}
                defaultChecked={result?.values?.trades?.includes(t.name) ?? false}
                className="size-4 accent-teal-mist"
              />
              <span className="flex-1 text-body text-on-dark">{t.name}</span>
              <TradePill code={t.code} />
            </label>
          ))}
        </div>
        <GroupError id="trades-error" message={errors?.trades} />
      </fieldset>

      <fieldset aria-describedby={errors?.posture ? "posture-error" : undefined}>
        <legend className="text-sm font-semibold text-on-dark">Right now</legend>
        <div className="mt-(--space-2) grid gap-(--space-2)">
          {POSTURES.map(({ value, label }) => (
            <label
              key={`${value}-${result?.values?.posture ?? ""}`}
              className={OPTION_ROW}
            >
              <input
                type="radio"
                name="posture"
                value={value}
                required
                defaultChecked={result?.values?.posture === value}
                className="size-4 accent-teal-mist"
              />
              <span className="text-body text-on-dark">{label}</span>
            </label>
          ))}
        </div>
        <GroupError id="posture-error" message={errors?.posture} />
      </fieldset>

      <Field label="Where you operate" name="location" error={errors?.location}>
        <TextInput
          name="location"
          placeholder="e.g. Logan and Gold Coast"
          required
          defaultValue={result?.values?.location}
          error={errors?.location}
        />
      </Field>

      <Field label="Anything else (optional)" name="notes" error={errors?.notes}>
        <TextArea
          name="notes"
          rows={4}
          defaultValue={result?.values?.notes}
          error={errors?.notes}
        />
      </Field>

      {result && !result.ok && result.message ? (
        /* Delivery failed: say so and hand over the direct channels. */
        <div
          role="alert"
          className="rounded-(--radius-md) border border-hairline bg-black-2 p-(--space-4)"
        >
          <p className="text-sm text-on-dark">{result.message}</p>
          {/* Email only: the phone number is bracketed until launch, so there
              is no tel: link to render yet (same idiom as the enquiry form). */}
          <a
            href={`mailto:${site.email}`}
            className="mt-(--space-2) inline-flex min-h-11 items-center gap-(--space-2) font-semibold text-on-dark underline underline-offset-4"
          >
            <Icon name="i-mail" className="size-4" />
            {site.email}
          </a>
        </div>
      ) : null}

      {/* The icon stays in both states so the page's one amber button does
          not change width mid-submit. */}
      <button
        type="submit"
        disabled={pending}
        className={`${BTN_PRIMARY} w-full disabled:opacity-60 sm:w-auto sm:self-start`}
      >
        <span className={`mw-swap ${pending ? "mw-swap-out" : ""}`}>
          {pending ? "Registering..." : "Register your company"}
        </span>
        <Icon name="i-arrow-right" className="size-5" />
      </button>
    </form>
  );
}
