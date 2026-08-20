"""
Email Searcher for BizDev Opportunity Intelligence

Searches Gmail for context related to an opportunity contact.
Uses Gmail MCP tools to find prior conversations, determine
conversation stage, and extract relevant history.

Functions:
1. search_contact_emails: Find emails with a contact
2. extract_conversation_stage: Determine relationship status
3. summarize_email_history: Create context summary
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta


# =============================================================================
# CONVERSATION STAGE DEFINITIONS
# =============================================================================

class ConversationStage:
    """Stages of email relationship with a contact."""
    NEW = "new"  # No prior emails
    INITIAL = "initial"  # 1-2 email exchanges
    ONGOING = "ongoing"  # Active back-and-forth
    WARM = "warm"  # Recent exchange within 14 days
    COOLING = "cooling"  # 15-30 days since last
    STALE = "stale"  # 31-90 days since last
    COLD = "cold"  # 90+ days since last


# =============================================================================
# SEARCH CONFIGURATION
# =============================================================================

SEARCH_CONFIG = {
    "max_threads": 10,
    "max_messages_per_thread": 5,
    "lookback_months": 12,
    "opportunity_keywords": [
        "interested",
        "partnership",
        "consulting",
        "platform",
        "membership",
        "proposal",
        "demo",
        "pricing",
        "schedule",
        "call",
        "meeting"
    ]
}


# =============================================================================
# EMAIL SEARCH FUNCTIONS
# =============================================================================

def build_contact_search_query(
    contact_name: str,
    contact_email: Optional[str] = None,
    company: Optional[str] = None,
    include_keywords: bool = True,
    lookback_months: int = 12
) -> str:
    """
    Build Gmail search query for finding contact emails.
    
    Args:
        contact_name: Contact's full name
        contact_email: Contact's email address
        company: Contact's company name
        include_keywords: Include opportunity keywords in search
        lookback_months: How far back to search
        
    Returns:
        Gmail search query string
    """
    query_parts = []
    
    # Email address is most precise
    if contact_email:
        query_parts.append(f"(from:{contact_email} OR to:{contact_email})")
    
    # Add name search as fallback
    if contact_name and not contact_email:
        # Search in from/to and body
        name_parts = contact_name.split()
        if len(name_parts) >= 2:
            query_parts.append(f'("{name_parts[0]} {name_parts[-1]}")')
        else:
            query_parts.append(f'("{contact_name}")')
    
    # Add company domain search
    if company and not contact_email:
        # Try to infer domain from company name
        company_slug = company.lower().replace(" ", "").replace(",", "")[:20]
        query_parts.append(f"(from:*@*{company_slug}* OR to:*@*{company_slug}*)")
    
    # Add date filter
    if lookback_months > 0:
        date_cutoff = datetime.now() - timedelta(days=lookback_months * 30)
        query_parts.append(f"after:{date_cutoff.strftime('%Y/%m/%d')}")
    
    # Add opportunity keywords (optional)
    if include_keywords:
        keywords = SEARCH_CONFIG["opportunity_keywords"]
        keyword_query = " OR ".join(keywords[:5])  # Limit to avoid query too long
        query_parts.append(f"({keyword_query})")
    
    return " ".join(query_parts)


def search_contact_emails_workflow(
    contact_name: str,
    contact_email: Optional[str] = None,
    company: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate workflow instructions for searching ALL contact emails.
    
    IMPORTANT: This searches for ALL emails with a contact across ALL threads,
    not just the original conversation thread. People may respond in new threads
    or have multiple ongoing conversations.
    
    This returns the MCP commands to execute, not the actual results.
    The caller (Claude) will execute these.
    
    Args:
        contact_name: Contact's full name
        contact_email: Contact's email address
        company: Contact's company
        
    Returns:
        Workflow instructions dict
    """
    # Build search queries (multiple for better coverage)
    queries = []
    
    # Primary: by email - search ALL threads with this person
    if contact_email:
        # Search both inbox and sent for complete picture
        queries.append({
            "type": "email_all_threads",
            "query": f"from:{contact_email} OR to:{contact_email}",
            "description": f"ALL emails with {contact_email} (any thread)"
        })
        # Also explicitly check sent folder
        queries.append({
            "type": "sent_to_contact",
            "query": f"in:sent to:{contact_email}",
            "description": f"All emails WE SENT to {contact_email}"
        })
    
    # Secondary: by name (fallback if no email)
    if contact_name and not contact_email:
        queries.append({
            "type": "name_search",
            "query": build_contact_search_query(
                contact_name=contact_name,
                include_keywords=False
            ),
            "description": f"Name search for {contact_name}"
        })
    
    # Tertiary: by company domain
    if company:
        queries.append({
            "type": "company_domain",
            "query": build_contact_search_query(
                contact_name="",
                company=company,
                include_keywords=True
            ),
            "description": f"Company domain search for {company}"
        })
    
    return {
        "contact_name": contact_name,
        "contact_email": contact_email,
        "company": company,
        "queries": queries,
        "workflow": f"""
## Email Search Workflow for {contact_name}

### Step 1: Search for Contact Emails

Execute the following Gmail MCP searches:

{"".join(f'''
**Query {i+1}: {q["description"]}**
```
mcp__gmail__search_threads(
    query="{q["query"]}",
    max_results={SEARCH_CONFIG["max_threads"]}
)
```
''' for i, q in enumerate(queries))}

### Step 2: Get Thread Contents

For each relevant thread found:
```
mcp__gmail__get_email_content(email_id=THREAD_ID)
```

### Step 3: Extract Context

From the emails, extract:
- Last contact date
- Conversation stage
- Key topics discussed
- Any commitments or next steps mentioned
- Pain points or interests expressed

### Step 4: Determine Conversation Stage

Based on findings:
- NEW: No emails found
- INITIAL: 1-2 exchanges
- ONGOING: Active conversation
- WARM: Last contact < 14 days
- COOLING: 15-30 days
- STALE: 31-90 days
- COLD: 90+ days

### Step 5: Return Summary

Compile into context summary for email drafting.
"""
    }


