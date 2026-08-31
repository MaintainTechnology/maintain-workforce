# LLM Council Certification — Maintain Workforce MVP Spec v0.6 → v0.7

| | |
|---|---|
| Subject | specs/maintain-workforce-mvp.md, version 0.6 (round 5); residuals applied as v0.7 |
| Rating | **9.0 / 10 — unanimous** (all five members: 9.0, 9.0, 9.0, 9.0, 9.0) |
| Verdict | **Build-ready and certified.** Target band 9.0–10 reached |
| Trajectory | 4.8 → 5.5 → 7.5 → 8.5 → 8.8 → **9.0** |
| Method | Five blind members (pragmatist, red-team, domain-rigor, first-principles, generalist), five blind reviewers verifying every claim against the spec text, Chairman synthesis |
| Aggregate ranking | Rigorist first with all five reviewers; then Red-team ≈ Pragmatist, Generalist, First-principles |
| Date | 25 August 2026 |

## Verdict

All five members independently arrived at 9.0 and all five reviewers confirmed that every one of the eight round-4 fixes is genuinely present in the text, with no fabricated fidelity claims in any response. The red-teamer, tasked with breaking the document, reported it could not break anything that produces a wrong match, engagement, or dollar. Guardrails were re-verified end to end on every surface including the concierge, knockout, and intersection-window paths. Production readiness was judged shippable from the document alone.

The council was explicit that **nothing structural remains**: the residual list was one display-class seam, a handful of one-line definitional gaps, and one confidentiality posture that needed stating rather than fixing. One member's closing recommendation was "do not add more; the document is at the point where further rounds cost more than they remove."

## Verified residuals (all applied in v0.7)

| # | Finding | Fix in v0.7 |
|---|---|---|
| 1 | 9.4 said "two capacity lines" without the defined "open" qualifier, so Withdrawn/Expired lines retained memberships that could block re-listing | 9.4 now reads "two **open** capacity lines (9.5)"; historical rows explicitly never block |
| 2 | 21.2's "0% is excluded" had no matching 11.1 bullet for partial coverage fully consumed | 11.1's Excluded criterion restated as "availability % = 0 per 21.2", covering the mixed corner |
| 3 | 21.2 unioned only *open* lines, so a Fully Committed line dropped out and flipped a worker to Excluded, contradicting 9.5's trump sentence | 21.2's union now spans Open, Partially Committed **and** Fully Committed lines; consumption is subtracted, not the line |
| 4 | 13.2's late trigger "promotes directly to Active" contradicted "reachable only from Confirmed" | Now: Confirmed and Active recorded in one transaction, two audit events — Active never reached without passing Confirmed |
| 5 | 14.2's "Upcoming" was undefined vocabulary | Defined as a filter (Confirmed with a future start date), not a status |
| 6 | 15.2's exhaustive matrix left the recipient of a system-caused auto-Decline undefined | Split into party-decline and knockout auto-Decline rows with named recipients |
| 7 | 12.7's trigger list omitted document expiry and worker/company status changes | Full trigger list enumerated inline |
| 8 | 10.3's edit lock keyed only on open matches, so quantity could be set below quantity_filled | Quantity may never go below quantity_filled, independently of matches; lock extended to all matchable fields |
| 9 | 8.3 mandated QLD-holiday-aware business days with no data source | Seeded PublicHoliday table, loaded with the catalogue, admin-maintainable, no library dependency |
| 10 | 17.1's fee-secrecy rationale was defeated by dual-role same-trade companies | Rewritten as a stated accepted limit: fee_bp is not a market secret; the protected object is the per-deal counterparty supplier rate |
| 11 | 9.5's edit lock listed only window/workers/rate | Extended to every matchable field; automatic expiry explicitly never blocked (line and match expire together) |
| 12 | 8.3's no-current-employer path conflicted with 15.2's "both companies" wording | Edge case states notifications go to the requester and Maintain only |

## Council notes

- **Where they agreed:** all eight round-4 fixes verified present; guardrails intact everywhere; production readiness sufficient; no structural work left. Every member's rating was judged by the reviewers to be supported by that member's own verified evidence.
- **The disagreement worth recording:** whether the 0% display-class seam was countable at all. Three members held it harmless (12.2's nomination guard makes a wrong match impossible), two held that a literal contradiction counts regardless of blast radius. v0.7 removes the argument by fixing it.
- **Reviewer-refuted claims excluded from the fix list:** one member's assertion that a suspended *company* needs a knockout trigger (3.2 already withdraws its open matches — withdrawal, not knockout, is the designed behaviour), and three soft "everything closes" certifications that the verified 0% corner falsified.

## What this certifies

Spec v0.7 is a build-ready specification: 24 numbered requirement modules whose items are individually testable, canonical state machines with a named executor for every automatic transition, money rules specified to the cent with formulas, an RLS and per-party projection model, an exhaustive notification catalogue, an executable definition of done (Playwright starred flows, named vitest cases, RLS proofs, a vocabulary lint in the pipeline), a production runbook with an ordered launch checklist, and ten genuinely open business questions delegated with stated defaults and named owners — none of which block the build.

*Certification round complete. Further council rounds are not recommended; the loop has converged.*
