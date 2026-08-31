import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit, SYSTEM_ACTOR } from "@/lib/audit";
import type { LeadIntent } from "@/lib/supabase/types";

// Spec 0.2 route (a) — the marketing site's public capture forms are one of the three
// ways a lead enters the platform. The other two (CSV import, token-authenticated
// webhook) live in the leads module; this is the path a company takes when it fills in
// the form on the website itself.
//
// The insert runs server-side with the service role because there is deliberately no
// anonymous insert policy on `lead` (module 17: lead is Maintain-only), and the person
// filling in the form has no session yet.

/** The marketing form asks which side you are on; 0.2 stores it as the lead's intent. */
const POSTURE_TO_INTENT: Record<string, LeadIntent> = {
  need: "buy",
  have: "sell",
  both: "both",
};

export type CapturedLead = {
  source: string;
  posture: string;
  businessName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  abn?: string;
  tradeInterest?: string;
  notes?: string;
};

/**
 * Records a lead from a public capture form.
 *
 * Never throws: a capture failure must not lose the enquiry the marketing site has
 * already accepted and emailed. A failed insert is reported to the caller so the
 * email path still runs, matching 15.1's rule that a delivery problem never blocks
 * the workflow that triggered it.
 */
export async function captureLead(input: CapturedLead): Promise<{ recorded: boolean }> {
  const intent = POSTURE_TO_INTENT[input.posture] ?? "both";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("lead")
      .insert({
        source: input.source,
        intent,
        contact_name: input.contactName ?? null,
        business_name: input.businessName ?? null,
        abn: input.abn ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        trade_interest: input.tradeInterest ?? null,
        notes: input.notes ?? null,
        status: "New",
      })
      .select("id")
      .single();

    if (error) return { recorded: false };

    await audit({
      actor: SYSTEM_ACTOR,
      action: "lead.captured",
      entityType: "lead",
      entityId: data?.id,
      after: { source: input.source, intent },
    });

    return { recorded: true };
  } catch {
    // Misconfigured environment (no service-role key, no database reachable). The
    // enquiry still reaches Maintain by email; the lead row is the loss, not the lead.
    return { recorded: false };
  }
}
