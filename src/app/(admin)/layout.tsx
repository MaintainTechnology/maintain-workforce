import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { headers } from "next/headers";
import { AdminSidebar, AdminTopBar } from "@/components/admin-navigation";
import { requireMaintainAdmin } from "@/lib/auth";
import { BTN_GHOST_SM, NAV_FOCUS, SHELL } from "@/lib/ui";

export const metadata: Metadata = {
  title: { default: "Maintain admin", template: "%s · Maintain admin" },
  robots: { index: false, follow: false },
};

// Maintain admin portal. Desktop-first at 1280px (Constraints): this is the
// matching workspace, so it takes the same shell as the company workspace — a
// fixed sidebar of destinations, a translucent top bar carrying where you are,
// and a wide main column for registers. Below lg the sidebar folds into the
// top-bar disclosure, so every destination stays reachable without hover.

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // requireMaintainAdmin checks current-session MFA for admins who have enrolled.
  // Running that same gate for /admin/mfa would redirect back here forever while the
  // current session lacks second-factor proof. That route is exempted (the
  // pathname comes from proxy.ts, since layouts get no pathname prop) and does its own
  // claim check instead — see its page.tsx. It also gets no navigation: a session
  // that has not yet proved its second factor is shown the recovery step alone.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname === "/admin/mfa") {
    return (
      <div className="flex min-h-dvh flex-col bg-ink-teal">
        <main className={`${SHELL} flex flex-1 items-center py-(--space-8)`}>{children}</main>
      </div>
    );
  }

  const user = await requireMaintainAdmin();
  const account = {
    email: user.email,
    signOut: (
      <SignOutButton redirectUrl="/signin">
        <button type="button" className={`${BTN_GHOST_SM} w-full`}>Sign out</button>
      </SignOutButton>
    ),
  };

  return (
    <div className="mw-admin flex min-h-dvh bg-ink-teal">
      <a href="#admin-main" className={`sr-only rounded-(--radius-pill) bg-black-2 px-5 py-3 text-sm font-bold text-on-dark focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-(--z-modal) ${NAV_FOCUS}`}>Skip to admin content</a>
      <AdminSidebar {...account} />
      <div className="min-w-0 flex-1">
        <AdminTopBar {...account} />
        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-8 outline-none lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
