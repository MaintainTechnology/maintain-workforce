---
name: eod-report
description: Generate an end of day (EOD) work summary from the current chat session, covering ONLY work completed on today's date, as a clean categorized plain-text update. Use whenever the user asks for an EOD report, end of day update, daily recap, a writeup of "what I did today", or types /eod-report. Trigger on casual phrasings too ("eod", "daily update", "summarize today's work", "what got done today", "end of day summary"). It reviews the session's real changes (features built, bugs fixed, files edited, configs changed, deploys) plus today's git activity, filters strictly to the current date, and outputs a categorized report that uses no em dashes and no hyphen bullets.
---

# EOD Report

Produce a short, shareable end of day summary of what actually got done in the current session, limited to today. The point is something the user can paste into Slack or email in seconds, so it has to be tight, concrete, and skimmable.

## What counts

Report real, finished work, not discussion or plans. Good items: a feature built, a bug fixed, files created or edited, a config or model changed, something deployed, a script or skill made, a test that now passes. Skip anything that was only talked about, researched, or left half done. If something genuinely matters but is not finished, you may add a short "In Progress" section after Completed, but default to Completed only.

## Step 1: Lock onto today's date

Run `date "+%B %d, %Y"` to get today (for example "June 05, 2026"). Everything in the report must be from today. If the session clearly spans more than one day, drop anything from earlier days. When in doubt about whether something happened today, lean on the git timestamps in Step 2 rather than guessing.

## Step 2: Gather today's work from two sources

1. This chat session. Scan the conversation for concrete things that were completed today. Focus on outcomes and changes, not the back and forth that led there.
2. Git, if this is a repo, to ground the summary in real changes:
   - `git log --since="00:00" --until="now" --pretty=format:"%h %s"` for commits made today
   - `git status --short` and `git diff --stat` for uncommitted work done today
   Use these to confirm what really changed and to catch things the conversation glossed over. The narrative still comes from the session; git keeps it honest.

Merge both into one list of finished items. Collapse duplicates (one item per real accomplishment, even if it took several messages or commits).

## Step 3: Categorize

Group the items under clear category headers, usually by project, product, or area of the codebase (a repo name, a product, a feature area). Two to five categories is normal. Pick names a teammate would recognize. Order categories by where the bulk of the work went.

## Step 4: Write it in the format

Use this exact structure:

```
Subject: EOD Update <Month DD, YYYY>

Summary

<one short plain sentence about the day, or omit if the categories already say it>

Completed

<Category Name>

<one accomplishment per line>
<one accomplishment per line>

<Category Name>

<one accomplishment per line>
```

## Formatting rules

These exist because the user wants something that reads like a person wrote it quickly, not like an AI:

- No em dash (—) anywhere.
- No hyphen used as a bullet or as a sentence connector or aside. Do not write "Fixed the menu - it was a CSS bug". Rewrite into a plain sentence: "Fixed the mobile menu by resolving a CSS specificity bug". Ordinary hyphenated words are fine ("end-of-day", "Linen-themed", "sandbox-blocked").
- Each accomplishment is its own line under its category, with no leading bullet character at all (no •, no -). The line break is the list.
- Start each line with a past tense verb: Built, Fixed, Added, Migrated, Wired, Updated, Deployed, Removed, Generated.
- Plain, casual, basic English. One line per item. Keep each line to a single clear thought. Cut filler words.
- Keep the whole thing short. If the day had a lot, prefer the most meaningful items over listing every tiny edit.

## Example

This is the target style and structure:

```
Subject: EOD Update March 11, 2026

Summary

Completed

Canvas Medical

Built the Canvas AI Assistants plugin with Knowledge Assistant and Business Advisor featuring Claude API integration, Neon chat history persistence, and Warm Linen-themed UI
Fixed the Visual Report PDF to preserve HTML styling, colors, and layout when generating documents
Fixed "Pull Clinical Context from Chart" by applying lazy imports and removing sandbox-blocked object type annotations
Generated themed 48x48 PNG navbar icons for all three Canvas plugins
Added the canvas-plugin-preflight skill with sandbox rules reference for validating plugin code before deployment

Website Navigation & Authentication

Migrated all 151 pages from the old Navbar component to the new EditorialNav across the site
Fixed the mobile hamburger menu not appearing on the Longevity Intelligence Core page by resolving a CSS specificity bug
Fixed the Privacy Policy page to use the new EditorialNav
Wired Stripe to the Clerk authentication flow on the AI Platform and Education page CTAs
```

## After writing

Output the report directly in the chat so the user can copy it. Do not save a file unless asked. If nothing qualifies as done today, say so plainly instead of padding the report.
