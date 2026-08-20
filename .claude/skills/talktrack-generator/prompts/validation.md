# Validation Criteria for Talk Track Segments

This document defines the four validation criteria used to assess generated talk track segments.

---

## Overview

Each generated segment must pass ALL four validation checks before being marked as complete:

| Criterion | Weight | Pass Threshold |
|-----------|--------|----------------|
| Timing | Required | Within ±15% of target |
| Coverage | Required | ≥85% key terms |
| Flow | Required | No sentences >40 words |
| Transitions | Required | Natural bridge present |

---

## 1. Timing Validation

### Purpose
Ensure the segment will result in appropriate audio duration when converted to speech.

### Calculation
```
Target words = (slide_duration_seconds / 60) × words_per_minute
Min acceptable = target × 0.85
Max acceptable = target × 1.15
Actual words = count(script.split(/\s+/))

PASS if: min_acceptable ≤ actual_words ≤ max_acceptable
```

### Default Parameters
- Words per minute: 150 (configurable via --words-per-minute)
- Tolerance: ±15%

### Example
```
Slide duration: 90 seconds (1.5 minutes)
Words per minute: 150
Target: 1.5 × 150 = 225 words

Acceptable range: 191 - 259 words

Script has 240 words → PASS
Script has 180 words → FAIL (too short by 11 words)
```

### Retry Feedback
- **Too short**: "Script is {N} words short of minimum. Add more detail to [specific content area]."
- **Too long**: "Script exceeds maximum by {N} words. Condense [specific content area]."

---

## 2. Coverage Validation

### Purpose
Ensure all important slide content is mentioned in the narration.

### Key Term Extraction
Extract key terms from slide content:

1. **From paragraphs**: Extract capitalized terms, technical terms, proper nouns
2. **From bullets/numbered**: Each item's key phrase
3. **From definitions**: The defined term (required)
4. **From callouts**: 
   - `evidence`: Study name/finding
   - `keyTakeaway`: Core message
   - `clinicalNote`: Key recommendation
5. **From diagrams**: Title, node labels, key elements

### Calculation
```
key_terms = extract_key_terms(slide)
mentioned = key_terms.filter(term => 
  script.toLowerCase().includes(term.toLowerCase())
)
coverage_percent = mentioned.length / key_terms.length × 100

PASS if: coverage_percent ≥ 85%
```

### Special Rules
- **Definition terms**: MUST be mentioned (0% tolerance)
- **Evidence callouts**: Study OR finding must be mentioned
- **Diagram elements**: At least title and 50% of key labels

### Example
```
Slide key terms: [
  "SARS-CoV-2",           // From paragraph
  "ACE2 receptors",       // From paragraph
  "gut-lung axis",        // Definition term (required)
  "viral persistence",    // Bullet item
  "immune dysregulation", // Bullet item
  "37%"                   // Clinical note stat
]

Script mentions: 5/6 terms (missing "37%")
Coverage: 83% → FAIL (below 85%)

Retry feedback: "Missing key terms: '37%' statistic from clinical note"
```

### Retry Feedback
- "Missing key terms: {list of missing terms}"
- "Definition term '{term}' MUST be mentioned"
- "Diagram '{title}' not described - add verbal description"

---

## 3. Flow Validation

### Purpose
Ensure natural speech patterns suitable for TTS conversion.

### Checks

#### 3a. Sentence Length
```
sentences = script.split(/[.!?]+/).filter(s => s.trim())
long_sentences = sentences.filter(s => word_count(s) > 40)

PASS if: long_sentences.length === 0
```

#### 3b. Sentence Variety
```
lengths = sentences.map(s => word_count(s))
std_dev = standard_deviation(lengths)

PASS if: std_dev > 5 (indicates varied rhythm)
```

#### 3c. Paragraph Structure
```
paragraphs = script.split(/\n\n+/).filter(p => p.trim())

PASS if: paragraphs.length >= 2 (not one giant block)
```

### Combined Flow Score
```
PASS if: 
  - No sentences > 40 words AND
  - Sentence length std_dev > 5 AND
  - At least 2 paragraphs
```

### Example
```
Script analysis:
  - Sentences: 12
  - Longest sentence: 45 words → FAIL
  - Length std_dev: 8.3 → PASS
  - Paragraphs: 4 → PASS

Overall flow: FAIL (long sentence detected)

Retry feedback: "Break up sentence starting with 'The complex 
interrelationship between...' - currently 45 words"
```

### Retry Feedback
- "Sentence too long ({N} words): '{first 10 words}...' - break into multiple sentences"
- "Script is monotonous - vary sentence lengths more"
- "Add paragraph breaks for better pacing"

---

## 4. Transition Validation

### Purpose
Ensure smooth verbal bridges between slides for seamless audio playback.

### Opening Transition Check
For slides after the first:
```
first_paragraph = script.split('\n\n')[0]

bridge_indicators = [
  /^(now|building|this brings|continuing|let's|moving|next)/i,
  /(from|as we discussed|we've seen|earlier)/i,
  /that (understanding|foundation|concept|idea)/i
]

PASS if: any bridge_indicator matches first_paragraph
  OR first slide (no opening transition needed)
```

### Closing Transition Check
For slides before the last:
```
last_paragraph = script.split('\n\n').pop()

transition_phrases = [
  "let's", "now", "this brings us", "building on",
  "moving", "next", "consider", "turn to", "explore",
  "look at", "examine", "brings us to"
]

PASS if: any transition_phrase in last_paragraph.toLowerCase()
  OR last slide (no closing transition needed)
```

### Combined Transition Score
```
PASS if:
  - Opening transition present (or first slide)
  - Closing transition present (or last slide)
```

### Example
```
Slide 5 of 16

Last paragraph: "These six mechanisms are interconnected, and 
understanding them is crucial for effective treatment."

Transition check: No transition phrase found → FAIL

Retry feedback: "Add natural bridge to next topic 'The Gut-Lung 
Axis'. Try ending with something like 'Now let's examine how 
these mechanisms connect through the gut-lung axis...'"
```

### Retry Feedback
- "Missing opening bridge from previous topic '{prev_title}'"
- "Add natural transition to '{next_title}' at end of segment"
- Suggest specific transition phrase based on next slide content

---

## Validation Execution Order

Run validations in this order (fail-fast):

1. **Timing** - Quick word count check
2. **Coverage** - Term matching
3. **Flow** - Sentence analysis  
4. **Transitions** - Bridge detection

Stop at first failure to provide focused retry feedback.

---

## Aggregate Validation Report

For each segment, generate a validation report:

```
Validation Results for SEG-003:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Timing:      328 words (target: 320, +2.5%)
✓ Coverage:    92% (11/12 key terms)
✗ Flow:        1 sentence exceeds 40 words
✓ Transitions: Natural bridges present

Status: FAILED
Retry: 1 of 2

Feedback for retry:
Break up this sentence (43 words):
"The complex interrelationship between the gut microbiome and 
the immune system involves multiple signaling pathways including 
short-chain fatty acid production, toll-like receptor activation, 
and cytokine modulation that together regulate systemic inflammation."

Suggestion: Split after "pathways" and start new sentence with 
"These include..."
```

---

## Configuration Options

Validation thresholds can be adjusted in prd.json:

```json
{
  "config": {
    "validation": {
      "timingTolerance": 0.15,      // ±15%
      "coverageThreshold": 0.85,    // 85%
      "maxSentenceWords": 40,
      "minSentenceVariety": 5,      // std_dev
      "requireTransitions": true
    }
  }
}
```
