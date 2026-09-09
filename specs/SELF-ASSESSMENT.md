# Self-Assessment — Maintain Workforce Spec Build

> Historical assessment of spec v0.7, not implementation or deployment certification.
> Use [the current MVP](maintain-workforce-mvp.md) and [latest alignment report](MVP-ALIGNMENT-2026-09-09.md)
> for the current contract and focused build evidence.

My own rubric, written before scoring, applied to the delivered work (spec v0.7 plus the evaluation record). Separate from the LLM Council's build-readiness rating; this scores the whole deliverable, including the process and the documents around the spec.

## The rubric

| # | Dimension | Weight | What a 10 looks like |
|---|---|---|---|
| 1 | Requirement precision | 20% | Every requirement numbered, individually testable; two builders produce the same behaviour; no undefined terms used as tests |
| 2 | Internal consistency | 20% | No contradiction between any two statements; status sets explicit; cross-references resolve; the document satisfies the standards it declares for itself |
| 3 | Fidelity to the planning record | 15% | Every confirmed decision honoured or explicitly superseded in writing; contradictions between source documents surfaced, not silently resolved; legal guardrails hold on every surface |
| 4 | Decision completeness | 15% | Every decision that determines the system is decided, or delegated with a stated default, named owner, and a non-blocking claim that holds |
| 5 | Build and deploy executability | 15% | Stack pinned; migrations, RLS, seed, cron, rollback, launch checklist all specified; a definition of done that is machine-checkable, not aspirational |
| 6 | Scope discipline | 10% | Non-goals explicit and respected; no speculative future-proofing; no requirement that exists only to satisfy a reviewer |
| 7 | Process integrity | 5% | Claims verified rather than asserted; refuted findings excluded; the rating earned by adversarial review rather than self-declared |

## Score: v0.7 — 9.2 / 10

| Dimension | Score | Note |
|---|---|---|
| Requirement precision | 9.5 | 24 modules, every item testable; defined terms ("committing status", "open match", "open line") used consistently |
| Internal consistency | 9.0 | Five rounds of adversarial cross-referencing; the last twelve contradictions fixed in v0.7. Held below 9.5 because a document this size cannot be proven contradiction-free by inspection |
| Fidelity to the planning record | 9.5 | The four reversed positions (rate ownership, worker nomination, fee hardcoding, pricing unit) restored to the confirmed record; guardrails verified by five independent adversaries |
| Decision completeness | 9.5 | Ten open questions, each with default, owner, and a verified non-blocking claim |
| Build and deploy executability | 9.0 | Runbook-grade; loses half a point because no one has actually run the pipeline — the launch checklist is specified, not exercised |
| Scope discipline | 9.0 | Non-goals intact through five rounds of pressure to add; one member flagged reserved columns (6.7) as the only speculative content, and they are two nullable fields |
| Process integrity | 9.5 | Every finding verified against the text by a second panel; three false consistency certifications and two misread defects caught and excluded from the fix lists |

## The weakest parts, and why they cost points

1. **Unexercised deployment (−0.4 weighted).** The pipeline, launch checklist, and restore drill are written to runbook standard but have never been run. No document earns full marks on executability until a real deploy has walked it. This is not fixable by editing — only by building.
2. **Unprovable consistency at scale (−0.3).** Five adversarial rounds each found fewer contradictions than the last (18 critical → 12 → 8 → 12 residuals → 12 one-liners), which is strong evidence of convergence but not proof. A document of ~350 numbered statements has more cross-products than any panel can exhaust.
3. **Business decisions I cannot make (−0.2, and correctly so).** Fee percentage, beachhead trade, GST treatment, payment rail. Delegating them with defaults is the right answer; the spec is still less complete than one written after the founders decide.
4. **Verification depends on the same model family (−0.1).** Members and reviewers were independent instances with different lenses and blind peer review, which catches weak reasoning and one-angle answers — but not blind spots shared across the family. A cross-vendor round would test that; it was not run.

## Iteration history and why the loop stopped

| Version | Council rating | Findings fixed | Marginal gain |
|---|---|---|---|
| Brief v0.1 | 4.8 → 5.5 | — | baseline |
| v0.3 | 7.5 | 14 (R1–R14) | +2.0 |
| v0.4 | 8.5 | 10 (R1–R10) | +1.0 |
| v0.5 | 8.8 | 12 | +0.3 |
| v0.6 | **9.0** | 8 | +0.2 |
| v0.7 | — | 12 one-liners | below noise |

The gains decayed 2.0 → 1.0 → 0.3 → 0.2, and the round-5 findings were all one-line edits with no structural content — one member's explicit advice was that further rounds would cost more than they remove. That is the plateau: another round would likely return 9.0–9.5 with a similar list of cosmetic seams, and the remaining point is held by things editing cannot buy (an exercised deploy, founder decisions, a cross-vendor check).

**Stopping here is the correct call.** The next real improvement to this specification comes from building against it, not from reviewing it again.
