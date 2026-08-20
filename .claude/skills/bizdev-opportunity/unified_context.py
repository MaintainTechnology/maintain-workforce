"""
Unified Context Aggregator for BizDev Opportunity Intelligence

Cross-references BOTH meeting transcripts AND emails to build complete
context for each opportunity before drafting emails or proposals.

Workflow:
1. For transcript-sourced opportunities: Search for related emails
2. For email-sourced opportunities: Search for related transcripts
3. Merge all context into unified opportunity profile
4. Pass complete context to email/proposal drafters

This ensures:
- Follow-up emails reference both meeting discussions AND email history
- Proposals incorporate pain points from ALL touchpoints
- No context is lost between sources
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field


# =============================================================================
# UNIFIED CONTEXT DATA STRUCTURE
# =============================================================================

@dataclass
class TranscriptContext:
    """Context extracted from a meeting transcript."""
    transcript_id: str
    transcript_name: str
    meeting_date: str
    participants: List[str] = field(default_factory=list)
    pain_points: List[str] = field(default_factory=list)
    interests: List[str] = field(default_factory=list)
    commitments: List[str] = field(default_factory=list)
    key_quotes: List[str] = field(default_factory=list)
    next_steps: List[str] = field(default_factory=list)
    pricing_discussed: Optional[str] = None
    summary: str = ""


@dataclass
class EmailContext:
    """Context extracted from email exchanges."""
    thread_count: int = 0
    exchange_count: int = 0
    last_contact_date: Optional[str] = None
    days_since_contact: Optional[int] = None
    conversation_stage: str = "new"
    subjects: List[str] = field(default_factory=list)
    pain_points: List[str] = field(default_factory=list)
    interests: List[str] = field(default_factory=list)
    commitments: List[str] = field(default_factory=list)
    key_excerpts: List[Dict[str, str]] = field(default_factory=list)
    summary: str = ""


@dataclass
class UnifiedOpportunityContext:
    """
    Complete context for an opportunity from ALL sources.

    This is passed to email/proposal drafters to ensure
    they have full context from both transcripts and emails.
    """
    contact_name: str
    contact_email: Optional[str]
    company: Optional[str]
    opportunity_type: str
    confidence_score: float

    # Source tracking
    primary_source: str  # "transcript" or "email"
    transcript_context: Optional[TranscriptContext] = None
    email_context: Optional[EmailContext] = None

    # Merged context (deduplicated from both sources)
    all_pain_points: List[str] = field(default_factory=list)
    all_interests: List[str] = field(default_factory=list)
    all_commitments: List[str] = field(default_factory=list)
    all_key_quotes: List[str] = field(default_factory=list)

    # Relationship timeline
    first_contact_date: Optional[str] = None
    last_contact_date: Optional[str] = None
    total_touchpoints: int = 0

    # Recommendations
    recommended_email_type: str = "cold"
    recommended_pricing_tier: str = "mid"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "contact": {
                "name": self.contact_name,
                "email": self.contact_email,
                "company": self.company
            },
            "opportunity_type": self.opportunity_type,
            "confidence_score": self.confidence_score,
            "primary_source": self.primary_source,
            "transcript_context": {
                "id": self.transcript_context.transcript_id,
                "name": self.transcript_context.transcript_name,
                "date": self.transcript_context.meeting_date,
                "pain_points": self.transcript_context.pain_points,
                "key_quotes": self.transcript_context.key_quotes,
                "pricing_discussed": self.transcript_context.pricing_discussed,
                "summary": self.transcript_context.summary
            } if self.transcript_context else None,
            "email_context": {
                "thread_count": self.email_context.thread_count,
                "last_contact": self.email_context.last_contact_date,
                "days_since": self.email_context.days_since_contact,
                "stage": self.email_context.conversation_stage,
                "subjects": self.email_context.subjects,
                "summary": self.email_context.summary
            } if self.email_context else None,
            "merged_context": {
                "pain_points": self.all_pain_points,
                "interests": self.all_interests,
                "commitments": self.all_commitments,
                "key_quotes": self.all_key_quotes
            },
            "timeline": {
                "first_contact": self.first_contact_date,
                "last_contact": self.last_contact_date,
                "total_touchpoints": self.total_touchpoints
            },
            "recommendations": {
                "email_type": self.recommended_email_type,
                "pricing_tier": self.recommended_pricing_tier
            }
        }


# =============================================================================
# CONTEXT AGGREGATION WORKFLOW
# =============================================================================

def generate_unified_context_workflow(
    contact_name: str,
    contact_email: Optional[str] = None,
    company: Optional[str] = None,
    primary_source: str = "transcript",
    transcript_folder_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate workflow for building unified context from both sources.

    This returns instructions for Claude to:
    1. Search transcripts for this contact
    2. Search emails for this contact
    3. Merge all context

    Args:
        contact_name: Contact's full name
        contact_email: Contact's email (if known)
        company: Contact's company (if known)
        primary_source: Where opportunity was first found
        transcript_folder_id: Google Drive folder ID for transcripts

    Returns:
        Workflow instructions dict
    """
    return {
        "contact": {
            "name": contact_name,
            "email": contact_email,
            "company": company
        },
        "primary_source": primary_source,
        "workflow": f"""
## Unified Context Aggregation for {contact_name}

### Overview
Build complete context by cross-referencing BOTH transcripts AND emails
before drafting any outreach.

---

### Step 1: Search Meeting Transcripts

Search Google Drive for transcripts mentioning this contact:

```python
# Using Google Drive MCP
mcp__google-drive__list_files(folder_id="{transcript_folder_id or 'TRANSCRIPT_FOLDER_ID'}")

# Filter for files containing contact name
# Look for: "{contact_name}" in filename or content
# Also search for: "{company or 'company name'}" if provided
```

For each matching transcript:
- Extract meeting date from filename
- Extract participants
- Find pain points (look for: struggling, challenge, problem, need)
- Find interests (look for: interested in, want to, looking for)
- Find commitments (look for: will send, will follow up, next step)
- Find pricing discussion (look for: $, price, cost, budget)
- Extract key quotes (direct statements about needs/goals)

---

### Step 2: Search Email History

Search Gmail for all exchanges with this contact:

```python
# Using Gmail API
query = "from:{contact_email} OR to:{contact_email}" if contact_email else '"{contact_name}"'

# Search emails
service.users().messages().list(userId='me', q=query, maxResults=20)

# For each thread, extract:
# - Subject line
# - Last contact date
# - Key excerpts
# - Commitments made
# - Pain points mentioned
```

Calculate conversation stage:
- NEW: No emails found
- WARM: Last contact < 14 days
- COOLING: 15-30 days
- STALE: 31-90 days
- COLD: 90+ days

---

### Step 3: Merge Context

Combine findings from both sources:

```python
unified = UnifiedOpportunityContext(
    contact_name="{contact_name}",
    contact_email="{contact_email}",
    company="{company}",
    opportunity_type=detected_type,
    confidence_score=calculated_score,
    primary_source="{primary_source}",
    transcript_context=transcript_data,
    email_context=email_data
)

# Merge and deduplicate pain points, interests, etc.
unified.all_pain_points = list(set(
    transcript_data.pain_points + email_data.pain_points
))
# ... same for interests, commitments, quotes
```

---

### Step 4: Determine Recommendations

Based on merged context:

**Email Type:**
- If email_context.stage == "new" AND no transcript: "cold"
- If email_context.stage in ["warm", "cooling"]: "warm"
- If transcript recent (< 14 days): "warm"
- If email_context.stage == "stale": "reengagement"

**Pricing Tier:**
- If pricing_discussed in transcript: use that tier
- If pain points indicate budget constraints: "low"
- If interests indicate comprehensive needs: "high"
- Default: "mid"

---

### Step 5: Output Unified Context

Return complete context for email/proposal drafting:

```json
{{
    "contact": {{
        "name": "{contact_name}",
        "email": "{contact_email}",
        "company": "{company}"
    }},
    "merged_context": {{
        "pain_points": ["from transcript...", "from email..."],
        "interests": ["..."],
        "commitments": ["..."],
        "key_quotes": ["..."]
    }},
    "recommendations": {{
        "email_type": "warm",
        "pricing_tier": "mid"
    }}
}}
```

---

### Usage in Email Drafting

When drafting the email, reference ALL context:

```
## From Transcript (if available):
- Meeting date: [date]
- Key quotes: [quotes]
- Pricing discussed: [amount]

## From Emails (if available):
- Last contact: [days] days ago
- Recent subjects: [subjects]
- Open commitments: [commitments]

## Merged Pain Points (deduplicated):
- [pain point 1]
- [pain point 2]
```

This ensures the email/proposal references the COMPLETE relationship history.
"""
    }


