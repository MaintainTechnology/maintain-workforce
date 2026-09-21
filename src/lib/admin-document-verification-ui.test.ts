import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  requirements: [] as Row[],
  checklistUnavailable: false,
  failingTable: "",
  unavailableFiles: new Set<string>(),
}));

vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormStatus: () => ({ pending: false }),
}));
vi.mock("@/lib/auth", () => ({
  requireMaintainAdmin: async () => ({ id: "maintain-admin", email: "admin@example.test" }),
}));
vi.mock("@/lib/actions/company", () => ({
  approveCompany: vi.fn(),
  rejectCompany: vi.fn(),
  updatePendingCompanyProfileAsMaintain: vi.fn(),
  uploadCompanyDocument: vi.fn(),
  verifyCompanyDocument: vi.fn(),
  companyChecklist: async () => [
    { id: "abn_verified", label: "ABN verified", kind: "flag", optional: false },
    { id: "public_liability", label: "Public liability insurance", kind: "document", optional: false },
    { id: "workers_comp", label: "Workers compensation", kind: "document", optional: false },
    { id: "trade_licence", label: "Trade licence", kind: "document", optional: false },
    { id: "lh_licence", label: "Labour-hire licence", kind: "document", optional: true },
    { id: "payment_details", label: "Payment details provided", kind: "flag", optional: false },
  ],
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database() }));

function database() {
  return {
    from: (table: string) => {
      const result = () => state.failingTable === table
        ? { data: null, error: { message: "Read failed" } }
        : { data: state.tables[table] ?? [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: async () => {
          const response = result();
          return { ...response, data: response.data?.[0] ?? null };
        },
        then: <T>(resolve: (response: ReturnType<typeof result>) => T) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
    rpc: async () => state.checklistUnavailable
      ? { data: null, error: { message: "Checklist unavailable" } }
      : { data: state.requirements, error: null },
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => state.unavailableFiles.has(path)
          ? { data: null, error: { message: "Object not found" } }
          : { data: { signedUrl: `https://storage.example.test/${path}` }, error: null },
      }),
    },
  };
}

const VerificationPage = (await import("@/app/(admin)/admin/verification/page")).default;
const page = () => VerificationPage({ searchParams: Promise.resolve({ company: "company" }) });
const renderPage = async () => renderToStaticMarkup(await page());

function document(id: string, values: Row = {}): Row {
  return {
    id,
    company_id: "company",
    doc_type: "public_liability",
    number: "PL-123",
    issuer: "Example insurer",
    issue_date: null,
    expiry_date: null,
    file_path: `company/${id}.pdf`,
    qualification_id: null,
    verified_at: null,
    verified_by: null,
    ...values,
  };
}

function rowFor(html: string, id: string) {
  const row = html.match(new RegExp(`<tr\\b[^>]*id="document-${id}"[^>]*>[\\s\\S]*?</tr>`));
  expect(row, `document row ${id}`).not.toBeNull();
  return row![0];
}

function buttonFor(html: string, label: string) {
  const button = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map((match) => match[0])
    .find((element) => element.includes(`>${label}</button>`));
  expect(button, `button labelled ${label}`).toBeDefined();
  return button!;
}

function hasDisabled(html: string) {
  return /\sdisabled(?:=|\s|>)/.test(html);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T02:00:00Z"));
  state.failingTable = "";
  state.checklistUnavailable = false;
  state.requirements = [
    { doc_type: "public_liability", label: "Public liability insurance", qualification_id: null, is_required: true, is_verified: false },
    { doc_type: "workers_comp", label: "Workers compensation", qualification_id: null, is_required: true, is_verified: false },
    { doc_type: "payment_details", label: "Payment details provided", qualification_id: null, is_required: true, is_verified: false },
  ];
  state.unavailableFiles.clear();
  state.tables = {
    company: [{
      id: "company",
      legal_name: "Example Pty Ltd",
      trading_name: null,
      abn: null,
      industry_id: "industry",
      contact_name: "Casey Example",
      contact_email: "casey@example.test",
      contact_phone: "0400000000",
      primary_region_id: "region",
      status: "Pending",
      created_at: "2026-09-20T02:00:00Z",
    }],
    industry: [{ id: "industry", name: "Civil", is_active: true }],
    region: [{ id: "region", name: "Brisbane", is_active: true }],
    company_operating_region: [{ region_id: "region" }],
    company_document: [],
  };
});

afterEach(() => { vi.useRealTimers(); });

