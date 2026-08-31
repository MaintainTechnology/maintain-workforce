import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const hardeningPath = join(
  root,
  "supabase",
  "migrations",
  "20260828000300_tenant_write_hardening.sql",
);

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function hardeningSql(): string {
  return readFileSync(hardeningPath, "utf8");
}

function policy(sql: string, name: string): string {
  return sql.match(new RegExp(`create\\s+policy\\s+${name}\\b[\\s\\S]*?;`, "i"))?.[0] ?? "";
}

function sqlFunction(sql: string, name: string): string {
  return (
    sql.match(
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+${name}\\b[\\s\\S]*?\\n\\$\\$;`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

describe("tenant write hardening migration", () => {
  it("preserves accepted-membership tenancy and derives status gates from it", () => {
    const membership = source(
      "supabase/migrations/20260828000200_accepted_company_membership.sql",
    );
    const sql = hardeningSql();

    expect(membership).toMatch(
      /select\s+company_id\s+from\s+company_user[\s\S]*accepted_at\s+is\s+not\s+null/i,
    );
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+current_company_id/i);
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+current_company_has_status[\s\S]*current_company_id\(\)/i,
    );
  });

  it("allows profile-column updates but withholds company status", () => {
    const sql = hardeningSql();
    const updateGrant = sql.match(
      /grant\s+update\s*\([\s\S]*?\)\s+on\s+(?:table\s+)?company\s+to\s+authenticated\s*;/i,
    )?.[0];

    expect(sql).toMatch(
      /revoke\s+update\s+on\s+(?:table\s+)?company\s+from\s+authenticated\s*;/i,
    );
    expect(updateGrant).toBeTruthy();
    expect(updateGrant).toContain("legal_name");
    expect(updateGrant).toContain("primary_region_id");
    expect(updateGrant).not.toMatch(/\bstatus\b/i);
    expect(policy(sql, "company_own_update")).toMatch(
      /current_company_has_status\s*\(\s*array\s*\[[\s\S]*'Pending'[\s\S]*'Active'/i,
    );
  });

  it("keeps document reads tenant-scoped and removes authenticated verification writes", () => {
    const baseRls = source("supabase/migrations/20260825000200_rls.sql");
    const sql = hardeningSql();

    expect(policy(baseRls, "company_document_read")).toMatch(
      /company_id\s*=\s*current_company_id\(\)/i,
    );
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+company_document_write/i);
    expect(sql).toMatch(
      /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+(?:table\s+)?company_document\s+from\s+authenticated/i,
    );
    const documentGrants = Array.from(sql.matchAll(/\bgrant\b[\s\S]*?;/gi))
      .map(([statement]) => statement)
      .filter((statement) => /\bcompany_document\b/i.test(statement));
    expect(documentGrants).toEqual([]);
  });

  it("allows Active-only marketplace creation but removes direct updates and hard deletes", () => {
    const sql = hardeningSql();
    const tables = [
      "capacity_listing",
      "capacity_line",
      "capacity_line_travel_region",
      "capacity_line_worker",
      "demand_request",
      "demand_line",
      "demand_line_skill",
      "demand_line_qualification",
    ];

    for (const table of tables) {
      expect(policy(sql, `${table}_select`), `${table} SELECT policy`).toMatch(/for\s+select/i);
      expect(policy(sql, `${table}_insert_active`), `${table} INSERT policy`).toMatch(
        /for\s+insert[\s\S]*current_company_has_status\s*\(\s*array\s*\[[\s\S]*'Active'/i,
      );
      expect(policy(sql, `${table}_update_active`)).toBe("");
      expect(policy(sql, `${table}_delete_active`)).toBe("");
    }

    expect(sql).toMatch(
      /revoke\s+update\s*,\s*delete\s+on\s+(?:table\s+)?capacity_listing[\s\S]*demand_line_qualification[\s\S]*from\s+anon\s*,\s*authenticated/i,
    );

    for (const table of ["capacity_listing", "capacity_line", "demand_request", "demand_line"]) {
      const grant = sql.match(
        new RegExp(
          `grant\\s+insert\\s*\\([\\s\\S]*?\\)\\s+on\\s+(?:table\\s+)?${table}\\s+to\\s+authenticated\\s*;`,
          "i",
        ),
      )?.[0];
      expect(grant, `${table} has an explicit INSERT column grant`).toBeTruthy();
      expect(grant).not.toMatch(/\bstatus\b|admin_entered|evidence_note/i);
    }

    for (const oldPolicy of [
      "capacity_listing_rw",
      "capacity_line_rw",
      "capacity_line_travel_rw",
      "capacity_line_worker_rw",
      "demand_request_rw",
      "demand_line_rw",
      "demand_line_skill_rw",
      "demand_line_qual_rw",
    ]) {
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${oldPolicy}`, "i"));
    }
  });

  it("enforces listing/request ownership and current employment for worker joins", () => {
    const sql = hardeningSql();
    const capacityInsert = policy(sql, "capacity_line_insert_active");
    const demandInsert = policy(sql, "demand_line_insert_active");
    const workerInsert = policy(sql, "capacity_line_worker_insert_active");

    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*listing_id\s*,\s*company_id\s*\)[\s\S]*references\s+capacity_listing\s*\(\s*id\s*,\s*company_id\s*\)/i,
    );
    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*request_id\s*,\s*company_id\s*\)[\s\S]*references\s+demand_request\s*\(\s*id\s*,\s*company_id\s*\)/i,
    );
    expect(capacityInsert).toMatch(/capacity_listing[\s\S]*listing_id[\s\S]*company_id/i);
    expect(demandInsert).toMatch(/demand_request[\s\S]*request_id[\s\S]*company_id/i);
    expect(workerInsert).toMatch(/worker_employment/i);
    expect(workerInsert).toMatch(/end_date\s+is\s+null/i);
    expect(workerInsert).toMatch(/we\.company_id\s*=\s*l\.company_id/i);
  });

  it("makes Suspended and Closed companies read-only across crew data", () => {
    const sql = hardeningSql();
    const workerTables = [
      "worker",
      "worker_travel_region",
      "worker_skill",
      "worker_qualification",
    ];

    for (const table of workerTables) {
      expect(policy(sql, `${table}_select`), `${table} SELECT policy`).toMatch(/for\s+select/i);
      for (const command of ["insert", "update"] as const) {
        const block = policy(sql, `${table}_${command}_writable`);
        expect(block, `${table} ${command.toUpperCase()} policy`).toMatch(
          new RegExp(`for\\s+${command}`, "i"),
        );
        expect(block, `${table} ${command.toUpperCase()} company-status gate`).toMatch(
          /current_company_has_status\s*\(\s*array\s*\[[\s\S]*'Pending'[\s\S]*'Active'/i,
        );
        expect(block, `${table} ${command.toUpperCase()} employment gate`).toMatch(
          /current_company_employs/i,
        );
      }
      expect(policy(sql, `${table}_delete_writable`)).toBe("");
    }

    for (const oldPolicy of [
      "worker_read",
      "worker_write",
      "worker_travel_read",
      "worker_skill_rw",
      "worker_qual_rw",
    ]) {
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${oldPolicy}`, "i"));
    }

    for (const command of ["insert", "update"] as const) {
      expect(policy(sql, `worker_${command}_writable`)).toMatch(
        /status\s+in\s*\([\s\S]*'Active'[\s\S]*'Inactive'/i,
      );
    }
    expect(policy(sql, "worker_update_writable").match(/status\s+in\s*\(/gi)).toHaveLength(2);

    for (const table of ["worker_travel_region", "worker_skill", "worker_qualification"]) {
      for (const command of ["insert", "update"] as const) {
        expect(policy(sql, `${table}_${command}_writable`)).toMatch(
          /from\s+worker\s+w[\s\S]*w\.status\s+in/i,
        );
      }
    }

    expect(sql).toMatch(
      /revoke\s+delete\s+on\s+(?:table\s+)?worker[\s\S]*worker_qualification[\s\S]*from\s+anon\s*,\s*authenticated/i,
    );

    const workerUpdateGrant = sql.match(
      /grant\s+update\s*\([^;]*\)\s+on\s+(?:table\s+)?worker\s+to\s+authenticated\s*;/i,
    )?.[0];
    expect(workerUpdateGrant).toBeTruthy();
    expect(workerUpdateGrant).toMatch(
      /first_name[\s\S]*last_name[\s\S]*mobile[\s\S]*email[\s\S]*base_region_id/i,
    );
    expect(workerUpdateGrant).not.toMatch(
      /\bstatus\b|primary_proficiency_id|proficiency_assigned_by|proficiency_overridden_by_maintain|proficiency_changed_at|consent_confirmed|\bid\b|user_id|created_at/i,
    );
  });

  it("locks projection views to authenticated SELECT only", () => {
    const sql = hardeningSql();
    const views = [
      "buyer_match_view",
      "supplier_match_view",
      "buyer_engagement_view",
      "supplier_engagement_view",
      "company_transfer_view",
    ];

    const revoke =
      [...sql.matchAll(/revoke\s+all\s+on[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/gi)]
        .map((match) => match[0])
        .find((statement) => statement.includes("buyer_match_view")) ?? "";
    const grant =
      sql.match(/grant\s+select\s+on[\s\S]*?to\s+authenticated\s*;/i)?.[0] ?? "";
    for (const view of views) {
      expect(revoke).toContain(view);
      expect(grant).toContain(view);
    }
    const mutationGrants = [
      ...sql.matchAll(/grant\s+(?:insert|update|delete|all)[^;]*;/gi),
    ].map((match) => match[0]);
    expect(mutationGrants.filter((statement) => /_view\b/i.test(statement))).toEqual([]);
  });

  it("routes worker status and marketplace edits through audited transition RPCs", () => {
    const sql = hardeningSql();
    const workerAction = source("src/lib/actions/worker.ts");
    const orchestration = source("src/lib/match-orchestration.ts");
    const functions = [
      "set_company_worker_status",
      "update_company_capacity_line",
      "withdraw_company_capacity_line",
      "update_company_demand_line",
      "withdraw_company_demand_line",
    ];

    for (const name of functions) {
      const block = sqlFunction(sql, name);
      expect(block, `${name} exists`).toBeTruthy();
      expect(block, `${name} derives accepted tenant authority`).toMatch(/current_company_id\(\)/i);
      expect(block, `${name} checks company status`).toMatch(/current_company_has_status/i);
      expect(block, `${name} writes its audit atomically`).toMatch(
        /insert\s+into\s+audit_event/i,
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+${name}[\\s\\S]*from\\s+public\\s*,\\s*anon`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+${name}[\\s\\S]*to\\s+authenticated`,
          "i",
        ),
      );
    }

    for (const name of [
      "update_company_capacity_line",
      "withdraw_company_capacity_line",
      "update_company_demand_line",
      "withdraw_company_demand_line",
    ]) {
      expect(sqlFunction(sql, name)).toMatch(/Awaiting Supplier[\s\S]*Awaiting Buyer/i);
    }
    expect(sqlFunction(sql, "update_company_capacity_line")).toMatch(
      /status\s*<>\s*'Open'[\s\S]*(?:Awaiting Commercial|Confirmed|Active)/i,
    );
    const capacityWithdrawal = sqlFunction(sql, "withdraw_company_capacity_line");
    const demandUpdate = sqlFunction(sql, "update_company_demand_line");
    const demandWithdrawal = sqlFunction(sql, "withdraw_company_demand_line");
    expect(capacityWithdrawal).toMatch(/status\s+not\s+in\s*\(\s*'Open'\s*,\s*'Partially Committed'/i);
    expect(capacityWithdrawal).not.toMatch(/from\s+engagement/i);
    expect(demandUpdate).toMatch(/status\s+not\s+in\s*\(\s*'Open'\s*,\s*'Partially Filled'/i);
    expect(demandUpdate).toMatch(/count\s*\(\s*distinct\s+ew\.worker_id\s*\)/i);
    expect(demandUpdate).not.toMatch(/from\s+engagement\s+e[\s\S]*raise\s+exception\s+'committed demand/i);
    expect(demandWithdrawal).toMatch(/status\s+not\s+in\s*\(\s*'Open'\s*,\s*'Partially Filled'/i);
    expect(demandWithdrawal).not.toMatch(/from\s+engagement/i);
    expect(sqlFunction(sql, "set_company_worker_status")).toMatch(
      /p_expected_status[\s\S]*for\s+update[\s\S]*match_worker[\s\S]*match\.auto_declined[\s\S]*knocked_out_match_ids/i,
    );
    expect(sqlFunction(sql, "set_company_worker_status")).toMatch(
      /p_actor_user_id[\s\S]*service_role[\s\S]*'Suspended'/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+set_company_worker_status\s*\(\s*uuid\s*,\s*worker_status\s*,\s*worker_status\s*,\s*text\s*\)[\s\S]*authenticated[\s\S]*service_role/i,
    );
    expect(workerAction).toMatch(
      /maintainSetWorkerStatus[\s\S]*rpc\(\s*"set_company_worker_status"[\s\S]*p_actor_user_id:\s*user\.id/i,
    );
    expect(sqlFunction(sql, "set_company_worker_status")).toMatch(
      /buyer_renotification_match_ids/i,
    );
    expect(workerAction).toMatch(/buyerRenotificationMatchIds/i);
    expect(orchestration).toMatch(
      /buyerRenotificationMatchIds[\s\S]*buyerCompanyId[\s\S]*NOMINATION_KNOCKED_OUT/i,
    );

    expect(source("src/lib/actions/worker.ts")).toMatch(
      /rpc\(\s*"set_company_worker_status"/i,
    );
    expect(source("src/lib/actions/capacity.ts")).toMatch(
      /rpc\(\s*"update_company_capacity_line"/i,
    );
    expect(source("src/lib/actions/capacity.ts")).toMatch(
      /rpc\(\s*"withdraw_company_capacity_line"/i,
    );
    expect(source("src/lib/actions/demand.ts")).toMatch(
      /rpc\(\s*"update_company_demand_line"/i,
    );
    expect(source("src/lib/actions/demand.ts")).toMatch(
      /rpc\(\s*"withdraw_company_demand_line"/i,
    );
  });

  it("validates every capacity worker link in the database", () => {
    const sql = hardeningSql();
    const trigger = sqlFunction(sql, "enforce_capacity_line_worker_eligibility");

    expect(sql).toMatch(
      /do\s+\$\$[\s\S]*capacity_line_worker[\s\S]*worker_employment[\s\S]*end_date\s+is\s+null[\s\S]*primary_trade_id[\s\S]*primary_proficiency_id[\s\S]*raise\s+exception/i,
    );
    expect(trigger).toMatch(/worker_employment[\s\S]*end_date\s+is\s+null/i);
    expect(trigger).toMatch(
      /company_id[\s\S]*primary_trade_id[\s\S]*primary_proficiency_id/i,
    );
    expect(sql).toMatch(
      /create\s+trigger\s+capacity_line_worker_eligibility[\s\S]*before\s+insert\s+or\s+update/i,
    );
  });

  it("uses an immutable commercial marker for identity disclosure", () => {
    const sql = hardeningSql();
    const lifecycleSql = source(
      "supabase/migrations/20260828000600_transactional_engagement_lifecycle.sql",
    );
    const engagementAction = source("src/lib/actions/engagement.ts");
    const matching = source("src/lib/matching.ts");

    expect(sql).toMatch(
      /alter\s+table\s+engagement[\s\S]*add\s+column\s+commercial_confirmed_at\s+timestamptz/i,
    );
    expect(sql).toMatch(/create\s+trigger\s+engagement_commercial_marker_immutable/i);
    expect(sql).toMatch(
      /case\s+when\s+e\.commercial_confirmed_at\s+is\s+not\s+null\s+then\s+e\.supplier_company_id/i,
    );
    expect(sql).toMatch(
      /case\s+when\s+e\.commercial_confirmed_at\s+is\s+not\s+null\s+then\s+e\.buyer_company_id/i,
    );
    expect(engagementAction).toMatch(/\.rpc\("record_engagement_payment"/i);
    expect(lifecycleSql).toMatch(/commercial_confirmed_at\s*=\s*v_now/i);
    expect(matching).toMatch(/row\.commercial_confirmed_at\s*!=\s*null/i);
    expect(matching).toMatch(/revealed:\s*boolean/i);
    expect(matching).toMatch(/revealed,\s*[\r\n]/i);
    expect(source("src/app/(app)/app/engagements/[id]/page.tsx")).toMatch(
      /const\s+revealed\s*=\s*engagement\.revealed/i,
    );
    expect(matching).not.toMatch(
      /revealed\s*=\s*status\s*!==\s*"Awaiting Commercial"/i,
    );
  });

  it("keeps the existing engagement transition callable by the service role", () => {
    expect(hardeningSql()).toMatch(
      /grant\s+execute\s+on\s+function\s+set_engagement_status\s*\(\s*uuid\s*,\s*engagement_status\s*,\s*date\s*\)\s+to\s+service_role/i,
    );
  });

  it("removes direct authenticated storage reads", () => {
    const sql = hardeningSql();

    expect(sql).toMatch(
      /drop\s+policy\s+if\s+exists\s+company_documents_read\s+on\s+storage\.objects/i,
    );
    expect(sql).toMatch(
      /drop\s+policy\s+if\s+exists\s+worker_qualifications_read\s+on\s+storage\.objects/i,
    );
    expect(sql).not.toMatch(
      /create\s+policy\s+(?:company_documents_read|worker_qualifications_read)/i,
    );
  });

  it("makes live RLS verification fail-closed and non-vacuous in required mode", () => {
    const integration = source("src/lib/rls.integration.test.ts");
    const configuration = source("scripts/validate-rls-fixtures.mjs");

    expect(integration).toContain("RLS_TEST_REQUIRED");
    expect(integration).toContain("readRlsFixtureConfig(process.env)");
    expect(configuration).toContain('read("RLS_TEST_REQUIRED") === "1"');
    expect(configuration).toMatch(/if\s*\(missing\.length > 0\)[\s\S]*throw\s+new\s+Error/i);
    expect(integration).toContain('toBe("42501")');
    expect(configuration).toMatch(/RLS_TEST_PENDING_CLERK_USER_ID/);
    expect(configuration).toMatch(/RLS_TEST_SUSPENDED_CLERK_USER_ID/);
    expect(configuration).toMatch(/RLS_TEST_CLOSED_CLERK_USER_ID/);
    expect(integration).toContain("createClerkRlsClients");
    expect(integration).toMatch(/closeFixtureSessions = fixture\.close;[\s\S]*await fixture\.ready/);
    expect(integration).not.toContain("signInWithPassword");
    expect(integration).toMatch(/toBeGreaterThan\(0\)/);
    expect(integration).toMatch(/forbidden projection mutations/i);
  });

  it("keeps profile-region and storage writes limited to Pending or Active companies", () => {
    const sql = hardeningSql();

    expect(policy(sql, "company_region_write")).toMatch(
      /current_company_has_status\s*\(\s*array\s*\[[\s\S]*'Pending'[\s\S]*'Active'/i,
    );
    for (const name of ["company_documents_write", "worker_qualifications_write"]) {
      expect(policy(sql, name)).toMatch(
        /current_company_has_status\s*\(\s*array\s*\[[\s\S]*'Pending'[\s\S]*'Active'/i,
      );
    }
  });

  it("retains tenant-gated storage writes and protected base-table revokes", () => {
    const baseRls = source("supabase/migrations/20260825000200_rls.sql");
    const sql = hardeningSql();

    expect(policy(sql, "company_documents_write")).toMatch(
      /storage\.foldername\(name\)[\s\S]*current_company_id\(\)/i,
    );
    expect(policy(sql, "worker_qualifications_write")).toMatch(
      /current_company_employs/i,
    );
    expect(baseRls).toMatch(/revoke\s+all\s+on\s+rate_band\s+from\s+authenticated/i);
    expect(baseRls).toMatch(/revoke\s+all\s+on\s+match[\s\S]*from\s+authenticated/i);
    expect(sql).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)[^;]*\bon\s+(?:table\s+)?(?:rate_band|match|engagement)\b[^;]*authenticated/i,
    );
  });

  it("revokes TRUNCATE because row-level security does not apply to it", () => {
    const sql = hardeningSql();

    expect(sql).toMatch(
      /revoke\s+truncate\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon\s*,\s*authenticated/i,
    );
  });
});
