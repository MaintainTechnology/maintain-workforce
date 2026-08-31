import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  invite: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw Object.assign(new Error(url), { url });
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: mocks.gate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/clerk", () => ({ inviteAdministrator: mocks.invite }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/notify", () => ({
  notify: mocks.notify,
  NOTIFICATION_TRIGGERS: {
    ABN_COLLISION_REVIEW: "ABN collision review",
    ADMIN_INVITATION: "administrator invitation",
  },
}));

const { qualifyLead } = await import("./actions/lead");
const LeadsPage = (await import("../app/(admin)/admin/leads/page")).default;

const leadId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const back = `/admin/leads?lead=${leadId}`;
const lead = {
  id: leadId,
  status: "Contacted",
  company_id: null,
  business_name: "Example Construction Pty Ltd",
  contact_name: "Sam Taylor",
  email: "ops@example.test",
  abn: null,
  phone: null,
  intent: "both",
  source: "concierge",
  created_at: "2026-08-31T00:00:00Z",
  notes: null,
  trade_interest: null,
  funnel_score: null,
  disqualified_reason: null,
};

type Write = { table: string; operation: string; values?: Record<string, unknown> };
type Read = { table: string; filters: Record<string, unknown> };
type DatabaseError = { code: string; message: string };
let writes: Write[];
let reads: Read[];
let duplicate: boolean;
let companyInsertError: DatabaseError | null;

