import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

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
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database() }));

function database() {
  return {
    from: (table: string) => {
      const result = () => ({ data: state.tables[table] ?? [], error: null });
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: async () => {
          const response = result();
          return { ...response, data: response.data[0] ?? null };
        },
        then: <T>(resolve: (response: ReturnType<typeof result>) => T) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
}

const SettingsPage = (await import("@/app/(app)/app/settings/page")).default;

function elementFor(html: string, tag: "input" | "option", value: string) {
  const match = html.match(new RegExp(`<${tag}[^>]*value="${value}"[^>]*(?:>[^<]*</option>|/?>)`));
  expect(match, `${tag} for ${value}`).not.toBeNull();
  return match![0];
}

beforeEach(() => {
  state.tables = {
    company: [{
      id: "company",
      legal_name: "Example Pty Ltd",
      trading_name: null,
      abn: null,
      industry_id: "industry-current",
      contact_name: "Casey Example",
      contact_email: "casey@example.test",
      contact_phone: "0400000000",
      primary_region_id: "region-primary-current",
      status: "Pending",
    }],
    industry: [
      { id: "industry-active", name: "Civil", is_active: true },
      { id: "industry-current", name: "Legacy industry", is_active: false },
      { id: "industry-unavailable", name: "Unavailable industry", is_active: false },
    ],
    region: [
      { id: "region-active", name: "Brisbane", is_active: true },
      { id: "region-operating-current", name: "Legacy operating region", is_active: false },
      { id: "region-primary-current", name: "Legacy primary region", is_active: false },
      { id: "region-unavailable", name: "Unavailable region", is_active: false },
    ],
    company_operating_region: [
      { region_id: "region-active" },
      { region_id: "region-operating-current" },
    ],
    company_document: [],
    company_user: [],
  };
});

describe("company settings inactive catalogue values", () => {
  it("preserves saved inactive choices and prevents choosing other inactive values", async () => {
    const page = await SettingsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    const currentIndustry = elementFor(html, "option", "industry-current");
    expect(currentIndustry).toContain("selected");
    expect(currentIndustry).not.toContain("disabled");
    expect(currentIndustry).toContain("Legacy industry (Unavailable)");
    expect(elementFor(html, "option", "industry-unavailable")).toContain("disabled");

    const currentPrimary = elementFor(html, "option", "region-primary-current");
    expect(currentPrimary).toContain("selected");
    expect(currentPrimary).not.toContain("disabled");
    expect(currentPrimary).toContain("Legacy primary region (Unavailable)");

    const currentOperating = elementFor(html, "input", "region-operating-current");
    expect(currentOperating).toContain("checked");
    expect(currentOperating).not.toContain("disabled");
    expect(elementFor(html, "input", "region-unavailable")).toContain("disabled");
  });
});
