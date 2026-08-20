"""
Proposal Bridge for BizDev Opportunity Intelligence

Integrates with Document Studio's proposal-generator skill to
create proposals directly from opportunity data.

Functions:
1. prepare_proposal_context: Extract relevant info for proposals
2. trigger_proposal_generation: Generate invocation instructions
3. format_opportunity_as_transcript: Convert signals to transcript-like format

Updated: 2026-01-18 - New pricing architecture and value proposition
"""

from typing import Dict, Any, List, Optional
from datetime import datetime

# Import centralized pricing configuration
try:
    from .pricing_config import (
        CONSULTING_PRICING,
        PLATFORM_PRICING,
        EXPERTISE_DIFFERENTIATORS,
        TECHNOLOGY_DIFFERENTIATORS,
        INTEGRATION_DIFFERENTIATORS,
        VALUE_PROPOSITION_SUMMARY,
        get_recommended_rate,
        get_value_proposition_for_context,
        format_pricing_for_proposal,
    )
except ImportError:
    # Fallback if running standalone
    pass

# =============================================================================
# OPPORTUNITY TYPE TO PROPOSAL TYPE MAPPING
# =============================================================================

PROPOSAL_TYPE_MAPPING = {
    "consulting": "consulting",
    "membership": "consulting",  # Membership is pitched via consulting proposal
    "report_generator": "consulting",  # Part of platform, consulting approach
    "commons_partnership": "enterprise"  # B2B partnership = enterprise
}

# =============================================================================
# STANDARD PRICING STRUCTURE (2026-01-18)
# =============================================================================
# 
# CONSULTING SERVICES:
# - Standard rate: $10,000/month
# - Minimum rate: $5,000/month (resource-constrained early-stage companies only)
# - Commitment: 3-month upfront required; month-to-month thereafter
# 
# LONGEVITY PLATFORM (Report Generator):
# - Base tier: $499/month for 200 generated reports
# - Tiered pricing scales beyond baseline volume
#
# =============================================================================

# =============================================================================
# VALUE PROPOSITION DIFFERENTIATORS
# =============================================================================
#
# 1. WORLD-CLASS EXPERTISE:
#    - Track record building multiple $100M+ healthcare companies
#    - Pioneered first vertically integrated longevity clinic in the US
#    - Current advisor to MidiHealth, Superpower, and industry leaders
#
# 2. PROPRIETARY TECHNOLOGY PLATFORM:
#    - Years of curated longevity and frontier medicine data
#    - Cell biology-first approach vs conventional guidelines
#    - Insights irreplicable by generic LLMs or competing platforms
#
# 3. INTEGRATED CROSS-DOMAIN MASTERY:
#    - Rare convergence: technology + medicine + business
#    - Eliminates need for multiple disparate consultants
#    - Compresses development cycles, de-risks strategic decisions
#
# =============================================================================

# =============================================================================
# PROPOSAL FRAMING BY OPPORTUNITY TYPE
# =============================================================================

