import Image from "next/image";
import Link from "next/link";
import { ctas, nav } from "@/lib/site";
import { BTN_PRIMARY, NAV_FOCUS } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";

// MarketingNav per the build spec: sticky glass teal, links + login + the
// register CTA. The register button is the header's one amber, so nothing else
// in this bar may take the accent.

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-(--z-sticky) border-b border-hairline bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center justify-between gap-(--space-4) px-(--space-4) max-[389px]:gap-(--space-2) max-[389px]:px-(--space-3) sm:px-(--space-5)">
        {/* The design system's own wordmark lockup, which reads
            "Maintain WORKFORCE" and now matches the product name. */}
        <Link
          href="/"
          className={`inline-flex min-h-11 shrink-0 items-center ${NAV_FOCUS}`}
          aria-label="Maintain Workforce home"
        >
          <Image
            src="/design-system/assets/logo/wordmark-on-dark.svg"
            alt="Maintain Workforce"
            width={170}
            height={36}
            priority
            className="h-7 w-auto max-[359px]:h-6 sm:h-9"
          />
        </Link>

        <nav className="hidden items-center gap-(--space-6) lg:flex">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark ${NAV_FOCUS}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-(--space-3)">
          <Link
            href={ctas.signIn.href}
            className="hidden min-h-11 items-center px-(--space-3) text-sm font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark sm:inline-flex"
          >
            {ctas.signIn.label}
          </Link>
          {/* One button, responsive label: BTN_PRIMARY carries inline-flex, so
              a second hidden/sm:inline-flex copy would fight it for display
              and both would render. The CTA persists at every width (spec). */}
          <Link
            href={ctas.signUp.href}
            className={cn(
              BTN_PRIMARY,
              "whitespace-nowrap px-(--space-4) text-sm max-[389px]:px-(--space-3)",
            )}
          >
            <span className="hidden sm:inline">{ctas.signUp.label}</span>
            <span className="sm:hidden">Register</span>
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
