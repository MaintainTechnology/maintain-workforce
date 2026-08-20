"""
Email Scanner for Gmail

Scans Gmail inbox and threads to extract business development 
opportunities using LLM-based analysis.

This module provides instructions for Claude to:
1. Search emails using Gmail MCP tools
2. Process email threads for conversation context
3. Extract opportunity signals using structured prompts
4. Deduplicate opportunities from the same conversation
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Set

# Import types from parent directory (reference only)
"""
from ..types import (
    Opportunity, ContactInfo, Signal,
    OpportunityType, PipelineStage, SignalType, SourceType
)
"""


# =============================================================================
# EMAIL OPPORTUNITY EXTRACTION PROMPT
# =============================================================================

EMAIL_OPPORTUNITY_EXTRACTION_PROMPT = """
Analyze this email thread to identify business development opportunities for NGM services.

**NGM Service Types:**
1. **Consulting** ($2,500-$75,000): Strategy sessions, advisory retainers, practice transformation
2. **Membership** ($299-$599/month): Longevity Intelligence Platform access
3. **Report Generator**: AI lab report capability (part of LIP or standalone)
4. **Commons Partnership** ($5,000-$12,500/year): Vendor profiles on NGM Commons

**Signal Types to Look For:**
- EXPLICIT_INTEREST: Direct questions about services, pricing, how to get started
- PAIN_POINT: Problems mentioned that NGM can solve
- BUDGET_MENTION: Discussion of budget, pricing expectations
- TIMELINE_MENTION: Urgency indicators
- DECISION_MAKER: Signs they can make purchasing decisions
- FOLLOW_UP_REQUEST: Requests for more info, calls, meetings

**Email Thread:**
{email_content}

**Thread Subject:** {subject}
**Participants:** {participants}
**Date Range:** {date_range}

**Instructions:**
Extract all potential opportunities from this email thread. Consider the full conversation context.

```json
{{
  "opportunities": [
    {{
      "contact_name": "Primary contact name",
      "company": "Company if mentioned",
      "email": "Contact email address",
      "title": "Title/role if mentioned",
      "opportunity_type": "consulting|membership|report_generator|commons_partnership",
      "signals": [
        {{
          "type": "EXPLICIT_INTEREST|PAIN_POINT|BUDGET_MENTION|TIMELINE_MENTION|DECISION_MAKER|FOLLOW_UP_REQUEST",
          "content": "Relevant quote from email",
          "confidence": 0.0-1.0
        }}
      ],
      "confidence_score": 0-100,
      "conversation_stage": "initial|ongoing|follow_up|closing",
      "notes": "Summary of the opportunity context"
    }}
  ]
}}
```

