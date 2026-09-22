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
import { TableEmpty, TableFrame } from "@/components/admin-page";
import { Icon } from "@/components/icon";
import type { FormResult } from "@/lib/actions";
import { proposeMatches } from "@/lib/actions/match";
import { formatCentsExGst } from "@/lib/domain/money";
import { BTN_PRIMARY, NAV_FOCUS } from "@/lib/ui";
import {
  CHECKBOX,
  CHECK_OPTION,
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_LABEL,
  FIELD_OK,
  INPUT,
  INPUT_SM,
  TABLE,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
  pill,
} from "@/lib/admin-ui";

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

/** Columns whose cells are figures; header and body align right together. */
const NUMERIC = new Set(["availability", "hours", "skills", "supplierRate", "buyerRate"]);

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
  const visible = table.getRowModel().rows;

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
        <div className={`${FIELD} w-full sm:w-72`}>
          <label className={FIELD_LABEL} htmlFor="candidate-filter">
            Filter candidates
          </label>
          <input
            id="candidate-filter"
            type="search"
            className={INPUT_SM}
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Name, supplying business, ticket"
          />
        </div>
        <p className={`${FIELD_HINT} tabular-nums`}>
          <span className="font-semibold text-on-dark">{visible.length}</span> of{" "}
          <span className="font-semibold text-on-dark">{data.length}</span> candidates shown ·{" "}
          <span className="font-semibold text-on-dark">{remaining}</span> position{remaining === 1 ? "" : "s"} still
          open on this line
        </p>
      </div>

      <TableFrame inset>
        <table className={TABLE}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                <th scope="col" className={`${TH} w-12`}>
                  <span className="sr-only">Shortlist</span>
                </th>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={NUMERIC.has(header.column.id) ? TH_NUM : TH}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
<<<<<<< HEAD
                          className={`inline-flex min-h-6 items-center gap-(--space-1) uppercase tracking-(--tracking-caps) transition-colors duration-(--dur-fast) hover:text-on-dark ${sorted ? "text-on-dark" : ""} ${NAV_FOCUS}`}
=======
                          className={`group -my-(--space-2) inline-flex min-h-11 items-center gap-(--space-1) uppercase tracking-(--tracking-caps) transition-colors duration-(--dur-fast) hover:text-on-dark ${sorted ? "text-on-dark" : ""} ${NAV_FOCUS}`}
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
                        >
                          <table.FlexRender header={header} />
                          <Icon
                            name="i-arrow-right"
<<<<<<< HEAD
                            className={`size-3 transition-transform duration-(--dur-fast) ${sorted === "asc" ? "-rotate-90" : sorted === "desc" ? "rotate-90" : "rotate-90 opacity-0 group-hover:opacity-100"}`}
