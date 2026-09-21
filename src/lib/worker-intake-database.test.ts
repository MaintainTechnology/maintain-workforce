import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

// Module 6 worker intake, executed against the real migrations. The other intake
// aggregates have database coverage too. This proves the migrated database contract;
// deployed migration availability is a separate release check.

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });

const fixtureId = (n: number) => `80808080-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CREATE_WORKER = "select create_worker_transactional($1, $2, $3, $4, $5::jsonb) as id";

const workerPayload = (overrides: Record<string, unknown> = {}) => ({
  first_name: "Jordan",
  last_name: "Rivers",
  mobile: "0400 000 111",
  email: "jordan.rivers@example.test",
  base_region_id: fixtureId(2),
  primary_trade_id: fixtureId(5),
  primary_proficiency_id: fixtureId(3),
  start_date: "2026-09-18",
  consent_confirmed: true,
  travel_region_ids: [fixtureId(2)],
  skill_ids: [],
  ...overrides,
});

async function withFixture(companyStatus: string, test: () => Promise<void>) {
  const fixture = readFileSync(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8");
  const end = fixture.indexOf("-- Privilege isolation is tested");
  expect(end).toBeGreaterThan(0);
  await db.exec(fixture.slice(0, end));
  try {
    await db.query("update company set status=$1::company_status where id=$2", [companyStatus, fixtureId(10)]);
    await db.exec("set local role service_role");
    await test();
  } finally {
    await db.exec("rollback");
  }
}

describe("worker intake against the real schema", () => {
  it.each(["Suspended", "Closed"])("keeps %s companies read-only", async (status) => {
    await withFixture(status, async () => {
      await expect(db.query(CREATE_WORKER,
        [fixtureId(10), "user_clerk_test", false, null, JSON.stringify(workerPayload())]))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  it.each(["anon", "authenticated"])("does not allow %s callers to choose an arbitrary company", async (role) => {
    await withFixture("Pending", async () => {
      await db.exec(`set local role ${role}`);
      await expect(db.query(CREATE_WORKER,
        [fixtureId(11), "forged_actor", false, null, JSON.stringify(workerPayload())]))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  it("requires worker consent in the database", async () => {
    await withFixture("Pending", async () => {
      await expect(db.query(CREATE_WORKER, [fixtureId(10), "user_clerk_test", false, null,
        JSON.stringify(workerPayload({ consent_confirmed: false }))]))
        .rejects.toMatchObject({ code: "22023" });
    });
  });

  it("rolls back the worker when employment creation fails", async () => {
    await withFixture("Pending", async () => {
      await db.exec("savepoint worker_attempt");
      // The worker insert precedes this invalid date cast in the employment insert.
      await expect(db.query(CREATE_WORKER, [fixtureId(10), "user_clerk_test", false, null,
        JSON.stringify(workerPayload({ start_date: "2026-02-30" }))]))
        .rejects.toMatchObject({ code: "22008" });
      await db.exec("rollback to savepoint worker_attempt");
      const result = await db.query<{ count: number }>(
        "select count(*)::int as count from worker where email=$1", [workerPayload().email]);
      expect(result.rows[0].count).toBe(0);
    });
  });

  it("keeps collisions existence-only and does not create a second worker", async () => {
    await withFixture("Pending", async () => {
      const args = [fixtureId(10), "user_clerk_test", false, null, JSON.stringify(workerPayload())];
      await db.query(CREATE_WORKER, args);
      await db.exec("savepoint duplicate_attempt");
      await expect(db.query(CREATE_WORKER, args)).rejects.toMatchObject({ code: "23505" });
      await db.exec("rollback to savepoint duplicate_attempt");
      const result = await db.query<{ count: number }>(
        "select count(*)::int as count from worker where email=$1", [workerPayload().email]);
      expect(result.rows[0].count).toBe(1);
    });
  });

  it("records concierge evidence with the worker and consent", async () => {
    await withFixture("Pending", async () => {
      const evidence = "Confirmed consent by phone with the company administrator";
      const result = await db.query<{ id: string }>(CREATE_WORKER,
        [fixtureId(10), "maintain_admin_test", true, evidence, JSON.stringify(workerPayload())]);
      const audit = await db.query<{ actor_user_id: string; after_data: Record<string, unknown> }>(
        "select actor_user_id, after_data from audit_event where entity_id=$1 and action='concierge.worker_created'",
        [result.rows[0].id]);
      expect(audit.rows[0]).toMatchObject({
        actor_user_id: "maintain_admin_test",
        after_data: { company_id: fixtureId(10), admin_entered: true, evidence_note: evidence },
      });
    });
  });

  // 1.3 — a Pending company prepares its crew before verification completes.
  it("creates a worker for a Pending company", async () => {
    await withFixture("Pending", async () => {
      const result = await db.query<{ id: string }>(CREATE_WORKER,
        [fixtureId(10), "user_clerk_test", false, null, JSON.stringify(workerPayload())]);
      expect(result.rows[0].id).toBeTruthy();
    });
  });

  it("creates a worker for an Active company", async () => {
    await withFixture("Active", async () => {
      const result = await db.query<{ id: string }>(CREATE_WORKER,
        [fixtureId(10), "user_clerk_test", false, null, JSON.stringify(workerPayload())]);
      expect(result.rows[0].id).toBeTruthy();
    });
  });

  it("records employment, travel regions, consent and the audit row", async () => {
    await withFixture("Pending", async () => {
      const result = await db.query<{ id: string }>(CREATE_WORKER,
        [fixtureId(10), "user_clerk_test", false, null, JSON.stringify(workerPayload())]);
      const id = result.rows[0].id;
      const saved = await db.query<{
        employments: number; regions: number; audits: number; consent_confirmed_by: string;
      }>(`
        select (select count(*)::int from worker_employment where worker_id=$1 and company_id=$2
                 and end_date is null) as employments,
               (select count(*)::int from worker_travel_region where worker_id=$1) as regions,
               (select count(*)::int from audit_event where entity_id=$1::text
                 and action='worker.created') as audits,
               (select consent_confirmed_by from worker where id=$1) as consent_confirmed_by
      `, [id, fixtureId(10)]);
      expect(saved.rows[0]).toEqual({
        employments: 1, regions: 1, audits: 1, consent_confirmed_by: "user_clerk_test",
      });
    });
  });
});
