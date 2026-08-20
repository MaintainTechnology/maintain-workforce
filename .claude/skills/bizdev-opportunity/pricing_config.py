"""
Pricing Configuration and Value Proposition for BizDev Opportunity Intelligence

Standard partnership structure and differentiators for Dr. Anant Vinjamoori / NGM.
This module serves as the single source of truth for all pricing and positioning
across proposals, emails, and outreach materials.

Last Updated: 2026-01-18
"""

from typing import Dict, Any, List

# =============================================================================
# CONSULTING SERVICES PRICING
# =============================================================================
#
# IMPORTANT: Default to $10,000/month for ALL proposals.
# The $5,000/month rate is ONLY used when the user explicitly instructs to apply it.
# Do NOT present both options in proposals—use one rate or the other.
#
# =============================================================================

CONSULTING_PRICING = {
    "standard_rate": 10000,  # $/month - DEFAULT FOR ALL PROPOSALS
    "minimum_rate": 5000,    # $/month - ONLY when user explicitly requests early-stage rate
    "commitment_structure": {
        "upfront_minimum": 3,  # months required for upfront commitment
        "month_to_month_available": True,
        "upfront_discount": 0,  # No discount, but commitment required
    },
    "deliverables": [
        "Weekly synchronous meetings",
        "Integration into client team operating systems (Slack, Notion, etc.)",
        "Product specification review and feedback",
        "Clinical strategy formulation",
        "Technology strategy development",
    ],
    "pricing_guidance": {
        "standard": {
            "rate": "$10,000/month",
            "when_to_use": "DEFAULT - Use for all proposals unless explicitly instructed otherwise",
            "commitment": "3-month upfront commitment ($30,000), then month-to-month",
        },
        "early_stage": {
            "rate": "$5,000/month",
            "when_to_use": "ONLY when user explicitly instructs to apply early-stage rate",
            "commitment": "3-month upfront commitment ($15,000), then month-to-month",
            "criteria": [
                "User must explicitly request this rate",
                "Reserved for resource-constrained early-stage companies/startups",
                "Never present both options—use one or the other",
            ],
        },
    },
}

# =============================================================================
# LONGEVITY PLATFORM (REPORT GENERATOR) PRICING
# =============================================================================

PLATFORM_PRICING = {
    "base_tier": {
        "name": "Base",
        "rate": 499,  # $/month
        "reports_included": 200,
        "description": "200 generated reports per month",
    },
    "scaling_note": "Tiered pricing scales beyond baseline volume - contact for enterprise pricing",
    "features": [
        "AI Lab Report Generator access",
        "Publication-quality patient reports with citations",
        "Customizable to practice philosophy and branding",
        "Handles any biomarker type",
        "5-minute turnaround vs 45-minute manual process",
    ],
}

# =============================================================================
# VALUE PROPOSITION - WORLD-CLASS EXPERTISE
# =============================================================================

EXPERTISE_DIFFERENTIATORS = {
    "headline": "World-Class Expertise in Longevity Medicine",
    "track_record": [
        "Track record building multiple $100M+ healthcare companies",
        "Pioneered the first vertically integrated longevity clinic in the United States (Modern Age)",
        "Current advisor to industry leaders including MidiHealth and Superpower",
        "Unparalleled industry perspective from active engagement with top-tier organizations",
    ],
    "positions_held": [
        "Chief Medical Officer, Modern Age (scaled to national telemedicine presence)",
        "Advisor, MidiHealth (one of the largest companies in the space)",
        "Advisor, Superpower (one of the largest companies in the space)",
    ],
    "outcomes_delivered": [
        "Built and scaled the first vertically integrated longevity clinic to national telemedicine presence",
        "Developed clinical protocols used by hundreds of practitioners",
        "Created operational frameworks adopted across the longevity industry",
    ],
}

# =============================================================================
# VALUE PROPOSITION - PROPRIETARY TECHNOLOGY
# =============================================================================

