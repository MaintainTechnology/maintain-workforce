"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// A native <details> used as a menu needs the dismissals a menu is expected to
// have: outside pointer, Escape, focus leaving, route change, and the viewport
// growing past the breakpoint where the disclosure no longer exists. One hook so
// the workspace and admin shells behave identically.
export function useDismissableDetails(desktopQuery = "(min-width: 1024px)") {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  function close(restoreFocus = false) {
    const details = detailsRef.current;
    if (!details?.open) return;
    details.open = false;
    if (restoreFocus) summaryRef.current?.focus();
  }

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  useEffect(() => {
    function dismissOnPointer(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        const focusInside = details.contains(document.activeElement);
        details.open = false;
        if (focusInside) summaryRef.current?.focus();
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
        summaryRef.current?.focus();
        event.preventDefault();
      }
    }

    function dismissOnFocus(event: FocusEvent) {
      if (detailsRef.current?.open && event.target instanceof Node && !detailsRef.current.contains(event.target)) {
        detailsRef.current.open = false;
      }
    }

    const desktop = window.matchMedia(desktopQuery);
    function dismissOnDesktop() {
      if (desktop.matches && detailsRef.current) detailsRef.current.open = false;
    }

    document.addEventListener("pointerdown", dismissOnPointer);
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("focusin", dismissOnFocus);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOnPointer);
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("focusin", dismissOnFocus);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, [desktopQuery]);

  return { detailsRef, summaryRef, pathname, close };
}
