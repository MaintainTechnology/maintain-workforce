# Slide Script Generation Prompt

Generate a natural, spoken script for a single lecture slide that can be pasted directly into ElevenLabs.

---

## System Context

You are generating voiceover narration for a medical education lecture slide. The output will be converted to audio via text-to-speech, so it must be natural spoken prose with no formatting, headers, or markers.

**Model**: Claude Opus 4.5
**Output**: Plain text only, ready for TTS

---

## Inputs

### Slide Content
```json
{slide_json}
```

### Voice Profile
```json
{voice_profile}
```

### Context
- **Previous slide ending**: {previous_ending}
- **Next slide title**: {next_slide_title}
- **Target word count**: {target_word_count} words (±15%)
- **Position in lecture**: Slide {current} of {total}

### Learnings from Previous Iterations
{learnings}

---

## Generation Requirements

### 1. Content Coverage (REQUIRED)
You MUST cover ALL of the following from the slide:

**Paragraphs**: Each paragraph's key message must be conveyed
**Bullets/Numbered items**: All items must be mentioned (can be woven naturally, not listed)
**Definitions**: Term and definition must be explained
**Callouts**: 
- `clinicalNote` → Practical clinical guidance
- `keyTakeaway` → Emphasize as important point
- `evidence` → Cite the study finding naturally
- `warning` → Highlight as caution
- `proTip` → Share as insider tip

**Diagrams**: If `diagramHtml` or `diagram` exists:
- Verbally describe what the diagram shows
- Walk through key elements
- Use phrases like "Picture this..." or "Imagine a diagram showing..."

### 2. Voice Matching (REQUIRED)
Match the voice profile:
- Use the specified **tone** throughout
- Follow the **sentence rhythm** patterns
- Employ the characteristic **transition style**
- Incorporate **sample phrases** where natural
- Avoid patterns listed in **avoidPatterns**

### 3. Natural Flow (REQUIRED)
- No sentences longer than 40 words
- Vary sentence length (short-medium-long rhythm)
- Use natural paragraph breaks (blank lines) for pacing
- No bullet points or numbered lists in output
- Weave content naturally, don't just read items

### 4. Transitions (REQUIRED)
**Opening**: 
- If first slide: Start with a compelling hook
- If not first slide: Bridge naturally from {previous_ending}

**Closing**:
- If not last slide: Include natural transition to "{next_slide_title}"
- If last slide: Provide strong closing/summary

**Transition examples** (adapt to voice profile):
- "Now let's examine..."
- "This brings us to a crucial question..."
- "Building on this foundation..."
- "Here's where it gets practical..."

### 5. Word Count (REQUIRED)
Target: **{target_word_count} words** (±15%)
- Minimum: {min_words} words
- Maximum: {max_words} words

---

## Output Rules (STRICTLY ENFORCED)

### DO NOT include:
- Markdown headers (no #, ##, ###)
- Section labels (no "SLIDE 1", "INTRODUCTION")
- Bracketed cues (no [Pause], [NEXT], [Emphasize])
- Visual references (no "as you can see on screen")
- Bullet points or numbered lists
- Citations in academic format (weave naturally)
- Any meta-commentary about the script

### DO include:
- Only the exact words to be spoken
- Natural paragraph breaks (blank lines) for pacing
- Smooth verbal transitions
- Natural speech patterns including rhetorical questions

---

## Output Format

Return ONLY the spoken script as plain text paragraphs.

Start directly with the opening. End with the transition or closing.

Example structure (but without these labels):
```
[Opening hook or bridge from previous slide - 1-2 sentences]

[Main content paragraph 1 - covering first portion of slide content]

[Main content paragraph 2 - covering middle portion, including any callouts]

[Main content paragraph 3 - if needed, covering remaining content and diagram description]

[Closing with natural transition to next topic - 1-2 sentences]
```

---

## Quality Checklist

Before returning, verify:
- [ ] All slide content elements are covered
- [ ] Voice profile is matched
- [ ] No formatting or markers present
- [ ] Word count is within range
- [ ] Natural transitions at start and end
- [ ] No sentences exceed 40 words
- [ ] Ready to paste directly into ElevenLabs

---

## Retry Guidance

If this is a retry attempt, here's what to fix:

**Previous attempt issues**: {retry_feedback}

Focus specifically on addressing these issues while maintaining all other requirements.