describe("admin document verification readiness", () => {
  it("allows admin activation with missing insurance and an outstanding payment flag", async () => {
    const html = await renderPage();

    expect(hasDisabled(buttonFor(html, "Approve and activate"))).toBe(false);
    expect(html).toContain("Public liability insurance, Workers compensation, Payment details provided");
    expect(html).not.toContain("Approval is locked");
  });

  it("allows admin activation when a required company licence is outstanding", async () => {
    state.requirements.push({
      doc_type: "trade_licence",
      label: "Electrical contractor licence",
      qualification_id: "contractor-licence",
      is_required: true,
      is_verified: false,
    });
    const html = await renderPage();

    expect(html).toContain("Electrical contractor licence");
    expect(hasDisabled(buttonFor(html, "Approve and activate"))).toBe(false);
  });

  it("preserves admin approval authority when the checklist cannot be loaded", async () => {
    state.checklistUnavailable = true;
    const html = await renderPage();

    expect(html).toContain("verification checklist could not be loaded");
    expect(hasDisabled(buttonFor(html, "Approve and activate"))).toBe(false);
    expect(html).not.toContain("Approval is unavailable");
  });

  it("explains a missing file and offers recovery on the existing record", async () => {
    state.tables.company_document = [document("fileless", { file_path: null, expiry_date: "2030-01-21" })];
    const html = await renderPage();
    const row = rowFor(html, "fileless");

    expect(row).toContain("Attach the document file before verifying.");
    expect(row).toContain("No file attached");
    expect(hasDisabled(buttonFor(row, "Verify"))).toBe(true);
    expect(hasDisabled(buttonFor(row, "Attach file"))).toBe(false);
    const recovery = [...row.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
      .map((match) => match[0]).find((form) => form.includes(">Attach file</button>"));
    expect(recovery).toContain('name="document_id" value="fileless"');
    expect(recovery).toContain('name="expected_status" value="Pending"');
    expect(recovery).toMatch(/<input\b[^>]*type="file"[^>]*required=""/);
    const heading = html.slice(html.indexOf('id="checklist-public_liability"'), html.indexOf('id="document-fileless"'));
    expect(heading).toContain("File required");
    expect(heading).not.toContain("Awaiting verification");
  });

  it("allows a readable file with optional dates omitted to be verified", async () => {
    state.tables.company_document = [document("undated")];
    const row = rowFor(await renderPage(), "undated");

    expect(row).toContain('href="https://storage.example.test/company/undated.pdf"');
    expect(row).toContain("No expiry recorded");
    expect(hasDisabled(buttonFor(row, "Verify"))).toBe(false);
    expect(row).not.toContain("Attach file");
  });

  it.each([
    ["expired", { expiry_date: "2026-09-20" }, "This document has expired. Upload a current document."],
    ["future", { issue_date: "2026-09-22" }, "This document is not valid yet. Check its issue date or upload a current document."],
  ])("blocks the %s document with a specific explanation", async (id, dates, explanation) => {
    state.tables.company_document = [document(id, dates)];
    const row = rowFor(await renderPage(), id);

    expect(row).toContain(explanation);
    expect(hasDisabled(buttonFor(row, "Verify"))).toBe(true);
  });

  it("accepts issue and expiry dates equal to today", async () => {
    state.tables.company_document = [document("today", { issue_date: "2026-09-21", expiry_date: "2026-09-21" })];
    expect(hasDisabled(buttonFor(rowFor(await renderPage(), "today"), "Verify"))).toBe(false);
  });

  it("blocks verification when the stored file cannot be opened", async () => {
    state.tables.company_document = [document("unavailable")];
    state.unavailableFiles.add("company/unavailable.pdf");
    const row = rowFor(await renderPage(), "unavailable");

    expect(row).toContain("The file could not be opened. Refresh before verifying.");
    expect(row).toContain("File unavailable");
    expect(hasDisabled(buttonFor(row, "Verify"))).toBe(true);
    expect(row).not.toContain("Attach file");
  });

  it("requires a file on every new-document and recovery form", async () => {
    state.tables.company_document = [document("fileless", { file_path: null })];
    const html = await renderPage();
    const uploadForms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
      .map((match) => match[0]).filter((form) => form.includes('type="file"'));

    expect(uploadForms).toHaveLength(5);
    for (const form of uploadForms) {
      expect(form).toMatch(/<input\b[^>]*type="file"[^>]*required=""/);
      expect(form).toContain('accept="application/pdf,image/jpeg,image/png"');
      expect(form).toContain("PDF, JPG or PNG. Maximum 4 MB.");
    }
  });

  it("fails visibly instead of showing missing uploads when document retrieval fails", async () => {
    state.failingTable = "company_document";
    await expect(page()).rejects.toThrow("Company documents could not be loaded");
  });
});
