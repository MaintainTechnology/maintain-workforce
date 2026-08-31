import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getUser, isMaintainAdmin, resolveCompanyInvitation } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { H1, PANEL, SECTION, SHELL } from "@/lib/ui";
import { OnboardingForm } from "./onboarding-form";

// Clerk has established the credential before this page renders. This second step
// creates the company and binds it to the signed-in Clerk user.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your company details",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const sessionUser = await getUser();
  if (!sessionUser) redirect("/signup");

  const clerkUser = await currentUser();
  if (isMaintainAdmin(clerkUser?.publicMetadata as Record<string, unknown> | undefined)) {
    redirect("/admin");
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("company_user")
    .select("company_id, accepted_at")
    .eq("user_id", sessionUser.id)
    .maybeSingle();
  if (existing?.accepted_at) redirect("/app");

  // Clerk invitees arrive here after accepting their account invitation. Bind them
  // to the inviting company instead of showing the new-company form.
  if (await resolveCompanyInvitation(sessionUser)) redirect("/app");

  const [industryResult, regionResult] = await Promise.all([
    admin.from("industry").select("id, name").eq("is_active", true).order("name"),
    admin.from("region").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <main className={`${SHELL} ${SECTION}`}>
      <div className="max-w-[640px]">
        <p className="font-semibold text-on-dark-muted">Step 2 of 2</p>
        <h1 className={`${H1} mt-(--space-3)`}>Your company details</h1>
        <p className="mt-(--space-4) text-body text-on-dark-muted">
          Add your ABN now or later. Maintain checks any ABN, insurance and licences
          against the documents you upload. Your company starts Pending and can prepare
          its crew while it waits.
        </p>
        <div className={`${PANEL} mt-(--space-6) p-(--space-6)`}>
          <OnboardingForm
            industries={industryResult.data ?? []}
            regions={regionResult.data ?? []}
          />
        </div>
      </div>
    </main>
  );
}
