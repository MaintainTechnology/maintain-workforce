"""
Prompt Library for BizDev Opportunity Intelligence

Consolidated prompt templates for:
1. Transcript opportunity extraction
2. Email opportunity extraction
3. Opportunity classification
4. Confidence scoring

All prompts reference actual NGM services and use consistent
output formats for easy parsing.
"""

# =============================================================================
# NGM SERVICES REFERENCE
# =============================================================================

NGM_SERVICES_CONTEXT = """
## NGM Service Types

1. **Consulting** ($2,500 - $75,000)
   - Strategy sessions ($2,500-$5,000): Initial assessment, specific problem solving
   - Monthly advisory retainers ($5,000-$15,000/mo): Ongoing guidance
   - Fractional CMO/Advisor ($10,000-$25,000/mo): Deep involvement
   - Protocol development ($15,000-$50,000): Custom clinical protocols
   - Practice transformation ($25,000-$75,000): Full practice redesign

2. **Membership - Longevity Intelligence Platform (LIP)** ($299 - $599/month)
   - Essential ($299/mo): Knowledge base, limited lab reports, curriculum
   - Professional ($599/mo): Full access, unlimited reports, business advisor
   - Features: 50,000+ studies synthesized, 150+ educational modules, 200,000+ monthly LinkedIn impressions, engaged private practitioner community

3. **Report Generator** (Part of LIP or standalone interest)
   - AI lab report generation: 5-minute turnaround vs 45-minute manual
   - Biomarker interpretation with peer-reviewed citations
   - Customizable to practice philosophy and branding

4. **Commons Partnership** ($5,000 - $12,500/year)
   - Partner tier ($5,000/year): Full vendor profile, lead capture
   - Sponsor tier ($12,500/year): Category sponsorship, content collaboration
   - AI-native vendor profiles for longevity clinicians
"""


# =============================================================================
# 1. TRANSCRIPT OPPORTUNITY EXTRACTION PROMPT
# =============================================================================

TRANSCRIPT_OPPORTUNITY_EXTRACTION = """
# Meeting Transcript Opportunity Analysis

You are analyzing a meeting transcript to identify business development opportunities for Next Generation Medicine (NGM).

{services_context}

## Signal Types to Extract

- **EXPLICIT_INTEREST**: Direct questions about services, pricing, availability
- **PAIN_POINT**: Problems mentioned that NGM services can address
- **BUDGET_MENTION**: Discussion of budget, investment capacity, pricing expectations
- **TIMELINE_MENTION**: Urgency indicators ("need this Q1", "launching soon")
- **DECISION_MAKER**: Signs of purchasing authority or decision-making power
- **FOLLOW_UP_REQUEST**: Requests for proposals, demos, more information

## Meeting Transcript

**Filename:** {filename}
**Meeting Date:** {meeting_date}

```
{transcript_content}
```

## Instructions

Analyze this transcript and extract ALL potential business development opportunities. For each opportunity identified:

1. Identify the contact person and their organization
2. Determine which NGM service type(s) they're interested in
3. Extract specific signals with exact quotes
4. Assess confidence level based on signal strength

## Output Format

Return a JSON object with the following structure:

```json
{{
  "opportunities": [
    {{
      "contact_name": "Full name of the prospect",
      "company": "Company/organization name or null",
      "title": "Job title if mentioned or null",
      "email": "Email if mentioned or null",
      "opportunity_type": "consulting|membership|report_generator|commons_partnership",
      "signals": [
        {{
          "type": "EXPLICIT_INTEREST|PAIN_POINT|BUDGET_MENTION|TIMELINE_MENTION|DECISION_MAKER|FOLLOW_UP_REQUEST",
          "content": "Exact quote or close paraphrase from transcript",
          "confidence": 0.0-1.0
        }}
      ],
      "estimated_value": null or dollar amount if inferable,
      "confidence_score": 0-100,
      "notes": "Brief 1-2 sentence summary of the opportunity"
    }}
  ],
  "analysis_summary": "2-3 sentence overview of opportunities found"
}}
```

If no opportunities are detected, return:
```json
{{
  "opportunities": [],
  "analysis_summary": "No clear business development opportunities identified in this transcript."
}}
```
""".format(services_context=NGM_SERVICES_CONTEXT, filename="{filename}", meeting_date="{meeting_date}", transcript_content="{transcript_content}")


