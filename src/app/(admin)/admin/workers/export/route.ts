import {
  listAdminWorkers,
  normalizeWorkerReportFilters,
} from "@/lib/admin-reporting";
import { requireMaintainAdmin } from "@/lib/auth";
import { WORKER_EXPORT_COLUMNS, csvResponse, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireMaintainAdmin();
  const filters = normalizeWorkerReportFilters(new URL(request.url).searchParams);

  try {
    const { rows } = await listAdminWorkers(filters, { kind: "all" });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(
      `workers-${stamp}.csv`,
      toCsv(WORKER_EXPORT_COLUMNS, rows),
    );
  } catch {
    return new Response("Export failed.", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