=======
                            className={`size-3 transition-transform duration-(--dur-fast) ${sorted === "asc" ? "-rotate-90" : sorted === "desc" ? "rotate-90" : "rotate-90 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
                          />
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.map((row) => {
              const candidate = row.original;
              return (
                <tr key={row.id} className={candidate.klass === "Greyed" ? "opacity-70" : undefined}>
                  <td className={TD}>
                    <input
                      type="checkbox"
                      checked={row.getIsSelected()}
                      onChange={row.getToggleSelectedHandler()}
                      aria-label={`Shortlist ${candidate.workerName} from ${candidate.supplierCompanyName}`}
                      className={`${CHECKBOX} size-5`}
                    />
                  </td>
                  <td className={`${TD} min-w-[12rem]`}>
                    <span className="font-semibold text-on-dark">{candidate.workerName}</span>
                    {candidate.reasons.length > 0 && (
                      <span className="mt-(--space-1) block text-xs leading-relaxed text-on-dark-muted">
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
                  <td className={TD_NUM}>
                    {/* 21.2 — 100% requires full coverage AND hours sufficiency on every
                        covered day; an hours shortfall demotes the label to Partial. */}
                    {candidate.availabilityPercent === 100 && !candidate.hoursShortfall
                      ? "100%"
                      : `Partial (${candidate.availabilityPercent}%)`}
                    {candidate.hoursShortfall && (
                      <span className="block text-xs text-on-dark-muted">hours shortfall</span>
                    )}
                  </td>
                  <td className={TD_NUM}>
                    {candidate.lineHoursPerWeek}
                    {!candidate.hoursSufficient && (
                      <span className="block text-xs text-on-dark-muted">
                        under {demandHoursPerWeek}
                      </span>
                    )}
                  </td>
                  <td className={TD_NUM}>
                    {candidate.skillsHeld}<span className="text-on-dark-faint">/{candidate.skillsRequired}</span>
                  </td>
                  <td className={`${TD} min-w-[14rem]`}>{candidate.qualificationSummary}</td>
                  <td className={TD_NUM}>{formatCentsExGst(candidate.supplierRateCents)}</td>
                  <td className={TD_NUM}>{formatCentsExGst(candidate.buyerRateCents)}</td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{candidate.engagementWindow}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <TableEmpty colSpan={columns.length + 1}>
                {data.length === 0 ? "No eligible candidates for this line." : "No candidate matches this filter."}
              </TableEmpty>
            )}
          </tbody>
        </table>
      </TableFrame>

      {blockedByConflict.length > 0 && (
        <p className={FIELD_ERROR}>
          {blockedByConflict.length} shortlisted candidate
          {blockedByConflict.length === 1 ? " is" : "s are"} greyed for a committed conflict. The
          supplying business cannot nominate them until that engagement is resolved.
        </p>
      )}

      {needsOverride && (
        <div className="flex flex-col gap-(--space-3) rounded-(--radius-md) border border-hairline p-(--space-4)">
          <label className={`${CHECK_OPTION} w-fit items-start rounded-(--radius-md) py-(--space-3)`}>
            <input
              type="checkbox"
              name="qualification_override"
              checked={override}
              onChange={(event) => setOverride(event.target.checked)}
              className={`${CHECKBOX} mt-0.5 size-5`}
            />
            <span className="max-w-[70ch] leading-relaxed">
              Record my shortlist override for the displayed warnings. An in-window ticket expiry
              may be accepted knowingly; a committing conflict must still be resolved before the
              worker can be nominated. Soft holds in other proposals do not block nomination.
            </span>
          </label>
          <div className={FIELD}>
            <label className={FIELD_LABEL} htmlFor="shortlist-override-evidence">Override evidence</label>
            <textarea id="shortlist-override-evidence" name="override_evidence_note" className={INPUT}
              rows={2} minLength={10} maxLength={4000} required={override}
              placeholder="Explain the exception and who agreed to it" />
            {state?.errors?.override_evidence_note && (
              <p className={FIELD_ERROR}>{state.errors.override_evidence_note}</p>
            )}
          </div>
        </div>
      )}

      {state?.message && (
        <p role="status" className={state.ok ? FIELD_OK : FIELD_ERROR}>
          {state.message}
        </p>
      )}
      {state?.errors?.candidates && (
        <p role="alert" className={FIELD_ERROR}>{state.errors.candidates}</p>
      )}

      <div className="flex flex-wrap items-center gap-(--space-4) border-t border-hairline pt-(--space-4)">
        <button type="submit" className={BTN_PRIMARY} disabled={pending || selectedKeys.length === 0} aria-busy={pending || undefined}>
          {pending
            ? "Proposing…"
            : lineCount > 1
              ? `Propose ${lineCount} matches`
              : "Propose match"}
        </button>
        <p className={`${FIELD_HINT} tabular-nums`}>
          <span className="font-semibold text-on-dark">{selectedKeys.length}</span> shortlisted across{" "}
          <span className="font-semibold text-on-dark">{lineCount}</span> capacity line{lineCount === 1 ? "" : "s"}. The
<<<<<<< HEAD
          shortlist proves the shape is feasible; the supplying business chooses who goes.
=======
          supplying business confirms which shortlisted crew will go.
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
        </p>
      </div>
    </form>
  );
}