# =============================================================================
# 2. EMAIL OPPORTUNITY EXTRACTION PROMPT
# =============================================================================

EMAIL_OPPORTUNITY_EXTRACTION = """
# Email Thread Opportunity Analysis

You are analyzing an email thread to identify business development opportunities for Next Generation Medicine (NGM).

{services_context}

## Signal Types to Extract

- **EXPLICIT_INTEREST**: Direct inquiries about services, pricing, getting started
- **PAIN_POINT**: Problems mentioned that NGM can solve
- **BUDGET_MENTION**: Budget discussions, pricing questions
- **TIMELINE_MENTION**: Urgency signals, deadlines mentioned
- **DECISION_MAKER**: Authority signals, team involvement
- **FOLLOW_UP_REQUEST**: Requests for calls, meetings, proposals, information

## Email Thread

**Subject:** {subject}
**Participants:** {participants}
**Date Range:** {date_range}

```
{email_content}
```

## Instructions

Analyze this email conversation and extract opportunities. Consider:
- The full conversation context and progression
- Who initiated contact and their intent
- Response patterns indicating interest level
- Any escalation signals (more detail, specific questions)

## Output Format

Return a JSON object:

```json
{{
  "opportunities": [
    {{
      "contact_name": "Primary contact name",
      "company": "Company name or null",
      "email": "Email address",
      "title": "Title if mentioned or null",
      "opportunity_type": "consulting|membership|report_generator|commons_partnership",
      "signals": [
        {{
          "type": "EXPLICIT_INTEREST|PAIN_POINT|BUDGET_MENTION|TIMELINE_MENTION|DECISION_MAKER|FOLLOW_UP_REQUEST",
          "content": "Quote from email",
          "confidence": 0.0-1.0
        }}
      ],
      "conversation_stage": "initial|ongoing|follow_up|closing",
      "estimated_value": null or dollar amount,
      "confidence_score": 0-100,
      "notes": "Brief summary of opportunity context"
    }}
  ],
  "thread_analysis": {{
    "interest_level": "high|medium|low|none",
    "recommended_action": "What to do next",
    "urgency": "high|medium|low"
  }}
}}
```

If no opportunities found:
```json
{{
  "opportunities": [],
  "thread_analysis": {{
    "interest_level": "none",
    "recommended_action": "No action needed",
    "urgency": "low"
  }}
}}
```
""".format(services_context=NGM_SERVICES_CONTEXT, subject="{subject}", participants="{participants}", date_range="{date_range}", email_content="{email_content}")


# =============================================================================
# 3. OPPORTUNITY CLASSIFICATION PROMPT
# =============================================================================

OPPORTUNITY_CLASSIFICATION = """
# Opportunity Classification

Given the following signals from a potential opportunity, determine the most appropriate NGM service type.

{services_context}

## Signal Patterns by Service Type

### Consulting Signals
- Questions about strategic guidance or advisory
- Practice optimization or transformation interest
- Fractional executive needs
- Protocol development requests
- Business model questions for clinics
- Scaling challenges

### Membership (LIP) Signals
- Interest in clinical knowledge base
- Questions about staying current with research
- Educational content needs
- Community/peer network interest
- General platform inquiry
- CME or certification interest

### Report Generator Signals
- Lab interpretation challenges
- Time spent on patient reports
- Interest in AI for clinical documentation
- Biomarker analysis needs
- Patient communication improvement

### Commons Partnership Signals
- Vendor or product company inquiring
- Interest in reaching longevity clinicians
- Marketing to practitioners
- Partnership or listing requests
- B2B health tech context

## Opportunity Signals

Contact: {contact_name}
Company: {company}
Signals:
{signals_list}

## Instructions

Classify this opportunity into the most appropriate service type. If multiple types apply, choose the PRIMARY type based on strongest signals.

## Output Format

```json
{{
  "primary_type": "consulting|membership|report_generator|commons_partnership",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this classification",
  "secondary_types": ["list of other applicable types or empty"],
  "signal_mapping": {{
    "strongest_signal": "Which signal most influenced classification",
    "supporting_signals": ["Other relevant signals"]
  }}
}}
```
""".format(services_context=NGM_SERVICES_CONTEXT, contact_name="{contact_name}", company="{company}", signals_list="{signals_list}")


