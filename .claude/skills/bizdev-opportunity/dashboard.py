"""
Dashboard Generation Logic for BizDev Opportunity Intelligence

Generates HTML dashboard files from opportunity data by:
1. Rendering pipeline sections with opportunities grouped by stage
2. Computing summary statistics
3. Injecting data into HTML templates
4. Saving to content/docs/ with dated filename

Output: content/docs/bizdev-dashboard-YYYY-MM-DD.html
"""

import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

# =============================================================================
# TEMPLATE PATHS
# =============================================================================

TEMPLATE_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_TEMPLATE_PATH = os.path.join(TEMPLATE_DIR, "templates", "pipeline.html")
OUTPUT_DIR = "content/docs"

# =============================================================================
# VALUE ESTIMATION
# =============================================================================

OPPORTUNITY_VALUE_RANGES = {
    "consulting": {"min": 2500, "max": 75000, "typical": 15000},
    "membership": {"min": 3588, "max": 7188, "typical": 5400},  # Annual (monthly * 12)
    "report_generator": {"min": 3588, "max": 7188, "typical": 5400},
    "commons_partnership": {"min": 5000, "max": 12500, "typical": 7500}
}


# =============================================================================
# TEMPLATE RENDERING HELPERS
# =============================================================================

def render_mustache_simple(template: str, context: Dict[str, Any]) -> str:
    """
    Simple Mustache-style template rendering.

    Handles:
    - {{variable}} - Simple substitution
    - {{#array}}...{{/array}} - Array iteration
    - {{^array}}...{{/array}} - Inverted sections (empty array)

    Args:
        template: Template string with {{placeholders}}
        context: Dict of values to substitute

    Returns:
        Rendered template string
    """
    result = template

    # Handle array sections: {{#array}}...{{/array}}
    array_pattern = r'\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}'

    def replace_array(match):
        key = match.group(1)
        inner_template = match.group(2)
        items = context.get(key, [])

        if not items:
            return ""

        rendered_items = []
        for item in items:
            item_result = inner_template
            if isinstance(item, dict):
                for k, v in item.items():
                    item_result = item_result.replace(f"{{{{{k}}}}}", str(v) if v is not None else "")
            rendered_items.append(item_result)

        return "".join(rendered_items)

    # Process arrays (non-greedy, handle nested)
    result = re.sub(array_pattern, replace_array, result, flags=re.DOTALL)

    # Handle inverted sections: {{^array}}...{{/array}}
    inverted_pattern = r'\{\{\^(\w+)\}\}(.*?)\{\{/\1\}\}'

    def replace_inverted(match):
        key = match.group(1)
        inner_content = match.group(2)
        items = context.get(key, [])
        return inner_content if not items else ""

    result = re.sub(inverted_pattern, replace_inverted, result, flags=re.DOTALL)

    # Handle simple substitutions: {{variable}}
    for key, value in context.items():
        if not isinstance(value, list):
            placeholder = f"{{{{{key}}}}}"
            result = result.replace(placeholder, str(value) if value is not None else "")

    return result


def format_currency(amount: int) -> str:
    """Format integer as currency string."""
    if amount >= 1000000:
        return f"${amount / 1000000:.1f}M"
    elif amount >= 1000:
        return f"${amount / 1000:.0f}K"
    else:
        return f"${amount:,}"


