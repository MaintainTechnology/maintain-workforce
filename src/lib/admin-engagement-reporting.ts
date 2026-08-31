import "server-only";

import { requireMaintainAdmin } from "@/lib/auth";
import type { EngagementExportRow } from "@/lib/csv";
import { dateRangeProblem } from "@/lib/domain/availability";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinedName, joinedRow, type Engagement, type EngagementStatus } from "@/lib/supabase/types";

export const ENGAGEMENT_REPORT_STATUSES = [
  "Awaiting Commercial", "Confirmed", "Active", "Completed", "Cancelled", "Disputed",
] as const satisfies readonly EngagementStatus[];

type SearchParams = Record<string, string | string[] | undefined> | URLSearchParams;
export type EngagementReportFilters = {
  status: EngagementStatus | "";
  timing: "overdue" | "upcoming" | "";
  buyer: string;
  supplier: string;
  /** Inclusive window intersection, not just engagements starting within these dates. */
  from: string;
  to: string;
};
export type EngagementReportOptions = { kind: "page"; page: number } | { kind: "all" };
export type EngagementComplianceIssue = {
  source_type: "company" | "worker";
  source_id: string;
  reason: string;
};
export type AdminEngagementRow = EngagementExportRow & {
  status: EngagementStatus;
  worker_count: number;
  overdue: boolean;
  upcoming: boolean;
  compliance_review_count: number;
  compliance_issues: EngagementComplianceIssue[];
};
export type AdminEngagementReport = {
  rows: AdminEngagementRow[];
  companies: { id: string; name: string }[];
  pagination: { page: number; pageSize: number; total: number; hasPrevious: boolean; hasNext: boolean };
};

export class EngagementReportFilterError extends Error {}
export class EngagementReportQueryError extends Error {}

const PAGE_SIZE = 100;
const QUERY_BATCH_SIZE = 500;
const IN_CHUNK_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valueOf(params: SearchParams, key: string): string {
  const values = params instanceof URLSearchParams ? params.getAll(key) : params[key];
  if (Array.isArray(values)) {
    if (params instanceof URLSearchParams && values.length <= 1) return values[0]?.trim() ?? "";
    throw new EngagementReportFilterError(`Choose only one ${key} filter.`);
  }
  return values?.trim() ?? "";
}

/** Invalid filters fail explicitly, so a malformed download cannot silently broaden its scope. */
export function normalizeEngagementReportFilters(params: SearchParams): EngagementReportFilters {
  const status = valueOf(params, "status");
  const timing = valueOf(params, "timing");
  if (status && !ENGAGEMENT_REPORT_STATUSES.includes(status as EngagementStatus)) {
    throw new EngagementReportFilterError("Choose a valid engagement status.");
  }
  if (timing !== "" && timing !== "overdue" && timing !== "upcoming") {
    throw new EngagementReportFilterError("Choose a valid engagement timing filter.");
  }
  const buyer = valueOf(params, "buyer").toLowerCase();
  const supplier = valueOf(params, "supplier").toLowerCase();
  for (const [label, value] of [["buyer", buyer], ["supplier", supplier]]) {
    if (value && !UUID.test(value)) throw new EngagementReportFilterError(`Choose a valid ${label} company.`);
  }
  const from = valueOf(params, "from");
  const to = valueOf(params, "to");
  for (const value of [from, to]) {
    if (value && (value.startsWith("0000") || dateRangeProblem({ start: value, end: value }))) {
      throw new EngagementReportFilterError("Choose valid calendar dates for the report window.");
    }
  }
  if (from && to && from > to) throw new EngagementReportFilterError("The report window must end on or after its start date.");
  return { status: status as EngagementReportFilters["status"], timing, buyer, supplier, from, to };
}

export function normalizeEngagementReportPage(params: SearchParams): number {
  const value = valueOf(params, "page");
  if (!value) return 1;
  const page = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(page) || page > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)) {
    throw new EngagementReportFilterError("Choose a valid whole-number page starting at 1.");
  }
  return page;
}

function reportHref(path: string, filters: EngagementReportFilters, page?: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(normalizeEngagementReportFilters(filters))) {
    if (value) query.set(key, value);
  }
  if (page !== undefined && page > 1) query.set("page", String(normalizeEngagementReportPage({ page: String(page) })));
  return query.size ? `${path}?${query}` : path;
}

export function engagementExportHref(filters: EngagementReportFilters): string {
  return reportHref("/admin/engagements/export", filters);
}

export function engagementPageHref(filters: EngagementReportFilters, page: number): string {
  return reportHref("/admin/engagements", filters, page);
}

type QueryResult = { data: unknown; error: { message?: string } | null; count: number | null };
type FetchRange = (from: number, to: number) => PromiseLike<QueryResult>;

