# Coverage Report Template

Reference for Phase 5 of the build skill. Produce this report after building, so the review step can check the implementation against the spec. Be honest: report only what was actually implemented and verified. Mark anything incomplete or unverified as such — never inflate status.

Status values:
- **Covered** — fully implemented and verified.
- **Partial** — started but incomplete, or implemented but not fully verified (say why).
- **Not done** — not implemented (say why — e.g. blocked, ambiguous, deferred by the user).

---

```markdown
# Build Coverage — <Spec Name>

- **Spec:** specs/<name>.md
- **Date:** <YYYY-MM-DD>
- **Result:** <e.g. "All 7 functional + 2 non-functional requirements covered; DoD passing.">

## Functional requirements

| ID | Requirement (short) | Status | Where (files) | How verified |
|----|---------------------|--------|---------------|--------------|
| R1 | <short restatement> | Covered | path/to/file.ts:120 | <e.g. "unit test X", "manual: uploaded sample.pdf"> |
| R2 | ... | Partial | ... | <what's left> |
| ... | | | | |

## Non-functional requirements

| ID | Requirement (short) | Status | Where / How verified |
|----|---------------------|--------|----------------------|
| N1 | <e.g. "p95 < 2s"> | Covered | <measurement / evidence> |
| ... | | | |

## Edge cases & failure handling

| Edge case (from spec §6) | Status | Where / behavior implemented |
|--------------------------|--------|------------------------------|
| <invalid input> | Covered | <file + what it does> |
| <external timeout> | Covered | ... |
| ... | | |

## Definition of Done

(Reproduce the spec's Definition-of-Done checklist; check each item only if actually met and verified.)

- [x] <DoD item 1> — <evidence>
- [ ] <DoD item 2> — <why not met, if applicable>
- ...

## Scope confirmation

- **Out-of-scope items NOT built (as required):** <list the spec's out-of-scope items, confirming none were implemented.>
- **No unrelated refactoring or invented requirements were introduced.**

## Open questions, deviations & follow-ups

(Anything the reviewer should know: ambiguities raised during the build, intentional deviations and why, or work deferred. If none, write "None.")
- ...

## Files changed

- <path/to/file> — <one-line description of the change>
- ...
```
