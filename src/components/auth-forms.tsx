"use client";

import { useActionState } from "react";
import { Field, TextInput } from "@/components/form";
import type { FormResult } from "@/lib/actions";
import {
  acceptInvitation,
  requestPasswordReset,
  resetPassword,
  signIn,
} from "@/lib/actions/auth";
import { BTN_PRIMARY } from "@/lib/ui";

function Message({ state }: { state: FormResult | null }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} aria-live="polite" className="text-body-sm text-on-dark">
      {state.message}
    </p>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-(--space-4)">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email" error={state?.errors?.email}>
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          required
          error={state?.errors?.email}
        />
      </Field>
      <Field label="Password" name="password" error={state?.errors?.password}>
        <TextInput
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state?.errors?.password}
        />
      </Field>
      <Message state={state} />
      <button type="submit" disabled={pending} className={`${BTN_PRIMARY} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(
    requestPasswordReset,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-(--space-4)">
      <Field label="Email" name="email">
        <TextInput name="email" type="email" autoComplete="email" required />
      </Field>
      <Message state={state} />
      <button type="submit" disabled={pending} className={`${BTN_PRIMARY} w-full`}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

function PasswordFields({ state }: { state: FormResult | null }) {
  return (
    <>
      <Field label="New password" name="password" error={state?.errors?.password}>
        <TextInput
          name="password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
          error={state?.errors?.password}
        />
      </Field>
      <Field
        label="Confirm new password"
        name="password_confirmation"
        error={state?.errors?.password_confirmation}
      >
        <TextInput
          name="password_confirmation"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
          error={state?.errors?.password_confirmation}
        />
      </Field>
    </>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(resetPassword, null);
  return (
    <form action={action} className="flex flex-col gap-(--space-4)">
      <PasswordFields state={state} />
      <Message state={state} />
      <button type="submit" disabled={pending} className={`${BTN_PRIMARY} w-full`}>
        {pending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

export function AcceptInvitationForm() {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(
    acceptInvitation,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-(--space-4)">
      <PasswordFields state={state} />
      <Message state={state} />
      <button type="submit" disabled={pending} className={`${BTN_PRIMARY} w-full`}>
        {pending ? "Joining…" : "Set password and join company"}
      </button>
    </form>
  );
}