/** Exact counts detect missing ranges; advance by received rows even if the API cap is lower. */
async function readRows<T>(
  fetchRange: FetchRange,
  label: string,
  offset = 0,
  size?: number,
  rowKey: (row: T) => unknown = (row) => joinedRow<{ id?: unknown }>(row)?.id,
): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  do {
    const from = offset + rows.length;
    const requested = size === undefined ? QUERY_BATCH_SIZE : Math.min(QUERY_BATCH_SIZE, size - rows.length);
    const result = await fetchRange(from, from + requested - 1);
    if (result.error) throw new EngagementReportQueryError(`${label} report query failed.`, { cause: result.error });
    if (!Number.isSafeInteger(result.count) || result.count === null || result.count < 0) {
      throw new EngagementReportQueryError(`${label} report did not return an exact count.`);
    }
    if (total !== undefined && result.count !== total) {
      throw new EngagementReportQueryError(`${label} report changed while loading. Please retry.`);
    }
    total = result.count;
    if (!Array.isArray(result.data)) throw new EngagementReportQueryError(`${label} report returned an invalid row set.`);
    const page = result.data as T[];
    const available = Math.max(0, total - from);
    if (page.length > Math.min(requested, available) || (page.length === 0 && available > 0)) {
      throw new EngagementReportQueryError(`${label} report returned an incomplete range.`);
    }
    for (const row of page) {
      const key = rowKey(row);
      if (typeof key !== "string" || seen.has(key)) {
        throw new EngagementReportQueryError(`${label} report returned duplicate or invalid rows. Please retry.`);
      }
      seen.add(key);
      rows.push(row);
    }
  } while (offset + rows.length < total && (size === undefined || rows.length < size));
  return { rows, total };
}

const ENGAGEMENT_SELECT = `
  id, match_id, buyer_company_id, supplier_company_id, demand_line_id, capacity_line_id,
  trade_role_id, proficiency_id, work_region_id, start_date, end_date, hours_per_week,
  supplier_rate_cents, fee_bp, fee_cents_per_hour, buyer_rate_cents, expected_hours,
  estimated_supplier_value_cents, estimated_maintain_revenue_cents, estimated_buyer_value_cents,
  status, commercial_confirmed_at, payment_status, external_payment_ref, actual_hours,
  actual_value_cents, completed_at, dispute_notes, cancelled_by, cancel_reason, within_notice_window, created_at,
  buyer:buyer_company_id (legal_name, trading_name),
  supplier:supplier_company_id (legal_name, trading_name),
  trade:trade_role_id (name), proficiency:proficiency_id (name), region:work_region_id (name)`;

type AdminClient = ReturnType<typeof createAdminClient>;
type RawEngagement = Engagement & { buyer: unknown; supplier: unknown; trade: unknown; proficiency: unknown; region: unknown };

function engagementRange(admin: AdminClient, filters: EngagementReportFilters, today: string, from: number, to: number) {
  let query = admin.from("engagement").select(ENGAGEMENT_SELECT, { count: "exact" })
    .order("start_date", { ascending: true }).order("id", { ascending: true });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.timing === "overdue") query = query.eq("status", "Awaiting Commercial").lte("start_date", today);
  if (filters.timing === "upcoming") query = query.eq("status", "Confirmed").gt("start_date", today);
  if (filters.buyer) query = query.eq("buyer_company_id", filters.buyer);
  if (filters.supplier) query = query.eq("supplier_company_id", filters.supplier);
  if (filters.from) query = query.gte("end_date", filters.from);
  if (filters.to) query = query.lte("start_date", filters.to);
  return query.range(from, to);
}

function companyName(value: unknown): string | null {
  const row = joinedRow<{ legal_name?: string; trading_name?: string | null }>(value);
  return row?.trading_name || row?.legal_name || null;
}

async function reportCompanies(admin: AdminClient): Promise<AdminEngagementReport["companies"]> {
  const result = await readRows<{ id: string; legal_name: string; trading_name: string | null }>(
    (from, to) => admin.from("company").select("id, legal_name, trading_name", { count: "exact" })
      .order("legal_name", { ascending: true }).order("id", { ascending: true }).range(from, to),
    "Engagement company choices",
  );
  return result.rows.map((row) => ({ id: row.id, name: companyName(row) ?? row.id }));
}

/** No per-engagement request: bounded IN batches, with every child range accounted for. */
async function workerCounts(admin: AdminClient, engagementIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let offset = 0; offset < engagementIds.length; offset += IN_CHUNK_SIZE) {
    const chunk = engagementIds.slice(offset, offset + IN_CHUNK_SIZE);
    const result = await readRows<{ id: string; engagement_id: string }>(
      (from, to) => admin.from("engagement_worker").select("id, engagement_id", { count: "exact" })
        .in("engagement_id", chunk).order("id", { ascending: true }).range(from, to),
      "Engagement worker counts",
    );
    for (const row of result.rows) counts.set(row.engagement_id, (counts.get(row.engagement_id) ?? 0) + 1);
  }
  return counts;
}

