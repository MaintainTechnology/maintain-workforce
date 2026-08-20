================================================================================
TALK TRACK GENERATOR CHANGELOG
================================================================================

Session ID:     [talktrack-YYYY-MM-DD-physician-course-lecture]
Lecture:        [Lecture Title]
Physician:      [Physician Name]
Started:        [ISO timestamp]
Completed:      [ISO timestamp or "In Progress"]

Voice Source:   [Transcript path or "Auto-generated"]

================================================================================
CONFIGURATION
================================================================================

Words Per Minute: [N]
Max Retries:      [N]
Model:            claude-opus-4-5-20250514

================================================================================
VOICE PROFILE
================================================================================

Source:           [transcript | auto]
Tone:             [Description]
Sentence Rhythm:  [Description]
Transition Style: [Description]
Vocabulary:       [Description]
Personalization:  [Description]

Sample Phrases:
  - [Phrase 1]
  - [Phrase 2]
  - [Phrase 3]

================================================================================
GENERATION SUMMARY
================================================================================

Total Segments:   [N]
  - Completed:    [N]
  - Blocked:      [N]

Total Attempts:   [N]
  - First-pass:   [N]
  - Retries:      [N]

Final Word Count: [N]
Est. Duration:    [N] minutes

================================================================================
SEGMENT LOG
================================================================================

--- SEG-001 | [Slide Title] | Attempt [N] ---
Timestamp:    [ISO timestamp]
Status:       [PASSED | FAILED | BLOCKED]

Validation Results:
  [✓|✗] Timing:      [N] words (target: [N], [within/outside] ±15%)
  [✓|✗] Coverage:    [N]% ([N]/[N] key terms)
  [✓|✗] Flow:        [OK | N long sentences detected]
  [✓|✗] Transitions: [OK | Missing bridge phrase]

[If FAILED:]
Retry Feedback: [Specific feedback for retry]

[If PASSED:]
Output: .talktrack-gen/segments/slide-001.txt

---

--- SEG-002 | [Slide Title] | Attempt [N] ---
Timestamp:    [ISO timestamp]
Status:       [PASSED | FAILED | BLOCKED]

...

================================================================================
BLOCKED SEGMENTS
================================================================================

[If any blocked:]

SEG-[N]: [Slide Title]
  Attempts: [N]
  Final Failure: [Reason]
  Recommendation: [Suggested fix]

---

[Or if none:]

None - all segments completed successfully.

================================================================================
COHERENCE PASS
================================================================================

Timestamp:    [ISO timestamp]
Adjustments:  [N]

Changes Made:
  - [Description of change 1]
  - [Description of change 2]
  - [Or "None - script passed coherence check"]

================================================================================
OUTPUT FILES
================================================================================

| File | Description | Status |
|------|-------------|--------|
| .talktrack-gen/prd.json | Session state | Complete |
| .talktrack-gen/progress.txt | Progress log | Complete |
| .talktrack-gen/segments/*.txt | Individual segments | [N]/[N] |
| .talktrack-gen/output/talktrack-final.txt | Final script | [Complete | Pending] |

================================================================================
QUALITY METRICS
================================================================================

Timing Accuracy:
  - Average deviation: [N]%
  - Max deviation: [N]% (SEG-[N])

Coverage:
  - Average: [N]%
  - Lowest: [N]% (SEG-[N])

Flow:
  - Segments with retries for flow: [N]
  - Final long sentence count: [N]

Transitions:
  - Natural bridges: [N]/[N-1]
  - Quality: [Good | Acceptable | Needs Review]

================================================================================
LEARNINGS
================================================================================

Patterns Discovered:
  - [Pattern 1]
  - [Pattern 2]

Issues Encountered:
  - [Issue 1 and resolution]
  - [Or "None"]

Recommendations for Future:
  - [Recommendation 1]
  - [Or "None"]

================================================================================
SESSION COMPLETE
================================================================================

Final output ready at:
  .talktrack-gen/output/talktrack-final.txt

To use:
  1. Open the output file
  2. Copy entire contents
  3. Paste into ElevenLabs or TTS system
  4. Generate audio

Review commands:
  cat .talktrack-gen/output/talktrack-final.txt | wc -w  # Word count
  cat .talktrack-gen/progress.txt                        # Full log

================================================================================
