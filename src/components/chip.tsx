import type { ReactNode } from "react";
import { LABEL } from "@/lib/ui";
import { cn } from "@/lib/utils";

// Chips per DESIGN.md addendum: pill shape, hairline border, Label type.
// Every variant stays on the on-dark ramp so chips never spend the amber
// budget; "live" is expressed as the Dot-and-Label pattern (status-active
// dot with the ping), exactly how the system renders every other state.

const BASE = cn(
  "inline-flex min-h-6 items-center gap-(--space-2) rounded-(--radius-pill) border border-hairline px-(--space-3) py-0.5",
  LABEL,
);

const VARIANTS = {
  live: "text-on-dark-muted",
  verified: "text-on-dark-muted",
  neutral: "text-on-dark-faint",
} as const;

export function Chip({
  variant = "neutral",
  dot = false,
  children,
}: {
  variant?: keyof typeof VARIANTS;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cn(BASE, VARIANTS[variant])}>
      {dot ? (
        <span
          className={`size-1.5 shrink-0 rounded-(--radius-pill) ${
            variant === "live" ? "mw-dot-live bg-status-active" : "bg-current"
          }`}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

// Trade code badge (ROOF / PLUMB / CARP / ELEC): Label style on a Black 2 step.
export function TradePill({ code }: { code: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-(--radius-sm) border border-hairline bg-black-2 px-(--space-2) py-0.5",
        LABEL,
        "text-on-dark-muted",
      )}
    >
      {code}
    </span>
  );
}
