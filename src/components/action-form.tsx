"use client";

import { useActionState } from "react";
import type { FormResult } from "@/lib/actions";
import { BTN_GHOST, BTN_PRIMARY } from "@/lib/ui";

// One client island for every server action that has to report back. The matching and
// engagement screens are server components reading role-scoped projections; this is
// the only thing on them that needs state, so it is the only thing that ships as JS.
//
// 22.3 — the button names the exact outcome and the confirmation answers in the same
// words, so a decision with legal weight never reads as "Submit … Done".

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  tone = "primary",
  children,
}: {
  action: (state: FormResult | null, formData: FormData) => Promise<FormResult>;
  submitLabel: string;
  pendingLabel?: string;
  tone?: "primary" | "ghost";
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormResult | null, FormData>(action, null);
  const errors = Object.values(state?.errors ?? {});

  return (
    <form action={formAction} className="flex flex-col gap-(--space-3)">
      {children}

      {state?.message && (
        <p
          role="status"
          className={`text-body-sm ${state.ok ? "text-status-active" : "text-on-dark"}`}
        >
          {!state.ok && (
            <span
              aria-hidden="true"
              className="mr-(--space-2) inline-block size-2 rounded-(--radius-pill) bg-status-critical align-middle"
            />
          )}
          {state.message}
        </p>
      )}
      {errors.map((message) => (
        <p key={message} role="alert" className="text-body-sm text-on-dark">
          <span
            aria-hidden="true"
            className="mr-(--space-2) inline-block size-2 rounded-(--radius-pill) bg-status-critical align-middle"
          />
          {message}
        </p>
      ))}

      <div>
        <button
          type="submit"
          disabled={pending}
          className={tone === "primary" ? BTN_PRIMARY : BTN_GHOST}
        >
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
      </div>
    </form>
  );
}
