import { createAdminClient } from "@/lib/supabase/admin";

// Monitoring — Production readiness: "/api/health returns app and database status for
// uptime monitoring". It is part of the launch checklist and the post-promotion smoke
// test, so it stays cheap and unauthenticated: one trivially indexed read, no secrets
// in the response, and a non-200 when the database is unreachable so an uptime probe
// can page on it.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  let database: { status: "up" | "down"; latency_ms: number; error?: string };

  try {
    const { error } = await createAdminClient()
      .from("platform_config")
      .select("key", { head: true, count: "exact" })
      .limit(1);
    if (error) throw new Error(error.message);
    database = { status: "up", latency_ms: Date.now() - startedAt };
  } catch (error) {
    database = {
      status: "down",
      latency_ms: Date.now() - startedAt,
      // The message names the failure without echoing configuration back to the caller.
      error: error instanceof Error ? error.message : "unknown database failure",
    };
  }

  const healthy = database.status === "up";
  return Response.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      app: { status: "up", checked_at: new Date().toISOString() },
      database,
    },
    { status: healthy ? 200 : 503 },
  );
}