def find_related_drafts(contact_name: str, company: str = "") -> Dict[str, List[str]]:
    """
    Find drafted emails and proposals for a contact.
    
    Searches .bizdev/drafts/ for files matching contact name or company.
    
    Args:
        contact_name: Contact's full name
        company: Company name (optional)
        
    Returns:
        Dict with 'emails' and 'proposals' lists of file paths
    """
    import glob
    
    drafts_dir = os.path.join(os.path.dirname(TEMPLATE_DIR), "..", ".bizdev", "drafts")
    drafts_dir = os.path.normpath(drafts_dir)
    
    result = {"emails": [], "proposals": []}
    
    if not os.path.exists(drafts_dir):
        return result
    
    # Normalize name for matching
    name_parts = contact_name.lower().split()
    name_slug = "_".join(name_parts)
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[-1] if len(name_parts) > 1 else ""
    
    # Search email drafts
    email_patterns = [
        os.path.join(drafts_dir, "emails", f"*{name_slug}*"),
        os.path.join(drafts_dir, "emails", f"*{first_name}*{last_name}*"),
        os.path.join(drafts_dir, f"email-*{last_name.lower()}*"),
    ]
    for pattern in email_patterns:
        for path in glob.glob(pattern):
            rel_path = os.path.relpath(path, os.path.dirname(drafts_dir))
            if rel_path not in result["emails"]:
                result["emails"].append(rel_path)
    
    # Search proposals
    proposal_patterns = [
        os.path.join(drafts_dir, "proposals", f"*{name_slug}*"),
        os.path.join(drafts_dir, "proposals", f"*{first_name}*{last_name}*"),
        os.path.join(drafts_dir, f"proposal-*{last_name.lower()}*"),
    ]
    for pattern in proposal_patterns:
        for path in glob.glob(pattern):
            rel_path = os.path.relpath(path, os.path.dirname(drafts_dir))
            if rel_path not in result["proposals"]:
                result["proposals"].append(rel_path)
    
    # Also search by company name
    if company:
        company_slug = company.lower().replace(" ", "-").replace(",", "")[:20]
        company_patterns = [
            os.path.join(drafts_dir, f"*{company_slug}*"),
            os.path.join(drafts_dir, "proposals", f"*{company_slug}*"),
        ]
        for pattern in company_patterns:
            for path in glob.glob(pattern):
                rel_path = os.path.relpath(path, os.path.dirname(drafts_dir))
                if path.endswith(".html") and rel_path not in result["proposals"]:
                    result["proposals"].append(rel_path)
                elif rel_path not in result["emails"]:
                    result["emails"].append(rel_path)
    
    return result


def format_relative_date(iso_date: str) -> str:
    """Convert ISO date to relative date string."""
    if not iso_date:
        return "Unknown"

    try:
        date = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        now = datetime.now(date.tzinfo) if date.tzinfo else datetime.now()
        diff = now - date

        days = diff.days
        if days == 0:
            return "Today"
        elif days == 1:
            return "Yesterday"
        elif days < 7:
            return f"{days} days ago"
        elif days < 30:
            weeks = days // 7
            return f"{weeks} week{'s' if weeks > 1 else ''} ago"
        elif days < 365:
            months = days // 30
            return f"{months} month{'s' if months > 1 else ''} ago"
        else:
            return date.strftime("%b %Y")
    except (ValueError, TypeError):
        return "Unknown"


def calculate_days_since(iso_date: str) -> int:
    """Calculate days since ISO date."""
    if not iso_date:
        return 999

    try:
        date = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        now = datetime.now(date.tzinfo) if date.tzinfo else datetime.now()
        return (now - date).days
    except (ValueError, TypeError):
        return 999


def get_confidence_level(score: int) -> str:
    """Map score to confidence level."""
    if score >= 70:
        return "high"
    elif score >= 40:
        return "medium"
    else:
        return "low"


def get_activity_status(days: int) -> str:
    """Determine activity status from days since last activity."""
    if days <= 14:
        return "normal"
    elif days <= 60:
        return "normal"
    else:
        return "stale"


def format_opportunity_type(opp_type: str) -> str:
    """Human-readable opportunity type."""
    mapping = {
        "consulting": "Consulting",
        "membership": "Membership",
        "report_generator": "Reports",
        "commons_partnership": "Commons"
    }
    return mapping.get(opp_type, opp_type.title())


def format_pipeline_stage(stage: str) -> str:
    """Human-readable pipeline stage."""
    mapping = {
        "discovered": "Discovered",
        "qualified": "Qualified",
        "engaged": "Engaged",
        "proposal_sent": "Proposal Sent",
        "closed_won": "Won",
        "closed_lost": "Lost"
    }
    return mapping.get(stage, stage.title())


# =============================================================================
# RENDER FUNCTIONS
# =============================================================================