# =============================================================================
# TRANSCRIPT SEARCH HELPERS
# =============================================================================

def build_transcript_search_patterns(
    contact_name: str,
    company: Optional[str] = None
) -> List[str]:
    """
    Build search patterns for finding transcripts mentioning a contact.

    Args:
        contact_name: Contact's full name
        company: Contact's company

    Returns:
        List of search patterns to try
    """
    patterns = []

    # Name-based patterns
    name_parts = contact_name.split()
    if len(name_parts) >= 2:
        first_name = name_parts[0]
        last_name = name_parts[-1]
        patterns.extend([
            f"*{first_name}*{last_name}*",
            f"*{last_name}*{first_name}*",
            f"*{first_name}*",
            f"*{last_name}*"
        ])
    else:
        patterns.append(f"*{contact_name}*")

    # Company-based patterns
    if company:
        company_slug = company.lower().replace(" ", "").replace(",", "")[:15]
        patterns.append(f"*{company_slug}*")

    return patterns


def extract_transcript_context(
    transcript_text: str,
    transcript_name: str,
    transcript_id: str
) -> TranscriptContext:
    """
    Extract structured context from transcript text.

    This is a helper that can be used after reading transcript content.

    Args:
        transcript_text: Full transcript text
        transcript_name: Transcript filename
        transcript_id: Transcript file ID

    Returns:
        TranscriptContext with extracted data
    """
    # Date extraction from filename
    import re
    date_match = re.search(r'(\d{4}-\d{2}-\d{2}|\d{4}/\d{2}/\d{2})', transcript_name)
    meeting_date = date_match.group(1) if date_match else "Unknown"

    # Pain point extraction
    pain_keywords = [
        "struggling with", "challenge", "problem", "frustrated",
        "difficult", "time-consuming", "need help", "pain point"
    ]
    pain_points = []
    for keyword in pain_keywords:
        if keyword.lower() in transcript_text.lower():
            # Find sentence containing keyword
            sentences = transcript_text.split('.')
            for sent in sentences:
                if keyword.lower() in sent.lower():
                    clean_sent = sent.strip()[:200]
                    if clean_sent and clean_sent not in pain_points:
                        pain_points.append(clean_sent)

    # Interest extraction
    interest_keywords = [
        "interested in", "want to", "looking for", "curious about",
        "would like to", "considering", "exploring"
    ]
    interests = []
    for keyword in interest_keywords:
        if keyword.lower() in transcript_text.lower():
            sentences = transcript_text.split('.')
            for sent in sentences:
                if keyword.lower() in sent.lower():
                    clean_sent = sent.strip()[:200]
                    if clean_sent and clean_sent not in interests:
                        interests.append(clean_sent)

    # Commitment extraction
    commitment_keywords = [
        "will send", "will follow up", "i'll share", "let me send",
        "next step", "schedule", "i'll email"
    ]
    commitments = []
    for keyword in commitment_keywords:
        if keyword.lower() in transcript_text.lower():
            sentences = transcript_text.split('.')
            for sent in sentences:
                if keyword.lower() in sent.lower():
                    clean_sent = sent.strip()[:200]
                    if clean_sent and clean_sent not in commitments:
                        commitments.append(clean_sent)

    # Pricing extraction
    pricing_patterns = [
        r'\$[\d,]+(?:/mo(?:nth)?)?',
        r'[\d,]+\s*(?:dollars|USD)',
        r'(?:price|cost|budget)[^\n]{0,100}'
    ]
    pricing_discussed = None
    for pattern in pricing_patterns:
        match = re.search(pattern, transcript_text, re.IGNORECASE)
        if match:
            pricing_discussed = match.group(0)[:100]
            break

    return TranscriptContext(
        transcript_id=transcript_id,
        transcript_name=transcript_name,
        meeting_date=meeting_date,
        pain_points=pain_points[:5],
        interests=interests[:5],
        commitments=commitments[:5],
        pricing_discussed=pricing_discussed,
        summary=f"Meeting on {meeting_date}. Found {len(pain_points)} pain points, {len(interests)} interests."
    )


