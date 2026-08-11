import type { ReactNode } from "react";

// Server component, same contract as Reveal: the image is visible by default
// and .mw-reveal-image (globals.css) only enhances it where a view() timeline
// exists.
//
// The Motion version put opacity:0 and a full clip-path inset into the SSR
// HTML and waited on whileInView with once:true, so an image scrolled past
// before the observer fired stayed blank permanently, as did every image for a
// reader without JavaScript. Measured on the sections that used the same
// pattern: 5 of 8 lost on a jump to the bottom, all of them lost with JS off.
//
// API unchanged, so the nine existing call sites across four pages are untouched.

export function RevealImage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `mw-reveal-image ${className}` : "mw-reveal-image"}>
      {children}
    </div>
  );
}
