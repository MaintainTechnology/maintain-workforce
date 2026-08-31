import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

let db: PGlite;
type Claim = { id: string; claim_token: string; attempt: number; body: string; outcome_unknown: boolean };

beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db?.close(); });

async function notification() {
  const id = randomUUID();
  await db.query(`insert into notification(id, trigger, recipient_email, subject, body)
    values ($1, 'test event', 'operations@example.test', 'Stored subject', 'Stored body')`, [id]);
  return id;
}

async function claim(id: string) {
  const result = await db.query<{ claim: Claim | null }>(
    "select claim_queued_notification($1) as claim", [id],
  );
  return result.rows[0].claim;
}

async function finish(id: string, lease: Claim, sent: boolean) {
  const result = await db.query<{ finished: boolean }>(
    "select finish_notification_delivery($1, $2, $3, $4, $5) as finished",
    [id, lease.claim_token, lease.attempt, sent ? "provider-id" : null, sent ? null : "provider failed"],
  );
  return result.rows[0].finished;
}

describe("notification delivery leases on the complete migration chain", () => {
  it("grants dispatch only to service_role and keeps the internal helper private", async () => {
    const result = await db.query(`select
      has_function_privilege('authenticated', 'claim_queued_notification(uuid)', 'EXECUTE') as tenant,
      has_function_privilege('anon', 'finish_notification_delivery(uuid,uuid,integer,text,text)', 'EXECUTE') as anonymous,
      has_function_privilege('service_role', 'claim_queued_notification(uuid)', 'EXECUTE') as service,
      has_function_privilege('service_role', 'claim_notification_delivery_internal(uuid,text,boolean)', 'EXECUTE') as internal,
      has_function_privilege('authenticated', 'record_notification_delivery_uncertain(uuid,uuid,integer,text)', 'EXECUTE') as uncertain_tenant,
      has_function_privilege('anon', 'record_notification_delivery_uncertain(uuid,uuid,integer,text)', 'EXECUTE') as uncertain_anon,
      has_function_privilege('service_role', 'record_notification_delivery_uncertain(uuid,uuid,integer,text)', 'EXECUTE') as uncertain_service`);
    expect(result.rows[0]).toEqual({ tenant: false, anonymous: false, service: true, internal: false,
      uncertain_tenant: false, uncertain_anon: false, uncertain_service: true });
  });

  it("claims a queued event once and marks delivery on that same row", async () => {
    const id = await notification();
    const lease = (await claim(id))!;
    expect(lease).toMatchObject({ id, attempt: 1, body: "Stored body" });
    expect(await claim(id)).toBeNull();
    expect(await finish(id, lease, true)).toBe(true);
    expect(await claim(id)).toBeNull();
    const row = (await db.query<{ attempt_count: number; sent_at: unknown; failed_at: unknown }>("select attempt_count, sent_at, failed_at from notification where id=$1", [id])).rows[0];
    expect(row).toMatchObject({ attempt_count: 1, failed_at: null });
    expect(row.sent_at).not.toBeNull();
  });

  it("recovers an abandoned lease with the same attempt and fences its late worker", async () => {
    const id = await notification();
    const first = (await claim(id))!;
    await db.query("update notification set retry_claimed_at=now()-interval '16 minutes' where id=$1", [id]);
    const recovered = (await claim(id))!;
    expect(recovered.attempt).toBe(first.attempt);
    expect(recovered.outcome_unknown).toBe(true);
    expect(recovered.claim_token).not.toBe(first.claim_token);
    expect(await finish(id, first, false)).toBe(false);
    expect(await finish(id, recovered, true)).toBe(true);
    expect(await finish(id, first, false)).toBe(false);
  });

  it.each(["dispatch", "manual"])("keeps a lost acknowledgement uncertain through %s lease recovery and subsequent failures", async (recovery) => {
    const id = await notification();
    const first = (await claim(id))!;
    expect(first.outcome_unknown).toBe(false);
    // The provider may have accepted the email, but a connection loss prevented
    // finish_notification_delivery from recording that acknowledgement.
    await db.query("update notification set retry_claimed_at=now()-interval '16 minutes' where id=$1", [id]);
    const recovered = recovery === "dispatch" ? (await claim(id))! : (await db.query<{ claim: Claim }>(
      "select claim_notification_retry($1,'user_maintain') as claim", [id],
    )).rows[0].claim;
    expect(recovered).toMatchObject({ attempt: first.attempt, outcome_unknown: true });
    expect(recovered.claim_token).not.toBe(first.claim_token);
    let current = recovered;
    for (const reason of ["RESEND_API_KEY is not configured", "Provider rejected the current request (422)"]) {
      await db.query("select finish_notification_delivery($1,$2,$3,null,$4)", [id, current.claim_token, current.attempt, reason]);
      expect((await db.query<{ attempt_count: number; delivery_outcome_unknown: boolean }>(
        "select attempt_count,delivery_outcome_unknown from notification where id=$1", [id],
      )).rows[0]).toEqual({ attempt_count: 0, delivery_outcome_unknown: true });
      expect(await finish(id, first, true)).toBe(false);
      current = (await db.query<{ claim: Claim }>("select claim_notification_retry($1,'user_maintain') as claim", [id])).rows[0].claim;
      expect(current).toMatchObject({ attempt: first.attempt, outcome_unknown: true });
    }
    expect(await finish(id, current, true)).toBe(true);
    expect((await db.query<{ attempt_count: number; delivery_outcome_unknown: boolean }>(
      "select attempt_count,delivery_outcome_unknown from notification where id=$1", [id],
    )).rows[0]).toEqual({ attempt_count: 1, delivery_outcome_unknown: false });
  });

  it("leaves known failures for an explicit actor-authorized retry", async () => {
    const id = await notification();
    await finish(id, (await claim(id))!, false);
    expect(await claim(id)).toBeNull();
    await expect(db.query("select claim_notification_retry($1, '')", [id])).rejects.toMatchObject({ code: "22023" });
    const result = await db.query<{ claim: Claim }>(
      "select claim_notification_retry($1, 'user_maintain') as claim", [id],
    );
    expect(result.rows[0].claim.attempt).toBe(2);
    expect(await finish(id, result.rows[0].claim, true)).toBe(true);
  });

  it("preserves an uncertain attempt for manual retry while fencing the late provider response", async () => {
    const id = await notification();
    const first = (await claim(id))!;
    const result = await db.query<{ recorded: boolean }>(
      "select record_notification_delivery_uncertain($1,$2,$3,'Delivery outcome is unknown') as recorded",
      [id, first.claim_token, first.attempt],
    );
    expect(result.rows[0].recorded).toBe(true);
    const row = (await db.query<{ attempt_count: number; failed_at: unknown; sent_at: unknown; delivery_claim_token: unknown }>(
      "select attempt_count,failed_at,sent_at,delivery_claim_token from notification where id=$1", [id],
    )).rows[0];
    expect(row).toMatchObject({ attempt_count: 0, sent_at: null, delivery_claim_token: null });
    expect(row.failed_at).not.toBeNull();
    expect(await claim(id)).toBeNull();
    expect(await finish(id, first, true)).toBe(false);
    const retry = (await db.query<{ claim: Claim }>(
      "select claim_notification_retry($1,'user_maintain') as claim", [id],
    )).rows[0].claim;
    expect(retry.attempt).toBe(first.attempt);
    expect(retry.claim_token).not.toBe(first.claim_token);
    expect(await finish(id, retry, true)).toBe(true);
    expect(await finish(id, first, false)).toBe(false);
    const duplicate = await db.query<{ recorded: boolean }>(
      "select record_notification_delivery_uncertain($1,$2,$3,'Late timeout') as recorded",
      [id, first.claim_token, first.attempt],
    );
    expect(duplicate.rows[0].recorded).toBe(false);
  });

  it.each([
    [null, 1, "Unknown outcome"],
    [randomUUID(), 0, "Unknown outcome"],
    [randomUUID(), null, "Unknown outcome"],
    [randomUUID(), 1, " "],
  ])("rejects invalid uncertainty evidence %#", async (token, attempt, reason) => {
    await expect(db.query("select record_notification_delivery_uncertain($1,$2,$3,$4)", [randomUUID(), token, attempt, reason]))
      .rejects.toMatchObject({ code: "22023" });
  });

  it("does not advance the key after an uncertain attempt receives a later provider conflict or local failure", async () => {
    const id = await notification();
    const first = (await claim(id))!;
    await db.query("select record_notification_delivery_uncertain($1,$2,$3,'Initial timeout')", [id, first.claim_token, first.attempt]);
    for (const reason of ["Same provider idempotency key is still in progress", "RESEND_API_KEY is not configured"]) {
      const retry = (await db.query<{ claim: Claim }>("select claim_notification_retry($1,'user_maintain') as claim", [id])).rows[0].claim;
      expect(retry).toMatchObject({ attempt: 1, outcome_unknown: true });
      // Even an older caller that incorrectly labels the outcome as definitive
      // cannot discard the persisted uncertainty or move to a fresh provider key.
      await db.query("select finish_notification_delivery($1,$2,$3,null,$4)", [id, retry.claim_token, retry.attempt, reason]);
      expect((await db.query<{ attempt_count: number; delivery_outcome_unknown: boolean }>(
        "select attempt_count,delivery_outcome_unknown from notification where id=$1", [id],
      )).rows[0]).toEqual({ attempt_count: 0, delivery_outcome_unknown: true });
    }
    const acknowledged = (await db.query<{ claim: Claim }>("select claim_notification_retry($1,'user_maintain') as claim", [id])).rows[0].claim;
    expect(acknowledged.attempt).toBe(1);
    expect(await finish(id, acknowledged, true)).toBe(true);
    expect((await db.query<{ attempt_count: number; delivery_outcome_unknown: boolean }>(
      "select attempt_count,delivery_outcome_unknown from notification where id=$1", [id],
    )).rows[0]).toEqual({ attempt_count: 1, delivery_outcome_unknown: false });
  });
});
