# Interview Guide

Reference for Phase 1 of the spec skill. The goal of the interview is to leave **no ambiguity** about what is being built, why, what counts as a must-have, what limits apply, what can go wrong, and how to tell when it is finished.

## Interview principles

- **One question per turn.** Always. Wait for the answer before the next question.
- **Lead with the biggest unknown.** At each step, ask the question whose answer most reduces uncertainty — not the next item in a fixed list.
- **Make the abstract concrete.** Turn vague answers into specifics: "fast" → a number; "users" → which users, doing what; "secure" → against whom, protecting what.
- **Separate must-have from nice-to-have.** Explicitly ask which requirements are essential for the first version and which are optional. The spec's requirements section captures must-haves; nice-to-haves go under scope or open questions.
- **Hunt for edge cases the user didn't mention.** Empty inputs, huge inputs, concurrent actions, permission/auth failures, network/timeout failures, missing data, duplicate submissions. Users rarely volunteer these — ask.
- **Surface assumptions and confirm them.** State what is being assumed and ask if it holds, rather than silently deciding.
- **Don't drift into design/implementation.** Capture *what* and *why*, not *how to code it*. If the user proposes a technical approach, record it as a constraint or preference, but keep interviewing about requirements.

## Dimensions to cover (and example questions)

Cover all of these before ending the interview. Adapt wording to the project.

### 1. Objective — the why
- "In one sentence, what problem does this solve, and for whom?"
- "What can't be done today that this will make possible?"
- "What does success look like a month after this ships?"

### 2. Users & context
- "Who uses this, and in what situation?"
- "Where does it live — web app, mobile, CLI, API, internal tool, a part of an existing system?"
- "Does it touch any existing feature, data, or service in this codebase?"

### 3. Must-have requirements (vs nice-to-have)
- "Walk me through the core flow — what does the user do, step by step?"
- "Which of those are essential for the first version, and which are nice-to-have?"
- "What's the input, and what's the expected output?"
- "Are there specific rules or logic it must follow?"

### 4. Constraints & assumptions
- "Any required tech, framework, library, or API it must use or avoid?"
- "Any performance, scale, cost, security, privacy, or compliance limits?"
- "Any deadline, or dependencies on other work or people?"
- "What are we assuming is already in place?"

### 5. Edge cases & failure modes
- "What should happen on invalid or empty input?"
- "What about very large input, or many requests at once?"
- "What happens when an external call fails or times out?"
- "Who is allowed to do this — and what happens when someone who isn't tries?"
- "Are there states where the action should be blocked or undone?"

### 6. Definition of done
- "How would you verify this is correct — what would you click, run, or check?"
- "What's the smallest demo that would convince you it works?"
- "Are there tests, metrics, or acceptance criteria it must pass?"
- "What's explicitly out of scope for this version?"

## Readiness checklist (the gate)

Do not move to Phase 2 until every box can be checked. If any is unclear, ask the next question about it.

- [ ] **Objective** is stated clearly: the problem, the goal, and who it's for.
- [ ] **Scope** is bounded: what's in, and what's explicitly out.
- [ ] **Must-have requirements** are enumerated, specific, and separated from nice-to-haves.
- [ ] **Inputs and outputs** are defined.
- [ ] **Constraints** (tech, performance, security, deadline, dependencies) are captured.
- [ ] **Assumptions** are stated and confirmed.
- [ ] **Edge cases and failure modes** are identified, including invalid input, scale, external failures, and auth/permission failures.
- [ ] **Definition of done** is concrete and verifiable — a person could check the build against it.

When all are checked, summarize and confirm (Phase 2), then write the spec (Phase 3).
