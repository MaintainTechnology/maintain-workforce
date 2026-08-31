import Link from "next/link";
import type { Metadata } from "next";
import { openDemandLines } from "@/lib/actions/match";
import { H1 } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, formatWindow, pill, toneFor } from "@/lib/platform-ui";

// 11.1 — the matching workspace opens on the requirement lines that can still take a
// proposal. Nothing here is a search: Maintain is the only party that sees both sides
// of the exchange, and it sees them one line at a time.

export const metadata: Metadata = { title: "Matching" };

export default async function MatchingWorkspacePage() {
  const lines = await openDemandLines();

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <h1 className={H1}>Matching</h1>
        <p className="mt-(--space-3) max-w-[62ch] text-body-lg text-on-dark-muted">
          Open requirement lines, with what is filled and what is already out with a
          supplying business. Open a line to see its candidates.
        </p>
      </div>

      {lines.length === 0 ? (
        <div className={CARD}>
          <p className="text-body text-on-dark-muted">
            No open requirement lines. New requirements appear here as soon as a hiring
            business posts one, or as soon as Maintain records one on their behalf.
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Requirement</th>
                <th scope="col" className={TH}>Hiring business</th>
                <th scope="col" className={TH}>Trade</th>
                <th scope="col" className={TH}>Level</th>
                <th scope="col" className={TH}>Region</th>
                <th scope="col" className={TH}>Window</th>
                <th scope="col" className={TH}>Hours/week</th>
                <th scope="col" className={TH}>Filled</th>
                <th scope="col" className={TH}>Pending</th>
                <th scope="col" className={TH}>Open</th>
                <th scope="col" className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={TD}>
                    <Link
                      href={`/admin/matching/${line.id}`}
                      className="font-semibold text-on-dark underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
                    >
                      {line.requestName}
                    </Link>
                  </td>
                  <td className={TD}>{line.buyerCompanyName}</td>
                  <td className={TD}>{line.tradeName}</td>
                  <td className={TD}>{line.proficiencyName}</td>
                  <td className={TD}>{line.regionName}</td>
                  <td className={`${TD} ${MONO}`}>{formatWindow(line.startDate, line.endDate)}</td>
                  <td className={`${TD} ${MONO}`}>{line.hoursPerWeek}</td>
                  {/* 10.3 — filled and pending are shown separately, never summed away. */}
                  <td className={`${TD} ${MONO}`}>{line.filled}/{line.quantity}</td>
                  <td className={`${TD} ${MONO}`}>{line.pending}</td>
                  <td className={`${TD} ${MONO}`}>{line.remaining}</td>
                  <td className={TD}>
                    <span className={pill(toneFor(line.status))}>{line.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
