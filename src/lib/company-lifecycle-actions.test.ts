import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), rpc: vi.fn(), notify: vi.fn(), audit: vi.fn(), from: vi.fn(),
  admin: vi.fn(), revalidatePath: vi.fn(),
  redirect: vi.fn((url: string): never => { throw Object.assign(new Error(url), { url }); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireMaintainAdmin: mocks.gate, getUser: vi.fn(), isMaintainAdmin: vi.fn(), requireCompanyAdmin: vi.fn(),
}));
vi.mock("@/lib/clerk", () => ({ findUserByEmail: vi.fn(), inviteAdministrator: vi.fn(), userHasSignedIn: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notify", () => ({
  notify: mocks.notify,
  NOTIFICATION_TRIGGERS: {
    COMPANY_VERIFIED: "company verified", COMPANY_REJECTED: "company rejected", MATCH_WITHDRAWN: "match withdrawn",
  },
}));

const { approveCompany, rejectCompany, verifyCompanyDocument, setCompanyStatus } = await import("./actions/company");
const company = "13131313-0000-4000-8000-000000000010";
const document = "13131313-0000-4000-8000-000000000020";
const match = "13131313-0000-4000-8000-000000000030";
const other = "13131313-0000-4000-8000-000000000011";
function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ company_id: company, expected_status: "Pending", ...fields })) data.set(key, value);
  return data;
}
const outcome = {
  company_id: company, status_before: "Pending", status_after: "Active",
  contact_email: "company@example.test", withdrawn_matches: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ id: "maintain-actor" });
  mocks.rpc.mockResolvedValue({ data: outcome, error: null });
  mocks.notify.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  const query: Record<string, unknown> = { data: [], error: null };
  for (const name of ["select", "update", "insert", "eq", "in", "or"]) query[name] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: { id: company, status: "Pending", contact_email: "company@example.test" }, error: null }));
  query.single = vi.fn(async () => ({ data: { id: document }, error: null }));
  mocks.from.mockReturnValue(query);
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
});

describe("company lifecycle action boundaries", () => {
  it.each([approveCompany, rejectCompany, verifyCompanyDocument, setCompanyStatus])("authenticates before creating the privileged client", async (action) => {
    mocks.gate.mockRejectedValueOnce(new Error("MFA required"));
    await expect(action(form())).rejects.toThrow("MFA required");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([approveCompany, rejectCompany, verifyCompanyDocument, setCompanyStatus])("requires the displayed status instead of overwriting a newer decision", async (action) => {
    const data = form({ reason: "Missing insurance", status: "Closed", doc_type: "payment_details" });
    data.delete("expected_status");
    await expect(action(data)).rejects.toMatchObject({ url: expect.stringContaining("error=invalid") });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("approval surfaces a checklist failure without an email or separate audit", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "company checklist is incomplete or expired" } });
    await expect(approveCompany(form())).rejects.toMatchObject({ url: expect.stringContaining("error=checklist_incomplete") });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("approval uses a Pending-only atomic RPC and server-derived actor", async () => {
    await expect(approveCompany(form({ actor_user_id: "forged" }))).rejects.toMatchObject({ url: "/admin/verification?saved=approved" });
    expect(mocks.rpc).toHaveBeenCalledWith("transition_company_status_atomic", {
      p_company_id: company, p_expected_status: "Pending", p_next_status: "Active", p_actor_user_id: "maintain-actor",
    });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ to: "company@example.test", companyId: company, actionPath: "/app" }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/(app)", "layout");
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("does not create a document-shaped verification flag", async () => {
    await expect(verifyCompanyDocument(form({ doc_type: "public_liability" }))).rejects.toMatchObject({ url: expect.stringContaining("error=invalid") });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("verifies the exact company, document and kind atomically", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { company_id: company, document_id: document }, error: null });
    await expect(verifyCompanyDocument(form({ document_id: document, doc_type: "public_liability" }))).rejects.toMatchObject({ url: expect.stringContaining("saved=verified") });
    expect(mocks.rpc).toHaveBeenCalledWith("verify_company_document_atomic", {
      p_company_id: company, p_document_id: document, p_doc_type: "public_liability", p_expected_status: "Pending",
      p_actor_user_id: "maintain-actor", p_qualification_id: null, p_expected_abn: null,
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("binds ABN verification to the displayed value and reports a stale value without success", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "company ABN changed; refresh before verifying" } });
    await expect(verifyCompanyDocument(form({ doc_type: "abn_verified", expected_abn: "51824753556" }))).rejects.toMatchObject({ url: expect.stringContaining("error=stale") });
    expect(mocks.rpc).toHaveBeenCalledWith("verify_company_document_atomic", {
      p_company_id: company, p_document_id: null, p_doc_type: "abn_verified", p_expected_status: "Pending",
      p_actor_user_id: "maintain-actor", p_qualification_id: null, p_expected_abn: "51824753556",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("verification surfaces missing or mismatched rows", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23503" } });
    await expect(verifyCompanyDocument(form({ document_id: document, doc_type: "public_liability" }))).rejects.toMatchObject({ url: expect.stringContaining("error=not_found") });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("returns a visible error for an unavailable database", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("connection failed"));
    await expect(approveCompany(form())).rejects.toMatchObject({ url: expect.stringContaining("error=save_failed") });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("rejection requires Pending and a reason", async () => {
    await expect(rejectCompany(form({ expected_status: "Active", reason: "Missing insurance" }))).rejects.toMatchObject({ url: expect.stringContaining("error=invalid") });
    expect(mocks.rpc).not.toHaveBeenCalled();
    await expect(rejectCompany(form({ reason: " " }))).rejects.toMatchObject({ url: expect.stringContaining("error=reason_required") });
  });

  it("sends withdrawal notices only after a successful atomic status change", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      ...outcome, status_before: "Active", status_after: "Suspended",
      withdrawn_matches: [{ match_id: match, supplier_company_id: company, supplier_email: "supplier@example.test", buyer_company_id: other, buyer_email: "buyer@example.test" }],
    }, error: null });
    mocks.notify.mockRejectedValueOnce(new Error("email unavailable"));
    await expect(setCompanyStatus(form({ expected_status: "Active", status: "Suspended" }))).rejects.toMatchObject({ url: "/admin/companies?saved=status" });
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ companyId: other, to: "buyer@example.test", entityId: match }));
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/(app)", "layout");
  });

  it("does not notify or report success for a stale status", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await expect(setCompanyStatus(form({ expected_status: "Active", status: "Suspended" }))).rejects.toMatchObject({ url: expect.stringContaining("error=stale") });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
