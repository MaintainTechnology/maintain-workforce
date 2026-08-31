import Image from "next/image";
import Link from "next/link";
import { ctas, site } from "@/lib/site";
import { LABEL, NAV_FOCUS } from "@/lib/ui";

// Footer per build spec §5: 4 columns — brand blurb, Product, Company, Access.

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#trades", label: "Trades" },
      { href: "/#marketplace", label: "Marketplace" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
  {
    heading: "Access",
    links: [
      { href: ctas.signUp.href, label: ctas.signUp.label },
      { href: ctas.signIn.href, label: ctas.signIn.label },
      { href: "/forgot-password", label: "Forgot password" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-bg-deep">
      <div className="mx-auto grid w-full max-w-[1200px] gap-(--space-7) px-(--space-5) py-(--space-8) md:grid-cols-2 lg:grid-cols-4">
        <div>
          {/* Same lockup as the header. */}
          <Image
            src="/design-system/assets/logo/wordmark-on-dark.svg"
            alt="Maintain Workforce"
            width={152}
            height={32}
          />
          <p className="mt-(--space-4) max-w-[36ch] text-sm text-on-dark-faint">
            {site.tagline}. {site.venture}.
          </p>
          <a
            href={`mailto:${site.email}`}
            className="mt-(--space-4) inline-flex min-h-11 items-center text-sm font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark"
          >
            {site.email}
          </a>
        </div>

        {COLUMNS.map(({ heading, links }) => (
          <nav key={heading} aria-label={heading}>
            <p className={LABEL}>{heading}</p>
            <ul className="mt-(--space-2) flex flex-col">
              {links.map(({ href, label }) => (
                <li key={href}>
                  {/* inline-flex + min-h-11 so the hit area clears the 44px
                      gloved-hand minimum (DESIGN.md §5 Targets); the text
                      itself is only ~20px tall. */}
                  <Link
                    href={href}
                    className={`inline-flex min-h-11 items-center text-sm font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark ${NAV_FOCUS}`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto w-full max-w-[1200px] border-t border-hairline px-(--space-5) py-(--space-5)">
        <p className="text-xs text-on-dark-faint">
          &copy; {new Date().getFullYear()} Maintain Workforce. {site.venture}. All
          rights reserved.
        </p>
      </div>
    </footer>
  );
}
