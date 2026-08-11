import type { CSSProperties, ReactNode } from "react";

// Server component. No "use client", no Motion, no IntersectionObserver, no
// hydration surface. The reveal is a scroll-driven CSS animation (.mw-reveal in
// globals.css) that enhances content which is already visible.
//
// This replaced a Motion whileInView island. That version branched `initial` on
// useReducedMotion(), which is false on the server and true on a reduced-motion
// client, so every instance threw a hydration mismatch. It also gated content
// visibility on an observer that never fires for skipped elements.
//
// The API is unchanged, so all six pages keep their existing call sites.

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  // Stagger is a shift along the scroll range rather than a time delay: with a
  // view() timeline there is no clock to delay against. Capped so a late item
  // cannot be pushed past its own range and stall.
  const shift = Math.min(Math.round(delay * 120), 30);

  return (
    <div
      className={className ? `mw-reveal ${className}` : "mw-reveal"}
      style={shift ? ({ "--reveal-shift": `${shift}%` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
