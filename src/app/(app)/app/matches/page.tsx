import Link from "next/link";
import type { Metadata } from "next";
import { buyerMatches, supplierMatches } from "@/lib/matching";
import { formatCentsExGst } from "@/lib/domain/money";
import { H1 } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, formatWindow, pill, toneFor } from "@/lib/platform-ui";

// 3.3 — every Active company can both sell and buy, so this screen carries both
// postures. What separates them is not a mode switch but the projection each row
// comes from: the supplying side reads its own rate, the hiring side reads the
// all-in rate, and neither ever reads the other's (17.1).

export const metadata: Metadata = { title: "Matches" };

export default async function MatchesPage() {
  const [supplying, hiring] = await Promise.all([supplierMatches(), buyerMatches()]);

  return (
    <div className="flex flex-col gap-(--space-7)">
      <div>
        <h1 className={H1}>Matches</h1>
        <p className="mt-(--space-3) max-w-[62ch] text-body-lg text-on-dark-muted">
          Proposals waiting on you, and the ones already decided.
        </p>
      </div>

      <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-h3 font-bold text-on-dark">
          Against your capacity
        </h2>
        {supplying.length === 0 ? (
          <div className={CARD}>
            <p className="text-body text-on-dark-muted">
              No proposals against your listed capacity yet.
            </p>
          </div>
        ) : (
          <div className={`${CARD} overflow-x-auto`}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Trade</th>
                  <th scope="col" className={TH}>Level</th>
                  <th scope="col" className={TH}>Region</th>
                  <th scope="col" className={TH}>Window</th>
                  <th scope="col" className={TH}>Crew</th>
                  <th scope="col" className={TH}>Your rate</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {supplying.map((match) => (
                  <tr key={match.id}>
                    <td className={TD}>{match.tradeName}</td>
                    <td className={TD}>{match.proficiencyName}</td>
                    <td className={TD}>{match.workRegionName}</td>
                    <td className={`${TD} ${MONO}`}>
                      {formatWindow(match.engagementStart, match.engagementEnd)}
                    </td>
                    <td className={`${TD} ${MONO}`}>
                      {match.status === "Awaiting Supplier"
                        ? match.requestedQuantity
                        : match.nominatedWorkers.filter((w) => !w.knockedOut).length}
                    </td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(match.supplierRateCents)}</td>
                    <td className={TD}>
                      <span className={pill(toneFor(match.status))}>{match.status}</span>
                    </td>
                    <td className={TD}>
                      <Link
                        href={`/app/matches/${match.id}`}
                        className="font-semibold text-on-dark underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-h3 font-bold text-on-dark">
          Against your requirements
        </h2>
        {hiring.length === 0 ? (
          <div className={CARD}>
            <p className="text-body text-on-dark-muted">
              No proposals against your requirements yet. Maintain presents one as soon as a
              supplying business has accepted.
            </p>
          </div>
        ) : (
          <div className={`${CARD} overflow-x-auto`}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Requirement</th>
                  <th scope="col" className={TH}>Trade</th>
                  <th scope="col" className={TH}>Level</th>
                  <th scope="col" className={TH}>Window</th>
                  <th scope="col" className={TH}>Crew</th>
                  <th scope="col" className={TH}>All-in rate</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {hiring.map((match) => (
                  <tr key={match.id}>
                    <td className={TD}>{match.requestName}</td>
                    <td className={TD}>{match.tradeName}</td>
                    <td className={TD}>{match.proficiencyName}</td>
                    <td className={`${TD} ${MONO}`}>
                      {formatWindow(match.engagementStart, match.engagementEnd)}
                    </td>
                    <td className={`${TD} ${MONO}`}>{match.nominatedCount}</td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(match.buyerRateCents)}</td>
                    <td className={TD}>
                      <span className={pill(toneFor(match.status))}>{match.status}</span>
                    </td>
                    <td className={TD}>
                      <Link
                        href={`/app/matches/${match.id}`}
                        className="font-semibold text-on-dark underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
