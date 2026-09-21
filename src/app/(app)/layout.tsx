import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { WorkspaceHeader, WorkspaceSidebar } from "@/components/workspace-navigation";
import { isMaintainAdmin, requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BTN_GHOST, NAV_FOCUS } from "@/lib/ui";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Maintain Workforce" },
  robots: { index: false, follow: false },   // 2.3 authenticated routes are noindex
};

// Company workspace shell. Both postures live behind one account (3.3): the same
// company sells spare capacity and buys extra, so there is no buyer/supplier mode.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { companyId, companyStatus, user } = await requireCompanyAdmin();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("legal_name, trading_name")
    .eq("id", companyId)
    .maybeSingle();
  const companyName = company?.trading_name?.trim() || company?.legal_name || "Your company";
  const clerkUser = await currentUser();
  const account = {
    companyName,
    companyStatus,
    email: user.email,
    canManageWorkforce: isMaintainAdmin(clerkUser?.publicMetadata as Record<string, unknown> | undefined),
    signOut: (
      <SignOutButton redirectUrl="/signin">
        <button type="button" className={`${BTN_GHOST} w-full px-4 text-sm`}>Sign out</button>
      </SignOutButton>
    ),
  };

  return (
    <div className="mw-workspace flex min-h-dvh bg-ink-teal">
      <a href="#workspace-main" className={`sr-only rounded-(--radius-pill) bg-black-2 px-5 py-3 text-sm font-bold text-on-dark focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-(--z-modal) ${NAV_FOCUS}`}>Skip to workspace content</a>
      <WorkspaceSidebar {...account} />
      <div className="min-w-0 flex-1">
        <WorkspaceHeader {...account} />

        {/* 1.3 — a Pending company can prepare, but cannot list capacity or post
            requirements. The banner is persistent so the state is never a surprise. */}
        {companyStatus === "Pending" && (
          <div className="border-b border-hairline bg-black-2">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-3 text-sm leading-relaxed text-on-dark-muted lg:px-8">
              Verification is in progress. You can add your crew and upload documents now;
              selling and buying capacity opens once Maintain activates the account.
            </div>
          </div>
        )}
        {companyStatus === "Suspended" && (
          <div className="border-b border-hairline bg-black-2">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-3 text-sm leading-relaxed text-on-dark-muted lg:px-8">
              This account is suspended and read-only. Contact Maintain to resolve it.
            </div>
          </div>
        )}
        {companyStatus === "Closed" && (
          <div className="border-b border-hairline bg-black-2">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-3 text-sm leading-relaxed text-on-dark-muted lg:px-8">
              This account is closed and read-only. You can still view your company records.
            </div>
          </div>
        )}

        <main id="workspace-main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-8 outline-none lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
