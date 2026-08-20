---
name: prompt-polisher
description: Use when the user submits a prompt that could benefit from grammar correction, clarity improvement, or better structure for LLM comprehension. Triggers on vague, run-on, ambiguous, or poorly structured requests.
---

# Prompt Polisher

Rewrite the user's raw input into a clear, well-structured prompt that preserves their intent while maximizing Claude's ability to deliver the right result.

## When to Use

- User's message has grammar errors, typos, or awkward phrasing
- Request is vague, ambiguous, or missing critical context
- Multiple instructions are tangled into one run-on sentence
- Intent is unclear or could be interpreted multiple ways
- Message lacks specificity about desired output format, scope, or constraints

## When NOT to Use

- User's prompt is already clear, specific, and well-structured
- User is having a casual conversation (greetings, small talk)
- User explicitly says "don't rewrite" or "use my exact words"
- The message is a single-word command or slash command

## Core Process

### Step 1: Identify the User's Intent

Read the raw prompt and extract:
1. **Primary goal** — What do they actually want done?
2. **Implicit context** — What are they assuming you know?
3. **Constraints** — Any limits on format, scope, tools, or approach?
4. **Success criteria** — How would they judge a good response?

### Step 2: Rewrite Using the CLEAR Framework

| Element | Description | Example |
|---------|-------------|---------|
| **C**ontext | Set the scene — who, what, where | "In this Next.js 14 project..." |
| **L**ead action | Single clear verb for the primary task | "Refactor the authentication middleware to..." |
| **E**xpectations | Define output format and quality | "Return the updated file with inline comments explaining changes" |
| **A**ssumptions | State what you're assuming so Claude can correct | "Assuming we want to keep backward compatibility..." |
| **R**estraints | Boundaries — what NOT to do, limits | "Do not modify the database schema or existing tests" |

### Step 3: Apply Prompt Engineering Best Practices

1. **Be specific over general** — Replace "make it better" with "reduce response time by caching the API call result"
2. **One task per sentence** — Break compound requests into numbered steps
3. **Use imperative mood** — "Create..." not "Could you maybe create..."
4. **Specify output format** — Code block, bullet list, table, prose
5. **Include examples when helpful** — "For example, convert `getData()` to `fetchUserProfile()`"
6. **Front-load the key action** — Put the most important instruction first
7. **Eliminate filler** — Remove "please", "I think", "maybe", "kind of", hedging language
8. **Use structured markup** — Numbered lists for sequences, bullets for options, headers for sections

### Step 4: Present to User

Output the polished prompt in a clearly marked block:

```
**Polished prompt:**

[The rewritten prompt here]
```

Then briefly note what changed:
- Grammar/spelling fixes
- Clarified ambiguous intent
- Added missing context or constraints
- Restructured for clarity

## Quick Reference: Common Rewrites

| Raw Pattern | Polished Pattern |
|-------------|-----------------|
| "fix the bug" | "Debug and fix [specific symptom] in [file/component]. The expected behavior is [X] but currently [Y] happens." |
| "make it look better" | "Improve the visual design of [component]: [specific issues like spacing, alignment, color contrast]." |
| "add a feature" | "Implement [feature name] that [does what] in [where]. Requirements: [1, 2, 3]. Constraints: [limits]." |
| "it doesn't work" | "Diagnose why [specific action] produces [error/wrong result] instead of [expected result]. Relevant files: [paths]." |
| "clean up the code" | "Refactor [file/module] to [specific goal: reduce duplication / improve readability / extract shared logic]. Do not change external behavior." |
| "help me with X" | "[Specific action verb] X. Context: [relevant details]. Output: [desired format]." |

## Example

**Raw user input:**
> can you like change the homepage so it looks more professional and also maybe add some animations and fix the mobile thing where the nav is broken

**Polished prompt:**
> Improve the homepage (`src/pages/index.tsx`) with three changes:
>
> 1. **Professional styling** — Update typography, spacing, and color palette to match a modern SaaS landing page aesthetic
> 2. **Animations** — Add subtle entrance animations (fade-in, slide-up) to hero section and feature cards using CSS transitions or Framer Motion
> 3. **Fix mobile navigation** — Debug and fix the broken nav menu on mobile viewport (hamburger menu not opening or links not visible)
>
> Prioritize the mobile nav fix first since it's a bug. For styling changes, keep existing content and layout structure intact.

**What changed:** Broke compound request into numbered priorities, specified files and technologies, clarified "mobile thing" into actionable bug description, set implementation order.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Over-polishing casual requests | If intent is obvious, light touch only — fix grammar, keep it short |
| Adding assumptions the user didn't imply | Only surface assumptions when the original is genuinely ambiguous |
| Making the prompt longer than necessary | Concise > comprehensive. Remove anything that doesn't add clarity |
| Changing the user's actual intent | Preserve what they want. Clarify HOW they said it, not WHAT they asked for |
| Being overly formal | Match the user's tone. Technical users want direct prompts, not essays |
