import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { createTestDatabase } from "@/test/database";

describe("daily executor on PostgreSQL", () => {
  it("enforces relevant knockouts, inclusive dates, atomic audit/outbox, renewal and idempotence", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec(readFileSync(join(process.cwd(), "supabase/tests/daily_executor.sql"), "utf8"));
    } finally {
      await db.close();
    }
  }, 60_000);
});