function form(fields: Record<string, string | null | undefined> = {}): FormData {
  const data = new FormData();
  const input = {
    lead_id: leadId,
    legal_name: "  Example Construction Pty Ltd  ",
    contact_email: "  ops@example.test  ",
    ...fields,
  };
  for (const [key, value] of Object.entries(input)) {
    // Native FormData represents an omitted/null field with get(name) === null.
    if (value != null) data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  reads = [];
  duplicate = false;
  companyInsertError = null;
  mocks.gate.mockResolvedValue({ id: "user_MaintainAdmin" });
  mocks.invite.mockResolvedValue({ ok: true });
  mocks.notify.mockResolvedValue({ sent: true });
  mocks.audit.mockResolvedValue(undefined);
  const currentLead: Record<string, unknown> = { ...lead };
  mocks.from.mockImplementation((table: string) => {
    let operation = "select";
    let values: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    const result = (single = false) => {
      if (operation === "select") {
        reads.push({ table, filters: { ...filters } });
        if (table === "lead") {
          const matches = Object.entries(filters).every(([key, value]) => currentLead[key] === value);
          return { data: single ? matches ? { ...currentLead } : null : matches ? [{ ...currentLead }] : [], error: null };
        }
        if (table === "company") return { data: duplicate ? [{ id: "existing-company" }] : [], error: null };
        if (table === "industry" || table === "region") return { data: [], error: null };
      }
      if (table === "company" && operation === "insert") {
        return { data: companyInsertError ? null : { id: companyId }, error: companyInsertError };
      }
      if (table === "lead" && operation === "update") {
        if (!Object.entries(filters).every(([key, value]) => currentLead[key] === value)) return { data: null, error: null };
        Object.assign(currentLead, values);
        return { data: { id: leadId }, error: null };
      }
      if (table === "company" && operation === "delete") return { data: { id: companyId }, error: null };
      return { data: null, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      is: (key: string, value: unknown) => { filters[key] = value; return query; },
      order: () => query,
      limit: () => query,
      insert: (values: Record<string, unknown>) => {
        operation = "insert";
        writes.push({ table, operation, values });
        return query;
      },
      update: (updateValues: Record<string, unknown>) => {
        operation = "update";
        values = updateValues;
        writes.push({ table, operation, values });
        return query;
      },
      delete: () => {
        operation = "delete";
        writes.push({ table, operation });
        return query;
      },
      maybeSingle: async () => result(true),
      single: async () => result(true),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  });
  mocks.admin.mockReturnValue({ from: mocks.from });
});

describe("concierge lead qualification with optional company ABN", () => {
  it.each([
    ["omitted", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", " \t\n "],
  ])("qualifies a %s ABN as SQL null through the existing Clerk invitation path", async (_label, abn) => {
    await expect(qualifyLead(form({ abn }))).rejects.toMatchObject({ url: `${back}&saved=qualified` });
    expect(writes).toContainEqual({ table: "company", operation: "insert", values: expect.objectContaining({
      legal_name: "Example Construction Pty Ltd", abn: null, contact_email: "ops@example.test", status: "Pending",
    }) });
    expect(reads.filter((read) => read.table === "company")).toEqual([]);
    expect(writes).toContainEqual({ table: "lead", operation: "update", values: { status: "Qualified", company_id: companyId } });
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith("ops@example.test", companyId);
    expect(writes.some((write) => write.table === "company_user")).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "user_MaintainAdmin" }, action: "company.created_from_lead",
      after: expect.objectContaining({ abn: null, status: "Pending" }),
    }));
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      trigger: "administrator invitation", to: "ops@example.test", companyId,
    }));
  });

  it("normalises a supplied formatted ABN before uniqueness checking and company creation", async () => {
    await expect(qualifyLead(form({ abn: " 51\t824 753\n556 ", status: "Active" }))).rejects.toMatchObject({ url: `${back}&saved=qualified` });
    expect(reads.filter((read) => read.table === "company")).toEqual([{ table: "company", filters: { abn: "51824753556" } }]);
    expect(writes).toContainEqual({ table: "company", operation: "insert", values: expect.objectContaining({ abn: "51824753556", status: "Pending" }) });
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith("ops@example.test", companyId);
  });

  it.each(["5182475355", "518247535566", "51A24753556", "00000000000", "51824753557", "null"])(
    "rejects a supplied invalid/checksum ABN (%s) before privileged reads or writes",
    async (abn) => {
      await expect(qualifyLead(form({ abn }))).rejects.toMatchObject({ url: `${back}&error=abn_checksum` });
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
      expect(mocks.invite).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    },
  );

  it("rejects a duplicate supplied ABN before company creation or invitation", async () => {
    duplicate = true;
    await expect(qualifyLead(form({ abn: "51 824 753 556" }))).rejects.toMatchObject({ url: `${back}&error=abn_taken` });
    expect(reads.filter((read) => read.table === "company")).toEqual([{ table: "company", filters: { abn: "51824753556" } }]);
    expect(writes).toEqual([]);
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ trigger: "ABN collision review", entityId: leadId }));
  });

  it("does not invite when database uniqueness rejects a concurrent supplied-ABN creation", async () => {
    companyInsertError = { code: "23505", message: "duplicate key violates company_abn_key" };
    await expect(qualifyLead(form({ abn: "51824753556" }))).rejects.toMatchObject({ url: `${back}&error=company_create_failed` });
    expect(writes).toHaveLength(1);
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { legal_name: undefined }, { legal_name: "" }, { legal_name: "  " }, { legal_name: "A" },
    { contact_email: undefined }, { contact_email: "" }, { contact_email: "  " }, { contact_email: "not-an-email" },
  ])("still requires legal name and contact email (%j)", async (invalid) => {
    await expect(qualifyLead(form({ abn: "", ...invalid }))).rejects.toMatchObject({ url: `${back}&error=qualification_details_invalid` });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("preserves the admin/session-MFA gate before the privileged client", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("MFA required"));
    await expect(qualifyLead(form())).rejects.toThrow("MFA required");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("retains an audited null-ABN company when the invitation outcome cannot be confirmed", async () => {
    mocks.invite.mockResolvedValueOnce({ ok: false, reason: "Clerk unavailable" });
    await expect(qualifyLead(form({ abn: "" }))).rejects.toMatchObject({ url: `${back}&error=qualification_invitation_unconfirmed` });
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith("ops@example.test", companyId);
    expect(writes).not.toContainEqual({ table: "lead", operation: "update", values: { status: "Contacted", company_id: null } });
    expect(writes).not.toContainEqual({ table: "company", operation: "delete" });
    expect(mocks.audit.mock.calls.map(([event]) => event.action)).toEqual(["lead.qualified", "company.created_from_lead"]);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

describe("concierge qualification form", () => {
  it("renders ABN as optional while keeping legal name and contact email required", async () => {
    const html = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({ lead: leadId }) }));
    expect(html).toContain("ABN (optional)");
    const abnInput = html.match(/<input\b[^>]*name="abn"[^>]*>/)?.[0];
    expect(abnInput).toBeDefined();
    expect(abnInput).not.toMatch(/\brequired(?:=|\s|>)/);
    expect(html.match(/<input\b[^>]*name="legal_name"[^>]*>/)?.[0]).toContain('required=""');
    expect(html.match(/<input\b[^>]*name="contact_email"[^>]*>/)?.[0]).toContain('required=""');
  });

  it("explains invalid qualification details without requiring an ABN", async () => {
    const html = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({
      lead: leadId, error: "qualification_details_invalid",
    }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Qualification needs a company legal name and a valid contact email.");
    expect(html).toContain("ABN is optional");
    expect(html).not.toContain("needs a checksum-valid ABN");
  });

  it.each([
    ["lead_changed", "The lead changed while this qualification was being prepared"],
    ["qualification_recovery_required", "Review the lead, company and invitation before trying again"],
  ])("shows an honest %s notice without claiming cleanup succeeded", async (error, message) => {
    const html = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({ lead: leadId, error }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html).not.toContain("The company was not created");
  });

  it("explains invitation uncertainty and directs reconciliation instead of repeating qualification", async () => {
    const html = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({
      lead: leadId, error: "qualification_invitation_unconfirmed",
    }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Qualification was recorded");
    expect(html).toContain("company was not deleted");
    expect(html).toContain("Refresh the lead and company");
    expect(html).toContain("check the invitation in Clerk");
    expect(html).toContain("re-issue from company administration only if needed");
    expect(html).not.toContain("The company was not created");
    expect(html).not.toContain("Try again.");
  });
});
