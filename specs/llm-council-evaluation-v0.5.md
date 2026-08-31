# LLM Council Evaluation — Maintain Workforce MVP Spec v0.5 (Round 4)

| | |
|---|---|
| Subject | specs/maintain-workforce-mvp.md, version 0.5 |
| Rating | 8.8 / 10 (members: 9.0, 9.0, 9.0, 8.5, 8.5) |
| Trajectory | 4.8 → 5.5 → 7.5 → 8.5 → 8.8 |
| Method | Same three-stage council: five blind members, five blind reviewers verifying every load-bearing claim against the text (rewarding honest clean bills and penalizing invented defects equally), Chairman synthesis |
| Aggregate ranking | Rigorist first with all five reviewers; then Pragmatist ≈ First-principles, Red-team, Generalist |
| Date | 25 August 2026 |

## Verdict

Build-ready, one editing pass short of certification. All twelve round-3 findings were verified genuinely fixed by all five members; the guardrails held on every surface including the new intersection-window, nomination-predicate, and concierge text; one member verified algebraically that no rounding divergence is possible in the money chain; and the red-teamer reported it could not break anything that matters. The 8.5 members and the 9.0 members agreed on the facts and split only on whether the residual list — a single wrong word in the executor table plus a handful of one-line seams — counts against the calibration's "internal contradictions count" rule.

## Verified residual findings (all fixed in v0.6)

1. The executor table's Match → Expired row still said "demand-line start date" while 12.1 and the state-machine row said end date — the one direct contradiction, sitting in the DoD-tested artifact → cell corrected to the end-date rule.
2. 15.2 (self-declared exhaustive) had no match-withdrawn row while 3.2 mandated "(parties notified)" → row added.
3. 3.2 used "active engagements", a lowercase status test → now "engagements in a committing status (13.0)".
4. The engagement's hours_per_week source was unbound (demand line vs capacity line differ legitimately) → the demand line's hours are snapshotted onto the match at proposal (11.3) and copied to the engagement (13.1); all estimates use that snapshot.
5. 10.1's "rounded up" attached ambiguously (weeks vs the derived hours) → replaced with the explicit formula: hours_per_week = ceil(total_hours ÷ (inclusive days ÷ 7)).
6. Demand-line withdrawal/edit with an open match was undefined (the capacity side was guarded, the demand side not) → mirrored: blocked until Maintain withdraws the match (10.3 + state table).
7. 21.2's "0% is excluded" had no matching entry in 11.1's Excluded enumeration → "every day of the demand window consumed by committing engagements" added to the Excluded class.
8. Smaller verified items, all fixed: the 7.3 admin override can now be recorded post-proposal (late greying never forces withdraw-and-re-propose); the 12.7 buyer re-notification gates on the in-app re-presentation, not email delivery (15.1 consistency); a match's requested quantity is defined (count of shortlisted candidates, capped by remaining); the lead-qualification path handles ABN collisions via the 1.2 review route.

## Council notes

- Every member's fidelity section certified the round-3 remediation complete, and the reviewers confirmed those certifications against the text — the loop's fixes are no longer introducing majors, only leaving one-word seams.
- The 9.0 members argued the two real defects were resolvable from inside the document (the wrong cell cites the clause that corrects it); the 8.5 members held that a contradiction inside the DoD-tested executor table falsifies the spec's own "nothing is left to implication" charter. The Chairman recorded 8.8 and ordered the v0.6 editing pass rather than adjudicating the half-point — the fix list was identical either way.
- One refuted claim excluded: "no display class covers the Expiring-Soon-clearing-window qualification" (11.1's Eligible class is an explicit catch-all; only the 7.3 wording needed the fix it received in v0.5).

*Round-4 record. All findings above are applied in spec v0.6, the subject of round 5 (certification).*
