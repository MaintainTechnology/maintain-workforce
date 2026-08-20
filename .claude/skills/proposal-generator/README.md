# Proposal Generator

Generate professional HTML proposals for consulting and enterprise clients from meeting transcripts.

## What It Does

This skill transforms your meeting notes or call transcripts into polished, branded proposals that:

- Extract client needs and pain points from the conversation
- Recommend appropriate pricing based on scope and value
- Weave in relevant NGM credentials and platform capabilities
- Output styled HTML matching the NGM editorial design system

## Quick Start

**Basic usage:**
```
Create a proposal for [Client Name]. Here's the transcript:

[Paste your meeting transcript or notes]
```

**From a file:**
```
Generate a proposal for Acme Health from the transcript at content/transcripts/acme-call.txt
```

## Proposal Types

### Consulting
For individuals, clinics, or small organizations seeking:
- Strategic advisory and guidance
- Fractional CMO/medical leadership
- Protocol development
- Practice optimization

### Enterprise
For larger organizations seeking:
- Platform licensing
- Team training programs
- White-label solutions
- API integrations

The skill will infer the type from context, or you can specify:
```
Create an enterprise proposal for...
```

## What You'll Get

A complete HTML proposal saved to `content/proposals/` containing:

1. **Executive Summary** - Concise overview of opportunity and solution
2. **Understanding Your Situation** - Client needs extracted from transcript
3. **Proposed Solution** - Scope, deliverables, approach
4. **Why NGM** - Relevant credentials and capabilities
5. **Investment** - Pricing options with justification
6. **Next Steps** - Clear call-to-action

## Output Location

All proposals are saved to: `content/proposals/`

Filename format: `proposal-[client-name]-[date].html`

The skill learns from existing proposals in this folder to maintain consistent tone and pricing calibration.

## Input Formats

The skill accepts transcripts in any format:
- Raw conversation text
- Timestamped transcripts
- Speaker-labeled dialogue
- Meeting notes
- Call summaries

No special formatting required.

## Pricing Framework

The skill generates pricing recommendations based on:
- Complexity of needs
- Time/resource requirements
- Urgency signals
- Organization size
- Strategic value

**Consulting ranges:** $2,500 (strategy session) to $75,000 (practice transformation)

**Enterprise ranges:** $2,000/mo (platform licensing) to $150,000+ (white-label)

## Files

```
.claude/skills/proposal-generator/
├── SKILL.md              # Full skill definition
├── README.md             # This file
└── templates/
    ├── proposal-base.html   # HTML template
    └── components.md        # Reusable patterns
```

## Tips

- **Include context**: The more detail in your transcript, the more tailored the proposal
- **Mention budget signals**: If the client hinted at budget, include that in your notes
- **Specify urgency**: Note any timeline pressures mentioned
- **Review before sending**: Always review and adjust pricing/scope as needed
