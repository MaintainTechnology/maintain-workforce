import {
  listAdminCompanies,
  normalizeCompanyReportFilters,
} from "@/lib/admin-reporting";
import { requireMaintainAdmin } from "@/lib/auth";
import { COMPANY_EXPORT_COLUMNS, csvResponse, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireMaintainAdmin();
  const filters = normalizeCompanyReportFilters(new URL(request.url).searchParams);

  try {
    const { rows } = await listAdminCompanies(filters, { kind: "all" });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(
      `companies-${stamp}.csv`,
      toCsv(COMPANY_EXPORT_COLUMNS, rows),
    );
  } catch {
    return new Response("Export failed.", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
