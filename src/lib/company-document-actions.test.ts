import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maintain: vi.fn(), company: vi.fn(), admin: vi.fn(), rpc: vi.fn(),
  upload: vi.fn(), remove: vi.fn(), storage: vi.fn(), from: vi.fn(), audit: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireMaintainAdmin: mocks.maintain, requireCompanyAdmin: mocks.company,
  getUser: vi.fn(), isMaintainAdmin: vi.fn(),
}));
vi.mock("@/lib/clerk", () => ({ findUserByEmail: vi.fn(), inviteAdministrator: vi.fn(), userHasSignedIn: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), NOTIFICATION_TRIGGERS: {} }));

const { uploadCompanyDocument, verifyCompanyDocument, saveCompanyDocumentForm } = await import("./actions/company");
const companyId = "19191919-0000-4000-8000-000000000010";
const documentId = "19191919-0000-4000-8000-000000000020";
const adminSection = `/admin/verification?company=${companyId}&section=public_liability`;
const adminDocument = `/admin/verification?company=${companyId}&document=${documentId}`;
function form(fields: Record<string, string | undefined> = {}, file: File | null = new File(["policy"], "policy.pdf", { type: "application/pdf" })) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    company_id: companyId, expected_status: "Pending", as_maintain: "1",
    doc_type: "public_liability", number: "PL-100", issuer: "Insurance Co",
    issue_date: "2026-01-21", expiry_date: "2030-01-21", ...fields,
  })) if (value !== undefined) data.set(key, value);
  if (file) data.set("file", file);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.maintain.mockResolvedValue({ id: "maintain-actor" });
  mocks.company.mockResolvedValue({ user: { id: "company-actor" }, companyId, companyStatus: "Pending" });
  mocks.rpc.mockResolvedValue({ data: { company_id: companyId, document_id: documentId }, error: null });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.storage.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, storage: { from: mocks.storage }, from: mocks.from });
  mocks.redirect.mockImplementation((url: string): never => { throw Object.assign(new Error(url), { url }); });
});

