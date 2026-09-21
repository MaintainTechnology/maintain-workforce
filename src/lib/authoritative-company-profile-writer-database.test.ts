import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

const id = (n: number) => `32323232-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("authoritative company-profile writer on PostgreSQL", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    db = await createTestDatabase();
    await db.query("insert into industry(id,name) values($1,'Civil')", [id(1)]);
    await db.query("insert into region(id,name) values($1,'North'),($2,'South'),($3,'West')", [
      id(10), id(11), id(12),
    ]);
    await db.query(`
      insert into company(
        id,legal_name,industry_id,contact_name,contact_email,contact_phone,primary_region_id,status
      ) values($1,'Authoritative Profile Pty Ltd',$2,'Alex Morgan','alex@example.test',
        '0400000000',$3,'Pending')
    `, [id(20), id(1), id(10)]);
    await db.query(`
      insert into company_user(user_id,company_id,invited_email,accepted_at)
      values('profile-admin',$1,'profile-admin@example.test',now())
    `, [id(20)]);
    await db.query("insert into company_operating_region(company_id,region_id) values($1,$2),($1,$3)", [
      id(20), id(10), id(11),
    ]);
  }, 60_000);

  afterAll(async () => { await db?.close(); });

  it("removes authenticated profile-write privileges and policies while retaining reads", async () => {
    const privileges = await db.query<{
      company_read: boolean;
      region_read: boolean;
      region_insert: boolean;
      region_update: boolean;
      region_delete: boolean;
    }>(`
      select
        has_table_privilege('authenticated','company','SELECT') as company_read,
        has_table_privilege('authenticated','company_operating_region','SELECT') as region_read,
        has_table_privilege('authenticated','company_operating_region','INSERT') as region_insert,
        has_table_privilege('authenticated','company_operating_region','UPDATE') as region_update,
        has_table_privilege('authenticated','company_operating_region','DELETE') as region_delete
    `);
    expect(privileges.rows).toEqual([{
      company_read: true,
      region_read: true,
      region_insert: false,
      region_update: false,
      region_delete: false,
    }]);

    const writableProfileColumns = await db.query<{ column_name: string }>(`
      select a.attname as column_name
        from pg_attribute a
       where a.attrelid='company'::regclass
         and a.attname = any(array[
           'legal_name','trading_name','abn','industry_id','contact_name',
           'contact_email','contact_phone','primary_region_id'
         ])
         and has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE')
       order by a.attname
    `);
    expect(writableProfileColumns.rows).toEqual([]);

    const policies = await db.query<{ policyname: string }>(`
      select policyname from pg_policies
       where schemaname='public'
         and policyname in ('company_own_read','company_own_update','company_region_read','company_region_write')
       order by policyname
    `);
    expect(policies.rows).toEqual([
      { policyname: "company_own_read" },
      { policyname: "company_region_read" },
    ]);
  }, 60_000);

  it("allows tenant reads but rejects direct company and operating-region mutations", async () => {
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: "profile-admin", role: "authenticated" }),
    ]);
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select legal_name from company where id=$1", [id(20)])).rows)
        .toEqual([{ legal_name: "Authoritative Profile Pty Ltd" }]);
      expect((await db.query(
        "select region_id from company_operating_region where company_id=$1 order by region_id", [id(20)],
      )).rows).toEqual([{ region_id: id(10) }, { region_id: id(11) }]);

      await expect(db.query("update company set legal_name='Bypassed' where id=$1", [id(20)]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(db.query(
        "insert into company_operating_region(company_id,region_id) values($1,$2)", [id(20), id(12)],
      )).rejects.toMatchObject({ code: "42501" });
      await expect(db.query(
        "update company_operating_region set region_id=$1 where company_id=$2 and region_id=$3",
        [id(12), id(20), id(11)],
      )).rejects.toMatchObject({ code: "42501" });
      await expect(db.query(
        "delete from company_operating_region where company_id=$1 and region_id=$2", [id(20), id(11)],
      )).rejects.toMatchObject({ code: "42501" });

      expect((await db.query("select legal_name from company where id=$1", [id(20)])).rows)
        .toEqual([{ legal_name: "Authoritative Profile Pty Ltd" }]);
      expect((await db.query(
        "select region_id from company_operating_region where company_id=$1 order by region_id", [id(20)],
      )).rows).toEqual([{ region_id: id(10) }, { region_id: id(11) }]);
    } finally {
      await db.exec("reset role");
    }
  }, 60_000);
});