# =============================================================================
# CONTEXT MERGING
# =============================================================================

def merge_contexts(
    transcript_ctx: Optional[TranscriptContext],
    email_ctx: Optional[EmailContext],
    contact_name: str,
    contact_email: Optional[str],
    company: Optional[str],
    opportunity_type: str,
    confidence_score: float,
    primary_source: str
) -> UnifiedOpportunityContext:
    """
    Merge transcript and email contexts into unified context.

    Args:
        transcript_ctx: Context from transcript (or None)
        email_ctx: Context from emails (or None)
        contact_name: Contact's name
        contact_email: Contact's email
        company: Contact's company
        opportunity_type: Detected opportunity type
        confidence_score: Confidence score
        primary_source: Where opportunity was first found

    Returns:
        UnifiedOpportunityContext with merged data
    """
    # Merge pain points (deduplicate)
    all_pain_points = []
    if transcript_ctx:
        all_pain_points.extend(transcript_ctx.pain_points)
    if email_ctx:
        all_pain_points.extend(email_ctx.pain_points)
    all_pain_points = list(set(all_pain_points))[:10]

    # Merge interests
    all_interests = []
    if transcript_ctx:
        all_interests.extend(transcript_ctx.interests)
    if email_ctx:
        all_interests.extend(email_ctx.interests)
    all_interests = list(set(all_interests))[:10]

    # Merge commitments
    all_commitments = []
    if transcript_ctx:
        all_commitments.extend(transcript_ctx.commitments)
    if email_ctx:
        all_commitments.extend(email_ctx.commitments)
    all_commitments = list(set(all_commitments))[:10]

    # Merge quotes
    all_quotes = []
    if transcript_ctx:
        all_quotes.extend(transcript_ctx.key_quotes)
    all_quotes = all_quotes[:10]

    # Determine email type
    email_type = "cold"
    if email_ctx and email_ctx.days_since_contact:
        if email_ctx.days_since_contact <= 14:
            email_type = "warm"
        elif email_ctx.days_since_contact <= 90:
            email_type = "reengagement"
    elif transcript_ctx:
        # Recent transcript makes it warm
        email_type = "warm"

    # Determine pricing tier
    pricing_tier = "mid"
    if transcript_ctx and transcript_ctx.pricing_discussed:
        # Extract amount and determine tier
        import re
        amount_match = re.search(r'\$?([\d,]+)', transcript_ctx.pricing_discussed)
        if amount_match:
            amount = int(amount_match.group(1).replace(',', ''))
            if amount < 3000:
                pricing_tier = "low"
            elif amount > 10000:
                pricing_tier = "high"

    # Calculate timeline
    first_contact = None
    last_contact = None
    touchpoints = 0

    if transcript_ctx:
        touchpoints += 1
        last_contact = transcript_ctx.meeting_date
        first_contact = transcript_ctx.meeting_date

    if email_ctx:
        touchpoints += email_ctx.exchange_count
        if email_ctx.last_contact_date:
            if not last_contact or email_ctx.last_contact_date > last_contact:
                last_contact = email_ctx.last_contact_date

    return UnifiedOpportunityContext(
        contact_name=contact_name,
        contact_email=contact_email,
        company=company,
        opportunity_type=opportunity_type,
        confidence_score=confidence_score,
        primary_source=primary_source,
        transcript_context=transcript_ctx,
        email_context=email_ctx,
        all_pain_points=all_pain_points,
        all_interests=all_interests,
        all_commitments=all_commitments,
        all_key_quotes=all_quotes,
        first_contact_date=first_contact,
        last_contact_date=last_contact,
        total_touchpoints=touchpoints,
        recommended_email_type=email_type,
        recommended_pricing_tier=pricing_tier
    )


