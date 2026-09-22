import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Company settings — spec 3.1 and 17.1. Every read on the screen runs under the user's
// session, so a session Supabase rejects must fail the screen rather than render empty
// selects, "no documents", "no administrators" — or "Company not found." for a company
// that is there. Same contract as src/lib/company-exchange-read-ui.test.ts.

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, failingTable: "" }));

vi.mock("@/lib/auth", () => ({
  requireCompanyAdmin: async () => ({
    companyId: "company",
    companyStatus: "Pending",
    user: { id: "user_CompanyAdmin", email: "admin@example.test" },
  }),
}));
vi.mock("@/lib/clerk", () => ({ userEmail: async () => "admin@example.test" }));
vi.mock("@/lib/actions/company", () => ({
  companyChecklist: async () => [],
  inviteCompanyAdmin: vi.fn(),
  reissueInvitation: vi.fn(),
  removeCompanyAdmin: vi.fn(),
  updateCompanyProfile: vi.fn(),
  uploadCompanyDocument: vi.fn(),
  saveCompanyDocumentForm: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database() }));

function database() {
  return { from: (table: string) => {
    const result = () => state.failingTable === table
      ? { data: null, error: { code: "PGRST301", message: "No suitable key or wrong key type" } }
      : { data: state.tables[table] ?? [], error: null };
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query,
      maybeSingle: async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null }; },
      then: <T>(resolve: (response: ReturnType<typeof result>) => T) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } };
}

const SettingsPage = (await import("@/app/(app)/app/settings/page")).default;
const page = () => SettingsPage({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  state.failingTable = "";
  state.tables = { company: [{ id: "company", legal_name: "Example Pty Ltd", status: "Pending" }] };
});

describe("company settings read failures — MVP 3.1 and 17.1", () => {
  it.each([
    ["company", "company"],
    ["regions", "region"],
    ["industries", "industry"],
    ["operating regions", "company_operating_region"],
    ["documents", "company_document"],
    ["administrators", "company_user"],
  ])("fails visibly when the %s cannot load", async (_label, table) => {
    state.failingTable = table;
    await expect(page()).rejects.toThrow("could not be loaded");
  });

  it("still reports a company that is genuinely missing", async () => {
    state.tables.company = [];
    expect(renderToStaticMarkup(await page())).toContain("Company not found.");
  });
});
