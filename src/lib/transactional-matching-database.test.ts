import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

describe("transactional matching PostgreSQL behavior", () => {
  it("enforces state transitions, ownership, rollback, budget, nominations and renewal rules", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec(readFileSync(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8"));
      expect((await db.query<{ count: number }>("select count(*)::int as count from match")).rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  }, 60_000);
});
