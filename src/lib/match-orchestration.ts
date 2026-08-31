import "server-only";

import { notify, NOTIFICATION_TRIGGERS, type NotifyInput } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

const MAINTAIN_INBOX =
  process.env.MAINTAIN_NOTIFICATION_EMAIL ?? process.env.BOOKING_NOTIFICATION_EMAIL ?? "";

/**
 * Notification-only boundary for committed worker/matching RPC results. This module
 * cannot mutate matches or nominations. A failed lookup/delivery never turns a
 * successfully committed status change into an action failure.
 */
export async function notifyWorkerStatusKnockouts(input: {
  knockedOutMatchIds: string[];
  declinedMatchIds: string[];
  buyerDeclinedMatchIds: string[];
  buyerRenotificationMatchIds: string[];
}): Promise<void> {
  const allIds = [...new Set([
    ...input.knockedOutMatchIds, ...input.declinedMatchIds, ...input.buyerRenotificationMatchIds,
  ])];
  if (allIds.length === 0) return;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("match")
      .select("id, supplier_company_id, buyer_company_id").in("id", allIds);
    if (error) throw new Error("Committed match notification records could not be loaded");
    const declined = new Set(input.declinedMatchIds);
    const buyerDeclined = new Set(input.buyerDeclinedMatchIds);
    const buyerRenotification = new Set(input.buyerRenotificationMatchIds);
    const knockedOut = new Set(input.knockedOutMatchIds);
    const jobs: (() => Promise<unknown>)[] = [];
    const recipients = new Map<string, Promise<string>>();
    function companyEmail(companyId: string): Promise<string> {
      let recipient = recipients.get(companyId);
      if (!recipient) {
        recipient = (async () => {
          const { data, error } = await admin.from("company").select("contact_email").eq("id", companyId).maybeSingle();
          if (error || !data) throw new Error("Match notification recipient could not be loaded");
          return String(data.contact_email);
        })();
        recipients.set(companyId, recipient);
      }
      return recipient;
    }
    function toCompany(companyId: string, input: Omit<NotifyInput, "to" | "companyId">) {
      jobs.push(async () => notify({ ...input, to: await companyEmail(companyId), companyId }));
    }

    for (const row of data ?? []) {
      const matchId = row.id as string;
      const supplierCompanyId = row.supplier_company_id as string;
      const buyerCompanyId = row.buyer_company_id as string;
      if (knockedOut.has(matchId)) {
        toCompany(supplierCompanyId, {
          trigger: NOTIFICATION_TRIGGERS.NOMINATION_KNOCKED_OUT,
          entityType: "match", entityId: matchId,
          subject: "A nomination was knocked out",
          body: declined.has(matchId)
            ? "A nomination is no longer eligible and the match fell below the minimum crew size. Maintain can review a new proposal."
            : "One of your nominations is no longer eligible. Open the match to substitute someone else from the same capacity line.",
          actionPath: `/app/matches/${matchId}`,
        });
      }
      if (buyerRenotification.has(matchId)) {
        toCompany(buyerCompanyId, {
          trigger: NOTIFICATION_TRIGGERS.NOMINATION_KNOCKED_OUT,
          entityType: "match", entityId: matchId,
          subject: "The available crew changed on a match awaiting your decision",
          body: "The available crew on a match awaiting your decision has changed. Open the match to review the current name-free nomination summary before deciding.",
          actionPath: `/app/matches/${matchId}`,
        });
      }
      if (!declined.has(matchId)) continue;
      const companies = [supplierCompanyId];
      if (buyerDeclined.has(matchId)) companies.push(buyerCompanyId);
      for (const companyId of companies) {
        toCompany(companyId, {
          trigger: NOTIFICATION_TRIGGERS.MATCH_AUTO_DECLINED,
          entityType: "match", entityId: matchId,
          subject: "A match was declined automatically",
          body: "A match fell below the minimum crew size and was declined automatically. Maintain can review another proposal.",
          actionPath: "/app/matches",
        });
      }
      jobs.push(() => notify({
        trigger: NOTIFICATION_TRIGGERS.MATCH_AUTO_DECLINED, to: MAINTAIN_INBOX,
        entityType: "match", entityId: matchId,
        subject: "Match auto-declined below minimum crew size",
        body: "Knockouts dropped a match below the minimum crew size and it was declined automatically.",
        actionPath: "/admin/matching",
      }));
    }
    const results = await Promise.allSettled(jobs.map((job) => Promise.resolve().then(job)));
    if (results.some((result) => result.status === "rejected")) {
      console.error("A committed match notification could not be delivered.");
    }
  } catch {
    console.error("Committed match notifications could not be prepared.");
  }
}
