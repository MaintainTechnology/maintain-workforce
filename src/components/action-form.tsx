"use client";

import { useActionState } from "react";
import type { FormResult } from "@/lib/actions";
import { BTN_GHOST, BTN_GHOST_SM, BTN_PRIMARY, BTN_PRIMARY_SM } from "@/lib/ui";
import { cn } from "@/lib/utils";

// One client island for every server action that has to report back. The matching and
// engagement screens are server components reading role-scoped projections; this is
// the only thing on them that needs state, so it is the only thing that ships as JS.
//
// 22.3 — the button names the exact outcome and the confirmation answers in the same
// words, so a decision with legal weight never reads as "Submit … Done".

const BUTTON = {
  md: { primary: BTN_PRIMARY, ghost: BTN_GHOST },
  sm: { primary: BTN_PRIMARY_SM, ghost: BTN_GHOST_SM },
} as const;

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  tone = "primary",
  size = "md",
  className,
  children,
}: {
  action: (state: FormResult | null, formData: FormData) => Promise<FormResult>;
  submitLabel: string;
  pendingLabel?: string;
  tone?: "primary" | "ghost";
  /** `sm` for controls that live inside a table row or toolbar. */
  size?: "md" | "sm";
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormResult | null, FormData>(action, null);
  const errors = Object.values(state?.errors ?? {});

  return (
    <form action={formAction} className={cn("flex flex-col gap-(--space-3)", className)}>
      {children}

      {/* Dot-and-Label (DESIGN.md): the outcome hue rides on the dot; the sentence
          stays white so it reads at 4.5:1 on every brand dark. */}
      {state?.message && (
        <Outcome tone={state.ok ? "ok" : "error"} role="status">{state.message}</Outcome>
      )}
      {errors.map((message) => (
        <Outcome key={message} tone="error" role="alert">{message}</Outcome>
      ))}

      <div>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={BUTTON[size][tone]}>
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Outcome({
  tone,
  role,
  children,
}: {
  tone: "ok" | "error";
  role: "status" | "alert";
  children: React.ReactNode;
}) {
  return (
    <p role={role} className="flex items-start gap-(--space-2) text-sm font-semibold text-on-dark">
      <span
        aria-hidden="true"
        className={cn("mt-[0.45em] size-2 shrink-0 rounded-(--radius-pill)", tone === "ok" ? "bg-status-active" : "bg-status-critical")}
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