# =============================================================================
# 4. CONFIDENCE SCORING PROMPT
# =============================================================================

CONFIDENCE_SCORING = """
# Opportunity Confidence Scoring

Calculate a confidence score (0-100) for this business development opportunity based on the strength and quality of signals.

## Scoring Framework

### High Confidence Indicators (Add 15-25 points each)
- EXPLICIT_INTEREST with specific service mentioned (+20-25)
- DECISION_MAKER confirmed (+15-20)
- BUDGET_MENTION with specific numbers (+20)
- TIMELINE_MENTION with specific date (+15)
- FOLLOW_UP_REQUEST for proposal/meeting (+15-20)

### Medium Confidence Indicators (Add 8-15 points each)
- EXPLICIT_INTEREST general inquiry (+10-15)
- PAIN_POINT clearly articulated (+10-15)
- BUDGET_MENTION vague but present (+8-12)
- Multiple signals present (+10)
- Ongoing conversation (not cold) (+10)

### Low Confidence Indicators (Add 3-8 points each)
- PAIN_POINT mentioned in passing (+5-8)
- General interest without specifics (+5)
- Cold outreach with interest (+3-5)

### Confidence Modifiers
- Contact is verified decision-maker: +15
- Company size/budget capacity visible: +10
- Previous interaction history: +10
- Referral introduction: +15
- Cold contact, no response: -10
- Vague or unclear signals: -10
- Competitor mentioned positively: -5

## Opportunity Details

Contact: {contact_name}
Company: {company}
Type: {opportunity_type}
Source: {source_type}

Signals:
{signals_list}

Additional Context:
{additional_context}

## Instructions

Calculate a confidence score with detailed reasoning. The score should reflect:
1. Likelihood this is a real opportunity (not noise)
2. Likelihood of conversion given signal strength
3. Quality and clarity of the signals

## Output Format

```json
{{
  "confidence_score": 0-100,
  "score_breakdown": {{
    "base_score": "Starting score based on signal count",
    "signal_additions": [
      {{"signal": "signal type", "points": "+X", "reason": "why"}}
    ],
    "modifiers_applied": [
      {{"modifier": "description", "points": "+/-X"}}
    ],
    "final_calculation": "base + additions + modifiers = final"
  }},
  "confidence_level": "high|medium|low",
  "confidence_reasoning": "2-3 sentence explanation of the score",
  "recommended_priority": "high|medium|low",
  "next_best_action": "What to do with this opportunity"
}}
```
""".format(contact_name="{contact_name}", company="{company}", opportunity_type="{opportunity_type}", source_type="{source_type}", signals_list="{signals_list}", additional_context="{additional_context}")


# =============================================================================
# PROMPT FORMATTING HELPERS
# =============================================================================

def format_transcript_prompt(
    transcript_content: str,
    filename: str,
    meeting_date: str = "Unknown"
) -> str:
    """
    Format the transcript extraction prompt with provided content.
    
    Args:
        transcript_content: Full transcript text
        filename: Original filename
        meeting_date: Date of meeting if known
        
    Returns:
        Formatted prompt string
    """
    return TRANSCRIPT_OPPORTUNITY_EXTRACTION.format(
        filename=filename,
        meeting_date=meeting_date,
        transcript_content=transcript_content[:15000]  # Truncate if too long
    )


