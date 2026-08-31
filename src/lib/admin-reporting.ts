import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CompanyStatus,
  DocumentStatus,
  WorkerStatus,
} from "@/lib/supabase/types";
import type { CompanyExportRow, WorkerExportRow } from "@/lib/csv";

type SearchParamRecord = Record<string, string | string[] | undefined>;
type ReportSearchParams = SearchParamRecord | URLSearchParams;

const COMPANY_STATUSES = ["Pending", "Active", "Suspended", "Closed"] as const;
const WORKER_STATUSES = ["Active", "Inactive", "Suspended"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_PAGE_SIZE = 100;
const REPORT_QUERY_BATCH_SIZE = 500;
const IN_FILTER_CHUNK_SIZE = 100;
const MAX_REPORT_PAGE = 1_000_000;

export type CompanyReportFilters = { status: CompanyStatus | "" };
export type WorkerReportFilters = { status: WorkerStatus | ""; trade: string };
export type ReportLoadOptions =
  | { kind: "page"; page: number }
  | { kind: "all" };

export type ReportPagination = {
  page: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type CompanyMembership = {
  user_id: string;
  invited_email: string | null;
  accepted_at: string | null;
};

export type AdminCompanyReportRow = CompanyExportRow & {
  status: CompanyStatus;
  company_user: CompanyMembership[];
};

export type AdminCompanyReport = {
  rows: AdminCompanyReportRow[];
  pagination: ReportPagination;
};

export type CatalogueOption = { id: string; name: string };

export type AdminWorkerReportRow = WorkerExportRow & {
  status: WorkerStatus;
  primary_trade_id: string;
  primary_proficiency_id: string;
  proficiency_changed_at: string | null;
  consent_confirmed_at: string;
};

export type AdminWorkerReport = {
  rows: AdminWorkerReportRow[];
  trades: CatalogueOption[];
  proficienciesByTrade: Map<string, CatalogueOption[]>;
  pagination: ReportPagination;
};

function valueOf(params: ReportSearchParams, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key)?.trim() ?? "";
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return allowed.includes(value as T) ? (value as T) : "";
}

export function normalizeCompanyReportFilters(
  params: ReportSearchParams,
): CompanyReportFilters {
  return { status: oneOf(valueOf(params, "status"), COMPANY_STATUSES) };
}

export function normalizeWorkerReportFilters(
  params: ReportSearchParams,
): WorkerReportFilters {
  const trade = valueOf(params, "trade");
  return {
    status: oneOf(valueOf(params, "status"), WORKER_STATUSES),
    trade: UUID.test(trade) ? trade.toLowerCase() : "",
  };
}

export function normalizeReportPage(params: ReportSearchParams): number {
  const raw = valueOf(params, "page");
  if (!/^[1-9]\d*$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page <= MAX_REPORT_PAGE ? page : 1;
}

function href(path: string, entries: [string, string][]): string {
  const query = new URLSearchParams(entries.filter(([, value]) => value));
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function companyExportHref(filters: CompanyReportFilters): string {
  return href("/admin/companies/export", [["status", filters.status]]);
}

export function workerExportHref(filters: WorkerReportFilters): string {
  return href("/admin/workers/export", [
    ["status", filters.status],
    ["trade", filters.trade],
  ]);
}

export function companyPageHref(
  filters: CompanyReportFilters,
  page: number,
): string {
  return href("/admin/companies", [
    ["status", filters.status],
    ["page", page > 1 ? String(page) : ""],
  ]);
}

export function workerPageHref(filters: WorkerReportFilters, page: number): string {
  return href("/admin/workers", [
    ["status", filters.status],
    ["trade", filters.trade],
    ["page", page > 1 ? String(page) : ""],
  ]);
}

type QueryError = { message?: string } | null;
type QueryPageResult = { data: unknown; error: QueryError; count: number | null };
type FetchReportPage = (from: number, to: number) => PromiseLike<QueryPageResult>;

function reportRowId(row: unknown): unknown {
  return typeof row === "object" && row !== null ? Reflect.get(row, "id") : undefined;
}

function throwOnError(error: QueryError, report: string): void {
  if (error) {
    throw new Error(
      `${report} query failed${error.message ? `: ${error.message}` : ""}`,
    );
  }
}

function appendReportRows<T>(
  rows: T[],
  page: T[],
  seen: Set<string>,
  report: string,
  rowKey: (row: T) => unknown = reportRowId,
): void {
  for (const row of page) {
    const key = typeof row === "object" && row !== null && !Array.isArray(row)
      ? rowKey(row)
      : undefined;
    if (typeof key !== "string" || key.length === 0 || seen.has(key)) {
      throw new Error(`${report} query returned duplicate or invalid rows. Please retry.`);
    }
    seen.add(key);
    rows.push(row);
  }
}

/** Count every range and advance by received rows, not a potentially higher API limit. */
async function readReportRows<T>(
  fetchPage: FetchReportPage,
  report: string,
  offset = 0,
  size?: number,
  batchSize = REPORT_QUERY_BATCH_SIZE,
  rowKey: (row: T) => unknown = reportRowId,
): Promise<{ rows: T[]; total: number }> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("Report batch size must be a positive integer");
  }

  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  do {
    const from = offset + rows.length;
    const requested = size === undefined ? batchSize : Math.min(batchSize, size - rows.length);
    const result = await fetchPage(from, from + requested - 1);
    throwOnError(result.error, report);
    if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error(`${report} query did not return an exact count.`);
    }
    if (total !== undefined && result.count !== total) {
      throw new Error(`${report} query changed while loading. Please retry.`);
    }
    total = result.count;
    if (!Array.isArray(result.data)) {
      throw new Error(`${report} query returned an invalid row set`);
    }
    const page = result.data as T[];
    const available = Math.max(0, total - from);
    if (page.length > Math.min(requested, available) || (page.length === 0 && available > 0)) {
      throw new Error(`${report} query returned an incomplete range.`);
    }
    appendReportRows(rows, page, seen, report, rowKey);
  } while (offset + rows.length < total && (size === undefined || rows.length < size));
  return { rows, total };
}

