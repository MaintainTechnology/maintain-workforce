# Build Scorecard — Maintain Workforce MVP

> Historical review notes, not the current completion verdict. See
> [Build verification — 31 August 2026](BUILD-VERIFICATION-2026-08-31.md) for current
> evidence, review gates and unexecuted launch checks. The historical numeric rubric
> and plateau rule below are not being used to declare this build complete.

The rubric below was written **before** the round-2 independent review reported,
so the criteria could not be shaped to flatter the build. Scores are appended
per round as they land.

Judged artefact: the implementation in this repo, against
`specs/maintain-workforce-mvp.md` (v0.7, certified 9.0/10). The spec is the
contract; nothing outside it earns or loses points.

## Rubric (0–100)

### A. Spec conformance — 40 points
The proportion of spec clauses (modules 0–24, state machines, executor table)
that an independent reviewer confirms implemented as written. Scored as
`40 × (confirmed-pass clauses / all reviewed clauses)`, using the review
workflow's slice reports. A clause implemented but buggy counts as failed. A
clause the reviewer marks NEEDS_SPEC_CLARIFICATION counts half.

### B. The three legal guardrails — 15 points
All-or-mostly-nothing by design, because these are legal exposure, not polish:
- 5 pts — supplier owns its rate end to end (5.2/5.3/9.7/16.1), fee is config.
- 5 pts — no individual named before Confirmed anywhere in any buyer- or
  admin-facing surface or query (11.3/12.2/12.4/12.5/16.1).
- 5 pts — facilitator-not-principal: payments recorded never processed (13.4),
  vocabulary lint (22.1) enforced and blocking.
A single confirmed leak in a category zeroes that category.

### C. Money and state-machine invariants — 15 points
- 5 pts — integer-cents arithmetic, round-half-up buyer rate, snapshot-copied
  (never re-read) rates and fee onto Match then Engagement.
- 5 pts — engagement/transfer/match state machines admit only the spec's
  transitions, each transactional and audited; the commercial trigger fires
  exactly as 13.2 says (including the Confirmed+Active same-transaction path).
- 5 pts — the 13.6 double-booking invariant is enforced in the database, not
  just in application code, and the 12.7 knockout cascade runs on every path
  the spec names (transfer, expiry, status change, competing engagement).

### D. Access control and privacy — 10 points
Deny-by-default RLS; per-party projections that structurally cannot leak the
other side's rate, fee split, or worker PII; service-role usage confined to
audited server actions behind the right auth gate; MFA/AAL2 on admin surfaces.
Scored down for each surface where a query could return over-scoped data even
if the UI happens not to render it.

### E. Verification honesty and pipeline — 10 points
- 5 pts — what is claimed proven is actually proven here: typecheck, eslint,
  vitest, vocab lint, production build all green and re-runnable; unit tests
  cover the DoD-named formulas.
- 5 pts — what is NOT proven is stated, not glossed: no live database in this
  environment, so migrations/RLS/E2E remain unexecuted claims. Points are LOST
  for overclaiming, not for the gap itself (the gap is environmental).

### F. Operability and launch readiness — 10 points
Deploy pipeline as config (CI running the blocking gates, migration actor
named), cron wired with auth, seed/runbook scripts (catalogue loader,
admin-grant) idempotent and audited, .env.example complete, concierge path
(16.1) operable so Maintain can run Phase 1 without self-serve.

**Deductions** (applied after category scoring): −2 per confirmed regression
introduced by a fix round; −5 for any invented/unverifiable claim found in my
own reporting.

**Plateau rule**: iteration stops when a round improves the total by <3 points,
per the user's "real margin" instruction.

## Score trajectory

| Round | Event | Score |
|-------|-------|-------|
| 0 | First full build, before independent review | — (not scored; review found 22 real failures, so a self-score then would have been fiction) |
| 1 | After fixing all 22 confirmed failures; pipeline green | pending round-2 review |

Scores land here as each review round reports.
