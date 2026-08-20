"""
Opportunity Analysis Engine for BizDev Intelligence

Provides functions for:
1. Classifying opportunities by service type
2. Scoring opportunity confidence (0-100)
3. Assigning pipeline stages
4. Merging duplicate opportunities

These functions define the logic that Claude uses when analyzing opportunities.
They serve as both documentation and workflow definitions.
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

# =============================================================================
# SIGNAL PATTERN DEFINITIONS
# =============================================================================

CONSULTING_SIGNALS = {
    "keywords": [
        "strategy", "strategic", "advisory", "advisor", "consultant",
        "practice transformation", "scaling", "growth", "optimization",
        "fractional", "CMO", "retainer", "protocol development",
        "business model", "revenue", "profitability", "workflow"
    ],
    "phrases": [
        "need help with my practice",
        "looking for guidance",
        "want to scale",
        "transform my practice",
        "need an advisor",
        "strategic planning",
        "business development"
    ],
    "weight": 25  # Base weight for this opportunity type
}

MEMBERSHIP_SIGNALS = {
    "keywords": [
        "membership", "platform", "knowledge base", "education",
        "curriculum", "learning", "CME", "certification", "community",
        "peer network", "forum", "research access", "studies", "protocols"
    ],
    "phrases": [
        "stay current with research",
        "access to protocols",
        "educational resources",
        "join your community",
        "interested in the platform",
        "longevity intelligence",
        "LIP"
    ],
    "weight": 20
}

REPORT_GENERATOR_SIGNALS = {
    "keywords": [
        "lab report", "report generator", "biomarker", "interpretation",
        "patient reports", "lab analysis", "AI report", "documentation",
        "time saving", "automation", "results interpretation"
    ],
    "phrases": [
        "spend too much time on reports",
        "lab interpretation",
        "patient communication",
        "faster turnaround",
        "report writing",
        "biomarker analysis"
    ],
    "weight": 20
}

COMMONS_SIGNALS = {
    "keywords": [
        "vendor", "partnership", "listing", "directory", "profile",
        "exposure", "marketing", "B2B", "reach clinicians", "leads",
        "sponsor", "product company", "medtech"
    ],
    "phrases": [
        "get in front of clinicians",
        "reach longevity practitioners",
        "partnership opportunity",
        "want to be listed",
        "market to doctors",
        "vendor profile"
    ],
    "weight": 15
}

SIGNAL_PATTERNS = {
    "consulting": CONSULTING_SIGNALS,
    "membership": MEMBERSHIP_SIGNALS,
    "report_generator": REPORT_GENERATOR_SIGNALS,
    "commons_partnership": COMMONS_SIGNALS
}


# =============================================================================
# SIGNAL TYPE SCORING
# =============================================================================

SIGNAL_TYPE_WEIGHTS = {
    "EXPLICIT_INTEREST": {
        "base_points": 20,
        "description": "Direct expression of interest in services"
    },
    "FOLLOW_UP_REQUEST": {
        "base_points": 18,
        "description": "Request for proposal, demo, or meeting"
    },
    "DECISION_MAKER": {
        "base_points": 15,
        "description": "Confirmed authority to make purchase decision"
    },
    "BUDGET_MENTION": {
        "base_points": 15,
        "description": "Discussion of budget or pricing"
    },
    "TIMELINE_MENTION": {
        "base_points": 12,
        "description": "Urgency or timeline indicators"
    },
    "PAIN_POINT": {
        "base_points": 10,
        "description": "Problem that NGM services can address"
    }
}


# =============================================================================
# PIPELINE STAGE DEFINITIONS
# =============================================================================

STAGE_CRITERIA = {
    "discovered": {
        "description": "Initial signal detected, not yet qualified",
        "min_signals": 1,
        "min_score": 0,
        "max_score": 30,
        "recency_days": None  # Any recency
    },
    "qualified": {
        "description": "Sufficient signals to confirm opportunity",
        "min_signals": 2,
        "min_score": 30,
        "max_score": 50,
        "recency_days": 90
    },
    "engaged": {
        "description": "Active conversation with follow-up",
        "min_signals": 3,
        "min_score": 50,
        "max_score": 70,
        "recency_days": 30
    },
    "proposal_sent": {
        "description": "Proposal or formal offer sent",
        "min_signals": 3,
        "min_score": 70,
        "max_score": 100,
        "recency_days": 14,
        "requires_signal": "FOLLOW_UP_REQUEST"
    },
    "closed_won": {
        "description": "Deal closed, customer acquired",
        "manual_only": True
    },
    "closed_lost": {
        "description": "Opportunity lost or declined",
        "manual_only": True
    }
}


# =============================================================================
# CLASSIFICATION FUNCTIONS
# =============================================================================

def classify_opportunity(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Classify an opportunity based on its signals.

    Analyzes signal content against known patterns for each opportunity type
    and returns the best match with confidence score.

    Args:
        signals: List of signal dicts with 'type' and 'content' keys

    Returns:
        Dict with:
        - primary_type: str - Best matching opportunity type
        - confidence: float - Confidence in classification (0.0-1.0)
        - scores: Dict - Score breakdown by type
        - reasoning: str - Explanation of classification
    """
    type_scores = {
        "consulting": 0,
        "membership": 0,
        "report_generator": 0,
        "commons_partnership": 0
    }

    matched_patterns = {t: [] for t in type_scores.keys()}

    # Analyze each signal's content against patterns
    for signal in signals:
        content = signal.get("content", "").lower()
        signal_type = signal.get("type", "")

        for opp_type, patterns in SIGNAL_PATTERNS.items():
            # Check keywords
            for keyword in patterns["keywords"]:
                if keyword.lower() in content:
                    type_scores[opp_type] += 5
                    matched_patterns[opp_type].append(f"keyword: {keyword}")

            # Check phrases (higher weight)
            for phrase in patterns["phrases"]:
                if phrase.lower() in content:
                    type_scores[opp_type] += 10
                    matched_patterns[opp_type].append(f"phrase: {phrase}")

        # Boost score for strong signal types
        if signal_type in ["EXPLICIT_INTEREST", "FOLLOW_UP_REQUEST"]:
            for opp_type in type_scores.keys():
                if matched_patterns[opp_type]:
                    type_scores[opp_type] += 5

    # Find primary type
    max_score = max(type_scores.values())
    if max_score == 0:
        primary_type = "membership"  # Default to membership if no signals match
        confidence = 0.3
        reasoning = "No clear signal patterns matched. Defaulting to membership based on general interest."
    else:
        primary_type = max(type_scores, key=type_scores.get)
        # Calculate confidence based on score margin
        sorted_scores = sorted(type_scores.values(), reverse=True)
        margin = (sorted_scores[0] - sorted_scores[1]) / max(sorted_scores[0], 1)
        confidence = min(0.95, 0.5 + (margin * 0.5))

        top_matches = matched_patterns[primary_type][:3]
        reasoning = f"Matched {len(matched_patterns[primary_type])} {primary_type} patterns: {', '.join(top_matches)}"

    # Identify secondary types
    secondary_types = [
        t for t, score in type_scores.items()
        if score > 0 and t != primary_type
    ]

    return {
        "primary_type": primary_type,
        "confidence": round(confidence, 2),
        "scores": type_scores,
        "matched_patterns": matched_patterns,
        "secondary_types": secondary_types,
        "reasoning": reasoning
    }


