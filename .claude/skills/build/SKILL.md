---
name: build
description: >-
  Implement exactly what a written spec describes — no more. Use this whenever
  the user wants to build, implement, or execute a feature that has already been
  spec'd out (typically specs/<name>.md from the /spec skill). Triggers include
  "/build", "build the spec", "implement specs/auth.md", "build what we
  planned/spec'd", or any request to turn an existing written spec into working
  code. The skill reads the spec, builds strictly to it — no added features, no
  unrelated refactors, no invented requirements — asks instead of guessing when
  the spec is ambiguous, and finishes with a coverage report mapping each spec
  requirement to how it was met so a review step can check the work. If no spec
  exists yet, it points the user to write one first rather than inventing scope.
---

# Build

Implement a written spec faithfully. The spec is the contract: your job is to
make the code match it exactly — not to improve on it, extend it, or reinterpret
it. A build that does more (or less) than the spec can't be cleanly reviewed
against the spec, and quietly ships scope and risk nobody asked for.

## Core principle: build exactly the spec, nothing more

Three things to hold the line on, and why each matters:

- **No added features.** If it isn't in the spec, don't build it. Extra
  functionality is unrequested scope — it adds surface area, risk, and
  maintenance the user never agreed to, and it makes the build impossible to
  check against the spec.
- **No unrelated refactors.** Don't restructure, rename, or "clean up" code that
  isn't required to satisfy the spec. Touch only what the spec needs. Unrelated
  churn hides the real change and breaks review.
- **No invented requirements.** If the spec doesn't say it, you don't get to
  decide it. When something is unclear or missing, ask — don't fill the gap with
  a guess and build on top of it.

When you notice a genuine improvement that's outside the spec, don't implement
it. Write it down for the suggestions list at the end so the user can decide
whether to spec it later.

## Step 1: Locate and read the spec

- If the user named a spec (`/build user-auth`), read `specs/user-auth.md`.
- If no name was given: if exactly one spec exists in `specs/`, use it; if
  several exist, list them and ask which one; if none exist, stop and tell the
  user to write one first (the `/spec` skill) — do not invent a spec to build
  from.
- Read the **entire** spec before writing any code. Map its sections to how they
  bound your work:
  - **Requirements** + **Definition of done** = the scope. Build all of it, and
    only it.
  - **Constraints** = how you're allowed to build (stack, platform,
    integrations, performance budgets). Stay inside them.
  - **Edge cases** = behaviors you must implement, not optional polish.
  - **Non-goals** = explicitly forbidden scope. Do not build these.
  - **Open questions** = unresolved decisions that must be answered before they
    block you.

## Step 2: Resolve ambiguity before building

If a requirement is unclear, contradictory, under-specified, or depends on an
unanswered Open question, **ask the user** before building that part. Inventing
an answer is how a build silently drifts from what was intended and becomes
un-reviewable. A short, specific question now is cheaper than rework later.

Also raise it (don't work around it silently) if a constraint makes a
requirement impossible, or if two requirements conflict. The fix is to update
the spec, not to freelance a resolution in code.

## Step 3: Build to the spec

- Implement each requirement and the listed edge cases. Respect the constraints
  and the non-goals.
- When adding to an existing codebase, match its conventions, naming, and
  patterns so the change reads as native — but matching style is not license to
  refactor unrelated code.
- Keep the change scoped to what the spec needs. If you find yourself editing
  files unrelated to the spec, stop and reconsider.
- **Verify your work.** If the project has a build and/or test command, run it to
  confirm the implementation actually satisfies the requirements and the
  definition of done. Report results honestly — if something fails or is only
  partially working, say so plainly rather than claiming completion.

## Step 4: Report coverage (for the review step)

Finish with a coverage report that maps each spec item to how it was satisfied,
so a reviewer (or a `/review` step) can check the build against the spec without
having to reverse-engineer what you did. Use this structure:

```markdown
## Build coverage — specs/<name>.md

### Requirements
- [x] R1: <requirement text> — <how/where it's met: file:line or short note>
- [x] R2: <requirement text> — <how/where>
- [ ] R3: <requirement text> — NOT done: <reason / blocked on / needs decision>

### Definition of done
- [x] <done item> — <evidence: passing test, observed behavior, metric>
- [ ] <done item> — <status>

### Edge cases
- [x] <case> → <expected behavior> — handled in <where>

### Verification
- build: <pass/fail + detail>
- tests: <pass/fail + counts>

### Out of scope (intentionally NOT built)
- Non-goals respected.
- Improvements noticed but not implemented (suggestions only): <list, or "none">
```

Rules for the report:

- **Reference the spec's own numbering/wording** so each line is traceable back
  to the spec. A reviewer should be able to read the spec and your report
  side by side and tick each item off.
- **Be honest about gaps.** Anything not done, partially done, or deferred goes
  in the report with a reason — don't quietly drop a requirement.
- **Flag anything the spec left unresolved** that affected the build.

## After the report

Do not start adding extra features or polishing beyond the spec. If the user
wants more, that's a change to the spec first (`/spec`), then another `/build`.
