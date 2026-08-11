"use client";

import { useActionState } from "react";
import { Field, Honeypot, TextArea, TextInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { submitEnquiry } from "@/lib/actions";
import { site } from "@/lib/site";
import { BTN_PRIMARY, PANEL } from "@/lib/ui";

// The contact form. The server action validates and delivers, so the form
// still works if JavaScript never arrives; useActionState only adds the
// pending state and inline errors on top.

export function EnquiryForm() {
  const [result, formAction, pending] = useActionState(submitEnquiry, null);

  if (result?.ok) {
    // Rare, high-emotion moment: the success card earns the entrance stagger.
    return (
      <div className={`${PANEL} max-w-[560px] p-(--space-6)`}>
        <div className="mw-enter" style={{ "--enter-step": 0 } as React.CSSProperties}>
          <Icon name="i-check" className="size-8 text-primary" />
        </div>
        <h2
          className="mw-enter mt-(--space-4) font-display text-h2 font-bold text-on-dark"
          style={{ "--enter-step": 1 } as React.CSSProperties}
        >
          Enquiry in.
        </h2>
        <p
          className="mw-enter mt-(--space-3) max-w-[52ch] text-body-lg text-on-dark-muted"
          style={{ "--enter-step": 2 } as React.CSSProperties}
        >
          A person on the team answers within [window]. If your question turns
          into a registration, we walk you through it on the same thread.
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

      <Field label="Your name" name="name" error={errors?.name}>
        <TextInput
          name="name"
          autoComplete="name"
          required
          defaultValue={result?.values?.name}
          error={errors?.name}
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

      <Field label="Company (optional)" name="company" error={errors?.company}>
        <TextInput
          name="company"
          autoComplete="organization"
          defaultValue={result?.values?.company}
          error={errors?.company}
        />
      </Field>

      <Field
        label="What do you want to know"
        name="message"
        error={errors?.message}
      >
        <TextArea
          name="message"
          rows={5}
          required
          defaultValue={result?.values?.message}
          error={errors?.message}
        />
      </Field>

      {result && !result.ok && result.message ? (
        /* Delivery failed: say so and hand over the direct channel. The phone
           number is bracketed until launch, so email is the only live link. */
        <div
          role="alert"
          className="rounded-(--radius-md) border border-hairline bg-black-2 p-(--space-4)"
        >
          <p className="text-sm text-on-dark">{result.message}</p>
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
        className={`${BTN_PRIMARY} self-start disabled:opacity-60`}
      >
        <span className={`mw-swap ${pending ? "mw-swap-out" : ""}`}>
          {pending ? "Sending..." : "Send enquiry"}
        </span>
        <Icon name="i-arrow-right" className="size-5" />
      </button>
    </form>
  );
}
