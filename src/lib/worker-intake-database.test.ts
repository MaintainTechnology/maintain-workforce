import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

// Module 6 worker intake, executed against the real migrations. The other intake
// aggregates already have database coverage; create_worker_transactional did not,
// which is how a broken worker create reached production.

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
