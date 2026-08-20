---
name: polish-prompt
description: Polish, correct grammar, and restructure a draft prompt so an LLM follows it more accurately. Use this skill whenever the user pastes a prompt and asks to "polish", "improve", "fix", "clean up", "tighten", "sharpen", or "rewrite" it — or types /polish-prompt. Also use when the user is drafting a system prompt, agent instruction, or any LLM-facing prompt and wants it more precise. Don't wait for the exact word "polish" — trigger on any request to make a prompt clearer, more unambiguous, or more LLM-friendly.
---

# Polish Prompt

Take a draft prompt and return a polished version that an LLM will follow more reliably. Always finish with 2-4 brief notes on the most impactful changes so the user learns the pattern.

## How to decide the polish level

The right amount of structure depends on the prompt's size and purpose. Don't apply a heavy template to a one-line chat message, and don't return a tightened one-liner when the user handed you a 500-word system prompt.

Use these thresholds as a starting point, then trust your judgment:

- **Light polish** — under ~80 words, single ask, conversational tone, looks like something typed into a chat. Preserve voice. Fix grammar, remove filler ("please", "kindly", "could you"), replace vague qualifiers with concrete criteria, make the ask unambiguous. Output is a tightened one-paragraph rewrite.
- **Structured polish** — over ~150 words, multiple asks, has the shape of a system prompt or agent instruction. Rebuild into explicit sections: Role, Context, Task, Constraints, Output Format, and Examples (if useful). Section headers make the model's job easier on long prompts because each instruction has a clear anchor.
- **Judgment zone** — 80–150 words. Lean structured if the prompt has multiple distinct sub-asks or specific output-shape requirements; lean light if it's mostly one coherent ask.

When the prompt is right on the edge, just pick one and proceed — don't pepper the user with meta-questions. Only ask if the user's intent is genuinely unclear (see Edge cases below).

## What makes a prompt good for an LLM

These are the levers to pull when polishing. Not every prompt needs all of them — apply the ones that fix the actual weakness.

1. **Explicit role and task.** A model performs better when it knows who it's playing and what the deliverable is. "You are X. Your task is Y." beats an unstated assumption.
2. **Concrete criteria over vague qualifiers.** "Good" / "nice" / "appropriate" / "thorough" are unanchored. Replace with measurable criteria: "Each bullet must cite a specific line number" beats "be thorough".
3. **Explicit output format.** Models hallucinate format when not told. Specify the shape: JSON schema, markdown headers, plain prose, length, presence or absence of code fences.
4. **Constraints stated as constraints.** What NOT to do is as important as what to do. "Do not invent functions that don't exist in the codebase" prevents a common failure mode.
5. **Examples when the format is non-obvious.** One worked input/output example beats two paragraphs of description.
6. **Imperative voice, no filler.** "Extract X" beats "Could you please try to extract X for me?" Politeness tokens cost attention and add nothing.
7. **Number ordered steps.** When there are multiple sub-tasks, an explicit list beats prose. The model can check off each one.
8. **State the *why* for judgment calls.** "Use a barrier here because we need to dedup across all results" lets the model handle edge cases the rule didn't anticipate.
9. **Anchor ambiguous terms once.** If "user" could mean end-user or developer, define it up front.
10. **Tell the model how to handle missing info.** "If the file path is not provided, ask before proceeding" beats silent guessing.

## Light polish — output format

When applying light polish, return exactly this shape:

```
**Polished:**

<the rewritten prompt as a single tight paragraph, ready to copy>

**Changes:**
- <change 1: what + why>
- <change 2: what + why>
- <change 3: what + why, optional>
```

Keep the polished prompt as one block of prose. No section headers in the polished output itself — those would feel heavy on a chat-scale prompt.

### Example: light polish

**Input prompt being polished:**

> hey can u look at my code below and tell me if its good or if there are any issues or anything i should change or fix

**Returned output:**

