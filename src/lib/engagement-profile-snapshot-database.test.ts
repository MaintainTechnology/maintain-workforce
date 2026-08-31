import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

const migrationName = "20260828001500_historical_engagement_profiles.sql";
const migrationsDirectory = join(process.cwd(), "supabase/migrations");
const migrationSource = () => readFileSync(join(migrationsDirectory, migrationName), "utf8");
const matchingSource = readFileSync(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8");
const seedBoundary = matchingSource.indexOf("-- Privilege isolation is tested");
if (seedBoundary < 0) throw new Error("Matching fixture seed boundary is missing");
const seed = matchingSource.slice(0, seedBoundary) + `
  insert into company(id,legal_name,contact_email,status) values
    (pg_temp.matching_id(12),'New Employer','new-employer@example.test','Active'),
    (pg_temp.matching_id(13),'Unrelated Company','unrelated@example.test','Active');
  insert into company_user(user_id,company_id,accepted_at) values
    ('historical_supplier',pg_temp.matching_id(10),now()),
    ('historical_buyer',pg_temp.matching_id(11),now()),
    ('new_employer',pg_temp.matching_id(12),now()),
    ('unrelated_company',pg_temp.matching_id(13),now()),
    ('unaccepted_history',pg_temp.matching_id(10),null);
  update worker set first_name='Original',last_name='Worker' where id=pg_temp.matching_id(20);
  insert into worker_qualification(worker_id,qualification_id,number,issue_date,expiry_date,status,file_path) values
    (pg_temp.matching_id(20),pg_temp.matching_id(6),'EXPIRED-OLD-TICKET','2020-01-01','2021-01-01','Expired','PRIVATE-OLD-STORAGE'),
    (pg_temp.matching_id(20),pg_temp.matching_id(6),'OLD-TICKET-001','2025-01-01','2050-01-01','Current','PRIVATE-STORAGE-PATH');
  create function pg_temp.snapshot_engagement() returns uuid language plpgsql as $$
  declare v_match uuid; v_result jsonb;
  begin
    v_match:=pg_temp.matching_propose(array[20]);
    perform pg_temp.matching_supplier(v_match,array[20]);
    v_result:=pg_temp.matching_buyer(v_match);
    return (v_result->>'engagement_id')::uuid;
  end;
  $$;
`;

type SnapshotRow = {
  id: string;
  engagement_id: string;
  profile_snapshot: { name: string; tickets: Record<string, unknown>[] } | null;
  profile_snapshot_captured_at: unknown;
};
let db: PGlite;

async function createEngagement(database = db): Promise<string> {
  return (await database.query<{ id: string }>("select pg_temp.snapshot_engagement() as id")).rows[0].id;
}
async function expectSqlError(sql: string, state = "23514", database = db) {
  await database.query("select pg_temp.matching_expect_error($1,$2)", [sql, state]);
}
async function asUser<T>(user: string, operation: () => Promise<T>, database = db): Promise<T> {
  await database.exec("set local role authenticated");
  await database.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user })]);
  try { return await operation(); } finally { await database.exec("reset role"); }
}
async function readProfile(user: string, engagementId: string, database = db) {
  return asUser(user, async () => (await database.query<SnapshotRow>(
    "select * from engagement_worker_profile_view where engagement_id=$1 order by id", [engagementId],
  )).rows, database);
}
async function finishEngagement(engagementId: string, database = db) {
  await database.query("select record_engagement_payment($1,'Awaiting Commercial','pre-authorised',null,'maintain_snapshot','2026-09-01')", [engagementId]);
  await database.query("select transition_engagement_lifecycle($1,'Active','Completed',null,true,'2026-09-29')", [engagementId]);
}
async function transferWorker(to: 10 | 12, actor: string, previous: 10 | 12, previousActor: string) {
  const requested = (await db.query<{ result: { transfer_id: string } }>(
    "select request_worker_transfer('20@matching.example.test','0412340020',pg_temp.matching_id($1),$2) as result", [to, actor],
  )).rows[0].result;
  await db.query("select decide_worker_transfer($1,'Awaiting Current Employer','approve',$2,pg_temp.matching_id($3),null)",
    [requested.transfer_id, previousActor, previous]);
}

