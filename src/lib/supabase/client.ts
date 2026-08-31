import { createBrowserClient } from "@supabase/ssr";

// Browser-side client for interactive MFA only. Credential and recovery forms use
// Server Actions; both clients share @supabase/ssr's cookie-backed PKCE session.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // NEXT_PUBLIC_* values are inlined at build time, so a missing one here means the
    // build itself ran without them — name the fix rather than let supabase-js throw
    // its generic message deeper in.
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.example), then restart the dev server.",
    );
  }
  return createBrowserClient(url, anonKey);
}
