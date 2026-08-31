import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { consumeCompanyInvitation } from "@/lib/clerk";
import { hasVerifiedClerkSecondFactor } from "@/lib/clerk-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CompanyStatus } from "@/lib/supabase/types";

// Clerk is the identity provider. company_user binds a Clerk user id to one company;
// Maintain staff carry their platform role in Clerk publicMetadata instead.
export type SessionUser = { id: string; email: string };

export type CompanyContext = {
  user: SessionUser;
  companyId: string;
  companyStatus: CompanyStatus;
};

/** Compatibility accessor for code that only needs the verified Clerk session claims. */
export async function getVerifiedClaims(): Promise<Record<string, unknown> | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId || !sessionClaims) return null;
  return sessionClaims as Record<string, unknown>;
}

export async function getUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) return null;
  return { id: userId, email };
}

export function isMaintainAdmin(claims: Record<string, unknown> | undefined): boolean {
  const metadata = (claims?.publicMetadata ?? claims?.metadata ?? claims?.app_metadata) as
    | Record<string, unknown>
    | undefined;
  return (
    claims?.role === "maintain_admin" ||
    claims?.maintain_admin === true ||
    metadata?.role === "maintain_admin"
  );
}

async function hasMaintainAdminRole(): Promise<boolean> {
  const user = await currentUser();
  return isMaintainAdmin(user?.publicMetadata as Record<string, unknown> | undefined);
}

export async function requireCompanyAdmin(): Promise<CompanyContext> {
  const sessionUser = await getUser();
  if (!sessionUser) redirect("/signin");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("company_user")
    .select("company_id, accepted_at, company:company_id (status)")
    .eq("user_id", sessionUser.id)
    .maybeSingle();

  if (!membership) {
    // Clerk invitations place the target company id in backend-controlled metadata.
    // The first authenticated request is when the real Clerk user id can be bound.
    const bound = await resolveCompanyInvitation(sessionUser);
    if (!bound) redirect("/onboarding");
    return {
      user: sessionUser,
      companyId: bound.companyId,
      companyStatus: bound.companyStatus,
    };
  }

  if (!membership.accepted_at) redirect("/accept-invitation");

  const company = membership.company as unknown as { status: CompanyStatus } | null;
  return {
    user: sessionUser,
    companyId: membership.company_id as string,
    companyStatus: company?.status ?? "Pending",
  };
}

export async function resolveCompanyInvitation(
  user: SessionUser,
): Promise<{ companyId: string; companyStatus: CompanyStatus } | null> {
  const clerkUser = await currentUser();
  const invitation = clerkUser?.publicMetadata as
    | { company_id?: string; invited_email?: string }
    | undefined;
  const companyId = invitation?.company_id;
  if (!companyId) return null;
  if (
    invitation.invited_email &&
    invitation.invited_email.trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    return null;
  }

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("company")
    .select("id, status")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return null;

  const { error } = await admin.from("company_user").insert({
    user_id: user.id,
    company_id: companyId,
    invited_email: user.email,
    accepted_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code !== "23505") return null;
    const { data: existing } = await admin
      .from("company_user")
      .select("company_id, accepted_at, invited_email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      existing?.company_id !== companyId ||
      (existing.invited_email &&
        existing.invited_email.trim().toLowerCase() !== user.email.trim().toLowerCase())
    ) {
      return null;
    }
    if (!existing.accepted_at) {
      const { error: acceptanceError } = await admin
        .from("company_user")
        .update({ accepted_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("company_id", companyId);
      if (acceptanceError) return null;
    }
  }

  // Membership is now the durable authority. Metadata is one-use continuation state.
  try {
    await consumeCompanyInvitation(user.id);
  } catch {
    // A later request is still safe: user_id is unique and the existing membership wins.
  }

  return {
    companyId,
    companyStatus: (company.status as CompanyStatus) ?? "Pending",
  };
}

export async function requireWritableCompany(): Promise<CompanyContext> {
  const context = await requireCompanyAdmin();
  if (context.companyStatus === "Pending" || context.companyStatus === "Active") {
    return context;
  }
  throw new Error(
    context.companyStatus === "Closed"
      ? "This company account is closed and cannot be changed."
      : "This company is suspended and has read-only access.",
  );
}

export async function requireActiveCompany(): Promise<CompanyContext> {
  const context = await requireCompanyAdmin();
  if (context.companyStatus !== "Active") {
    throw new Error(
      context.companyStatus === "Pending"
        ? "Verification is still in progress, so this company cannot list capacity or post requirements yet."
        : "This company is suspended and has read-only access.",
    );
  }
  return context;
}

/** Role-only recovery check, used by the MFA enrollment/sign-in-again page. */
export async function requireMaintainAdminAtAal1(): Promise<SessionUser> {
  const sessionUser = await getUser();
  if (!sessionUser) redirect("/signin");
  if (!(await hasMaintainAdminRole())) redirect("/app");
  return sessionUser;
}

export async function requireMaintainAdmin(): Promise<SessionUser> {
  const sessionUser = await requireMaintainAdminAtAal1();
  const [user, { factorVerificationAge }] = await Promise.all([currentUser(), auth()]);
  if (!user?.twoFactorEnabled || !hasVerifiedClerkSecondFactor(factorVerificationAge)) {
    redirect("/admin/mfa");
  }
  return sessionUser;
}

export async function companyIsCompliant(companyId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: required } = await admin
    .from("trade_role_qualification")
    .select("qualification_id, trade_role:trade_role_id (id)")
    .eq("level", "company")
    .eq("is_mandatory", true);

  if (!required || required.length === 0) return true;

  const { data: expired } = await admin
    .from("company_document")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "Expired")
    .limit(1);

  return !expired || expired.length === 0;
}
