"""
Email Opportunity Scanner for BizDev Intelligence

LLM-powered email scanning workflow that:
1. Uses Gmail MCP to search emails from the last 6 months
2. Extracts business opportunities using Claude analysis
3. Generates opportunity JSON for dashboard integration
4. Creates email drafts and updates the pipeline dashboard

Usage:
    /bizdev-opportunity scan-email --lookback 6

Requires:
    - Gmail MCP configured in .mcp.json
    - GMAIL_USER_EMAIL set to anant@nextgenerationmedicine.co
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import json


# =============================================================================
# SEARCH STRATEGIES (LLM-Generated Queries)
# =============================================================================

SEARCH_STRATEGIES = {
    "consulting_opportunities": {
        "description": "Find potential consulting/advisory opportunities",
        "queries": [
            'subject:(consulting OR advisory OR strategy) after:2025/07/22',
            'subject:(help with OR looking for guidance) after:2025/07/22',
            '(fractional CMO OR strategic advisor) after:2025/07/22',
            'subject:(clinic OR practice) (growth OR scaling OR optimization) after:2025/07/22',
        ]
    },
    "platform_interest": {
        "description": "Find interest in LIP/platform/membership",
        "queries": [
            'subject:(platform OR membership OR subscription) after:2025/07/22',
            '(longevity intelligence OR LIP OR NGM platform) after:2025/07/22',
            'subject:(demo OR trial OR access) after:2025/07/22',
        ]
    },
    "report_generator": {
        "description": "Find interest in lab report capabilities",
        "queries": [
            '(lab report OR lab interpretation OR biomarker) after:2025/07/22',
            'subject:(AI report OR automated report) after:2025/07/22',
            '(patient reports OR clinical reports) after:2025/07/22',
        ]
    },
    "partnership_inquiries": {
        "description": "Find partnership and vendor opportunities",
        "queries": [
            'subject:(partnership OR partner OR collaborate) after:2025/07/22',
            '(NGM Commons OR vendor profile OR listing) after:2025/07/22',
            'subject:(integration OR API) after:2025/07/22',
        ]
    },
    "inbound_interest": {
        "description": "General inbound interest signals",
        "queries": [
            'subject:(interested in OR want to learn) after:2025/07/22',
            '(pricing OR cost OR investment) after:2025/07/22',
            'subject:(schedule OR call OR meeting) -calendar after:2025/07/22',
            '(how does OR tell me more OR can you explain) after:2025/07/22',
        ]
    },
    "follow_up_needed": {
        "description": "Conversations that may need follow-up",
        "queries": [
            'is:starred after:2025/07/22',
            'label:follow-up after:2025/07/22',
            '(will follow up OR let me get back OR send you) from:me after:2025/07/22',
        ]
    }
}


# =============================================================================
# OPPORTUNITY EXTRACTION PROMPT
# =============================================================================

EMAIL_ANALYSIS_PROMPT = """
You are analyzing an email thread to identify business development opportunities for Next Generation Medicine (NGM).

**NGM Services:**
1. **Strategic Consulting** ($10,000/month, 3-month minimum): Advisory for longevity clinics, healthcare companies
2. **Longevity Intelligence Platform** ($499/month): AI-powered clinical decision support, lab report generation
3. **NGM Commons Partnership** ($5,000-$12,500/year): Vendor profiles for clinician discovery

**Email Thread:**
```
From: {from_addr}
To: {to_addr}
Subject: {subject}
Date: {date}

{body}
```

**Analyze this email for:**

1. **Is this a business opportunity?** (Yes/No with reasoning)

2. **If yes, extract:**
   - Contact name and email
   - Company/organization if mentioned
   - Title/role if mentioned
   - Opportunity type (consulting/platform/partnership)
   - Interest signals (specific quotes showing interest)
   - Pain points mentioned
   - Budget/timeline indicators
   - Conversation stage (initial/ongoing/warm/stale)
   - Confidence score (0-100)
   - Recommended next action

3. **Priority level:**
   - HIGH: Explicit interest, decision-maker, clear need
   - MEDIUM: General interest, exploring options
   - LOW: Tangential mention, unclear intent

