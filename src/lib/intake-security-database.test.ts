import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });

const fixtureId = (n: number) => `80808080-0000-4000-8000-${String(n).padStart(12, "0")}`;
const capacityPayload = (from = "2030-01-01", until = "2030-01-07", worker = 20) => ({
  lines: [{
    trade_role_id: fixtureId(5), proficiency_id: fixtureId(3),
    available_from: from, available_until: until, hours_per_week: 40,
    location_region_id: fixtureId(2), supplier_rate_cents: 5000,
    worker_ids: [fixtureId(worker)], travel_region_ids: [fixtureId(2)],
  }],
});
const demandPayload = (from = "2030-01-01") => ({
  name: "Intake test project", industry_id: fixtureId(1), work_region_id: fixtureId(2),
  lines: [{
    trade_role_id: fixtureId(5), proficiency_id: fixtureId(3), quantity: 1,
    start_date: from, end_date: "2030-01-07", hours_per_week: 40,
    skill_ids: [], qualification_ids: [fixtureId(6)],
  }],
});

async function withIntakeFixture(test: () => Promise<void>) {
  const fixture = readFileSync(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8");
  const end = fixture.indexOf("-- Privilege isolation is tested");
  expect(end).toBeGreaterThan(0);
  await db.exec(fixture.slice(0, end));
  try {
    await db.exec(`
      insert into company_user(user_id, company_id, accepted_at)
      values ('intake_supplier', pg_temp.matching_id(10), now()),
             ('intake_buyer', pg_temp.matching_id(11), now());
    `);
    await test();
  } finally {
    await db.exec("rollback");
  }
}

async function expectSqlError(sql: string, params: unknown[], code: string) {
  await db.exec("savepoint intake_expected_error");
  try {
    await expect(db.query(sql, params)).rejects.toMatchObject({ code });
  } finally {
    await db.exec("rollback to intake_expected_error");
    await db.exec("release savepoint intake_expected_error");
  }
}

const createCapacitySql = "select create_capacity_listing_transactional($1, $2, $3, $4, $5::jsonb) as id";
const createDemandSql = "select create_demand_request_transactional($1, $2, $3, $4, $5::jsonb) as id";

const dateEditCases = [
  {
    kind: "capacity", user: "intake_supplier", id: fixtureId(31),
    sql: `select update_company_capacity_line($1,$2::date,$3::date,'Changed days',40,6000,
      array['${fixtureId(20)}']::uuid[],array['${fixtureId(2)}']::uuid[])`,
    snapshotSql: `select jsonb_build_object('line',to_jsonb(l),
      'workers',(select jsonb_agg(to_jsonb(w) order by w.worker_id) from capacity_line_worker w where w.capacity_line_id=l.id),
      'regions',(select jsonb_agg(to_jsonb(r) order by r.region_id) from capacity_line_travel_region r where r.capacity_line_id=l.id),
      'audits',(select jsonb_agg(to_jsonb(a) order by a.id) from audit_event a where a.entity_id=l.id::text)) as state
      from capacity_line l where l.id=$1`,
    datesSql: "select available_from::text as start_date,available_until::text as end_date from capacity_line where id=$1",
  },
  {
    kind: "demand", user: "intake_buyer", id: fixtureId(41),
    sql: `select update_company_demand_line($1,2,$2::date,$3::date,40,'Changed needs',
      '{}'::uuid[],array['${fixtureId(6)}']::uuid[])`,
    snapshotSql: `select jsonb_build_object('line',to_jsonb(l),
      'skills',(select jsonb_agg(to_jsonb(s) order by s.skill_id) from demand_line_skill s where s.demand_line_id=l.id),
      'qualifications',(select jsonb_agg(to_jsonb(q) order by q.qualification_id) from demand_line_qualification q where q.demand_line_id=l.id),
      'audits',(select jsonb_agg(to_jsonb(a) order by a.id) from audit_event a where a.entity_id=l.id::text)) as state
      from demand_line l where l.id=$1`,
    datesSql: "select start_date::text,end_date::text from demand_line where id=$1",
  },
];

describe("authoritative intake and nomination boundaries", () => {
  it.each([
    "capacity_listing", "capacity_line", "capacity_line_worker", "capacity_line_travel_region",
    "demand_request", "demand_line", "demand_line_skill", "demand_line_qualification",
  ])("does not permit partial/direct tenant inserts into %s", async (table) => {
    const result = await db.query<{ column_name: string }>(`
      select a.attname as column_name from pg_attribute a
      where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
        and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
          or has_column_privilege('anon', a.attrelid, a.attnum, 'INSERT'))
    `, [table]);
    expect(result.rows).toEqual([]);
  });

  it("advances the buyer's nomination version when a worker status knocks out a nominee", async () => {
    const fixture = readFileSync(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8");
    const fixtureEnd = fixture.indexOf("-- Privilege isolation is tested");
    expect(fixtureEnd).toBeGreaterThan(0);
    await db.exec(fixture.slice(0, fixtureEnd));
    try {
      await db.exec(`
        insert into company_user(user_id, company_id, accepted_at)
        values('worker_status_supplier', pg_temp.matching_id(10), now());
        select set_config('request.jwt.claims', '{"sub":"worker_status_supplier","role":"authenticated"}', true);
      `);
      const proposed = await db.query<{ id: string }>("select pg_temp.matching_propose(array[20,21]) as id");
      const matchId = proposed.rows[0].id;
      await db.query("select pg_temp.matching_supplier($1,array[20,21])", [matchId]);
      const before = await db.query<{ nomination_version: number }>("select nomination_version from match where id=$1", [matchId]);
      await db.exec("set local role authenticated");
      await db.exec("select set_company_worker_status(pg_temp.matching_id(20),'Active','Inactive')");
      await db.exec("reset role");
      const after = await db.query<{ nomination_version: number; status: string }>(
        "select nomination_version, status from match where id=$1", [matchId],
      );
      expect(after.rows[0].status).toBe("Awaiting Buyer");
      expect(after.rows[0].nomination_version).toBe(before.rows[0].nomination_version + 1);
    } finally {
      await db.exec("rollback");
    }
  });

  it.each([
    "create_capacity_listing_transactional(uuid,text,boolean,text,jsonb)",
    "update_company_capacity_line(uuid,date,date,text,numeric,bigint,uuid[],uuid[])",
  ])("locks companies and worker rows before capacity advisory locks in %s", async (signature) => {
    const result = await db.query<{ source: string }>(
      "select pg_get_functiondef($1::regprocedure) as source", [signature],
    );
    const source = result.rows[0].source;
    const workerLock = source.indexOf("perform lock_match_workers(");
    expect(workerLock).toBeGreaterThan(0);
    expect(source.indexOf("for share")).toBeGreaterThan(0);
    expect(source.indexOf("for share")).toBeLessThan(workerLock);
    expect(source.indexOf("hashtextextended(")).toBeGreaterThan(workerLock);
  });

  it("creates an Active company's complete capacity aggregate and freezes author provenance", async () => {
    await withIntakeFixture(async () => {
      await db.exec("set local role service_role");
      const payload = { ...capacityPayload(), admin_entered: true, evidence_note: "forged" };
      const result = await db.query<{ id: string }>(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, "ignored", JSON.stringify(payload)]);
      const id = result.rows[0].id;
      const saved = await db.query<{ admin_entered: boolean; evidence_note: string | null; created_by: string }>(
        "select admin_entered,evidence_note,created_by from capacity_listing where id=$1", [id],
      );
      expect(saved.rows[0]).toEqual({ admin_entered: false, evidence_note: null, created_by: "intake_supplier" });
      const children = await db.query<{ workers: number; regions: number; audits: number }>(`
        select (select count(*)::int from capacity_line_worker w join capacity_line l on l.id=w.capacity_line_id
          where l.listing_id=$1) as workers,
          (select count(*)::int from capacity_line_travel_region r join capacity_line l on l.id=r.capacity_line_id
          where l.listing_id=$1) as regions,
          (select count(*)::int from audit_event where entity_id=$1::text and action='capacity.created') as audits
      `, [id]);
      expect(children.rows[0]).toEqual({ workers: 1, regions: 1, audits: 1 });
    });
  });

  it("rolls back every capacity row when the final audit fails", async () => {
    await withIntakeFixture(async () => {
      await db.exec(`
        create function pg_temp.fail_intake_audit() returns trigger language plpgsql as $$
        begin
          if new.action='capacity.created' then raise exception 'injected audit error' using errcode='23514'; end if;
          return new;
        end;
        $$;
        create trigger fail_intake_audit before insert on audit_event
          for each row execute function pg_temp.fail_intake_audit();
        set local role service_role;
      `);
      await expectSqlError(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, JSON.stringify(capacityPayload())], "23514");
      const rows = await db.query<{ total: number }>("select count(*)::int as total from capacity_listing");
      expect(rows.rows[0].total).toBe(1);
      const leaked = await db.query("select id from capacity_line where available_from='2030-01-01'");
      expect(leaked.rows).toEqual([]);
    });
  });

  it("rejects inclusive overlapping worker windows without leaving a second aggregate", async () => {
    await withIntakeFixture(async () => {
      await db.exec("set local role service_role");
      await db.query(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, JSON.stringify(capacityPayload())]);
      await expectSqlError(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, JSON.stringify(capacityPayload("2030-01-07", "2030-01-14"))], "23514");
      const rows = await db.query<{ total: number }>("select count(*)::int as total from capacity_listing");
      expect(rows.rows[0].total).toBe(2);
    });
  });

  it.each(["Pending", "Suspended", "Closed"])("denies capacity and demand intake for a %s company", async (status) => {
    await withIntakeFixture(async () => {
      await db.query("update company set status=$1::company_status where id=any($2::uuid[])",
        [status, [fixtureId(10), fixtureId(11)]]);
      await db.exec("set local role service_role");
      await expectSqlError(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, JSON.stringify(capacityPayload())], "42501");
      await expectSqlError(createDemandSql,
        [fixtureId(11), "intake_buyer", false, null, JSON.stringify(demandPayload())], "42501");
    });
  });

  it("requires concierge evidence and records the trusted actor instead of payload provenance", async () => {
    await withIntakeFixture(async () => {
      await db.exec("set local role service_role");
      await expectSqlError(createDemandSql,
        [fixtureId(11), "maintain_test", true, "short", JSON.stringify(demandPayload())], "22023");
      const result = await db.query<{ id: string }>(createDemandSql,
        [fixtureId(11), "maintain_test", true, "Written buyer instruction", JSON.stringify({ ...demandPayload(), created_by: "forged" })]);
      const row = await db.query<{ created_by: string; admin_entered: boolean; evidence_note: string }>(
        "select created_by,admin_entered,evidence_note from demand_request where id=$1", [result.rows[0].id],
      );
      expect(row.rows[0]).toEqual({ created_by: "maintain_test", admin_entered: true, evidence_note: "Written buyer instruction" });
    });
  });

  it("rejects ambiguous non-ISO JSON dates before creating intake rows", async () => {
    await withIntakeFixture(async () => {
      await db.exec("set local role service_role");
      await expectSqlError(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, JSON.stringify(capacityPayload("2030-1-01"))], "22023");
      await expectSqlError(createDemandSql,
        [fixtureId(11), "intake_buyer", false, null, JSON.stringify(demandPayload("2030-1-01"))], "22023");
    });
  });

  it.each([null, {}, { lines: null }])("rejects a missing aggregate shape: %j", async (payload) => {
    await withIntakeFixture(async () => {
      await db.exec("set local role service_role");
      await expectSqlError(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, payload === null ? null : JSON.stringify(payload)], "22023");
      await expectSqlError(createDemandSql,
        [fixtureId(11), "intake_buyer", false, null, payload === null ? null : JSON.stringify(payload)], "22023");
    });
  });

  it.each([
    "update_company_demand_line(uuid,integer,date,date,numeric,text,uuid[],uuid[])",
    "withdraw_company_capacity_line(uuid)",
    "withdraw_company_demand_line(uuid)",
  ])("locks tenant status and membership before changing line state in %s", async (signature) => {
    const result = await db.query<{ source: string }>(
      "select pg_get_functiondef($1::regprocedure) as source", [signature],
    );
    const source = result.rows[0].source;
    expect(source.indexOf("for share of c, cu")).toBeGreaterThan(0);
    expect(source.indexOf("for share of c, cu")).toBeLessThan(source.indexOf("for update"));
  });

  it("enforces the worker-status actor, rollback, crew-floor and buyer-version contract", async () => {
    await withIntakeFixture(async () => {
      await db.exec(readFileSync(join(process.cwd(), "supabase/tests/tenant_worker_status.sql"), "utf8"));
    });
  });

  it("allows an Active tenant's capacity edit and audits old/new memberships and rate provenance", async () => {
    await withIntakeFixture(async () => {
      await db.exec(`
        update capacity_line set rate_entered_by_admin=true, rate_ratified_at=now()
          where id=pg_temp.matching_id(31);
        select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
        set local role authenticated;
      `);
      await db.query(`select update_company_capacity_line($1,'2030-01-01','2030-01-07',
        'Monday to Friday',40,6000,$2::uuid[],$3::uuid[])`,
      [fixtureId(31), [fixtureId(20), fixtureId(21)], [fixtureId(2)]]);
      const line = await db.query<{ rate_entered_by: string; rate_entered_by_admin: boolean; rate_ratified_at: null }>(
        "select rate_entered_by,rate_entered_by_admin,rate_ratified_at from capacity_line where id=$1", [fixtureId(31)],
      );
      expect(line.rows[0]).toEqual({ rate_entered_by: "intake_supplier", rate_entered_by_admin: false, rate_ratified_at: null });
      await db.exec("reset role");
      const audit = await db.query<{ before_data: { worker_ids: string[] }; after_data: { worker_ids: string[] } }>(`
        select before_data,after_data from audit_event where action='capacity.line_edited' and entity_id=$1
      `, [fixtureId(31)]);
      expect(audit.rows[0].before_data.worker_ids).toEqual([fixtureId(20), fixtureId(21), fixtureId(22)]);
      expect(audit.rows[0].after_data.worker_ids).toEqual([fixtureId(20), fixtureId(21)]);
    });
  });

  it("allows demand requirement replacement and records the previous qualification set", async () => {
    await withIntakeFixture(async () => {
      await db.exec(`
        insert into demand_line_qualification(demand_line_id,qualification_id)
          values(pg_temp.matching_id(41),pg_temp.matching_id(6));
        select set_config('request.jwt.claims', '{"sub":"intake_buyer","role":"authenticated"}', true);
        set local role authenticated;
      `);
      await db.query(`select update_company_demand_line($1,2,'2030-01-01','2030-01-07',
        40,'Updated needs','{}'::uuid[],$2::uuid[])`, [fixtureId(41), [fixtureId(7)]]);
      const qualifications = await db.query<{ qualification_id: string }>(
        "select qualification_id from demand_line_qualification where demand_line_id=$1", [fixtureId(41)],
      );
      expect(qualifications.rows).toEqual([{ qualification_id: fixtureId(7) }]);
      await db.exec("reset role");
      const audit = await db.query<{ before_data: { qualification_ids: string[] }; after_data: { qualification_ids: string[] } }>(`
        select before_data,after_data from audit_event where action='demand.line_edited' and entity_id=$1
      `, [fixtureId(41)]);
      expect(audit.rows[0].before_data.qualification_ids).toEqual([fixtureId(6)]);
      expect(audit.rows[0].after_data.qualification_ids).toEqual([fixtureId(7)]);
    });
  });

  it("rolls back demand replacement children together with a failed final audit", async () => {
    await withIntakeFixture(async () => {
      await db.exec(`
        insert into demand_line_qualification(demand_line_id,qualification_id)
          values(pg_temp.matching_id(41),pg_temp.matching_id(6));
        create function pg_temp.fail_demand_edit_audit() returns trigger language plpgsql as $$
        begin
          if new.action='demand.line_edited' then raise exception 'injected audit error' using errcode='23514'; end if;
          return new;
        end;
        $$;
        create trigger fail_demand_edit_audit before insert on audit_event
          for each row execute function pg_temp.fail_demand_edit_audit();
        select set_config('request.jwt.claims', '{"sub":"intake_buyer","role":"authenticated"}', true);
        set local role authenticated;
      `);
      await expectSqlError(`select update_company_demand_line($1,2,'2030-01-01','2030-01-07',
        40,'Updated needs','{}'::uuid[],$2::uuid[])`, [fixtureId(41), [fixtureId(7)]], "23514");
      const qualifications = await db.query<{ qualification_id: string }>(
        "select qualification_id from demand_line_qualification where demand_line_id=$1", [fixtureId(41)],
      );
      expect(qualifications.rows).toEqual([{ qualification_id: fixtureId(6) }]);
      const line = await db.query<{ quantity: number }>("select quantity from demand_line where id=$1", [fixtureId(41)]);
      expect(line.rows[0].quantity).toBe(4);
    });
  });

  it("permits authenticated withdrawals once while denying direct inserts and create RPC access", async () => {
    await withIntakeFixture(async () => {
      await db.exec(`
        select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
        set local role authenticated;
      `);
      await expectSqlError("insert into capacity_listing(company_id,created_by) values($1,$2)",
        [fixtureId(10), "intake_supplier"], "42501");
      await expectSqlError(createCapacitySql,
        [fixtureId(10), "intake_supplier", false, null, JSON.stringify(capacityPayload())], "42501");
      await db.query("select withdraw_company_capacity_line($1)", [fixtureId(31)]);
      await db.query("select withdraw_company_capacity_line($1)", [fixtureId(31)]);
      await db.exec("select set_config('request.jwt.claims', '{\"sub\":\"intake_buyer\",\"role\":\"authenticated\"}', true)");
      await db.query("select withdraw_company_demand_line($1)", [fixtureId(41)]);
      await db.query("select withdraw_company_demand_line($1)", [fixtureId(41)]);
      await db.exec("reset role");
      const audits = await db.query<{ action: string; total: number }>(`
        select action,count(*)::int as total from audit_event where action in ('capacity.withdrawn','demand.withdrawn')
        group by action order by action
      `);
      expect(audits.rows).toEqual([{ action: "capacity.withdrawn", total: 1 }, { action: "demand.withdrawn", total: 1 }]);
    });
  });

  describe.each(dateEditCases)("authenticated $kind date edits", (edit) => {
    it.each([
      ["2030-01-01", "infinity", "23514"],
      ["-infinity", "2030-01-07", "23514"],
      ["infinity", "infinity", "23514"],
      ["-infinity", "-infinity", "23514"],
      ["0001-01-01 BC", "0001-01-07 BC", "23514"],
      ["10000-01-01", "10000-01-07", "23514"],
      [null, "2030-01-07", "23514"],
      ["2030-01-01", null, "23514"],
      ["2030-02-29", "2030-03-07", "22008"],
      ["1900-02-29", "1900-03-07", "22008"],
      ["2032-03-07", "2032-02-29", "23514"],
    ])("rejects %s to %s without changing the line, children or audit", async (from, until, code) => {
      await withIntakeFixture(async () => {
        const before = await db.query(edit.snapshotSql, [edit.id]);
        await db.query("select set_config('request.jwt.claims',$1,true)",
          [JSON.stringify({ sub: edit.user, role: "authenticated" })]);
        await db.exec("set local role authenticated");
        await expectSqlError(edit.sql, [edit.id, from, until], code!);
        await db.exec("reset role");
        const after = await db.query(edit.snapshotSql, [edit.id]);
        expect(after.rows).toEqual(before.rows);
      });
    });

    it.each([
      ["2032-02-28", "2032-03-05"],
      ["2000-02-29", "2000-03-07"],
      ["1900-02-28", "1900-03-06"],
      ["0001-01-01", "0001-01-07"],
      ["9999-12-25", "9999-12-31"],
    ])("accepts finite calendar window %s to %s", async (from, until) => {
      await withIntakeFixture(async () => {
        await db.query("select set_config('request.jwt.claims',$1,true)",
          [JSON.stringify({ sub: edit.user, role: "authenticated" })]);
        await db.exec("set local role authenticated");
        await db.query(edit.sql, [edit.id, from, until]);
        const dates = await db.query(edit.datesSql, [edit.id]);
        expect(dates.rows).toEqual([{ start_date: from, end_date: until }]);
      });
    });
  });
});
