import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit, SYSTEM_ACTOR } from "@/lib/audit";
import { normaliseAbn } from "@/lib/domain/abn";
import { createAdminClient } from "@/lib/supabase/admin";

// 0.2 route (c) — the single inbound lead webhook. One POST, token-authenticated via
// LEAD_WEBHOOK_TOKEN, with the payload contract below as the platform's own zod schema
// committed to the repo: whatever funnel tool Open Question 9 lands on must meet it.
//
// Rate limiting is by Vercel WAF / IP rules at the edge (2.4), not in this handler —
// a serverless function cannot hold a counter, and pretending otherwise would be
// security theatre.

export const dynamic = "force-dynamic";

/** The lead fields of 0.2. ABN is optional at capture; it becomes mandatory to qualify (0.3). */
const leadWebhookSchema = z.object({
  source: z.string().trim().max(120).optional(),
  intent: z.enum(["sell", "buy", "both"]),
  contact_name: z.string().trim().max(200).optional(),
  business_name: z.string().trim().max(200).optional(),
  abn: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  trade_interest: z.string().trim().max(200).optional(),
  /** Headcount or requirement notes — one free-text field, per 0.2. */
  notes: z.string().trim().max(4000).optional(),
  funnel_score: z.string().trim().max(40).optional(),
});

/** Compare digests, not the raw strings: equal-length buffers, no early exit, no length leak. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function presentedToken(request: NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return request.headers.get("x-webhook-token") ?? "";
}

export async function POST(request: NextRequest) {
  const expected = process.env.LEAD_WEBHOOK_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const presented = presentedToken(request);
  if (!presented || !tokenMatches(presented, expected)) {
    // An untokened request is rejected outright — the definition-of-done tests for it.
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = leadWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload does not meet the lead contract.", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  // 0.2 — lead inserts run server-side only; there is no anonymous insert policy, so the
  // service-role client is the only writer and this token is the trust boundary.
  const admin = createAdminClient();
  const { data: lead, error } = await admin
    .from("lead")
    .insert({
      ...parsed.data,
      source: parsed.data.source ?? "webhook",
      abn: parsed.data.abn ? normaliseAbn(parsed.data.abn) : null,
      status: "New",
    })
    .select("id")
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "Could not record the lead." }, { status: 500 });
  }

  // The reserved system actor (18.1): a machine-to-machine intake has no human to name.
  await audit({
    actor: SYSTEM_ACTOR,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    after: { source: parsed.data.source ?? "webhook", intent: parsed.data.intent },
  });

  return NextResponse.json({ id: lead.id, status: "New" }, { status: 201 });
}
