import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  companyStatus: "Active", role: "supplier", matchStatus: "Awaiting Supplier",
  nominations: [] as { id: string; name: string; knockedOut: boolean; reason: string | null }[],
  nominationPool: vi.fn(async () => []),
}));
vi.mock("@/lib/auth", () => ({ requireCompanyAdmin: async () => ({ companyStatus: state.companyStatus }) }));
vi.mock("@/lib/config", () => ({ getBookingRules: async () => ({ minimumCrewSize: 1 }) }));
vi.mock("@/lib/actions/match", () => ({
  buyerAcceptMatch: vi.fn(), buyerDeclineMatch: vi.fn(), supplierAcceptMatch: vi.fn(),
  supplierDeclineMatch: vi.fn(), supplierSubstituteNominations: vi.fn(),
}));
vi.mock("@/components/action-form", () => ({
  ActionForm: ({ children, submitLabel }: { children: ReactNode; submitLabel: string }) =>
    createElement("form", null, children, createElement("button", { type: "submit" }, submitLabel)),
}));
vi.mock("@/lib/matching", () => ({
  supplierMatch: async () => state.role === "supplier" ? matchFixture() : null,
  buyerMatch: async () => state.role === "buyer" ? matchFixture() : null,
  nominationPool: state.nominationPool,
}));

function matchFixture() {
  return {
    id: "match", status: state.matchStatus, nominatedWorkers: state.nominations,
    requestedQuantity: 1, nominatedCount: 1, nominationVersion: 1,
    tradeName: "Electrician", proficiencyName: "Qualified", workRegionName: "Perth",
    engagementStart: "2026-10-01", engagementEnd: "2026-10-07", hoursPerWeek: 40,
    supplierRateCents: 5000, buyerRateCents: 6000, expectedHours: 40,
    estimatedSupplierValueCents: 200000, estimatedBuyerValueCents: 240000,
    skillsHeld: 1, skillsRequired: 1, qualificationCoverage: [], requestName: "Shutdown",
  };
}
const MatchPage = (await import("@/app/(app)/app/matches/[id]/page")).default;

// Resolve async Server Component children before passing the tree to React's
// synchronous renderer. Client action forms are mocked above; no writes occur.
async function resolveServerChildren(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerChildren));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    const component = element.type as (props: object) => Promise<ReactNode>;
    return resolveServerChildren(await component(element.props));
  }
  if (element.props.children !== undefined) {
    return cloneElement(element, {}, await resolveServerChildren(element.props.children));
  }
  return element;
}

async function renderPage() {
  const page = await MatchPage({ params: Promise.resolve({ id: "match" }) });
  return renderToStaticMarkup(await resolveServerChildren(page));
}

beforeEach(() => {
  state.companyStatus = "Active";
  state.role = "supplier";
  state.matchStatus = "Awaiting Supplier";
  state.nominations = [];
  state.nominationPool.mockClear();
});

describe("company proposal decisions", () => {
  it.each(["Pending", "Suspended", "Closed"])("keeps %s supplier proposals readable without mutation forms or nomination reads", async (status) => {
    state.companyStatus = status;
    state.nominations = [{ id: "worker", name: "Alex Crew", knockedOut: false, reason: null }];
    const html = await renderPage();
    expect(html).toContain("Alex Crew");
    expect(html).toContain("Electrician");
    expect(html).not.toContain("<form");
    expect(state.nominationPool).not.toHaveBeenCalled();
  });

  it.each(["Pending", "Suspended", "Closed"])("hides acceptance and decline for a %s buyer", async (status) => {
    state.companyStatus = status;
    state.role = "buyer";
    state.matchStatus = "Awaiting Buyer";
    const html = await renderPage();
    expect(html).toContain("Shutdown");
    expect(html).not.toContain("<form");
  });

  it("offers nomination and decline for an Active supplier", async () => {
    const html = await renderPage();
    expect(html).toContain("Accept and nominate</button>");
    expect(html).toContain("Decline this match</button>");
    expect(state.nominationPool).toHaveBeenCalledWith("match");
  });

  it("offers substitution for an Active supplier while the buyer is deciding", async () => {
    state.matchStatus = "Awaiting Buyer";
    expect(await renderPage()).toContain("Substitute nominations</button>");
  });

  it("offers acceptance and decline for an Active buyer", async () => {
    state.role = "buyer";
    state.matchStatus = "Awaiting Buyer";
    const html = await renderPage();
    expect(html).toContain("Accept a crew of 1</button>");
    expect(html).toContain("Decline this proposal</button>");
  });

  it("retains knockout names and reasons after the last nomination is removed and the proposal declines", async () => {
    state.matchStatus = "Declined";
    state.nominations = [{ id: "worker", name: "Alex Crew", knockedOut: true, reason: "Qualification expired" }];
    const html = await renderPage();
    expect(html).toContain("No current nominations remain");
    expect(html).toContain("Alex Crew");
    expect(html).toContain("Qualification expired");
    expect(html).toContain("Contact Maintain to discuss a new proposal");
    expect(html).not.toContain("<form");
    expect(state.nominationPool).not.toHaveBeenCalled();
  });
});