def render_summary_stats(opportunities: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute summary statistics from opportunities.

    Args:
        opportunities: List of opportunity dicts

    Returns:
        Dict with computed statistics for template
    """
    total = len(opportunities)

    # Count by type
    type_counts = {}
    for opp in opportunities:
        opp_type = opp.get("opportunity_type", "unknown")
        type_counts[opp_type] = type_counts.get(opp_type, 0) + 1

    # Count high priority (score >= 70 or priority_score >= 75)
    high_priority = sum(
        1 for opp in opportunities 
        if opp.get("confidence_score", 0) >= 70 or opp.get("priority_score", 0) >= 75
    )

    # Count stale (days inactive > 60 or status == stale)
    stale_count = sum(
        1 for opp in opportunities
        if (
            calculate_days_since(opp.get("last_activity", "")) > 60
            or opp.get("status") == "stale"
        )
        and opp.get("stage") not in ["closed_won", "closed_lost"]
    )
    
    # NEW: Count by status
    awaiting_response_count = sum(
        1 for opp in opportunities 
        if opp.get("status") == "awaiting_response"
    )
    
    needs_followup_count = sum(
        1 for opp in opportunities 
        if opp.get("status") == "needs_followup"
    )
    
    # NEW: Count critical urgency
    critical_count = sum(
        1 for opp in opportunities
        if opp.get("urgency_level") == "critical"
    )

    # Estimate total pipeline value
    total_value = 0
    for opp in opportunities:
        if opp.get("stage") in ["closed_won", "closed_lost"]:
            continue
        opp_type = opp.get("opportunity_type", "membership")
        ranges = OPPORTUNITY_VALUE_RANGES.get(opp_type, OPPORTUNITY_VALUE_RANGES["membership"])

        # Use confidence to weight value estimate
        confidence = opp.get("confidence_score", 50) / 100
        estimated = ranges["typical"] * confidence
        total_value += int(estimated)

    return {
        "total_opportunities": total,
        "high_priority_count": high_priority,
        "stale_count": stale_count,
        "estimated_value": format_currency(total_value),
        "type_counts": type_counts,
        # NEW: Enhanced stats
        "awaiting_response_count": awaiting_response_count,
        "needs_followup_count": needs_followup_count,
        "critical_count": critical_count,
        "needs_attention_count": stale_count + awaiting_response_count + needs_followup_count,
    }


def render_pipeline_section(
    opportunities: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Group opportunities by pipeline stage for column rendering.

    Args:
        opportunities: List of opportunity dicts

    Returns:
        Dict with opportunities grouped by stage and counts
    """
    stages = {
        "discovered": [],
        "qualified": [],
        "engaged": [],
        "proposal_sent": [],
        "closed": []  # Combined closed_won and closed_lost
    }

    for opp in opportunities:
        stage = opp.get("stage", "discovered")

        # Map closed stages to single column
        if stage in ["closed_won", "closed_lost"]:
            target_stage = "closed"
        # Map additional stages
        elif stage in ["discovery", "follow_up"]:
            target_stage = "discovered" if stage == "discovery" else "qualified"
        elif stage == "proposal":
            target_stage = "proposal_sent"
        else:
            target_stage = stage if stage in stages else "discovered"

        # Enrich opportunity for template
        enriched = render_opportunity_card_context(opp)
        enriched["outcome"] = "Won" if stage == "closed_won" else "Lost" if stage == "closed_lost" else ""

        stages[target_stage].append(enriched)

    # Sort each stage by priority_score first, then confidence score (descending)
    for stage in stages:
        stages[stage].sort(
            key=lambda x: (
                x.get("priority_score", 0),
                x.get("confidence_score", 0)
            ),
            reverse=True
        )

    return {
        "discovered_opportunities": stages["discovered"],
        "discovered_count": len(stages["discovered"]),
        "qualified_opportunities": stages["qualified"],
        "qualified_count": len(stages["qualified"]),
        "engaged_opportunities": stages["engaged"],
        "engaged_count": len(stages["engaged"]),
        "proposal_sent_opportunities": stages["proposal_sent"],
        "proposal_sent_count": len(stages["proposal_sent"]),
        "closed_opportunities": stages["closed"],
        "closed_count": len(stages["closed"])
    }


def format_status_badge(status: str) -> Dict[str, str]:
    """Format status for badge display."""
    status_map = {
        "active": {"label": "Active", "class": "active"},
        "stale": {"label": "Stale", "class": "stale"},
        "needs_followup": {"label": "Needs Follow-up", "class": "followup"},
        "awaiting_response": {"label": "Awaiting Response", "class": "awaiting"},
        "closed": {"label": "Closed", "class": "closed"},
    }
    return status_map.get(status, {"label": status.title(), "class": "unknown"})


def format_urgency_badge(urgency: str) -> Dict[str, str]:
    """Format urgency level for badge display."""
    urgency_map = {
        "critical": {"label": "🔴 Critical", "class": "critical"},
        "high": {"label": "🟡 High", "class": "high"},
        "medium": {"label": "🟢 Medium", "class": "medium"},
        "low": {"label": "⚪ Low", "class": "low"},
    }
    return urgency_map.get(urgency, {"label": urgency.title(), "class": "unknown"})


def render_opportunity_card_context(opportunity: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prepare opportunity data for card template rendering.

    Args:
        opportunity: Raw opportunity dict

    Returns:
        Dict with all template variables populated
    """
    contact = opportunity.get("contact", {})
    signals = opportunity.get("signals", [])
    confidence_score = opportunity.get("confidence_score", 50)
    last_activity = opportunity.get("last_activity", "")
    days_inactive = calculate_days_since(last_activity)

    # Format signals for template
    formatted_signals = []
    for signal in signals[:3]:  # Limit to 3 signals for compact view
        signal_type = signal.get("type", "UNKNOWN")
        is_strong = signal_type in ["EXPLICIT_INTEREST", "FOLLOW_UP_REQUEST", "DECISION_MAKER"]

        formatted_signals.append({
            "signal_type": signal_type[:10],  # Abbreviated
            "signal_strength": "strong" if is_strong else "normal",
            "content": signal.get("content", "")[:100]
        })
    
    # NEW: Enhanced tracking fields
    status = opportunity.get("status", "")
    status_badge = format_status_badge(status)
    
    urgency = opportunity.get("urgency_level", "medium")
    urgency_badge = format_urgency_badge(urgency)
    
    priority_score = opportunity.get("priority_score", 0)
    awaiting_days = opportunity.get("awaiting_response_days", 0)
    days_since_contact = opportunity.get("days_since_contact", days_inactive)
    engagement_score = opportunity.get("engagement_score", 0)
    
    # Format last contact info
    last_contact = opportunity.get("last_contact_date", last_activity)
    last_outbound = opportunity.get("last_outbound_date")
    last_inbound = opportunity.get("last_inbound_date")

    # Find related drafts and proposals
    contact_name = contact.get("name", "Unknown Contact")
    company_name = contact.get("company", "")
    related_drafts = find_related_drafts(contact_name, company_name)
    
    return {
        "id": opportunity.get("id", ""),
        "contact_name": contact_name,
        "contact_email": contact.get("email", ""),
        "contact_title": contact.get("title", ""),
        "company": company_name if company_name else "Unknown Company",
        "opportunity_type": opportunity.get("opportunity_type", "membership"),
        "opportunity_type_display": format_opportunity_type(opportunity.get("opportunity_type", "membership")),
        "confidence_score": confidence_score,
        "confidence_level": get_confidence_level(confidence_score),
        "pipeline_stage": opportunity.get("stage", "discovered"),
        "pipeline_stage_display": format_pipeline_stage(opportunity.get("stage", "discovered")),
        "source": opportunity.get("source", "unknown"),
        "source_id": opportunity.get("source_id", ""),
        "last_activity": format_relative_date(last_activity),
        "days_inactive": days_inactive,
        "activity_status": get_activity_status(days_inactive),
        "signals": formatted_signals,
        "next_action": opportunity.get("next_action", opportunity.get("recommended_action", "Review and qualify")),
        # NEW: Enhanced fields
        "status": status,
        "status_label": status_badge["label"],
        "status_class": status_badge["class"],
        "urgency_level": urgency,
        "urgency_label": urgency_badge["label"],
        "urgency_class": urgency_badge["class"],
        "priority_score": round(priority_score, 1),
        "awaiting_response_days": awaiting_days,
        "days_since_contact": days_since_contact,
        "engagement_score": round(engagement_score * 100),  # As percentage
        "last_contact": format_relative_date(last_contact),
        "last_outbound": format_relative_date(last_outbound) if last_outbound else "Never",
        "last_inbound": format_relative_date(last_inbound) if last_inbound else "Never",
        "recommended_action": opportunity.get("recommended_action", ""),
        # NEW: Draft and proposal links
        "draft_emails": related_drafts["emails"],
        "draft_proposals": related_drafts["proposals"],
        "has_drafts": len(related_drafts["emails"]) > 0 or len(related_drafts["proposals"]) > 0,
    }


def render_opportunity_detail(opportunity: Dict[str, Any]) -> str:
    """
    Render a detailed opportunity view for sidebar/modal.

    Args:
        opportunity: Opportunity dict

    Returns:
        HTML string for detailed view
    """
    context = render_opportunity_card_context(opportunity)

    # Add additional fields for detail view
    contact = opportunity.get("contact", {})
    context.update({
        "discovered_at": format_relative_date(opportunity.get("discovered_at", "")),
        "estimated_value": estimate_opportunity_value(opportunity)
    })

    # Full signal list
    full_signals = []
    for signal in opportunity.get("signals", []):
        full_signals.append({
            "type": signal.get("type", "UNKNOWN"),
            "content": signal.get("content", ""),
            "confidence": signal.get("confidence", 0.5)
        })
    context["signals"] = full_signals

    return context


def estimate_opportunity_value(opportunity: Dict[str, Any]) -> str:
    """
    Estimate dollar value range for an opportunity.

    Args:
        opportunity: Opportunity dict

    Returns:
        Formatted value range string
    """
    opp_type = opportunity.get("opportunity_type", "membership")
    ranges = OPPORTUNITY_VALUE_RANGES.get(opp_type, OPPORTUNITY_VALUE_RANGES["membership"])

    # If explicit value mentioned, use it
    if opportunity.get("estimated_value"):
        return format_currency(opportunity["estimated_value"])

    # Otherwise, return range
    return f"{format_currency(ranges['min'])} - {format_currency(ranges['max'])}"


# =============================================================================
# MAIN GENERATION FUNCTION
# =============================================================================

def generate_dashboard(
    opportunities: List[Dict[str, Any]],
    output_path: Optional[str] = None,
    lookback_months: int = 6
) -> Dict[str, Any]:
    """
    Generate complete HTML dashboard from opportunity data.

    Reads the pipeline template, populates with opportunity data,
    and saves to content/docs/ with dated filename.

    Args:
        opportunities: List of opportunity dicts
        output_path: Optional custom output path (default: auto-generated)
        lookback_months: Number of months analyzed (for display)

    Returns:
        Dict with:
        - success: bool
        - output_path: str - Path to generated file
        - stats: Dict - Summary statistics
        - error: str - Error message if failed
    """
    try:
        # Read template
        template_path = PIPELINE_TEMPLATE_PATH
        if not os.path.exists(template_path):
            return {
                "success": False,
                "error": f"Template not found: {template_path}",
                "instructions": "Ensure templates/pipeline.html exists in skill directory"
            }

        with open(template_path, "r", encoding="utf-8") as f:
            template = f.read()

        # Generate date for filename and display
        today = datetime.now()
        date_str = today.strftime("%Y-%m-%d")
        display_date = today.strftime("%B %d, %Y")

        # Compute statistics
        stats = render_summary_stats(opportunities)

        # Group by pipeline stage
        pipeline_data = render_pipeline_section(opportunities)

        # Build template context
        context = {
            "generated_date": display_date,
            "lookback_months": lookback_months,
            **stats,
            **pipeline_data
        }

        # Render template
        rendered_html = render_mustache_simple(template, context)

        # Determine output path
        if not output_path:
            output_path = os.path.join(OUTPUT_DIR, f"bizdev-dashboard-{date_str}.html")

        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Write file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(rendered_html)

        return {
            "success": True,
            "output_path": output_path,
            "stats": stats,
            "opportunities_rendered": len(opportunities),
            "pipeline_counts": {
                "discovered": pipeline_data["discovered_count"],
                "qualified": pipeline_data["qualified_count"],
                "engaged": pipeline_data["engaged_count"],
                "proposal_sent": pipeline_data["proposal_sent_count"],
                "closed": pipeline_data["closed_count"]
            }
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "output_path": output_path
        }


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

DASHBOARD_WORKFLOW = """
## Dashboard Generation Workflow

When generating the pipeline dashboard, Claude should follow these steps:

### Step 1: Collect Opportunities

Use the scanners and analyzer to gather and process opportunities:

```python
# From transcript scanner
transcript_opps = scan_transcript_folder(folder_id, lookback_months=6)

# From email scanner
email_opps = scan_emails(lookback_months=6)

# Merge and deduplicate
from analyzer import merge_duplicate_opportunities
merged = merge_duplicate_opportunities(transcript_opps + email_opps)
opportunities = merged["merged"]
```

### Step 2: Score and Classify

```python
from analyzer import classify_opportunity, score_opportunity, assign_pipeline_stage

for opp in opportunities:
    classification = classify_opportunity(opp["signals"])
    opp["opportunity_type"] = classification["primary_type"]

    scoring = score_opportunity(opp["signals"], opp["opportunity_type"])
    opp["confidence_score"] = scoring["score"]

    stage = assign_pipeline_stage(opp["signals"], opp["confidence_score"])
    opp["stage"] = stage["stage"]
    opp["next_action"] = stage["next_action"]
```

### Step 3: Generate Dashboard

```python
from dashboard import generate_dashboard

result = generate_dashboard(
    opportunities=opportunities,
    lookback_months=6
)

if result["success"]:
    print(f"Dashboard generated: {result['output_path']}")
    print(f"Total opportunities: {result['stats']['total_opportunities']}")
else:
    print(f"Error: {result['error']}")
```

### Step 4: Open in Browser

```bash
open content/docs/bizdev-dashboard-2026-01-13.html
```

The dashboard provides:
- Kanban-style pipeline view
- Summary statistics
- Opportunity cards with key info
- Color-coded by opportunity type
- Stale opportunity highlighting
"""


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

USAGE_EXAMPLE = """
## Example Usage

```python
# Sample opportunity data
opportunities = [
    {
        "id": "opp-001",
        "contact": {
            "name": "Dr. James Mitchell",
            "company": "Mitchell Longevity Clinic",
            "email": "james@mitchelllongevity.com",
            "title": "Medical Director"
        },
        "opportunity_type": "consulting",
        "stage": "engaged",
        "confidence_score": 82,
        "signals": [
            {"type": "EXPLICIT_INTEREST", "content": "Interested in practice transformation"},
            {"type": "BUDGET_MENTION", "content": "Have $50k allocated"}
        ],
        "source": "transcript",
        "source_id": "meeting-2026-01-10.docx",
        "discovered_at": "2026-01-10T14:00:00Z",
        "last_activity": "2026-01-10T14:00:00Z",
        "next_action": "Prepare proposal"
    },
    {
        "id": "opp-002",
        "contact": {
            "name": "Dr. Sarah Chen",
            "company": "Integrative Health Partners",
            "email": "sarah@ihpartners.com"
        },
        "opportunity_type": "membership",
        "stage": "qualified",
        "confidence_score": 58,
        "signals": [
            {"type": "PAIN_POINT", "content": "Struggling to keep up with research"}
        ],
        "source": "email",
        "discovered_at": "2026-01-08T10:00:00Z",
        "last_activity": "2026-01-12T09:00:00Z",
        "next_action": "Schedule platform demo"
    }
]

result = generate_dashboard(opportunities)
print(f"Dashboard: {result['output_path']}")
```
"""