TECHNOLOGY_DIFFERENTIATORS = {
    "headline": "Proprietary Technology Platform",
    "platform_description": (
        "Built on years of curated longevity and frontier medicine data. "
        "Based on a unique, rigorously sourced model of health through the lens of "
        "cell biology—the future of medicine—instead of just conventional guidelines."
    ),
    "key_points": [
        "Years of curated longevity and frontier medicine research",
        "Cell biology-first approach vs. conventional guidelines",
        "Delivers insights fundamentally irreplicable by generic LLMs or competing platforms",
        "Continuously updated core asset capturing cutting-edge research",
        "50,000+ studies integrated into knowledge base",
    ],
    "competitive_moat": (
        "The knowledge base is intentionally constrained and curated. Generic AI trained on "
        "everything produces washed-out answers. The value is in knowing what to include "
        "and what to exclude—this curation is the irreplicable asset."
    ),
}

# =============================================================================
# VALUE PROPOSITION - CROSS-DOMAIN MASTERY
# =============================================================================

INTEGRATION_DIFFERENTIATORS = {
    "headline": "Integrated Cross-Domain Mastery",
    "description": (
        "Rare convergence of deep expertise across technology, medicine, and business. "
        "This integration is virtually unavailable elsewhere in the market."
    ),
    "domains": [
        {
            "domain": "Medicine",
            "credentials": "MD, board-certified physician, longevity medicine specialist",
            "application": "Clinical protocol development, medical strategy, regulatory navigation",
        },
        {
            "domain": "Technology",
            "credentials": "Built AI-powered platforms, integrated health tech systems",
            "application": "Product architecture, AI integration, technical due diligence",
        },
        {
            "domain": "Business",
            "credentials": "Scaled healthcare companies, advised funded startups",
            "application": "Go-to-market strategy, pricing, operational excellence",
        },
    ],
    "client_value": [
        "Accelerated timelines by eliminating need for multiple disparate consultants",
        "Cost savings through integrated expertise",
        "Compressed development cycles",
        "De-risked strategic decisions",
    ],
}

# =============================================================================
# COMPLETE VALUE PROPOSITION SUMMARY
# =============================================================================

VALUE_PROPOSITION_SUMMARY = {
    "tagline": "Turning science into strategy—and strategy into systems that deliver results.",
    "one_liner": (
        "The combination of proven execution at scale, proprietary technology infrastructure, "
        "and cross-functional fluency represents a world-class offering that compresses "
        "development cycles and de-risks strategic decisions."
    ),
    "key_differentiators": [
        "Built $100M+ healthcare companies",
        "Proprietary AI platform with curated longevity knowledge",
        "Rare medicine + technology + business integration",
        "Advisor to industry leaders (MidiHealth, Superpower)",
    ],
    "proof_points": [
        "First vertically integrated longevity clinic in the US",
        "200,000+ monthly LinkedIn impressions reaching longevity clinicians",
        "50,000+ studies in curated knowledge base",
        "Protocols used across the longevity industry",
    ],
}

# =============================================================================
# PROPOSAL PRICING TEMPLATES
# =============================================================================

PROPOSAL_PRICING_TEMPLATES = {
    "consulting": {
        "standard": {
            "engagement": "Monthly Strategic Advisory",
            "rate": "$10,000/month",
            "commitment": "3-month upfront commitment ($30,000), then month-to-month",
            "includes": CONSULTING_PRICING["deliverables"],
        },
        "reduced": {
            "engagement": "Monthly Strategic Advisory (Early-Stage)",
            "rate": "$5,000/month",
            "commitment": "3-month upfront commitment ($15,000), then month-to-month",
            "includes": CONSULTING_PRICING["deliverables"],
            "note": "Reduced rate for resource-constrained early-stage companies",
        },
    },
    "platform": {
        "base": {
            "engagement": "Longevity Platform Access",
            "rate": "$499/month",
            "includes": [
                "200 generated reports per month",
                "AI Lab Report Generator",
                "Publication-quality outputs",
                "Practice branding customization",
            ],
        },
    },
    "combined": {
        "advisory_plus_platform": {
            "engagement": "Advisory + Platform Bundle",
            "rate": "$10,000/month (advisory) + $499/month (platform)",
            "commitment": "3-month upfront commitment",
            "includes": CONSULTING_PRICING["deliverables"] + PLATFORM_PRICING["features"],
        },
    },
}

# =============================================================================
# EMAIL POSITIONING SNIPPETS
# =============================================================================

