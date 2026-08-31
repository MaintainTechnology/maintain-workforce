# LLM Council Evaluation — Maintain Workforce MVP Spec v0.3

| | |
|---|---|
| Subject | specs/maintain-workforce-mvp.md, version 0.3 |
| Prior evaluations | Brief v0.1: 4.8/10 (panel, no corpus) then 5.5/10 (council, with corpus — specs/llm-council-evaluation.md) |
| Method | LLM Council (3 stages): five independent members answered blind with distinct lenses; five independent reviewers read the spec themselves, verified every load-bearing claim against the text, and ranked the anonymized answers; Chairman synthesis on merit and consensus |
| Date | 24 August 2026 |

---

## The rating: 7.5 / 10

Member scores: 7.5, 7.5, 7.5, 7.5, 8.0. Calibration: 0–3 vision doc; 4–5 buildable only with constant founder access; 6–7 strong brief, team makes consequential decisions alone; 8–9 build-ready, ambiguities minor; 10 exhaustive with acceptance criteria. Progression: 4.8 → 5.5 → 7.5.

The council was unanimous on the shape of the result. Every recommendation from the previous evaluation (R1–R14) is implemented and traceable, no confirmed decision was silently reversed, the ten open questions are exemplary delegation (stated defaults, named owners, none blocking build), the guardrails hold on every surface the members could trace, and the production-readiness section was judged "genuinely sufficient to ship" by four of five members. The failure mode of v0.1 — confidently specifying the legally wrong thing — is entirely absent.

What holds v0.3 out of the 8–9 band is one systemic defect cluster that v0.3's own headline addition introduced, plus a short list of mechanical seams. The **Awaiting Commercial** state (the commercial trigger) was inserted into the engagement lifecycle, but the spec's hold and derivation machinery was not widened to include it: the exclusion constraint (13.6), the matching filter (11.1), the soft-hold rule (21.3), remaining headcount (9.5), quantity_filled (10.3), availability arithmetic (21.2), and the transfer block (8.4) all still key off "Confirmed/Active" or "confirmed engagements". A worker on a buyer-accepted engagement awaiting payment pre-authorisation is therefore held by nothing — re-matchable, re-acceptable, and even transferable — with the collision surfacing only when the second commercial trigger is recorded, after two buyers have committed. The same root cause makes the spec's own definition of done unpassable: the "2 of 3 → Partially Filled" acceptance item contradicts 10.3's fill derivation. These are exactly the kind of internal contradictions the calibration says must count, and they sit in the starred flow that closes the MVP.

The top-ranked member argued 8.0 on the grounds that this is a bug, not an open design decision — the repair requires no founder judgement, every planning document points the same way (pre-authorised work must be protected), and the fix is a mechanical widening of one status set. The Chairman holds 7.5 with the other four: a spec whose acceptance suite disagrees with its own requirements in the flow that defines success is not yet build-ready by its own standard. The distance to 8.5+ is a day of editing, not a redesign.

---

## Council notes

- **Where they agreed (all five):** the Awaiting Commercial hold gap and its ripple effects; the fill-count contradiction (10.3 vs the partial-acceptance DoD item); the lead-qualification path creating a company with no ABN and no possible first login; the match-to-capacity-line rate binding left undefined; and the "automatic" transitions (line/match expiry, engagement activation/completion, transfer escalation) having no named executor — the cron is scoped only to document/qualification expiry.
- **The one real disagreement:** the band. The top-ranked member scored 8.0 ("a bug in an otherwise build-ready spec"); the other four held 7.5 because the defects sit on the money path and falsify a stated invariant ("double-booking is impossible by construction"). The Chairman takes 7.5, per the calibration's explicit rule that internal contradictions count where delegated questions do not.
- **Aggregate ranking:** First-principles > Rigorist > Red-team > Pragmatist > Generalist (the First-principles answer ranked first with four of five reviewers).
- **Corrections applied in synthesis (from document-verified review):** three members claimed the banned-vocabulary grep "can never pass" because "hiring business" is approved while "hire" is banned — mechanically wrong ("hire" is not a substring of "hiring"); the real collision, found by one member, is 1.4's statutory "labour-hire licence" checklist item, whose proper name contains two banned terms. And one member's assertion that the commercial-trigger insertion was "applied consistently" was rejected as a misreading — four members and all five reviewers proved otherwise.

---

## Verified findings

Every finding below was independently verified against the spec text by the reviewer panel.

### The Awaiting Commercial cluster (highest severity — one root cause)

1. **Hold gap.** 21.3 soft-holds only nominations in an *open* match; 13.6 and 11.1 cover only Confirmed/Active. An Accepted match / Awaiting Commercial engagement commits nothing; the worker can be nominated, accepted, and pre-authorised into a second overlapping engagement, and the constraint rejects whichever commercial trigger is recorded second — after both buyers have committed off-platform.
2. **Fill contradiction.** 10.3 derives quantity_filled from "confirmed engagements", but the partial-acceptance edge case and DoD item mark the line Partially Filled at supplier acceptance — before any engagement exists (12.5 creates it at buyer acceptance). 13.5 decrements a count that was never incremented.
3. **Transfer window.** 8.4 blocks transfers only for Confirmed/Active — a worker on an Awaiting Commercial engagement can be transferred away before the trigger fires.

