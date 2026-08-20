---
name: review
description: >-
  Verify a build against its written spec, requirement by requirement. Use
  whenever the user wants to check, review, verify, QA, or sign off on an
  implementation against specs/<name>.md (typically right after the /build
  skill). Triggers include "/review", "review the build", "does this meet the
  spec", "check this against specs/auth.md", "verify the implementation", or any
  request to confirm that code matches what was specified. It goes through every
  requirement, definition-of-done item, edge case, constraint, and non-goal; for
  each gap, bug, or missing piece it names the exact spec item that fails and
  writes the specific fix needed, handed back so /build can address them. It
  passes the build ONLY when every requirement in the spec is fully met. It does
  not fix the code itself — its job is to assess and to specify the fixes.
---

# Review

Check a build against its spec and deliver a clear verdict: does the
implementation fully meet `specs/<name>.md`, or not? Review is the gate that
keeps the spec → build → review loop honest. Its value comes entirely from being
**independent and strict** — a review that rubber-stamps a build is worse than no
review, because it creates false confidence.

You are the reviewer, not the builder. Your job is to find every way the build
falls short of the spec and to specify exactly how to fix each one — not to fix
the code yourself. Handing precise, spec-anchored fixes back to `/build` keeps
the roles clean and the loop fast.

## Step 1: Locate the spec and the build

- If the user named a spec (`/review user-auth`), review against
  `specs/user-auth.md`.
- If no name was given: if exactly one spec exists in `specs/`, use it; if
  several exist, list them and ask which one; if none exist, stop — there's
  nothing to review against.
- Read the **entire** spec. It is the only standard you judge against. Note its
  Requirements, Definition of done, Edge cases, Constraints, and Non-goals.
- If `/build` left a coverage report, read it as a *map of what the builder
  intended* — but do not trust it. Verify every claim yourself against the actual
  code and behavior. The builder marking a box does not mean it's done.

## Step 2: Verify independently, item by item

Walk the spec and, for each item, actively confirm the build satisfies it —
don't assume. "Verify" means read the relevant code, and where it matters, run
the build and tests and observe real behavior. A requirement that is implemented
but **buggy** fails just as surely as one that is missing.

Check every category, because a build can fail the spec in any of them:

- **Requirements** — is each one fully and correctly implemented? Partial,
  broken, or approximate counts as a failure.
- **Definition of done** — is each checkable item actually true? Run the tests /
  observe the behavior the spec calls for.
- **Edge cases** — is each listed case handled as the spec describes? Try them.
- **Constraints** — did the build stay within the stack, platform, performance,
  and other limits the spec set?
- **Non-goals / scope creep** — did the build add anything the spec excludes or
  never asked for? Out-of-scope additions are a failure too: they ship
  unreviewed risk and drift from the contract.

For anything that fails, capture three things: the **exact spec item** it
violates, **what's wrong** (concretely — the gap, the bug, the missing piece),
and **the specific fix** that would make it pass.

## Step 3: Decide the verdict — pass only on a complete match

The build **PASSES only when every requirement, every definition-of-done item,
and every edge case in the spec is fully met, the constraints are respected, and
no non-goals were built.** Anything less is a **FAIL**. Resist the urge to pass a
build that's "basically there" — a lenient pass ships exactly the gaps this step
exists to catch, and defeats the purpose of the loop.

If a spec item is genuinely ambiguous (so you can't tell whether the build is
correct), don't silently pass or fail it — flag it as needing a spec
clarification, because the fix may belong in the spec, not the code.

## Step 4: Report, and hand fixes back to /build

Use this structure:

```markdown
## Review — specs/<name>.md
**Verdict: PASS** ✓   (or **FAIL** — N issues)

### Requirements
- R1: <text> — PASS — <evidence: file:line / test / observed behavior>
- R3: <text> — FAIL — <what's wrong, concretely>

### Definition of done
- <item> — PASS/FAIL — <evidence or gap>

### Edge cases
- <case> → <expected> — PASS/FAIL — <evidence or gap>

### Constraints
- <constraint> — respected? — <evidence>

### Non-goals / scope creep
- <anything built that's out of scope> — FAIL — <what to remove>, or "none — clean"

### Fixes for /build  (only when FAIL)
A consolidated, actionable list. Tag each fix with the spec item it resolves so
/build can address them directly and the next review can re-check them:
1. [R3] <specific change needed to satisfy R3>
2. [DoD: <item>] <specific change>
3. [Edge: <case>] <specific change>
4. [Scope] Remove <out-of-scope addition>
```

Make the fixes **specific and actionable** — name files/functions where you can,
and describe the change, not just the symptom ("R3 fails: passwords aren't
hashed — hash with bcrypt in `createUser()` before insert" beats "fix password
security"). The goal is that `/build` can act on the list without re-deriving
what you found.

## After the review

- On **FAIL**: hand the fix list back so `/build` can address the items, then
  `/review` again. Do not fix the code yourself — that's `/build`'s job, and
  keeping the roles separate is what keeps the review independent.
- On **PASS**: say so plainly and state that every spec item was verified met.
  Don't pad a passing build with optional improvements — those, if wanted, are a
  new spec, not a review finding.