/** 1.6 / 7.2: the renewal-aware view flags commitments; this loader never mutates them. */
async function complianceIssues(admin: AdminClient, engagementIds: string[]): Promise<Map<string, EngagementComplianceIssue[]>> {
  type ReviewRow = EngagementComplianceIssue & { engagement_id: string };
  const issues = new Map<string, EngagementComplianceIssue[]>();
  for (let offset = 0; offset < engagementIds.length; offset += IN_CHUNK_SIZE) {
    const chunk = engagementIds.slice(offset, offset + IN_CHUNK_SIZE);
    const result = await readRows<ReviewRow>(
      (from, to) => admin.from("engagement_compliance_review")
        .select("engagement_id, source_type, source_id, reason", { count: "exact" })
        .in("engagement_id", chunk).order("engagement_id", { ascending: true })
        .order("source_type", { ascending: true }).order("source_id", { ascending: true }).range(from, to),
      "Engagement compliance review", 0, undefined,
      (row) => {
        if (!UUID.test(row.engagement_id) || !UUID.test(row.source_id) || typeof row.reason !== "string" ||
          (row.source_type !== "company" && row.source_type !== "worker")) {
          throw new EngagementReportQueryError("Engagement compliance report returned an invalid warning.");
        }
        return `${row.engagement_id}/${row.source_type}/${row.source_id}`;
      },
    );
    for (const row of result.rows) {
      const list = issues.get(row.engagement_id) ?? [];
      list.push({ source_type: row.source_type, source_id: row.source_id, reason: row.reason });
      issues.set(row.engagement_id, list);
    }
  }
  return issues;
}

function reportRow(row: RawEngagement, count: number, today: string, issues: EngagementComplianceIssue[]): AdminEngagementRow {
  const { buyer, supplier, trade, proficiency, region, ...snapshot } = row;
  return {
    ...snapshot,
    buyer_company_name: companyName(buyer), supplier_company_name: companyName(supplier),
    trade_role_name: joinedName(trade), proficiency_name: joinedName(proficiency), work_region_name: joinedName(region),
    hours_per_week: Number(row.hours_per_week), supplier_rate_cents: Number(row.supplier_rate_cents),
    fee_bp: Number(row.fee_bp), fee_cents_per_hour: Number(row.fee_cents_per_hour), buyer_rate_cents: Number(row.buyer_rate_cents),
    expected_hours: Number(row.expected_hours), estimated_supplier_value_cents: Number(row.estimated_supplier_value_cents),
    estimated_maintain_revenue_cents: Number(row.estimated_maintain_revenue_cents), estimated_buyer_value_cents: Number(row.estimated_buyer_value_cents),
    actual_hours: row.actual_hours == null ? null : Number(row.actual_hours),
    actual_value_cents: row.actual_value_cents == null ? null : Number(row.actual_value_cents),
    worker_count: count,
    overdue: row.status === "Awaiting Commercial" && row.start_date <= today,
    upcoming: row.status === "Confirmed" && row.start_date > today,
    compliance_review_count: issues.length,
    compliance_issues: issues,
  };
}

function brisbaneToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** One authorized, filtered source for both the screen and its exhaustive CSV download. */
export async function listAdminEngagements(
  filters: EngagementReportFilters,
  options: EngagementReportOptions,
): Promise<AdminEngagementReport> {
  await requireMaintainAdmin();
  const normalized = normalizeEngagementReportFilters(filters);
  const page = options.kind === "page" ? normalizeEngagementReportPage({ page: String(options.page) }) : 1;
  const admin = createAdminClient();
  const today = brisbaneToday();
  const offset = options.kind === "page" ? (page - 1) * PAGE_SIZE : 0;
  const [{ rows, total }, companies] = await Promise.all([
    readRows<RawEngagement>((from, to) => engagementRange(admin, normalized, today, from, to),
      "Engagement", offset, options.kind === "page" ? PAGE_SIZE : undefined),
    options.kind === "page" ? reportCompanies(admin) : Promise.resolve([]),
  ]);
  const ids = rows.map((row) => row.id);
  const [counts, issues] = await Promise.all([workerCounts(admin, ids), complianceIssues(admin, ids)]);
  return {
    rows: rows.map((row) => reportRow(row, counts.get(row.id) ?? 0, today, issues.get(row.id) ?? [])),
    companies,
    pagination: { page, pageSize: PAGE_SIZE, total, hasPrevious: page > 1, hasNext: options.kind === "page" && offset + rows.length < total },
  };
}

/** Detail reads cannot disappear behind a list/API cap, and a query error is never a 404. */
export async function getAdminEngagement(id: string): Promise<AdminEngagementRow | null> {
  await requireMaintainAdmin();
  if (!UUID.test(id)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("engagement").select(ENGAGEMENT_SELECT).eq("id", id).maybeSingle();
  if (error) throw new EngagementReportQueryError("Engagement detail report query failed.", { cause: error });
  if (!data) return null;
  const row = data as unknown as RawEngagement;
  const [counts, issues] = await Promise.all([workerCounts(admin, [row.id]), complianceIssues(admin, [row.id])]);
  return reportRow(row, counts.get(row.id) ?? 0, brisbaneToday(), issues.get(row.id) ?? []);
}