def score_opportunity(
    signals: List[Dict[str, Any]],
    opportunity_type: str,
    source_type: str = "unknown",
    last_activity_days: int = 0,
    is_referral: bool = False,
    is_decision_maker: bool = False
) -> Dict[str, Any]:
    """
    Calculate confidence score (0-100) for an opportunity.

    Uses signal weights, modifiers, and recency to compute a comprehensive
    score that represents likelihood of conversion.

    Args:
        signals: List of signal dicts with 'type' and 'content'
        opportunity_type: The classified opportunity type
        source_type: How opportunity was discovered (transcript, email)
        last_activity_days: Days since last activity
        is_referral: Whether this came from a referral
        is_decision_maker: Whether contact is confirmed decision maker

    Returns:
        Dict with:
        - score: int - Confidence score 0-100
        - level: str - high/medium/low
        - breakdown: Dict - How score was calculated
        - priority: str - Recommended priority
    """
    base_score = 10  # Starting score for any detected opportunity
    additions = []
    modifiers = []

    # Add points for each signal type
    signal_type_counts = {}
    for signal in signals:
        sig_type = signal.get("type", "UNKNOWN")
        signal_type_counts[sig_type] = signal_type_counts.get(sig_type, 0) + 1

        if sig_type in SIGNAL_TYPE_WEIGHTS:
            weight = SIGNAL_TYPE_WEIGHTS[sig_type]
            # Diminishing returns for multiple signals of same type
            count = signal_type_counts[sig_type]
            multiplier = 1.0 if count == 1 else 0.5 if count == 2 else 0.25
            points = int(weight["base_points"] * multiplier)

            additions.append({
                "signal": sig_type,
                "points": points,
                "reason": f"{weight['description']} (instance {count})"
            })
            base_score += points

    # Apply modifiers
    if is_decision_maker:
        modifiers.append({"modifier": "Confirmed decision maker", "points": 15})
        base_score += 15

    if is_referral:
        modifiers.append({"modifier": "Referral introduction", "points": 15})
        base_score += 15

    # Recency modifier
    if last_activity_days > 0:
        if last_activity_days <= 7:
            modifiers.append({"modifier": "Recent activity (< 1 week)", "points": 10})
            base_score += 10
        elif last_activity_days <= 30:
            modifiers.append({"modifier": "Moderate recency (< 1 month)", "points": 5})
            base_score += 5
        elif last_activity_days > 90:
            modifiers.append({"modifier": "Stale opportunity (> 90 days)", "points": -15})
            base_score -= 15
        elif last_activity_days > 60:
            modifiers.append({"modifier": "Aging opportunity (> 60 days)", "points": -10})
            base_score -= 10

    # Source quality modifier
    if source_type == "transcript":
        modifiers.append({"modifier": "Meeting transcript source", "points": 10})
        base_score += 10
    elif source_type == "email":
        modifiers.append({"modifier": "Email thread source", "points": 5})
        base_score += 5

    # Multiple signal types bonus
    unique_types = len(set(s.get("type") for s in signals))
    if unique_types >= 3:
        modifiers.append({"modifier": f"Signal diversity ({unique_types} types)", "points": 10})
        base_score += 10

    # Cap score
    final_score = max(0, min(100, base_score))

    # Determine level and priority
    if final_score >= 70:
        level = "high"
        priority = "high"
    elif final_score >= 40:
        level = "medium"
        priority = "medium"
    else:
        level = "low"
        priority = "low"

    return {
        "score": final_score,
        "level": level,
        "priority": priority,
        "breakdown": {
            "base_score": 10,
            "signal_additions": additions,
            "modifiers_applied": modifiers,
            "final_score": final_score
        }
    }