# =============================================================================
# PROMPT GENERATION WITH UNIFIED CONTEXT
# =============================================================================

def generate_email_prompt_with_unified_context(
    unified_context: UnifiedOpportunityContext
) -> str:
    """
    Generate email drafting prompt that includes ALL context.

    Args:
        unified_context: Complete unified context

    Returns:
        Prompt string for email generation
    """
    # Build transcript section
    transcript_section = ""
    if unified_context.transcript_context:
        tc = unified_context.transcript_context
        transcript_section = f"""
## Context from Meeting Transcript

**Meeting:** {tc.transcript_name}
**Date:** {tc.meeting_date}

**Key Quotes from Meeting:**
{chr(10).join(f'- "{q}"' for q in tc.key_quotes[:3]) if tc.key_quotes else "- No specific quotes captured"}

**Pain Points Discussed:**
{chr(10).join(f'- {p}' for p in tc.pain_points[:3]) if tc.pain_points else "- None explicitly mentioned"}

**Commitments Made:**
{chr(10).join(f'- {c}' for c in tc.commitments[:3]) if tc.commitments else "- None"}

**Pricing Discussed:** {tc.pricing_discussed or "Not discussed"}
"""

    # Build email section
    email_section = ""
    if unified_context.email_context:
        ec = unified_context.email_context
        email_section = f"""
## Context from Email History

**Conversation Stage:** {ec.conversation_stage}
**Last Contact:** {ec.days_since_contact} days ago ({ec.last_contact_date})
**Total Exchanges:** {ec.exchange_count} emails across {ec.thread_count} threads

**Recent Email Subjects:**
{chr(10).join(f'- {s}' for s in ec.subjects[:3]) if ec.subjects else "- No recent threads"}

**Open Commitments from Emails:**
{chr(10).join(f'- {c}' for c in ec.commitments[:3]) if ec.commitments else "- None"}

**Interests Expressed:**
{chr(10).join(f'- {i}' for i in ec.interests[:3]) if ec.interests else "- None explicit"}
"""

    # Build merged section
    merged_section = f"""
## MERGED CONTEXT (Deduplicated from All Sources)

**All Pain Points Identified:**
{chr(10).join(f'- {p}' for p in unified_context.all_pain_points[:5]) if unified_context.all_pain_points else "- None identified"}

**All Interests:**
{chr(10).join(f'- {i}' for i in unified_context.all_interests[:5]) if unified_context.all_interests else "- None identified"}

**All Open Commitments:**
{chr(10).join(f'- {c}' for c in unified_context.all_commitments[:5]) if unified_context.all_commitments else "- None"}

**Relationship Timeline:**
- First contact: {unified_context.first_contact_date or "Unknown"}
- Last contact: {unified_context.last_contact_date or "Unknown"}
- Total touchpoints: {unified_context.total_touchpoints}
"""

    prompt = f"""Draft an email for {unified_context.contact_name} ({unified_context.opportunity_type} opportunity).

## Contact Information
- Name: {unified_context.contact_name}
- Email: {unified_context.contact_email or "Unknown"}
- Company: {unified_context.company or "Unknown"}

## Opportunity Details
- Type: {unified_context.opportunity_type}
- Confidence: {unified_context.confidence_score:.0%}
- Recommended Email Type: {unified_context.recommended_email_type}
- Recommended Pricing Tier: {unified_context.recommended_pricing_tier}

{transcript_section}

{email_section}

{merged_section}

## CRITICAL REQUIREMENTS

1. **Reference BOTH sources** - If we have transcript AND email history, mention insights from both
2. **Use specific quotes** - Reference their actual words from meetings/emails
3. **Address open commitments** - If commitments were made, acknowledge them
4. **Match conversation stage** - {unified_context.recommended_email_type} email tone
5. **Stay under word limit** - {"150-200 words" if unified_context.recommended_email_type == "cold" else "200-280 words"}

## Output Format

```
Subject: [Subject line that references recent context]

[Email body that weaves in context from ALL touchpoints]

[Single clear CTA]

Anant
```
"""
    return prompt


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

