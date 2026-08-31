import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminRemove: vi.fn(),
  adminUpload: vi.fn(),
  audit: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  insertMaybeSingle: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw Object.assign(new Error(`redirect:${url}`), { url });
  }),
  userUpload: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireCompanyAdmin: vi.fn(async () => ({ user: { id: "user-1" }, companyId: "company-1" })),
  requireWritableCompany: vi.fn(async () => ({ user: { id: "user-1" }, companyId: "company-1" })),
  requireMaintainAdmin: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/actions/match", () => ({ runWorkerKnockouts: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

const { addWorkerQualification } = await import("./actions/worker");

const workerId = "11111111-1111-4111-8111-111111111111";
const qualificationId = "22222222-2222-4222-8222-222222222222";

function qualificationForm(): FormData {
  const formData = new FormData();
  formData.set("worker_id", workerId);
  formData.set("qualification_id", qualificationId);
  formData.set("file", new File(["evidence"], "ticket.pdf", { type: "application/pdf" }));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userUpload.mockResolvedValue({ data: { path: "uploaded" }, error: null });
  mocks.adminUpload.mockResolvedValue({ data: { path: "uploaded" }, error: null });
  mocks.adminRemove.mockResolvedValue({ data: [], error: null });
  mocks.insertMaybeSingle.mockResolvedValue({ data: null, error: { message: "insert denied" } });

  const insertQuery = {
    insert: vi.fn(() => insertQuery),
    select: vi.fn(() => insertQuery),
    maybeSingle: mocks.insertMaybeSingle,
  };
  mocks.createClient.mockResolvedValue({
    storage: { from: vi.fn(() => ({ upload: mocks.userUpload })) },
    from: vi.fn(() => insertQuery),
  });
  mocks.createAdminClient.mockReturnValue({
    storage: {
      from: vi.fn(() => ({ upload: mocks.adminUpload, remove: mocks.adminRemove })),
    },
  });
});

describe("worker qualification evidence storage", () => {
  it("lets the user-scoped storage policy reject a cross-tenant worker path", async () => {
    mocks.userUpload.mockResolvedValue({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    mocks.adminUpload.mockResolvedValue({
      data: null,
      error: { message: "test must not bypass storage RLS" },
    });

    await expect(addWorkerQualification(qualificationForm())).rejects.toMatchObject({
      url: `/app/workers/${workerId}?notice=upload-failed`,
    });
    expect(mocks.userUpload).toHaveBeenCalledOnce();
    expect(mocks.adminUpload).not.toHaveBeenCalled();
    expect(mocks.insertMaybeSingle).not.toHaveBeenCalled();
  });

  it("removes uploaded evidence when the qualification metadata insert fails", async () => {
    await expect(addWorkerQualification(qualificationForm())).rejects.toMatchObject({
      url: `/app/workers/${workerId}?notice=not-permitted`,
    });

    expect(mocks.userUpload).toHaveBeenCalledOnce();
    expect(mocks.adminUpload).not.toHaveBeenCalled();
    const uploadedPath = mocks.userUpload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(new RegExp(`^${workerId}/`));
    expect(mocks.adminRemove).toHaveBeenCalledWith([uploadedPath]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
