import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function confirmationLink(tokenHash: string, type: string): string {
  const url = new URL(
    "/auth/confirm",
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  );
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/accept-invitation");
  return url.toString();
}

/** Expected volume is under 200 companies, so one bounded Auth page is sufficient. */
export async function findUserByEmail(email: string): Promise<User | null> {
  const wanted = normaliseEmail(email);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Supabase user lookup failed: ${error.message}`);
  return data.users.find((user) => normaliseEmail(user.email ?? "") === wanted) ?? null;
}

export async function userEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user.email ?? null;
}

export async function userHasSignedIn(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return false;
  return Boolean(data.user.last_sign_in_at);
}

export type AdministratorInvitation =
  | { ok: true; userId: string; actionLink: string; created: boolean }
  | { ok: false; reason: string };

/**
 * Create a Supabase Auth admin invitation. A pending user receives a fresh magic-link
 * token on reissue because the original invite already created the Auth record; both
 * token types establish the verified session used by /accept-invitation.
 */
export async function inviteAdministrator(
  email: string,
  companyId: string,
  fullName?: string,
): Promise<AdministratorInvitation> {
  const address = normaliseEmail(email);
  const admin = createAdminClient();

  try {
    const existing = await findUserByEmail(address);
    const type = existing ? "magiclink" : "invite";
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email: address,
      options: {
        data: {
          company_id: companyId,
          ...(fullName ? { full_name: fullName } : {}),
        },
        redirectTo: new URL(
          "/accept-invitation",
          process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        ).toString(),
      },
    });

    if (error || !data.user || !data.properties) {
      return { ok: false, reason: error?.message ?? "invitation failed" };
    }

    return {
      ok: true,
      userId: data.user.id,
      actionLink: confirmationLink(
        data.properties.hashed_token,
        data.properties.verification_type,
      ),
      created: !existing,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invitation failed" };
  }
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Supabase auth user ${userId} could not be removed: ${error.message}`);
}
