import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/database";

const id = (n: number) => `34343434-0000-4000-8000-${String(n).padStart(12, "0")}`;
const original = { number: "QC1234", issuer: "Authority", issue_date: "2020-01-01", expiry_date: "2030-12-31" };

describe("Atomic document details saved before evidence", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeEach(async () => {
    db = await createTestDatabase();
    await db.query("insert into company(id,legal_name,contact_email) values($1,'First','first@example.test'),($2,'Second','second@example.test')", [id(1), id(2)]);
    await db.query("insert into company_user(user_id,company_id,invited_email,accepted_at) values('member',$1,'first@example.test',now())", [id(1)]);
    await db.exec("set role service_role");
  }, 60_000);
  afterEach(async () => { await db.close(); });

  const save = (options: {
    companyId?: string; documentId?: string; type?: string; actor?: string; scope?: string; status?: string;
    number?: string; issuer?: string; issued?: string; expires?: string; expected?: unknown;
  } = {}) => db.query<{ result: { company_id: string; document_id: string; snapshot: typeof original } }>(
    "select save_company_document_details_atomic($1,$2::company_status,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11::jsonb) as result",
    [options.companyId ?? id(1), options.status ?? "Pending", options.actor ?? "member", options.scope ?? "company",
      options.documentId ?? id(10), options.type ?? "trade_licence", options.number ?? " QC1234 ", options.issuer ?? " Authority ",
      options.issued ?? original.issue_date, options.expires ?? original.expiry_date, options.expected ? JSON.stringify(options.expected) : null],
  );
  const counts = async () => (await db.query("select (select count(*)::int from company_document) documents, (select count(*)::int from audit_event where entity_type='company_document') audits")).rows[0];

  it("saves the screenshot details with no storage object and leaves verification empty", async () => {
    expect((await save()).rows[0].result).toEqual({ company_id: id(1), document_id: id(10), snapshot: original });
    expect((await db.query("select number,issuer,file_path,verified_at,verified_by from company_document where id=$1", [id(10)])).rows)
      .toEqual([{ number: "QC1234", issuer: "Authority", file_path: null, verified_at: null, verified_by: null }]);
    expect((await db.query("select action,actor_user_id,after_data from audit_event")).rows).toEqual([{
      action: "company_document.details_saved", actor_user_id: "member", after_data: expect.objectContaining({ file_path: null, verified_at: null, admin_entered: false }),
    }]);
    await expect(db.query("select verify_company_document_atomic($1,$2,'trade_licence','Pending','reviewer')", [id(1), id(10)])).rejects.toThrow("a current uploaded document is required");
  });

  it("retries a save without duplicating either the document or its audit", async () => {
    await save();
    await save();
    await save({ expected: original });
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });

  it("updates a displayed draft with an audit and rejects stale edits", async () => {
    await save();
    await save({ expected: original, number: "QC5678" });
    await expect(save({ expected: original, issuer: "Another authority" })).rejects.toMatchObject({ code: "40001" });
    expect((await db.query("select number,issuer from company_document")).rows).toEqual([{ number: "QC5678", issuer: "Authority" }]);
    expect((await db.query("select before_data,after_data from audit_event where action='company_document.details_updated'")).rows).toEqual([{
      before_data: expect.objectContaining({ number: "QC1234" }), after_data: expect.objectContaining({ number: "QC5678", verified_at: null }),
    }]);
    expect(await counts()).toEqual({ documents: 1, audits: 2 });
  });

  it("attaches evidence to the saved row and does not allow later draft edits", async () => {
    await save();
    const path = `${id(1)}/licence.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('company-documents',$1)", [path]);
    await db.query("select attach_company_document_with_snapshot_atomic($1,'Pending','member','company',$2,'trade_licence',null,null,null,null,$3,$4::jsonb)", [id(1), id(10), path, JSON.stringify(original)]);
    expect((await db.query("select number,issuer,file_path,verified_at from company_document")).rows).toEqual([{ number: "QC1234", issuer: "Authority", file_path: path, verified_at: null }]);
    await expect(save({ expected: original, number: "changed" })).rejects.toMatchObject({ code: "40001" });
    expect(await counts()).toEqual({ documents: 1, audits: 2 });
  });

  it("rejects attachment if details changed during upload and preserves the newer draft", async () => {
    await save();
    const path = `${id(1)}/licence.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('company-documents',$1)", [path]);
    await save({ expected: original, number: "CHANGED-WHILE-UPLOADING" });
    await expect(db.query("select attach_company_document_with_snapshot_atomic($1,'Pending','member','company',$2,'trade_licence',null,null,null,null,$3,$4::jsonb)", [id(1), id(10), path, JSON.stringify(original)]))
      .rejects.toMatchObject({ code: "40001" });
    expect((await db.query("select number,file_path,verified_at from company_document")).rows)
      .toEqual([{ number: "CHANGED-WHILE-UPLOADING", file_path: null, verified_at: null }]);
    expect(await counts()).toEqual({ documents: 1, audits: 2 });
  });

  it("cannot replace another company's or another type's draft", async () => {
    await save();
    await expect(save({ companyId: id(2), scope: "maintain", expected: original })).rejects.toMatchObject({ code: "23503" });
    await expect(save({ type: "public_liability", expected: original })).rejects.toMatchObject({ code: "23503" });
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });

  it("requires accepted tenant membership at save time", async () => {
    await expect(save({ actor: "outsider" })).rejects.toMatchObject({ code: "42501" });
    await db.query("update company_user set accepted_at=null where user_id='member'");
    await expect(save()).rejects.toMatchObject({ code: "42501" });
    expect(await counts()).toEqual({ documents: 0, audits: 0 });
  });

  it("checks current company status and blocks customer changes when suspended", async () => {
    await db.query("update company set status='Suspended' where id=$1", [id(1)]);
    await expect(save()).rejects.toMatchObject({ code: "40001" });
    await expect(save({ status: "Suspended" })).rejects.toMatchObject({ code: "23514" });
    await save({ status: "Suspended", scope: "maintain" });
    await db.query("update company set status='Closed' where id=$1", [id(1)]);
    await expect(save({ status: "Closed", scope: "maintain" })).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects inverted dates, reference flags and verified legacy rows", async () => {
    await expect(save({ issued: "2031-01-01" })).rejects.toMatchObject({ code: "23514" });
    await expect(save({ type: "payment_details" })).rejects.toMatchObject({ code: "23514" });
    await save();
    await db.query("update company_document set verified_by='reviewer' where id=$1", [id(10)]);
    await expect(save({ expected: original, number: "changed" })).rejects.toMatchObject({ code: "40001" });
  });

  it("rolls back metadata creation and updates when their audit fails", async () => {
    await save();
    await db.exec(`reset role;
      create function pg_temp.fail_document_audit() returns trigger language plpgsql as $$
      begin raise exception 'audit failed' using errcode='23514'; end; $$;
      create trigger fail_document_audit before insert on audit_event for each row execute function pg_temp.fail_document_audit();
      set role service_role;`);
    await expect(save({ expected: original, number: "changed" })).rejects.toThrow("audit failed");
    await expect(save({ documentId: id(11) })).rejects.toThrow("audit failed");
    expect((await db.query("select number from company_document")).rows).toEqual([{ number: "QC1234" }]);
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });

  it("grants the new RPC only to the service role", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await expect(save()).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select attach_company_document_with_snapshot_atomic($1,'Pending','member','company',$2,'trade_licence',null,null,null,null,'file',$3::jsonb)", [id(1), id(10), JSON.stringify(original)]))
        .rejects.toMatchObject({ code: "42501" });
    }
    await db.exec("reset role; set role service_role");
    await save();
    expect(await counts()).toEqual({ documents: 1, audits: 1 });
  });
});
