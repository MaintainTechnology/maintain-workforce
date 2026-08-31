import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260828000800_transactional_matching.sql";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("transactional matching migration", () => {
  it("provides a counted, ordered company lock boundary before worker locks", () => {
    const sql = source(MIGRATION);
    const helper = sql.slice(sql.indexOf("create or replace function lock_match_companies"),
      sql.indexOf("create or replace function lock_match_workers"));
    expect(helper).toContain("p_company_ids uuid[]");
    expect(helper).toMatch(/order by (?:c\.)?id[\s\S]*for share/i);
    expect(helper).toContain("v_locked_count <> v_expected_count");
    expect(helper).toMatch(/revoke all[\s\S]*public, anon, authenticated/i);
  });

  it("takes every public mutation's company locks before worker, demand and match locks", () => {
    const sql = source(MIGRATION);
    for (const name of ["propose_matches_atomic", "accept_match_as_supplier", "substitute_match_nominations",
      "accept_match_as_buyer", "decline_match_atomic", "withdraw_match_atomic", "expire_match_atomic",
      "knock_out_match_nomination_atomic", "record_match_qualification_override"]) {
      const start = sql.indexOf(`create or replace function ${name}`);
      const body = sql.slice(start, sql.indexOf("$$;", start));
      const company = body.indexOf("perform lock_match_companies(");
      expect(company, `${name} company locks`).toBeGreaterThanOrEqual(0);
      for (const laterLock of ["perform lock_match_workers(", "for update"]) {
        const later = body.indexOf(laterLock);
        if (later >= 0) expect(company, `${name} ${laterLock} order`).toBeLessThan(later);
      }
    }
    const privateClose = sql.slice(sql.indexOf("create or replace function close_match_atomic"),
      sql.indexOf("create or replace function decline_match_atomic"));
    expect(privateClose).not.toContain("perform lock_match_companies(");
  });

  it("locks proposal capacity before validating or snapshotting its editable fields", () => {
    const sql = source(MIGRATION);
    const proposal = sql.slice(sql.indexOf("create or replace function propose_matches_atomic"),
      sql.indexOf("create or replace function accept_match_as_supplier"));
    const capacityLock = proposal.indexOf("for share of cl");
    expect(capacityLock).toBeGreaterThanOrEqual(0);
    expect(capacityLock).toBeLessThan(proposal.indexOf("v_failure := proposal_candidate_failure"));
  });

  it("persists a feasibility shortlist and versions every buyer-visible nomination shape", () => {
    const sql = source(MIGRATION);

    expect(sql).toMatch(/create table match_shortlist_worker/i);
    expect(sql).toMatch(/primary key\s*\(match_id, worker_id\)/i);
    expect(sql).toMatch(/alter table match[\s\S]*nomination_version integer not null default 0/i);
    expect(sql).toMatch(/create or replace view buyer_match_view[\s\S]*nomination_version/i);
    expect(sql).toMatch(/revoke all on match_shortlist_worker[\s\S]*public, anon, authenticated/i);
  });

  it("locks the demand budget and creates every proposal group, shortlist and audit atomically", () => {
    const sql = source(MIGRATION);

    expect(sql).toContain("function propose_matches_atomic");
    expect(sql).toMatch(/from demand_line[\s\S]*for update/i);
    expect(sql).toMatch(/count\(distinct ew\.worker_id\)/i);
    expect(sql).toMatch(/Awaiting Supplier[\s\S]*requested_quantity[\s\S]*Awaiting Buyer/i);
    expect(sql).toMatch(/v_filled\s*\+\s*v_pending\s*\+\s*v_selected_count\s*>\s*v_demand\.quantity/i);
    expect(sql).toMatch(/insert into match\s*\(/i);
    expect(sql).toMatch(/insert into match_shortlist_worker/i);
    expect(sql).toContain("'match.created'");
    expect(sql).toMatch(/current platform fee is invalid|fee basis points/i);
    expect(sql).toMatch(/minimum_hours_per_line/i);
    expect(sql).toMatch(/company_is_match_compliant/i);
  });

  it("validates and replaces supplier nominations under an exact row-locked CAS", () => {
    const sql = source(MIGRATION);

    expect(sql).toContain("function accept_match_as_supplier");
    expect(sql).toContain("function substitute_match_nominations");
    expect(sql).toMatch(/status = 'Awaiting Supplier'[\s\S]*for update/i);
    expect(sql).toMatch(/capacity_line_worker/i);
    expect(sql).toMatch(/worker_employment[\s\S]*end_date is null/i);
    expect(sql).toMatch(/worker_qualification/i);
    expect(sql).toMatch(/engagement_worker[\s\S]*committed_window\s*&&/i);
    expect(sql).toMatch(/minimum_crew_size/i);
    expect(sql).toMatch(/delete from match_worker[\s\S]*insert into match_worker/i);
    expect(sql).toMatch(/rate_ratified_at\s*=\s*coalesce\(rate_ratified_at, now\(\)\)/i);
    expect(sql).toMatch(/nomination_version\s*=\s*nomination_version\s*\+\s*1/i);
    expect(sql).toContain("'match.supplier_accepted'");
    expect(sql).toContain("'match.nominations_substituted'");
  });

  it("accepts a buyer proposal and creates exactly one complete engagement atomically", () => {
    const sql = source(MIGRATION);

    expect(sql).toContain("function accept_match_as_buyer");
    expect(sql).toMatch(/status = 'Awaiting Buyer'[\s\S]*for update/i);
    expect(sql).toMatch(/p_presented_nomination_version[\s\S]*v_match\.nomination_version/i);
    expect(sql).toMatch(/p_presented_quantity[\s\S]*v_worker_count/i);
    expect(sql).toMatch(/count\(distinct ew\.worker_id\)/i);
    expect(sql).toMatch(/insert into engagement\s*\([\s\S]*status[\s\S]*payment_status/i);
    expect(sql).toMatch(/'Awaiting Commercial'[\s\S]*'none'/i);
    expect(sql).toMatch(/insert into engagement_worker[\s\S]*select[\s\S]*from match_worker/i);
    expect(sql).toMatch(/if v_inserted_worker_count <> v_worker_count/i);
    expect(sql).toContain("'engagement.created'");
    expect(sql).toContain("'match.buyer_accepted'");
    expect(sql).toMatch(/status\s*=\s*'Accepted'/i);
    expect(sql).toMatch(/update match_worker[\s\S]*committed to another engagement/i);
  });

  it("owns every hold-releasing terminal transition with CAS, audit and service-role-only ACLs", () => {
    const sql = source(MIGRATION);
    const functions = [
      "propose_matches_atomic",
      "accept_match_as_supplier",
      "substitute_match_nominations",
      "accept_match_as_buyer",
      "decline_match_atomic",
      "withdraw_match_atomic",
      "expire_match_atomic",
      "knock_out_match_nomination_atomic",
      "record_match_qualification_override",
    ];

    for (const name of functions) {
      expect(sql).toContain(`function ${name}`);
      expect(sql).toMatch(
        new RegExp(`revoke all on function ${name}\\([\\s\\S]*?from public, anon, authenticated`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function ${name}\\([\\s\\S]*?to service_role`, "i"),
      );
    }

    for (const status of ["Declined", "Withdrawn", "Expired"]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toMatch(/update match_worker[\s\S]*knocked_out = true/i);
    expect(sql).toContain("'match.declined_by_supplier'");
    expect(sql).toContain("'match.declined_by_buyer'");
    expect(sql).toContain("'match.withdrawn'");
    expect(sql).toContain("'match.expired'");
  });
});

describe("transactional matching application boundary", () => {
  it("routes matching mutations through checked RPCs and never recreates a TS transaction", () => {
    const actions = source("src/lib/actions/match.ts");

    for (const rpc of [
      "propose_matches_atomic",
      "accept_match_as_supplier",
      "substitute_match_nominations",
      "accept_match_as_buyer",
      "decline_match_atomic",
      "withdraw_match_atomic",
      "knock_out_match_nomination_atomic",
      "record_match_qualification_override",
    ]) {
      expect(actions).toContain(`.rpc("${rpc}"`);
    }

    expect(actions).not.toContain("createEngagementForMatch");
    expect(actions).not.toMatch(/\.from\("match"\)\s*\.insert/);
    expect(actions).not.toMatch(/\.from\("match"\)\s*\.update/);
    expect(actions).not.toMatch(/\.from\("match_worker"\)\s*\.(insert|update|delete)/);
    expect(actions).not.toMatch(/\.from\("engagement"\)\s*\.(insert|update|delete)/);
    expect(actions).toContain("Promise.allSettled");
  });

  it("re-presents substitutions and binds buyer acceptance to the displayed version", () => {
    const actions = source("src/lib/actions/match.ts");
    const matching = source("src/lib/matching.ts");
    const detail = source("src/app/(app)/app/matches/[id]/page.tsx");

    expect(actions).toContain("export async function supplierSubstituteNominations");
    expect(actions).toContain("p_presented_nomination_version");
    expect(matching).toContain("nominationVersion");
    expect(detail).toContain("supplierSubstituteNominations");
    expect(detail).toContain('name="presented_nomination_version"');
    expect(detail).toMatch(/Awaiting Buyer[\s\S]*Substitute/i);
  });
});
