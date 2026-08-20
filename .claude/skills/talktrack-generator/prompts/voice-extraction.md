# Voice Extraction Prompt

Extract voice patterns from a provided transcript to create a voice profile for talk track generation.

---

## System Context

You are analyzing a transcript or writing sample to extract the speaker's unique voice characteristics. Your analysis will guide the generation of a talk track that authentically mirrors this voice.

---

## Input

**Transcript/Sample:**
```
{transcript_content}
```

**Educator Context (if available):**
- Name: {educator_name}
- Specialty: {specialty}
- Course Topic: {course_topic}

---

## Analysis Tasks

Analyze the transcript for the following voice characteristics:

### 1. Tone Analysis
Identify the overall tone:
- Formal vs. conversational
- Warm vs. clinical
- Authoritative vs. collaborative
- Serious vs. light

### 2. Sentence Rhythm
Examine sentence structure patterns:
- Average sentence length (short/medium/long)
- Rhythm patterns (e.g., long-short-medium)
- Use of fragments for emphasis
- Paragraph length preferences

### 3. Transition Style
Identify how the speaker moves between topics:
- Transition phrases used (e.g., "Here's what's fascinating...", "Now...")
- Use of rhetorical questions
- Bridge techniques (summary-to-new, question-to-answer)
- Signposting language

### 4. Rhetorical Devices
Note the use of:
- Metaphors and analogies
- Stories and examples
- Rhetorical questions
- Repetition for emphasis
- Direct address to audience

### 5. Vocabulary Patterns
Analyze word choice:
- Technical vs. accessible language
- Jargon handling (explained, assumed, avoided)
- Unique phrases or verbal tics
- Formality level

### 6. Personalization
Identify perspective and connection:
- First person singular ("I") vs. plural ("we")
- Direct address ("you", "your patients")
- Personal anecdotes
- Audience assumptions

---

## Output Format

Return a JSON object with the extracted voice profile:

```json
{
  "voiceProfile": {
    "source": "transcript",
    "tone": "[1-2 sentence description of overall tone]",
    "sentenceRhythm": "[Description of sentence patterns]",
    "transitionStyle": "[How speaker moves between topics]",
    "rhetoricalDevices": "[Key devices used]",
    "vocabulary": "[Vocabulary level and handling of technical terms]",
    "personalization": "[Perspective and audience connection style]",
    "samplePhrases": [
      "[Characteristic phrase 1]",
      "[Characteristic phrase 2]",
      "[Characteristic phrase 3]",
      "[Characteristic phrase 4]",
      "[Characteristic phrase 5]"
    ],
    "avoidPatterns": [
      "[Pattern the speaker doesn't use]",
      "[Another pattern to avoid]"
    ],
    "keyCharacteristics": [
      "[Most distinctive trait 1]",
      "[Most distinctive trait 2]",
      "[Most distinctive trait 3]"
    ]
  }
}
```

---

## Example Analysis

**Input transcript excerpt:**
> "Here's what's fascinating about the gut-brain axis. We used to think these systems operated independently. Your brain does its thing, your gut does its thing. But now we know they're in constant conversation. Let me show you what this looks like in practice..."

**Extracted profile:**
```json
{
  "voiceProfile": {
    "source": "transcript",
    "tone": "Warm and conversational with underlying clinical authority. Creates intimacy while maintaining expertise.",
    "sentenceRhythm": "Medium-length sentences punctuated by short, punchy statements. Uses fragments for emphasis ('Your brain does its thing, your gut does its thing.').",
    "transitionStyle": "Uses 'Here's what's fascinating...' as a hook, follows with context, then bridges with 'Let me show you...'",
    "rhetoricalDevices": "Contrasts old vs. new understanding, uses personification ('in constant conversation'), direct offers to demonstrate",
    "vocabulary": "Accessible language with technical terms introduced naturally. Avoids jargon dumps.",
    "personalization": "First-person plural 'we' for shared discovery, direct 'you/your' for application",
    "samplePhrases": [
      "Here's what's fascinating...",
      "We used to think... But now we know...",
      "Let me show you what this looks like...",
      "Your [X] does its thing",
      "in constant conversation"
    ],
    "avoidPatterns": [
      "Formal academic language",
      "Passive voice",
      "Dense paragraph-long explanations"
    ],
    "keyCharacteristics": [
      "Hook-context-bridge structure",
      "Old/new knowledge contrast",
      "Personal, direct engagement"
    ]
  }
}
```

---

## Notes

- If the transcript is short (<200 words), note this limitation in the output
- Focus on patterns that appear multiple times, not one-off phrases
- The goal is to capture authentic voice, not create a caricature
- When in doubt, favor conversational warmth over clinical distance