EMAIL_VALUE_SNIPPETS = {
    "expertise_short": (
        "After building Modern Age into the first national-scale longevity clinic "
        "and advising companies like MidiHealth and Superpower, I've seen what works."
    ),
    "technology_short": (
        "My platform is built on years of curated research—intentionally constrained "
        "to deliver insights generic AI can't replicate."
    ),
    "integration_short": (
        "I bring a rare combination of clinical, technical, and business expertise "
        "that eliminates the need for multiple consultants."
    ),
    "outcome_focus": (
        "The goal is to accelerate your timeline and de-risk your decisions "
        "by applying lessons from building at scale."
    ),
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_recommended_rate(company_stage: str = "standard") -> Dict[str, Any]:
    """
    Get recommended consulting rate based on company stage.
    
    Args:
        company_stage: "standard", "early_stage", or "enterprise"
    
    Returns:
        Dict with rate, commitment, and rationale
    """
    if company_stage == "early_stage":
        return {
            "rate": CONSULTING_PRICING["minimum_rate"],
            "rate_formatted": "$5,000/month",
            "commitment": "3-month upfront commitment required",
            "rationale": "Reduced rate for resource-constrained early-stage company",
        }
    else:
        return {
            "rate": CONSULTING_PRICING["standard_rate"],
            "rate_formatted": "$10,000/month",
            "commitment": "3-month upfront commitment, then month-to-month",
            "rationale": "Standard advisory rate",
        }


def get_value_proposition_for_context(opportunity_type: str) -> Dict[str, Any]:
    """
    Get contextually relevant value proposition elements.
    
    Args:
        opportunity_type: "consulting", "membership", "enterprise", etc.
    
    Returns:
        Dict with relevant differentiators and proof points
    """
    # All opportunities benefit from the full value prop, but we can emphasize different aspects
    if opportunity_type == "consulting":
        emphasis = {
            "primary": EXPERTISE_DIFFERENTIATORS,
            "secondary": INTEGRATION_DIFFERENTIATORS,
            "proof_points": [
                "Built $100M+ healthcare companies",
                "First vertically integrated longevity clinic in the US",
                "Current advisor to MidiHealth, Superpower",
            ],
        }
    elif opportunity_type in ["membership", "report_generator"]:
        emphasis = {
            "primary": TECHNOLOGY_DIFFERENTIATORS,
            "secondary": EXPERTISE_DIFFERENTIATORS,
            "proof_points": [
                "50,000+ studies in curated knowledge base",
                "200,000+ monthly LinkedIn impressions reaching longevity clinicians",
                "5-minute reports vs 45-minute manual process",
            ],
        }
    else:
        emphasis = {
            "primary": INTEGRATION_DIFFERENTIATORS,
            "secondary": EXPERTISE_DIFFERENTIATORS,
            "proof_points": VALUE_PROPOSITION_SUMMARY["proof_points"],
        }
    
    return {
        **emphasis,
        "tagline": VALUE_PROPOSITION_SUMMARY["tagline"],
        "one_liner": VALUE_PROPOSITION_SUMMARY["one_liner"],
    }


def format_pricing_for_proposal(
    opportunity_type: str,
    company_stage: str = "standard",
    include_platform: bool = False
) -> Dict[str, Any]:
    """
    Format pricing section for proposal generation.
    
    Args:
        opportunity_type: Type of opportunity
        company_stage: "standard" or "early_stage"
        include_platform: Whether to include platform pricing
    
    Returns:
        Dict with formatted pricing details
    """
    pricing = get_recommended_rate(company_stage)
    
    result = {
        "primary_engagement": {
            "name": "Monthly Strategic Advisory",
            "rate": pricing["rate_formatted"],
            "commitment": pricing["commitment"],
            "deliverables": CONSULTING_PRICING["deliverables"],
        },
    }
    
    if include_platform:
        result["platform_addon"] = {
            "name": "Longevity Platform Access",
            "rate": f"${PLATFORM_PRICING['base_tier']['rate']}/month",
            "reports": PLATFORM_PRICING["base_tier"]["reports_included"],
            "features": PLATFORM_PRICING["features"],
        }
    
    return result