/** Fetch every counted range explicitly so successful API caps cannot truncate a report. */
export async function collectReportPages<T>(
  fetchPage: FetchReportPage,
  report: string,
  batchSize = REPORT_QUERY_BATCH_SIZE,
  rowKey: (row: T) => unknown = reportRowId,
): Promise<T[]> {
  const result = await readReportRows<T>(fetchPage, report, 0, undefined, batchSize, rowKey);
  return result.rows;
}

async function collectChunkedReportPages<T>(
  values: string[],
  fetchPage: (
    chunk: string[],
    from: number,
    to: number,
  ) => PromiseLike<QueryPageResult>,
  report: string,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < values.length; offset += IN_FILTER_CHUNK_SIZE) {
    const chunk = values.slice(offset, offset + IN_FILTER_CHUNK_SIZE);
    const page = await collectReportPages<T>(
      (from, to) => fetchPage(chunk, from, to),
      `${report} batch ${offset / IN_FILTER_CHUNK_SIZE + 1}`,
    );
    appendReportRows(rows, page, seen, report);
  }
  return rows;
}

function safePage(page: number): number {
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_REPORT_PAGE
    ? page
    : 1;
}

async function loadReportRows<T>(
  options: ReportLoadOptions,
  fetchPage: (from: number, to: number) => PromiseLike<QueryPageResult>,
  report: string,
): Promise<{ rows: T[]; pagination: ReportPagination }> {
  if (options.kind === "all") {
    const rows = await collectReportPages<T>(fetchPage, report);
    return {
      rows,
      pagination: {
        page: 1,
        pageSize: rows.length,
        hasPrevious: false,
        hasNext: false,
      },
    };
  }

  const page = safePage(options.page);
  const from = (page - 1) * REPORT_PAGE_SIZE;
  const result = await readReportRows<T>(fetchPage, report, from, REPORT_PAGE_SIZE);
  return {
    rows: result.rows,
    pagination: {
      page,
      pageSize: REPORT_PAGE_SIZE,
      hasPrevious: page > 1,
      hasNext: from + result.rows.length < result.total,
    },
  };
}

