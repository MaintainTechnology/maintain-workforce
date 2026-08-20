# Email HTML Builder Skill

A Claude Code skill for converting markdown email content into HubSpot-compatible HTML with NGM editorial styling.

## What It Does

Transforms markdown email files into production-ready HTML that:
- Uses inline styles for maximum email client compatibility
- Follows NGM's editorial design aesthetic
- Works directly in HubSpot's HTML email editor
- Replaces personalization placeholders with HubSpot tokens

## Supported Inputs

- **Markdown email files** from the repository
- **Email sequence files** (can convert individual emails or full sequences)
- **Raw markdown content** provided directly

## Quick Start

Invoke the skill and provide:

```
Convert content/email-sequences/elite-mentorship-nurture.md email 1 to HubSpot HTML
```

Or:

```
Convert all emails from content/email-sequences/elite-mentorship-nurture.md
```

## Output

For each email, you'll receive:
1. **Subject line** - Ready for HubSpot subject field
2. **Preview text** - Ready for HubSpot preview text field
3. **Full HTML** - Ready to paste into HubSpot HTML editor

## Design System

The generated HTML uses:
- **Cormorant Garamond** serif for headlines
- **DM Sans** sans-serif for body text
- **Gold accents** (#C49A6C) for bullets and highlights
- **Table-based layouts** for email client compatibility
- **600px max-width** container

## Files

- `SKILL.md` - Complete skill instructions and component patterns
