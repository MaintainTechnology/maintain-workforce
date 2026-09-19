import "server-only";
import { createClient } from "@supabase/supabase-js";

// 17.3 — Maintain admin screens run server-side with the service-role key, gated by
// the maintain_admin claim in the app layer. This bypasses RLS by design, so every
// caller must have passed requireMaintainAdmin() first and every mutation must record
// the acting user (18.1). Never import this into a client component.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: reportSchemaDrift },
  });
}

/**
 * Every authoritative mutation is an RPC on this client, and each call site answers a
 * failure with its own "could not be saved. Try again." A function PostgREST cannot find
 * fails exactly that way — permanently, on every retry, naming nothing. That is a
 * migration that never reached the project, not something the operator can retry out of,
 * so the cause is named here, on the one path all 26 RPC call sites take.
 *
 * Mirrors reportRejectedSession in ./server.ts, which does the same for a rejected
 * Clerk session on the anon client.
 */
async function reportSchemaDrift(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok || response.status === 404) return response;

  try {
    const body = (await response.clone().json()) as { code?: unknown; message?: unknown };
    // PGRST202: no such function in the schema cache. PGRST205: no such table.
    if (body.code === "PGRST202" || body.code === "PGRST205") {
      console.error(
        `[supabase] ${String(body.message)} (${String(body.code)}). The database is behind the ` +
          "migrations in supabase/migrations: run `supabase db push`, then reload the PostgREST " +
          "schema cache. Until then this write fails identically on every retry.",
      );
    }
  } catch {
    // A body that is not JSON tells us nothing; the caller still sees the real response.
  }
  return response;
}
