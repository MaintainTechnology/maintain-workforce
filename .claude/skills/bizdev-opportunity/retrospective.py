"""
Retrospective Analysis for BizDev Opportunity Intelligence

Provides functions for:
1. Historical data analysis (6-8 month lookback)
2. Identifying stale/missed opportunities
3. Generating re-engagement suggestions
4. Time-decay weighted scoring

These functions help surface opportunities that may have slipped through
the cracks and provide actionable re-engagement strategies.
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import math

# =============================================================================
# TIME DECAY CONFIGURATION
# =============================================================================

TIME_DECAY_CONFIG = {
    "half_life_days": 45,  # Score halves every 45 days of inactivity
    "min_score_multiplier": 0.1,  # Never decay below 10% of original
    "fresh_window_days": 14,  # No decay within first 14 days
    "stale_threshold_days": 60,  # Considered stale after 60 days
    "cold_threshold_days": 120  # Considered cold/missed after 120 days
}


# =============================================================================
# STALE OPPORTUNITY DETECTION
# =============================================================================

STALE_INDICATORS = {
    "no_response": {
        "description": "No response to outreach",
        "severity": "medium",
        "suggestions": [
            "Try a different channel (email vs LinkedIn)",
            "Reference a recent industry development",
            "Offer a specific, time-limited resource"
        ]
    },
    "conversation_dropped": {
        "description": "Active conversation went silent",
        "severity": "high",
        "suggestions": [
            "Send a brief check-in referencing last topic",
            "Share relevant content without asking for anything",
            "Propose a specific next step with easy commitment"
        ]
    },
    "proposal_no_response": {
        "description": "Proposal sent but no follow-up",
        "severity": "high",
        "suggestions": [
            "Follow up asking if they have questions",
            "Offer to simplify or customize the proposal",
            "Provide a case study of similar engagement"
        ]
    },
    "meeting_no_follow_up": {
        "description": "Meeting held but no advancement",
        "severity": "medium",
        "suggestions": [
            "Send meeting recap with clear next steps",
            "Address any concerns raised in meeting",
            "Propose a smaller pilot or trial"
        ]
    },
    "expressed_interest_then_quiet": {
        "description": "Strong signals but no continuation",
        "severity": "high",
        "suggestions": [
            "Ask directly if priorities have shifted",
            "Offer alternative timing or engagement model",
            "Connect them with a current member for peer perspective"
        ]
    }
}


# =============================================================================
# RE-ENGAGEMENT TEMPLATES
# =============================================================================

REENGAGEMENT_TEMPLATES = {
    "consulting": {
        "subject_lines": [
            "Quick thought on {company}'s {pain_point}",
            "Saw something that made me think of {company}",
            "Following up on our {topic} conversation"
        ],
        "opening_hooks": [
            "I was reviewing our conversation about {pain_point} and had a thought.",
            "A practice I'm working with just solved {similar_problem}, reminded me of you.",
            "I know we discussed {topic} a while back. Still relevant?"
        ],
        "value_offers": [
            "Happy to share what's working for other practices in {area}.",
            "If you're still thinking about {topic}, I have a framework that might help.",
            "I put together a quick analysis that might be useful for your situation."
        ]
    },
    "membership": {
        "subject_lines": [
            "New on the platform that might interest you",
            "Quick update since we last talked",
            "{relevant_topic} resource you might find useful"
        ],
        "opening_hooks": [
            "We just added {new_feature} that directly addresses {pain_point}.",
            "A few practitioners in {specialty} joined recently and the discussions have been great.",
            "Thought of you when we published our new {content_type} on {topic}."
        ],
        "value_offers": [
            "Happy to give you a fresh walkthrough of the platform.",
            "I can set you up with a trial period to explore at your pace.",
            "Would you find it useful to connect with a member in {specialty}?"
        ]
    },
    "report_generator": {
        "subject_lines": [
            "Lab report workflow update",
            "New biomarker coverage you might want to see",
            "5-minute demo of report improvements"
        ],
        "opening_hooks": [
            "We've made significant improvements to {feature} since we talked.",
            "A practice similar to yours just cut their report time by {percentage}.",
            "I remembered you mentioned {pain_point}, we just addressed that."
        ],
        "value_offers": [
            "Want me to run one of your actual panels through the system?",
            "I can show you a 5-minute demo focused specifically on {use_case}.",
            "Happy to share anonymized examples from practices like yours."
        ]
    },
    "commons_partnership": {
        "subject_lines": [
            "Longevity clinician interest in {product_category}",
            "Partnership opportunity update",
            "NGM Commons visibility for {company}"
        ],
        "opening_hooks": [
            "We've had several practitioners asking about {product_category} solutions.",
            "Our member base has grown significantly since we last connected.",
            "I wanted to circle back on getting {company} more visibility."
        ],
        "value_offers": [
            "I can share current search trends from our clinician community.",
            "Happy to discuss updated partnership options.",
            "Would a case study with a current partner be useful to see?"
        ]
    }
}


# =============================================================================
# ANALYSIS FUNCTIONS
# =============================================================================

def calculate_time_decay_score(
    original_score: int,
    days_since_activity: int
) -> Dict[str, Any]:
    """
    Apply time-decay to an opportunity score.

    Uses exponential decay with configurable half-life to reduce
    scores for stale opportunities while preserving high-signal ones.

    Args:
        original_score: The original confidence score (0-100)
        days_since_activity: Days since last activity

    Returns:
        Dict with:
        - decayed_score: int - Score after decay
        - decay_factor: float - Multiplier applied
        - status: str - fresh/aging/stale/cold
    """
    config = TIME_DECAY_CONFIG

    # No decay within fresh window
    if days_since_activity <= config["fresh_window_days"]:
        return {
            "decayed_score": original_score,
            "decay_factor": 1.0,
            "status": "fresh",
            "days_since_activity": days_since_activity
        }

    # Calculate decay using half-life formula
    effective_days = days_since_activity - config["fresh_window_days"]
    half_life = config["half_life_days"]
    decay_factor = math.pow(0.5, effective_days / half_life)

    # Apply minimum multiplier floor
    decay_factor = max(decay_factor, config["min_score_multiplier"])

    decayed_score = int(original_score * decay_factor)

    # Determine status
    if days_since_activity <= config["stale_threshold_days"]:
        status = "aging"
    elif days_since_activity <= config["cold_threshold_days"]:
        status = "stale"
    else:
        status = "cold"

    return {
        "decayed_score": decayed_score,
        "decay_factor": round(decay_factor, 3),
        "status": status,
        "days_since_activity": days_since_activity,
        "original_score": original_score
    }


def identify_stale_opportunities(
    opportunities: List[Dict[str, Any]],
    days_threshold: int = 60
) -> Dict[str, Any]:
    """
    Identify opportunities that have gone stale.

    Finds opportunities with no recent activity that haven't
    been explicitly closed, indicating potential missed deals.

    Args:
        opportunities: List of opportunity dicts with last_activity
        days_threshold: Days of inactivity to consider stale

    Returns:
        Dict with:
        - stale: List - Opportunities past threshold
        - at_risk: List - Opportunities approaching threshold
        - analysis: Dict - Summary statistics
    """
    today = datetime.now()
    stale = []
    at_risk = []

    for opp in opportunities:
        # Skip closed opportunities
        stage = opp.get("stage", "")
        if stage in ["closed_won", "closed_lost"]:
            continue

        # Calculate days since activity
        last_activity = opp.get("last_activity", "")
        if not last_activity:
            days_inactive = 999  # Treat missing date as very stale
        else:
            try:
                last_date = datetime.fromisoformat(last_activity.replace("Z", "+00:00"))
                days_inactive = (today - last_date.replace(tzinfo=None)).days
            except (ValueError, TypeError):
                days_inactive = 999

        # Apply time decay
        original_score = opp.get("confidence_score", 50)
        decay_result = calculate_time_decay_score(original_score, days_inactive)

        # Classify stale indicator
        stale_indicator = classify_stale_indicator(opp, days_inactive)

        enriched_opp = {
            **opp,
            "days_inactive": days_inactive,
            "decay_result": decay_result,
            "stale_indicator": stale_indicator,
            "adjusted_score": decay_result["decayed_score"]
        }

        if days_inactive >= days_threshold:
            stale.append(enriched_opp)
        elif days_inactive >= (days_threshold * 0.7):  # 70% of threshold
            at_risk.append(enriched_opp)

    # Sort by original score (prioritize high-potential stale opportunities)
    stale.sort(key=lambda x: x.get("confidence_score", 0), reverse=True)
    at_risk.sort(key=lambda x: x.get("confidence_score", 0), reverse=True)

    return {
        "stale": stale,
        "at_risk": at_risk,
        "analysis": {
            "total_opportunities": len(opportunities),
            "stale_count": len(stale),
            "at_risk_count": len(at_risk),
            "threshold_days": days_threshold,
            "high_value_stale": len([o for o in stale if o.get("confidence_score", 0) >= 60])
        }
    }


def classify_stale_indicator(
    opportunity: Dict[str, Any],
    days_inactive: int
) -> Dict[str, Any]:
    """
    Determine the type of staleness for an opportunity.

    Analyzes the opportunity's history to understand why
    it went cold and what type of re-engagement is appropriate.

    Args:
        opportunity: The opportunity dict
        days_inactive: Days since last activity

    Returns:
        Dict with indicator type, severity, and suggestions
    """
    stage = opportunity.get("stage", "discovered")
    signals = opportunity.get("signals", [])
    signal_types = [s.get("type") for s in signals]

    # Determine indicator based on stage and signals
    if stage == "proposal_sent":
        indicator_type = "proposal_no_response"
    elif "FOLLOW_UP_REQUEST" in signal_types and stage == "engaged":
        indicator_type = "meeting_no_follow_up"
    elif "EXPLICIT_INTEREST" in signal_types and days_inactive > 30:
        indicator_type = "expressed_interest_then_quiet"
    elif stage in ["qualified", "engaged"]:
        indicator_type = "conversation_dropped"
    else:
        indicator_type = "no_response"

    indicator = STALE_INDICATORS.get(indicator_type, STALE_INDICATORS["no_response"])

    return {
        "type": indicator_type,
        "description": indicator["description"],
        "severity": indicator["severity"],
        "generic_suggestions": indicator["suggestions"]
    }


def generate_reengagement_suggestions(
    opportunity: Dict[str, Any],
    stale_indicator: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate personalized re-engagement suggestions for a stale opportunity.

    Creates specific outreach recommendations based on opportunity type,
    previous interactions, and the nature of the staleness.

    Args:
        opportunity: The stale opportunity dict
        stale_indicator: Optional pre-classified indicator

    Returns:
        Dict with:
        - subject_suggestions: List of email subject options
        - opening_suggestions: List of opening line options
        - value_offer_suggestions: List of value propositions
        - channel_recommendation: Preferred outreach channel
        - timing_recommendation: Best timing for outreach
        - personalization_notes: Specific details to include
    """
    opp_type = opportunity.get("opportunity_type", "membership")
    templates = REENGAGEMENT_TEMPLATES.get(opp_type, REENGAGEMENT_TEMPLATES["membership"])

    contact = opportunity.get("contact", {})
    contact_name = contact.get("name", "there")
    company = contact.get("company", "your practice")

    # Extract context from signals
    signals = opportunity.get("signals", [])
    pain_points = [s.get("content") for s in signals if s.get("type") == "PAIN_POINT"]
    interests = [s.get("content") for s in signals if s.get("type") == "EXPLICIT_INTEREST"]

    primary_pain_point = pain_points[0][:50] if pain_points else "your challenges"
    primary_interest = interests[0][:50] if interests else "our conversation"

    # Personalize templates
    subject_suggestions = [
        s.format(
            company=company,
            pain_point=primary_pain_point[:30],
            topic=primary_interest[:30],
            relevant_topic=primary_interest[:30],
            product_category=opp_type
        )
        for s in templates["subject_lines"]
    ]

    opening_suggestions = [
        o.format(
            pain_point=primary_pain_point,
            similar_problem=primary_pain_point,
            topic=primary_interest,
            specialty="longevity medicine",
            new_feature="recent updates",
            content_type="protocol guide",
            feature="report generation",
            percentage="50%"
        )
        for o in templates["opening_hooks"]
    ]

    value_suggestions = [
        v.format(
            area="longevity practice",
            topic=primary_interest,
            specialty="your specialty",
            use_case="your workflow",
            product_category=opp_type
        )
        for v in templates["value_offers"]
    ]

    # Channel recommendation based on stage and type
    stage = opportunity.get("stage", "discovered")
    if stage in ["engaged", "proposal_sent"]:
        channel = "email"
        channel_reason = "Continue in the established communication channel"
    elif contact.get("linkedin"):
        channel = "linkedin"
        channel_reason = "LinkedIn for initial re-engagement, then move to email"
    else:
        channel = "email"
        channel_reason = "Email as primary professional channel"

    # Timing recommendation
    days_inactive = opportunity.get("days_inactive", 30)
    if days_inactive > 90:
        timing = "Tuesday or Wednesday morning, with fresh value offer"
        urgency = "Low urgency, focus on value not ask"
    elif days_inactive > 60:
        timing = "Mid-week, reference time passed naturally"
        urgency = "Medium urgency, offer specific next step"
    else:
        timing = "Soon, while context is still relevant"
        urgency = "Higher urgency, simple check-in appropriate"

    return {
        "subject_suggestions": subject_suggestions,
        "opening_suggestions": opening_suggestions,
        "value_offer_suggestions": value_suggestions,
        "channel_recommendation": {
            "channel": channel,
            "reason": channel_reason
        },
        "timing_recommendation": {
            "timing": timing,
            "urgency": urgency
        },
        "personalization_notes": {
            "contact_name": contact_name,
            "company": company,
            "key_pain_point": primary_pain_point,
            "previous_interest": primary_interest,
            "signals_to_reference": [s.get("content", "")[:100] for s in signals[:3]]
        }
    }


