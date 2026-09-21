import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

const id = (n: number) => `32323232-0000-4000-8000-${String(n).padStart(12, "0")}`;
const filePath = `${id(1)}/insurance.pdf`;

describe("Atomic company document uploads and missing-file recovery", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.query(`insert into company(id,legal_name,contact_email) values
      ($1,'First Company','first@example.test'),($2,'Second Company','second@example.test')`, [id(1), id(2)]);
    await db.query(`insert into company_user(user_id,company_id,invited_email,accepted_at)
      values('company-admin',$1,'first@example.test',now())`, [id(1)]);
    await db.query("insert into storage.objects(bucket_id,name) values('company-documents',$1)", [filePath]);
    await db.exec("set role service_role");
  }, 60_000);

  afterEach(async () => { await db.close(); });

  function save(options: {
    companyId?: string;
    status?: string | null;
    actor?: string | null;
    scope?: string | null;
    documentId?: string | null;
    type?: string | null;
    number?: string | null;
    issuer?: string | null;
    issued?: string | null;
    expires?: string | null;
    path?: string | null;
  } = {}) {
    return db.query<{ result: { company_id: string; document_id: string } }>(`select save_company_document_atomic(
      $1,$2::company_status,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11
    ) as result`, [
      options.companyId ?? id(1), options.status === undefined ? "Pending" : options.status,
      options.actor === undefined ? "maintain-admin" : options.actor,
      options.scope === undefined ? "maintain" : options.scope,
      options.documentId ?? null, options.type === undefined ? "public_liability" : options.type,
      options.number === undefined ? " POLICY-1 " : options.number,
      options.issuer === undefined ? " Insurer " : options.issuer,
      options.issued === undefined ? "2020-01-01" : options.issued,
      options.expires === undefined ? "2030-01-01" : options.expires,
      options.path === undefined ? filePath : options.path,
    ]);
  }

  async function seedMissingDocument() {
    await db.query(`insert into company_document(
      id,company_id,doc_type,number,issuer,issue_date,expiry_date,status
    ) values($1,$2,'public_liability','ORIGINAL-1','Original Insurer','2021-01-01','2031-01-01','Current')`, [id(10), id(1)]);
  }

  async function counts() {
    return (await db.query(`select
      (select count(*)::int from company_document) as documents,
      (select count(*)::int from audit_event where entity_type='company_document') as audits`)).rows[0];
  }

  it("creates the uploaded document and its complete audit atomically", async () => {
    const { document_id } = (await save()).rows[0].result;
    expect((await db.query("select * from company_document where id=$1", [document_id])).rows[0])
      .toMatchObject({
        company_id: id(1), doc_type: "public_liability", number: "POLICY-1", issuer: "Insurer",
        file_path: filePath, status: "Current", verified_at: null, verified_by: null,
      });
    expect((await db.query(`select actor_user_id,action,before_data,after_data
      from audit_event where entity_id=$1`, [document_id])).rows).toEqual([{
      actor_user_id: "maintain-admin", action: "company_document.created", before_data: null,
      after_data: expect.objectContaining({
        id: document_id, company_id: id(1), file_path: filePath, admin_entered: true,
        number: "POLICY-1", issuer: "Insurer", verified_at: null,
      }),
    }]);
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });

  it("attaches a missing file while preserving every submitted metadata field", async () => {
    await seedMissingDocument();
    const before = (await db.query<Record<string, unknown>>("select * from company_document where id=$1", [id(10)])).rows[0];
    expect((await save({ documentId: id(10), number: "overwrite", issuer: "overwrite", issued: "2040-01-01" })).rows)
      .toEqual([{ result: { company_id: id(1), document_id: id(10) } }]);
    expect((await db.query("select * from company_document where id=$1", [id(10)])).rows)
      .toEqual([{ ...before, file_path: filePath }]);
    expect((await db.query("select action,before_data,after_data from audit_event where entity_id=$1", [id(10)])).rows)
      .toEqual([{
        action: "company_document.file_attached",
        before_data: expect.objectContaining({ file_path: null, number: "ORIGINAL-1" }),
        after_data: expect.objectContaining({ file_path: filePath, number: "ORIGINAL-1", admin_entered: true }),
      }]);
    await expect(save({ documentId: id(10) })).rejects.toMatchObject({ code: "40001" });
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });

  it("activates only after recovered insurance files are verified and payment is confirmed", async () => {
    await seedMissingDocument();
    const activate = () => db.query(`select transition_company_status_atomic(
      $1,'Pending','Active','maintain-admin'
    ) as result`, [id(1)]);
    await expect(activate()).rejects.toThrow("company checklist is incomplete or expired");

    // Recover the original public liability record, then create a workers comp
    // document using its own uploaded object. Neither operation verifies evidence.
    await save({ documentId: id(10) });
    const workersCompPath = `${id(1)}/workers-comp.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('company-documents',$1)", [workersCompPath]);
    const workersCompId = (await save({ type: "workers_comp", path: workersCompPath })).rows[0].result.document_id;
    expect((await db.query(`select doc_type,is_verified from company_verification_checklist($1)
      where doc_type in ('public_liability','workers_comp') order by doc_type`, [id(1)])).rows)
      .toEqual([
        { doc_type: "public_liability", is_verified: false },
        { doc_type: "workers_comp", is_verified: false },
      ]);
    await expect(activate()).rejects.toThrow("company checklist is incomplete or expired");

    await db.query(`select verify_company_document_atomic(
      $1,$2,'public_liability','Pending','maintain-admin'
    )`, [id(1), id(10)]);
    await db.query(`select verify_company_document_atomic(
      $1,$2,'workers_comp','Pending','maintain-admin'
    )`, [id(1), workersCompId]);
    expect((await db.query(`select doc_type from company_verification_checklist($1)
      where is_required and not is_verified`, [id(1)])).rows)
      .toEqual([{ doc_type: "payment_details" }]);
    await expect(activate()).rejects.toThrow("company checklist is incomplete or expired");

    await db.query(`select verify_company_document_atomic(
      $1,null,'payment_details','Pending','maintain-admin'
    )`, [id(1)]);
    expect((await db.query(`select doc_type from company_verification_checklist($1)
      where is_required and not is_verified`, [id(1)])).rows).toEqual([]);
    expect((await activate()).rows[0]).toMatchObject({
      result: { company_id: id(1), status_before: "Pending", status_after: "Active" },
    });
    expect((await db.query("select status from company where id=$1", [id(1)])).rows)
      .toEqual([{ status: "Active" }]);
    expect((await db.query(`select before_data,after_data from audit_event
      where entity_id=$1 and action='company.status_changed'`, [id(1)])).rows)
      .toEqual([{
        before_data: { status: "Pending" },
        after_data: expect.objectContaining({ status: "Active", decision: "approved" }),
      }]);
    expect((await db.query("select number,issuer,file_path from company_document where id=$1", [id(10)])).rows)
      .toEqual([{ number: "ORIGINAL-1", issuer: "Original Insurer", file_path: filePath }]);
  });

  it.each([false, true])("rolls back %s attachment/creation if its audit cannot be written", async (attach) => {
    if (attach) await seedMissingDocument();
    await db.exec(`reset role;
      create function pg_temp.fail_document_audit() returns trigger language plpgsql as $$
      begin raise exception 'injected audit failure' using errcode='23514'; end;
      $$;
      create trigger fail_document_audit before insert on audit_event
        for each row execute function pg_temp.fail_document_audit();
      set role service_role;`);
    await expect(save({ documentId: attach ? id(10) : null })).rejects.toThrow("injected audit failure");
    expect(await counts()).toEqual({ documents: attach ? 1 : 0, audits: 0 });
    if (attach) {
      expect((await db.query("select file_path from company_document where id=$1", [id(10)])).rows)
        .toEqual([{ file_path: null }]);
    }
  });

  it.each([null, "", "   ", `${id(2)}/insurance.pdf`, `${id(1)}/`, `${id(1)}/missing.pdf`])(
    "rejects an absent or incorrectly scoped uploaded object: %s", async (path) => {
      await expect(save({ path })).rejects.toMatchObject({ code: "23514" });
      expect(await counts()).toEqual({ documents: 0, audits: 0 });
    },
  );

  it("does not accept an object from another bucket", async () => {
    await db.query("update storage.objects set bucket_id='worker-qualifications' where name=$1", [filePath]);
    await expect(save()).rejects.toThrow("uploaded company document file does not exist");
    expect(await counts()).toEqual({ documents: 0, audits: 0 });
  });

  it.each([null, "", "abn_verified", "payment_details", "unknown"])(
    "rejects non-uploadable document type %s", async (type) => {
      await expect(save({ type })).rejects.toMatchObject({ code: "23514" });
      expect(await counts()).toEqual({ documents: 0, audits: 0 });
    },
  );

  it.each(["public_liability", "workers_comp", "trade_licence", "lh_licence"])(
    "supports %s with nullable dates and no verification", async (type) => {
      const { document_id } = (await save({ type, issued: null, expires: null })).rows[0].result;
      expect((await db.query("select issue_date,expiry_date,status,verified_at,verified_by from company_document where id=$1", [document_id])).rows)
        .toEqual([{ issue_date: null, expiry_date: null, status: "Current", verified_at: null, verified_by: null }]);
    },
  );

  it("rejects reversed dates on new documents", async () => {
    await expect(save({ issued: "2031-01-01", expires: "2030-01-01" })).rejects.toMatchObject({ code: "23514" });
    expect(await counts()).toEqual({ documents: 0, audits: 0 });
  });

  it("cannot attach to another company, a different type or a missing record", async () => {
    await seedMissingDocument();
    await expect(save({ documentId: id(10), type: "workers_comp" })).rejects.toMatchObject({ code: "23503" });
    await expect(save({ documentId: id(99) })).rejects.toMatchObject({ code: "23503" });
    await db.query("update company_document set company_id=$1 where id=$2", [id(2), id(10)]);
    await expect(save({ documentId: id(10) })).rejects.toMatchObject({ code: "23503" });
    expect(await counts()).toEqual({ documents: 1, audits: 0 });
  });

  it.each(["file", "verified_at", "verified_by"])("cannot attach to a row with %s already set", async (field) => {
    await seedMissingDocument();
    if (field === "file") await db.query("update company_document set file_path='original.pdf' where id=$1", [id(10)]);
    else if (field === "verified_at") await db.query("update company_document set verified_at=now() where id=$1", [id(10)]);
    else await db.query("update company_document set verified_by='reviewer' where id=$1", [id(10)]);
    const before = (await db.query("select * from company_document where id=$1", [id(10)])).rows;
    await expect(save({ documentId: id(10) })).rejects.toMatchObject({ code: "40001" });
    expect((await db.query("select * from company_document where id=$1", [id(10)])).rows).toEqual(before);
    expect(await counts()).toEqual({ documents: 1, audits: 0 });
  });

  it("rejects a stale company status", async () => {
    await db.query("update company set status='Active' where id=$1", [id(1)]);
    await expect(save()).rejects.toMatchObject({ code: "40001" });
    expect(await counts()).toEqual({ documents: 0, audits: 0 });
  });

  it("requires an accepted company membership at the time of saving", async () => {
    await expect(save({ scope: "company", actor: "not-a-member" })).rejects.toMatchObject({ code: "42501" });
    await db.query("update company_user set accepted_at=null where user_id='company-admin'");
    await expect(save({ scope: "company", actor: "company-admin" })).rejects.toMatchObject({ code: "42501" });
    expect(await counts()).toEqual({ documents: 0, audits: 0 });
  });

  it.each(["Pending", "Active"])("allows accepted members to upload for a %s company", async (status) => {
    await db.query("update company set status=$1::company_status where id=$2", [status, id(1)]);
    await save({ status, scope: "company", actor: "company-admin" });
    expect((await db.query("select actor_user_id,after_data->>'admin_entered' as admin_entered from audit_event")).rows)
      .toEqual([{ actor_user_id: "company-admin", admin_entered: "false" }]);
  });

  it("allows Maintain but not company members to upload while Suspended and blocks Closed", async () => {
    await db.query("update company set status='Suspended' where id=$1", [id(1)]);
    await expect(save({ status: "Suspended", scope: "company", actor: "company-admin" }))
      .rejects.toMatchObject({ code: "23514" });
    await save({ status: "Suspended" });
    await db.query("update company set status='Closed' where id=$1", [id(1)]);
    await expect(save({ status: "Closed" })).rejects.toMatchObject({ code: "23514" });
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });

  it("explicitly rejects missing actors, scope and expected status", async () => {
    for (const options of [{ actor: null }, { actor: " " }, { scope: null }, { scope: "owner" }]) {
      await expect(save(options)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(save({ status: null })).rejects.toMatchObject({ code: "23514" });
    expect(await counts()).toEqual({ documents: 0, audits: 0 });
  });

  it("grants execution only to the service role", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await expect(save()).rejects.toMatchObject({ code: "42501" });
    }
    await db.exec("reset role; set role service_role");
    await save();
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });
});
