"use client";

import { useActionState, useMemo, useState } from "react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table";
import type { FormResult } from "@/lib/actions";
import { proposeMatches } from "@/lib/actions/match";
import { formatCentsExGst } from "@/lib/domain/money";
import { BTN_PRIMARY } from "@/lib/ui";
import {
  FIELD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
  TABLE,
  TD,
  TH,
  pill,
} from "@/lib/platform-ui";

// 11.4 — filter, sort and multi-select over candidate lists of up to ~500 rows, as
// client-side table operations on a SERVER-produced candidate set. The three display
// classes and the availability percentages arrive already computed (11.1): nothing
// here decides who is eligible, it only decides who is on screen.

export type CandidateRowData = {
  key: string;
  workerName: string;
  supplierCompanyName: string;
  klass: "Greyed" | "Eligible";
  reasons: string[];
  availabilityPercent: number;
  hoursShortfall: boolean;
  lineHoursPerWeek: number;
  hoursSufficient: boolean;
  skillsHeld: number;
  skillsRequired: number;
  qualificationSummary: string;
  expiresDuringEngagement: boolean;
  supplierRateCents: number;
  buyerRateCents: number;
  engagementWindow: string;
};

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSelectionFeature,
});

const helper = createColumnHelper<typeof features, CandidateRowData>();

const columns = helper.columns([
  helper.accessor("workerName", { id: "workerName", header: "Candidate" }),
  helper.accessor("supplierCompanyName", { id: "supplier", header: "Supplying business" }),
  helper.accessor("klass", { id: "klass", header: "Class" }),
  helper.accessor("availabilityPercent", { id: "availability", header: "Availability" }),
  helper.accessor("lineHoursPerWeek", { id: "hours", header: "Hours/week" }),
  helper.accessor("skillsHeld", { id: "skills", header: "Skills" }),
  helper.accessor("qualificationSummary", { id: "tickets", header: "Tickets" }),
  helper.accessor("supplierRateCents", { id: "supplierRate", header: "Supplier rate" }),
  helper.accessor("buyerRateCents", { id: "buyerRate", header: "Buyer rate" }),
  helper.accessor("engagementWindow", { id: "window", header: "Engagement window" }),
]);

const EMPTY: CandidateRowData[] = [];

