// Optional native PostgreSQL verification. The separately installed runtime is a
// test tool, not an application dependency. It always starts a NEW loopback-only
// cluster in an OS temporary directory: no connection to a supplied/live database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.MW_NATIVE_POSTGRES_MODULE;
if (!modulePath || !isAbsolute(modulePath)) {
  throw new Error("Set MW_NATIVE_POSTGRES_MODULE to an installed embedded-postgres/dist/index.js absolute path.");
}
const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
const reserve = createServer();
await new Promise((resolve, reject) => {
  reserve.once("error", reject);
  reserve.listen(0, "127.0.0.1", resolve);
});
const port = reserve.address().port;
await new Promise((resolve, reject) => reserve.close((error) => error ? reject(error) : resolve()));
const directory = await mkdtemp(join(tmpdir(), "mw-native-postgres-"));
const engine = new EmbeddedPostgres({
  databaseDir: join(directory, "cluster"),
  port, user: "mw_test", password: randomBytes(24).toString("hex"),
  persistent: true, createPostgresUser: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {}, onError: () => {},
});
const clients = [];
async function connection() {
  const client = engine.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  clients.push(client);
  await client.query("set statement_timeout = '12s'; set lock_timeout = '10s'");
  return client;
}
const id = (number) => `80808080-0000-4000-8000-${String(number).padStart(12, "0")}`;
const today = "2026-08-31";
const reports = [];
const pass = (name) => { reports.push(name); console.log(`PASS ${name}`); };

