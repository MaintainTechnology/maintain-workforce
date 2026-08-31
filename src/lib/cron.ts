// The module 19 daily clock. Date helpers below are independently testable; the
// authoritative executor is one locked SQL transaction including its audit/outbox.
// Provider delivery happens only after commit and can resume from persisted rows.

import { z } from "zod";
import { addBusinessDays, COMMITTING_STATUSES } from "@/lib/domain/availability";
import type { DocumentStatus } from "@/lib/supabase/types";
import type { NotificationDispatchSummary } from "@/lib/notify";

/** 1.6 / 7.2 — "Expiring Soon" is an expiry within 30 days. */
export const EXPIRY_WARNING_DAYS = 30;
/** 12.1 — a match expires 7 days after proposal, or when the demand window closes. */
export const MATCH_EXPIRY_DAYS = 7;
/** 8.3 — 5 business days without a response escalates a transfer to Admin Review. */
export const TRANSFER_ESCALATION_BUSINESS_DAYS = 5;

/** 12.1 / 9.5 — the open-match set every "open match" reference in the spec means. */
const OPEN_MATCH_STATUSES = ["Awaiting Supplier", "Awaiting Buyer"] as const;
/** 9.5 — an "open capacity line" is one in {Open, Partially Committed}. */
const EXPIRABLE_CAPACITY_STATUSES = ["Open", "Partially Committed", "Fully Committed"] as const;
/** 10.3 — a demand line still consuming the market is Open or Partially Filled. */
const EXPIRABLE_DEMAND_STATUSES = ["Open", "Partially Filled", "Filled"] as const;
/** 8.6 — the two statuses a transfer sits in while it waits on the current employer. */
const AWAITING_TRANSFER_STATUSES = ["Requested", "Awaiting Current Employer"] as const;

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ date rules ---- */

/**
 * 20.5 — availability and engagement windows are calendar dates in Australia/Brisbane.
 * Queensland does not observe daylight saving, so Brisbane is UTC+10 all year and the
 * calendar date is a fixed offset from UTC. No timezone library, no DST edge case.
 */
export function brisbaneToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * 1.6 / 7.1 — the derived credential status. A credential is valid on its expiry date
 * itself (the same "the last day still counts" rule that keeps an engagement committing
 * on its final on-site day, 13.2); it is Expired only once that date has passed.
 * A credential with no recorded expiry never expires — the catalogue decides whether
 * one is mandatory (4.5), not this function.
 */
export function credentialStatus(expiry: string | null, today: string): DocumentStatus {
  if (!expiry) return "Current";
  const remaining = daysBetween(today, expiry.slice(0, 10));
  if (remaining < 0) return "Expired";
  if (remaining <= EXPIRY_WARNING_DAYS) return "Expiring Soon";
  return "Current";
}

export type CredentialRow = { id: string; expiry_date: string | null; status: DocumentStatus };
export type CredentialTransition = { id: string; from: DocumentStatus; to: DocumentStatus };

/**
 * 1.6 / 7.2 — recompute, and report only what actually moved. Because the comparison is
 * against the stored status, repeated runs find nothing to write. Notification
 * eligibility is separate: a newly uploaded record may already have this status.
 */
export function credentialTransitions(
  rows: CredentialRow[],
  today: string,
): CredentialTransition[] {
  const out: CredentialTransition[] = [];
  for (const row of rows) {
    const next = credentialStatus(row.expiry_date, today);
    if (next !== row.status) out.push({ id: row.id, from: row.status, to: next });
  }
  return out;
}

export type CapacityLineRow = { id: string; status: string; available_until: string };

/** 9.5 — a capacity line becomes Expired once available_until passes. */
export function capacityLinesToExpire(lines: CapacityLineRow[], today: string): string[] {
  return lines
    .filter(
      (l) =>
        (EXPIRABLE_CAPACITY_STATUSES as readonly string[]).includes(l.status) &&
        daysBetween(today, l.available_until) < 0,
    )
    .map((l) => l.id);
}

export type DemandLineRow = { id: string; status: string; end_date: string };

/** 10.3 — a demand line becomes Expired once its end date passes. */
export function demandLinesToExpire(lines: DemandLineRow[], today: string): string[] {
  return lines
    .filter(
      (l) =>
        (EXPIRABLE_DEMAND_STATUSES as readonly string[]).includes(l.status) &&
        daysBetween(today, l.end_date) < 0,
    )
    .map((l) => l.id);
}