type RawCompany = {
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
  company_user: CompanyMembership[] | null;
};

function companyRange(
  admin: ReturnType<typeof createAdminClient>,
  filters: CompanyReportFilters,
  from: number,
  to: number,
) {
  let query = admin
    .from("company")
    .select(
      `id, legal_name, trading_name, abn, industry_id, contact_name, contact_email,
       contact_phone, primary_region_id, status, created_at,
       company_user (user_id, invited_email, accepted_at)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (filters.status) query = query.eq("status", filters.status);
  return query.range(from, to);
}

/** Shared filtered data source for the Maintain-only Companies list and download. */
export async function listAdminCompanies(
  filters: CompanyReportFilters,
  options: ReportLoadOptions,
): Promise<AdminCompanyReport> {
  const admin = createAdminClient();
  const companyBatch = await loadReportRows<RawCompany>(
    options,
    (from, to) => companyRange(admin, filters, from, to),
    "Company report",
  );
  const companies = companyBatch.rows;
  if (companies.length === 0) {
    return { rows: [], pagination: companyBatch.pagination };
  }

  const companyIds = companies.map((row) => row.id);
  const [industries, regions, employments] = await Promise.all([
    collectReportPages<Record<string, unknown>>(
      (from, to) =>
        admin
          .from("industry")
          .select("id, name", { count: "exact" })
          .order("id")
          .range(from, to),
      "Company industry report",
    ),
    collectReportPages<Record<string, unknown>>(
      (from, to) =>
        admin
          .from("region")
          .select("id, name", { count: "exact" })
          .order("id")
          .range(from, to),
      "Company region report",
    ),
    collectChunkedReportPages<Record<string, unknown>>(
      companyIds,
      (chunk, from, to) =>
        admin
          .from("worker_employment")
          .select("id, worker_id, company_id", { count: "exact" })
          .is("end_date", null)
          .in("company_id", chunk)
          .order("id")
          .range(from, to),
      "Company crew report",
    ),
  ]);

  const industryName = nameMap(industries);
  const regionName = nameMap(regions);
  const workerCount = new Map<string, number>();
  for (const employment of employments) {
    const companyId = employment.company_id;
    if (typeof companyId !== "string") continue;
    workerCount.set(companyId, (workerCount.get(companyId) ?? 0) + 1);
  }

  return {
    pagination: companyBatch.pagination,
    rows: companies.map((company) => ({
      id: company.id,
      legal_name: company.legal_name,
      trading_name: company.trading_name,
      abn: company.abn,
      status: company.status,
      industry_name: company.industry_id
        ? (industryName.get(company.industry_id) ?? null)
        : null,
      primary_region_name: company.primary_region_id
        ? (regionName.get(company.primary_region_id) ?? null)
        : null,
      contact_name: company.contact_name,
      contact_email: company.contact_email,
      contact_phone: company.contact_phone,
      worker_count: workerCount.get(company.id) ?? 0,
      created_at: company.created_at,
      company_user: company.company_user ?? [],
    })),
  };
}

type RawWorker = {
  id: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  status: WorkerStatus;
  base_region_id: string | null;
  primary_trade_id: string;
  primary_proficiency_id: string;
  proficiency_overridden_by_maintain: boolean;
  proficiency_changed_at: string | null;
  consent_confirmed_at: string;
  created_at: string;
};

function workerRange(
  admin: ReturnType<typeof createAdminClient>,
  filters: WorkerReportFilters,
  from: number,
  to: number,
) {
  let workerQuery = admin
    .from("worker")
    .select(
      `id, first_name, last_name, mobile, email, status, base_region_id,
       primary_trade_id, primary_proficiency_id, proficiency_overridden_by_maintain,
       proficiency_changed_at, consent_confirmed_at, created_at`,
      { count: "exact" },
    )
    .order("last_name")
    .order("first_name")
    .order("id");
  if (filters.status) workerQuery = workerQuery.eq("status", filters.status);
  if (filters.trade) {
    workerQuery = workerQuery.eq("primary_trade_id", filters.trade);
  }
  return workerQuery.range(from, to);
}

/** Shared filtered data source for the Maintain-only Workers list and download. */
export async function listAdminWorkers(
  filters: WorkerReportFilters,
  options: ReportLoadOptions,
): Promise<AdminWorkerReport> {
  const admin = createAdminClient();
  const [workerBatch, tradeRows, proficiencyRows, pairRows, regionRows] =
    await Promise.all([
      loadReportRows<RawWorker>(
        options,
        (from, to) => workerRange(admin, filters, from, to),
        "Worker report",
      ),
      collectReportPages<Record<string, unknown>>(
        (from, to) =>
          admin
            .from("trade_role")
            .select("id, name", { count: "exact" })
            .order("name")
            .order("id")
            .range(from, to),
        "Worker trade report",
      ),
      collectReportPages<Record<string, unknown>>(
        (from, to) =>
          admin
            .from("proficiency")
            .select("id, name, rank", { count: "exact" })
            .order("rank")
            .order("id")
            .range(from, to),
        "Worker proficiency report",
      ),
      collectReportPages<Record<string, unknown>>(
        (from, to) =>
          admin
            .from("trade_role_proficiency")
            .select("trade_role_id, proficiency_id", { count: "exact" })
            .order("trade_role_id")
            .order("proficiency_id")
            .range(from, to),
        "Worker trade proficiency report",
        REPORT_QUERY_BATCH_SIZE,
        (row) => typeof row.trade_role_id === "string" && row.trade_role_id.length > 0 &&
          typeof row.proficiency_id === "string" && row.proficiency_id.length > 0
          ? JSON.stringify([row.trade_role_id, row.proficiency_id])
          : undefined,
      ),
      collectReportPages<Record<string, unknown>>(
        (from, to) =>
          admin
            .from("region")
            .select("id, name", { count: "exact" })
            .order("id")
            .range(from, to),
        "Worker region report",
      ),
    ]);

  const workers = workerBatch.rows;
  const trades = optionsFromRows(tradeRows);
  const proficiencies = optionsFromRows(proficiencyRows);
  const proficiencyName = new Map(proficiencies.map((row) => [row.id, row.name]));
  const tradeName = new Map(trades.map((row) => [row.id, row.name]));
  const regionName = nameMap(regionRows);
  const proficienciesByTrade = new Map<string, CatalogueOption[]>();
  for (const pair of pairRows) {
    const tradeId = pair.trade_role_id;
    const proficiencyId = pair.proficiency_id;
    if (typeof tradeId !== "string" || typeof proficiencyId !== "string") continue;
    const name = proficiencyName.get(proficiencyId);
    if (!name) continue;
    proficienciesByTrade.set(tradeId, [
      ...(proficienciesByTrade.get(tradeId) ?? []),
      { id: proficiencyId, name },
    ]);
  }

  if (workers.length === 0) {
    return {
      rows: [],
      trades,
      proficienciesByTrade,
      pagination: workerBatch.pagination,
    };
  }

  const workerIds = workers.map((row) => row.id);
  const [employments, qualifications] = await Promise.all([
    collectChunkedReportPages<Record<string, unknown>>(
      workerIds,
      (chunk, from, to) =>
        admin
          .from("worker_employment")
          .select("id, worker_id, company_id", { count: "exact" })
          .is("end_date", null)
          .in("worker_id", chunk)
          .order("id")
          .range(from, to),
      "Worker employer report",
    ),
    collectChunkedReportPages<Record<string, unknown>>(
      workerIds,
      (chunk, from, to) =>
        admin
          .from("worker_qualification")
          .select("id, worker_id, status", { count: "exact" })
          .in("worker_id", chunk)
          .order("id")
          .range(from, to),
      "Worker qualification report",
    ),
  ]);

  const companyIds = unique(
    employments.map((row) =>
      typeof row.company_id === "string" ? row.company_id : null,
    ),
  );
  const companies = await collectChunkedReportPages<Record<string, unknown>>(
    companyIds,
    (chunk, from, to) =>
      admin
        .from("company")
        .select("id, legal_name", { count: "exact" })
        .in("id", chunk)
        .order("id")
        .range(from, to),
    "Worker employer company report",
  );
  const companyName = nameMap(companies, "legal_name");

  const employer = new Map<string, { id: string; name: string | null }>();
  for (const employment of employments) {
    const workerId = employment.worker_id;
    const companyId = employment.company_id;
    if (typeof workerId !== "string" || typeof companyId !== "string") continue;
    employer.set(workerId, {
      id: companyId,
      name: companyName.get(companyId) ?? null,
    });
  }

  const qualificationCounts = new Map<
    string,
    Record<DocumentStatus, number>
  >();
  for (const qualification of qualifications) {
    const workerId = qualification.worker_id;
    const status = qualification.status;
    if (
      typeof workerId !== "string" ||
      (status !== "Current" && status !== "Expiring Soon" && status !== "Expired")
    ) {
      continue;
    }
    const count = qualificationCounts.get(workerId) ?? {
      Current: 0,
      "Expiring Soon": 0,
      Expired: 0,
    };
    count[status] += 1;
    qualificationCounts.set(workerId, count);
  }

  return {
    trades,
    proficienciesByTrade,
    pagination: workerBatch.pagination,
    rows: workers.map((worker) => {
      const currentEmployer = employer.get(worker.id);
      const counts = qualificationCounts.get(worker.id) ?? {
        Current: 0,
        "Expiring Soon": 0,
        Expired: 0,
      };
      return {
        id: worker.id,
        first_name: worker.first_name,
        last_name: worker.last_name,
        mobile: worker.mobile,
        email: worker.email,
        status: worker.status,
        employer_name: currentEmployer?.name ?? null,
        employer_id: currentEmployer?.id ?? null,
        base_region_name: worker.base_region_id
          ? (regionName.get(worker.base_region_id) ?? null)
          : null,
        trade_role_name: tradeName.get(worker.primary_trade_id) ?? null,
        proficiency_name: proficiencyName.get(worker.primary_proficiency_id) ?? null,
        proficiency_overridden_by_maintain:
          worker.proficiency_overridden_by_maintain,
        qualifications_current: counts.Current,
        qualifications_expiring: counts["Expiring Soon"],
        qualifications_expired: counts.Expired,
        created_at: worker.created_at,
        primary_trade_id: worker.primary_trade_id,
        primary_proficiency_id: worker.primary_proficiency_id,
        proficiency_changed_at: worker.proficiency_changed_at,
        consent_confirmed_at: worker.consent_confirmed_at,
      };
    }),
  };
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function optionsFromRows(rows: Record<string, unknown>[]): CatalogueOption[] {
  return rows.flatMap((row) =>
    typeof row.id === "string" && typeof row.name === "string"
      ? [{ id: row.id, name: row.name }]
      : [],
  );
}

function nameMap(
  rows: Record<string, unknown>[],
  field = "name",
): Map<string, string> {
  return new Map(
    rows.flatMap((row) =>
      typeof row.id === "string" && typeof row[field] === "string"
        ? [[row.id, row[field] as string] as const]
        : [],
    ),
  );
}