def analyze_historical_data(
    transcript_opportunities: List[Dict[str, Any]],
    email_opportunities: List[Dict[str, Any]],
    lookback_months: int = 6
) -> Dict[str, Any]:
    """
    Perform retrospective analysis on historical opportunity data.

    Combines transcript and email opportunities, applies time decay,
    identifies patterns, and surfaces missed high-potential deals.

    Args:
        transcript_opportunities: Opportunities from transcript scanning
        email_opportunities: Opportunities from email scanning
        lookback_months: How far back to analyze

    Returns:
        Dict with:
        - all_opportunities: Combined and deduplicated list
        - missed_opportunities: High-potential stale opportunities
        - patterns: Identified patterns in missed deals
        - recommendations: Top re-engagement priorities
    """
    # Combine all opportunities
    all_opportunities = transcript_opportunities + email_opportunities

    # Calculate cutoff date
    cutoff_date = datetime.now() - timedelta(days=lookback_months * 30)

    # Filter to lookback window and apply time decay
    in_window = []
    for opp in all_opportunities:
        discovered_at = opp.get("discovered_at", "")
        if discovered_at:
            try:
                discovered_date = datetime.fromisoformat(discovered_at.replace("Z", "+00:00"))
                if discovered_date.replace(tzinfo=None) >= cutoff_date:
                    # Apply time decay
                    last_activity = opp.get("last_activity", discovered_at)
                    last_date = datetime.fromisoformat(last_activity.replace("Z", "+00:00"))
                    days_inactive = (datetime.now() - last_date.replace(tzinfo=None)).days

                    decay_result = calculate_time_decay_score(
                        opp.get("confidence_score", 50),
                        days_inactive
                    )
                    opp["decay_result"] = decay_result
                    opp["adjusted_score"] = decay_result["decayed_score"]
                    opp["days_inactive"] = days_inactive

                    in_window.append(opp)
            except (ValueError, TypeError):
                in_window.append(opp)

    # Identify stale opportunities
    stale_result = identify_stale_opportunities(in_window, days_threshold=60)

    # Find high-potential missed opportunities (high original score but now stale)
    missed = [
        opp for opp in stale_result["stale"]
        if opp.get("confidence_score", 0) >= 50  # Originally high potential
        and opp.get("stage") not in ["closed_won", "closed_lost"]
    ]

    # Analyze patterns in missed opportunities
    patterns = analyze_missed_patterns(missed)

    # Generate prioritized re-engagement list
    recommendations = []
    for opp in missed[:10]:  # Top 10 missed opportunities
        suggestions = generate_reengagement_suggestions(opp)
        recommendations.append({
            "opportunity": {
                "id": opp.get("id"),
                "contact": opp.get("contact", {}),
                "type": opp.get("opportunity_type"),
                "original_score": opp.get("confidence_score"),
                "current_score": opp.get("adjusted_score"),
                "days_inactive": opp.get("days_inactive")
            },
            "suggestions": suggestions
        })

    return {
        "all_opportunities": in_window,
        "total_count": len(in_window),
        "missed_opportunities": missed,
        "missed_count": len(missed),
        "patterns": patterns,
        "recommendations": recommendations,
        "lookback_months": lookback_months,
        "cutoff_date": cutoff_date.isoformat()
    }