# =============================================================================
# CONVERSATION ANALYSIS
# =============================================================================

def analyze_conversation_stage(
    emails: List[Dict[str, Any]],
    contact_email: str
) -> Dict[str, Any]:
    """
    Analyze emails to determine conversation stage and context.
    
    This is a helper function that processes email data
    returned from MCP calls.
    
    Args:
        emails: List of email dicts with date, from, to, subject, content
        contact_email: The contact's email address
        
    Returns:
        Analysis dict with stage, summary, and key points
    """
    if not emails:
        return {
            "stage": ConversationStage.NEW,
            "last_contact": None,
            "days_since_contact": None,
            "thread_count": 0,
            "exchange_count": 0,
            "topics": [],
            "summary": "No prior email history with this contact."
        }
    
    # Sort by date (newest first)
    sorted_emails = sorted(
        emails,
        key=lambda e: e.get("date", ""),
        reverse=True
    )
    
    # Calculate days since last contact
    last_date_str = sorted_emails[0].get("date", "")
    try:
        last_date = datetime.fromisoformat(last_date_str.replace("Z", "+00:00"))
        days_since = (datetime.now(last_date.tzinfo) - last_date).days
    except (ValueError, TypeError):
        days_since = 999
    
    # Count exchanges
    exchange_count = len(emails)
    thread_count = len(set(e.get("thread_id", e.get("id")) for e in emails))
    
    # Determine stage
    if days_since <= 14:
        if exchange_count >= 3:
            stage = ConversationStage.ONGOING
        else:
            stage = ConversationStage.WARM
    elif days_since <= 30:
        stage = ConversationStage.COOLING
    elif days_since <= 90:
        stage = ConversationStage.STALE
    else:
        stage = ConversationStage.COLD
    
    # Extract topics from subjects
    topics = []
    for email in sorted_emails[:5]:
        subject = email.get("subject", "")
        if subject and subject not in topics:
            # Clean up Re: and Fwd: prefixes
            clean_subject = subject
            for prefix in ["Re: ", "RE: ", "Fwd: ", "FWD: "]:
                clean_subject = clean_subject.replace(prefix, "")
            if clean_subject and clean_subject not in topics:
                topics.append(clean_subject)
    
    # Build summary
    summary_parts = [
        f"Last contact: {days_since} days ago" if days_since < 999 else "Last contact: Unknown",
        f"Total exchanges: {exchange_count}",
        f"Thread count: {thread_count}"
    ]
    
    if topics:
        summary_parts.append(f"Topics: {', '.join(topics[:3])}")
    
    return {
        "stage": stage,
        "last_contact": last_date_str,
        "days_since_contact": days_since,
        "thread_count": thread_count,
        "exchange_count": exchange_count,
        "topics": topics,
        "summary": " | ".join(summary_parts)
    }