```
**Polished:**

Review the code below. Identify any bugs, design issues, or violations of the project's conventions. For each finding, quote the relevant lines and explain the problem and the fix.

**Changes:**
- Replaced "if it's good" with concrete criteria (bugs, design issues, convention violations) so the model knows what to look for.
- Specified output format (quote lines, explain problem + fix) so findings are actionable.
- Removed filler ("hey", "can u", "or anything") that didn't carry meaning.
```

## Structured polish — output format

When applying structured polish, return exactly this shape:

```
**Polished:**

## Role
<who the model is>

## Context
<background it needs — facts, environment, prior state>

## Task
<the deliverable, stated as an imperative>

## Constraints
- <constraint 1>
- <constraint 2>

## Output Format
<exact shape of the response — schema, sections, length, presence of code blocks>

## Examples (optional)
<one input → output example if the format is non-obvious>

**Changes:**
- <change 1: what + why>
- <change 2: what + why>
- <change 3: what + why>
- <change 4: what + why, optional>
```

Omit any section that genuinely doesn't apply (e.g. no Examples needed for a simple task). Don't pad — empty sections train the model to ignore section headers.

### Example: structured polish

**Input prompt being polished:**

> You're a customer service AI for a SaaS company. Help users with their questions. Be friendly and professional. When they ask about pricing tell them about our plans. Don't give refunds without checking with a manager. Try to be helpful and answer questions about features. If they're angry try to calm them down.

**Returned output:**

```
**Polished:**

## Role
You are a customer-support agent for [Company Name], a B2B SaaS product. You speak in a calm, professional, solution-oriented tone.

## Context
Users contacting you may be evaluating the product, troubleshooting an issue, asking about pricing, or escalating a complaint. You have read-only access to the user's account metadata and the public pricing page.

## Task
Resolve the user's request in as few turns as possible. If you cannot resolve it, hand off to a human agent with a clear summary.

## Constraints
- Never issue, promise, or imply a refund. Refunds require manager approval — escalate refund requests with a "refund_request" handoff.
- Do not invent features, prices, or SLAs. If a fact is not in the pricing page or account metadata, say "let me check with the team" and create a follow-up ticket.
- For frustrated users, acknowledge the impact first, then move to resolution. Do not lecture about tone.

## Output Format
- One paragraph addressing the user's request.
- If escalating, end with: `[HANDOFF: <reason>]`
- If creating a follow-up ticket, end with: `[TICKET: <one-line summary>]`

**Changes:**
- Split Role, Constraints, and Output Format into anchored sections — long prompts lose precision when everything is one paragraph.
- Replaced "don't give refunds without checking with a manager" with an explicit escalation token (`[HANDOFF: ...]`) so the behavior is machine-checkable.
- Replaced vague "be helpful" / "try to calm them down" with concrete behaviors (acknowledge impact first, escalate refunds, don't invent facts).
- Added a "do not invent features or prices" constraint — this is the most common failure mode for support bots grounded only in marketing copy.
```

## Edge cases

- **The original prompt is already good.** Say so. Hand back a near-identical version and note "minimal changes needed — the original was already specific and unambiguous". Don't manufacture changes to look productive.
- **The prompt is ambiguous about the goal.** Don't guess what the user wants the LLM to do. Ask one clarifying question, then polish.
- **The prompt mixes a system prompt and example user input.** Polish the system-prompt portion. Quote the example untouched so the user can see what changed and what didn't.
- **The prompt is in another language.** Polish in the same language. Don't translate.
- **The prompt contains specific terminology, names, jargon, or formatting the user clearly wants kept.** Preserve them exactly. The user knows their domain better than you.
- **The prompt is a chained / multi-shot prompt (system + user + assistant turns).** Polish each role's text in place, keeping the conversation shape intact.

## What to never do

- Don't add screaming ALWAYS / NEVER / MUST. They feel oppressive without explaining why, and modern LLMs respond better to stated reasoning than to volume.
- Don't add filler like "I hope this helps!" to the polished prompt — the polished prompt is for an LLM, not a human.
- Don't rewrite the prompt to be longer than necessary. A polished prompt is often shorter than the original; verbosity is not a quality signal.
- Don't change the user's intent. Polish the wording; preserve the goal.
- Don't quote the original prompt back in the output. The user already has it. The polished version is the deliverable.
