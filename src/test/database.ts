import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

/**
 * Real PostgreSQL execution without Docker or a linked Supabase project. The small
 * bootstrap models Supabase roles and auth/storage helpers; application schema,
 * functions, constraints, grants and RLS come exclusively from the real migrations.
 * This supplements, rather than replaces, the live PostgREST/RLS suite.
 */
export async function createTestDatabase() {
  const db = new PGlite({ extensions: { btree_gist } });
  try {
    await db.exec(readFileSync(join(process.cwd(), "src/test/database-bootstrap.sql"), "utf8"));
    const directory = join(process.cwd(), "supabase/migrations");
    const migrations = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      try {
        await db.exec(readFileSync(join(directory, name), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${name} failed`, { cause: error });
      }
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
