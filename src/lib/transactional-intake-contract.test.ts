import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260828000900_transactional_intake.sql";

function source(path: string): string {
  const absolute = join(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function sqlFunction(sql: string, name: string): string {
  const match = sql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  return match?.[0] ?? "";
}

function actionFunction(path: string, name: string): string {
  const text = source(path);
  const start = text.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const next = text.indexOf("\nexport async function ", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

describe("transactional aggregate intake", () => {
  it("defines service-role-only JSON aggregate RPCs", () => {
    const sql = source(MIGRATION);

    for (const name of [
      "create_capacity_listing_transactional",
      "create_demand_request_transactional",
      "create_worker_transactional",
    ]) {
      const fn = sqlFunction(sql, name);
      expect(fn).toMatch(/p_payload\s+jsonb/i);
      expect(fn).toMatch(/security\s+definer/i);
      expect(sql).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+${name}[\\s\\S]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${name}[\\s\\S]*to\\s+service_role`, "i"),
      );
    }
  });

  it("creates capacity aggregates atomically and serializes every worker", () => {
    const sql = source(MIGRATION);
    const create = sqlFunction(sql, "create_capacity_listing_transactional");
    const update = sqlFunction(sql, "update_company_capacity_line");

    expect(create).toMatch(/company_status[\s\S]*'Active'/i);
    expect(create).toMatch(/trade_role_proficiency/i);
    expect(create).toMatch(/worker_employment[\s\S]*end_date\s+is\s+null/i);
    expect(create).toMatch(/worker[\s\S]*status\s*=\s*'Active'/i);
    expect(create).toMatch(/primary_trade_id[\s\S]*primary_proficiency_id/i);
    expect(create).toMatch(/insert\s+into\s+capacity_listing/i);
    expect(create).toMatch(/insert\s+into\s+capacity_line\b/i);
    expect(create).toMatch(/insert\s+into\s+capacity_line_travel_region/i);
    expect(create).toMatch(/insert\s+into\s+capacity_line_worker/i);
    expect(create).toMatch(/insert\s+into\s+audit_event/i);
    expect(create).toMatch(/admin_entered[\s\S]*evidence_note[\s\S]*rate_entered_by_admin/i);

    for (const fn of [create, update]) {
      expect(fn).toMatch(/order\s+by\s+worker_id[\s\S]*pg_advisory_xact_lock/i);
      expect(fn).toMatch(/daterange[\s\S]*&&/i);
    }
    expect(create).toMatch(/jsonb_array_elements[\s\S]*with\s+ordinality/i);
  });

  it("creates demand aggregates and validates every catalogue child and booking minimum", () => {
    const fn = sqlFunction(source(MIGRATION), "create_demand_request_transactional");

    expect(fn).toMatch(/company_status[\s\S]*'Active'/i);
    expect(fn).toMatch(/minimum_crew_size[\s\S]*minimum_hours_per_line/i);
    expect(fn).toMatch(/trade_role_proficiency/i);
    expect(fn).toMatch(/skill[\s\S]*trade_role_id/i);
    expect(fn).toMatch(/qualification/i);
    expect(fn).toMatch(/insert\s+into\s+demand_request/i);
    expect(fn).toMatch(/insert\s+into\s+demand_line\b/i);
    expect(fn).toMatch(/insert\s+into\s+demand_line_skill/i);
    expect(fn).toMatch(/insert\s+into\s+demand_line_qualification/i);
    expect(fn).toMatch(/insert\s+into\s+audit_event/i);
  });

  it("creates worker, employment and every child in one transaction", () => {
    const fn = sqlFunction(source(MIGRATION), "create_worker_transactional");

    expect(fn).toMatch(/company_status[\s\S]*'Pending'[\s\S]*'Active'/i);
    expect(fn).toMatch(/consent_confirmed_by[\s\S]*proficiency_assigned_by/i);
    expect(fn).toMatch(/trade_role_proficiency/i);
    expect(fn).toMatch(/worker\s+[\s\S]*email[\s\S]*mobile[\s\S]*23505/i);
    expect(fn).toMatch(/insert\s+into\s+worker\b/i);
    expect(fn).toMatch(/insert\s+into\s+worker_employment/i);
    expect(fn).toMatch(/insert\s+into\s+worker_travel_region/i);
    expect(fn).toMatch(/insert\s+into\s+worker_skill/i);
    expect(fn).toMatch(/insert\s+into\s+audit_event/i);
  });

  it("replaces demand requirements atomically during an allowed edit", () => {
    const sql = source(MIGRATION);
    const fn = sqlFunction(sql, "update_company_demand_line");

    expect(fn).toMatch(/p_skill_ids\s+uuid\[\]/i);
    expect(fn).toMatch(/p_qualification_ids\s+uuid\[\]/i);
    expect(fn).toMatch(/Awaiting Supplier[\s\S]*Awaiting Buyer/i);
    expect(fn).toMatch(/count\s*\(\s*distinct\s+ew\.worker_id\s*\)/i);
    expect(fn).toMatch(/delete\s+from\s+demand_line_skill[\s\S]*insert\s+into\s+demand_line_skill/i);
    expect(fn).toMatch(
      /delete\s+from\s+demand_line_qualification[\s\S]*insert\s+into\s+demand_line_qualification/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+update_company_demand_line\s*\([\s\S]*uuid\[\][\s\S]*uuid\[\][\s\S]*to\s+authenticated/i,
    );
  });

  it("routes every intake action through checked aggregate RPCs", () => {
    const cases = [
      ["src/lib/actions/capacity.ts", "createCapacityListing", "create_capacity_listing_transactional"],
      ["src/lib/actions/demand.ts", "createDemandRequest", "create_demand_request_transactional"],
      ["src/lib/actions/worker.ts", "createWorker", "create_worker_transactional"],
      [
        "src/lib/actions/concierge.ts",
        "conciergeCreateCapacityListing",
        "create_capacity_listing_transactional",
      ],
      [
        "src/lib/actions/concierge.ts",
        "conciergeCreateDemandRequest",
        "create_demand_request_transactional",
      ],
      ["src/lib/actions/concierge.ts", "conciergeCreateWorker", "create_worker_transactional"],
    ] as const;

    for (const [path, action, rpc] of cases) {
      const fn = actionFunction(path, action);
      expect(fn).toMatch(new RegExp(`\\.rpc\\(\\s*"${rpc}"`));
      expect(fn).toMatch(/\berror\b/);
      expect(fn).not.toMatch(/\.from\(\s*"(?:capacity_listing|capacity_line|demand_request|demand_line|worker|worker_employment)"\s*\)\s*\.insert/i);
      expect(fn).not.toMatch(/\.delete\(\)/i);
    }
  });

  it("wires skill and qualification replacement through the edit payload", () => {
    const demand = actionFunction("src/lib/actions/demand.ts", "updateDemandLine");
    const form = source("src/app/(app)/app/demand/demand-form.tsx");
    const page = source("src/app/(app)/app/demand/[id]/page.tsx");

    expect(demand).toMatch(/p_skill_ids:\s*input\.skillIds/i);
    expect(demand).toMatch(/p_qualification_ids:\s*input\.qualificationIds/i);
    expect(form).toMatch(/skillIds:\s*lines\[0\]\.skillIds/i);
    expect(form).toMatch(/qualificationIds:\s*lines\[0\]\.qualificationIds/i);
    expect(page).toMatch(/demand_line_skill[\s\S]*skill_id/i);
    expect(page).toMatch(/demand_line_qualification[\s\S]*qualification_id/i);
  });

  it("does not alter authentication or company ABN semantics", () => {
    const sql = source(MIGRATION);
    expect(sql).not.toMatch(/\babn\b/i);
    expect(sql).not.toMatch(/auth\.users|clerk/i);
  });
});
