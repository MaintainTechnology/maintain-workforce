import Link from "next/link";
import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { headers } from "next/headers";
import { requireMaintainAdmin } from "@/lib/auth";
import { BTN_GHOST, SHELL } from "@/lib/ui";

export const metadata: Metadata = {
  title: { default: "Maintain admin", template: "%s · Maintain admin" },
  robots: { index: false, follow: false },
};

// Maintain admin portal. Desktop-first at 1280px (Constraints): this is the
// matching workspace, not a phone surface. 16.3 splits ownership procedurally;
// MVP has a single maintain_admin role, so the nav is not permission-filtered.
const NAV = [
  { href: "/admin", label: "Marketplace" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/workers", label: "Workers" },
  { href: "/admin/matching", label: "Matching" },
  { href: "/admin/engagements", label: "Engagements" },
  { href: "/admin/transfers", label: "Transfers" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/catalogue", label: "Catalogue" },
  { href: "/admin/rates", label: "Rates" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 2.4 — requireMaintainAdmin carries the Clerk session MFA gate, which redirects to
  // /admin/mfa; running that same gate for /admin/mfa itself would redirect back here
  // forever while the current session lacks second-factor proof. That route is exempted (the
  // pathname comes from proxy.ts, since layouts get no pathname prop) and does its own
  // claim check instead — see its page.tsx.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname !== "/admin/mfa") {
    await requireMaintainAdmin();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-black">
      <header className="border-b border-hairline bg-teal-deep">
        <div className={`${SHELL} flex flex-wrap items-center gap-(--space-4) py-(--space-3)`}>
          <Link href="/admin" className="font-display text-title font-extrabold text-on-dark">
            Maintain <span className="text-hi-vis-amber">admin</span>
          </Link>
          <nav aria-label="Maintain admin" className="flex flex-wrap gap-(--space-4)">
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
          <SignOutButton redirectUrl="/signin">
            <button type="submit" className={BTN_GHOST}>Sign out</button>
          </SignOutButton>
        </div>
      </header>
      <main className={`${SHELL} flex-1 py-(--space-6)`}>{children}</main>
    </div>
  );
}