def format_email_prompt(
    email_content: str,
    subject: str,
    participants: str,
    date_range: str
) -> str:
    """
    Format the email extraction prompt with provided content.
    
    Args:
        email_content: Email thread content
        subject: Email subject line
        participants: List of participants
        date_range: Date range of conversation
        
    Returns:
        Formatted prompt string
    """
    return EMAIL_OPPORTUNITY_EXTRACTION.format(
        email_content=email_content[:10000],
        subject=subject,
        participants=participants,
        date_range=date_range
    )


def format_classification_prompt(
    contact_name: str,
    company: str,
    signals: list
) -> str:
    """
    Format the classification prompt with opportunity data.
    
    Args:
        contact_name: Name of the contact
        company: Company name
        signals: List of signal dicts with type and content
        
    Returns:
        Formatted prompt string
    """
    signals_list = "\n".join([
        f"- {sig['type']}: \"{sig['content']}\" (confidence: {sig.get('confidence', 0.5)})"
        for sig in signals
    ])
    
    return OPPORTUNITY_CLASSIFICATION.format(
        contact_name=contact_name,
        company=company or "Unknown",
        signals_list=signals_list
    )


def format_scoring_prompt(
    contact_name: str,
    company: str,
    opportunity_type: str,
    source_type: str,
    signals: list,
    additional_context: str = ""
) -> str:
    """
    Format the confidence scoring prompt.
    
    Args:
        contact_name: Name of the contact
        company: Company name
        opportunity_type: Type of opportunity
        source_type: Source (transcript, email, etc.)
        signals: List of signal dicts
        additional_context: Any additional context
        
    Returns:
        Formatted prompt string
    """
    signals_list = "\n".join([
        f"- {sig['type']}: \"{sig['content']}\""
        for sig in signals
    ])
    
    return CONFIDENCE_SCORING.format(
        contact_name=contact_name,
        company=company or "Unknown",
        opportunity_type=opportunity_type,
        source_type=source_type,
        signals_list=signals_list,
        additional_context=additional_context or "None provided"
    )


# =============================================================================
# USAGE EXAMPLES
# =============================================================================

USAGE_EXAMPLES = """
## Prompt Library Usage

### Transcript Analysis
```python
from prompts import format_transcript_prompt

prompt = format_transcript_prompt(
    transcript_content=transcript_text,
    filename="Meeting-2024-01-15.docx",
    meeting_date="2024-01-15"
)
# Send prompt to Claude, parse JSON response
```

### Email Analysis
```python
from prompts import format_email_prompt

prompt = format_email_prompt(
    email_content=thread_content,
    subject="Re: Longevity Platform Demo",
    participants="john@clinic.com, anant@ngm.co",
    date_range="Jan 10-15, 2024"
)
```

### Classification
```python
from prompts import format_classification_prompt

prompt = format_classification_prompt(
    contact_name="Dr. Jane Smith",
    company="Smith Wellness Clinic",
    signals=[
        {"type": "EXPLICIT_INTEREST", "content": "Interested in your lab report tool"},
        {"type": "PAIN_POINT", "content": "Spending 45 mins per patient report"}
    ]
)
```

### Confidence Scoring
```python
from prompts import format_scoring_prompt

prompt = format_scoring_prompt(
    contact_name="Dr. Jane Smith",
    company="Smith Wellness Clinic",
    opportunity_type="membership",
    source_type="email",
    signals=[...],
    additional_context="Referred by existing member"
)
```
"""


# =============================================================================
# ITERATIVE EXTRACTION PROMPTS (Haiku 4.5 Optimized)
# =============================================================================

