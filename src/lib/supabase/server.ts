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
  });
}
