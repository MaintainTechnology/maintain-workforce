import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import {
  addQualificationOverride,
  knockOutNomination,
  matchesForDemandLine,
  nominableCrew,
  recordBuyerAcceptance,
  recordPartyDecline,
  recordSupplierAcceptance,
  withdrawMatch,
} from "@/lib/actions/match";
import { formatCentsExGst } from "@/lib/domain/money";
import { requireMaintainAdmin } from "@/lib/auth";
import { getCandidates, getDemandLineContext } from "@/lib/matching";
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
import { CandidateTable, type CandidateRowData } from "../candidate-table";

// 11.1–11.4 plus the 16.1 concierge controls for one requirement line.

export const metadata: Metadata = { title: "Candidates" };

type PageProps = {
  params: Promise<{ demandLineId: string }>;
  searchParams: Promise<{ higher?: string }>;
};

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">{label}</dt>
      <dd className={`mt-(--space-1) text-body text-on-dark ${mono ? MONO : ""}`}>{value}</dd>
    </div>
  );
}

export default async function DemandLineMatchingPage({ params, searchParams }: PageProps) {
  await requireMaintainAdmin();
  const { demandLineId } = await params;
  const { higher } = await searchParams;
  const includeHigherProficiency = higher === "1";

  const demandLine = await getDemandLineContext(demandLineId);
  if (!demandLine) notFound();

  const [candidates, matches] = await Promise.all([
    getCandidates({ demandLine, includeHigherProficiency }),
    matchesForDemandLine(demandLineId),
  ]);

  // 16.1 — the crew a Maintain admin may relay a nomination from, resolved before the
  // markup so the list stays a plain synchronous render.
  const crewByMatch = new Map(
    await Promise.all(
      matches
        .filter((match) => match.status === "Awaiting Supplier")
        .map(async (match) => [match.id, await nominableCrew(match.id)] as const),
    ),
  );

  // 11.1 — Excluded never reaches the screen; getCandidates has already dropped it.
  const rows: CandidateRowData[] = candidates.map((candidate) => ({
    key: candidate.key,
    workerName: candidate.workerName,
    supplierCompanyName: candidate.supplierCompanyName,
    klass: candidate.klass === "Greyed" ? "Greyed" : "Eligible",
    reasons: candidate.reasons,
    availabilityPercent: candidate.availabilityPercent,
    hoursShortfall: candidate.hoursShortfall,
    lineHoursPerWeek: candidate.lineHoursPerWeek,
    hoursSufficient: candidate.hoursSufficient,
    skillsHeld: candidate.skillsHeld,
    skillsRequired: candidate.skillsRequired,
    qualificationSummary:
      candidate.qualifications.length === 0
        ? "none required"
        : candidate.qualifications
            .map(
              (q) =>
                `${q.name}${q.expiresDuringEngagement ? " (expires during engagement)" : q.expiringSoon ? " (expiring within 30 days)" : ""}`,
            )
            .join(", "),
    expiresDuringEngagement: candidate.expiresDuringEngagement,
    supplierRateCents: candidate.supplierRateCents,
    buyerRateCents: candidate.buyerRateCents,
    engagementWindow: formatWindow(candidate.engagementStart, candidate.engagementEnd),
  }));

  return (
    <div className="flex flex-col gap-(--space-6)">
      <div>
        <Link
          href="/admin/matching"
          className="text-body font-semibold text-on-dark-muted underline underline-offset-4"
        >
          Back to matching
        </Link>
        <h1 className={`${H1} mt-(--space-3)`}>{demandLine.requestName}</h1>
      </div>

      <div className={CARD}>
        <dl className="grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Trade" value={demandLine.tradeName} />
          <Fact label="Level" value={demandLine.proficiencyName} />
          <Fact label="Region" value={demandLine.workRegionName} />
          <Fact
            label="Window"
            value={formatWindow(demandLine.startDate, demandLine.endDate)}
            mono
          />
          <Fact label="Hours per week" value={String(demandLine.hoursPerWeek)} mono />
          <Fact
            label="Quantity"
            value={`${demandLine.quantity} — ${demandLine.quantityFilled} filled, ${demandLine.quantityPending} pending`}
            mono
          />
          <Fact
            label="Required skills"
            value={demandLine.requiredSkills.join(", ") || "none"}
          />
          <Fact
            label="Required tickets"
            value={demandLine.requiredQualifications.join(", ") || "none"}
          />
        </dl>
        {demandLine.description && (
          <p className="mt-(--space-4) text-body text-on-dark-muted">{demandLine.description}</p>
        )}
        <p className={`${FIELD_HINT} mt-(--space-4)`}>
          Platform fee at proposal: <span className={MONO}>{(demandLine.feeBp / 100).toFixed(2)}%</span>.
          It is snapshotted onto each match and never re-read.
        </p>
      </div>

      {/* 11.1 — the "include higher proficiency" toggle changes the server-side
          candidate set, so it is a navigation, not client state. */}
      <div className="flex flex-wrap items-center gap-(--space-4)">
        <Link
          href={`/admin/matching/${demandLineId}${includeHigherProficiency ? "" : "?higher=1"}`}
          className="inline-flex min-h-11 items-center rounded-(--radius-pill) border border-hairline px-(--space-5) font-semibold text-on-dark hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hi-vis-amber"
        >
          {includeHigherProficiency
            ? "Showing higher levels — show this level only"
            : `Showing ${demandLine.proficiencyName} only — include higher levels`}
        </Link>
      </div>

      <section className={CARD}>
        <h2 className="font-display text-h3 font-bold text-on-dark">Candidates</h2>
        <p className={`${FIELD_HINT} mt-(--space-2) max-w-[70ch]`}>
          Availability, hours and ticket coverage are computed on the server. Selecting people
          proves the shape is feasible and creates one match per capacity line; the supplying
          business decides which of its crew actually go.
        </p>
        <div className="mt-(--space-5)">
          <CandidateTable
            demandLineId={demandLineId}
            candidates={rows}
            includeHigherProficiency={includeHigherProficiency}
            remaining={demandLine.remaining}
            demandHoursPerWeek={demandLine.hoursPerWeek}
          />
        </div>
      </section>

      <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-h3 font-bold text-on-dark">Matches on this line</h2>
        {matches.length === 0 && (
          <div className={CARD}>
            <p className="text-body text-on-dark-muted">No match has been proposed on this line yet.</p>
          </div>
        )}
        {matches.map((match) => {
          const crew = crewByMatch.get(match.id) ?? [];
          const live = match.nominations.filter((n) => !n.knockedOut);
          return (
            <div key={match.id} className={CARD}>
              <div className="flex flex-wrap items-center gap-(--space-3)">
                <span className={pill(toneFor(match.status))}>{match.status}</span>
                <span className="text-body font-semibold text-on-dark">
                  {match.supplierCompanyName}
                </span>
                {match.adminEntered && (
                  <span className={pill("neutral")}>Admin entered</span>
                )}
                <span className={`${MONO} ml-auto text-body-sm text-on-dark-muted`}>
                  {formatWindow(match.engagementStart, match.engagementEnd)}
                </span>
              </div>

              <dl className="mt-(--space-4) grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="Requested" value={String(match.requestedQuantity)} mono />
                <Fact label="Nominated" value={String(match.nominatedCount)} mono />
                <Fact label="Supplier rate" value={formatCentsExGst(match.supplierRateCents)} mono />
                <Fact label="Buyer rate" value={formatCentsExGst(match.buyerRateCents)} mono />
              </dl>

              {match.nominations.length > 0 && (
                <ul className="mt-(--space-4) flex flex-col gap-(--space-2)">
                  {match.nominations.map((nomination) => (
                    <li key={nomination.workerId} className="text-body text-on-dark-muted">
                      {nomination.name}
                      {nomination.knockedOut && " — knocked out"}
                    </li>
                  ))}
                </ul>
              )}

              {(match.status === "Awaiting Supplier" || match.status === "Awaiting Buyer") && (
                <div className="mt-(--space-5) grid gap-(--space-5) lg:grid-cols-2">
                  {/* 16.1 — a phoned-in supplier acceptance, WITH the nominations the
                      supplier gave over the phone. Relayed, never chosen here. */}
                  {match.status === "Awaiting Supplier" && (
                    <div>
                      <h3 className="text-body font-semibold text-on-dark">
                        Record the supplier&rsquo;s acceptance
                      </h3>
                      <p className={`${FIELD_HINT} mt-(--space-1)`}>
                        Tick the crew the supplying business named. This is their nomination,
                        relayed — never your selection.
                      </p>
                      <ActionForm
                        action={recordSupplierAcceptance}
                        submitLabel="Record acceptance and nominations"
                        pendingLabel="Recording…"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <fieldset className="mt-(--space-3) flex flex-col gap-(--space-2)">
                          <legend className={FIELD_LABEL}>Crew the supplier named</legend>
                          {crew.map((member) => (
                            <label
                              key={member.id}
                              className="flex items-center gap-(--space-3) text-body text-on-dark"
                            >
                              <input
                                type="checkbox"
                                name="worker_id"
                                value={member.id}
                                className="size-5 accent-(--color-hi-vis-amber)"
                              />
                              {member.name}
                            </label>
                          ))}
                          {crew.length === 0 && (
                            <p className={FIELD_HINT}>No crew is attached to this capacity line.</p>
                          )}
                        </fieldset>
                        <label
                          className={FIELD_LABEL}
                          htmlFor={`supplier-evidence-${match.id}`}
                        >
                          Evidence note
                        </label>
                        <textarea
                          id={`supplier-evidence-${match.id}`}
                          name="evidence_note"
                          rows={2}
                          className={INPUT}
                          placeholder="Who you spoke to, and when"
                        />
                      </ActionForm>
                    </div>
                  )}

                  {/* 16.1 — a phoned-in buyer acceptance. 12.7: the quantity recorded
                      here is the quantity currently nominated, so a knockout between
                      the call and the keystroke cannot be recorded as agreed. */}
                  {match.status === "Awaiting Buyer" && (
                    <div>
                      <h3 className="text-body font-semibold text-on-dark">
                        Record the buyer&rsquo;s acceptance
                      </h3>
                      <p className={`${FIELD_HINT} mt-(--space-1)`}>
                        Recording acceptance for a crew of <span className={MONO}>{live.length}</span>.
                        If that number has changed since the call, re-present it first.
                      </p>
                      <ActionForm
                        action={recordBuyerAcceptance}
                        submitLabel="Record buyer acceptance"
                        pendingLabel="Recording…"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <input type="hidden" name="presented_quantity" value={live.length} />
                        <input type="hidden" name="presented_nomination_version" value={match.nominationVersion} />
                        <label className={FIELD_LABEL} htmlFor={`buyer-evidence-${match.id}`}>
                          Evidence note
                        </label>
                        <textarea
                          id={`buyer-evidence-${match.id}`}
                          name="evidence_note"
                          rows={2}
                          className={INPUT}
                          placeholder="Who you spoke to, and when"
                        />
                      </ActionForm>
                    </div>
                  )}

                  <div className="flex flex-col gap-(--space-5)">
                    {/* 16.1 — a phoned-in decline from either party. */}
                    <div>
                      <h3 className="text-body font-semibold text-on-dark">Record a decline</h3>
                      <ActionForm
                        action={recordPartyDecline}
                        submitLabel="Record decline"
                        pendingLabel="Recording…"
                        tone="ghost"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <label className={FIELD_LABEL} htmlFor={`decline-by-${match.id}`}>
                          Declined by
                        </label>
                        <select id={`decline-by-${match.id}`} name="by" className={INPUT}>
                          <option value="supplier">The supplying business</option>
                          {match.status === "Awaiting Buyer" && (
                            <option value="buyer">The hiring business</option>
                          )}
                        </select>
                        <label className={FIELD_LABEL} htmlFor={`decline-reason-${match.id}`}>
                          Reason (optional)
                        </label>
                        <input
                          id={`decline-reason-${match.id}`}
                          name="reason"
                          className={INPUT}
                          type="text"
                        />
                        <label className={FIELD_LABEL} htmlFor={`decline-evidence-${match.id}`}>
                          Evidence note
                        </label>
                        <textarea
                          id={`decline-evidence-${match.id}`}
                          name="evidence_note"
                          rows={2}
                          className={INPUT}
                          placeholder="Who you spoke to, and when"
                        />
                      </ActionForm>
                    </div>

                    {/* 12.2 — the ticket-expiry override may be added after proposal, so
                        a ticket that greys later never forces withdraw-and-re-propose. */}
                    <div>
                      <h3 className="text-body font-semibold text-on-dark">
                        Record a ticket-expiry override
                      </h3>
                      <ActionForm
                        action={addQualificationOverride}
                        submitLabel="Record override"
                        pendingLabel="Recording…"
                        tone="ghost"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <label className={FIELD_LABEL} htmlFor={`override-evidence-${match.id}`}>
                          Evidence note
                        </label>
                        <textarea
                          id={`override-evidence-${match.id}`}
                          name="evidence_note"
                          rows={2}
                          className={INPUT}
                          placeholder="Why the expiry is acceptable, and who agreed"
                        />
                      </ActionForm>
                    </div>

                    {/* 12.7 — knockout with substitution prompt; below the minimum crew
                        size the match auto-declines. */}
                    {live.length > 0 && (
                      <div>
                        <h3 className="text-body font-semibold text-on-dark">
                          Knock out a nomination
                        </h3>
                        <ActionForm
                          action={knockOutNomination}
                          submitLabel="Knock out nomination"
                          pendingLabel="Recording…"
                          tone="ghost"
                        >
                          <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                          <label className={FIELD_LABEL} htmlFor={`knockout-worker-${match.id}`}>
                            Nomination
                          </label>
                          <select
                            id={`knockout-worker-${match.id}`}
                            name="worker_id"
                            className={INPUT}
                          >
                            {live.map((nomination) => (
                              <option key={nomination.workerId} value={nomination.workerId}>
                                {nomination.name}
                              </option>
                            ))}
                          </select>
                          <label className={FIELD_LABEL} htmlFor={`knockout-reason-${match.id}`}>
                            Reason
                          </label>
                          <input
                            id={`knockout-reason-${match.id}`}
                            name="reason"
                            className={INPUT}
                            type="text"
                            placeholder="Why this person is no longer eligible"
                          />
                        </ActionForm>
                      </div>
                    )}

                    {/* 12.1 — Maintain may withdraw in any pre-Accepted state. */}
                    <div>
                      <h3 className="text-body font-semibold text-on-dark">Withdraw this match</h3>
                      <ActionForm
                        action={withdrawMatch}
                        submitLabel="Withdraw match"
                        pendingLabel="Withdrawing…"
                        tone="ghost"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <label className={FIELD_LABEL} htmlFor={`withdraw-reason-${match.id}`}>
                          Reason (optional)
                        </label>
                        <input
                          id={`withdraw-reason-${match.id}`}
                          name="reason"
                          className={INPUT}
                          type="text"
                        />
                      </ActionForm>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
