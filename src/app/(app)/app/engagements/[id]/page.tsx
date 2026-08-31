import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { partyEngagement } from "@/lib/matching";
import { formatCentsExGst } from "@/lib/domain/money";
import { H1 } from "@/lib/ui";
import { CARD, MONO, formatDate, formatWindow, pill, toneFor } from "@/lib/platform-ui";

export const metadata: Metadata = { title: "Engagement" };

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The company may hold this engagement on either side, and the two projections
  // carry different columns (17.1). Try the supplying side first, then the hiring
  // side; RLS returns nothing for an engagement that is neither.
  const supplying = await partyEngagement(id, "supplier");
  const engagement = supplying ?? (await partyEngagement(id, "buyer"));
  if (!engagement) notFound();

  const role: "supplier" | "buyer" = supplying ? "supplier" : "buyer";
  const revealed = engagement.revealed;

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <Link
          href="/app/engagements"
          className="text-body font-semibold text-on-dark-muted underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
        >
          ← Engagements
        </Link>
        <h1 className={`${H1} mt-(--space-3)`}>
          {engagement.tradeName} · {engagement.proficiencyName}
        </h1>
        <div className="mt-(--space-3) flex flex-wrap items-center gap-(--space-3)">
          <span className={pill(toneFor(engagement.overdue ? "Overdue" : engagement.status))}>
            {engagement.overdue ? "Overdue" : engagement.status}
          </span>
          <span className="text-body text-on-dark-muted">
            {role === "supplier" ? "You are supplying this crew" : "You are using this capacity"}
          </span>
        </div>
      </div>

      {/* 13.2 — the commercial trigger is Maintain's to record; the company sees the
          state so nobody turns up to a job that is not funded. */}
      {engagement.status === "Awaiting Commercial" && (
        <div className={CARD}>
          <p className="text-body text-on-dark-muted">
            Terms are agreed. Work starts once Maintain confirms payment is
            pre-authorised — no job begins before it is funded.
          </p>
        </div>
      )}

      <section className={CARD}>
        <h2 className="font-display text-h3 font-bold text-on-dark">The work</h2>
        <dl className="mt-(--space-4) grid gap-(--space-4) sm:grid-cols-2">
          <Detail label="Window" value={formatWindow(engagement.startDate, engagement.endDate)} mono />
          <Detail label="Hours" value={`${engagement.hoursPerWeek} per week`} mono />
          <Detail label="Expected hours" value={`${engagement.expectedHours}`} mono />
          <Detail
            label={role === "supplier" ? "Your rate" : "All-in rate"}
            value={formatCentsExGst(engagement.rateCents)}
            mono
          />
          <Detail
            label={role === "supplier" ? "Estimated value to you" : "Estimated total cost"}
            value={formatCentsExGst(engagement.estimatedValueCents)}
            mono
          />
          <Detail label="Payment" value={engagement.paymentStatus} />
        </dl>
        <p className="mt-(--space-4) text-body-sm text-on-dark-faint">
          {/* 20.3 — estimates are frozen at creation and labelled as estimates. */}
          Values are estimates fixed when the engagement was created, ex GST.
        </p>
      </section>

      {/* 12.5 — the immutable marker controls counterparty identities and buyer
          crew disclosure. Suppliers can already see their own recorded crew. */}
      <section className={CARD}>
        <h2 className="font-display text-h3 font-bold text-on-dark">
          {role === "supplier" ? "Hiring business" : "Supplying business"}
        </h2>
        {revealed ? (
          <p className={`mt-(--space-3) text-body ${MONO}`}>
            {engagement.counterpartyName ?? "—"}
          </p>
        ) : (
          <p className="mt-(--space-3) text-body text-on-dark-muted">
            Revealed once Maintain confirms the commercial step.
          </p>
        )}
        {(role === "supplier" || revealed) && engagement.workerTickets.length > 0 && (
          <div className="mt-(--space-4)">
            <p className="text-body font-semibold text-on-dark">Crew recorded for this engagement</p>
            <ul className="mt-(--space-2) flex flex-col gap-(--space-4)">
              {engagement.workerTickets.map((worker, index) => (
                <li key={`${worker.name}-${index}`} className="text-body text-on-dark-muted">
                  <p className="font-semibold text-on-dark">{worker.name}</p>
                  {worker.capturedAt ? (
                    <p className="mt-(--space-1) text-body-sm">
                      Historical site-access facts captured on {formatDate(worker.capturedAt)}. Not a live compliance check.
                    </p>
                  ) : (
                    <p className="mt-(--space-1) text-body-sm">
                      No trustworthy historical snapshot is available. Contact Maintain for assistance.
                    </p>
                  )}
                  {worker.capturedAt && (worker.tickets.length === 0 ? (
                    <p className="mt-(--space-1) text-body-sm">No ticket facts recorded.</p>
                  ) : (
                    <ul className="mt-(--space-2) flex flex-col gap-(--space-3)">
                      {worker.tickets.map((ticket, ticketIndex) => (
                        <li key={`${ticket.name}-${ticketIndex}`}>
                          <p className="font-semibold">{ticket.name} · {ticket.status}</p>
                          <dl className="mt-(--space-1) grid gap-(--space-2) text-body-sm sm:grid-cols-3">
                            <Detail label="Ticket number" value={ticket.number ?? "Not recorded"} mono />
                            <Detail label="Issued" value={formatDate(ticket.issueDate)} mono />
                            <Detail label="Expiry" value={ticket.expiryDate ? formatDate(ticket.expiryDate) : "No expiry recorded"} mono />
                          </dl>
                        </li>
                      ))}
                    </ul>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {(engagement.actualHours !== null || engagement.completedAt) && (
        <section className={CARD}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Outcome</h2>
          <dl className="mt-(--space-4) grid gap-(--space-4) sm:grid-cols-2">
            <Detail
              label="Actual hours"
              value={engagement.actualHours === null ? "—" : String(engagement.actualHours)}
              mono
            />
            <Detail label="Completed" value={formatDate(engagement.completedAt)} mono />
          </dl>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">{label}</dt>
      <dd className={`mt-(--space-1) text-body text-on-dark ${mono ? MONO : ""}`}>{value}</dd>
    </div>
  );
}
