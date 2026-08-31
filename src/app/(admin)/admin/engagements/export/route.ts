import {
  EngagementReportFilterError,
  EngagementReportQueryError,
  listAdminEngagements,
  normalizeEngagementReportFilters,
} from "@/lib/admin-engagement-reporting";
import {
  ENGAGEMENT_EXPORT_COLUMNS,
  csvResponse,
  toCsv,
} from "@/lib/csv";

// 14.3 — CSV export of the engagements list, carrying every field of 13.1.
// Maintain has to invoice buyers and remit to suppliers off-platform (Non-goals
// excludes automated invoicing), so this export is the operational bridge, not a
// convenience: without it the commercial data is trapped in the UI.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const filters = normalizeEngagementReportFilters(new URL(request.url).searchParams);
    // The shared loader authorizes before constructing its service-role client.
    const { rows } = await listAdminEngagements(filters, { kind: "all" });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(`engagements-${stamp}.csv`, toCsv(ENGAGEMENT_EXPORT_COLUMNS, rows));
  } catch (error) {
    if (error instanceof EngagementReportFilterError) {
      return new Response(error.message, { status: 400, headers: { "cache-control": "no-store" } });
    }
    if (error instanceof EngagementReportQueryError) {
      return new Response("The engagement export could not be completed. Please retry.", {
        status: 503, headers: { "cache-control": "no-store" },
      });
    }
    // Preserve authorization redirects and unexpected failures; never turn them into a CSV.
    throw error;
  }
}
