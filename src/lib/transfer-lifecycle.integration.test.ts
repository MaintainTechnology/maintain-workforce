import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

it("executes transfer SQL rollback, access, state, cascade and escalation regressions on PostgreSQL", async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(readFileSync(join(process.cwd(), "supabase/tests/transfer_lifecycle.sql"), "utf8"));
    const { rows } = await db.query<{ count: number }>("select count(*)::int as count from worker_transfer");
    expect(rows[0].count).toBe(0);
  } finally {
    await db.close();
  }
}, 60_000);

it("executes transfer company snapshot, retry and prelocked escalation regressions on PostgreSQL", async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(readFileSync(join(process.cwd(), "supabase/tests/transfer_company_locks.sql"), "utf8"));
    const { rows } = await db.query<{ count: number }>("select count(*)::int as count from worker_transfer");
    expect(rows[0].count).toBe(0);
  } finally {
    await db.close();
  }
}, 60_000);
