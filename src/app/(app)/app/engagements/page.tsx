import Link from "next/link";
import type { Metadata } from "next";
import { partyEngagements, type PartyEngagementView } from "@/lib/matching";
import { formatCentsExGst } from "@/lib/domain/money";
import { H1 } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, formatWindow, pill, toneFor } from "@/lib/platform-ui";

// 3.3 — one account, both postures. Each table reads its own projection (17.1), so
// the supplying side never sees a buyer rate and the hiring side never sees a
// supplier rate: the separation is structural, not a filter applied in this file.

export const metadata: Metadata = { title: "Engagements" };

export default async function EngagementsPage() {
  const [supplying, hiring] = await Promise.all([
    partyEngagements("supplier"),
    partyEngagements("buyer"),
  ]);

  return (
    <div className="flex flex-col gap-(--space-7)">
      <div>
        <h1 className={H1}>Engagements</h1>
        <p className="mt-(--space-3) max-w-[62ch] text-body-lg text-on-dark-muted">
          Confirmed work, in progress and completed. Figures are estimates, ex GST.
        </p>
      </div>

      <EngagementTable
        heading="Crew you are supplying"
        rateLabel="Your rate"
        emptyCopy="No engagements against your capacity yet."
        rows={supplying}
      />
      <EngagementTable
        heading="Capacity you are using"
        rateLabel="All-in rate"
        emptyCopy="No engagements against your requirements yet."
        rows={hiring}
      />
    </div>
  );
}

function EngagementTable({
  heading,
  rateLabel,
  emptyCopy,
  rows,
}: {
  heading: string;
  rateLabel: string;
  emptyCopy: string;
  rows: PartyEngagementView[];
}) {
  return (
    <section className="flex flex-col gap-(--space-4)">
      <h2 className="font-display text-h3 font-bold text-on-dark">{heading}</h2>
      {rows.length === 0 ? (
        <div className={CARD}>
          <p className="text-body text-on-dark-muted">{emptyCopy}</p>
        </div>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Trade</th>
                <th scope="col" className={TH}>Level</th>
                <th scope="col" className={TH}>Window</th>
                <th scope="col" className={TH}>Hours</th>
                <th scope="col" className={TH}>{rateLabel}</th>
                <th scope="col" className={TH}>Estimated value</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={TD}>{row.tradeName}</td>
                  <td className={TD}>{row.proficiencyName}</td>
                  <td className={`${TD} ${MONO}`}>{formatWindow(row.startDate, row.endDate)}</td>
                  <td className={`${TD} ${MONO}`}>{row.hoursPerWeek}/wk</td>
                  <td className={`${TD} ${MONO}`}>{formatCentsExGst(row.rateCents)}</td>
                  <td className={`${TD} ${MONO}`}>{formatCentsExGst(row.estimatedValueCents)}</td>
                  <td className={TD}>
                    <span className={pill(toneFor(row.overdue ? "Overdue" : row.status))}>
                      {/* 13.2 — an engagement still Awaiting Commercial at its start
                          date is flagged, because work must not begin unfunded. */}
                      {row.overdue ? "Overdue" : row.status}
                    </span>
                  </td>
                  <td className={TD}>
                    <Link
                      href={`/app/engagements/${row.id}`}
                      className="font-semibold text-teal-mist underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
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
  );
}