try {
  await engine.initialise();
  await engine.start();
  const db = await connection();
  console.log((await db.query("select version()")).rows[0].version.split(",")[0]);
  await db.query(await readFile(join(process.cwd(), "src/test/database-bootstrap.sql"), "utf8"));
  const migrationDirectory = join(process.cwd(), "supabase/migrations");
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    try { await db.query(await readFile(join(migrationDirectory, name), "utf8")); }
    catch (error) { throw new Error(`Native migration ${name} failed`, { cause: error }); }
  }
  pass(`${migrations.length} real migrations on a fresh native PostgreSQL cluster`);
  for (const name of ["matching_lifecycle.sql", "transfer_lifecycle.sql", "daily_executor.sql", "company_lifecycle.sql"]) {
    await db.query(await readFile(join(process.cwd(), "supabase/tests", name), "utf8"));
    pass(name);
  }

  // Reuse only the explicit synthetic seed portion of the matching regression.
  // Its assertion cases are rolled back above; commit fixtures here so independent
  // connections see the same records. No real users or data enter this cluster.
  const fixture = await readFile(join(process.cwd(), "supabase/tests/matching_lifecycle.sql"), "utf8");
  const workerStatusBoundary = fixture.indexOf("-- Privilege isolation is tested");
  assert(workerStatusBoundary > 0, "matching helper boundary must exist");
  // Worker-status cases intentionally share the matching fixture/helper transaction.
  await db.query(fixture.slice(0, workerStatusBoundary));
  try {
    await db.query(`insert into company_user(user_id,company_id,accepted_at)
      values('intake_supplier',pg_temp.matching_id(10),now()),('intake_buyer',pg_temp.matching_id(11),now())`);
    await db.query(await readFile(join(process.cwd(), "supabase/tests/tenant_worker_status.sql"), "utf8"));
    pass("tenant_worker_status.sql");
  } finally { await db.query("rollback"); }
  const fixtureEnd = fixture.indexOf("create function pg_temp.matching_propose");
  assert(fixtureEnd > 0, "matching seed boundary must exist");
  await db.query(`${fixture.slice(0, fixtureEnd)}\ncommit;`);
  const first = await connection();
  const second = await connection();
  const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0].pid;
  async function blockedOnLock() {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const { rows } = await db.query("select wait_event_type from pg_stat_activity where pid=$1", [secondPid]);
      if (rows[0]?.wait_event_type === "Lock") return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Competing transaction never reached an observable PostgreSQL lock wait");
  }
  async function propose(client, worker, demand = 41) {
    const { rows } = await client.query(
      "select propose_matches_atomic($1,$2::jsonb,false,false,null,'native_admin',$3::date) as result",
      [id(demand), JSON.stringify([{ capacity_line_id: id(31), worker_id: id(worker) }]), today],
    );
    return rows[0].result.matches[0].match_id;
  }
  async function supplierAccept(client, match, worker) {
    await client.query("select accept_match_as_supplier($1,'Awaiting Supplier',$2::uuid[],$3,'native_supplier',false,null,$4::date)",
      [match, [id(worker)], id(10), today]);
  }
  function buyerAccept(client, match) {
    return client.query("select accept_match_as_buyer($1,'Awaiting Buyer',1,1,$2,'native_buyer',false,null,$3::date)",
      [match, id(11), today]);
  }
  function outcome(promise) {
    return promise.then(() => ({ ok: true }), (error) => ({ ok: false, code: error.code, message: error.message }));
  }

  const firstMatch = await propose(db, 20);
  await supplierAccept(db, firstMatch, 20);
  await first.query("begin");
  await buyerAccept(first, firstMatch);
  const duplicate = outcome(buyerAccept(second, firstMatch));
  await blockedOnLock();
  await first.query("commit");
  assert.equal((await duplicate).code, "40001");
  assert.equal((await db.query("select count(*)::int as n from engagement where match_id=$1", [firstMatch])).rows[0].n, 1);
  pass("simultaneous buyer acceptance creates exactly one engagement and rejects stale competitor");

  await first.query("begin");
  await first.query("select transition_company_status_atomic($1,'Active','Suspended','native_admin')", [id(10)]);
  const proposalAgainstSuspension = outcome(propose(second, 21, 42));
  await blockedOnLock();
  await first.query("commit");
  assert.equal((await proposalAgainstSuspension).ok, false);
  assert.equal((await db.query("select count(*)::int as n from match where demand_line_id=$1", [id(42)])).rows[0].n, 0);
  pass("a proposal waits for concurrent suspension and cannot create a new open match afterwards");

  await db.query("select transition_company_status_atomic($1,'Suspended','Active','native_admin')", [id(10)]);
  await first.query("begin");
  const pendingMatch = await propose(first, 21, 42);
  const suspensionAfterProposal = outcome(second.query(
    "select transition_company_status_atomic($1,'Active','Suspended','native_admin')", [id(10)],
  ));
  await blockedOnLock();
  await first.query("commit");
  const suspension = await suspensionAfterProposal;
  // The status operation's initial snapshot cannot see the new counterparty. It
  // must either include and close the new match, or reject so it can be retried.
  if (!suspension.ok) {
    assert.equal(suspension.code, "40001", suspension.message);
    await second.query("select transition_company_status_atomic($1,'Active','Suspended','native_admin')", [id(10)]);
  }
  assert.equal((await db.query("select status from match where id=$1", [pendingMatch])).rows[0].status, "Withdrawn");
  assert.equal((await db.query("select status from company where id=$1", [id(10)])).rows[0].status, "Suspended");
  pass("concurrent new proposal is withdrawn or causes a safe status-transition retry");

  await db.query("select transition_company_status_atomic($1,'Suspended','Active','native_admin')", [id(10)]);
  for (const client of [db, first, second]) {
    await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);
  }
  const statusMatch = await propose(db, 22, 42);
  await supplierAccept(db, statusMatch, 22);
  await first.query("begin");
  await first.query("select set_company_worker_status($1,'Active','Inactive','native_admin')", [id(22)]);
  const staleBuyer = outcome(buyerAccept(second, statusMatch));
  await blockedOnLock();
  await first.query("commit");
  assert.equal((await staleBuyer).code, "40001");
  const knockedOutMatch = (await db.query("select status,nomination_version from match where id=$1", [statusMatch])).rows[0];
  assert.equal(knockedOutMatch.status, "Declined");
  assert.equal(knockedOutMatch.nomination_version, 2);
  assert.equal((await db.query("select count(*)::int as n from engagement where match_id=$1", [statusMatch])).rows[0].n, 0);
  pass("worker inactivation wins its race and stale buyer acceptance cannot commit the knocked-out crew");

  await db.query("select set_company_worker_status($1,'Inactive','Active','native_admin')", [id(22)]);
  const committedMatch = await propose(db, 22, 42);
  await supplierAccept(db, committedMatch, 22);
  await first.query("begin");
  await buyerAccept(first, committedMatch);
  const statusAfterCommit = outcome(second.query(
    "select set_company_worker_status($1,'Active','Inactive','native_admin')", [id(22)],
  ));
  await blockedOnLock();
  await first.query("commit");
  assert.equal((await statusAfterCommit).ok, true);
  assert.equal((await db.query("select status from engagement where match_id=$1", [committedMatch])).rows[0].status, "Awaiting Commercial");
  assert.equal((await db.query("select count(*)::int as n from engagement_worker ew join engagement e on e.id=ew.engagement_id where e.match_id=$1", [committedMatch])).rows[0].n, 1);
  pass("buyer acceptance wins its race and later worker inactivation preserves the existing commitment");

  const capacityPayload = JSON.stringify({ lines: [{
    trade_role_id: id(5), proficiency_id: id(4), worker_ids: [id(23)],
    available_from: "2026-10-01", available_until: "2026-10-14", hours_per_week: 40,
    location_region_id: id(2), supplier_rate_cents: 6000, travel_region_ids: [],
  }] });
  const createCapacity = (client) => client.query(
    "select create_capacity_listing_transactional($1,'native_admin',true,'Native concurrent fixture',$2::jsonb)",
    [id(10), capacityPayload],
  );
  const listingCount = (await db.query("select count(*)::int as n from capacity_listing")).rows[0].n;
  await first.query("begin");
  await createCapacity(first);
  const overlappingIntake = outcome(createCapacity(second));
  await blockedOnLock();
  await first.query("commit");
  assert.equal((await overlappingIntake).code, "23514");
  assert.equal((await db.query("select count(*)::int as n from capacity_listing")).rows[0].n, listingCount + 1);
  assert.equal((await db.query("select count(*)::int as n from capacity_line where available_from='2026-10-01'")).rows[0].n, 1);
  pass("simultaneous overlapping capacity submissions serialize and the loser leaves no partial aggregate");

  console.log(`Native database checks passed: ${reports.length}. Local artifacts retained in ${directory}`);
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  await engine.stop();
}