export function CandidateTable({
  demandLineId,
  candidates,
  includeHigherProficiency,
  remaining,
  demandHoursPerWeek,
}: {
  demandLineId: string;
  candidates: CandidateRowData[];
  includeHigherProficiency: boolean;
  remaining: number;
  demandHoursPerWeek: number;
}) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(
    proposeMatches,
    null,
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [override, setOverride] = useState(false);

  const data = candidates.length > 0 ? candidates : EMPTY;

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.key,
    globalFilterFn: filterFn_includesString,
    state: { rowSelection, globalFilter },
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
  });

  const selectedKeys = useMemo(
    () => Object.entries(rowSelection).filter(([, on]) => on).map(([key]) => key),
    [rowSelection],
  );
  const selectedRows = useMemo(
    () => data.filter((row) => selectedKeys.includes(row.key)),
    [data, selectedKeys],
  );

  // 11.3 — one match per capacity line, so the shortlist tells the admin up front how
  // many matches the selection will create.
  const lineCount = new Set(selectedKeys.map((key) => key.split(":")[0])).size;
  // 11.1 — a Greyed candidate is selectable only with an audited override, and the
  // only greying that survives to nomination is the in-window ticket expiry (12.2).
  const needsOverride = selectedRows.some((row) => row.klass === "Greyed");
  const blockedByConflict = selectedRows.filter(
    (row) => row.reasons.some((reason) => /committing|commitment|committed/i.test(reason)),
  );

  return (
    <form action={action} className="flex flex-col gap-(--space-5)">
      <input type="hidden" name="demand_line_id" value={demandLineId} />
      {includeHigherProficiency && (
        <input type="hidden" name="include_higher_proficiency" value="on" />
      )}
      {selectedKeys.map((key) => (
        <input key={key} type="hidden" name="candidate" value={key} />
      ))}

      <div className="flex flex-wrap items-end justify-between gap-(--space-4)">
        <div className={`${FIELD} min-w-[16rem]`}>
          <label className={FIELD_LABEL} htmlFor="candidate-filter">
            Filter candidates
          </label>
          <input
            id="candidate-filter"
            type="search"
            className={INPUT}
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Name, supplying business, ticket"
          />
        </div>
        <p className={FIELD_HINT}>
          <span className={MONO}>{table.getRowModel().rows.length}</span> of{" "}
          <span className={MONO}>{data.length}</span> candidates shown ·{" "}
          <span className={MONO}>{remaining}</span> position{remaining === 1 ? "" : "s"} still
          open on this line
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                <th scope="col" className={TH}>
                  <span className="sr-only">Shortlist</span>
                </th>
                {group.headers.map((header) => (
                  <th key={header.id} scope="col" className={TH}>
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-(--space-1) uppercase tracking-[0.08em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
                      >
                        <table.FlexRender header={header} />
                        <span aria-hidden="true">
                          {header.column.getIsSorted() === "asc"
                            ? "↑"
                            : header.column.getIsSorted() === "desc"
                              ? "↓"
                              : ""}
                        </span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const candidate = row.original;
              return (
                <tr key={row.id} className={candidate.klass === "Greyed" ? "opacity-70" : undefined}>
                  <td className={TD}>
                    <input
                      type="checkbox"
                      checked={row.getIsSelected()}
                      onChange={row.getToggleSelectedHandler()}
                      aria-label={`Shortlist ${candidate.workerName} from ${candidate.supplierCompanyName}`}
                      className="size-5 accent-(--color-hi-vis-amber)"
                    />
                  </td>
                  <td className={TD}>
                    <span className="font-semibold text-on-dark">{candidate.workerName}</span>
                    {candidate.reasons.length > 0 && (
                      <span className="mt-(--space-1) block text-body-sm text-on-dark-muted">
                        {candidate.reasons.join("; ")}
                      </span>
                    )}
                  </td>
                  <td className={TD}>{candidate.supplierCompanyName}</td>
                  <td className={TD}>
                    <span className={pill(candidate.klass === "Greyed" ? "overdue" : "active")}>
                      {candidate.klass}
                    </span>
                  </td>
                  <td className={`${TD} ${MONO}`}>
                    {/* 21.2 — 100% requires full coverage AND hours sufficiency on every
                        covered day; an hours shortfall demotes the label to Partial. */}
                    {candidate.availabilityPercent === 100 && !candidate.hoursShortfall
                      ? "100%"
                      : `Partial (${candidate.availabilityPercent}%)`}
                    {candidate.hoursShortfall && (
                      <span className="block text-body-sm text-on-dark-muted">hours shortfall</span>
                    )}
                  </td>
                  <td className={`${TD} ${MONO}`}>
                    {candidate.lineHoursPerWeek}
                    {!candidate.hoursSufficient && (
                      <span className="block text-body-sm text-on-dark-muted">
                        under {demandHoursPerWeek}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} ${MONO}`}>
                    {candidate.skillsHeld}/{candidate.skillsRequired}
                  </td>
                  <td className={TD}>{candidate.qualificationSummary}</td>
                  <td className={`${TD} ${MONO}`}>{formatCentsExGst(candidate.supplierRateCents)}</td>
                  <td className={`${TD} ${MONO}`}>{formatCentsExGst(candidate.buyerRateCents)}</td>
                  <td className={`${TD} ${MONO}`}>{candidate.engagementWindow}</td>
                </tr>
              );
            })}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td className={TD} colSpan={columns.length + 1}>
                  No candidate matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {blockedByConflict.length > 0 && (
        <p className="text-body-sm text-status-critical">
          {blockedByConflict.length} shortlisted candidate
          {blockedByConflict.length === 1 ? " is" : "s are"} greyed for a committed conflict. The
          supplying business cannot nominate them until that engagement is resolved.
        </p>
      )}

      {needsOverride && (
        <div className="flex flex-col gap-(--space-3)">
          <label className="flex items-start gap-(--space-3) text-body text-on-dark">
          <input
            type="checkbox"
            name="qualification_override"
            checked={override}
            onChange={(event) => setOverride(event.target.checked)}
            className="mt-1 size-5 accent-(--color-hi-vis-amber)"
          />
          <span>
            Record my shortlist override for the displayed warnings. An in-window ticket expiry
            may be accepted knowingly; a committing conflict must still be resolved before the
            worker can be nominated. Soft holds in other proposals do not block nomination.
          </span>
          </label>
          <label className={FIELD_LABEL} htmlFor="shortlist-override-evidence">Override evidence</label>
          <textarea id="shortlist-override-evidence" name="override_evidence_note" className={INPUT}
            rows={2} minLength={10} maxLength={4000} required={override}
            placeholder="Explain the exception and who agreed to it" />
          {state?.errors?.override_evidence_note && (
            <p className="text-body text-status-critical">{state.errors.override_evidence_note}</p>
          )}
        </div>
      )}

      {state?.message && (
        <p className={state.ok ? "text-body text-status-active" : "text-body text-status-critical"}>
          {state.message}
        </p>
      )}
      {state?.errors?.candidates && (
        <p className="text-body text-status-critical">{state.errors.candidates}</p>
      )}

      <div className="flex flex-wrap items-center gap-(--space-4)">
        <button type="submit" className={BTN_PRIMARY} disabled={pending || selectedKeys.length === 0}>
          {pending
            ? "Proposing…"
            : lineCount > 1
              ? `Propose ${lineCount} matches`
              : "Propose match"}
        </button>
        <p className={FIELD_HINT}>
          <span className={MONO}>{selectedKeys.length}</span> shortlisted across{" "}
          <span className={MONO}>{lineCount}</span> capacity line{lineCount === 1 ? "" : "s"}. The
          shortlist proves the shape is feasible; the supplying business chooses who goes.
        </p>
      </div>
    </form>
  );
}
