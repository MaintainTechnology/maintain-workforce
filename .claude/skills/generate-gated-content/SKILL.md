# Generate Gated Content

Generate content packages with gated/paid content support. Produces both truncated teasers for email distribution and full articles for subscriber-only access.

## Usage

Invoke this skill when the user wants to:
- Generate a newsletter with subscriber-only full access
- Create gated content with conversion CTAs
- Build content for the Analysis section (subscriber-only)
- Generate dual-output: truncated teaser + full article

## Two-Tier Distribution Model

Based on Every.to's proven gated content pattern:

**Email/Public Version:**
- First 40-50% of content
- Hard stop with CTA: "This analysis is available to subscribers only."
- Dual action: "[Log in to continue reading]" or "[Subscribe now]"

**Subscriber Version:**
- Complete article with all content
- Full HTML lead magnet
- All SVG diagrams
- Accessible only to Core+ subscribers in the Analysis section

## Parameters

All parameters from `/generate-content` are supported, plus:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--paid` | flag | false | Enable gated content mode |
| `--cutoff` | float | 0.45 | Content cutoff percentage (0.3-0.6) |
| `--cta-text` | string | auto | Custom CTA copy |
| `--landing-page` | string | `/mentorship-content` | Redirect URL for CTA |

## Execution

### Full Pipeline with Gated Content

```bash
cd "/Users/anantvinjamoori/NGM Site NextJS V1/ngm-website-official"
export $(grep -v '^#' .env | xargs)
python3 -m lib.content_pipeline.cli generate-gated \
  --input "YOUR_TOPIC_HERE" \
  --pipeline clinical \
  --paid \
  --cutoff 0.45 \
  --newsletter \
  --lead-magnet \
  --linkedin \
  --instagram \
  --publish
```

### Non-Clinical Gated Content

```bash
python3 -m lib.content_pipeline.cli generate-gated \
  --input "YOUR_TOPIC_HERE" \
  --pipeline nonclinical \
  --paid \
  --newsletter \
  --linkedin \
  --instagram \
  --publish
```

## Output Structure

When `--paid` is enabled, the newsletter output includes:

```json
{
  "id": "abc12345",
  "title": "Newsletter Title",
  "subtitle": "Subtitle here",
  "is_gated": true,
  "full_content": {
    "markdown": "Complete article content...",
    "html": "<html>Full HTML version...</html>",
    "word_count": 1500
  },
  "teaser_content": {
    "markdown": "First portion of article...",
    "html": "<html>Truncated HTML with CTA...</html>",
    "word_count": 675,
    "cutoff_percentage": 0.45
  },
  "cta": {
    "text": "This analysis is available to subscribers only.",
    "login_url": "/mentorship-content?tab=analyses&article=abc12345",
    "subscribe_url": "/mentorship-content#subscribe"
  }
}
```

## Content Cutoff Strategy

The truncation algorithm:

1. **Find natural break points:**
   - End of paragraph
   - After a key insight or hook
   - Before a major section transition

2. **Preserve integrity:**
   - Never cut mid-sentence
   - Ensure teaser ends on a compelling note
   - Include at least one valuable takeaway

3. **CTA placement:**
   - Horizontal rule separator
   - Subscription prompt with login option
   - Clear value proposition for full access

## CTA Template

```html
<hr style="border: none; border-top: 2px solid #E3DFD7; margin: 32px 0;" />

<div style="background: linear-gradient(135deg, #F5F2EC 0%, #FFF 100%); 
            border: 1px solid #E3DFD7; border-radius: 12px; 
            padding: 32px; text-align: center; margin: 24px 0;">
  
  <h3 style="font-family: 'Cormorant Garamond', Georgia, serif; 
             font-size: 24px; color: #302C27; margin: 0 0 12px;">
    Continue Reading
  </h3>
  
  <p style="font-family: 'DM Sans', sans-serif; 
            font-size: 15px; color: #706C66; margin: 0 0 24px;">
    This analysis is available exclusively to NGM subscribers.
  </p>
  
  <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
    <a href="/mentorship-content?tab=analyses" 
       style="display: inline-block; padding: 14px 28px; 
              background: #302C27; color: white; 
              text-decoration: none; font-weight: 600; 
              font-size: 14px; border-radius: 6px;">
      Subscribe Now
    </a>
    <a href="/login?redirect=/mentorship-content?tab=analyses" 
       style="display: inline-block; padding: 14px 28px; 
              background: transparent; color: #302C27; 
              text-decoration: none; font-weight: 500; 
              font-size: 14px; border: 1px solid #E3DFD7; 
              border-radius: 6px;">
      Log In to Continue
    </a>
  </div>
</div>
```

## Output Locations

- **Full Analyses:** `content/analyses/{date}-{slug}.json`
- **Newsletter HTML:** `content/analyses/{date}-{slug}-full.html`
- **Teaser HTML:** `content/analyses/{date}-{slug}-teaser.html`
- **Analysis Registry:** `content/analyses/registry.ts`

## Integration with MentorshipContent

Generated analyses are automatically added to the Analysis section registry and appear in the **Analyses tab** of the Mentorship Content page (`/mentorship-content?tab=analyses`).

### Adding a New Analysis

After generating content with the `--paid` flag, add an entry to the registry:

```typescript
// content/analyses/registry.ts
export const analyses: Analysis[] = [
  {
    id: "nad-2026-01-24",
    slug: "nad-supplementation-longevity",
    title: "NAD+ Supplementation and Longevity",
    subtitle: "What the research actually shows about NAD+ precursors, dosing, and clinical applications",
    publishedAt: "2026-01-24T10:00:00Z",
    category: "clinical",
    tags: ["NAD+", "Supplementation", "Longevity"],
    wordCount: 1450,
    readTime: 8,
    isGated: true,
    accessTier: "core", // core, professional, elite
    fullHtmlPath: "2026-01-24-nad-supplementation-longevity-full.html",
    teaserHtmlPath: "2026-01-24-nad-supplementation-longevity-teaser.html",
    author: {
      name: "Dr. Anant Vinjamoori",
      role: "Chief Medical Officer"
    },
    isFeatured: false,
    displayOrder: 2
  },
  // ...
];
```

### Categories

| Category | Description |
|----------|-------------|
| `clinical` | Clinical research and protocols |
| `business` | Practice management and growth |
| `ai` | AI applications in healthcare |
| `longevity` | Longevity research and interventions |
| `nutrition` | Nutrition and supplementation |
| `hormones` | Hormone optimization |

## Access Control

The Analysis section uses the existing subscription tier logic:

| Tier | Access |
|------|--------|
| Free | Teaser only (email version) |
| Core | Full analyses + lead magnets |
| Professional | Full analyses + dashboard features |
| Elite | Full analyses + mentorship content |

## Example Invocations

**Gated newsletter with full pipeline:**
```
/generate-gated-content --paid Does NAD+ supplementation improve longevity?
```

**Custom cutoff for longer teaser:**
```
/generate-gated-content --paid --cutoff 0.55 The science of cold exposure therapy
```

**Non-clinical gated content:**
```
/generate-gated-content --paid --pipeline nonclinical How AI is transforming clinical workflows
```

## Notes

- This skill extends `/generate-content` with gated functionality
- The original `/generate-content` skill remains unchanged (backwards compatible)
- Teaser content is designed for HubSpot email campaigns
- Full content is served via the Analysis section in MentorshipContent
