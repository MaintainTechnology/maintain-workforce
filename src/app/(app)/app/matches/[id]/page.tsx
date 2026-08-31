import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import {
  buyerAcceptMatch,
  buyerDeclineMatch,
  supplierAcceptMatch,
  supplierDeclineMatch,
  supplierSubstituteNominations,
} from "@/lib/actions/match";
import { getBookingRules } from "@/lib/config";
import { formatCentsExGst } from "@/lib/domain/money";
import { buyerMatch, nominationPool, supplierMatch } from "@/lib/matching";
import { H1 } from "@/lib/ui";
import {
  CARD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
  formatWindow,
  pill,
  toneFor,
} from "@/lib/platform-ui";

// 12.2 and 12.4 — the same match, seen from the two sides, each built from its own
// projection. The supplying business sees its rate and names its crew; the hiring
// business sees an all-in rate, counts and coverage, and no identity of any kind.

export const metadata: Metadata = { title: "Match" };

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">{label}</dt>
      <dd className={`mt-(--space-1) text-body text-on-dark ${mono ? MONO : ""}`}>{value}</dd>
    </div>
  );
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The RLS views are scoped to the reader's own company, so at most one of these
  // returns a row and which one it is decides the posture (3.3).
  const [supplying, hiring] = await Promise.all([supplierMatch(id), buyerMatch(id)]);
  if (!supplying && !hiring) notFound();

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <Link
          href="/app/matches"
          className="text-body font-semibold text-on-dark-muted underline underline-offset-4"
        >
          Back to matches
        </Link>
        <h1 className={`${H1} mt-(--space-3)`}>Match</h1>
      </div>

      {supplying && <SupplierView match={supplying} />}
      {hiring && <BuyerView match={hiring} />}
    </div>
  );
}

/* ------------------------------------------------------------------ 12.2 supplier -- */

