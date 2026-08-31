import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });

describe("initial credential warning outbox", () => {
  it("warns for already-derived initial statuses exactly once per credential expiry occurrence", async () => {
    const fixture = readFileSync(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8");
    await db.exec(fixture.slice(0, fixture.indexOf("create function pg_temp.matching_propose")));
    try {
      await db.exec(`
        insert into worker_qualification(id,worker_id,qualification_id,status,expiry_date,file_path)
        values(pg_temp.matching_id(501),pg_temp.matching_id(20),pg_temp.matching_id(6),'Expiring Soon','2026-09-30','fixture/ticket.pdf');
        insert into company_document(id,company_id,doc_type,status,expiry_date,file_path)
        values(pg_temp.matching_id(502),pg_temp.matching_id(10),'public_liability','Expiring Soon','2026-09-30','fixture/insurance.pdf');
      `);
      const run = (day: string) => db.query("select run_daily_state_transitions($1::date,'maintain@example.test','https://app.example.test')", [day]);
      const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from notification")).rows[0].n;
      await run("2026-08-31");
      expect(await count()).toBe(4); // Company and Maintain for each credential.
      await run("2026-08-31");
      await run("2026-09-01");
      expect(await count()).toBe(4); // No daily reminder spam for the same warning.
      await run("2026-10-01");
      expect(await count()).toBe(8); // Expiry is a separate event from its warning.
      await run("2026-10-02");
      expect(await count()).toBe(8);
      await db.exec("update worker_qualification set expiry_date='2026-11-15',status='Expiring Soon' where id=pg_temp.matching_id(501)");
      await run("2026-10-16");
      expect(await count()).toBe(10); // A renewed date creates a new warning occurrence.
    } finally { await db.exec("rollback"); }
  });
});
