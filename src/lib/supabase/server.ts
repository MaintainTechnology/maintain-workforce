import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase requests carry the active Clerk session token. Supabase's
// Clerk integration validates it and exposes the Clerk user id as auth.jwt()->>'sub'
// for the existing tenant RLS policies.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const { getToken } = await auth();
  return createSupabaseClient(url, anonKey, {
    accessToken: async () => (await getToken({ template: "supabase" })) ?? null,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: reportRejectedSession },
  });
}

/**
 * Supabase answers 401 when it cannot verify the bearer token. With a Clerk session,
 * PostgREST's PGRST301 means the Clerk instance which signed it is not registered under
 * the project's Third-Party Auth, and every RLS-gated read then comes back empty rather
 * than loud. The cause is named on each rejected request, on the one path they all take.
 */
async function reportRejectedSession(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;
  const reason = await rejection(response);
  const issuer = tokenIssuer(init);
  console.error(
    reason.code === "PGRST301"
      ? `[supabase] Rejected the Clerk session token issued by ${issuer} (HTTP 401 PGRST301). ` +
          "Register that Clerk instance under Authentication → Third-Party Auth on the Supabase " +
          "project; until then every RLS-gated read returns nothing."
      : `[supabase] HTTP 401 for a request bearing a token issued by ${issuer}: ${reason.message}. ` +
          "Check the anon key and the session before the Clerk trust settings.",
  );
  return response;
}

/** PostgREST's own account of the refusal, read from a clone so the caller's body is intact. */
async function rejection(response: Response): Promise<{ code: string | null; message: string }> {
  try {
    const body = (await response.clone().json()) as { code?: unknown; message?: unknown };
    return {
      code: typeof body.code === "string" ? body.code : null,
      message: typeof body.message === "string" ? body.message : "no message",
    };
  } catch {
    return { code: null, message: "unreadable response" };
  }
}

/** The `iss` claim of the bearer token, read without verification — this is a log line. */
function tokenIssuer(init?: RequestInit): string {
  try {
    const bearer = new Headers(init?.headers).get("authorization") ?? "";
    const payload = bearer.replace(/^Bearer\s+/i, "").split(".")[1] ?? "";
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss?: unknown };
    return typeof claims.iss === "string" ? claims.iss : "an unknown issuer";
  } catch {
    return "an unknown issuer";
  }
}
