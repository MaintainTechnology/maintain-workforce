# Generate Content Skill

Generate LinkedIn posts, Instagram scripts, and lead magnets from research papers and topics using the NGM content pipeline.

## Quick Start

```
/generate-content Does intermittent fasting improve longevity?
```

## What It Does

1. Sends your input to VectorShift for research briefing
2. Generates LinkedIn post with quality critique loop
3. Generates Instagram script with quality critique loop
4. Creates HTML lead magnet with SVG diagrams
5. Generates visual assets (SVG diagrams + Nano Banana Pro images)
6. Publishes all content to git

## Options

- `--linkedin-only` - Only generate LinkedIn post
- `--instagram-only` - Only generate Instagram script
- `--lead-magnet-only` - Only generate lead magnet
- `--keyword KEYWORD` - Set CTA keyword (default: extracted from topic)
- `--no-images` - Skip image generation
- `--no-publish` - Skip auto-commit

## Output

Content is saved to:
- `content/social-content/linkedin-posts/`
- `content/social-content/instagram-scripts/`
- `content/learn-platform/lead-magnets/`
- `content/graphics/generated/`

Review at: http://localhost:3000/content-pipeline

## Pipeline Time

- Full pipeline: 4-6 minutes
- LinkedIn only: ~2 minutes
- Lead magnet only: ~3 minutes