### Module 0 seams

4. **Bootstrap gap.** The lead carries no ABN (1.1/1.2 make it mandatory and unique) and no mechanism creates the first Company Administrator (1.1 is public self-registration; 1.8 invitations require an existing administrator). A phone-acquired company — the majority path under the GTM — cannot log in.
5. **Draft contradiction.** The 0.5 workflow map shows "draft capacity or demand prepared" during Pending, which 1.3 forbids and no state machine represents.

### Core-loop seams

6. **Rate/line binding undefined.** 5.2 stores the confirmed rate per capacity line; 11.3 scopes a match to one supplier but not one line; 12.2 lets the supplier nominate any eligible worker, including from a different line at a different rate; 13.1 snapshots a single supplier_rate_cents. Which rate the buyer pays is underdetermined — in the field the guardrail says the supplier owns. 5.5 also fixes the rate "at proposal" though nomination happens after.
7. **Concierge cannot record acceptances.** 16.1 grants concierge powers over listings, demand, and workers only, while 16.2 promises "the full loop operable by Maintain" and 16.3 names acceptance facilitation. Phase 1's closing milestone is unbuildable for login-less companies as written — and supplier nomination is the legally sensitive act, so the recording rule must preserve guardrail 2.
8. **Candidate-set semantics contradict.** 11.1 hard-excludes any worker with an overlapping Confirmed/Active engagement, making 21.2's engagement-day subtraction unreachable for displayed candidates; 7.3 says an in-window-expiring qualification "fails the hard filter" yet "surfaces as a warning" — a filtered-out worker cannot carry a badge. 21.2's singular "capacity window" is undefined for a worker on two non-overlapping lines.
9. **MatchWorker-level decline undefined.** 8.5 auto-declines a transferred worker's nominations, but module 12 defines only match-level decline — what an Awaiting Buyer match with one nomination knocked out becomes is unstated.
10. **Minimum conflict.** 12.2 hardcodes partial acceptance "minimum 1" against 5.6's configurable minimum_crew_size, which founders may set to 2.
11. **Dedupe dead-end.** 6.2 makes email and mobile each unique platform-wide but offers the transfer path only on an email-AND-mobile match; a single-field collision (worker changed phones) hits a raw uniqueness error with no specified behaviour.

### Mechanism and closure seams

12. **No executor for automatic transitions.** Line/demand/match expiry, Engagement Confirmed→Active and Active→Completed, Overdue flagging, and the 5-business-day transfer escalation are all "automatic" with no named mechanism; the cron is scoped to 1.6/7.2 only. Related: 18.2 requires auditing clock-driven events while 2.2 forbids anonymous service-role actors — no system-actor convention exists.
13. **Notification catalogue not closed.** 15.2 omits match expired → Maintain (mandated by 12.1), the 8.5 transfer-completion cascade, and the lead/invitation events — while the DoD tests only "every trigger in 15.2". 15.3 bans rates and worker names from emails but not counterparty company names pre-Confirmed.
14. **RateBand read leak.** 17.1 lets companies read the raw band table while 5.5 shows buyers the fee-marked-up indicative range; any dual-role company derives the fee percentage by division — the itemised margin the Decision Brief says never to teach the buyer.
15. **Vocabulary test self-collision.** 1.4's statutory "labour-hire licence" checklist item collides with 22.1's ban as written; the grep needs a statutory-name carve-out and word-boundary rules to be both passable and meaningful.
16. **Deploy order backwards.** The pipeline promotes to production before applying production migrations; with additive-only migrations the safe order is migrate-then-promote (old code on new schema is safe; new code on old schema is the unsafe window). No actor is named for applying migrations. Parallel previews sharing one staging Supabase project will collide.
17. **Small verified items:** "mandatory qualification" (7.2) and "licence required for its trades" (1.6) have no data source (no is_mandatory mapping; companies carry no trades attribute); the Notification table is missing from 17.1's RLS classification; Supabase Auth's own emails bypass the Resend-verified domain; "standard rate limiting" names no serverless-safe mechanism; maintain_admin provisioning is unspecified; 13.6's exclusion constraint is single-table in Postgres, requiring denormalised status+daterange on EngagementWorker with a sync rule for end-date edits; the buyer's pre-Confirmed "qualification facts" projection (12.4) needs a rule (aggregate badges, no ticket numbers); the fee-snapshot timing (5.3 "per match" vs 13.1 "at creation") needs one sentence; the lead webhook payload should be the platform's own zod schema so OQ9 truly doesn't block.

---

## Recommendations (prioritized, all inside the designed concept)