describe("database-owned historical engagement profiles", () => {
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.exec(seed);
  }, 60_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("savepoint snapshot_case"); });
  afterEach(async () => { await db.exec("rollback to snapshot_case"); });

  it("has a database-gated read-only snapshot projection", async () => {
    const result = (await db.query<{ relation: string | null }>(
      "select to_regclass('public.engagement_worker_profile_view')::text as relation",
    )).rows[0];
    expect(result.relation).toBe("engagement_worker_profile_view");
    const acl = (await db.query<Record<string, boolean>>(`select
      has_table_privilege('authenticated','engagement_worker_profile_view','SELECT') as can_read,
      has_table_privilege('authenticated','engagement_worker_profile_view','UPDATE') as can_update,
      has_table_privilege('anon','engagement_worker_profile_view','SELECT') as anonymous_read,
      has_table_privilege('authenticated','engagement_worker','SELECT') as base_read,
      has_function_privilege('service_role','capture_engagement_worker_profile()','EXECUTE') as callable_capture
    `)).rows[0];
    expect(acl).toEqual({ can_read: true, can_update: false, anonymous_read: false, base_read: false, callable_capture: false });
  });

  it("captures one safe effective ticket per qualification inside buyer acceptance", async () => {
    let id: string;
    await db.exec("set local role service_role");
    try { id = await createEngagement(); } finally { await db.exec("reset role"); }
    const [snapshot] = await readProfile("historical_supplier", id);
    expect(Object.keys(snapshot).sort()).toEqual(["engagement_id", "id", "profile_snapshot", "profile_snapshot_captured_at"]);
    expect(snapshot.profile_snapshot).toEqual({ name: "Original Worker", tickets: [{
      name: "Matching Worker Ticket", number: "OLD-TICKET-001", issueDate: "2025-01-01", expiryDate: "2050-01-01", status: "Current",
    }] });
    expect(snapshot.profile_snapshot_captured_at).not.toBeNull();
    const encoded = JSON.stringify(snapshot);
    for (const privateValue of ["0412340020", "20@matching.example.test", "PRIVATE-STORAGE-PATH", "EXPIRED-OLD-TICKET"]) {
      expect(encoded).not.toContain(privateValue);
    }
    expect((await db.query("select id from audit_event where entity_id=$1 and action='engagement.created'", [id])).rows).toHaveLength(1);
  });

  it.each([[-1, "Expired"], [0, "Expiring Soon"], [30, "Expiring Soon"], [31, "Current"]] as const)(
    "captures effective expiry status at the Brisbane capture date (%i days)", async (days, expectedStatus) => {
      await db.query(`update worker_qualification set expiry_date=(now() at time zone 'Australia/Brisbane')::date+$1::int
        where number='OLD-TICKET-001'`, [days]);
      const id = await createEngagement();
      const [snapshot] = await readProfile("historical_supplier", id);
      expect(snapshot.profile_snapshot?.tickets[0].status).toBe(expectedStatus);
    },
  );

  it("keeps buyer facts behind the immutable commercial marker in the database", async () => {
    const id = await createEngagement();
    expect(await readProfile("historical_buyer", id)).toEqual([]);
    expect(await readProfile("unaccepted_history", id)).toEqual([]);
    expect(await readProfile("unrelated_company", id)).toEqual([]);
    expect(await readProfile("new_employer", id)).toEqual([]);
    await finishEngagement(id);
    expect((await readProfile("historical_buyer", id))[0].profile_snapshot?.name).toBe("Original Worker");
    expect(await asUser("historical_buyer", async () => (await db.query("select id from worker where id=pg_temp.matching_id(20)")).rows)).toEqual([]);
  });

  it("retains only frozen crew for both parties after transfer and return employment", async () => {
    const id = await createEngagement();
    await finishEngagement(id);
    const original = await readProfile("historical_supplier", id);
    await transferWorker(12, "new_employer", 10, "historical_supplier");
    await db.exec(`update worker set first_name='POST-TRANSFER-NAME',last_name='Private' where id=pg_temp.matching_id(20);
      insert into worker_qualification(worker_id,qualification_id,number,expiry_date,status,file_path) values
      (pg_temp.matching_id(20),pg_temp.matching_id(7),'NEW-EMPLOYER-PRIVATE-TICKET-001','2051-01-01','Current','NEW-PRIVATE-STORAGE')`);
    const hidden = await asUser("historical_supplier", async () => ({
      workers: (await db.query("select id from worker where id=pg_temp.matching_id(20)")).rows,
      tickets: (await db.query("select id from worker_qualification where worker_id=pg_temp.matching_id(20)")).rows,
      employment: (await db.query<{ company_id: string; end_date: string | null }>(
        "select company_id,end_date from worker_employment where worker_id=pg_temp.matching_id(20)",
      )).rows,
    }));
    expect(hidden.workers).toEqual([]);
    expect(hidden.tickets).toEqual([]);
    expect(hidden.employment).toHaveLength(1);
    expect(hidden.employment[0].end_date).not.toBeNull();
    expect(await readProfile("historical_supplier", id)).toEqual(original);
    expect(await readProfile("historical_buyer", id)).toEqual(original);
    expect(await readProfile("new_employer", id)).toEqual([]);
    expect(await asUser("new_employer", async () => (await db.query<{ first_name: string }>(
      "select first_name from worker where id=pg_temp.matching_id(20)",
    )).rows)).toEqual([{ first_name: "POST-TRANSFER-NAME" }]);
    await transferWorker(10, "historical_supplier", 12, "new_employer");
    expect(await readProfile("historical_supplier", id)).toEqual(original);
    expect(await readProfile("historical_buyer", id)).toEqual(original);
  });

  it("freezes the name, ticket facts, capture time and engagement-worker identity", async () => {
    const id = await createEngagement();
    for (const mutation of [
      "profile_snapshot=jsonb_build_object('name','Replacement','tickets','[]'::jsonb)",
      "profile_snapshot_captured_at=now()+interval '1 day'",
      "worker_id=pg_temp.matching_id(21)",
      "engagement_id=gen_random_uuid()",
    ]) {
      await expectSqlError(`update engagement_worker set ${mutation} where engagement_id='${id}'`);
    }
    const original = await readProfile("historical_supplier", id);
    await finishEngagement(id);
    expect(await readProfile("historical_supplier", id)).toEqual(original);
  });

  it("rejects caller-authored snapshots and late crew insertion into historical engagements", async () => {
    const id = await createEngagement();
    await expectSqlError(`insert into engagement_worker(engagement_id,worker_id,status,committed_window,
      profile_snapshot,profile_snapshot_captured_at) values('${id}',pg_temp.matching_id(21),'Awaiting Commercial',
      daterange('2026-09-01','2026-09-28','[]'),'{"name":"Forged history","mobile":"PRIVATE-MOBILE"}',now())`);
    await finishEngagement(id);
    await expectSqlError(`insert into engagement_worker(engagement_id,worker_id,status,committed_window)
      values('${id}',pg_temp.matching_id(21),'Completed',daterange('2026-09-01','2026-09-28','[]'))`);
    expect(await readProfile("historical_supplier", id)).toHaveLength(1);
  });

  it("rolls snapshots back with the parent transaction when the final audit fails", async () => {
    await db.exec(`create function pg_temp.fail_snapshot_audit() returns trigger language plpgsql as $$
      begin
        if new.action='engagement.created' then raise exception 'injected audit failure' using errcode='23514'; end if;
        return new;
      end;
      $$;
      create trigger fail_snapshot_audit before insert on audit_event for each row execute function pg_temp.fail_snapshot_audit();`);
    await expectSqlError("select pg_temp.snapshot_engagement()");
    expect((await db.query("select * from engagement_worker")).rows).toEqual([]);
    expect((await db.query("select * from engagement")).rows).toEqual([]);
    expect((await db.query("select * from match")).rows).toEqual([]);
    expect((await db.query("select * from audit_event where entity_type in ('match','engagement')")).rows).toEqual([]);
  });
});