PROPOSAL_FRAMING = {
    "consulting": {
        "value_props": [
            "Track record building multiple $100M+ healthcare companies",
            "Pioneered the first vertically integrated longevity clinic in the United States",
            "Rare convergence of deep expertise across technology, medicine, and business",
            "Proprietary AI platform with curated longevity knowledge base (50,000+ studies)",
            "Current advisor to industry leaders including MidiHealth and Superpower",
        ],
        "typical_services": [
            "Weekly synchronous meetings",
            "Integration into client team operating systems",
            "Product specification review and feedback",
            "Clinical strategy formulation",
            "Technology strategy development",
        ],
        "price_anchors": {
            "low": "$5,000/mo (early-stage, 3-month commitment)",
            "mid": "$10,000/mo (standard, 3-month commitment)",
            "high": "$10,000/mo + platform access + custom scope"
        },
        "commitment_structure": "3-month upfront commitment required; month-to-month thereafter",
        "outcome_focus": "accelerated timelines and de-risked strategic decisions"
    },
    "membership": {
        "value_props": [
            "Access to most comprehensive longevity knowledge base (50,000+ studies)",
            "AI Lab Report Generator saves 40+ minutes per patient",
            "Cell biology-first approach delivers insights generic AI cannot replicate",
            "150+ educational modules with monthly live lectures",
            "Engaged private practitioner community with weekly live sessions"
        ],
        "typical_services": [
            "Longevity Intelligence Platform access",
            "AI Lab Report Generator",
            "Educational curriculum and certification",
            "Community and mentorship"
        ],
        "price_anchors": {
            "low": "$299/mo (Essential tier)",
            "mid": "$499/mo (200 reports/month)",
            "high": "Tiered pricing for higher volume"
        },
        "outcome_focus": "clinical knowledge and efficiency"
    },
    "report_generator": {
        "value_props": [
            "5-minute turnaround vs 45-minute manual process",
            "Publication-quality patient reports with citations",
            "Built on years of curated research—irreplicable by generic AI",
            "Customizable to practice philosophy and branding",
            "Handles any biomarker type"
        ],
        "typical_services": [
            "AI Lab Report Generator access",
            "200 reports/month at base tier",
            "Customization to practice branding",
            "Integration support",
            "Ongoing platform updates"
        ],
        "price_anchors": {
            "low": "$499/mo (200 reports)",
            "mid": "Tiered pricing for higher volume",
            "high": "Enterprise licensing available"
        },
        "outcome_focus": "report efficiency and patient communication"
    },
    "commons_partnership": {
        "value_props": [
            "200,000+ monthly LinkedIn impressions reaching longevity practitioners",
            "AI-native vendor profiles for discovery",
            "Lead capture and contact facilitation",
            "Content collaboration opportunities"
        ],
        "typical_services": [
            "NGM Commons vendor profile",
            "Category visibility",
            "Lead capture integration",
            "Sponsor content opportunities"
        ],
        "price_anchors": {
            "low": "$5,000/year (Partner tier)",
            "mid": "$12,500/year (Sponsor tier)",
            "high": "Custom sponsorship packages"
        },
        "outcome_focus": "clinician reach and market visibility"
    }
}


# =============================================================================
# CONTEXT PREPARATION
# =============================================================================