def assign_pipeline_stage(
    signals: List[Dict[str, Any]],
    confidence_score: int,
    last_activity_days: int = 0,
    has_proposal: bool = False
) -> Dict[str, Any]:
    """
    Assign pipeline stage based on opportunity characteristics.

    Uses signal count, confidence score, recency, and engagement
    indicators to determine appropriate stage.

    Args:
        signals: List of signal dicts
        confidence_score: Previously calculated score (0-100)
        last_activity_days: Days since last activity
        has_proposal: Whether a proposal has been sent

    Returns:
        Dict with:
        - stage: str - Pipeline stage
        - reasoning: str - Why this stage was assigned
        - next_action: str - Recommended next step
    """
    signal_count = len(signals)
    signal_types = set(s.get("type") for s in signals)

    # Check for manual stages first
    if has_proposal:
        return {
            "stage": "proposal_sent",
            "reasoning": "Proposal has been sent to this contact",
            "next_action": "Follow up on proposal status"
        }

    # Check engagement signals
    has_follow_up = "FOLLOW_UP_REQUEST" in signal_types
    has_explicit_interest = "EXPLICIT_INTEREST" in signal_types

    # Stage determination logic
    if confidence_score >= 70 and has_follow_up:
        stage = "engaged"
        reasoning = f"High confidence ({confidence_score}) with follow-up request"
        next_action = "Prepare and send proposal"
    elif confidence_score >= 50 and has_explicit_interest:
        stage = "engaged"
        reasoning = f"Medium-high confidence ({confidence_score}) with explicit interest"
        next_action = "Schedule call or demo"
    elif confidence_score >= 30 and signal_count >= 2:
        stage = "qualified"
        reasoning = f"Sufficient signals ({signal_count}) with score {confidence_score}"
        next_action = "Nurture with follow-up outreach"
    else:
        stage = "discovered"
        reasoning = f"Initial discovery with {signal_count} signal(s)"
        next_action = "Research contact and qualify opportunity"

    # Recency adjustments
    if last_activity_days > 60 and stage in ["engaged", "qualified"]:
        stage = "qualified"  # Demote stale engaged to qualified
        reasoning += f" (demoted due to {last_activity_days} days inactivity)"
        next_action = "Re-engage with personalized outreach"

    return {
        "stage": stage,
        "reasoning": reasoning,
        "next_action": next_action
    }


