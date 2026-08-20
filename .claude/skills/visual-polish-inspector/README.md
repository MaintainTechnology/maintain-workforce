# Visual Polish Inspector

A visual QA agent that inspects rendered pages for polish, readability, and design consistency using Chrome browser automation.

## Quick Start

```bash
# Ensure Chrome extension is connected
claude --chrome
```

## Usage

Tell the agent what pages to inspect:

- "Inspect lecture 1 of dr-abid-husain's new-biology-vascular course"
- "Check all lectures in systems-cardiology for visual issues"
- "Focus on the diagrams in lecture 3"
- "Inspect /preview/courses for any layout issues"

## What It Checks

| Category | Key Checks |
|----------|------------|
| **Layout** | Page structure, navigation, responsive design |
| **Typography** | Font rendering, readability, no truncation |
| **Diagrams** | All 20 types render correctly, labels visible |
| **Tables** | Headers, alignment, no overflow |
| **Callouts** | Icons, borders, text readable |
| **Colors** | Consistent with design system |
| **Spacing** | Margins, padding, alignment |

## Prerequisites

- Chrome browser open
- Claude in Chrome extension v1.0.36+
- Dev server running (`npm run dev`)
