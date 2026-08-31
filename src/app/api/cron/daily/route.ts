import { runDailyJob } from "@/lib/cron";

// The daily job's entry point — Production readiness: a Vercel Cron hits this path at
// 00:00 Australia/Brisbane (vercel.json schedules it at 14:00 UTC), authenticated with
// CRON_SECRET, and it executes every transition in the module 19 executor table as the
// audited system actor (18.1).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization");

  // An unauthenticated call is rejected, and a deployment with no secret configured
  // rejects everything rather than running the marketplace's clock for anyone who asks.
  if (!secret || presented !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runDailyJob();
  return Response.json(summary);
}
