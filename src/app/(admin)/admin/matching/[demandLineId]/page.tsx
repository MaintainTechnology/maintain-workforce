import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Fact, FactList, PageHeader, SectionHeader } from "@/components/admin-page";
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
import { BTN_GHOST_SM, PANEL } from "@/lib/ui";
import {
  CHECKBOX,
  CHECK_OPTION,
  FIELD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  SUBSECTION_TITLE,
  formatWindow,
  pill,
  toneFor,
} from "@/lib/admin-ui";
import { CandidateTable, type CandidateRowData } from "../candidate-table";

// 11.1–11.4 plus the 16.1 concierge controls for one requirement line.

export const metadata: Metadata = { title: "Candidates" };

type PageProps = {
  params: Promise<{ demandLineId: string }>;
  searchParams: Promise<{ higher?: string }>;
};

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
      <PageHeader
        back={{ href: "/admin/matching", label: "Back to matching" }}
        title={demandLine.requestName}
        lead={demandLine.description || undefined}
        meta={
          <>
            <span>{demandLine.tradeName} · {demandLine.proficiencyName}</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>{demandLine.workRegionName}</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>{formatWindow(demandLine.startDate, demandLine.endDate)}</span>
          </>
        }
        actions={
          // 11.1 — the "include higher proficiency" toggle changes the server-side
          // candidate set, so it is a navigation, not client state.
          <Link
            href={`/admin/matching/${demandLineId}${includeHigherProficiency ? "" : "?higher=1"}`}
            className={BTN_GHOST_SM}
          >
            {includeHigherProficiency
              ? "Show this level only"
              : "Include higher levels"}
          </Link>
        }
      />

      <section className={`${PANEL} p-(--space-5)`} aria-label="Requirement line">
        <FactList columns={4}>
          <Fact label="Hours per week" value={String(demandLine.hoursPerWeek)} numeric />
          <Fact
            label="Quantity"
            value={`${demandLine.quantity} — ${demandLine.quantityFilled} filled, ${demandLine.quantityPending} pending`}
            numeric
          />
          <Fact label="Required skills" value={demandLine.requiredSkills.join(", ") || "None"} />
          <Fact label="Required tickets" value={demandLine.requiredQualifications.join(", ") || "None"} />
        </FactList>
        <p className={`${FIELD_HINT} mt-(--space-4) border-t border-hairline pt-(--space-3)`}>
          Platform fee at proposal <span className="tabular-nums text-on-dark">{(demandLine.feeBp / 100).toFixed(2)}%</span>.
<<<<<<< HEAD
          It is snapshotted onto each match and never re-read.
=======
          Each proposed match keeps its agreed fee.
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
          {" "}Showing {includeHigherProficiency ? `${demandLine.proficiencyName} and higher levels` : `${demandLine.proficiencyName} only`}.
        </p>
      </section>

      <section className={`${PANEL} p-(--space-5)`} aria-labelledby="candidates-heading">
        <SectionHeader
          title={<span id="candidates-heading">Candidates</span>}
<<<<<<< HEAD
          hint="Availability, hours and ticket coverage are computed on the server. Shortlisting proves the shape is feasible and creates one match per capacity line; the supplying business decides which of its crew actually go."
