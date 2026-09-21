import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

const id = (n: number) => `33333333-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("Explicit Maintain company approval on PostgreSQL", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.query(`insert into company(id,legal_name,contact_email)
      values($1,'New Company','company@example.test')`, [id(1)]);
    await db.exec("set role service_role");
  }, 60_000);

  afterEach(async () => { await db.close(); });

  function approve(options: { companyId?: string; expected?: string | null; actor?: string | null } = {}) {
    return db.query<{ result: Record<string, unknown> }>(`select approve_company_as_maintain_atomic(
      $1,$2::company_status,$3
    ) as result`, [
      options.companyId ?? id(1), options.expected === undefined ? "Pending" : options.expected,
      options.actor === undefined ? "maintain-admin" : options.actor,
    ]);
  }

  function standardApproval() {
    return db.query("select transition_company_status_atomic($1,'Pending','Active','maintain-admin')", [id(1)]);
  }

  async function audit() {
    return (await db.query<{
      actor_user_id: string;
      actor_is_system: boolean;
      before_data: Record<string, unknown>;
      after_data: {
        status: string;
        decision: string;
        approval_mode: string;
        outstanding_requirements: Array<{ doc_type: string; is_required: boolean; is_verified: boolean }>;
      };
    }>(`select actor_user_id,actor_is_system,before_data,after_data from audit_event
      where entity_id=$1 and action='company.status_changed'`, [id(1)])).rows;
  }

  it("allows a Maintain decision with all documents missing and audits the outstanding requirements", async () => {
    expect((await approve()).rows).toEqual([{ result: {
      company_id: id(1), status_before: "Pending", status_after: "Active",
      contact_email: "company@example.test", withdrawn_matches: [],
    } }]);
    expect((await db.query("select status from company where id=$1", [id(1)])).rows)
      .toEqual([{ status: "Active" }]);
    const decisions = await audit();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      actor_user_id: "maintain-admin", actor_is_system: false, before_data: { status: "Pending" },
      after_data: { status: "Active", decision: "approved", approval_mode: "maintain_admin" },
    });
    expect(decisions[0].after_data.outstanding_requirements.map((item) => item.doc_type))
      .toEqual(["payment_details", "public_liability", "workers_comp"]);
    expect(decisions[0].after_data.outstanding_requirements.every((item) => item.is_required && !item.is_verified))
      .toBe(true);
    expect((await db.query("select * from company_document where company_id=$1", [id(1)])).rows).toEqual([]);
    expect((await db.query("select * from audit_event where entity_type='company_document'")).rows).toEqual([]);
  });

  it("permits incomplete stored profile information without manufacturing values or ABN verification", async () => {
    await db.query(`update company set legal_name='',contact_email='',contact_name=null,contact_phone=null,
      trading_name=null,industry_id=null,primary_region_id=null,abn='51824753556' where id=$1`, [id(1)]);
    const before = (await db.query<Record<string, unknown>>("select * from company where id=$1", [id(1)])).rows[0];
    await approve();
    expect((await db.query("select * from company where id=$1", [id(1)])).rows)
      .toEqual([{ ...before, status: "Active" }]);
    expect((await audit())[0].after_data.outstanding_requirements.map((item) => item.doc_type))
      .toEqual(["abn_verified", "payment_details", "public_liability", "workers_comp"]);
    expect((await db.query("select * from company_document where company_id=$1", [id(1)])).rows).toEqual([]);
  });

  it("allows expired evidence while preserving every document and auditing only outstanding requirements", async () => {
    await db.query(`insert into company_document(
      id,company_id,doc_type,number,file_path,expiry_date,verified_at,verified_by
    ) values
      ($1,$3,'public_liability','EXPIRED','liability.pdf',current_date-1,now(),'original-reviewer'),
      ($2,$3,'workers_comp','CURRENT','workers.pdf',current_date+365,now(),'original-reviewer')`, [id(10), id(11), id(1)]);
    const documentsBefore = (await db.query("select * from company_document order by id")).rows;
    await expect(standardApproval()).rejects.toThrow("company checklist is incomplete or expired");
    await approve();
    expect((await db.query("select * from company_document order by id")).rows).toEqual(documentsBefore);
    expect((await audit())[0].after_data.outstanding_requirements.map((item) => item.doc_type))
      .toEqual(["payment_details", "public_liability"]);
    expect((await db.query("select * from audit_event where action='company_document.verified'")).rows).toEqual([]);
  });

  it("keeps the existing standard transition strict for missing evidence", async () => {
    await expect(standardApproval()).rejects.toThrow("company checklist is incomplete or expired");
    expect((await db.query("select status from company where id=$1", [id(1)])).rows)
      .toEqual([{ status: "Pending" }]);
    expect(await audit()).toEqual([]);
  });

  it("rejects missing actors without changing the company", async () => {
    for (const actor of [null, "", "  "]) {
      await expect(approve({ actor })).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.query("select status from company where id=$1", [id(1)])).rows)
      .toEqual([{ status: "Pending" }]);
    expect(await audit()).toEqual([]);
  });

  it("requires an explicitly Pending expected state", async () => {
    for (const expected of [null, "Active", "Suspended", "Closed"]) {
      await expect(approve({ expected })).rejects.toMatchObject({ code: "23514" });
    }
    expect(await audit()).toEqual([]);
  });

  it("cannot reactivate Active, Suspended or Closed companies through a stale Pending form", async () => {
    for (const status of ["Active", "Suspended", "Closed"]) {
      await db.query("update company set status=$1::company_status where id=$2", [status, id(1)]);
      await expect(approve()).rejects.toMatchObject({ code: "40001" });
      expect((await db.query("select status from company where id=$1", [id(1)])).rows).toEqual([{ status }]);
    }
    expect(await audit()).toEqual([]);
  });

  it("rejects a missing company and repeated approval without duplicating the decision", async () => {
    await expect(approve({ companyId: id(99) })).rejects.toMatchObject({ code: "23503" });
    await approve();
    await expect(approve()).rejects.toMatchObject({ code: "40001" });
    expect(await audit()).toHaveLength(1);
  });

  it("rolls back activation when the decision audit cannot be saved", async () => {
    await db.exec(`reset role;
      create function pg_temp.fail_maintain_approval_audit() returns trigger language plpgsql as $$
      begin
        if new.action='company.status_changed' then
          raise exception 'injected approval audit failure' using errcode='23514';
        end if;
        return new;
      end;
      $$;
      create trigger fail_maintain_approval_audit before insert on audit_event
        for each row execute function pg_temp.fail_maintain_approval_audit();
      set role service_role;`);
    await expect(approve()).rejects.toThrow("injected approval audit failure");
    expect((await db.query("select status from company where id=$1", [id(1)])).rows)
      .toEqual([{ status: "Pending" }]);
    expect(await audit()).toEqual([]);
  });

  it("grants approval only to service_role", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await expect(approve()).rejects.toMatchObject({ code: "42501" });
    }
    await db.exec("reset role; set role service_role");
    await approve();
    expect(await audit()).toHaveLength(1);
  });
});
