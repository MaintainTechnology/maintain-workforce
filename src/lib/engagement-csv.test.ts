import { describe, expect, it } from "vitest";
import { ENGAGEMENT_EXPORT_COLUMNS, toCsv } from "./csv";

const row = {
  id: "engagement-1",
  match_id: "match-1",
  buyer_company_id: "buyer-1",
  buyer_company_name: "=Buyer Ltd",
  supplier_company_id: "supplier-1",
  supplier_company_name: "Supplier, Ltd",
  demand_line_id: "demand-1",
  capacity_line_id: "capacity-1",
  trade_role_id: "trade-1",
  trade_role_name: "Carpenter",
  proficiency_id: "proficiency-1",
  proficiency_name: "Qualified",
  work_region_id: "region-1",
  work_region_name: "Brisbane",
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  hours_per_week: 38,
  supplier_rate_cents: 5010,
  fee_bp: 500,
  fee_cents_per_hour: 251,
  buyer_rate_cents: 5261,
  expected_hours: 170,
  estimated_supplier_value_cents: 851700,
  estimated_maintain_revenue_cents: 42670,
  estimated_buyer_value_cents: 894370,
  status: "Disputed",
  commercial_confirmed_at: "2026-08-01T00:00:00Z",
  payment_status: "disputed",
  external_payment_ref: "@payment",
  actual_hours: 164,
  actual_value_cents: 862804,
  completed_at: "2026-09-01T00:00:00Z",
  dispute_notes: 'Site said "no"\nSupplier disagreed',
  cancelled_by: "maintain-admin",
  cancel_reason: null,
  within_notice_window: false,
  created_at: "2026-07-30T00:00:00Z",
};

describe("complete Engagements CSV snapshot", () => {
  it("exports every identity, frozen snapshot, payment and outcome field", () => {
    const values = Object.fromEntries(ENGAGEMENT_EXPORT_COLUMNS.map((column) => [
      column.header,
      column.value(row),
    ]));

    expect(values).toEqual({
      "Engagement id": "engagement-1",
      "Match id": "match-1",
      Status: "Disputed",
      "Hiring business": "=Buyer Ltd",
      "Hiring business id": "buyer-1",
      "Supplying business": "Supplier, Ltd",
      "Supplying business id": "supplier-1",
      "Requirement line id": "demand-1",
      "Capacity line id": "capacity-1",
      Trade: "Carpenter",
      "Trade id": "trade-1",
      Proficiency: "Qualified",
      "Proficiency id": "proficiency-1",
      "Work region": "Brisbane",
      "Work region id": "region-1",
      "Start date": "2026-08-01",
      "End date": "2026-08-31",
      "Hours per week": 38,
      "Supplier rate (AUD ex GST)": "50.10",
      "Fee (basis points)": 500,
      "Fee per hour (AUD ex GST)": "2.51",
      "Buyer rate (AUD ex GST)": "52.61",
      "Expected hours": 170,
      "Estimated supplier value (AUD ex GST)": "8517.00",
      "Estimated Maintain revenue (AUD ex GST)": "426.70",
      "Estimated buyer value (AUD ex GST)": "8943.70",
      "Commercial confirmed at": "2026-08-01T00:00:00Z",
      "Payment status": "disputed",
      "External payment reference": "@payment",
      "Actual hours": 164,
      "Actual value (AUD ex GST)": "8628.04",
      "Completed at": "2026-09-01T00:00:00Z",
      "Dispute notes": 'Site said "no"\nSupplier disagreed',
      "Cancelled by": "maintain-admin",
      "Cancellation reason": null,
      "Within notice window": "no",
      "Created at": "2026-07-30T00:00:00Z",
    });
  });

  it("preserves spreadsheet-safe text, quotes, newlines and nullable markers", () => {
    const csv = toCsv(ENGAGEMENT_EXPORT_COLUMNS, [row, {
      ...row, commercial_confirmed_at: null, within_notice_window: null,
    }]);
    expect(csv).toContain('"\'=Buyer Ltd"');
    expect(csv).toContain('"\'@payment"');
    expect(csv).toContain('"Supplier, Ltd"');
    expect(csv).toContain('"Site said ""no""\nSupplier disagreed"');
    expect(csv).toContain('"","disputed"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