export type MatchRow = {
  id: string;
  status: string;
  /** timestamptz; the Brisbane calendar date is what the 7-day clock counts. */
  proposed_at: string;
  demand_end: string;
  /** 9.5 — the referenced capacity line's available_until, for the same-run cascade. */
  capacity_until: string;
};

/**
 * 12.1 — a match expires 7 days after proposal OR once the demand line's end date has
 * passed, whichever is first; 9.5 adds the cascade: a capacity line reaching
 * available_until expires, and any open match referencing it expires in the same run.
 *
 * The demand line's START date is deliberately absent. Mid-window proposals — backfill
 * after a cancellation, remainder-fill of a partially filled line — are expected, and a
 * match must never expire merely because the line has already started.
 */
export function matchesToExpire(
  matches: MatchRow[],
  today: string,
): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const match of matches) {
    if (!(OPEN_MATCH_STATUSES as readonly string[]).includes(match.status)) continue;

    const proposedOn = brisbaneToday(new Date(match.proposed_at));
    if (daysBetween(proposedOn, today) >= MATCH_EXPIRY_DAYS) {
      out.push({ id: match.id, reason: `no response within ${MATCH_EXPIRY_DAYS} days of proposal` });
      continue;
    }
    if (daysBetween(today, match.demand_end) < 0) {
      out.push({ id: match.id, reason: "the requirement's end date has passed" });
      continue;
    }
    if (daysBetween(today, match.capacity_until) < 0) {
      out.push({ id: match.id, reason: "the capacity line it references has expired" });
    }
  }
  return out;
}

export type EngagementRow = { id: string; status: string; start_date: string; end_date: string };

/** 13.2 — Confirmed becomes Active once start_date ≤ today. */
export function engagementsToActivate(rows: EngagementRow[], today: string): string[] {
  return rows
    .filter((e) => e.status === "Confirmed" && daysBetween(today, e.start_date) <= 0)
    .map((e) => e.id);
}

/**
 * 13.2 — Active becomes Completed once end_date < today. Strictly less than: the final
 * on-site day stays committing, so a crew is never released while it is still on site.
 */
export function engagementsToComplete(rows: EngagementRow[], today: string): string[] {
  return rows
    .filter((e) => e.status === "Active" && daysBetween(today, e.end_date) < 0)
    .map((e) => e.id);
}

/**
 * 13.2 — an engagement still Awaiting Commercial at its start date is flagged Overdue.
 * Overdue is derived at read time (14.2 highlights it), so the job's only job is to
 * record it once per day; the audit trail carries the idempotency the status column
 * carries everywhere else.
 */
export function engagementsOverdue(
  rows: EngagementRow[],
  today: string,
  alreadyFlaggedToday: Set<string>,
): string[] {
  return rows
    .filter(
      (e) =>
        e.status === "Awaiting Commercial" &&
        daysBetween(today, e.start_date) <= 0 &&
        !alreadyFlaggedToday.has(e.id),
    )
    .map((e) => e.id);
}

export type TransferRow = { id: string; status: string; created_at: string };

/**
 * 8.3 — no response within 5 business days (Monday–Friday, excluding Queensland public
 * holidays from the seeded table) escalates the request to Admin Review.
 */
export function transfersToEscalate(
  rows: TransferRow[],
  today: string,
  holidays: Set<string>,
): string[] {
  return rows
    .filter((t) => (AWAITING_TRANSFER_STATUSES as readonly string[]).includes(t.status))
    .filter((t) => {
      const requestedOn = brisbaneToday(new Date(t.created_at));
      const due = addBusinessDays(requestedOn, TRANSFER_ESCALATION_BUSINESS_DAYS, holidays);
      return daysBetween(today, due) <= 0;
    })
    .map((t) => t.id);
}

export type CronNotificationTarget = {
  to: string;
  companyId: string | null;
  actionPath: string;
};

type CompanyNotificationInput = {
  companyId: string | null | undefined;
  companyEmail: string | null | undefined;
  maintainEmail: string;
};