R1. **Widen the committing-status set once, apply it everywhere.** Define "committing engagement statuses = Awaiting Commercial, Confirmed, Active" and use that set in 9.5, 10.3, 11.1, 13.6, 21.2, 13.5, and 8.4; replace every lowercase "confirmed engagements" with the explicit set. This single edit fixes the hold gap, the fill contradiction, the phantom decrement, and the transfer window, and makes the "impossible by construction" invariant true.

R2. **Bind each Match to exactly one CapacityLine.** Nominations are restricted to that line's workers; an admin selection spanning lines creates one match per line (mirroring the existing one-per-supplier rule); the line's confirmed rate is the snapshot; fee_bp is snapshotted at proposal and copied, never re-read, at engagement creation.

R3. **Close the lead bootstrap.** Add optional ABN to the lead; qualification requires ABN (checksum-validated) plus contact email, creates the Pending company, and sends a Maintain-initiated first-administrator invitation reusing the 1.8 token flow; a company may remain login-less indefinitely under concierge operation. Amend the 0.5 map to "workers prepared" (or add a Draft line status — pick one). Add the invitation trigger to 15.2 and extend the lead DoD item through first login.

R4. **Extend 16.1 concierge powers to recording acceptances.** A Maintain admin may record a phoned-in supplier acceptance with worker nomination, and a buyer acceptance, flagged admin-entered with a mandatory evidence note; supplier match acceptance constitutes rate ratification, and a rate_entered_by field records provenance. Add a DoD item: Maintain completes the starred transaction end-to-end for two companies that have never logged in.

R5. **Publish the automatic-transition inventory.** One table: transition → executor (the daily cron, evaluated at 00:00 Australia/Brisbane, vs derived-at-read — chosen explicitly per transition) covering document/qualification expiry, line and demand expiry, match expiry, Engagement Active/Completed, Overdue flagging, and the transfer escalation. Reserve one audited system-actor id for clock-driven transitions (resolving 18.1/2.2), and state the cron's idempotency key.

R6. **Define three candidate display classes in 11.1** — excluded (never shown), greyed-with-reason (soft-holds, in-window qualification expiry, partial engagement overlap), eligible — computed per worker with the availability window as the union of the worker's open line windows. This makes 21.2's subtraction reachable and 7.3's override coherent; add worker stored status and employing-company status to the hard filter.

R7. **Close the notification catalogue.** Add match expired → Maintain, the transfer-completion cascade, ABN-collision review, and lead qualification/invitation rows; declare 15.2 exhaustive (silence is deliberate); extend 15.3 to ban counterparty company names pre-Confirmed.

R8. **Fix the deploy order and the email seam.** Production migrations are applied by a named CI step (supabase CLI) before promotion — additive-only migrations are exactly what makes that order safe; give each preview its own Supabase branch or serialize staging migrations; route Supabase Auth emails through the verified domain (custom SMTP via Resend) and add reset/invite templates to the launch test sends.

R9. **Fix the RateBand read policy.** Companies never read the raw band table; suppliers read bands for their trades via projection; buyers receive only fee-marked-up indicative ranges; add "raw band values absent from any buyer-facing response" to the RLS DoD test.

R10. **The small-repairs bundle** (each one to three sentences): 12.2's floor becomes minimum_crew_size; 6.2 single-field collisions block with an existence-only message and offer the transfer path (never disclosing which field matched); the vocabulary rule gains a statutory-name carve-out ("labour-hire licence" as a document's proper name, identifier convention lh_licence) and ships as a word-boundary lint script; MatchWorker-level decline defined (knockout pre-Accepted drops the count with a substitution prompt, auto-Decline at zero, buyer re-notified if already Awaiting Buyer); an is_mandatory flag on the TradeRole–Qualification mapping and company required-licences defined as the union over its workers' primary trades; Notification classified Maintain-only in 17.1; the lead webhook payload committed as a zod schema; a named serverless-safe rate limiter (Vercel WAF rules plus Supabase Auth's built-in limits); maintain_admin provisioning as a scripted, audited launch-checklist step; a note that 13.6 denormalises status+daterange onto EngagementWorker with a stated sync rule; the buyer's pre-Confirmed qualification projection defined as aggregate badges only.

---

## What did not need fixing

The council explicitly cleared: the three legal guardrails on every traced surface (rate secrecy server-side, shape-not-individuals through every flow including concierge and transfer, facilitator posture); the R1–R14 remediation (complete, no silent reversals); the delegation discipline of the ten open questions; the money arithmetic; the RLS classification approach; the state-machine table structure; and the production-readiness section as a whole (the deploy-order defect aside, it was judged better than most funded teams write). The commercial-trigger insertion itself was judged an improvement — more faithful to the planning corpus than the previous council's own R5 — it just wasn't rippled through the capacity machinery.

---

*Produced by the llm-council skill: five independent members (pragmatist, red-team, domain-rigor, first-principles, generalist lenses), five blind reviewers who verified every load-bearing claim against the spec text before ranking, Chairman synthesis. Input for the next spec revision (v0.4).*
