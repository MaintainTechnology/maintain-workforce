import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  engagement: {} as Record<string, unknown>, party: {} as Record<string, unknown>, partyRole: "buyer" as "buyer" | "supplier",
}));
vi.mock("@/lib/admin-engagement-reporting", () => ({ getAdminEngagement: async () => state.engagement }));
vi.mock("@/lib/matching", () => ({ partyEngagement: async (_id: string, role: string) => role === state.partyRole ? state.party : null }));
vi.mock("@/lib/actions/engagement", () => ({
  cancelEngagement: vi.fn(), completeEngagement: vi.fn(), disputeEngagement: vi.fn(),
  recordEngagementOutcome: vi.fn(), recordPaymentStatus: vi.fn(),
}));
vi.mock("@/components/action-form", () => ({
  ActionForm: ({ children, submitLabel }: { children: ReactNode; submitLabel: string }) =>
    createElement("form", null, children, createElement("button", { type: "submit" }, submitLabel)),
}));
const AdminPage = (await import("../app/(admin)/admin/engagements/[id]/page")).default;
const PartyPage = (await import("../app/(app)/app/engagements/[id]/page")).default;
const params = { params: Promise.resolve({ id: "engagement" }) };

beforeEach(() => {
  state.partyRole = "buyer";
  state.engagement = { id: "engagement", status: "Cancelled", commercial_confirmed_at: null, payment_status: "none",
    start_date: "2026-09-01", end_date: "2026-09-28", supplier_rate_cents: 5000, buyer_rate_cents: 6000,
    actual_hours: null, actual_value_cents: null, compliance_review_count: 0, compliance_issues: [] };
  state.party = { id: "engagement", status: "Cancelled", revealed: false, startDate: "2026-09-01", endDate: "2026-09-28",
    rateCents: 6000, estimatedValueCents: 960000, workers: ["Site Worker"], actualHours: null,
    workerTickets: [{ name: "Site Worker", capturedAt: "2026-08-31T00:00:00Z", tickets: [{ name: "Elevated Work Platform", number: "SITE-123",
      issueDate: "2025-01-01", expiryDate: "2027-01-01", status: "Current" }] }] };
});

describe("reviewed engagement controls", () => {
  it("keeps later payment release/dispute/reference controls after commercially triggered cancellation", async () => {
    state.engagement.commercial_confirmed_at = "2026-08-31T00:00:00Z";
    const html = renderToStaticMarkup(await AdminPage(params));
    expect(html).toContain("Record payment change");
    expect(html).toContain('value="released"');
    expect(html).toContain('value="disputed"');
    expect(html).toContain('name="external_payment_ref"');
    expect(html).not.toContain('value="pre-authorised"');
    expect(html).not.toContain("Record pre-authorised");
  });
  it("does not offer commercial confirmation for a never-confirmed cancelled engagement", async () => {
    const html = renderToStaticMarkup(await AdminPage(params));
    expect(html).not.toContain("Record payment change");
    expect(html).not.toContain("Record pre-authorised");
  });
  it.each([false, true])("renders ticket facts only through the immutable reveal gate (%s)", async (revealed) => {
    state.party.revealed = revealed;
    const html = renderToStaticMarkup(await PartyPage(params));
    expect(html.includes("Elevated Work Platform")).toBe(revealed);
    expect(html.includes("SITE-123")).toBe(revealed);
    expect(html.includes("Site Worker")).toBe(revealed);
  });
  it("labels recorded crew facts as historical rather than a live compliance check", async () => {
    state.party.revealed = true;
    const html = renderToStaticMarkup(await PartyPage(params));
    expect(html).toContain("Historical site-access facts captured on");
    expect(html).toContain("31/08/2026");
    expect(html).toContain("Not a live compliance check.");
  });
  it("distinguishes missing legacy history from an empty ticket list", async () => {
    state.party.revealed = true;
    state.party.workerTickets = [{ name: "Historical worker details unavailable", capturedAt: null, tickets: [] }];
    const html = renderToStaticMarkup(await PartyPage(params));
    expect(html).toContain("No trustworthy historical snapshot is available.");
    expect(html).not.toContain("No ticket facts recorded.");
  });
  it("lets the supplier see its recorded crew before the commercial step without revealing the buyer", async () => {
    state.partyRole = "supplier";
    state.party.status = "Awaiting Commercial";
    state.party.counterpartyName = "HIDDEN BUYER";
    const html = renderToStaticMarkup(await PartyPage(params));
    expect(html).toContain("Site Worker");
    expect(html).toContain("SITE-123");
    expect(html).toContain("Historical site-access facts captured on");
    expect(html).not.toContain("HIDDEN BUYER");
  });
});