If no opportunities are found, return: {{"opportunities": []}}
"""


# =============================================================================
# SEARCH QUERY PATTERNS
# =============================================================================

# Default search terms for opportunity detection
DEFAULT_OPPORTUNITY_SEARCH_TERMS = [
    "longevity medicine",
    "functional medicine practice",
    "consulting opportunity",
    "platform demo",
    "interested in learning",
    "membership",
    "lab reports",
    "AI for clinic",
    "partnership",
    "vendor profile",
    "NGM",
    "Next Generation Medicine"
]

# Email search patterns for different opportunity types
OPPORTUNITY_SEARCH_PATTERNS = {
    "consulting": [
        "advisory",
        "consulting",
        "strategy session",
        "fractional CMO",
        "clinic optimization",
        "practice growth"
    ],
    "membership": [
        "platform",
        "membership",
        "LIP",
        "Longevity Intelligence",
        "clinical protocols",
        "education"
    ],
    "report_generator": [
        "lab reports",
        "lab interpretation",
        "patient reports",
        "AI reports",
        "biomarkers"
    ],
    "commons_partnership": [
        "vendor",
        "partner",
        "product listing",
        "NGM Commons",
        "clinician directory"
    ]
}


# =============================================================================
# SCANNER FUNCTIONS
# =============================================================================

def get_lookback_date(lookback_months: int) -> str:
    """
    Calculate the cutoff date for lookback period.
    
    Args:
        lookback_months: Number of months to look back
        
    Returns:
        Date string in YYYY-MM-DD format
    """
    cutoff = datetime.now() - timedelta(days=lookback_months * 30)
    return cutoff.strftime("%Y-%m-%d")


def build_gmail_search_query(
    search_terms: Optional[List[str]] = None,
    opportunity_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> str:
    """
    Build Gmail search query string.
    
    Args:
        search_terms: Custom search terms
        opportunity_type: Type to focus on (uses OPPORTUNITY_SEARCH_PATTERNS)
        date_from: Start date YYYY-MM-DD
        date_to: End date YYYY-MM-DD
        
    Returns:
        Gmail search query string
    """
    parts = []
    
    # Add search terms
    if search_terms:
        term_query = " OR ".join(f'"{term}"' for term in search_terms)
        parts.append(f"({term_query})")
    elif opportunity_type and opportunity_type in OPPORTUNITY_SEARCH_PATTERNS:
        terms = OPPORTUNITY_SEARCH_PATTERNS[opportunity_type]
        term_query = " OR ".join(f'"{term}"' for term in terms)
        parts.append(f"({term_query})")
    
    # Add date filters
    if date_from:
        parts.append(f"after:{date_from.replace('-', '/')}")
    if date_to:
        parts.append(f"before:{date_to.replace('-', '/')}")
    
    # Exclude certain labels
    parts.append("-label:spam")
    parts.append("-label:trash")
    
    return " ".join(parts)


def scan_emails(
    lookback_months: int = 6,
    search_terms: Optional[List[str]] = None,
    opportunity_type: Optional[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Instructions for scanning emails for opportunities.
    
    Args:
        lookback_months: How many months back to scan
        search_terms: Custom search terms (uses defaults if not provided)
        opportunity_type: Focus on specific opportunity type
        limit: Maximum threads to process
        
    Returns:
        Dict with scanning workflow instructions
    """
    date_from = get_lookback_date(lookback_months)
    
    # Use default terms if none provided
    if not search_terms and not opportunity_type:
        search_terms = DEFAULT_OPPORTUNITY_SEARCH_TERMS
    
    search_query = build_gmail_search_query(
        search_terms=search_terms,
        opportunity_type=opportunity_type,
        date_from=date_from
    )
    
    return {
        "workflow": [
            {
                "step": 1,
                "action": "Search email threads",
                "tool": "mcp__gmail__search_threads",
                "params": {
                    "search_query": search_query,
                    "limit": limit
                },
                "note": "Get threads matching opportunity-related terms"
            },
            {
                "step": 2,
                "action": "For each thread, get full content",
                "tool": "mcp__gmail__get_email_content",
                "note": "Get complete email content for analysis"
            },
            {
                "step": 3,
                "action": "Extract opportunities",
                "function": "extract_opportunities_from_email",
                "note": "Use EMAIL_OPPORTUNITY_EXTRACTION_PROMPT for each thread"
            },
            {
                "step": 4,
                "action": "Deduplicate",
                "function": "deduplicate_opportunities",
                "note": "Merge opportunities from same conversation/contact"
            },
            {
                "step": 5,
                "action": "Return results",
                "note": "Combine all unique opportunities"
            }
        ],
        "search_query": search_query,
        "lookback_months": lookback_months,
        "expected_output": {
            "threads_scanned": "int",
            "opportunities_found": "List[Opportunity]",
            "scan_date": "ISO timestamp"
        }
    }