describe("company document evidence saves", () => {
  it.each([null, new File([], "empty.pdf", { type: "application/pdf" })])("requires evidence before any upload or database write", async (file) => {
    await expect(uploadCompanyDocument(form({}, file))).rejects.toMatchObject({
      url: `${adminSection}&error=file_required#checklist-public_liability`,
    });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["payment_details", "abn_verified", "unknown"])("does not create a %s flag through document upload", async (doc_type) => {
    await expect(uploadCompanyDocument(form({ doc_type }))).rejects.toMatchObject({ url: `/admin/verification?company=${companyId}&error=invalid` });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    { issue_date: "2026-02-30" }, { expiry_date: "not-a-date" },
    { issue_date: "2031-01-21", expiry_date: "2030-01-21" },
  ])("rejects invalid calendar dates and reversed date order before storing a file", async (fields) => {
    await expect(uploadCompanyDocument(form(fields))).rejects.toMatchObject({ url: `${adminSection}&error=invalid_dates#checklist-public_liability` });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("enforces the 4 MB file limit before opening storage", async () => {
    const file = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "policy.pdf", { type: "application/pdf" });
    await expect(uploadCompanyDocument(form({}, file))).rejects.toMatchObject({ url: `${adminSection}&error=file_too_large#checklist-public_liability` });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types before opening storage", async () => {
    await expect(uploadCompanyDocument(form({}, new File(["plain"], "policy.txt", { type: "text/plain" })))).rejects.toMatchObject({
      url: `${adminSection}&error=file_type#checklist-public_liability`,
    });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("requires a valid target and displayed status for Maintain uploads", async () => {
    for (const fields of [{ company_id: "bad" }, { expected_status: "" }, { expected_status: "Closed" }]) {
      await expect(uploadCompanyDocument(form(fields))).rejects.toMatchObject({
        url: fields.company_id === "bad" ? "/admin/verification?error=invalid" : `/admin/verification?company=${companyId}&error=invalid`,
      });
    }
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("authenticates Maintain before touching storage", async () => {
    mocks.maintain.mockRejectedValueOnce(new Error("not authorized"));
    await expect(uploadCompanyDocument(form())).rejects.toThrow("not authorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("saves uploaded evidence and its audit atomically then refreshes both views", async () => {
    await expect(uploadCompanyDocument(form())).rejects.toMatchObject({ url: `${adminSection}&saved=document#checklist-public_liability` });
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${companyId}/[a-f0-9-]+-policy\\.pdf$`)), expect.any(File), { contentType: "application/pdf", upsert: false });
    expect(mocks.rpc).toHaveBeenCalledWith("save_company_document_atomic", {
      p_company_id: companyId, p_expected_status: "Pending", p_actor_user_id: "maintain-actor", p_actor_scope: "maintain",
      p_document_id: null, p_doc_type: "public_liability", p_number: "PL-100", p_issuer: "Insurance Co",
      p_issue_date: "2026-01-21", p_expiry_date: "2030-01-21", p_file_path: mocks.upload.mock.calls[0][0],
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/(app)", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/verification");
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidatePath.mock.invocationCallOrder[0]);
  });

  it("derives the customer company and status from authentication", async () => {
    await expect(uploadCompanyDocument(form({ as_maintain: "0", company_id: "forged", expected_status: "Closed" }))).rejects.toMatchObject({
      url: "/app/settings?section=documents&saved=document#company-documents",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("save_company_document_atomic", expect.objectContaining({
      p_company_id: companyId, p_expected_status: "Pending", p_actor_user_id: "company-actor", p_actor_scope: "company",
    }));
    expect(mocks.maintain).not.toHaveBeenCalled();
  });

  it.each(["Suspended", "Closed"])("blocks %s customers before uploads", async (companyStatus) => {
    mocks.company.mockResolvedValueOnce({ user: { id: "company-actor" }, companyId, companyStatus });
    await expect(uploadCompanyDocument(form({ as_maintain: "0" }))).rejects.toMatchObject({ url: "/app/settings?section=documents&error=read_only#company-documents" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("attaches a file to the exact existing row without overwriting policy metadata", async () => {
    const expectedDocument = { number: "PL-100", issuer: "Insurance Co", issue_date: "2026-01-21", expiry_date: "2030-01-21" };
    await expect(uploadCompanyDocument(form({ document_id: documentId, expected_document: JSON.stringify(expectedDocument), issue_date: "invalid", expiry_date: "invalid" }))).rejects.toMatchObject({
      url: `${adminDocument}&saved=document#document-${documentId}`,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("attach_company_document_with_snapshot_atomic", expect.objectContaining({
      p_document_id: documentId, p_number: null, p_issuer: null, p_issue_date: null, p_expiry_date: null,
      p_expected_document: expectedDocument,
    }));
  });

  it("rejects attachment without the displayed metadata snapshot before storing a file", async () => {
    await expect(uploadCompanyDocument(form({ document_id: documentId }))).rejects.toMatchObject({
      url: `${adminDocument}&error=invalid#document-${documentId}`,
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("removes the uploaded object after a definite database rejection", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await expect(uploadCompanyDocument(form())).rejects.toMatchObject({ url: `${adminSection}&error=stale#checklist-public_liability` });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["throw", "transport", "invalid-result"])("does not remove evidence when the commit outcome is uncertain (%s)", async (kind) => {
    if (kind === "throw") mocks.rpc.mockRejectedValueOnce(new Error("connection reset"));
    else mocks.rpc.mockResolvedValueOnce(kind === "transport" ? { data: null, error: { message: "Failed to fetch", code: "" } } : { data: {}, error: null });
    await expect(uploadCompanyDocument(form())).rejects.toMatchObject({ url: `${adminSection}&error=save_failed#checklist-public_liability` });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not save a row after storage fails", async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(uploadCompanyDocument(form())).rejects.toMatchObject({ url: `${adminSection}&error=upload_failed#checklist-public_liability` });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("document verification feedback", () => {
  it("returns to the exact document and refreshes customer settings after verification", async () => {
    await expect(verifyCompanyDocument(form({ document_id: documentId }))).rejects.toMatchObject({
      url: `${adminDocument}&saved=verified#document-${documentId}`,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/settings");
  });

  it("explains unavailable current evidence at the document row", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "a current uploaded document is required" } });
    await expect(verifyCompanyDocument(form({ document_id: documentId }))).rejects.toMatchObject({
      url: `${adminDocument}&error=document_not_ready#document-${documentId}`,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps flag feedback at its own checklist section", async () => {
    await expect(verifyCompanyDocument(form({ doc_type: "payment_details" }))).rejects.toMatchObject({
      url: `/admin/verification?company=${companyId}&section=payment_details&saved=verified#checklist-payment_details`,
    });
  });
});

describe("document details can be saved before evidence", () => {
  const snapshot = { number: "PL-100", issuer: "Insurance Co", issue_date: "2026-01-21", expiry_date: "2030-01-21" };
  const draft = (fields: Record<string, string | undefined> = {}, file: File | null = null) =>
    form({ document_id: documentId, intent: "details", ...fields }, file);
  const saved = () => ({ data: { company_id: companyId, document_id: documentId, snapshot }, error: null });

  it("saves details without a file, returns their snapshot and refreshes both views", async () => {
    mocks.rpc.mockResolvedValueOnce(saved());
    const result = await saveCompanyDocumentForm(null, draft());
    expect(result).toMatchObject({ ok: true, values: { document_id: documentId, expected_document: JSON.stringify(snapshot) } });
    expect(result.message).toContain("remains unverified");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_company_document_details_atomic", {
      p_company_id: companyId, p_expected_status: "Pending", p_actor_user_id: "maintain-actor", p_actor_scope: "maintain",
      p_document_id: documentId, p_doc_type: "public_liability", p_number: "PL-100", p_issuer: "Insurance Co",
      p_issue_date: "2026-01-21", p_expiry_date: "2030-01-21", p_expected_document: null,
    });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/verification");
  });

  it("authenticates an admin and derives the customer tenant independently of submitted fields", async () => {
    mocks.maintain.mockRejectedValueOnce(new Error("forbidden"));
    await expect(saveCompanyDocumentForm(null, draft())).rejects.toThrow("forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce(saved());
    await saveCompanyDocumentForm(null, draft({ as_maintain: "0", company_id: "forged", expected_status: "Closed" }));
    expect(mocks.rpc).toHaveBeenCalledWith("save_company_document_details_atomic", expect.objectContaining({
      p_company_id: companyId, p_expected_status: "Pending", p_actor_user_id: "company-actor", p_actor_scope: "company",
    }));
  });

  it.each(["Suspended", "Closed"])("prevents %s customers saving draft details", async (companyStatus) => {
    mocks.company.mockResolvedValueOnce({ user: { id: "company-actor" }, companyId, companyStatus });
    expect(await saveCompanyDocumentForm(null, draft({ as_maintain: "0" }))).toMatchObject({ ok: false, message: expect.stringContaining("read-only") });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { issue_date: "2026-02-30" }, { issue_date: "2031-01-01", expiry_date: "2030-01-01" },
    { expected_document: "bad JSON" }, { doc_type: "payment_details" }, { document_id: "bad" },
    { number: "", issuer: "", issue_date: "", expiry_date: "" },
  ])("retains failed inputs without saving invalid details", async (fields) => {
    const data = draft(fields);
    const result = await saveCompanyDocumentForm(null, data);
    expect(result.ok).toBe(false);
    for (const [key, value] of Object.entries(fields)) expect(result.values?.[key]).toBe(value);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns stale errors with the entered values and original snapshot intact", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    const result = await saveCompanyDocumentForm(null, draft({ number: "Changed", expected_document: JSON.stringify(snapshot) }));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("Refresh"), values: { number: "Changed", expected_document: JSON.stringify(snapshot) } });
  });

  it("uploads onto the same saved draft id, with no duplicate metadata row", async () => {
    mocks.rpc.mockResolvedValueOnce(saved());
    const result = await saveCompanyDocumentForm(null, draft({ intent: "upload", expected_document: JSON.stringify(snapshot) }, new File(["policy"], "policy.pdf", { type: "application/pdf" })));
    expect(result).toMatchObject({ ok: true, values: { document_id: documentId, file_saved: "1" } });
    expect(mocks.rpc.mock.calls[0][0]).toBe("save_company_document_details_atomic");
    expect(mocks.rpc.mock.calls[1]).toEqual(["attach_company_document_with_snapshot_atomic", expect.objectContaining({ p_document_id: documentId, p_number: null, p_issuer: null, p_expected_document: snapshot })]);
  });

  it("keeps saved details and their snapshot when the subsequent upload fails", async () => {
    mocks.rpc.mockResolvedValueOnce(saved());
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    const result = await saveCompanyDocumentForm(null, draft({ intent: "upload" }, new File(["policy"], "policy.pdf", { type: "application/pdf" })));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("Details saved."), values: { number: "PL-100", expected_document: JSON.stringify(snapshot) } });
    expect(result.values?.file_saved).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("validates the upload before creating even a draft row", async () => {
    expect(await saveCompanyDocumentForm(null, draft({ intent: "upload" }))).toMatchObject({ ok: false, message: expect.stringContaining("Choose a document file") });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
