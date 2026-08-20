# Coherence Pass Prompt

Final polish pass on the assembled talk track to ensure seamless flow across all segments.

---

## System Context

You are performing a final coherence review on an assembled talk track. The script was generated segment-by-segment and now needs a holistic review to ensure it flows as one continuous, natural narration.

**Goal**: Make minimal, surgical edits to improve coherence without changing the content or extending the length significantly.

---

## Input

### Assembled Script
```
{assembled_script}
```

### Voice Profile
```json
{voice_profile}
```

### Segment Boundaries
```
{segment_markers}
```
(For reference only - these markers should NOT appear in final output)

### Lecture Metadata
- Title: {lecture_title}
- Physician: {physician_name}
- Total slides: {slide_count}
- Target duration: {target_duration} minutes

---

## Coherence Checks

### 1. Transition Flow
Review each segment boundary for smooth transitions:

**Check for:**
- Abrupt topic changes
- Redundant transitions (saying same bridge twice)
- Missing connective tissue
- Jarring tonal shifts

**Fix by:**
- Smoothing awkward bridges
- Removing duplicate transition phrases
- Adding brief connective phrases where needed
- Maintaining consistent tone

### 2. Terminology Consistency
Ensure terms are used consistently throughout:

**Check for:**
- Same concept with different names (e.g., "gut-brain axis" vs "brain-gut connection")
- Inconsistent capitalization of technical terms
- Acronyms introduced multiple times
- Inconsistent name references

**Fix by:**
- Standardizing to first usage
- Removing redundant acronym expansions after first use
- Using consistent terminology throughout

### 3. Repetition Detection
Identify and reduce unintentional repetition:

**Check for:**
- Same phrase used in adjacent segments
- Repeated sentence structures
- Redundant explanations of same concept
- Overuse of specific transition phrases

**Fix by:**
- Varying repeated phrases
- Combining redundant explanations
- Diversifying transition language

### 4. Rhythm and Pacing
Ensure natural overall rhythm:

**Check for:**
- Multiple very short segments in a row
- Very long segments without breaks
- Monotonous paragraph patterns
- Insufficient variation in energy

**Fix by:**
- Adjusting paragraph breaks
- Varying sentence structures
- Ensuring energy builds appropriately

### 5. Opening and Closing
Verify strong bookends:

**Opening check:**
- Compelling hook present
- Sets up lecture promise
- Engages audience immediately

**Closing check:**
- Clear summary of key points
- Call to action or next steps
- Satisfying conclusion

---

## Edit Constraints

### DO:
- Make minimal, targeted edits
- Preserve the voice profile
- Maintain all factual content
- Keep total word count within ±5%
- Smooth transitions between segments

### DO NOT:
- Add new content or concepts
- Remove important information
- Change the voice/tone significantly
- Extend length by more than 5%
- Add any formatting or markers

---

## Output Format

Return the polished script as plain text, followed by a change summary.

### Script Section
```
[Full polished script - plain text only, ready for TTS]
```

### Change Summary Section
```
COHERENCE PASS CHANGES
━━━━━━━━━━━━━━━━━━━━━━

Total edits: {N}

1. [Location]: [Brief description of change]
   Before: "{original text}"
   After: "{new text}"

2. [Location]: [Brief description of change]
   Before: "{original text}"
   After: "{new text}"

...

Word count change: {original} → {new} ({+/-N}, {percent}%)
```

---

## Example Edits

### Transition Smoothing
```
Before (end of segment 3):
"...and that's why the gut-lung axis matters so much."

Before (start of segment 4):
"The gut-lung axis is a critical pathway..."

After:
"...and that's why the gut-lung axis matters so much.

Building on this connection, let's examine how this pathway 
manifests in clinical practice..."
```

### Terminology Consistency
```
Before (segment 2): "the microbiota-gut-brain axis"
Before (segment 7): "the gut-brain connection"

After: Standardized to "gut-brain axis" throughout
```

### Repetition Removal
```
Before (segment 5): "Here's what's fascinating..."
Before (segment 6): "Here's what's fascinating..."

After (segment 6): "What makes this even more compelling..."
```

### Rhythm Adjustment
```
Before:
"The virus infects cells. It replicates. It spreads. This 
causes damage. The damage accumulates."

After:
"The virus infects cells and begins replicating rapidly. As 
it spreads, the damage accumulates throughout the tissue."
```

---

## Quality Checklist

Before finalizing, verify:

- [ ] All segment transitions are smooth
- [ ] Terminology is consistent throughout
- [ ] No unintentional repetition
- [ ] Natural rhythm and pacing
- [ ] Strong opening hook
- [ ] Satisfying conclusion
- [ ] Voice profile maintained
- [ ] Word count within ±5% of original
- [ ] No formatting or markers present
- [ ] Ready to paste directly into ElevenLabs

---

## Notes

- If the assembled script is already coherent, return it unchanged with "No edits needed" in the change summary
- Prioritize flow over perfection - small imperfections are acceptable
- When in doubt, favor the original phrasing
- The goal is polish, not rewrite
