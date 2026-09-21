import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

const id = (n: number) => `31313131-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("Maintain onboarding-profile correction on PostgreSQL", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.query("insert into industry(id,name) values($1,'Civil'),($2,'Resources')", [id(1), id(2)]);
    await db.query("insert into region(id,name) values($1,'North'),($2,'South'),($3,'West')", [
      id(10), id(11), id(12),
    ]);
    await db.query(`
      insert into company(
        id,legal_name,trading_name,abn,industry_id,contact_name,contact_email,
        contact_phone,primary_region_id,status
      ) values($1,'Original Civil Pty Ltd','Original Civil',null,$2,'Alex Morgan',
        'alex@example.test','0400000000',$3,'Pending')
    `, [id(20), id(1), id(10)]);
    await db.query(`
      insert into company_user(user_id,company_id,invited_email,accepted_at)
      values('company-admin',$1,'company-admin@example.test',now())
    `, [id(20)]);
    await db.query("insert into company_operating_region(company_id,region_id) values($1,$2),($1,$3)", [
      id(20), id(10), id(11),
    ]);
  }, 60_000);

  afterEach(async () => { await db.close(); });

  function expectedProfile() {
    return JSON.stringify({
      legal_name: "Original Civil Pty Ltd",
      trading_name: "Original Civil",
      abn: null,
      industry_id: id(1),
      contact_name: "Alex Morgan",
      contact_email: "alex@example.test",
      contact_phone: "0400000000",
      primary_region_id: id(10),
      operating_region_ids: [id(10), id(11)],
    });
  }

  async function update(options: {
    expected?: string;
    regions?: string;
    scope?: "company" | "maintain" | null;
    actor?: string;
    status?: "Pending" | "Active" | null;
    primaryRegion?: string;
  } = {}) {
    return db.query(
      `select update_company_profile_atomic(
        $1,$2::company_status,$3::jsonb,$4,$5,'Updated Civil Pty Ltd','Updated Civil',
        null,$6,'Taylor Morgan','TAYLOR@EXAMPLE.TEST','0411111111',$7,$8::uuid[]
      ) as result`,
      [
        id(20), options.status === undefined ? "Pending" : options.status,
        options.expected ?? expectedProfile(), options.actor ?? "maintain-admin",
        options.scope === undefined ? "maintain" : options.scope, id(2),
        options.primaryRegion ?? id(12), options.regions ?? `{${id(11)},${id(12)}}`,
      ],
    );
  }

  it("atomically saves every profile field, exact regions and a full audit", async () => {
    await db.exec("set role service_role");
    await update();
    await db.exec("reset role");

    expect((await db.query(`
      select legal_name,trading_name,abn,industry_id,contact_name,contact_email,
        contact_phone,primary_region_id,status from company where id=$1
    `, [id(20)])).rows).toEqual([{
      legal_name: "Updated Civil Pty Ltd",
      trading_name: "Updated Civil",
      abn: null,
      industry_id: id(2),
      contact_name: "Taylor Morgan",
      contact_email: "taylor@example.test",
      contact_phone: "0411111111",
      primary_region_id: id(12),
      status: "Pending",
    }]);
    expect((await db.query(
      "select region_id from company_operating_region where company_id=$1 order by region_id", [id(20)],
    )).rows).toEqual([{ region_id: id(11) }, { region_id: id(12) }]);
    const audit = await db.query<{ actor_user_id: string; before_data: Record<string, unknown>; after_data: Record<string, unknown> }>(
      `select actor_user_id,before_data,after_data from audit_event
        where entity_id=$1 and action='company.profile_updated_by_maintain'`, [id(20)],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_user_id: "maintain-admin",
      before_data: { contact_phone: "0400000000", operating_region_ids: [id(10), id(11)] },
      after_data: { contact_phone: "0411111111", operating_region_ids: [id(11), id(12)] },
    });
  }, 60_000);

  it("rejects a stale snapshot without changing data or adding an audit", async () => {
    await db.exec("set role service_role");
    const stale = JSON.parse(expectedProfile());
    stale.contact_phone = "a value that was never displayed";
    await expect(update({ expected: JSON.stringify(stale) })).rejects.toThrow("company profile changed");
    await db.exec("reset role");

    expect((await db.query("select legal_name,contact_phone from company where id=$1", [id(20)])).rows)
      .toEqual([{ legal_name: "Original Civil Pty Ltd", contact_phone: "0400000000" }]);
    expect((await db.query(
      "select count(*)::int as count from audit_event where action='company.profile_updated_by_maintain'",
    )).rows).toEqual([{ count: 0 }]);
  }, 60_000);

  it("rolls back the company update when a new region is unavailable", async () => {
    await db.exec("set role service_role");
    await expect(update({ regions: `{${id(11)},${id(99)}}` })).rejects.toThrow("regions are unavailable");
    await db.exec("reset role");

    expect((await db.query("select legal_name,industry_id from company where id=$1", [id(20)])).rows)
      .toEqual([{ legal_name: "Original Civil Pty Ltd", industry_id: id(1) }]);
    expect((await db.query(
      "select region_id from company_operating_region where company_id=$1 order by region_id", [id(20)],
    )).rows).toEqual([{ region_id: id(10) }, { region_id: id(11) }]);
  }, 60_000);

  it("makes company and Maintain writers share the same stale-write boundary", async () => {
    const displayedToMaintain = expectedProfile();
    await db.exec("set role service_role");
    await update({ scope: "company", actor: "company-admin" });
    await expect(update({ expected: displayedToMaintain })).rejects.toThrow("company profile changed");
    await db.exec("reset role");

    expect((await db.query(
      "select action,actor_user_id from audit_event where entity_id=$1 order by id", [id(20)],
    )).rows).toEqual([{ action: "company.profile_updated", actor_user_id: "company-admin" }]);
  }, 60_000);

  it("allows Active company self-service but keeps Maintain approval editing Pending-only", async () => {
    await db.query("update company set status='Active' where id=$1", [id(20)]);
    await db.exec("set role service_role");
    await expect(update({ status: "Active" })).rejects.toThrow("profile is not writable");
    await update({ status: "Active", scope: "company", actor: "company-admin" });
    await db.exec("reset role");
    expect((await db.query("select status,legal_name from company where id=$1", [id(20)])).rows)
      .toEqual([{ status: "Active", legal_name: "Updated Civil Pty Ltd" }]);
  }, 60_000);

  it("rejects a missing or revoked company membership without changing the profile", async () => {
    await db.exec("set role service_role");
    await expect(update({ scope: "company", actor: "not-a-member" }))
      .rejects.toThrow("company membership changed; sign in again");
    await db.query("update company_user set accepted_at=null where user_id='company-admin'");
    await expect(update({ scope: "company", actor: "company-admin" }))
      .rejects.toThrow("company membership changed; sign in again");
    await db.exec("reset role");

    expect((await db.query("select legal_name,contact_phone from company where id=$1", [id(20)])).rows)
      .toEqual([{ legal_name: "Original Civil Pty Ltd", contact_phone: "0400000000" }]);
    expect((await db.query(
      "select count(*)::int as count from audit_event where action='company.profile_updated'",
    )).rows).toEqual([{ count: 0 }]);
  }, 60_000);

  it("explicitly rejects null actor scope and expected status", async () => {
    await db.exec("set role service_role");
    await expect(update({ scope: null })).rejects.toThrow("a valid profile actor scope is required");
    await expect(update({ status: null })).rejects.toThrow("company profile is not writable in this state");
    await db.exec("reset role");
  }, 60_000);

  it("cannot promote an inactive operating region to primary but can retain it", async () => {
    await db.query("update region set is_active=false where id=$1", [id(11)]);
    await db.exec("set role service_role");
    await expect(update({
      primaryRegion: id(11), regions: `{${id(10)},${id(11)}}`,
    })).rejects.toThrow("primary region is unavailable");
    await update();
    await db.exec("reset role");
    expect((await db.query(
      "select region_id from company_operating_region where company_id=$1 order by region_id", [id(20)],
    )).rows).toEqual([{ region_id: id(11) }, { region_id: id(12) }]);
  }, 60_000);

  it("allows only the service role to execute the profile mutation", async () => {
    await db.exec("set role authenticated");
    await expect(update()).rejects.toThrow(/permission denied/i);
    await db.exec("reset role");
  }, 60_000);
});
