"""
Unified Opportunity Tracker for BizDev Intelligence

Cross-references opportunities with email communications to:
1. Auto-update status based on communications
2. Calculate priority scores
3. Generate stale opportunity alerts
4. Build unified contact history

This module ties together:
- Transcript-discovered opportunities
- Gmail sent/received tracking
- Fireflies meeting history
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

# Import from sibling modules
from .analyzer import (
    calculate_priority_score,
    calculate_engagement_score,
    determine_opportunity_status,
    OPPORTUNITY_TYPE_VALUES
)
from .email_searcher import (
    analyze_outbound_emails,
    match_responses_to_outbound
)


# =============================================================================
# CONFIGURATION
# =============================================================================

STALE_THRESHOLD_DAYS = 30  # Days before flagging as stale
CRITICAL_THRESHOLD_DAYS = 14  # Days before flagging as critical (awaiting response)
PRIORITY_DECAY_RATE = 0.02  # Priority decay per day of inactivity


# =============================================================================
# UNIFIED TRACKER
# =============================================================================

class OpportunityTracker:
    """
    Unified tracker that combines opportunity data with communication history.
    """
    
    def __init__(self, base_path: str = ".bizdev"):
        """
        Initialize the tracker.
        
        Args:
            base_path: Base directory for bizdev data files
        """
        self.base_path = base_path
        self.opportunities = []
        self.email_cache = {}  # Cache email lookups
        self.last_scan = None
    
    def load_opportunities(self, opportunities_path: Optional[str] = None) -> List[Dict]:
        """
        Load opportunities from JSON file.
        
        Args:
            opportunities_path: Path to opportunities.json
            
        Returns:
            List of opportunity dicts
        """
        if opportunities_path is None:
            opportunities_path = os.path.join(self.base_path, "opportunities.json")
        
        if not os.path.exists(opportunities_path):
            # Try alternate paths
            alt_paths = [
                ".ai-workspaces/.bizdev/opportunities.json",
                ".bizdev/opportunities-enhanced.json"
            ]
            for alt in alt_paths:
                if os.path.exists(alt):
                    opportunities_path = alt
                    break
        
        if os.path.exists(opportunities_path):
            with open(opportunities_path, 'r') as f:
                data = json.load(f)
                if isinstance(data, dict) and "opportunities" in data:
                    self.opportunities = data["opportunities"]
                elif isinstance(data, list):
                    self.opportunities = data
        
        return self.opportunities
    
    def enrich_opportunity(
        self,
        opportunity: Dict[str, Any],
        sent_emails: List[Dict] = None,
        received_emails: List[Dict] = None,
        meeting_transcripts: List[Dict] = None
    ) -> Dict[str, Any]:
        """
        Enrich an opportunity with communication data and calculate scores.
        
        Args:
            opportunity: Base opportunity dict
            sent_emails: Emails sent to this contact
            received_emails: Emails received from this contact
            meeting_transcripts: Meeting transcripts involving this contact
            
        Returns:
            Enriched opportunity dict
        """
        enriched = opportunity.copy()
        
        # Get contact email
        contact_email = opportunity.get("contact", {}).get("email")
        
        # Analyze email communications if available
        if sent_emails is not None or received_emails is not None:
            email_analysis = analyze_outbound_emails(
                sent_emails=sent_emails or [],
                received_emails=received_emails or [],
                contact_email=contact_email or ""
            )
            
            enriched["last_outbound_date"] = email_analysis.get("last_outbound_date")
            enriched["last_inbound_date"] = email_analysis.get("last_inbound_date")
            enriched["awaiting_response_days"] = email_analysis.get("awaiting_response_days", 0)
            enriched["contact_history"] = email_analysis.get("contact_history", [])
            
            # Add to existing contact history
            if meeting_transcripts:
                for transcript in meeting_transcripts:
                    enriched["contact_history"].append({
                        "eventType": "meeting",
                        "timestamp": transcript.get("date", ""),
                        "subject": transcript.get("title", "Meeting"),
                        "snippet": transcript.get("summary", "")[:200],
                        "direction": "bidirectional"
                    })
        
        # Calculate days since last contact
        last_dates = []
        if enriched.get("last_outbound_date"):
            last_dates.append(enriched["last_outbound_date"])
        if enriched.get("last_inbound_date"):
            last_dates.append(enriched["last_inbound_date"])
        if enriched.get("last_activity"):
            last_dates.append(enriched["last_activity"])
        
        if last_dates:
            try:
                most_recent = max(last_dates)
                if isinstance(most_recent, str):
                    most_recent_dt = datetime.fromisoformat(most_recent.replace("Z", "+00:00"))
                    now = datetime.now(most_recent_dt.tzinfo) if most_recent_dt.tzinfo else datetime.now()
                    enriched["days_since_contact"] = (now - most_recent_dt).days
                    enriched["last_contact_date"] = most_recent
            except:
                enriched["days_since_contact"] = 0
        else:
            enriched["days_since_contact"] = 999  # Unknown
        
        # Calculate engagement score
        enriched["engagement_score"] = calculate_engagement_score(
            contact_history=enriched.get("contact_history", []),
            days_since_contact=enriched.get("days_since_contact", 999)
        )
        
        # Determine status
        enriched["status"] = determine_opportunity_status(
            days_since_contact=enriched.get("days_since_contact", 999),
            last_outbound_date=enriched.get("last_outbound_date", ""),
            last_inbound_date=enriched.get("last_inbound_date", ""),
            awaiting_response_days=enriched.get("awaiting_response_days", 0)
        )
        
        # Check for strong signals
        signals = enriched.get("signals", [])
        has_explicit_interest = any(
            s.get("type") in ["EXPLICIT_INTEREST", "explicit_interest"] 
            for s in signals
        )
        has_follow_up_request = any(
            s.get("type") in ["FOLLOW_UP_REQUEST", "follow_up_request"]
            for s in signals
        )
        
        # Calculate priority score
        priority_result = calculate_priority_score(
            confidence_score=enriched.get("confidence_score", 50),
            days_since_contact=enriched.get("days_since_contact", 0),
            engagement_score=enriched.get("engagement_score", 0.0),
            opportunity_type=enriched.get("opportunity_type", "membership"),
            awaiting_response_days=enriched.get("awaiting_response_days", 0),
            is_stale=(enriched.get("status") == "stale"),
            has_explicit_interest=has_explicit_interest,
            has_follow_up_request=has_follow_up_request
        )
        
        enriched["priority_score"] = priority_result["priority_score"]
        enriched["priority_breakdown"] = priority_result["breakdown"]
        enriched["recommended_action"] = priority_result["recommended_action"]
        enriched["urgency_level"] = priority_result["urgency_level"]
        
        return enriched
    
    def generate_stale_alerts(self) -> List[Dict[str, Any]]:
        """
        Generate alerts for stale opportunities.
        
        Returns:
            List of alert dicts with opportunity info and recommended actions
        """
        alerts = []
        
        for opp in self.opportunities:
            days_since = opp.get("days_since_contact", 0)
            status = opp.get("status", "")
            awaiting_days = opp.get("awaiting_response_days", 0)
            
            alert = None
            
            # Critical: awaiting response for too long
            if awaiting_days > CRITICAL_THRESHOLD_DAYS:
                alert = {
                    "level": "critical",
                    "opportunity_id": opp.get("id"),
                    "contact_name": opp.get("contact", {}).get("name", "Unknown"),
                    "company": opp.get("contact", {}).get("company", "Unknown"),
                    "days_waiting": awaiting_days,
                    "message": f"No response in {awaiting_days} days after your last email",
                    "action": "Send follow-up or try alternative contact method"
                }
            # Stale: no activity for too long
            elif days_since > STALE_THRESHOLD_DAYS and status == "stale":
                alert = {
                    "level": "high" if days_since < 60 else "medium",
                    "opportunity_id": opp.get("id"),
                    "contact_name": opp.get("contact", {}).get("name", "Unknown"),
                    "company": opp.get("contact", {}).get("company", "Unknown"),
                    "days_inactive": days_since,
                    "message": f"No contact in {days_since} days",
                    "action": "Re-engagement outreach recommended"
                }
            # Needs follow-up: they responded, we haven't
            elif status == "needs_followup":
                alert = {
                    "level": "high",
                    "opportunity_id": opp.get("id"),
                    "contact_name": opp.get("contact", {}).get("name", "Unknown"),
                    "company": opp.get("contact", {}).get("company", "Unknown"),
                    "message": "Pending response from you",
                    "action": opp.get("recommended_action", "Send follow-up")
                }
            
            if alert:
                alert["priority_score"] = opp.get("priority_score", 0)
                alerts.append(alert)
        
        # Sort by priority
        alerts.sort(key=lambda x: (
            0 if x["level"] == "critical" else 1 if x["level"] == "high" else 2,
            -x.get("priority_score", 0)
        ))
        
        return alerts
    
    def get_daily_actions(self, max_actions: int = 10) -> List[Dict[str, Any]]:
        """
        Get prioritized list of actions for today.
        
        Args:
            max_actions: Maximum number of actions to return
            
        Returns:
            List of action items sorted by priority
        """
        # Sort opportunities by priority score
        sorted_opps = sorted(
            self.opportunities,
            key=lambda x: x.get("priority_score", 0),
            reverse=True
        )
        
        actions = []
        seen_contacts = set()
        
        for opp in sorted_opps:
            if len(actions) >= max_actions:
                break
            
            contact_name = opp.get("contact", {}).get("name", "Unknown")
            
            # Skip duplicates
            if contact_name in seen_contacts:
                continue
            seen_contacts.add(contact_name)
            
            # Skip closed opportunities
            if opp.get("stage") in ["closed_won", "closed_lost"]:
                continue
            
            action = {
                "priority_rank": len(actions) + 1,
                "contact_name": contact_name,
                "company": opp.get("contact", {}).get("company", "Unknown"),
                "email": opp.get("contact", {}).get("email"),
                "opportunity_type": opp.get("opportunity_type"),
                "priority_score": opp.get("priority_score", 0),
                "urgency_level": opp.get("urgency_level", "medium"),
                "status": opp.get("status", "unknown"),
                "days_since_contact": opp.get("days_since_contact", 0),
                "awaiting_response_days": opp.get("awaiting_response_days", 0),
                "recommended_action": opp.get("recommended_action", "Review and follow up"),
                "context": opp.get("notes", "")[:200] if opp.get("notes") else ""
            }
            
            actions.append(action)
        
        return actions
    
    def save_enhanced_opportunities(self, output_path: str = None) -> str:
        """
        Save enhanced opportunities to JSON file.
        
        Args:
            output_path: Path for output file
            
        Returns:
            Path to saved file
        """
        if output_path is None:
            output_path = os.path.join(self.base_path, "opportunities-enhanced.json")
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Build summary
        summary = {
            "total_opportunities": len(self.opportunities),
            "by_status": {},
            "by_urgency": {},
            "by_type": {},
            "stale_count": 0,
            "awaiting_response_count": 0,
            "needs_followup_count": 0,
            "generated_at": datetime.now().isoformat()
        }
        
        for opp in self.opportunities:
            status = opp.get("status", "unknown")
            summary["by_status"][status] = summary["by_status"].get(status, 0) + 1
            
            urgency = opp.get("urgency_level", "unknown")
            summary["by_urgency"][urgency] = summary["by_urgency"].get(urgency, 0) + 1
            
            opp_type = opp.get("opportunity_type", "unknown")
            summary["by_type"][opp_type] = summary["by_type"].get(opp_type, 0) + 1
            
            if status == "stale":
                summary["stale_count"] += 1
            elif status == "awaiting_response":
                summary["awaiting_response_count"] += 1
            elif status == "needs_followup":
                summary["needs_followup_count"] += 1
        
        output_data = {
            "summary": summary,
            "opportunities": self.opportunities
        }
        
        with open(output_path, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        return output_path


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def merge_opportunity_sources(
    transcript_opportunities: List[Dict],
    email_opportunities: List[Dict],
    unresponded_list: List[Dict]
) -> List[Dict]:
    """
    Merge opportunities from multiple sources, deduplicating by contact.
    
    Args:
        transcript_opportunities: Opportunities from meeting transcripts
        email_opportunities: Opportunities from email scanning
        unresponded_list: List of unresponded email contacts
        
    Returns:
        Merged and deduplicated list
    """
    merged = {}
    
    def get_key(opp: Dict) -> str:
        """Generate a unique key for deduplication."""
        contact = opp.get("contact", {})
        email = contact.get("email", "").lower()
        name = contact.get("name", "").lower()
        company = contact.get("company", "").lower()
        
        if email:
            return f"email:{email}"
        elif name and company:
            return f"name_company:{name}:{company}"
        elif name:
            return f"name:{name}"
        return f"id:{opp.get('id', id(opp))}"
    
    # Add transcript opportunities first (primary source)
    for opp in transcript_opportunities:
        key = get_key(opp)
        merged[key] = opp.copy()
        merged[key]["sources"] = ["transcript"]
    
    # Merge email opportunities
    for opp in email_opportunities:
        key = get_key(opp)
        if key in merged:
            # Merge signals
            existing = merged[key]
            existing_signals = existing.get("signals", [])
            new_signals = opp.get("signals", [])
            
            seen = set(s.get("content", "")[:50] for s in existing_signals)
            for sig in new_signals:
                if sig.get("content", "")[:50] not in seen:
                    existing_signals.append(sig)
            
            existing["signals"] = existing_signals
            existing["sources"].append("email")
            
            # Take higher confidence
            if opp.get("confidence_score", 0) > existing.get("confidence_score", 0):
                existing["confidence_score"] = opp["confidence_score"]
        else:
            merged[key] = opp.copy()
            merged[key]["sources"] = ["email"]
    
    # Merge unresponded contacts
    for contact in unresponded_list:
        email = contact.get("contact_email", "").lower()
        key = f"email:{email}" if email else f"name:{contact.get('contact_name', '').lower()}"
        
        if key in merged:
            existing = merged[key]
            existing["awaiting_response_days"] = contact.get("days_waiting", 0)
            existing["urgency"] = contact.get("urgency", "medium")
            if "unresponded" not in existing.get("sources", []):
                existing["sources"].append("unresponded")
        else:
            # Create new opportunity from unresponded contact
            merged[key] = {
                "id": f"unresponded-{len(merged)}",
                "contact": {
                    "name": contact.get("contact_name"),
                    "email": contact.get("contact_email"),
                    "company": contact.get("company")
                },
                "opportunity_type": contact.get("opportunity_type", "unknown"),
                "stage": "qualified",
                "confidence_score": 60,  # Medium confidence for unresponded
                "awaiting_response_days": contact.get("days_waiting", 0),
                "signals": [],
                "sources": ["unresponded"],
                "discovered_at": datetime.now().isoformat(),
                "last_activity": datetime.now().isoformat()
            }
    
    return list(merged.values())


def generate_daily_actions_markdown(actions: List[Dict]) -> str:
    """
    Generate markdown file with daily priority actions.
    
    Args:
        actions: List of action items from get_daily_actions()
        
    Returns:
        Markdown string
    """
    today = datetime.now().strftime("%Y-%m-%d")
    
    lines = [
        f"# Daily BizDev Actions - {today}",
        "",
        f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} UTC*",
        "",
        "---",
        ""
    ]
    
    # Group by urgency
    critical = [a for a in actions if a.get("urgency_level") == "critical"]
    high = [a for a in actions if a.get("urgency_level") == "high"]
    medium = [a for a in actions if a.get("urgency_level") == "medium"]
    
    if critical:
        lines.extend([
            "## 🔴 CRITICAL (Do Today)",
            ""
        ])
        for action in critical:
            lines.extend([
                f"### {action['priority_rank']}. {action['contact_name']} ({action['company']})",
                f"- **Type:** {action['opportunity_type']}",
                f"- **Priority Score:** {action['priority_score']:.1f}",
                f"- **Status:** {action['status']}",
                f"- **Days Waiting:** {action.get('awaiting_response_days', 0)}",
                f"- **Action:** {action['recommended_action']}",
                f"- **Email:** {action.get('email', 'N/A')}",
                ""
            ])
    
    if high:
        lines.extend([
            "## 🟡 HIGH PRIORITY",
            ""
        ])
        for action in high:
            lines.extend([
                f"### {action['priority_rank']}. {action['contact_name']} ({action['company']})",
                f"- **Type:** {action['opportunity_type']}",
                f"- **Priority Score:** {action['priority_score']:.1f}",
                f"- **Action:** {action['recommended_action']}",
                ""
            ])
    
    if medium:
        lines.extend([
            "## 🟢 MEDIUM PRIORITY",
            ""
        ])
        for action in medium:
            lines.append(
                f"- **{action['contact_name']}** ({action['company']}) - {action['recommended_action']}"
            )
    
    return "\n".join(lines)


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

TRACKER_WORKFLOW = """
## Opportunity Tracker Usage

### Step 1: Initialize Tracker

```python
from opportunity_tracker import OpportunityTracker

tracker = OpportunityTracker(base_path=".bizdev")
tracker.load_opportunities()
```

### Step 2: Enrich Opportunities with Email Data

```python
for opp in tracker.opportunities:
    contact_email = opp.get("contact", {}).get("email")
    
    # Get sent and received emails (from gog CLI)
    sent = search_sent_emails(contact_email)
    received = search_received_emails(contact_email)
    
    # Enrich
    enriched = tracker.enrich_opportunity(opp, sent, received)
    opp.update(enriched)
```

### Step 3: Generate Alerts and Actions

```python
# Get stale opportunity alerts
alerts = tracker.generate_stale_alerts()

# Get prioritized daily actions
actions = tracker.get_daily_actions(max_actions=10)
```

### Step 4: Save Enhanced Data

```python
output_path = tracker.save_enhanced_opportunities()
print(f"Saved to: {output_path}")

# Generate daily actions markdown
from opportunity_tracker import generate_daily_actions_markdown
md = generate_daily_actions_markdown(actions)
with open(".bizdev/daily-actions.md", "w") as f:
    f.write(md)
```
"""
