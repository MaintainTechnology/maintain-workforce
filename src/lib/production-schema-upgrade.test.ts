import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { expect, it } from "vitest";

const id = (n: number) => `21212121-0000-4000-8000-${String(n).padStart(12, "0")}`;

it("upgrades the observed 005 then 007 database and preserves Pending company intake", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  const directory = join(process.cwd(), "supabase/migrations");
  const migrations = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  // Live on 21 September: 006 was skipped before optional ABN migration 007.
  const previouslyApplied = (name: string) =>
    name < "20260828000600" || name.startsWith("20260828000700_");
  try {
    await db.exec(readFileSync(join(process.cwd(), "src/test/database-bootstrap.sql"), "utf8"));
    for (const name of migrations.filter(previouslyApplied)) {
      await db.exec(readFileSync(join(directory, name), "utf8"));
    }
    const missing = await db.query<{ present: boolean }>(`
      select exists(select 1 from pg_proc where proname='create_worker_transactional') as present
    `);
    expect(missing.rows[0].present).toBe(false);

    await db.query("insert into industry(id,name) values($1,'Upgrade industry')", [id(1)]);
    await db.query("insert into region(id,name) values($1,'Upgrade region')", [id(2)]);
    await db.query("insert into proficiency(id,name,rank) values($1,'Upgrade proficiency',1)", [id(3)]);
    await db.query("insert into trade_role(id,industry_id,name) values($1,$2,'Upgrade trade')", [id(4), id(1)]);
    await db.query("insert into trade_role_proficiency values($1,$2)", [id(4), id(3)]);
    await db.query(`insert into company(id,legal_name,contact_email,status,abn)
      values($1,'Existing company','upgrade@example.test','Pending',null)`, [id(5)]);
    await db.query(`insert into company_user(user_id,company_id,accepted_at)
      values('user_upgrade',$1,now())`, [id(5)]);

    for (const name of migrations.filter((name) => !previouslyApplied(name))) {
      await db.exec(readFileSync(join(directory, name), "utf8"));
    }
    expect((await db.query("select status,abn from company where id=$1", [id(5)])).rows)
      .toEqual([{ status: "Pending", abn: null }]);
    expect((await db.query("select user_id from company_user where company_id=$1", [id(5)])).rows)
      .toEqual([{ user_id: "user_upgrade" }]);

    await db.exec("set role service_role");
    const worker = await db.query<{ id: string }>(
      "select create_worker_transactional($1,'user_upgrade',false,null,$2::jsonb) as id",
      [id(5), JSON.stringify({
        first_name: "Synthetic", last_name: "Worker", mobile: "0400000091",
        email: "upgrade-worker@example.test", base_region_id: id(2),
        primary_trade_id: id(4), primary_proficiency_id: id(3), start_date: "2026-09-20",
        consent_confirmed: true, travel_region_ids: [], skill_ids: [],
      })],
    );
    expect(worker.rows[0].id).toBeTruthy();
    expect((await db.query("select company_id from worker_employment where worker_id=$1", [worker.rows[0].id])).rows)
      .toEqual([{ company_id: id(5) }]);
    expect((await db.query("select action from audit_event where entity_id=$1", [worker.rows[0].id])).rows)
      .toContainEqual({ action: "worker.created" });

    // Installing activation support must not silently approve any existing company.
    await expect(db.query(
      "select transition_company_status_atomic($1,'Pending','Active','user_staff')", [id(5)],
    )).rejects.toThrow("company checklist is incomplete or expired");
    expect((await db.query("select status from company where id=$1", [id(5)])).rows)
      .toEqual([{ status: "Pending" }]);
    await db.exec("reset role");
    // Exercise real verification, activation, audit, status guards and privilege checks
    // after the out-of-order upgrade, not just on an empty schema installed from scratch.
    await db.exec(readFileSync(join(process.cwd(), "supabase/tests/company_lifecycle.sql"), "utf8"));
  } finally {
    await db.close();
  }
}, 60_000);