def extract_prior_context(
    emails: List[Dict[str, Any]],
    max_excerpts: int = 3
) -> Dict[str, Any]:
    """
    Extract relevant context from prior emails.
    
    Args:
        emails: List of email dicts
        max_excerpts: Maximum number of key excerpts to return
        
    Returns:
        Context dict with excerpts, commitments, and interests
    """
    if not emails:
        return {
            "excerpts": [],
            "commitments": [],
            "interests": [],
            "pain_points": [],
            "context_summary": "No prior email context available."
        }
    
    excerpts = []
    commitments = []
    interests = []
    pain_points = []
    
    # Commitment keywords
    commitment_keywords = [
        "will send", "will follow up", "next step",
        "schedule", "let's connect", "I'll share",
        "proposal", "deck", "document"
    ]
    
    # Interest keywords
    interest_keywords = [
        "interested in", "curious about", "want to learn",
        "looking for", "need help with", "exploring"
    ]
    
    # Pain point keywords
    pain_keywords = [
        "struggling with", "challenge", "problem",
        "frustrated", "difficult", "time-consuming"
    ]
    
    for email in emails[:5]:
        content = email.get("content", "")[:2000]
        
        # Extract commitments
        for kw in commitment_keywords:
            if kw.lower() in content.lower():
                # Find the sentence containing the keyword
                sentences = content.split('.')
                for sent in sentences:
                    if kw.lower() in sent.lower():
                        commitments.append(sent.strip()[:200])
                        break
        
        # Extract interests
        for kw in interest_keywords:
            if kw.lower() in content.lower():
                sentences = content.split('.')
                for sent in sentences:
                    if kw.lower() in sent.lower():
                        interests.append(sent.strip()[:200])
                        break
        
        # Extract pain points
        for kw in pain_keywords:
            if kw.lower() in content.lower():
                sentences = content.split('.')
                for sent in sentences:
                    if kw.lower() in sent.lower():
                        pain_points.append(sent.strip()[:200])
                        break
        
        # Get first paragraph as excerpt
        first_para = content.split('\n\n')[0][:300]
        if first_para and len(excerpts) < max_excerpts:
            excerpts.append({
                "from": email.get("from", "Unknown"),
                "date": email.get("date", ""),
                "excerpt": first_para
            })
    
    # Deduplicate
    commitments = list(set(commitments))[:3]
    interests = list(set(interests))[:3]
    pain_points = list(set(pain_points))[:3]
    
    # Build context summary
    summary_parts = []
    if interests:
        summary_parts.append(f"Expressed interest in: {interests[0][:100]}")
    if pain_points:
        summary_parts.append(f"Pain point mentioned: {pain_points[0][:100]}")
    if commitments:
        summary_parts.append(f"Previous commitment: {commitments[0][:100]}")
    
    return {
        "excerpts": excerpts,
        "commitments": commitments,
        "interests": interests,
        "pain_points": pain_points,
        "context_summary": " | ".join(summary_parts) if summary_parts else "Limited prior context available."
    }


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

# =============================================================================
# SENT EMAIL TRACKING (NEW)
# =============================================================================

def build_sent_email_query(
    contact_email: str,
    lookback_months: int = 12
) -> str:
    """
    Build Gmail query to find emails SENT TO a contact.
    
    Args:
        contact_email: Contact's email address
        lookback_months: How far back to search
        
    Returns:
        Gmail search query for SENT folder
    """
    date_cutoff = datetime.now() - timedelta(days=lookback_months * 30)
    return f"to:{contact_email} after:{date_cutoff.strftime('%Y/%m/%d')} in:sent"