def extract_opportunities_from_email(
    email_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Instructions for extracting opportunities from an email/thread.
    
    Args:
        email_data: Email data from Gmail MCP (id, subject, body, participants, etc.)
        
    Returns:
        Dict with extraction instructions and prompt
    """
    # Format email content for prompt
    subject = email_data.get("subject", "No Subject")
    body = email_data.get("body", "")
    body_html = email_data.get("bodyHtml", "")
    from_addr = email_data.get("from", "")
    to_addr = email_data.get("to", "")
    date = email_data.get("date", "")
    thread_id = email_data.get("threadId", "")
    
    # Prefer plain text body, fall back to HTML
    content = body if body else body_html
    
    # Extract participants
    participants = []
    if from_addr:
        participants.append(from_addr)
    if to_addr:
        participants.extend([p.strip() for p in to_addr.split(",")])
    
    prompt = EMAIL_OPPORTUNITY_EXTRACTION_PROMPT.format(
        email_content=content[:10000],  # Truncate very long threads
        subject=subject,
        participants=", ".join(set(participants)),
        date_range=date
    )
    
    return {
        "prompt": prompt,
        "thread_id": thread_id,
        "email_id": email_data.get("id", ""),
        "output_format": {
            "opportunities": [
                {
                    "contact_name": "string",
                    "company": "string|null",
                    "email": "string",
                    "title": "string|null",
                    "opportunity_type": "OpportunityType enum value",
                    "signals": ["Signal objects"],
                    "confidence_score": "int 0-100",
                    "conversation_stage": "string",
                    "notes": "string"
                }
            ]
        },
        "post_processing": [
            "Create Opportunity objects from extracted data",
            "Set source=SourceType.EMAIL",
            "Set source_id to thread_id",
            "Determine pipeline stage from conversation_stage",
            "Set discovered_at to current timestamp"
        ]
    }


# =============================================================================
# DEDUPLICATION
# =============================================================================

def deduplicate_opportunities(
    opportunities: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Instructions for deduplicating opportunities from same contact/thread.
    
    Deduplication rules:
    1. Same email address = same contact
    2. Same thread_id = same conversation
    3. Merge signals from duplicate entries
    4. Keep highest confidence score
    
    Args:
        opportunities: List of extracted opportunities
        
    Returns:
        Dict with deduplication logic
    """
    return {
        "logic": {
            "step1": "Group opportunities by email address",
            "step2": "For each group, also check thread_id overlap",
            "step3": "Merge duplicate entries:",
            "merge_rules": {
                "contact_info": "Keep most complete (most fields filled)",
                "signals": "Combine all unique signals",
                "confidence_score": "Take maximum",
                "opportunity_type": "If different, prioritize: consulting > membership > report_generator > commons_partnership",
                "notes": "Concatenate with separator"
            },
            "step4": "Return list of unique opportunities"
        },
        "duplicate_keys": [
            "email (primary)",
            "contact_name + company (secondary)",
            "thread_id (for conversation grouping)"
        ],
        "example": {
            "input": [
                {"email": "john@example.com", "thread_id": "t1", "signals": ["A"]},
                {"email": "john@example.com", "thread_id": "t2", "signals": ["B"]},
                {"email": "jane@example.com", "thread_id": "t3", "signals": ["C"]}
            ],
            "output": [
                {"email": "john@example.com", "signals": ["A", "B"]},
                {"email": "jane@example.com", "signals": ["C"]}
            ]
        }
    }


# =============================================================================
# THREAD PROCESSING
# =============================================================================

def process_email_thread(
    thread_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Instructions for processing a complete email thread.
    
    Threads provide conversation context that helps identify:
    - Progression of interest (initial inquiry -> follow-up -> decision)
    - Multiple touchpoints with same contact
    - Response patterns indicating engagement level
    
    Args:
        thread_data: Thread data from Gmail MCP search_threads
        
    Returns:
        Processing instructions
    """
    return {
        "processing_steps": [
            "Sort messages by date (oldest first)",
            "Track conversation progression",
            "Identify initiator vs responder",
            "Look for escalation signals (more detail, specific questions)",
            "Note response time patterns (fast = high interest)"
        ],
        "context_signals": {
            "high_interest": [
                "Multiple responses from prospect",
                "Questions about pricing/timeline",
                "Requests for call/meeting",
                "Sharing of internal context"
            ],
            "medium_interest": [
                "Polite responses",
                "General questions",
                "Request for information"
            ],
            "low_interest": [
                "Single brief response",
                "No follow-up to questions",
                "Long response delays"
            ]
        },
        "stage_mapping": {
            "initial": "First contact, no response yet -> discovered",
            "ongoing": "Active back-and-forth -> engaged",
            "follow_up": "Reengagement after gap -> qualified",
            "closing": "Discussion of specifics/next steps -> proposal_sent"
        }
    }


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def extract_email_address(from_string: str) -> str:
    """
    Extract email address from 'Name <email>' format.
    
    Args:
        from_string: Email from field like 'John Doe <john@example.com>'
        
    Returns:
        Just the email address
    """
    import re
    match = re.search(r'<([^>]+)>', from_string)
    if match:
        return match.group(1)
    # Already just an email
    if '@' in from_string:
        return from_string.strip()
    return ""


def extract_contact_name(from_string: str) -> str:
    """
    Extract name from 'Name <email>' format.
    
    Args:
        from_string: Email from field
        
    Returns:
        Just the name portion
    """
    import re
    match = re.search(r'^([^<]+)', from_string)
    if match:
        name = match.group(1).strip()
        if name and '@' not in name:
            return name
    return ""


def create_opportunity_from_email_extraction(
    extracted: Dict[str, Any],
    thread_id: str,
    email_date: str
) -> Dict[str, Any]:
    """
    Template for converting extracted email opportunity to Opportunity object.
    """
    import uuid
    from datetime import datetime
    
    # Map conversation stage to pipeline stage
    stage_mapping = {
        "initial": "discovered",
        "ongoing": "engaged",
        "follow_up": "qualified",
        "closing": "proposal_sent"
    }
    
    conversation_stage = extracted.get("conversation_stage", "initial")
    pipeline_stage = stage_mapping.get(conversation_stage, "discovered")
    
    return {
        "id": f"OPP-{uuid.uuid4().hex[:8].upper()}",
        "contact": {
            "name": extracted["contact_name"],
            "email": extracted.get("email"),
            "company": extracted.get("company"),
            "title": extracted.get("title")
        },
        "opportunity_type": extracted["opportunity_type"],
        "stage": pipeline_stage,
        "source": "email",
        "source_id": thread_id,
        "signals": [
            {
                "type": sig["type"],
                "content": sig["content"],
                "timestamp": email_date,
                "confidence": sig.get("confidence", 0.5)
            }
            for sig in extracted.get("signals", [])
        ],
        "confidence_score": extracted.get("confidence_score", 50),
        "discovered_at": datetime.now().isoformat(),
        "last_activity": email_date,
        "notes": extracted.get("notes")
    }


# =============================================================================
# EXECUTION INSTRUCTIONS
# =============================================================================

SCANNER_USAGE = """
## How to Use Email Scanner

### Step 1: Search for Relevant Threads
```
Use mcp__gmail__search_threads with search_query from scan_emails()
```

### Step 2: Process Each Thread
1. Get full thread content with mcp__gmail__get_email_content for first message
2. If thread has multiple messages, process each for context
3. Note the conversation progression

### Step 3: Extract Opportunities
Use EMAIL_OPPORTUNITY_EXTRACTION_PROMPT with thread content.
Parse JSON response for opportunity data.

### Step 4: Deduplicate
- Group by email address
- Merge signals from same contact across threads
- Keep highest confidence scores

### Step 5: Build Opportunity Objects
For each unique opportunity:
1. Generate unique ID
2. Create ContactInfo from extracted data
3. Map conversation_stage to PipelineStage
4. Set source=EMAIL and source_id=thread_id

### Step 6: Return Results
Return deduplicated list of Opportunity objects with scan metadata.
"""
