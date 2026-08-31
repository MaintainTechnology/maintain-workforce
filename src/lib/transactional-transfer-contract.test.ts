import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  const file = join(process.cwd(), path);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const migration = () => source("supabase/migrations/20260828001000_transactional_transfer.sql");

describe("transactional worker transfers", () => {
  it("offers only service-role transactional entry points and prevents duplicate live transfers", () => {
    const sql = migration();
    expect(sql).toMatch(/create unique index worker_transfer_one_live[\s\S]*on worker_transfer\s*\(worker_id\)/i);
    expect(sql).toMatch(/having count\(\*\) > 1/i);
    for (const name of ["request_worker_transfer", "decide_worker_transfer", "escalate_worker_transfers"]) {
      expect(sql).toContain(`function ${name}(`);
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([\\s\\S]*?from public, anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([\\s\\S]*?to service_role`, "i"));
    }
  });

  it("resolves contacts without guessing between different workers and hides requester worker IDs", () => {
    const sql = migration();
    expect(sql).toMatch(/count\(distinct w\.id\)/i);
    expect(sql).toMatch(/v_match_count <> 1/i);
    expect(sql).toMatch(/create or replace view company_transfer_view[\s\S]*case[\s\S]*then t\.worker_id[\s\S]*end as worker_id/i);
    expect(sql).toMatch(/accepted_at is not null/i);
  });

  it("locks transfer and worker ownership and refuses all unresolved committing work", () => {
    const sql = migration();
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\(/i);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\([\s\S]*904/i);
    expect(sql).toMatch(/status = p_expected_status[\s\S]*for update/i);
    expect(sql).toMatch(/company_id is distinct from v_transfer\.from_company_id/i);
    expect(sql).toMatch(/from engagement_worker[\s\S]*'Awaiting Commercial', 'Confirmed', 'Active'[\s\S]*for update/i);
    expect(sql).not.toContain("override_committing");
  });

  it("records approval, completion and employer change with an in-transaction knockout cascade", () => {
    const sql = migration();
    expect(sql).toMatch(/update worker_employment[\s\S]*end_reason = 'transfer'/i);
    expect(sql).toMatch(/insert into worker_employment/i);
    expect(sql).toMatch(/delete from capacity_line_worker[\s\S]*'Open', 'Partially Committed'/i);
    expect(sql).toContain("knock_out_match_nomination_atomic(");
    expect(sql).toContain("'worker_transfer.approved'");
    expect(sql).toContain("'worker_transfer.completed'");
    expect(sql).toContain("'worker.employer_changed'");
  });

  it("takes affected demand locks before capacity locks to match proposal lock order", () => {
    const sql = migration();
    expect(sql.indexOf("v_knockout := knock_out_match_nomination_atomic")).toBeLessThan(sql.indexOf("delete from capacity_line_worker"));
    expect(sql).toMatch(/select distinct m\.demand_line_id[\s\S]*order by m\.demand_line_id/i);
  });

  it("locks complete company snapshots before workers and keeps the cron escalation core prelocked", () => {
    const sql = migration();
    for (const name of ["request_worker_transfer", "decide_worker_transfer", "escalate_worker_transfers"]) {
      const body = sql.split(`create or replace function ${name}(`)[1]?.split("revoke all on function")[0] ?? "";
      const companies = body.indexOf("perform lock_match_companies(");
      const workers = body.search(/perform (?:pg_advisory_xact_lock|lock_match_workers)\(/);
      expect(companies, `${name} company snapshot`).toBeGreaterThan(-1);
      expect(workers, `${name} worker locks`).toBeGreaterThan(companies);
    }
    const core = sql.split("create or replace function escalate_worker_transfers_prelocked(")[1]?.split("revoke all on function")[0] ?? "";
    expect(core).toContain("p_locked_company_ids");
    expect(core).toContain("p_locked_worker_ids");
    expect(core).toContain("40001");
    expect(core).not.toMatch(/perform (?:lock_match_companies|lock_match_workers|pg_advisory_xact_lock)\(/);
  });

  it("escalates once at the Brisbane fifth-business-day deadline, excluding the holiday table", () => {
    const sql = migration();
    expect(sql).toMatch(/at time zone 'Australia\/Brisbane'/i);
    expect(sql).toMatch(/extract\(isodow from v_due_on\) <= 5/i);
    expect(sql).toMatch(/from public_holiday[\s\S]*holiday_date = v_due_on/i);
    expect(sql).toMatch(/p_effective_date < v_due_on/i);
    expect(sql).toMatch(/for update skip locked/i);
    expect(sql).toContain("'worker_transfer.escalated_to_admin_review'");
  });
});

describe("transfer action and UI boundary", () => {
  it("uses checked RPCs, explicit CAS inputs and no partial REST mutation sequence", () => {
    const actions = source("src/lib/actions/transfer.ts");
    expect(actions).toContain('.rpc("request_worker_transfer"');
    expect(actions).toContain('.rpc("decide_worker_transfer"');
    expect(actions).toContain("p_expected_status");
    expect(actions).toContain("Promise<FormResult>");
    expect(actions).not.toMatch(/\.from\("(?:worker_transfer|worker_employment|capacity_line_worker|match_worker)"\)[\s\S]*?\.(insert|update|delete)\(/);
    expect(actions).not.toContain("override_committing");
    expect(actions).not.toContain("enforceCrewMinimum");
  });

  it("exposes Admin Review as an explicit audited step and uses pending/error-aware company forms", () => {
    const admin = source("src/app/(admin)/admin/transfers/page.tsx");
    const company = source("src/app/(app)/app/transfers/page.tsx");
    expect(admin).toContain('status === "Admin Review"');
    expect(admin).toContain('name="decision" value="review"');
    expect(admin).toContain('name="expected_status"');
    expect(admin).not.toContain("override_committing");
    expect(admin).toMatch(/Resolve.*engagement/i);
    expect(company).toContain("<ActionForm");
    expect(company).toContain('name="expected_status"');
  });

  it("delivers notifications after commit without exposing the executor as a Server Action", () => {
    const helper = source("src/lib/transfer-orchestration.ts");
    expect(helper).toContain('import "server-only"');
    expect(helper).toContain("Promise.allSettled");
    expect(helper).toContain('.rpc("escalate_worker_transfers"');
    expect(helper).toContain("export async function escalateTransfersForDate");
    expect(helper).toContain("buyerRenotificationMatchIds");
    expect(helper).not.toContain('"use server"');
  });
});