def search_sent_emails_workflow(
    contact_email: str,
    contact_name: str = "",
    lookback_months: int = 12
) -> Dict[str, Any]:
    """
    Generate workflow for searching SENT emails to a contact.
    
    Args:
        contact_email: Contact's email address
        contact_name: Contact's name for reference
        lookback_months: How far back to search
        
    Returns:
        Workflow instructions dict
    """
    queries = []
    
    # Primary: by email address in SENT folder
    if contact_email:
        queries.append({
            "type": "sent_to_email",
            "query": build_sent_email_query(contact_email, lookback_months),
            "description": f"Emails sent to {contact_email}"
        })
    
    return {
        "contact_email": contact_email,
        "contact_name": contact_name,
        "queries": queries,
        "gog_command": f"GOG_KEYRING_PASSWORD=ngm GOG_ACCOUNT=anant@nextgenerationmedicine.co gog gmail search \"{build_sent_email_query(contact_email, lookback_months)}\"",
        "workflow": f"""
## Sent Email Search for {contact_name or contact_email}

### Using gog CLI:
```bash
GOG_KEYRING_PASSWORD=ngm GOG_ACCOUNT=anant@nextgenerationmedicine.co gog gmail search "to:{contact_email} in:sent" --max 20
```

### For each thread, get details:
```bash
GOG_KEYRING_PASSWORD=ngm GOG_ACCOUNT=anant@nextgenerationmedicine.co gog gmail thread <THREAD_ID>
```
"""
    }


def analyze_outbound_emails(
    sent_emails: List[Dict[str, Any]],
    received_emails: List[Dict[str, Any]],
    contact_email: str
) -> Dict[str, Any]:
    """
    Analyze sent vs received emails to determine communication status.
    
    Args:
        sent_emails: Emails sent TO the contact
        received_emails: Emails received FROM the contact
        contact_email: Contact's email address
        
    Returns:
        Analysis dict with communication patterns
    """
    # Parse dates
    def parse_date(date_str):
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except:
            return None
    
    # Get last sent date
    last_sent = None
    if sent_emails:
        sent_dates = [parse_date(e.get("date", "")) for e in sent_emails]
        sent_dates = [d for d in sent_dates if d]
        if sent_dates:
            last_sent = max(sent_dates)
    
    # Get last received date
    last_received = None
    if received_emails:
        recv_dates = [parse_date(e.get("date", "")) for e in received_emails]
        recv_dates = [d for d in recv_dates if d]
        if recv_dates:
            last_received = max(recv_dates)
    
    now = datetime.now(last_sent.tzinfo if last_sent and last_sent.tzinfo else None) if last_sent else datetime.now()
    
    # Calculate days
    days_since_sent = (now - last_sent).days if last_sent else None
    days_since_received = (now - last_received).days if last_received else None
    
    # Determine awaiting response
    awaiting_response = False
    awaiting_days = 0
    if last_sent and (not last_received or last_sent > last_received):
        awaiting_response = True
        awaiting_days = days_since_sent if days_since_sent else 0
    
    # Build contact history
    contact_history = []
    
    for email in (sent_emails or []):
        contact_history.append({
            "eventType": "email_sent",
            "timestamp": email.get("date", ""),
            "subject": email.get("subject", ""),
            "snippet": email.get("snippet", "")[:200] if email.get("snippet") else None,
            "direction": "outbound",
            "threadId": email.get("thread_id", email.get("id"))
        })
    
    for email in (received_emails or []):
        contact_history.append({
            "eventType": "email_received",
            "timestamp": email.get("date", ""),
            "subject": email.get("subject", ""),
            "snippet": email.get("snippet", "")[:200] if email.get("snippet") else None,
            "direction": "inbound",
            "threadId": email.get("thread_id", email.get("id"))
        })
    
    # Sort by timestamp
    contact_history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    # Determine status
    if not sent_emails and not received_emails:
        status = "new"
    elif awaiting_response and awaiting_days > 14:
        status = "stale"
    elif awaiting_response:
        status = "awaiting_response"
    elif days_since_received and days_since_received <= 7:
        status = "needs_followup"
    elif days_since_sent and days_since_sent <= 14:
        status = "active"
    elif days_since_sent and days_since_sent <= 30:
        status = "needs_followup"
    else:
        status = "stale"
    
    return {
        "last_outbound_date": last_sent.isoformat() if last_sent else None,
        "last_inbound_date": last_received.isoformat() if last_received else None,
        "days_since_sent": days_since_sent,
        "days_since_received": days_since_received,
        "awaiting_response": awaiting_response,
        "awaiting_response_days": awaiting_days,
        "total_sent": len(sent_emails or []),
        "total_received": len(received_emails or []),
        "contact_history": contact_history[:20],  # Limit to recent 20
        "status": status,
        "response_rate": (
            len(received_emails or []) / len(sent_emails) 
            if sent_emails and len(sent_emails) > 0 
            else 0
        )
    }