/** Company recipients can open the company portal; Maintain recipients need admin routes. */
export function companyDocumentNotificationTargets(
  input: CompanyNotificationInput,
): CronNotificationTarget[] {
  const targets: CronNotificationTarget[] = [];
  if (input.companyEmail) {
    targets.push({
      to: input.companyEmail,
      companyId: input.companyId ?? null,
      actionPath: "/app/settings",
    });
  }
  if (input.maintainEmail) {
    targets.push({
      to: input.maintainEmail,
      companyId: null,
      actionPath: "/admin/companies",
    });
  }
  return targets;
}

export function workerQualificationNotificationTargets(
  input: CompanyNotificationInput,
): CronNotificationTarget[] {
  const targets: CronNotificationTarget[] = [];
  if (input.companyEmail) {
    targets.push({
      to: input.companyEmail,
      companyId: input.companyId ?? null,
      actionPath: "/app/workers",
    });
  }
  if (input.maintainEmail) {
    targets.push({
      to: input.maintainEmail,
      companyId: null,
      actionPath: "/admin/workers",
    });
  }
  return targets;
}

export function transferEscalationNotificationTargets(input: {
  companies: Array<{
    companyId: string | null | undefined;
    email: string | null | undefined;
  }>;
  maintainEmail: string;
}): CronNotificationTarget[] {
  const targets = input.companies.flatMap<CronNotificationTarget>((company) =>
    company.email
      ? [
          {
            to: company.email,
            companyId: company.companyId ?? null,
            actionPath: "/app/transfers",
          },
        ]
      : [],
  );
  if (input.maintainEmail) {
    targets.push({
      to: input.maintainEmail,
      companyId: null,
      actionPath: "/admin/transfers",
    });
  }
  return targets;
}


/* ---------------------------------------------------------------------- runner ---- */

const count = z.number().int().nonnegative();
const stateSummarySchema = z.object({
  company_documents_recomputed: count,
  worker_qualifications_recomputed: count,
  capacity_lines_expired: count,
  demand_lines_expired: count,
  matches_expired: count,
  engagements_activated: count,
  engagements_completed: count,
  engagements_flagged_overdue: count,
  transfers_escalated: count,
  nominations_knocked_out: count,
});

export type DailyJobSummary = z.infer<typeof stateSummarySchema> & {
  ran_at: string;
  today: string;
  notifications: NotificationDispatchSummary;
};

function maintainInbox(): string {
  const configured = process.env.MAINTAIN_NOTIFICATION_EMAIL ?? process.env.BOOKING_NOTIFICATION_EMAIL;
  if (configured) return configured;
  try {
    const base = new URL(process.env.APP_BASE_URL ?? "https://maintainworkforce.com.au");
    return `notifications@${base.hostname.replace(/^www\./, "")}`;
  } catch {
    return "notifications@maintainworkforce.com.au";
  }
}

/**
 * The RPC owns all authoritative writes, including knockouts, crew-floor decline,
 * lifecycle/audit coupling and a deduplicated outbox row per event/recipient.
 * A failed transaction sends nothing. Delivery failures never undo the transaction.
 */
export async function runDailyJob(today: string = brisbaneToday()): Promise<DailyJobSummary> {
  const startedAt = performance.now();
  const date = new Date(`${today}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== today) {
    throw new Error("Daily job requires an exact Brisbane calendar date.");
  }
  const [{ createAdminClient }, { dispatchPendingNotifications }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/notify"),
  ]);
  const { data, error } = await createAdminClient().rpc("run_daily_state_transitions", {
    p_today: today,
    p_maintain_email: maintainInbox(),
    p_base_url: process.env.APP_BASE_URL ?? "https://maintainworkforce.com.au",
  });
  if (error) throw new Error(`Daily state transitions failed: ${error.message}`);
  const parsed = stateSummarySchema.safeParse(data);
  if (!parsed.success) throw new Error("Daily state transitions returned an invalid summary.");
  // The route has a 60-second execution limit. Include transaction time when
  // deciding whether there is room for another provider batch (at most 8 seconds).
  const notifications = await dispatchPendingNotifications(45_000 - (performance.now() - startedAt));
  return { ...parsed.data, today, ran_at: new Date().toISOString(), notifications };
}

/** Callers computing currently deployed agree with the canonical 13.0 status set. */
export { COMMITTING_STATUSES };
