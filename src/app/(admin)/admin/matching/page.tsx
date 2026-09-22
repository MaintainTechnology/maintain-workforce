import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState, PageHeader, TableFrame } from "@/components/admin-page";
import { Icon } from "@/components/icon";
import { openDemandLines } from "@/lib/actions/match";
import { NAV_FOCUS } from "@/lib/ui";
import { TABLE, TD, TD_NUM, TH, TH_NUM, formatWindow, pill, toneFor } from "@/lib/platform-ui";

// 11.1 — the matching workspace opens on the requirement lines that can still take a
// proposal. Nothing here is a search: Maintain is the only party that sees both sides
// of the exchange, and it sees them one line at a time.

export const metadata: Metadata = { title: "Matching" };

export default async function MatchingWorkspacePage() {
  const lines = await openDemandLines();
  const seeking = lines.reduce((sum, line) => sum + line.remaining, 0);

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Matching"
        lead="Open requirement lines, with what is filled and what is already out with a supplying business. Open a line to see its candidates and propose a match."
        meta={
          <>
            <span><strong className="font-semibold text-on-dark">{lines.length}</strong> open {lines.length === 1 ? "line" : "lines"}</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span><strong className="font-semibold text-on-dark">{seeking}</strong> {seeking === 1 ? "position" : "positions"} still to fill</span>
          </>
        }
      />

      {lines.length === 0 ? (
        <EmptyState title="No open requirement lines">
          New requirements appear here as soon as a hiring business posts one, or as soon as
          Maintain records one on their behalf through a company&rsquo;s concierge entry.
        </EmptyState>
      ) : (
        <TableFrame>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Requirement</th>
                <th scope="col" className={TH}>Hiring business</th>
                <th scope="col" className={TH}>Trade</th>
                <th scope="col" className={TH}>Region</th>
                <th scope="col" className={TH}>Window</th>
                <th scope="col" className={TH_NUM}>Hours/week</th>
                <th scope="col" className={TH_NUM}>Filled</th>
                <th scope="col" className={TH_NUM}>Pending</th>
                <th scope="col" className={TH_NUM}>Open</th>
                <th scope="col" className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={`${TD} min-w-[14rem]`}>
                    <Link
                      href={`/admin/matching/${line.id}`}
                      className={`group inline-flex items-center gap-(--space-1) font-semibold text-on-dark ${NAV_FOCUS}`}
                    >
                      {line.requestName}
                      <Icon name="i-arrow-right" className="size-4 text-on-dark-faint transition-colors group-hover:text-on-dark" />
                    </Link>
                  </td>
                  <td className={TD}>{line.buyerCompanyName}</td>
                  <td className={TD}>
                    {line.tradeName}
                    <span className="block text-xs text-on-dark-muted">{line.proficiencyName}</span>
                  </td>
                  <td className={TD}>{line.regionName}</td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{formatWindow(line.startDate, line.endDate)}</td>
                  <td className={TD_NUM}>{line.hoursPerWeek}</td>
                  {/* 10.3 — filled and pending are shown separately, never summed away. */}
                  <td className={TD_NUM}>{line.filled}<span className="text-on-dark-faint">/{line.quantity}</span></td>
                  <td className={TD_NUM}>{line.pending}</td>
                  <td className={`${TD_NUM} font-semibold`}>{line.remaining}</td>
                  <td className={TD}>
                    <span className={pill(toneFor(line.status))}>{line.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
    </div>
  );
}
