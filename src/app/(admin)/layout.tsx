import Link from "next/link";
import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { headers } from "next/headers";
import { AdminNavigation } from "@/components/admin-navigation";
import { requireMaintainAdmin } from "@/lib/auth";
import { BTN_GHOST, NAV_FOCUS, SHELL } from "@/lib/ui";

export const metadata: Metadata = {
  title: { default: "Maintain admin", template: "%s · Maintain admin" },
  robots: { index: false, follow: false },
};

// Maintain admin portal. Desktop-first at 1280px (Constraints): this is the
// matching workspace. Navigation wraps on smaller screens so every destination
// remains available without relying on hover or a horizontally clipped header.

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // requireMaintainAdmin checks current-session MFA for admins who have enrolled.
  // Running that same gate for /admin/mfa would redirect back here forever while the
  // current session lacks second-factor proof. That route is exempted (the
  // pathname comes from proxy.ts, since layouts get no pathname prop) and does its own
  // claim check instead — see its page.tsx.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname !== "/admin/mfa") {
    await requireMaintainAdmin();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-teal">
      <header className="border-b border-hairline bg-teal-deep">
        <div className={`${SHELL} flex min-h-[68px] flex-wrap items-center justify-between gap-(--space-4) py-(--space-3)`}>
          <Link href="/admin" className={`inline-flex min-h-11 items-center font-display text-h3 font-extrabold text-on-dark ${NAV_FOCUS}`}>
            Maintain admin
          </Link>
          <SignOutButton redirectUrl="/signin">
            <button type="submit" className={BTN_GHOST}>Sign out</button>
          </SignOutButton>
        </div>
        <div className={`${SHELL} pb-(--space-3)`}>
          <AdminNavigation />
        </div>
      </header>
      <main className={`${SHELL} flex-1 py-(--space-6)`}>{children}</main>
    </div>
  );
}