describe("legacy engagement profile migration", () => {
  it("leaves pre-existing crew unavailable and rejects later live-profile backfills", async () => {
    const legacy = new PGlite({ extensions: { btree_gist } });
    try {
      await legacy.exec(readFileSync(join(process.cwd(), "src/test/database-bootstrap.sql"), "utf8"));
      for (const name of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql") && name < migrationName).sort()) {
        await legacy.exec(readFileSync(join(migrationsDirectory, name), "utf8"));
      }
      await legacy.exec(seed);
      const id = await createEngagement(legacy);
      await finishEngagement(id, legacy);
      await legacy.exec("update worker set first_name='POST-TRANSFER-NAME' where id=pg_temp.matching_id(20)");
      await legacy.exec(migrationSource());
      const [row] = await readProfile("historical_supplier", id, legacy);
      expect(row.profile_snapshot).toBeNull();
      expect(row.profile_snapshot_captured_at).toBeNull();
      await expectSqlError(`update engagement_worker set profile_snapshot='{"name":"POST-TRANSFER-NAME","tickets":[]}',
        profile_snapshot_captured_at=now() where engagement_id='${id}'`, "23514", legacy);
      expect((await readProfile("historical_buyer", id, legacy))[0].profile_snapshot).toBeNull();
    } finally { await legacy.close(); }
  }, 60_000);
});
