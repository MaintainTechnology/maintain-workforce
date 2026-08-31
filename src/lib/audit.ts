import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Audit — spec module 18. App-level, written by this shared helper inside every
// mutating server action. DB triggers are deliberately not used: service-role writes
// carry no user context, so a trigger would lose the actor on exactly the Maintain
// overrides 18.2 requires to be attributable.

/**
 * 18.1 — one reserved, audited system actor for clock-driven transitions (the module
 * 19 executor table). It is the only non-human actor permitted in the trail, which is
 * how 2.2's no-anonymous-actor rule and the daily job coexist.
 */
export const SYSTEM_ACTOR = { system: true } as const;

export type Actor = { userId: string } | typeof SYSTEM_ACTOR;

export async function audit(input: {
  actor: Actor;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const admin = createAdminClient();
  const actor = input.actor;
  const isSystem = "system" in actor;

  const { error } = await admin.from("audit_event").insert({
    actor_user_id: isSystem ? null : actor.userId,
    actor_is_system: isSystem,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.before ?? null,
    after_data: input.after ?? null,
  });
  if (error) {
    throw new Error(`Audit event ${input.action} could not be recorded: ${error.message}`);
  }
}
