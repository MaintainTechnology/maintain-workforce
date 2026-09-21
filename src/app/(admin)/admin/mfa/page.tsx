import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requireMaintainAdminAtAal1 } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/auth-policy";
import { hasVerifiedClerkSecondFactor } from "@/lib/clerk-session";
import { BTN_PRIMARY, H1, SHELL } from "@/lib/ui";

// Recovery for admins who enabled two-factor authentication but whose current session
// has not verified it. Use the role-only guard to avoid redirecting back to this page.
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
  if (!enrolled || hasVerifiedClerkSecondFactor(factorVerificationAge)) redirect(next);

  return (
    <main className={`${SHELL} py-(--space-7)`}>
      <div className="mx-auto w-full max-w-2xl">
        <h1 className={H1}>Two-factor authentication</h1>
        <p className="mt-(--space-4) text-body text-on-dark-muted">
          Two-factor authentication is enabled for your account, but this session has not
          verified a second factor. Sign out and sign in again to verify it before entering
          the admin panel.
        </p>
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
