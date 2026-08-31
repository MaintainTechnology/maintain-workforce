import Link from "next/link";
import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { requireCompanyAdmin } from "@/lib/auth";
import { BTN_GHOST, SHELL } from "@/lib/ui";
import { pill, toneFor } from "@/lib/platform-ui";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Maintain Workforce" },
  robots: { index: false, follow: false },   // 2.3 authenticated routes are noindex
};

// Company workspace shell. Both postures live behind one account (3.3): the same
// company sells spare capacity and buys extra, so there is no buyer/supplier mode.
const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/workers", label: "Workforce" },
  { href: "/app/capacity", label: "Capacity" },
  { href: "/app/demand", label: "Requirements" },
  { href: "/app/matches", label: "Matches" },
  { href: "/app/engagements", label: "Engagements" },
  { href: "/app/settings", label: "Company" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { companyStatus } = await requireCompanyAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-black">
      <header className="border-b border-hairline bg-ink-teal">
        <div className={`${SHELL} flex flex-wrap items-center gap-(--space-4) py-(--space-3)`}>
          <Link href="/app" className="font-display text-title font-extrabold text-on-dark">
            Maintain Workforce
          </Link>
          <nav aria-label="Workspace" className="flex flex-wrap gap-(--space-4)">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-body font-semibold text-on-dark-muted hover:text-on-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className={`${pill(toneFor(companyStatus))} ml-auto`}>{companyStatus}</span>
          <SignOutButton redirectUrl="/signin">
            <button type="submit" className={BTN_GHOST}>Sign out</button>
          </SignOutButton>
        </div>
      </header>

      {/* 1.3 — a Pending company can prepare, but cannot list capacity or post
          requirements. The banner is persistent so the state is never a surprise. */}
      {companyStatus === "Pending" && (
        <div className="border-b border-hairline bg-black-2">
          <div className={`${SHELL} py-(--space-3) text-body text-on-dark-muted`}>
            Verification is in progress. You can add your crew and upload documents now;
            selling and buying capacity opens once Maintain activates the account.
          </div>
        </div>
      )}
      {companyStatus === "Suspended" && (
        <div className="border-b border-hairline bg-black-2">
          <div className={`${SHELL} py-(--space-3) text-body text-on-dark-muted`}>
            This account is suspended and read-only. Contact Maintain to resolve it.
          </div>
        </div>
      )}

      <main className={`${SHELL} flex-1 py-(--space-6)`}>{children}</main>
    </div>
  );
}