**Output as JSON:**
```json
{{
  "is_opportunity": true/false,
  "reasoning": "Why this is/isn't an opportunity",
  "opportunity": {{
    "contact_name": "Name",
    "contact_email": "email@domain.com",
    "company": "Company name or null",
    "title": "Title or null",
    "opportunity_type": "consulting|platform|partnership|report_generator",
    "signals": [
      {{
        "type": "EXPLICIT_INTEREST|PAIN_POINT|BUDGET_MENTION|TIMELINE|DECISION_MAKER|FOLLOW_UP_REQUEST",
        "content": "Exact quote from email",
        "confidence": 0.0-1.0
      }}
    ],
    "pain_points": ["List of pain points"],
    "budget_indicators": "Any budget mentions or null",
    "timeline_indicators": "Any urgency signals or null",
    "conversation_stage": "initial|ongoing|warm|stale",
    "confidence_score": 0-100,
    "priority": "HIGH|MEDIUM|LOW",
    "recommended_action": "Specific next step",
    "notes": "Additional context"
  }}
}}
```

If not an opportunity, return:
```json
{{
  "is_opportunity": false,
  "reasoning": "Why this isn't relevant"
}}
```
"""


# =============================================================================
# BATCH ANALYSIS PROMPT
# =============================================================================

BATCH_SUMMARY_PROMPT = """
You've analyzed {count} email threads. Here are the opportunities found:

{opportunities_json}

**Create a summary report:**

1. **High Priority Opportunities** (need immediate action)
   - List each with contact, type, and recommended action

2. **Medium Priority Opportunities** (follow up this week)
   - List each with contact and brief note

3. **Patterns Observed**
   - Common pain points across contacts
   - Trending interest areas
   - Any clusters (e.g., multiple from same company/event)

4. **Recommended Priorities**
   - Top 5 opportunities to pursue first
   - Suggested outreach sequence

Output as structured JSON for dashboard integration.
"""


# =============================================================================
# SCANNER WORKFLOW
# =============================================================================

def generate_scan_workflow(lookback_months: int = 6) -> Dict[str, Any]:
    """
    Generate the complete email scanning workflow.
    
    This returns instructions for Claude to execute using Gmail MCP.
    """
    cutoff_date = datetime.now() - timedelta(days=lookback_months * 30)
    date_filter = cutoff_date.strftime("%Y/%m/%d")
    
    return {
        "workflow_name": "Email Opportunity Scan",
        "lookback_months": lookback_months,
        "cutoff_date": date_filter,
        "steps": [
            {
                "step": 1,
                "name": "Search for opportunity signals",
                "description": "Execute Gmail searches for each strategy",
                "actions": [
                    {
                        "strategy": name,
                        "queries": strategy["queries"],
                        "mcp_tool": "mcp__gmail__search_threads",
                        "params": {"max_results": 20}
                    }
                    for name, strategy in SEARCH_STRATEGIES.items()
                ]
            },
            {
                "step": 2,
                "name": "Deduplicate threads",
                "description": "Remove duplicate thread IDs from combined results"
            },
            {
                "step": 3,
                "name": "Analyze each thread",
                "description": "For each unique thread:",
                "sub_steps": [
                    "Get full thread content with mcp__gmail__get_email_content",
                    "Apply EMAIL_ANALYSIS_PROMPT to extract opportunities",
                    "Parse JSON response and validate"
                ]
            },
            {
                "step": 4,
                "name": "Aggregate and deduplicate opportunities",
                "description": "Merge opportunities from same contact email"
            },
            {
                "step": 5,
                "name": "Generate summary",
                "description": "Apply BATCH_SUMMARY_PROMPT to prioritize"
            },
            {
                "step": 6,
                "name": "Update dashboard",
                "description": "Add new opportunities to bizdev-pipeline-deep-scan.html"
            },
            {
                "step": 7,
                "name": "Generate email drafts",
                "description": "Create outreach emails for high-priority opportunities"
            }
        ],
        "output_files": {
            "opportunities": ".bizdev/email-opportunities.json",
            "summary": ".bizdev/email-scan-summary.md",
            "dashboard": "content/docs/bizdev-pipeline-deep-scan.html",
            "emails": "content/docs/bizdev-drafts/emails/"
        }
    }


# =============================================================================
# DASHBOARD INTEGRATION
# =============================================================================

def generate_dashboard_row(opportunity: Dict[str, Any]) -> str:
    """
    Generate HTML table row for an opportunity.
    """
    contact = opportunity.get("contact_name", "Unknown")
    company = opportunity.get("company", "-")
    opp_type = opportunity.get("opportunity_type", "consulting")
    priority = opportunity.get("priority", "MEDIUM").lower()
    source = "Email Scan"
    date = datetime.now().strftime("%Y-%m-%d")
    action = opportunity.get("recommended_action", "Follow up...")[:50]
    
    # Map priority to urgency badge
    urgency_map = {"high": "high", "medium": "medium", "low": "low"}
    urgency = urgency_map.get(priority, "medium")
    
    # Map opportunity type to badge class
    type_badges = {
        "consulting": "badge-consulting",
        "platform": "badge-membership",
        "partnership": "badge-commons",
        "report_generator": "badge-commons"
    }
    badge_class = type_badges.get(opp_type, "badge-consulting")
    
    # Generate email file name
    email_filename = contact.lower().replace(" ", "_").replace(".", "")
    
    return f'''<tr data-urgency="{urgency}" data-type="{opp_type}">
        <td><strong>{contact}</strong></td>
        <td>{company}</td>
        <td><span class="badge {badge_class}">{opp_type}</span></td>
        <td><span class="badge badge-{urgency}">{urgency}</span></td>
        <td>{source}</td>
        <td>{date}</td>
        <td>{action}...</td>
        <td><a href="bizdev-drafts/emails/{email_filename}.html" class="action-link email">Email</a></td>
    </tr>'''


# =============================================================================
# MAIN EXECUTION INSTRUCTIONS
# =============================================================================

EXECUTION_INSTRUCTIONS = """
## Email Opportunity Scanner - Execution Guide

