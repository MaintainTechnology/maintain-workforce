# Review Report Template

Reference for Phases 3–4 of the review skill. When the verdict is NEEDS WORK, write this report to `specs/<name>.review.md` so `/build` can consume the Required Fixes; also output it in the response. When the verdict is PASS, the report can be stated in the response without writing a file.

Be evidence-driven and specific. Every Fail must name the exact spec item and a concrete fix. Never report PASS unless every single requirement is verified.

Verdict values per item: **Pass** (verified), **Fail** (gap/bug/missing). There is no "partial pass" at the overall level — any non-Pass item makes the overall verdict NEEDS WORK.

---

```markdown
# Review — <Spec Name>

- **Spec:** specs/<name>.md
- **Date:** <YYYY-MM-DD>
- **Overall verdict:** <PASS | NEEDS WORK>
- **Summary:** <e.g. "6 of 7 functional requirements pass; R4 fails (no validation) and edge case §6 'timeout' is unhandled.">

## Requirement-by-requirement audit

### Functional requirements
| ID | Requirement (short) | Verdict | Evidence / reason |
|----|---------------------|---------|-------------------|
| R1 | <short restatement> | Pass | <what was checked: file:line, test run, observed behavior> |
| R2 | ... | Fail | <the exact gap/bug observed> |
| ... | | | |

### Non-functional requirements
| ID | Requirement (short) | Verdict | Evidence / reason |
|----|---------------------|---------|-------------------|
| N1 | <e.g. "p95 < 2s"> | Fail | <measured value / why unmet> |
| ... | | | |

### Edge cases & failure handling (spec §6)
| Edge case | Verdict | Evidence / reason |
|-----------|---------|-------------------|
| <invalid input> | Pass | <observed behavior> |
| <external timeout> | Fail | <not handled — what happens instead> |
| ... | | |

### Definition of Done (spec §7)
- [x] <DoD item> — <evidence>
- [ ] <DoD item> — <why unmet>
- ...

## Out-of-scope / fidelity findings
(Anything built that the spec did not call for: added features, unrelated refactoring, invented behavior. If none, write "None.")
- <finding> — <where> — <why it's out of scope>

## Required Fixes  (hand-off to /build)
(One entry per failure. Each names the spec ID it closes, the problem, and the specific fix. Ordered by priority. `/build` works this list.)

- [ ] **Fix for R2** — <problem in one line>. **Fix:** <what to change and where, e.g. "add empty-input guard in src/foo.ts handleSubmit(); return early with error message">. **Done when:** <observable condition that makes R2 pass>.
- [ ] **Fix for N1** — <problem>. **Fix:** <...>. **Done when:** <...>.
- [ ] **Fix for §6 'external timeout'** — <problem>. **Fix:** <...>. **Done when:** <...>.
- ...

## Re-review checklist
After /build addresses the fixes, re-run /review. The build passes only when every row above is Pass and every Required Fix is resolved.
```
