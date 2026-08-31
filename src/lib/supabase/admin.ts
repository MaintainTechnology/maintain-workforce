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
  });
}
