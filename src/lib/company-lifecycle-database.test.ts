import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

describe("company lifecycle on PostgreSQL", () => {
  it("requires a complete current checklist, enforces canonical states, and rolls back the whole cascade", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec(readFileSync(join(process.cwd(), "supabase/tests/company_lifecycle.sql"), "utf8"));
      expect((await db.query<{ count: number }>("select count(*)::int as count from company")).rows[0].count).toBe(0);
    } finally { await db.close(); }
  }, 60_000);
});
