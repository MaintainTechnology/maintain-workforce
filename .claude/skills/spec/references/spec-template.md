# Spec Template

Reference for Phase 3 of the spec skill. Produce the spec file following this structure. Keep every requirement and done-criterion **specific and verifiable** — replace any vague phrase ("works well", "is fast", "handles errors") with a checkable statement.

Fill in every section. Omit a section only if it genuinely does not apply, and if so, say why in one line rather than leaving it blank. Delete the parenthetical guidance notes from the final output — they are instructions, not content.

---

```markdown
# <Feature/App Name>

> One-sentence summary of what this is.

- **Status:** Draft
- **Date:** <YYYY-MM-DD>
- **Author:** <from the interview / repo git user>

## 1. Objective

(The *why*. State the problem being solved, the goal, and who it is for. Two to four sentences. A reader should understand the point of this work without reading further.)

## 2. Background & context

(Optional but recommended. Where this lives — web/mobile/CLI/API/internal — and how it relates to existing features, data, or services. Note any prior art or related code in the repo.)

## 3. Scope

**In scope:**
- (What this build will do.)

**Out of scope:**
- (What this build will explicitly NOT do — deferred or nice-to-have items. This prevents scope creep and clarifies the definition of done.)

## 4. Requirements

(The *exact* requirements. Number them so they can be referenced. Each must be specific and testable. Mark must-haves; list nice-to-haves separately or under Open Questions.)

### Functional requirements
- **R1.** <requirement> — (e.g. "User can upload a PDF up to 25 MB via the dashboard.")
- **R2.** <requirement>
- ...

### Non-functional requirements
(Only those that genuinely apply: performance, security, privacy, accessibility, scale, cost, reliability. Give numbers where possible.)
- **N1.** <requirement> — (e.g. "p95 end-to-end response under 2s for a 10-page document.")
- ...

### Inputs & outputs
- **Inputs:** (shape, source, format, validation rules)
- **Outputs:** (shape, destination, format)

## 5. Constraints & assumptions

**Constraints:**
- (Required/forbidden tech, frameworks, APIs; deadlines; dependencies on other work or people; environment limits.)

**Assumptions:**
- (What is taken as already true or already in place. Each was confirmed during the interview.)

## 6. Edge cases & failure handling

(How the build must behave in non-happy-path situations. Each is a specific, testable expectation.)

- **Invalid input:** (e.g. "Reject non-PDF uploads with a 400 and a user-visible message.")
- **Empty / missing data:** ...
- **Scale / large input:** ...
- **Concurrency / duplicates:** ...
- **External failure / timeout:** (e.g. "If the extraction service times out after 30s, show a retry option and do not lose the upload.")
- **Auth / permissions:** (e.g. "A user without role X attempting this gets a 403 and is not shown the action.")
- (Add any others surfaced in the interview.)

## 7. Definition of Done

(A concrete, checkable list. Someone should be able to verify the build against this without further interpretation. Prefer observable behaviors and pass/fail checks over adjectives.)

- [ ] All must-have functional requirements (R1–Rn) are implemented and demonstrable.
- [ ] All non-functional requirements (N1–Nn) are met and measured.
- [ ] All edge cases in section 6 behave as specified.
- [ ] <Concrete acceptance check, e.g. "Uploading sample.pdf returns a report within 2s.">
- [ ] <Tests / metrics that must pass, if any.>
- [ ] <Anything else the user named as proof it works.>

## 8. Open questions

(Anything unresolved or deferred. If none, write "None.")
- ...
```
