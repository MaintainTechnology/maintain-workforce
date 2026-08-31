// Database types — spec Constraints: generated from the schema by the supabase CLI
// (`supabase gen types typescript --local > src/lib/supabase/types.ts`) and regenerated
// on every migration. Checked in so typecheck runs without a live database.

export type CompanyStatus = "Pending" | "Active" | "Suspended" | "Closed";
export type WorkerStatus = "Active" | "Inactive" | "Suspended";
export type DocumentStatus = "Current" | "Expiring Soon" | "Expired";
export type LeadStatus = "New" | "Contacted" | "Qualified" | "Disqualified";
export type LeadIntent = "sell" | "buy" | "both";
export type CapacityLineStatus =
  | "Open" | "Partially Committed" | "Fully Committed" | "Withdrawn" | "Expired";
export type DemandLineStatus =
  | "Open" | "Partially Filled" | "Filled" | "Withdrawn" | "Expired";
export type MatchStatus =
  | "Awaiting Supplier" | "Awaiting Buyer" | "Accepted" | "Declined" | "Withdrawn" | "Expired";
export type EngagementStatus =
  | "Awaiting Commercial" | "Confirmed" | "Active" | "Completed" | "Cancelled" | "Disputed";
export type PaymentStatus = "none" | "pre-authorised" | "released" | "disputed";
export type TransferStatus =
  | "Requested" | "Awaiting Current Employer" | "Approved"
  | "Declined" | "Withdrawn" | "Admin Review" | "Completed";
export type CredentialLevel = "worker" | "company";

export type Company = {
  id: string;
  legal_name: string;
  trading_name: string | null;
  abn: string | null;
  industry_id: string | null;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  primary_region_id: string | null;
  status: CompanyStatus;
  created_at: string;
};

export type CompanyDocument = {
  id: string;
  company_id: string;
  qualification_id: string | null;
  doc_type: string;
  number: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  status: DocumentStatus;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
};

export type Lead = {
  id: string;
  source: string | null;
  intent: LeadIntent;
  contact_name: string | null;
  business_name: string | null;
  abn: string | null;
  phone: string | null;
  email: string | null;
  trade_interest: string | null;
  notes: string | null;
  funnel_score: string | null;
  status: LeadStatus;
  company_id: string | null;
  disqualified_reason: string | null;
  created_at: string;
};

export type Worker = {
  id: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  base_region_id: string | null;
  primary_trade_id: string;
  primary_proficiency_id: string;
  status: WorkerStatus;
  proficiency_assigned_by: string | null;
  proficiency_overridden_by_maintain: boolean;
  proficiency_changed_at: string | null;
  consent_confirmed_by: string | null;
  consent_confirmed_at: string;
  user_id: string | null;
  created_at: string;
};

export type WorkerQualification = {
  id: string;
  worker_id: string;
  qualification_id: string;
  number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  status: DocumentStatus;
  created_at: string;
};

export type WorkerEmployment = {
  id: string;
  worker_id: string;
  company_id: string;
  start_date: string;
  end_date: string | null;
  end_reason: string | null;
  created_at: string;
};

export type WorkerTransfer = {
  id: string;
  worker_id: string;
  from_company_id: string | null;
  to_company_id: string;
  status: TransferStatus;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;
  created_at: string;
};

export type CapacityLine = {
  id: string;
  listing_id: string;
  company_id: string;
  trade_role_id: string;
  proficiency_id: string;
  available_from: string;
  available_until: string;
  available_days: string | null;
  hours_per_week: number;
  location_region_id: string;
  supplier_rate_cents: number;
  rate_entered_by: string | null;
  rate_entered_by_admin: boolean;
  rate_ratified_at: string | null;
  status: CapacityLineStatus;
  created_at: string;
};

export type DemandLine = {
  id: string;
  request_id: string;
  company_id: string;
  trade_role_id: string;
  proficiency_id: string;
  quantity: number;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  notes: string | null;
  status: DemandLineStatus;
  created_at: string;
};

export type Match = {
  id: string;
  demand_line_id: string;
  supplier_company_id: string;
  buyer_company_id: string;
  capacity_line_id: string;
  requested_quantity: number;
  trade_role_id: string;
  proficiency_id: string;
  work_region_id: string;
  engagement_start: string;
  engagement_end: string;
  hours_per_week: number;
  supplier_rate_cents: number;
  fee_bp: number;
  buyer_rate_cents: number;
  status: MatchStatus;
  qualification_override_by: string | null;
  qualification_override_at: string | null;
  proposed_at: string;
  supplier_decided_at: string | null;
  buyer_decided_at: string | null;
  declined_by: string | null;
  decline_reason: string | null;
  admin_entered: boolean;
  evidence_note: string | null;
};

export type MatchWorker = {
  id: string;
  match_id: string;
  worker_id: string;
  knocked_out: boolean;
  knocked_out_reason: string | null;
  knocked_out_at: string | null;
};

export type Engagement = {
  id: string;
  match_id: string;
  demand_line_id: string;
  capacity_line_id: string;
  buyer_company_id: string;
  supplier_company_id: string;
  trade_role_id: string;
  proficiency_id: string;
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
  status: EngagementStatus;
  payment_status: PaymentStatus;
  external_payment_ref: string | null;
  commercial_confirmed_at: string | null;
  actual_hours: number | null;
  actual_value_cents: number | null;
  completed_at: string | null;
  dispute_notes: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  within_notice_window: boolean | null;
  created_at: string;
};

export type CatalogueRow = { id: string; name: string; is_active: boolean };
export type Proficiency = CatalogueRow & { rank: number };
export type TradeRole = CatalogueRow & { industry_id: string };

// ---------------------------------------------------------------- embedded joins
// PostgREST types an embedded relation as an array even when the foreign key makes it
// single-valued, so `select("trade:trade_role_id (name)")` comes back as
// `{name}[] | {name} | null` depending on the query shape. These helpers unwrap it in
// one place rather than casting at forty call sites, where a cast would quietly
// survive a schema change that a helper makes fail loudly.

export function joinedRow<T = Record<string, unknown>>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  if (value && typeof value === "object") return value as T;
  return null;
}

/** The `name` column of an embedded catalogue row (trade, proficiency, region, skill). */
export function joinedName(value: unknown): string | null {
  const row = joinedRow<{ name?: unknown }>(value);
  return typeof row?.name === "string" ? row.name : null;
}

/**
 * A company's display name. Trading name is what a site office recognises; the legal
 * name is the fallback, and it is the one that must appear on anything commercial.
 */
export function joinedCompanyName(value: unknown): string | null {
  const row = joinedRow<{ trading_name?: unknown; legal_name?: unknown }>(value);
  if (!row) return null;
  if (typeof row.trading_name === "string" && row.trading_name) return row.trading_name;
  return typeof row.legal_name === "string" ? row.legal_name : null;
}

/** A worker's full name — only ever used on surfaces where 12.5 permits identity. */
export function joinedPersonName(value: unknown): string | null {
  const row = joinedRow<{ first_name?: unknown; last_name?: unknown }>(value);
  if (!row) return null;
  const first = typeof row.first_name === "string" ? row.first_name : "";
  const last = typeof row.last_name === "string" ? row.last_name : "";
  const full = `${first} ${last}`.trim();
  return full || null;
}
