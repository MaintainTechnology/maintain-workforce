import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

/** The email a company administrator signs in with. */
export async function userEmail(userId: string): Promise<string | null> {
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch {
    return null;
  }
}

export async function userHasSignedIn(userId: string): Promise<boolean> {
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return Boolean(user.lastSignInAt);
  } catch {
    return false;
  }
}

export async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const { data } = await (await clerkClient()).users.getUserList({
    emailAddress: [email.trim().toLowerCase()],
    limit: 1,
  });
  return data[0] ? { id: data[0].id } : null;
}

/** Clerk sends and owns the tokenized invitation; company binding happens on sign-in. */
export async function inviteAdministrator(
  email: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const invitedEmail = email.trim().toLowerCase();
    const baseUrl =
      process.env.APP_BASE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";
    await (await clerkClient()).invitations.createInvitation({
      emailAddress: invitedEmail,
      redirectUrl: new URL("/signup", baseUrl).toString(),
      ignoreExisting: true,
      expiresInDays: 3, // MVP 1.8: a new invitation expires after 72 hours.
      publicMetadata: { company_id: companyId, invited_email: invitedEmail },
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "invitation failed",
    };
  }
}

/** Remove one-time invitation metadata once its company membership is established. */
export async function consumeCompanyInvitation(userId: string): Promise<void> {
  await (await clerkClient()).users.updateUserMetadata(userId, {
    publicMetadata: { company_id: null, invited_email: null },
  });
}

export async function setMaintainAdmin(userId: string): Promise<void> {
  await (await clerkClient()).users.updateUserMetadata(userId, {
    publicMetadata: { role: "maintain_admin" },
  });
}
