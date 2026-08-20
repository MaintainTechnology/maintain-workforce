# NGM Document Studio

Create and update professional HTML documents with consistent NGM branding, voice, and messaging.

## What It Does

Document Studio generates polished, branded documents for Next Generation Medicine:
- **Proposals** — Client-specific proposals from meeting transcripts
- **Flyers** — 1-2 page print-ready marketing materials  
- **Sponsor Packets** — Multi-page event sponsorship materials
- **One-Pagers** — Single-page program overviews

All documents follow the NGM design system and voice guidelines, ensuring consistency across everything you create.

## Quick Start

### Create a Proposal

```
Create a proposal for [Client Name]. Here's the transcript from our meeting:

[Paste meeting transcript or notes]
```

The agent will:
1. Extract client needs and pain points from the conversation
2. Match your solution to their specific challenges
3. Recommend appropriate pricing
4. Generate a styled HTML proposal
5. Save to `content/docs/proposal-[client]-[date].html`

### Create a Flyer

```
Create a 1-page flyer for NGM Commons targeting longevity vendors at conferences.
```

### Create a Sponsor Packet

```
Create a sponsor packet for the NGM Summit Japan 2026 with 4 sponsorship tiers.
```

### Update an Existing Document

```
Update the NGM Summit sponsor packet - change the date to March 2026 and add pricing for a new "Founding Partner" tier at $25,000.
```

## What's Included

### Reference Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Core instructions and workflows |
| `voice-and-style.md` | Voice guidelines, tone, language dos/don'ts |
| `ngm-programs.md` | NGM programs, pricing, credentials |
| `design-system.md` | Colors, typography, CSS components |

### Templates

| Template | Use Case |
|----------|----------|
| `proposal-template.html` | Client proposals |
| `flyer-template.html` | Marketing flyers (print-ready) |
| `sponsor-packet-template.html` | Event sponsorship packets |

## Voice & Style Summary

**Be:**
- Confident (not salesy)
- Specific (not vague)
- Outcome-focused (not feature-focused)
- Personable (not corporate)

**Avoid:**
- Buzzwords ("revolutionary", "cutting-edge")
- Vague superlatives ("best-in-class", "world-class")
- Salesy urgency ("Act now!")
- Feature dumping without context

**Example transformation:**

❌ "Our revolutionary AI-powered platform delivers world-class insights."

✅ "The platform synthesizes 50,000+ peer-reviewed studies into actionable clinical guidance—reducing report generation from 45 minutes to 5."

## NGM Programs Quick Reference

### Longevity Intelligence Platform (LIP)
- 50,000+ studies synthesized
- AI lab report generator (5 min vs 45 min)
- 150+ educational modules
- Business knowledge advisor

### NGM Community
- Engaged private practitioner community
- Weekly live sessions
- Case feedback
- Expert network

### NGM Commons
- Vendor intelligence platform
- Research-driven profiles
- AI-native structure
- Partner: $5,000/year | Sponsor: $12,500/year

### NGM Summit
- Japan 2026 (October 15-16)
- Nakanoshima Qross, Osaka
- ~100 invitation-only attendees
- Tiers: $1,000 - $20,000+

### Consulting
- Strategy sessions: $2,500 - $5,000
- Monthly advisory: $5,000 - $15,000/mo
- Fractional CMO: $10,000 - $25,000/mo

## Output Locations

All documents are saved to `content/docs/`:

```
content/docs/
├── proposal-acme-health-2025-12-15.html
├── ngm-commons-flier.html
├── ngm-summit-sponsor-packet.html
└── ...
```

## Design System Highlights

### Colors
- **Gold accent**: `#C49A6C` (use sparingly)
- **Ink-900**: `#302C27` (headings)
- **Ink-700**: `#4A4540` (body text)
- **Paper-alt**: `#F5F2EC` (backgrounds)

### Typography
- **Headings**: Cormorant Garamond (serif)
- **Body**: Inter (sans-serif)
- **Labels**: Inter, uppercase, letter-spacing 0.08em

### Key Components
- Section numbers (black square with white number)
- Highlight boxes (gold left border)
- Tier cards (featured tier in dark with gold border)
- Pricing tables (recommended row highlighted)

## Tips for Best Results

1. **Be specific** — Include client name, context, and goals
2. **Provide transcripts** — For proposals, paste the full meeting notes
3. **Reference existing docs** — "Make it similar to the Trellis proposal"
4. **Specify format** — "Print-ready 8.5x11" or "web-viewable"
5. **Indicate updates** — For changes, specify exactly what to modify

## Examples

### Proposal from transcript
```
Create a consulting proposal for Dr. Sarah Chen at Longevity Labs based on our call yesterday. She's looking for help launching a longevity program at her functional medicine practice. Here's the transcript:

[paste transcript]
```

### Flyer for conference
```
Create a 2-page print flyer for NGM Commons to hand out at the A4M conference. Focus on the vendor partnership benefits and include the QR code for sign-up.
```

### Update sponsor packet
```
Update the Vanguard Summit sponsor packet:
1. Change event date to March 15-16, 2026
2. Add a new "Founding Partner" tier at $25,000 with co-creation benefits
3. Update Dr. Agarwal's bio with her new role
```

### Adapt existing proposal
```
Take the Trellis proposal and adapt it for MedTech Labs. They're also building a clinical platform but focused on geriatrics rather than pregnancy. Keep the same structure and pricing approach.
```