async function SupplierView({
  match,
}: {
  match: NonNullable<Awaited<ReturnType<typeof supplierMatch>>>;
}) {
  const [pool, rules] = await Promise.all([nominationPool(match.id), getBookingRules()]);
  const live = match.nominatedWorkers.filter((w) => !w.knockedOut);
  const knockedOut = match.nominatedWorkers.filter((w) => w.knockedOut);

  return (
    <section className="flex flex-col gap-(--space-5)">
      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-(--space-3)">
          <span className={pill(toneFor(match.status))}>{match.status}</span>
          <span className="text-body font-semibold text-on-dark">Against your capacity</span>
        </div>

        {/* 12.2 — the shape, and nothing that identifies the hiring business. */}
        <dl className="mt-(--space-5) grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Trade" value={match.tradeName} />
          <Fact label="Level" value={match.proficiencyName} />
          <Fact label="Work region" value={match.workRegionName} />
          <Fact label="Crew requested" value={String(match.requestedQuantity)} mono />
          <Fact
            label="Dates"
            value={formatWindow(match.engagementStart, match.engagementEnd)}
            mono
          />
          <Fact label="Hours per week" value={String(match.hoursPerWeek)} mono />
          <Fact label="Your rate" value={formatCentsExGst(match.supplierRateCents)} mono />
          <Fact
            label="Estimated value"
            value={`${formatCentsExGst(match.estimatedSupplierValueCents)} (estimated)`}
            mono
          />
        </dl>
        {match.workDescription && (
          <p className="mt-(--space-4) text-body text-on-dark-muted">{match.workDescription}</p>
        )}
        <p className={`${FIELD_HINT} mt-(--space-4) max-w-[70ch]`}>
          Accepting confirms the rate above as the rate for this engagement. Expected hours:{" "}
          <span className={MONO}>{match.expectedHours}</span>.
        </p>
      </div>

      {live.length > 0 && (
        <div className={CARD}>
          <h2 className="font-display text-h4 font-bold text-on-dark">Your nominations</h2>
          <ul className="mt-(--space-3) flex flex-col gap-(--space-2)">
            {live.map((worker) => (
              <li key={worker.id} className="text-body text-on-dark">{worker.name}</li>
            ))}
          </ul>
          {/* 12.7 — a knocked-out nomination is shown with its prompt to substitute. */}
          {knockedOut.length > 0 && (
            <>
              <h3 className="mt-(--space-4) text-body font-semibold text-on-dark">
                Knocked out — substitute from the same listing
              </h3>
              <ul className="mt-(--space-2) flex flex-col gap-(--space-2)">
                {knockedOut.map((worker) => (
                  <li key={worker.id} className="text-body-sm text-on-dark-muted">
                    {worker.name}
                    {worker.reason ? ` — ${worker.reason}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {(match.status === "Awaiting Supplier" || match.status === "Awaiting Buyer") && (
        <div className="grid gap-(--space-5) lg:grid-cols-2">
          <div className={CARD}>
            <h2 className="font-display text-h4 font-bold text-on-dark">
              {match.status === "Awaiting Buyer" ? "Substitute your nominations" : "Accept and nominate your crew"}
            </h2>
            <p className={`${FIELD_HINT} mt-(--space-2) max-w-[60ch]`}>
              You choose who goes. Maintain proposed the shape — trade, level, dates, hours —
              and never names an individual. Partial acceptance is fine down to{" "}
              <span className={MONO}>{rules.minimumCrewSize}</span>; the requirement stays open
              for the remainder.
            </p>
            {match.status === "Awaiting Buyer" && (
              <p className={`${FIELD_HINT} mt-(--space-2)`}>
                Choose the full replacement crew, including anyone staying on the proposal.
                The hiring business must review the updated crew before accepting.
              </p>
            )}
            {match.hasQualificationOverride && (
              <p className={`${FIELD_HINT} mt-(--space-2)`}>
                Maintain has recorded an override for a ticket that expires inside this window,
                so crew in that position may be nominated.
              </p>
            )}
            <div className="mt-(--space-4)">
              <ActionForm
                action={match.status === "Awaiting Buyer" ? supplierSubstituteNominations : supplierAcceptMatch}
                submitLabel={match.status === "Awaiting Buyer" ? "Substitute nominations" : "Accept and nominate"}
                pendingLabel="Saving nominations…"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                <fieldset className="flex flex-col gap-(--space-2)">
                  <legend className={FIELD_LABEL}>Your crew on this listing</legend>
                  {pool.map((member) => (
                    <label
                      key={member.workerId}
                      className="flex items-start gap-(--space-3) text-body text-on-dark"
                    >
                      <input
                        type="checkbox"
                        name="worker_id"
                        value={member.workerId}
                        defaultChecked={member.nominated}
                        disabled={member.blocked}
                        className="mt-1 size-5 accent-(--color-hi-vis-amber)"
                      />
                      <span>
                        {member.name}
                        {/* 12.2 — a soft-hold warns, it never blocks. */}
                        {member.softHeld && !member.blocked && (
                          <span className="block text-body-sm text-on-dark-muted">
                            also nominated on another open match — you can still send them
                          </span>
                        )}
                        {member.blocked && (
                          <span className="block text-body-sm text-on-dark-muted">
                            unavailable: {member.reason}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                  {pool.length === 0 && (
                    <p className={FIELD_HINT}>No crew is attached to this capacity line.</p>
                  )}
                </fieldset>
              </ActionForm>
            </div>
          </div>

          <div className={CARD}>
            <h2 className="font-display text-h4 font-bold text-on-dark">Decline this match</h2>
            <div className="mt-(--space-4)">
              <ActionForm
                action={supplierDeclineMatch}
                submitLabel="Decline this match"
                pendingLabel="Declining…"
                tone="ghost"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="expected_status" value={match.status} />
                <label className={FIELD_LABEL} htmlFor="supplier-decline-reason">
                  Reason (optional)
                </label>
                <input
                  id="supplier-decline-reason"
                  name="reason"
                  type="text"
                  className={INPUT}
                />
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------- 12.4 buyer -- */

function BuyerView({ match }: { match: NonNullable<Awaited<ReturnType<typeof buyerMatch>>> }) {
  return (
    <section className="flex flex-col gap-(--space-5)">
      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-(--space-3)">
          <span className={pill(toneFor(match.status))}>{match.status}</span>
          <span className="text-body font-semibold text-on-dark">{match.requestName}</span>
        </div>

        {/* 12.4 — trade, level, quantity, skills coverage, aggregate ticket badges,
            dates, hours, the all-in rate and the estimated total. No worker names, no
            supplying business, no supplier rate: none of them is in this projection. */}
        <dl className="mt-(--space-5) grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Trade" value={match.tradeName} />
          <Fact label="Level" value={match.proficiencyName} />
          <Fact label="Crew offered" value={String(match.nominatedCount)} mono />
          <Fact
            label="Dates"
            value={formatWindow(match.engagementStart, match.engagementEnd)}
            mono
          />
          <Fact label="Hours per week" value={String(match.hoursPerWeek)} mono />
          <Fact
            label="Skills coverage"
            value={`${match.skillsHeld}/${match.skillsRequired}`}
            mono
          />
          <Fact label="All-in rate" value={formatCentsExGst(match.buyerRateCents)} mono />
          <Fact
            label="Estimated total"
            value={`${formatCentsExGst(match.estimatedBuyerValueCents)} (estimated)`}
            mono
          />
        </dl>

        <div className="mt-(--space-5)">
          <h2 className="text-label uppercase tracking-[0.08em] text-on-dark-faint">
            Ticket coverage
          </h2>
          {match.qualificationCoverage.length === 0 ? (
            <p className="mt-(--space-2) text-body text-on-dark-muted">
              No tickets are required on this line.
            </p>
          ) : (
            <ul className="mt-(--space-2) flex flex-wrap gap-(--space-3)">
              {match.qualificationCoverage.map((coverage) => (
                <li key={coverage.name} className={pill(coverage.heldBy === coverage.of ? "active" : "pending")}>
                  {coverage.name} {coverage.heldBy}/{coverage.of}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className={`${FIELD_HINT} mt-(--space-5) max-w-[70ch]`}>
          Expected hours: <span className={MONO}>{match.expectedHours}</span>. Crew names and the
          supplying business are shared once the engagement is confirmed, for site access.
        </p>
      </div>

      {match.status === "Awaiting Buyer" && (
        <div className="grid gap-(--space-5) lg:grid-cols-2">
          <div className={CARD}>
            <h2 className="font-display text-h4 font-bold text-on-dark">Accept this proposal</h2>
            <p className={`${FIELD_HINT} mt-(--space-2) max-w-[60ch]`}>
              You are accepting a crew of <span className={MONO}>{match.nominatedCount}</span> at{" "}
              <span className={MONO}>{formatCentsExGst(match.buyerRateCents)}</span> per hour.
              Accepting records the engagement; work starts once payment is pre-authorised.
            </p>
            <div className="mt-(--space-4)">
              {/* 12.7 — the quantity this screen displayed is submitted with the
                  acceptance. If a knockout changed it in the meantime the server
                  refuses and re-presents, so an email can never gate the decision. */}
              <ActionForm
                action={buyerAcceptMatch}
                submitLabel={`Accept a crew of ${match.nominatedCount}`}
                pendingLabel="Accepting…"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="presented_quantity" value={match.nominatedCount} />
                <input type="hidden" name="presented_nomination_version" value={match.nominationVersion} />
              </ActionForm>
            </div>
          </div>

          <div className={CARD}>
            <h2 className="font-display text-h4 font-bold text-on-dark">Decline this proposal</h2>
            <div className="mt-(--space-4)">
              <ActionForm
                action={buyerDeclineMatch}
                submitLabel="Decline this proposal"
                pendingLabel="Declining…"
                tone="ghost"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="expected_status" value={match.status} />
                <label className={FIELD_LABEL} htmlFor="buyer-decline-reason">
                  Reason (optional)
                </label>
                <input id="buyer-decline-reason" name="reason" type="text" className={INPUT} />
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