UNIFIED_CONTEXT_WORKFLOW = """
## Unified Context Aggregator - Usage Guide

### Purpose

Ensures email/proposal drafting considers BOTH meeting transcripts AND email
history for complete context. No more writing follow-up emails that ignore
what was discussed in meetings, or proposals that miss pain points from emails.

### Basic Usage

```python
from unified_context import (
    generate_unified_context_workflow,
    merge_contexts,
    generate_email_prompt_with_unified_context
)

# 1. Generate workflow for context gathering
workflow = generate_unified_context_workflow(
    contact_name="Matt Vail",
    contact_email="matt@theodorehealthinc.com",
    company="Theodore Health",
    primary_source="email",
    transcript_folder_id="1CfvHgljboEJy9TB29ZvUp6nIavgODDkI"
)

# 2. Claude executes the workflow steps:
#    - Search transcripts for Matt Vail
#    - Search emails for matt@theodorehealthinc.com
#    - Extract context from both

# 3. Merge contexts
unified = merge_contexts(
    transcript_ctx=transcript_data,  # From transcript search
    email_ctx=email_data,            # From email search
    contact_name="Matt Vail",
    contact_email="matt@theodorehealthinc.com",
    company="Theodore Health",
    opportunity_type="enterprise",
    confidence_score=0.75,
    primary_source="email"
)

# 4. Generate email prompt with ALL context
prompt = generate_email_prompt_with_unified_context(unified)

# 5. Draft email using complete context
```

### Integration Points

**With Iterative Scanner:**
After extracting opportunity from transcript, call unified context workflow
to also search emails before drafting.

**With Email Scanner:**
After finding opportunity in email, call unified context workflow to also
search transcripts before drafting.

**With Email Drafter:**
Replace generate_email_prompt() with generate_email_prompt_with_unified_context()
to ensure all context is included.

**With Proposal Bridge:**
Pass unified_context.to_dict() to proposal generator for complete context.
"""