def analyze_missed_patterns(
    missed_opportunities: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Identify patterns in missed opportunities.

    Looks for common characteristics among stale/missed deals
    to help improve future opportunity management.

    Args:
        missed_opportunities: List of high-potential stale opportunities

    Returns:
        Dict with pattern analysis
    """
    if not missed_opportunities:
        return {"patterns": [], "insights": []}

    # Analyze by opportunity type
    type_counts = {}
    for opp in missed_opportunities:
        opp_type = opp.get("opportunity_type", "unknown")
        type_counts[opp_type] = type_counts.get(opp_type, 0) + 1

    # Analyze by stage when stale
    stage_counts = {}
    for opp in missed_opportunities:
        stage = opp.get("stage", "unknown")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1

    # Analyze by source
    source_counts = {}
    for opp in missed_opportunities:
        source = opp.get("source", "unknown")
        source_counts[source] = source_counts.get(source, 0) + 1

    # Analyze staleness indicators
    indicator_counts = {}
    for opp in missed_opportunities:
        indicator = opp.get("stale_indicator", {}).get("type", "unknown")
        indicator_counts[indicator] = indicator_counts.get(indicator, 0) + 1

    # Generate insights
    insights = []

    if type_counts:
        top_type = max(type_counts, key=type_counts.get)
        insights.append(
            f"Most missed opportunities are {top_type} type ({type_counts[top_type]} of {len(missed_opportunities)})"
        )

    if stage_counts:
        top_stage = max(stage_counts, key=stage_counts.get)
        insights.append(
            f"Most opportunities stall at '{top_stage}' stage ({stage_counts[top_stage]} opportunities)"
        )

    if indicator_counts:
        top_indicator = max(indicator_counts, key=indicator_counts.get)
        indicator_desc = STALE_INDICATORS.get(top_indicator, {}).get("description", top_indicator)
        insights.append(f"Common pattern: {indicator_desc}")

    return {
        "by_type": type_counts,
        "by_stage": stage_counts,
        "by_source": source_counts,
        "by_indicator": indicator_counts,
        "insights": insights,
        "total_analyzed": len(missed_opportunities)
    }


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

RETROSPECTIVE_WORKFLOW = """
## Retrospective Analysis Workflow

When performing retrospective analysis, Claude should follow these steps:

### Step 1: Gather Historical Data

Collect opportunities from all sources within the lookback window:

```python
# Use transcript scanner for meeting transcripts
transcript_opps = scan_transcript_folder(folder_id, lookback_months=8)

# Use email scanner for email conversations
email_opps = scan_emails(lookback_months=8)
```

### Step 2: Run Retrospective Analysis

```python
analysis = analyze_historical_data(
    transcript_opportunities=transcript_opps,
    email_opportunities=email_opps,
    lookback_months=8
)
```

This will:
- Combine and deduplicate opportunities
- Apply time-decay scoring
- Identify stale/missed opportunities
- Find patterns in missed deals

### Step 3: Review High-Priority Missed Opportunities

```python
for rec in analysis["recommendations"]:
    print(f"Contact: {rec['opportunity']['contact']['name']}")
    print(f"Original Score: {rec['opportunity']['original_score']}")
    print(f"Days Inactive: {rec['opportunity']['days_inactive']}")
    print(f"Suggested Subject: {rec['suggestions']['subject_suggestions'][0]}")
```

### Step 4: Generate Re-engagement Campaign

For each priority opportunity:

```python
suggestions = generate_reengagement_suggestions(opportunity)
```

Use the suggestions to craft personalized outreach.

### Step 5: Track Patterns

Review pattern analysis to identify systemic issues:

```python
patterns = analysis["patterns"]
print(f"Most common stall point: {patterns['insights'][1]}")
```

Use insights to improve future opportunity management.
"""