ITERATIVE_EXTRACTION_PROMPT = """
# Business Opportunity Extraction

Analyze this meeting transcript and extract ALL business opportunities for Next Generation Medicine (NGM).

## NGM Services
- **Consulting**: Strategy, advisory, practice transformation ($2.5K-$75K)
- **Membership (LIP)**: Platform access, lab reports, education ($299-$599/mo)
- **Report Generator**: AI lab report tool (part of LIP or enterprise)
- **Commons Partnership**: Vendor listings for companies ($5K-$12.5K/year)
- **Enterprise**: API access, white-label, multi-provider ($5K-$50K/year)

## Signal Types to Extract
- EXPLICIT_INTEREST: Direct questions about services, pricing, getting started
- PAIN_POINT: Problems NGM can solve (time on reports, scaling, training)
- BUDGET_MENTION: Any discussion of money, pricing, investment
- TIMELINE_MENTION: Urgency ("need this soon", "Q1 launch", "this year")
- DECISION_MAKER: Authority signals ("my practice", "we're looking to", CEO/founder)
- FOLLOW_UP_REQUEST: Asks for proposal, demo, documentation, next call
- REFERRAL: Mentions who referred them or how they found NGM

## CRITICAL REQUIREMENTS
1. Extract EXACT QUOTES from the transcript for each signal (copy-paste, not paraphrase)
2. Only include opportunities where there's genuine interest, not casual mentions
3. Contact name must be in "FirstName LastName" format
4. Provide reasoning for opportunity type classification

## Transcript
```
{transcript}
```

## Output Format
Return ONLY valid JSON with this exact structure:

```json
{{
  "opportunities": [
    {{
      "contact": {{
        "name": "FirstName LastName",
        "company": "Company Name or null",
        "email": "email@example.com or null",
        "title": "Job Title or null"
      }},
      "opportunity_type": "consulting|membership|report_generator|commons_partnership|enterprise",
      "classification_reasoning": "1-2 sentences explaining why this type",
      "classification_confidence": 0.0-1.0,
      "signals": [
        {{
          "type": "SIGNAL_TYPE",
          "quote": "EXACT quote from transcript",
          "confidence": 0.0-1.0
        }}
      ],
      "estimated_value_usd": null or number,
      "urgency": "high|medium|low",
      "next_action": "Specific recommended action",
      "notes": "Brief context summary"
    }}
  ],
  "no_opportunity_reason": "If no opportunities, explain why (e.g., internal meeting, social call)"
}}
```

If there are NO business opportunities, return:
```json
{{
  "opportunities": [],
  "no_opportunity_reason": "Explanation of why no opportunities found"
}}
```
"""


ITERATIVE_REFINEMENT_PROMPT = """
# Refine Business Opportunity Extraction

Your previous extraction had quality issues that need to be fixed.

## Previous Extraction
```json
{original_result}
```

## Quality Issues to Fix
{feedback}

## Original Transcript
```
{transcript}
```

## Instructions
1. Fix ALL the issues listed above
2. For missing quotes: Find and copy the EXACT text from the transcript
3. For incomplete names: Search the transcript for the full "FirstName LastName"
4. For missing reasoning: Add 1-2 sentences explaining the opportunity type choice
5. Do NOT invent or hallucinate any information not in the transcript

## Output
Return the corrected JSON with the same structure as before.
Ensure all quotes exist verbatim in the transcript.
"""


ITERATIVE_EVALUATION_PROMPT = """
# Evaluate Extraction Quality

Verify this opportunity extraction against the source transcript.

## Extraction to Evaluate
```json
{extraction}
```

## Source Transcript
```
{transcript}
```

## Evaluation Criteria
1. **Quote Accuracy**: Do all quotes exist verbatim in the transcript?
2. **Contact Completeness**: Is the name in "FirstName LastName" format?
3. **Signal Relevance**: Are signals actually indicating business interest?
4. **Classification Logic**: Does the reasoning support the opportunity type?
5. **No Hallucination**: Is all information traceable to the transcript?

## Output Format
```json
{{
  "overall_pass": true/false,
  "score": 0.0-1.0,
  "checks": {{
    "quote_accuracy": {{"pass": true/false, "issues": []}},
    "contact_completeness": {{"pass": true/false, "issues": []}},
    "signal_relevance": {{"pass": true/false, "issues": []}},
    "classification_logic": {{"pass": true/false, "issues": []}},
    "no_hallucination": {{"pass": true/false, "issues": []}}
  }},
  "suggestions": ["specific improvement suggestions"]
}}
```
"""