def prepare_proposal_context(opportunity: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract and format opportunity data for proposal generation.

    Transforms the structured opportunity data into the format
    expected by the proposal-generator skill.

    Args:
        opportunity: Full opportunity dict with contact, signals, etc.

    Returns:
        Dict with proposal-ready context including:
        - client_info: Contact and company details
        - pain_points: Extracted challenges
        - goals: Identified objectives
        - budget_signals: Any budget mentions
        - timeline_signals: Urgency indicators
        - service_interest: What they're interested in
        - source_content: Original transcript/email excerpts
        - recommended_pricing: Suggested pricing tier
        - proposal_framing: Type-specific value props
    """
    contact = opportunity.get("contact", {})
    signals = opportunity.get("signals", [])
    opp_type = opportunity.get("opportunity_type", "consulting")

    # Extract client info
    client_info = {
        "name": contact.get("name", "Prospective Client"),
        "company": contact.get("company", ""),
        "title": contact.get("title", ""),
        "email": contact.get("email", "")
    }

    # Categorize signals
    pain_points = []
    goals = []
    budget_signals = []
    timeline_signals = []
    interest_signals = []
    source_excerpts = []

    for signal in signals:
        sig_type = signal.get("type", "")
        content = signal.get("content", "")

        if sig_type == "PAIN_POINT":
            pain_points.append(content)
        elif sig_type == "BUDGET_MENTION":
            budget_signals.append(content)
        elif sig_type == "TIMELINE_MENTION":
            timeline_signals.append(content)
        elif sig_type in ["EXPLICIT_INTEREST", "FOLLOW_UP_REQUEST"]:
            interest_signals.append(content)

        # Collect all content as source excerpts
        if content:
            source_excerpts.append({
                "type": sig_type,
                "content": content
            })

    # Determine recommended pricing tier based on signals
    recommended_tier = determine_pricing_tier(opportunity)

    # Get type-specific framing
    framing = PROPOSAL_FRAMING.get(opp_type, PROPOSAL_FRAMING["consulting"])

    return {
        "client_info": client_info,
        "pain_points": pain_points,
        "goals": goals,
        "budget_signals": budget_signals,
        "timeline_signals": timeline_signals,
        "interest_signals": interest_signals,
        "source_excerpts": source_excerpts,
        "opportunity_type": opp_type,
        "proposal_type": PROPOSAL_TYPE_MAPPING.get(opp_type, "consulting"),
        "confidence_score": opportunity.get("confidence_score", 50),
        "source": opportunity.get("source", "unknown"),
        "source_id": opportunity.get("source_id", ""),
        "recommended_tier": recommended_tier,
        "proposal_framing": framing,
        "discovered_at": opportunity.get("discovered_at", ""),
        "last_activity": opportunity.get("last_activity", "")
    }


def determine_pricing_tier(opportunity: Dict[str, Any]) -> str:
    """
    Recommend pricing tier based on opportunity signals.

    Args:
        opportunity: Opportunity dict

    Returns:
        Recommended tier: "low", "mid", or "high"
    """
    signals = opportunity.get("signals", [])
    confidence = opportunity.get("confidence_score", 50)

    # Look for budget signals
    has_budget_mention = any(s.get("type") == "BUDGET_MENTION" for s in signals)
    has_decision_maker = any(s.get("type") == "DECISION_MAKER" for s in signals)
    has_timeline = any(s.get("type") == "TIMELINE_MENTION" for s in signals)

    # Score for tier recommendation
    tier_score = 0

    if has_budget_mention:
        tier_score += 2
    if has_decision_maker:
        tier_score += 1
    if has_timeline:
        tier_score += 1
    if confidence >= 70:
        tier_score += 2
    elif confidence >= 50:
        tier_score += 1

    if tier_score >= 4:
        return "high"
    elif tier_score >= 2:
        return "mid"
    else:
        return "low"


# =============================================================================
# TRANSCRIPT FORMATTING
# =============================================================================

def format_opportunity_as_transcript(opportunity: Dict[str, Any]) -> str:
    """
    Convert opportunity signals into transcript-like format.

    Since proposals are typically generated from meeting transcripts,
    this formats opportunity data as if it were extracted from a call.

    Args:
        opportunity: Opportunity dict

    Returns:
        Formatted text that can be processed by proposal-generator
    """
    context = prepare_proposal_context(opportunity)
    lines = []

    # Header
    lines.append(f"# Opportunity Summary: {context['client_info']['name']}")
    lines.append(f"Company: {context['client_info']['company']}")
    lines.append(f"Title: {context['client_info']['title']}")
    lines.append(f"Source: {context['source']} ({context['source_id']})")
    lines.append(f"Date: {context['last_activity'] or context['discovered_at']}")
    lines.append("")

    # Interest expressed
    if context['interest_signals']:
        lines.append("## Interest Expressed")
        for interest in context['interest_signals']:
            lines.append(f"- \"{interest}\"")
        lines.append("")

    # Pain points
    if context['pain_points']:
        lines.append("## Challenges Mentioned")
        for pain in context['pain_points']:
            lines.append(f"- \"{pain}\"")
        lines.append("")

    # Budget signals
    if context['budget_signals']:
        lines.append("## Budget Discussion")
        for budget in context['budget_signals']:
            lines.append(f"- \"{budget}\"")
        lines.append("")

    # Timeline
    if context['timeline_signals']:
        lines.append("## Timeline/Urgency")
        for timeline in context['timeline_signals']:
            lines.append(f"- \"{timeline}\"")
        lines.append("")

    # All source content
    lines.append("## Source Excerpts")
    for excerpt in context['source_excerpts']:
        lines.append(f"[{excerpt['type']}]: \"{excerpt['content']}\"")
    lines.append("")

    # Recommendation
    lines.append("## Analysis")
    lines.append(f"- Opportunity Type: {context['opportunity_type']}")
    lines.append(f"- Confidence Score: {context['confidence_score']}/100")
    lines.append(f"- Recommended Pricing Tier: {context['recommended_tier']}")

    return "\n".join(lines)


# =============================================================================
# PROPOSAL GENERATION TRIGGER
# =============================================================================

def trigger_proposal_generation(opportunity: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate instructions for invoking the proposal-generator skill.

    Returns formatted instructions that Claude can use to invoke
    the proposal-generator skill with the opportunity context.

    Args:
        opportunity: Opportunity dict

    Returns:
        Dict with:
        - invocation_command: How to invoke the skill
        - client_name: Extracted client name
        - proposal_type: consulting or enterprise
        - transcript_content: Formatted opportunity as transcript
        - output_suggestion: Suggested output filename
        - context_notes: Additional context for proposal
    """
    context = prepare_proposal_context(opportunity)
    transcript = format_opportunity_as_transcript(opportunity)

    # Generate suggested filename
    client_slug = context['client_info']['company'] or context['client_info']['name']
    client_slug = client_slug.lower().replace(" ", "-").replace(".", "")[:30]
    date_str = datetime.now().strftime("%Y-%m-%d")
    output_suggestion = f"content/proposals/proposal-{client_slug}-{date_str}.html"

    # Build context notes for proposal
    framing = context['proposal_framing']
    context_notes = []

    context_notes.append(f"## Opportunity Type: {context['opportunity_type'].replace('_', ' ').title()}")
    context_notes.append("")
    context_notes.append("### Recommended Value Props to Emphasize:")
    for prop in framing['value_props'][:3]:
        context_notes.append(f"- {prop}")
    context_notes.append("")
    context_notes.append(f"### Pricing Guidance ({context['recommended_tier'].title()} tier recommended):")
    context_notes.append(f"- {framing['price_anchors'][context['recommended_tier']]}")
    context_notes.append("")
    context_notes.append(f"### Outcome Focus: {framing['outcome_focus']}")

    return {
        "invocation_command": "/proposal-generator",
        "client_name": context['client_info']['name'],
        "company": context['client_info']['company'],
        "proposal_type": context['proposal_type'],
        "transcript_content": transcript,
        "output_suggestion": output_suggestion,
        "context_notes": "\n".join(context_notes),
        "confidence_score": context['confidence_score'],
        "recommended_tier": context['recommended_tier']
    }


def generate_proposal_prompt(opportunity: Dict[str, Any]) -> str:
    """
    Generate a complete prompt for proposal creation.

    Returns text that can be directly used to invoke proposal-generator.

    Args:
        opportunity: Opportunity dict

    Returns:
        Complete prompt string for proposal generation
    """
    trigger = trigger_proposal_generation(opportunity)

    prompt = f"""Generate a {trigger['proposal_type']} proposal for {trigger['client_name']}.

**Client:** {trigger['client_name']}
**Company:** {trigger['company']}
**Recommended Pricing Tier:** {trigger['recommended_tier'].title()}

{trigger['context_notes']}

---

**Opportunity Summary (from {opportunity.get('source', 'communication')}):**

{trigger['transcript_content']}

---

**Output:** Save to `{trigger['output_suggestion']}`

Please generate a complete HTML proposal following the NGM style guide. Focus on:
1. Addressing the specific pain points identified
2. Using the recommended value propositions
3. Pricing at the {trigger['recommended_tier']} tier level
4. Including clear next steps
"""

    return prompt


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

PROPOSAL_BRIDGE_WORKFLOW = """
## Proposal Bridge Workflow

### CRITICAL: Command Center Protocol (Required)

Before generating ANY proposal, you MUST follow the Command Center protocol.
This prevents the recurring bug where proposals use default pricing instead
of negotiated terms (e.g., the Arda Lembet $499 vs $199 incident).

```python
from command_center import CommandCenter

cc = CommandCenter.initialize()

# Step 1: Verify context is complete (REQUIRES pricing extraction)
ready, failures = cc.verify_context_for_proposal("opp-001")

if not ready:
    instructions = cc.gather_missing_context_instructions("opp-001", failures)
    print(instructions)
    # MUST complete all steps before proceeding
    # Especially: search ALL transcripts for pricing terms

    # After gathering context:
    cc.record_transcript_search("opp-001", ["file-123"], pain_points=[...])
    cc.record_email_search("opp-001", ["thread-abc"])
    cc.record_unified_context("opp-001")
    cc.record_pricing_extraction("opp-001", {
        "rate": "$199/month",
        "discount": "discounted from $499",
        "commitment": "3 months"
    }, source="transcript")

# Step 2: Generate proposal (only after context verified)
context = prepare_proposal_context(opportunity)
prompt = generate_proposal_prompt(opportunity)

# Step 3: Log to ledger
cc.log_proposal_draft(
    opportunity_id="opp-001",
    contact_name="Dr. Smith",
    content=proposal_html,
    file_path="content/proposals/proposal-smith-2026-02-05.html",
    quality_result=gate_result.to_dict()
)

cc.finalize_session()
```

### PRICING EXTRACTION CHECKLIST (before every proposal)

1. Search ALL transcripts mentioning the contact name
2. Search ALL transcripts mentioning the company name
3. Look for: dollar amounts, rates, discounts, special terms
4. Check `.bizdev/drafts/email-*` for prior pricing context
5. Record findings via `cc.record_pricing_extraction()`
6. If no pricing found, use defaults but FLAG in proposal

### Legacy Flow (use Command Center instead)

```python
from proposal_bridge import prepare_proposal_context, generate_proposal_prompt

context = prepare_proposal_context(opportunity)
prompt = generate_proposal_prompt(opportunity)
```

## Output Integration

The proposal bridge outputs:
1. **transcript_content**: Formatted opportunity data as transcript
2. **context_notes**: Type-specific guidance for proposal
3. **output_suggestion**: Recommended filename
4. **prompt**: Complete prompt for skill invocation

All outputs are designed to integrate seamlessly with the existing
proposal-generator skill in document-studio.
"""