# =============================================================================
# DEDUPLICATION FUNCTIONS
# =============================================================================

def merge_duplicate_opportunities(
    opportunities: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Merge duplicate opportunities from the same contact/company.

    Identifies duplicates by email address and company name, then
    consolidates signals and takes the highest confidence score.

    Args:
        opportunities: List of opportunity dicts

    Returns:
        Dict with:
        - merged: List[Dict] - Deduplicated opportunities
        - merge_count: int - Number of merges performed
        - merge_log: List - Details of merges
    """
    merged_map = {}  # Key: (email or company) -> opportunity
    merge_log = []

    for opp in opportunities:
        email = opp.get("contact", {}).get("email", "").lower()
        company = opp.get("contact", {}).get("company", "").lower()

        # Create merge key
        if email:
            key = f"email:{email}"
        elif company:
            key = f"company:{company}"
        else:
            # No merge key, keep as unique
            key = f"unique:{opp.get('id', id(opp))}"

        if key in merged_map:
            existing = merged_map[key]

            # Merge signals
            existing_signals = existing.get("signals", [])
            new_signals = opp.get("signals", [])

            # Deduplicate signals by content
            seen_content = set(s.get("content", "")[:100] for s in existing_signals)
            for signal in new_signals:
                content_key = signal.get("content", "")[:100]
                if content_key not in seen_content:
                    existing_signals.append(signal)
                    seen_content.add(content_key)

            existing["signals"] = existing_signals

            # Take higher confidence score
            if opp.get("confidence_score", 0) > existing.get("confidence_score", 0):
                existing["confidence_score"] = opp["confidence_score"]

            # Take more recent activity
            if opp.get("last_activity", "") > existing.get("last_activity", ""):
                existing["last_activity"] = opp["last_activity"]

            # Merge sources
            if "sources" not in existing:
                existing["sources"] = [existing.get("source_id", "unknown")]
            existing["sources"].append(opp.get("source_id", "unknown"))

            merge_log.append({
                "action": "merged",
                "key": key,
                "contact": opp.get("contact", {}).get("name", "Unknown")
            })
        else:
            merged_map[key] = opp.copy()

    return {
        "merged": list(merged_map.values()),
        "merge_count": len(opportunities) - len(merged_map),
        "merge_log": merge_log,
        "original_count": len(opportunities),
        "final_count": len(merged_map)
    }


def find_related_opportunities(
    opportunity: Dict[str, Any],
    all_opportunities: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Find opportunities related to a given opportunity.

    Looks for same company, same email domain, or overlapping
    signals that suggest related deals.

    Args:
        opportunity: The opportunity to find relations for
        all_opportunities: Full list of opportunities

    Returns:
        List of related opportunity dicts with relation type
    """
    related = []

    email = opportunity.get("contact", {}).get("email", "")
    company = opportunity.get("contact", {}).get("company", "")
    email_domain = email.split("@")[1] if "@" in email else ""

    for opp in all_opportunities:
        if opp.get("id") == opportunity.get("id"):
            continue  # Skip self

        opp_email = opp.get("contact", {}).get("email", "")
        opp_company = opp.get("contact", {}).get("company", "")
        opp_domain = opp_email.split("@")[1] if "@" in opp_email else ""

        relation = None

        # Same company
        if company and opp_company and company.lower() == opp_company.lower():
            relation = "same_company"
        # Same email domain
        elif email_domain and opp_domain and email_domain == opp_domain:
            relation = "same_organization"

        if relation:
            related.append({
                "opportunity": opp,
                "relation_type": relation
            })

    return related


# =============================================================================
# PRIORITY SCORING ALGORITHM
# =============================================================================

# Value weights by opportunity type (higher = more valuable)
OPPORTUNITY_TYPE_VALUES = {
    "consulting": 1.5,  # High-value retainers
    "enterprise": 1.4,  # Enterprise platform deals
    "membership": 1.0,  # Standard membership
    "report_generator": 1.0,
    "commons_partnership": 0.8,
    "commons": 0.8,
    "media": 0.6,  # Lower immediate revenue
}


def calculate_priority_score(
    confidence_score: int,
    days_since_contact: int,
    engagement_score: float,
    opportunity_type: str,
    awaiting_response_days: int = 0,
    is_stale: bool = False,
    has_explicit_interest: bool = False,
    has_follow_up_request: bool = False
) -> Dict[str, Any]:
    """
    Calculate composite priority score combining multiple factors.
    
    The algorithm balances:
    1. Opportunity potential (confidence score)
    2. Urgency (time decay for stale opportunities)
    3. Engagement history
    4. Opportunity value weighting
    
    Args:
        confidence_score: 0-100 confidence in opportunity
        days_since_contact: Days since last communication
        engagement_score: 0.0-1.0 historical engagement metric
        opportunity_type: Type of opportunity
        awaiting_response_days: Days we've been waiting for response
        is_stale: Whether opportunity is flagged as stale
        has_explicit_interest: Whether contact expressed explicit interest
        has_follow_up_request: Whether contact requested follow-up
    
    Returns:
        Dict with priority_score (0-100), breakdown, and recommended_action
    """
    # Base score from confidence (40% weight)
    base_score = confidence_score * 0.4
    
    # Time decay factor (20% weight)
    # Opportunities get more urgent as they age, up to a point
    if days_since_contact <= 7:
        time_score = 20  # Recent = high priority
    elif days_since_contact <= 14:
        time_score = 18
    elif days_since_contact <= 30:
        time_score = 15  # Sweet spot for follow-up
    elif days_since_contact <= 60:
        time_score = 12  # Getting stale
    elif days_since_contact <= 90:
        time_score = 8  # Needs re-engagement
    else:
        time_score = 5  # Cold - lower priority unless revived
    
    # Awaiting response boost (opportunities awaiting their reply)
    if awaiting_response_days > 0:
        if awaiting_response_days <= 3:
            time_score += 5  # Fresh - give them time
        elif awaiting_response_days <= 7:
            time_score += 8  # Time to nudge
        elif awaiting_response_days <= 14:
            time_score += 10  # Follow-up due
        else:
            time_score += 6  # Cold - may need different approach
    
    # Engagement score (20% weight)
    engagement_contribution = engagement_score * 20
    
    # Opportunity type value weight (20% weight)
    type_multiplier = OPPORTUNITY_TYPE_VALUES.get(opportunity_type, 1.0)
    type_score = 20 * type_multiplier
    
    # Bonus points
    bonus = 0
    if has_explicit_interest:
        bonus += 5
    if has_follow_up_request:
        bonus += 5
    if is_stale and days_since_contact > 30:
        bonus += 3  # Slight boost to surface stale items
    
    # Calculate final score
    raw_score = base_score + time_score + engagement_contribution + type_score + bonus
    final_score = min(100, max(0, raw_score))
    
    # Determine recommended action
    if awaiting_response_days > 7:
        if awaiting_response_days > 14:
            action = "Send gentle follow-up (2+ weeks waiting)"
        else:
            action = "Consider follow-up nudge"
    elif days_since_contact > 60:
        action = "Re-engagement outreach needed"
    elif days_since_contact > 30:
        action = "Follow-up to maintain momentum"
    elif has_follow_up_request:
        action = "Deliver requested follow-up"
    elif has_explicit_interest and confidence_score >= 70:
        action = "Prepare and send proposal"
    elif confidence_score >= 50:
        action = "Nurture with value-add touchpoint"
    else:
        action = "Research and qualify further"
    
    return {
        "priority_score": round(final_score, 1),
        "breakdown": {
            "base_from_confidence": round(base_score, 1),
            "time_urgency": time_score,
            "engagement": round(engagement_contribution, 1),
            "type_value": round(type_score, 1),
            "bonus": bonus
        },
        "recommended_action": action,
        "urgency_level": (
            "critical" if final_score >= 75 else
            "high" if final_score >= 60 else
            "medium" if final_score >= 40 else
            "low"
        )
    }


def calculate_engagement_score(
    contact_history: list,
    days_since_contact: int
) -> float:
    """
    Calculate engagement score from communication history.
    
    Factors:
    - Number of interactions
    - Recency of interactions
    - Balance of inbound vs outbound
    - Response patterns
    
    Args:
        contact_history: List of ContactEvent dicts
        days_since_contact: Days since last contact
        
    Returns:
        Float 0.0-1.0 engagement score
    """
    if not contact_history:
        return 0.1  # Minimal score for unknown engagement
    
    # Count interactions
    total_events = len(contact_history)
    inbound_count = sum(1 for e in contact_history if e.get("direction") == "inbound")
    outbound_count = sum(1 for e in contact_history if e.get("direction") == "outbound")
    
    # Base score from interaction volume
    volume_score = min(0.4, total_events * 0.05)  # Cap at 0.4 (8+ interactions)
    
    # Balance score - prefer 2-way communication
    if total_events > 0:
        balance_ratio = min(inbound_count, outbound_count) / max(inbound_count, outbound_count, 1)
        balance_score = balance_ratio * 0.3  # Up to 0.3 for perfect balance
    else:
        balance_score = 0
    
    # Recency score
    if days_since_contact <= 7:
        recency_score = 0.3
    elif days_since_contact <= 14:
        recency_score = 0.25
    elif days_since_contact <= 30:
        recency_score = 0.2
    elif days_since_contact <= 60:
        recency_score = 0.1
    else:
        recency_score = 0.05
    
    # Response rate bonus (if we have responses to our outreach)
    if outbound_count > 0 and inbound_count > 0:
        response_rate = inbound_count / outbound_count
        response_bonus = min(0.1, response_rate * 0.05)
    else:
        response_bonus = 0
    
    total = volume_score + balance_score + recency_score + response_bonus
    return min(1.0, total)


def determine_opportunity_status(
    days_since_contact: int,
    last_outbound_date: str,
    last_inbound_date: str,
    awaiting_response_days: int
) -> str:
    """
    Determine opportunity status based on communication patterns.
    
    Args:
        days_since_contact: Days since any contact
        last_outbound_date: ISO date of last email we sent
        last_inbound_date: ISO date of last email received
        awaiting_response_days: Days waiting for their response
        
    Returns:
        Status string: ACTIVE, STALE, NEEDS_FOLLOWUP, AWAITING_RESPONSE
    """
    # No contact at all
    if not last_outbound_date and not last_inbound_date:
        return "needs_followup"
    
    # We sent last, waiting for response
    if last_outbound_date and (not last_inbound_date or last_outbound_date > last_inbound_date):
        if awaiting_response_days > 14:
            return "stale"  # Too long waiting
        elif awaiting_response_days > 0:
            return "awaiting_response"
    
    # They responded most recently
    if last_inbound_date and (not last_outbound_date or last_inbound_date > last_outbound_date):
        if days_since_contact > 7:
            return "needs_followup"  # We should respond
        else:
            return "active"
    
    # Recent activity
    if days_since_contact <= 14:
        return "active"
    elif days_since_contact <= 30:
        return "needs_followup"
    else:
        return "stale"


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

ANALYSIS_WORKFLOW = """
## Opportunity Analysis Workflow

When analyzing opportunities, Claude should follow these steps:

### Step 1: Classify the Opportunity

```python
classification = classify_opportunity(signals)
opportunity_type = classification["primary_type"]
```

Use signal patterns to determine which NGM service type the opportunity matches.

### Step 2: Score Confidence

```python
scoring = score_opportunity(
    signals=signals,
    opportunity_type=opportunity_type,
    source_type="transcript",  # or "email"
    last_activity_days=calculate_days_since(last_activity),
    is_referral=check_if_referral(opportunity),
    is_decision_maker=check_decision_maker(signals)
)
confidence_score = scoring["score"]
```

Consider all factors: signal strength, recency, source quality, referral status.

### Step 3: Assign Pipeline Stage

```python
stage_result = assign_pipeline_stage(
    signals=signals,
    confidence_score=confidence_score,
    last_activity_days=days_since_activity
)
pipeline_stage = stage_result["stage"]
```

Determine where in the sales funnel this opportunity belongs.

### Step 4: Deduplicate

After analyzing all sources, merge duplicates:

```python
merged = merge_duplicate_opportunities(all_opportunities)
final_opportunities = merged["merged"]
```

### Step 5: Generate Output

Create opportunity objects with all analysis results for dashboard display.
"""
