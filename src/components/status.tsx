import type { ReactNode } from "react";
import { LABEL } from "@/lib/ui";

// The design system's Dot-and-Label pattern (DESIGN.md): an 8px status dot,
// decorative, beside an uppercase label that carries the meaning. One
// implementation so pages cannot drift.

export function StatusDot({
  label,
  color,
  live = false,
  children,
}: {
  label: string;
  color: string;
  // Adds the slow ping ring, for illustrating "a crew is on this right now"
  // in the job-state panels. The label still carries the meaning; reduced
  // motion kills the ring via the global tokens.css block.
  live?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={`flex items-center gap-(--space-3) ${LABEL}`}>
        <span
          className={`size-2 shrink-0 rounded-(--radius-pill) ${color}${live ? " mw-dot-live" : ""}`}
          aria-hidden="true"
        />
        {label}
      </span>
      {children}
    </>
  );
}
