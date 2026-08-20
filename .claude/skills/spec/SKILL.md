---
name: spec
description: >-
  Interview the user to produce a detailed, build-ready spec BEFORE any code is
  written. Use this whenever the user wants to plan, scope, or define what to
  build — triggers include "/spec", "spec this out", "write a spec", "help me
  plan this feature", "I want to build X", "figure out the requirements", or any
  case where the user is describing something they intend to build but hasn't
  pinned down the details yet. Trigger it even when the user doesn't say the word
  "spec" but is clearly trying to define a feature/app/tool before building it.
  The skill asks ONE focused question at a time to nail down the objective,
  must-have requirements, constraints, and definition of done, then writes the
  spec to specs/<name>.md. Do NOT use this for actually implementing or writing
  the code — its only job is to produce the spec.
---

# Spec

Turn a fuzzy idea into a precise, build-ready specification through a focused
interview. The output is a single markdown spec that someone (a person or an
agent) could build against without having to guess what was meant.

## The one rule: do not build

The deliverable is the spec — not code. While running this skill, do not write
implementation code, scaffold a project, create source files, or start the
build. The whole point is to think clearly about *what* to build before spending
effort on *how*. If the user starts pushing toward implementation mid-interview,
finish (or at least save) the spec first, then let them kick off the build as a
separate, explicit request.

## Run the interview one question at a time

Ask a single focused question, wait for the answer, then let that answer shape
the next question. Resist the urge to fire off a numbered list of ten questions
at once — batching overwhelms the user, produces shallow answers, and misses the
follow-ups that surface the real requirements. A real conversation, where each
question builds on the last, gets you a far better spec.

Guidelines for the interview:

- **Open with the big picture.** Something like: "What do you want to build, and
  who is it for?" Get the shape of the thing before drilling into details.
- **One question per turn.** Briefly acknowledge what you heard, then ask the
  next most useful thing. Keep your turns short — you're interviewing, not
  lecturing.
- **Let answers steer you.** Don't run a fixed script. Follow the thread the
  user opens; ask about what's actually unclear given what they just told you.
- **Never re-ask what you already know.** Pull from the conversation so far and
  from earlier answers.
- **Probe vague words.** "Fast", "secure", "simple", "scalable", "clean" mean
  nothing until they're concrete. Push for numbers, examples, or specific
  behaviors ("fast = results in under 200ms?", "secure = which threats matter?").
- **Surface contradictions.** If two answers conflict, name it and ask which
  wins.

### Cover these areas (weave them in naturally — don't read them as a checklist)

- **Objective** — the core problem, why it matters, and who has it.
- **Must-have requirements** — the things without which the build is a failure.
- **Scope boundaries** — what's explicitly NOT in this version (non-goals), and
  any nice-to-haves that can wait.
- **Constraints** — tech stack, platform, existing systems to integrate with,
  data sources, budget, timeline, team, compliance/privacy.
- **Edge cases & failure modes** — unusual inputs, limits, what happens when
  things go wrong, concurrency, empty/huge/malformed data.
- **Definition of done** — the concrete, checkable signals that tell you the
  build is finished and actually works.

## Know when you have enough

You have enough when you can clearly state, with no obvious gaps or
contradictions: the objective, the must-have requirements, the constraints, and
a checkable definition of done. Don't interrogate past the point of usefulness —
once the picture is solid, stop.

Then, before writing: play back a short summary of what you understood (a few
lines), and ask if anything is missing or wrong. Only write the spec once the
user confirms.

## Write the spec

1. Choose a short, kebab-case `<name>` derived from the feature (e.g.
   `user-auth`, `csv-importer`, `weekly-digest`). State the name you picked.
2. Save the spec to `specs/<name>.md` in the current project, creating the
   `specs/` directory if it doesn't exist.
3. Use the structure below. Every section earns its place — the four the user
   most needs (Objective, Requirements, Edge cases, Definition of done) are
   required; include the others when the interview produced real content for
   them, and omit a section rather than padding it.

```markdown
# <Feature name> — Spec

## Objective
What we're building and the problem it solves, in 2-4 sentences. Include who
it's for. Someone reading only this section should understand the point.

## Context / background
Relevant existing systems, prior decisions, or domain facts that shape the
build. (Omit if there's nothing material.)

## Requirements
The exact, must-have behaviors, as a numbered list. Each item specific and
testable enough that two different builders would produce the same thing.
1. ...
2. ...

## Non-goals
What is explicitly out of scope for this version, so no one builds it by
mistake.

## Constraints
Tech stack, platforms, integrations, data, performance budgets, timeline,
compliance — whatever bounds the solution.

## Edge cases to handle
Concrete scenarios plus the expected handling. Format each as
"situation → expected behavior".
- Empty input → ...
- Duplicate request → ...
- Upstream timeout → ...

## Definition of done
A checklist someone could verify the finished build against. Each item must be
objectively checkable (a behavior to observe, a test that passes, a metric to
measure) — not a vague aspiration.
- [ ] ...
- [ ] ...

## Open questions
Anything still unresolved that needs an answer before or during the build.
(Omit if none.)
```

Writing quality bar:

- **Requirements** are numbered, specific, and unambiguous. "The user can reset
  their password via an emailed link that expires in 1 hour" — not "good
  password handling".
- **Edge cases** pair a concrete scenario with the expected behavior, so the
  builder knows what "handled" means.
- **Definition of done** items are each independently checkable. If you can't
  describe how someone would verify an item, rewrite it until you can.

## After writing

Tell the user the exact path to the spec and give a one-line summary of what it
covers. Offer to refine any section. Do not begin building — if the user wants
to build, that's a new, explicit request.