=======
          hint="Compare availability, hours and ticket coverage. Shortlisting creates one match per capacity line; the supplying business confirms which crew will go."
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
        />
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

      <section className="flex flex-col gap-(--space-4)" aria-labelledby="matches-heading">
        <SectionHeader
          title={<span id="matches-heading">Matches on this line</span>}
          hint={matches.length > 0 ? `${matches.length} proposed so far.` : undefined}
        />
        {matches.length === 0 && (
          <EmptyState title="No match has been proposed on this line yet">
            Shortlist candidates above and propose a match to start the supplier&rsquo;s nomination.
          </EmptyState>
        )}
        {matches.map((match) => {
          const crew = crewByMatch.get(match.id) ?? [];
          const live = match.nominations.filter((n) => !n.knockedOut);
          const open = match.status === "Awaiting Supplier" || match.status === "Awaiting Buyer";
          return (
            <article key={match.id} className={`${PANEL} p-(--space-5)`}>
              <div className="flex flex-wrap items-center gap-(--space-3)">
                <span className={pill(toneFor(match.status))}>{match.status}</span>
                <span className="text-body font-semibold text-on-dark">
                  {match.supplierCompanyName}
                </span>
                {match.adminEntered && (
                  <span className={pill("neutral")}>Admin entered</span>
                )}
                <span className="ml-auto text-sm tabular-nums text-on-dark-muted">
                  {formatWindow(match.engagementStart, match.engagementEnd)}
                </span>
              </div>

              <FactList columns={4} className="mt-(--space-4)">
                <Fact label="Requested" value={String(match.requestedQuantity)} numeric />
                <Fact label="Nominated" value={String(match.nominatedCount)} numeric />
                <Fact label="Supplier rate" value={formatCentsExGst(match.supplierRateCents)} numeric />
                <Fact label="Buyer rate" value={formatCentsExGst(match.buyerRateCents)} numeric />
              </FactList>

              {match.nominations.length > 0 && (
                <div className="mt-(--space-4)">
                  <p className={FIELD_LABEL}>Nominations</p>
                  <ul className="mt-(--space-2) flex flex-wrap gap-(--space-2)">
                    {match.nominations.map((nomination) => (
                      <li
                        key={nomination.workerId}
                        className={`inline-flex items-center gap-(--space-2) rounded-(--radius-pill) border border-hairline px-(--space-3) py-(--space-1) text-sm ${nomination.knockedOut ? "text-on-dark-faint line-through" : "text-on-dark"}`}
                      >
                        {nomination.name}
                        {nomination.knockedOut && <span className="text-xs no-underline">knocked out</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {open && (
                <div className="mt-(--space-5) grid gap-(--space-8) border-t border-hairline pt-(--space-5) lg:grid-cols-2">
                  {/* 16.1 — a phoned-in supplier acceptance, WITH the nominations the
                      supplier gave over the phone. Relayed, never chosen here. */}
                  {match.status === "Awaiting Supplier" && (
                    <div>
                      <h3 className={SUBSECTION_TITLE}>Record the supplier&rsquo;s acceptance</h3>
                      <p className={`${FIELD_HINT} mt-(--space-1)`}>
                        Tick the crew the supplying business named. This is their nomination,
                        relayed — never your selection.
                      </p>
                      <ActionForm
                        action={recordSupplierAcceptance}
                        submitLabel="Record acceptance and nominations"
                        pendingLabel="Recording…"
                        className="mt-(--space-4)"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <fieldset className="flex flex-col gap-(--space-2)">
                          <legend className={FIELD_LABEL}>Crew the supplier named</legend>
                          <div className="mt-(--space-2) flex flex-wrap gap-(--space-2)">
                            {crew.map((member) => (
                              <label key={member.id} className={CHECK_OPTION}>
                                <input type="checkbox" name="worker_id" value={member.id} className={CHECKBOX} />
                                {member.name}
                              </label>
                            ))}
                          </div>
                          {crew.length === 0 && (
                            <p className={FIELD_HINT}>No crew is attached to this capacity line.</p>
                          )}
                        </fieldset>
                        <div className={FIELD}>
                          <label className={FIELD_LABEL} htmlFor={`supplier-evidence-${match.id}`}>
                            Evidence note
                          </label>
                          <textarea
                            id={`supplier-evidence-${match.id}`}
                            name="evidence_note"
                            rows={2}
                            className={INPUT}
                            placeholder="Who you spoke to, and when"
                          />
                        </div>
                      </ActionForm>
                    </div>
                  )}

                  {/* 16.1 — a phoned-in buyer acceptance. 12.7: the quantity recorded
                      here is the quantity currently nominated, so a knockout between
                      the call and the keystroke cannot be recorded as agreed. */}
                  {match.status === "Awaiting Buyer" && (
                    <div>
                      <h3 className={SUBSECTION_TITLE}>Record the buyer&rsquo;s acceptance</h3>
                      <p className={`${FIELD_HINT} mt-(--space-1)`}>
                        Recording acceptance for a crew of <span className="tabular-nums text-on-dark">{live.length}</span>.
                        If that number has changed since the call, re-present it first.
                      </p>
                      <ActionForm
                        action={recordBuyerAcceptance}
                        submitLabel="Record buyer acceptance"
                        pendingLabel="Recording…"
                        className="mt-(--space-4)"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <input type="hidden" name="presented_quantity" value={live.length} />
                        <input type="hidden" name="presented_nomination_version" value={match.nominationVersion} />
                        <div className={FIELD}>
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
                        </div>
                      </ActionForm>
                    </div>
                  )}

                  <div className="flex flex-col gap-(--space-6)">
                    {/* 16.1 — a phoned-in decline from either party. */}
                    <div>
                      <h3 className={SUBSECTION_TITLE}>Record a decline</h3>
                      <ActionForm
                        action={recordPartyDecline}
                        submitLabel="Record decline"
                        pendingLabel="Recording…"
                        tone="ghost"
                        size="sm"
                        className="mt-(--space-3)"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <div className="grid gap-(--space-3) sm:grid-cols-2">
                          <div className={FIELD}>
                            <label className={FIELD_LABEL} htmlFor={`decline-by-${match.id}`}>
                              Declined by
                            </label>
                            <select id={`decline-by-${match.id}`} name="by" className={INPUT}>
                              <option value="supplier">The supplying business</option>
                              {match.status === "Awaiting Buyer" && (
                                <option value="buyer">The hiring business</option>
                              )}
                            </select>
                          </div>
                          <div className={FIELD}>
                            <label className={FIELD_LABEL} htmlFor={`decline-reason-${match.id}`}>
                              Reason (optional)
                            </label>
                            <input id={`decline-reason-${match.id}`} name="reason" className={INPUT} type="text" />
                          </div>
                        </div>
                        <div className={FIELD}>
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
                        </div>
                      </ActionForm>
                    </div>

                    {/* 12.2 — the ticket-expiry override may be added after proposal, so
                        a ticket that greys later never forces withdraw-and-re-propose. */}
                    <div>
                      <h3 className={SUBSECTION_TITLE}>Record a ticket-expiry override</h3>
                      <ActionForm
                        action={addQualificationOverride}
                        submitLabel="Record override"
                        pendingLabel="Recording…"
                        tone="ghost"
                        size="sm"
                        className="mt-(--space-3)"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <div className={FIELD}>
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
                        </div>
                      </ActionForm>
                    </div>

                    {/* 12.7 — knockout with substitution prompt; below the minimum crew
                        size the match auto-declines. */}
                    {live.length > 0 && (
                      <div>
                        <h3 className={SUBSECTION_TITLE}>Knock out a nomination</h3>
                        <ActionForm
                          action={knockOutNomination}
                          submitLabel="Knock out nomination"
                          pendingLabel="Recording…"
                          tone="ghost"
                          size="sm"
                          className="mt-(--space-3)"
                        >
                          <input type="hidden" name="match_id" value={match.id} />
                          <input type="hidden" name="expected_status" value={match.status} />
                          <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                          <div className="grid gap-(--space-3) sm:grid-cols-2">
                            <div className={FIELD}>
                              <label className={FIELD_LABEL} htmlFor={`knockout-worker-${match.id}`}>
                                Nomination
                              </label>
                              <select id={`knockout-worker-${match.id}`} name="worker_id" className={INPUT}>
                                {live.map((nomination) => (
                                  <option key={nomination.workerId} value={nomination.workerId}>
                                    {nomination.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className={FIELD}>
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
                            </div>
                          </div>
                        </ActionForm>
                      </div>
                    )}

                    {/* 12.1 — Maintain may withdraw in any pre-Accepted state. */}
                    <div>
                      <h3 className={SUBSECTION_TITLE}>Withdraw this match</h3>
                      <ActionForm
                        action={withdrawMatch}
                        submitLabel="Withdraw match"
                        pendingLabel="Withdrawing…"
                        tone="ghost"
                        size="sm"
                        className="mt-(--space-3)"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <input type="hidden" name="expected_status" value={match.status} />
                        <input type="hidden" name="expected_nomination_version" value={match.nominationVersion} />
                        <div className={FIELD}>
                          <label className={FIELD_LABEL} htmlFor={`withdraw-reason-${match.id}`}>
                            Reason (optional)
                          </label>
                          <input id={`withdraw-reason-${match.id}`} name="reason" className={INPUT} type="text" />
                        </div>
                      </ActionForm>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