def match_responses_to_outbound(
    sent_emails: List[Dict[str, Any]],
    received_emails: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Match received emails to sent emails to identify response patterns.
    
    Args:
        sent_emails: Emails we sent
        received_emails: Emails we received
        
    Returns:
        List of matched pairs with response info
    """
    matched = []
    
    for sent in (sent_emails or []):
        thread_id = sent.get("thread_id", sent.get("id"))
        subject = sent.get("subject", "")
        
        # Find responses in same thread or with matching subject
        responses = []
        for recv in (received_emails or []):
            recv_thread = recv.get("thread_id", recv.get("id"))
            recv_subject = recv.get("subject", "")
            
            # Match by thread ID or subject
            if recv_thread == thread_id:
                responses.append(recv)
            elif subject and (subject in recv_subject or recv_subject.replace("Re: ", "") == subject):
                responses.append(recv)
        
        matched.append({
            "sent": sent,
            "responses": responses,
            "got_response": len(responses) > 0,
            "response_count": len(responses)
        })
    
    return matched


EMAIL_SEARCHER_WORKFLOW = """
## Email Searcher Usage

### Step 1: Generate Search Workflow

```python
from email_searcher import search_contact_emails_workflow

workflow = search_contact_emails_workflow(
    contact_name="Dr. James Smith",
    contact_email="james@smithwellness.com",
    company="Smith Wellness Clinic"
)

# Claude executes the MCP commands in workflow['workflow']
```

### Step 2: Execute MCP Searches

Claude executes:
```
mcp__gmail__search_threads(query="...", max_results=10)
mcp__gmail__get_email_content(email_id="...")
```

### Step 3: Analyze Results

```python
from email_searcher import analyze_conversation_stage, extract_prior_context

# Analyze conversation stage
stage_info = analyze_conversation_stage(
    emails=email_results,
    contact_email="james@smithwellness.com"
)

print(f"Stage: {stage_info['stage']}")
print(f"Days since contact: {stage_info['days_since_contact']}")

# Extract prior context
context = extract_prior_context(emails=email_results)

print(f"Pain points: {context['pain_points']}")
print(f"Interests: {context['interests']}")
```

### Step 4: Use in Email Drafting

```python
from email_drafter import draft_email_workflow

workflow = draft_email_workflow(
    opportunity=opportunity_data,
    prior_emails=email_results,
    last_activity_days=stage_info['days_since_contact']
)
```

## Conversation Stages

| Stage | Days Since | Meaning |
|-------|------------|---------|
| NEW | N/A | No prior emails |
| INITIAL | < 14 | 1-2 exchanges |
| ONGOING | < 14 | Active conversation |
| WARM | < 14 | Recent but few exchanges |
| COOLING | 15-30 | Conversation slowing |
| STALE | 31-90 | Needs re-engagement |
| COLD | 90+ | Long dormant |

## NEW: Sent Email Tracking

### Search for emails we've sent:
```python
from email_searcher import search_sent_emails_workflow, analyze_outbound_emails

sent_workflow = search_sent_emails_workflow(
    contact_email="james@smithwellness.com"
)

# Execute the gog command from sent_workflow['gog_command']

# Then analyze
analysis = analyze_outbound_emails(
    sent_emails=sent_results,
    received_emails=received_results,
    contact_email="james@smithwellness.com"
)

print(f"Awaiting response: {analysis['awaiting_response']}")
print(f"Days waiting: {analysis['awaiting_response_days']}")
print(f"Status: {analysis['status']}")
```
"""