### Prerequisites
1. Gmail MCP configured in .mcp.json
2. Service account with Gmail API access
3. Domain-wide delegation for anant@nextgenerationmedicine.co

### Step-by-Step Execution

#### Step 1: Search Emails
Execute these searches using mcp__gmail__search_threads:

```
# Consulting opportunities
mcp__gmail__search_threads(
    query="subject:(consulting OR advisory OR strategy) after:2025/07/22",
    max_results=20
)

# Platform interest
mcp__gmail__search_threads(
    query="(longevity intelligence OR LIP OR platform demo) after:2025/07/22",
    max_results=20
)

# Partnership inquiries
mcp__gmail__search_threads(
    query="subject:(partnership OR integration OR API) after:2025/07/22",
    max_results=20
)

# Inbound interest
mcp__gmail__search_threads(
    query="subject:(interested in OR pricing OR schedule call) after:2025/07/22",
    max_results=20
)
```

#### Step 2: Analyze Each Thread
For each thread found:

```
# Get full content
content = mcp__gmail__get_email_content(email_id=thread_id)

# Analyze with LLM using EMAIL_ANALYSIS_PROMPT
# Parse JSON response
```

#### Step 3: Aggregate Results
- Deduplicate by contact email
- Merge signals from same contact
- Calculate final priority scores

#### Step 4: Update Dashboard
- Add new rows to bizdev-pipeline-deep-scan.html
- Generate email drafts for high-priority opportunities
- Run email_html_renderer.py to create browser-viewable versions

#### Step 5: Start Local Server
```bash
cd content/docs && python3 -m http.server 8080 &
open "http://localhost:8080/bizdev-pipeline-deep-scan.html"
```

### Output Files
- `.bizdev/email-opportunities.json` - Raw opportunity data
- `.bizdev/email-scan-summary.md` - Prioritized summary
- `content/docs/bizdev-drafts/emails/*.html` - Email drafts
- `content/docs/bizdev-pipeline-deep-scan.html` - Updated dashboard
"""


# =============================================================================
# QUICK SCAN FUNCTION
# =============================================================================

def quick_scan_queries(lookback_months: int = 6) -> List[str]:
    """
    Return a list of Gmail search queries for quick scanning.
    """
    cutoff = datetime.now() - timedelta(days=lookback_months * 30)
    date_str = cutoff.strftime("%Y/%m/%d")
    
    return [
        # High-value signals
        f'subject:(consulting OR advisory) after:{date_str}',
        f'subject:(interested in) -category:promotions after:{date_str}',
        f'(pricing OR proposal OR quote) -category:promotions after:{date_str}',
        f'subject:(demo OR trial OR access) after:{date_str}',
        f'subject:(partnership OR collaborate) after:{date_str}',
        f'(schedule call OR schedule meeting OR let\'s connect) after:{date_str}',
        
        # Follow-up signals
        f'from:me (will send OR will follow up) after:{date_str}',
        f'is:starred after:{date_str}',
        
        # Specific NGM interest
        f'(NGM OR "Next Generation Medicine" OR longevity intelligence) after:{date_str}',
        f'(lab report OR biomarker analysis) after:{date_str}',
    ]


if __name__ == "__main__":
    # Print workflow for reference
    workflow = generate_scan_workflow(lookback_months=6)
    print(json.dumps(workflow, indent=2))
    
    print("\n" + "="*60)
    print("SEARCH QUERIES TO EXECUTE:")
    print("="*60 + "\n")
    
    for query in quick_scan_queries(6):
        print(f"  {query}")
    
    print("\n" + EXECUTION_INSTRUCTIONS)
