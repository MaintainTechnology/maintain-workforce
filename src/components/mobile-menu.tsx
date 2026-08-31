"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ctas, nav } from "@/lib/site";
import { NAV_FOCUS, PANEL } from "@/lib/ui";
import { Icon } from "./icon";

// The header's one client island. A native <details> disclosure in the
// persistent root layout stays open across soft navigations, so this closes it
// whenever the route changes. The panel scales in from its trigger.

export function MobileMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="relative lg:hidden">
      <summary
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-(--radius-pill) border border-hairline text-on-dark [&::-webkit-details-marker]:hidden"
        aria-label="Menu"
      >
        <Icon name="i-menu" className="size-5" />
      </summary>
      {/* The one sanctioned overlay shadow (Lift-Means-Action Rule). */}
      <div
        className={`mw-menu-panel absolute right-0 top-[calc(100%+0.75rem)] w-64 ${PANEL} p-(--space-3) shadow-(--shadow-lg)`}
      >
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block rounded-(--radius-sm) px-(--space-3) py-(--space-3) text-sm font-semibold text-on-dark-muted hover:bg-white/5 hover:text-on-dark ${NAV_FOCUS}`}
          >
            {label}
          </Link>
        ))}
        <Link
          href={ctas.signIn.href}
          className={`mt-(--space-2) block min-h-11 content-center rounded-(--radius-pill) border border-hairline px-(--space-3) text-center text-sm font-semibold text-on-dark ${NAV_FOCUS}`}
        >
          {ctas.signIn.label}
        </Link>
        <Link
          href={ctas.signUp.href}
          className={`mt-(--space-2) block min-h-11 content-center rounded-(--radius-pill) bg-primary px-(--space-3) text-center text-sm font-semibold text-primary-ink focus-visible:bg-amber-tint-2 ${NAV_FOCUS}`}
        >
          {ctas.signUp.label}
        </Link>
      </div>
    </details>
  );
}
