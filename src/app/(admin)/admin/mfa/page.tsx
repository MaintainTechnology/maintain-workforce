import type { Metadata } from "next";
import { SignOutButton, UserProfile } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requireMaintainAdminAtAal1 } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/auth-policy";
import { hasVerifiedClerkSecondFactor } from "@/lib/clerk-session";
import { BTN_PRIMARY, H1, PANEL, SHELL } from "@/lib/ui";

// 2.4 — mandatory second factor for maintain_admin. This page deliberately does its
// own role check instead of calling requireMaintainAdmin, which redirects here when a
// enrollment or current-session proof is missing and would therefore loop.
export const metadata: Metadata = {
  title: "Two-factor authentication",
  robots: { index: false, follow: false },
};

export default async function AdminMfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaintainAdminAtAal1();
  const [user, { factorVerificationAge }, params] = await Promise.all([
    currentUser(),
    auth(),
    searchParams,
  ]);
  let next = safeRedirectPath(
    typeof params.next === "string" ? params.next : undefined,
    "/admin",
  );
  try {
    if (/^\/admin\/mfa(?:[/?#]|$)/.test(decodeURIComponent(next))) next = "/admin";
  } catch {
    next = "/admin";
  }
  const enrolled = Boolean(user?.twoFactorEnabled);
  if (enrolled && hasVerifiedClerkSecondFactor(factorVerificationAge)) redirect(next);

  return (
    <main className={`${SHELL} py-(--space-7)`}>
      <div className="mx-auto w-full max-w-2xl">
        <h1 className={H1}>Two-factor authentication</h1>
        <p className="mt-(--space-4) text-body text-on-dark-muted">
          {enrolled
            ? "Two-factor authentication is enabled, but this session has not verified a second factor. Sign out and sign in again with Clerk to verify it before entering the admin workspace."
            : "Maintain admin accounts require two-step verification. Open Security below and enable an authenticator factor. Once enabled, sign out and sign in again to verify your session."}
        </p>
        {!enrolled ? (
          <div className={`${PANEL} mt-(--space-5) p-(--space-5)`}>
            <UserProfile routing="hash" />
          </div>
        ) : null}
        <div className="mt-(--space-5)">
          <SignOutButton redirectUrl={`/signin?redirect_url=${encodeURIComponent(next)}`}>
            <button type="button" className={BTN_PRIMARY}>
              Sign out and verify again
            </button>
          </SignOutButton>
        </div>
      </div>
    </main>
  );
}
