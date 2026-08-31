// CSV export — spec 14.3. The admin Engagements, Companies and Workers lists each
// export the currently filtered rows, and the engagement export carries every 13.1
// field. This is the only reporting facility in MVP (no analytics platform, 14.2), so
// the column lists below are the report definition: they live here, once, rather than
// being retyped per list screen.

export type CsvColumn<T> = {
  /** The header text, in the words the spec uses. */
  header: string;
  value: (row: T) => string | number | null | undefined;
};

/**
 * RFC 4180 quoting. Every field is quoted, which is always valid and removes the
 * "does this one need escaping?" question — an ABN with a leading zero, a company name
 * with a comma, and a note with a newline all survive the round trip to Excel.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  // Spreadsheet importers may discard leading whitespace/control characters before
  // interpreting a formula. Prefix the original text; numeric cells remain untouched.
  const spreadsheetSafe =
    typeof value === "string" && /^[\s\p{Cc}]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(","));
  }
  // CRLF per RFC 4180; Excel on Windows is the reader that matters here.
  return `${lines.join("\r\n")}\r\n`;
}

/** A download response for a route handler or server action. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // Exports are a point-in-time snapshot of a filtered list; never cache one.
      "cache-control": "no-store",
    },
  });
}

/** 20.1 — amounts are integer cents in the database; the export states dollars ex GST. */
export function centsColumn(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/**
 * 14.3 — "the engagement export includes every 13.1 field": the commercial identity
 * fields copied from the match's proposal-time snapshot, the engagement window, the
 * money snapshot, and the frozen estimates. The 13.3 outcome and 13.4 payment-handoff
 * fields ride along, because a finance export that stops at the estimate is useless at
 * completion. Rows arrive pre-joined by the list screen; ids are exported alongside
 * names so an export can be reconciled against the database.
 */
export type EngagementExportRow = {
  id: string;
  match_id: string;
  status: string;
  buyer_company_name: string | null;
  buyer_company_id: string;
  supplier_company_name: string | null;
  supplier_company_id: string;
  demand_line_id: string;
  capacity_line_id: string;
  trade_role_name: string | null;
  trade_role_id: string;
  proficiency_name: string | null;
  proficiency_id: string;
  work_region_name: string | null;
  work_region_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  supplier_rate_cents: number;
  fee_bp: number;
  fee_cents_per_hour: number;
  buyer_rate_cents: number;
  expected_hours: number;
  estimated_supplier_value_cents: number;
  estimated_maintain_revenue_cents: number;
  estimated_buyer_value_cents: number;
  commercial_confirmed_at: string | null;
  payment_status: string;
  external_payment_ref: string | null;
  actual_hours: number | null;
  actual_value_cents: number | null;
  completed_at: string | null;
  dispute_notes: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  within_notice_window: boolean | null;
  created_at: string;
};

export const ENGAGEMENT_EXPORT_COLUMNS: CsvColumn<EngagementExportRow>[] = [
  { header: "Engagement id", value: (r) => r.id },
  { header: "Match id", value: (r) => r.match_id },
  { header: "Status", value: (r) => r.status },
  { header: "Hiring business", value: (r) => r.buyer_company_name },
  { header: "Hiring business id", value: (r) => r.buyer_company_id },
  { header: "Supplying business", value: (r) => r.supplier_company_name },
  { header: "Supplying business id", value: (r) => r.supplier_company_id },
  { header: "Requirement line id", value: (r) => r.demand_line_id },
  { header: "Capacity line id", value: (r) => r.capacity_line_id },
  { header: "Trade", value: (r) => r.trade_role_name },
  { header: "Trade id", value: (r) => r.trade_role_id },
  { header: "Proficiency", value: (r) => r.proficiency_name },
  { header: "Proficiency id", value: (r) => r.proficiency_id },
  { header: "Work region", value: (r) => r.work_region_name },
  { header: "Work region id", value: (r) => r.work_region_id },
  { header: "Start date", value: (r) => r.start_date },
  { header: "End date", value: (r) => r.end_date },
  { header: "Hours per week", value: (r) => r.hours_per_week },
  { header: "Supplier rate (AUD ex GST)", value: (r) => centsColumn(r.supplier_rate_cents) },
  { header: "Fee (basis points)", value: (r) => r.fee_bp },
  { header: "Fee per hour (AUD ex GST)", value: (r) => centsColumn(r.fee_cents_per_hour) },
  { header: "Buyer rate (AUD ex GST)", value: (r) => centsColumn(r.buyer_rate_cents) },
  { header: "Expected hours", value: (r) => r.expected_hours },
  {
    header: "Estimated supplier value (AUD ex GST)",
    value: (r) => centsColumn(r.estimated_supplier_value_cents),
  },
  {
    header: "Estimated Maintain revenue (AUD ex GST)",
    value: (r) => centsColumn(r.estimated_maintain_revenue_cents),
  },
  {
    header: "Estimated buyer value (AUD ex GST)",
    value: (r) => centsColumn(r.estimated_buyer_value_cents),
  },
  { header: "Commercial confirmed at", value: (r) => r.commercial_confirmed_at },
  { header: "Payment status", value: (r) => r.payment_status },
  { header: "External payment reference", value: (r) => r.external_payment_ref },
  { header: "Actual hours", value: (r) => r.actual_hours },
  { header: "Actual value (AUD ex GST)", value: (r) => centsColumn(r.actual_value_cents) },
  { header: "Completed at", value: (r) => r.completed_at },
  { header: "Dispute notes", value: (r) => r.dispute_notes },
  { header: "Cancelled by", value: (r) => r.cancelled_by },
  { header: "Cancellation reason", value: (r) => r.cancel_reason },
  {
    header: "Within notice window",
    value: (r) => (r.within_notice_window === null ? "" : r.within_notice_window ? "yes" : "no"),
  },
  { header: "Created at", value: (r) => r.created_at },
];

export type CompanyExportRow = {
  id: string;
  legal_name: string;
  trading_name: string | null;
  abn: string | null;
  status: string;
  industry_name: string | null;
  primary_region_name: string | null;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  worker_count: number;
  created_at: string;
};

export const COMPANY_EXPORT_COLUMNS: CsvColumn<CompanyExportRow>[] = [
  { header: "Company id", value: (r) => r.id },
  { header: "Legal name", value: (r) => r.legal_name },
  { header: "Trading name", value: (r) => r.trading_name },
  { header: "ABN", value: (r) => r.abn },
  { header: "Status", value: (r) => r.status },
  { header: "Industry", value: (r) => r.industry_name },
  { header: "Primary region", value: (r) => r.primary_region_name },
  { header: "Contact name", value: (r) => r.contact_name },
  { header: "Contact email", value: (r) => r.contact_email },
  { header: "Contact phone", value: (r) => r.contact_phone },
  { header: "Crew on record", value: (r) => r.worker_count },
  { header: "Registered", value: (r) => r.created_at },
];

/**
 * 17.2 — worker mobile and email are never in a buyer-facing response. This export is
 * Maintain-only (14.3 names the admin lists), so contact details are present here and
 * nowhere else; no rating or score field exists to export (6.3).
 */
export type WorkerExportRow = {
  id: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  status: string;
  employer_name: string | null;
  employer_id: string | null;
  base_region_name: string | null;
  trade_role_name: string | null;
  proficiency_name: string | null;
  proficiency_overridden_by_maintain: boolean;
  qualifications_current: number;
  qualifications_expiring: number;
  qualifications_expired: number;
  created_at: string;
};

export const WORKER_EXPORT_COLUMNS: CsvColumn<WorkerExportRow>[] = [
  { header: "Worker id", value: (r) => r.id },
  { header: "First name", value: (r) => r.first_name },
  { header: "Last name", value: (r) => r.last_name },
  { header: "Mobile", value: (r) => r.mobile },
  { header: "Email", value: (r) => r.email },
  { header: "Status", value: (r) => r.status },
  { header: "Current employer", value: (r) => r.employer_name },
  { header: "Current employer id", value: (r) => r.employer_id },
  { header: "Base region", value: (r) => r.base_region_name },
  { header: "Primary trade", value: (r) => r.trade_role_name },
  { header: "Primary proficiency", value: (r) => r.proficiency_name },
  {
    header: "Proficiency set by Maintain",
    value: (r) => (r.proficiency_overridden_by_maintain ? "yes" : "no"),
  },
  { header: "Qualifications current", value: (r) => r.qualifications_current },
  { header: "Qualifications expiring", value: (r) => r.qualifications_expiring },
  { header: "Qualifications expired", value: (r) => r.qualifications_expired },
  { header: "Created", value: (r) => r.created_at },
];
