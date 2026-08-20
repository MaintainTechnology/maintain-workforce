"""
Context Loader for BizDev Opportunity Intelligence

Loads relevant NGM context for opportunity processing:
1. NGM programs and pricing (from ngm-programs.md)
2. Voice and style guidelines (from document-studio)
3. Existing proposals for consistency
4. Email templates from edusales-writer

This provides the foundation for contextually-aware drafting.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime


# =============================================================================
# CONTEXT FILE PATHS
# =============================================================================

CONTEXT_PATHS = {
    "ngm_programs": ".claude/skills/document-studio/ngm-programs.md",
    "voice_style": ".claude/skills/document-studio/voice-and-style.md",
    "proposal_templates": ".claude/skills/proposal-generator/templates/components.md",
    "email_templates": ".claude/skills/edusales-writer/templates/email-templates.md",
    "linkedin_templates": ".claude/skills/edusales-writer/templates/linkedin-templates.md",
    "existing_proposals": "content/proposals/"
}


# =============================================================================
# NGM SERVICE CONTEXT (Embedded for quick access)
# =============================================================================

NGM_SERVICES_SUMMARY = """
## NGM Service Types and Pricing

### 1. Consulting ($2,500 - $75,000)
- Strategy Session: $2,500 - $5,000 (2-4 hours, specific problem solving)
- Monthly Advisory: $5,000 - $15,000/mo (ongoing guidance)
- Fractional CMO: $10,000 - $25,000/mo (deep involvement)
- Protocol Development: $15,000 - $50,000 (custom clinical protocols)
- Practice Transformation: $25,000 - $75,000 (full redesign)

### 2. Membership - Longevity Intelligence Platform (LIP)
- Essential: $299/mo (knowledge base, limited reports)
- Professional: $599/mo (full access, unlimited reports, advisor)
- Enterprise: Custom (API, white-label, team seats)

### 3. NGM Commons Partnership ($5,000 - $12,500/year)
- Partner: $5,000/year (full profile, lead capture)
- Sponsor: $12,500/year (category sponsorship, content collaboration)

## Key Value Propositions

### For Consulting:
- Built first national-scale longevity clinic (Modern Age)
- Helped scale Virta Health to $3B+ valuation
- Advises longevity companies worth $1B+ combined

### For Membership (LIP):
- 50,000+ peer-reviewed studies synthesized
- Lab report generation: 5 min vs 45 min manual
- 150+ educational modules
- 200,000+ monthly LinkedIn impressions reaching longevity clinicians

### For Commons:
- AI-native vendor profiles for discoverability
- 200,000+ monthly LinkedIn impressions reaching longevity practitioners
- Research-backed, not vendor-written content

## Dr. Anant Vinjamoori Bio (Short)
CMO at Modern Age (built first national longevity clinic), 
scaled Virta Health to $3B+, advises $1B+ in longevity companies.
Harvard Medical School graduate. Featured in WSJ, Forbes, Fortune.
"""


NGM_VOICE_SUMMARY = """
## NGM Voice & Tone Guidelines

### Core Principles:
1. **Expert but approachable** - Confidence without arrogance
2. **Value-first** - Lead with insight, not pitch
3. **Specific over vague** - Use numbers, examples, outcomes
4. **Conversational** - Write like you talk
5. **Helpful** - Frame everything as being in service to them

### Do:
- Use "I" and "you" freely
- Reference specific experiences and outcomes
- Ask questions that show you understand their world
- Be direct about what you can and can't do

### Don't:
- Use corporate jargon
- Make vague claims ("leading", "innovative", "best")
- Over-promise or hype
- Sound like marketing copy

### Power Phrases:
- "Based on my experience building..."
- "Most practitioners I work with..."
- "Here's what actually works..."
- "The pattern I've seen..."

### CTA Style:
- Low commitment first ("Would a quick call be useful?")
- Single ask per email
- Make it easy to say yes or no
"""


# =============================================================================
# CONTEXT LOADING FUNCTIONS
# =============================================================================

def load_ngm_context() -> Dict[str, str]:
    """
    Return embedded NGM context for quick access.
    
    For full context, use load_full_context() which reads from files.
    
    Returns:
        Dict with services and voice summaries
    """
    return {
        "services": NGM_SERVICES_SUMMARY,
        "voice": NGM_VOICE_SUMMARY
    }


def get_context_loading_workflow() -> Dict[str, Any]:
    """
    Generate workflow for loading full context from files.
    
    Returns:
        Workflow instructions for Claude to load context
    """
    return {
        "paths": CONTEXT_PATHS,
        "quick_context": load_ngm_context(),
        "workflow": f"""
## Context Loading Workflow

### Quick Context (Embedded)
The following context is available immediately:

**Services Summary:**
{NGM_SERVICES_SUMMARY[:500]}...

**Voice Summary:**
{NGM_VOICE_SUMMARY[:500]}...

### Full Context Loading

For complete context, read these files:

1. **NGM Programs (Full Details)**
   ```
   Read: {CONTEXT_PATHS["ngm_programs"]}
   ```

2. **Voice & Style Guide**
   ```
   Read: {CONTEXT_PATHS["voice_style"]}
   ```

3. **Recent Proposals (for consistency)**
   ```
   Glob: {CONTEXT_PATHS["existing_proposals"]}*.html
   Read: [most recent 2-3 proposals]
   ```

4. **Email Templates (optional)**
   ```
   Read: {CONTEXT_PATHS["email_templates"]}
   ```

### When to Load Full Context

- **Always load quick context** (embedded above)
- **Load full NGM programs** when drafting proposals
- **Load recent proposals** for tone/style matching
- **Load email templates** for outreach patterns
"""
    }


def get_pricing_context(opportunity_type: str, tier: str = "mid") -> Dict[str, Any]:
    """
    Get pricing context for a specific opportunity type and tier.
    
    Args:
        opportunity_type: consulting, membership, or commons_partnership
        tier: low, mid, or high
        
    Returns:
        Pricing details dict
    """
    pricing = {
        "consulting": {
            "low": {
                "name": "Strategy Session",
                "price": "$2,500 - $5,000",
                "description": "2-4 hour focused session on specific problem solving",
                "deliverables": ["Session recording", "Action plan document"]
            },
            "mid": {
                "name": "Monthly Advisory Retainer",
                "price": "$5,000 - $15,000/mo",
                "description": "Ongoing strategic guidance with regular check-ins",
                "deliverables": ["Weekly calls", "Async support", "Quarterly reviews"]
            },
            "high": {
                "name": "Practice Transformation",
                "price": "$25,000 - $75,000",
                "description": "Full practice redesign with implementation support",
                "deliverables": ["Custom protocols", "SOPs", "Training", "90-day support"]
            }
        },
        "membership": {
            "low": {
                "name": "Essential Membership",
                "price": "$299/mo",
                "description": "Knowledge base access with limited lab reports",
                "deliverables": ["Knowledge base", "5 lab reports/mo", "Community access"]
            },
            "mid": {
                "name": "Professional Membership",
                "price": "$599/mo",
                "description": "Full platform access with unlimited capabilities",
                "deliverables": ["Full knowledge base", "Unlimited reports", "Business advisor", "Live sessions"]
            },
            "high": {
                "name": "Annual Professional",
                "price": "$599/mo (annual)",
                "description": "Professional tier with annual commitment discount",
                "deliverables": ["Everything in Professional", "Priority support", "Annual strategy session"]
            }
        },
        "commons_partnership": {
            "low": {
                "name": "Partner Tier",
                "price": "$5,000/year",
                "description": "Full vendor profile with lead capture",
                "deliverables": ["Research-backed profile", "Lead capture", "Analytics", "Category inclusion"]
            },
            "mid": {
                "name": "Sponsor Tier",
                "price": "$12,500/year",
                "description": "Category sponsorship with content collaboration",
                "deliverables": ["Everything in Partner", "Category sponsorship", "Content collaboration", "Executive access"]
            },
            "high": {
                "name": "Premium Sponsor",
                "price": "Custom",
                "description": "Custom partnership with exclusive benefits",
                "deliverables": ["Custom terms", "Exclusive category", "Co-marketing", "Event access"]
            }
        }
    }
    
    return pricing.get(opportunity_type, pricing["consulting"]).get(tier, pricing["consulting"]["mid"])


def get_value_props(opportunity_type: str) -> List[str]:
    """
    Get value propositions for a specific opportunity type.
    
    Args:
        opportunity_type: consulting, membership, or commons_partnership
        
    Returns:
        List of value proposition strings
    """
    value_props = {
        "consulting": [
            "Built the first national-scale longevity clinic in the US (Modern Age)",
            "Helped scale Virta Health from startup to $3B+ valuation",
            "Advises longevity companies valued at over $1B combined",
            "Protocols refined through thousands of patient interactions",
            "Featured in Wall Street Journal, Forbes, Fortune"
        ],
        "membership": [
            "50,000+ peer-reviewed studies synthesized into actionable knowledge",
            "AI Lab Report Generator: 5 minutes vs 45 minutes manually",
            "150+ deep-dive educational modules with monthly live lectures",
            "200,000+ monthly LinkedIn impressions reaching longevity clinicians, plus an engaged private practitioner community",
            "Built by a physician who built and scaled actual clinics"
        ],
        "commons_partnership": [
            "200,000+ monthly LinkedIn impressions reaching longevity medicine practitioners",
            "AI-native profiles: discoverable when clinicians ask ChatGPT/Claude",
            "Research-backed content, not vendor-written marketing",
            "Lead capture and facilitated introductions",
            "Quarterly partner analytics and insights"
        ]
    }
    
    return value_props.get(opportunity_type, value_props["consulting"])


def get_outcome_examples(opportunity_type: str) -> List[str]:
    """
    Get outcome examples for social proof.
    
    Args:
        opportunity_type: consulting, membership, or commons_partnership
        
    Returns:
        List of outcome example strings
    """
    outcomes = {
        "consulting": [
            "Physician went from $200/visit to $1,500 6-month programs",
            "Clinician reduced patient load from 25+ to 12/week while increasing revenue",
            "Practice added longevity service line generating $50K+ additional monthly",
            "Clinic launched successfully in 90 days with full protocols"
        ],
        "membership": [
            "Lab report time reduced from 45 minutes to 5 minutes per patient",
            "Practitioner launched longevity program within 30 days of joining",
            "Member saved 10+ hours per week on research and report generation",
            "Clinic revenue increased 40% after implementing platform protocols"
        ],
        "commons_partnership": [
            "Partner received 25+ qualified leads in first quarter",
            "Vendor saw 3x increase in practitioner inquiries after profile launch",
            "Sponsor's content collaboration reached 1,000+ practitioners",
            "Partner's demo requests increased 200% from AI-driven discovery"
        ]
    }
    
    return outcomes.get(opportunity_type, outcomes["consulting"])


# =============================================================================
# CONTEXT FOR SPECIFIC USE CASES
# =============================================================================

def get_email_drafting_context(opportunity_type: str) -> Dict[str, Any]:
    """
    Get all context needed for email drafting.
    
    Args:
        opportunity_type: The type of opportunity
        
    Returns:
        Complete context dict for email generation
    """
    return {
        "services": NGM_SERVICES_SUMMARY,
        "voice": NGM_VOICE_SUMMARY,
        "value_props": get_value_props(opportunity_type),
        "outcomes": get_outcome_examples(opportunity_type),
        "pricing": {
            "low": get_pricing_context(opportunity_type, "low"),
            "mid": get_pricing_context(opportunity_type, "mid"),
            "high": get_pricing_context(opportunity_type, "high")
        }
    }


def get_proposal_drafting_context(
    opportunity_type: str,
    recommended_tier: str
) -> Dict[str, Any]:
    """
    Get all context needed for proposal drafting.
    
    Args:
        opportunity_type: The type of opportunity
        recommended_tier: The recommended pricing tier
        
    Returns:
        Complete context dict for proposal generation
    """
    return {
        "services": NGM_SERVICES_SUMMARY,
        "voice": NGM_VOICE_SUMMARY,
        "value_props": get_value_props(opportunity_type),
        "outcomes": get_outcome_examples(opportunity_type),
        "recommended_pricing": get_pricing_context(opportunity_type, recommended_tier),
        "all_pricing_tiers": {
            "low": get_pricing_context(opportunity_type, "low"),
            "mid": get_pricing_context(opportunity_type, "mid"),
            "high": get_pricing_context(opportunity_type, "high")
        },
        "file_paths": {
            "full_programs": CONTEXT_PATHS["ngm_programs"],
            "proposal_templates": CONTEXT_PATHS["proposal_templates"],
            "existing_proposals": CONTEXT_PATHS["existing_proposals"]
        }
    }


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

CONTEXT_LOADER_WORKFLOW = """
## Context Loader Usage

### Quick Access (No File I/O)

```python
from context_loader import load_ngm_context, get_pricing_context, get_value_props

# Get embedded context
context = load_ngm_context()
print(context["services"])
print(context["voice"])

# Get pricing for specific tier
pricing = get_pricing_context("consulting", "mid")
print(f"Recommended: {pricing['name']} at {pricing['price']}")

# Get value props
props = get_value_props("membership")
for prop in props:
    print(f"- {prop}")
```

### For Email Drafting

```python
from context_loader import get_email_drafting_context

context = get_email_drafting_context("consulting")

# Use in email generation prompt
prompt = f'''
Value Props to reference:
{chr(10).join(f"- {v}" for v in context["value_props"])}

Voice guidelines:
{context["voice"]}
'''
```

### For Proposal Drafting

```python
from context_loader import get_proposal_drafting_context

context = get_proposal_drafting_context("consulting", "mid")

# Includes recommended pricing and full tier options
print(context["recommended_pricing"])

# For full context, read the files:
# Read(context["file_paths"]["full_programs"])
```

### Loading Full Context from Files

Use the workflow from `get_context_loading_workflow()` to have Claude
read the full context files when needed.
"""
