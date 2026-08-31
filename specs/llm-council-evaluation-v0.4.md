# LLM Council Evaluation — Maintain Workforce MVP Spec v0.4 (Round 3)

| | |
|---|---|
| Subject | specs/maintain-workforce-mvp.md, version 0.4 |
| Rating | 8.5 / 10 — unanimous (all five members) |
| Trajectory | 4.8 (brief v0.1, panel) → 5.5 (brief v0.1, council) → 7.5 (spec v0.3) → 8.5 (spec v0.4) |
| Method | Same three-stage council; five blind members, five blind reviewers verifying every load-bearing claim against the text, Chairman synthesis |
| Aggregate ranking | Rigorist > First-principles > (Generalist ≈ Red-team) > Pragmatist; Rigorist first with all five reviewers |
| Date | 25 August 2026 |

## Verdict

Build-ready. All ten round-2 fixes (R1–R10) were verified genuinely implemented by all five members and confirmed by all five reviewers; the guardrails held on every traced surface including the new concierge, knockout, and pending paths; production readiness was judged shippable from the document alone. The unanimous 8.5 reflected a short residual list — most of it introduced by the v0.4 fixes themselves — of two-builder divergences concentrated in the matching loop.

## Verified residual findings (all confirmed against the text by the reviewer panel; fixed in v0.5)

1. Match expiry (12.1 "start date passes") killed the mid-window backfill and remainder-fill the spec's own 12.2/13.5/edge cases depend on → expiry now keys on the line's end date; mid-window proposals explicitly never expire early.
2. Partial-coverage/partial-conflict semantics: the engagement window was undefined (demand's vs line's) and the greyed partial-conflict override was a dead end (12.3/13.6 reject with no path) → the match now records engagement window = demand ∩ line window; partial-conflict nominations are blocked until the conflict is resolved; one worker occupies one slot per line.
3. Nomination predicate vs the two-admins edge case: "pass the 11.1 eligibility checks" strictly excluded greyed workers, making the edge case unreachable, and 7.3's admin override had no carrier → nominations now fail only on Excluded-class criteria or committing-status overlap; soft-holds warn, never block; the 7.3 override is recorded on the match.
4. 13.1 vs 20.3 contradiction on estimated values (copied at proposal vs computed at creation — different numbers after partial acceptance) → split: commercial identity fields copy from the proposal snapshot; estimated values compute once at engagement creation.
5. Completion boundary: "Completed on end date" at 00:00 released a crew on its final on-site day → Active once start_date ≤ today; Completed once end_date < today; a trigger recorded on/after the start date promotes directly to Active.
6. Executor-table completeness: the WorkerTransfer "(auto)" transitions and the 12.7 knockout/auto-Decline had no executor rows, and 12.7's eager wording contradicted the lazy edge case → rows added (in-transaction for event-driven, daily job for expiry-driven); Match state row now includes the auto-Decline.
7. "Open" was never an explicit status set (against 13.0's own rule) → open match = {Awaiting Supplier, Awaiting Buyer}; open capacity line = {Open, Partially Committed}; line commit status declared display-only for candidates.
8. The no-band edge case mandated a notification absent from the exhaustive 15.2 matrix → matrix row added.
9. Edge-case sweep misses: two surviving pre-R1 phrasings ("Confirmed/Active", lowercase "confirmed elsewhere") and the request-vs-completion transfer nuance → all rewritten to the 13.0 set; 14.2 gains the Awaiting Commercial bucket.
10. Concierge scope: document upload/profile edits and the supplier's decline were not recordable, blocking the login-less starred DoD → 16.1 extended.
11. Supplier engagement projection leaked fee fields (buyer rate reconstructable by one multiplication) → fee fields excluded; DoD RLS test extended.
12. Smaller verified items, all fixed: 7.3 "Current" wording hole (now "not Expired", Expiring-Soon-clearing-window = Eligible with badge); company-level mandatory licences had no data home (4.5 level column); band-projection scope circularity at first line; transfer with no current employer (→ Admin Review); post-transfer qualification-document access (worker-scoped, paths never re-parented); invitation-token re-issue; Suspended-company open matches withdrawn; 18.2 audits the commercial trigger and payment_status changes; 21.2 subtracts only engaged days inside the covered union and tests hours per covering day; business days defined (Mon–Fri, QLD holidays excluded); weeks defined as inclusive days ÷ 7; "s35" reference normalised.

## Council notes

- The unanimous 8.5 came with every member noting the same thing in its self-objection: the residuals were one-to-three-sentence edits with no founder judgement required — the distance to 9 was editing, not design.
- Reviewer verification mattered: two member claims were refuted (the 7.3 "no display class covers it" overstatement — 11.1's Eligible is a catch-all; and three false consistency certifications on executor-table completeness and notification closure), and the refuted versions were excluded from the fix list while the corrected forms were kept.

*Round-3 record. All findings above are applied in spec v0.5, which is the subject of round 4.*
