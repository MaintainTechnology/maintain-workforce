"""
Email Drafter for BizDev Opportunity Intelligence

Generates contextually appropriate emails based on opportunity data.
Integrates patterns from edusales-writer skill for value-first content.

Email Types:
1. Cold intro - New contact, no prior relationship
2. Warm follow-up - After meeting/conversation
3. Re-engagement - Stale opportunity revival

Updated: 2026-01-18 - Integrated new value proposition and pricing architecture
"""

from typing import Dict, Any, List, Optional
from datetime import datetime


# =============================================================================
# EMAIL TYPE DEFINITIONS
# =============================================================================

class EmailType:
    COLD_INTRO = "cold"
    WARM_FOLLOWUP = "warm"
    REENGAGEMENT = "reengagement"


# =============================================================================
# VALUE PROPOSITION SNIPPETS FOR EMAILS (2026-01-18)
# =============================================================================
# Use these across email types to weave in key differentiators
# 
# EXPERTISE:
#   "After building Modern Age into the first national-scale longevity clinic
#    and advising companies like MidiHealth and Superpower, I've seen what works."
#
# TECHNOLOGY:
#   "My platform is built on years of curated research—intentionally constrained
#    to deliver insights generic AI can't replicate."
#
# INTEGRATION:
#   "I bring a rare combination of clinical, technical, and business expertise
#    that eliminates the need for multiple consultants."
#
# OUTCOME FOCUS:
#   "The goal is to accelerate your timeline and de-risk your decisions
#    by applying lessons from building at scale."
#
# =============================================================================

VALUE_SNIPPETS = {
    "expertise_short": (
        "After building Modern Age into the first national-scale longevity clinic "
        "and advising companies like MidiHealth and Superpower, I've seen what works."
    ),
    "expertise_condensed": (
        "Having built $100M+ healthcare companies and advised industry leaders, "
        "I can help you avoid the mistakes I've seen others make."
    ),
    "technology_short": (
        "My platform is built on years of curated research—intentionally constrained "
        "to deliver insights generic AI can't replicate."
    ),
    "technology_condensed": (
        "The knowledge base powering my recommendations is curated, not comprehensive—"
        "that's what makes the insights actionable."
    ),
    "integration_short": (
        "I bring a rare combination of clinical, technical, and business expertise "
        "that eliminates the need for multiple consultants."
    ),
    "integration_condensed": (
        "Most companies hire separate medical, tech, and strategy advisors. "
        "I cover all three—which compresses timelines and reduces coordination overhead."
    ),
    "outcome_focus": (
        "The goal is to accelerate your timeline and de-risk your decisions "
        "by applying lessons from building at scale."
    ),
}


# =============================================================================
# EMAIL TEMPLATES BY OPPORTUNITY TYPE
# =============================================================================

EMAIL_FRAMEWORKS = {
    "consulting": {
        "cold": {
            "subject_templates": [
                "Quick thought on {pain_point_short}",
                "Saw your work in {specialty}",
                "{mutual_connection} suggested I reach out",
                "One insight from building $100M+ healthcare companies"
            ],
            "opening_hooks": [
                "After building Modern Age into the first national-scale longevity clinic, I've noticed a pattern with {pain_point}.",
                "Most longevity companies I advise—including MidiHealth and Superpower—struggled with {pain_point} early on.",
                "Saw {recent_activity}—reminded me of a challenge I solved when scaling Modern Age."
            ],
            "value_bridge": "I bring a rare combination of clinical, technical, and business expertise that compresses timelines. {outcome_specific}",
            "soft_cta": "Would a 15-minute call to see if this applies to you be useful?"
        },
        "warm": {
            "subject_templates": [
                "Following up on {meeting_topic}",
                "That {topic} we discussed",
                "Next step on {project_name}"
            ],
            "opening_hooks": [
                "Great connecting {timeframe_ago}. Your point about {their_insight} stuck with me.",
                "I've been thinking about what you said about {pain_point}.",
                "Following up on our {meeting_type}—I put together some thoughts."
            ],
            "value_bridge": "Based on what you shared, here's what I'd prioritize: {recommendation}. Having seen this pattern across the companies I advise, I can help accelerate your timeline.",
            "soft_cta": "Want to schedule a deeper dive this week?"
        },
        "reengagement": {
            "subject_templates": [
                "Thought of you when...",
                "Update that might help with {pain_point}",
                "Still tackling {challenge}?"
            ],
            "opening_hooks": [
                "It's been a while since we connected about {original_topic}.",
                "Something came up that reminded me of your {pain_point}.",
                "I just published a piece on {topic}—thought it might be relevant."
            ],
            "value_bridge": "Since we last spoke, I've helped {similar_client} achieve {outcome}.",
            "soft_cta": "Is this still on your radar? Happy to share what's working now."
        }
    },
    "membership": {
        "cold": {
            "subject_templates": [
                "The lab report problem",
                "How {peer_name} cut report time by 90%",
                "50,000 studies, one platform"
            ],
            "opening_hooks": [
                "How much time did you spend on lab reports last week?",
                "Most longevity docs I know are buried in research. Sound familiar?",
                "Quick question: do you ever wish you could just *ask* someone about the latest {topic} research?"
            ],
            "value_bridge": "That's why I built the Longevity Intelligence Platform—200,000+ monthly LinkedIn impressions reaching longevity clinicians, with an engaged practitioner community using it to {outcome}.",
            "soft_cta": "Want to see how it works? I can do a quick walkthrough."
        },
        "warm": {
            "subject_templates": [
                "The platform we discussed",
                "Access to the knowledge base",
                "Getting you set up"
            ],
            "opening_hooks": [
                "Great conversation about {topic}. As promised, here's more on the platform.",
                "You mentioned {pain_point}—the report generator specifically addresses that.",
                "Following up with the details on LIP membership."
            ],
            "value_bridge": "Most members tell me the lab report generator alone pays for itself in the first month.",
            "soft_cta": "Ready to try it? I can get you started this week."
        },
        "reengagement": {
            "subject_templates": [
                "New features you might like",
                "The platform has grown since we talked",
                "Still drowning in research?"
            ],
            "opening_hooks": [
                "A lot has changed with the platform since we last talked.",
                "We just added {new_feature}—thought of your situation.",
                "Still spending hours on {pain_point}?"
            ],
            "value_bridge": "Our newest members are saving {time_saved} per week.",
            "soft_cta": "Worth a fresh look? I can show you what's new."
        }
    },
    "commons_partnership": {
        "cold": {
            "subject_templates": [
                "Reaching longevity clinicians",
                "Your profile on NGM Commons",
                "AI-native vendor discovery"
            ],
            "opening_hooks": [
                "When clinicians ask ChatGPT about {their_product_category}, do they find you?",
                "NGM Commons is profiling every vendor in the longevity space. Question is whether you control your presence.",
                "Your competitors are reaching 200,000+ monthly LinkedIn impressions among longevity clinicians. Here's how."
            ],
            "value_bridge": "Our platform puts research-backed vendor profiles in front of clinicians actively looking for solutions.",
            "soft_cta": "Should we discuss how your profile would look?"
        },
        "warm": {
            "subject_templates": [
                "Your NGM Commons listing",
                "Partnership details",
                "Getting your profile live"
            ],
            "opening_hooks": [
                "Great chat about reaching the longevity practitioner market.",
                "Following up on the Commons partnership opportunity.",
                "As discussed, here's how we'd position {company_name}."
            ],
            "value_bridge": "Partners typically see their first leads within {timeframe} of going live.",
            "soft_cta": "Ready to move forward? I can start the profile this week."
        },
        "reengagement": {
            "subject_templates": [
                "Still interested in longevity practitioners?",
                "Commons update: {new_feature}",
                "Your competitors just joined"
            ],
            "opening_hooks": [
                "We've onboarded {competitor_count} vendors in your category since we talked.",
                "The Commons has grown to {current_size}—your category is getting attention.",
                "Clinicians are searching for {their_category}. Your profile could be there."
            ],
            "value_bridge": "Recent partners have seen {metric} within their first quarter.",
            "soft_cta": "Worth revisiting? Happy to share what's working for others in your space."
        }
    }
}


# =============================================================================
# EMAIL GENERATION
# =============================================================================

def determine_email_type(
    opportunity: Dict[str, Any],
    prior_emails: List[Dict[str, Any]],
    last_activity_days: int
) -> str:
    """
    Determine the appropriate email type based on context.
    
    Args:
        opportunity: Opportunity data
        prior_emails: List of prior email exchanges
        last_activity_days: Days since last activity
        
    Returns:
        Email type: "cold", "warm", or "reengagement"
    """
    # If no prior emails, it's cold
    if not prior_emails:
        return EmailType.COLD_INTRO
    
    # If recent activity (within 14 days), it's warm
    if last_activity_days <= 14:
        return EmailType.WARM_FOLLOWUP
    
    # If stale (over 30 days), it's reengagement
    if last_activity_days > 30:
        return EmailType.REENGAGEMENT
    
    # Default to warm for 15-30 days
    return EmailType.WARM_FOLLOWUP


def generate_email_prompt(
    opportunity: Dict[str, Any],
    email_type: str,
    prior_context: Optional[str] = None,
    pain_points: Optional[List[str]] = None,
    conversation_excerpts: Optional[List[str]] = None
) -> str:
    """
    Generate the prompt for email drafting.
    
    This returns instructions for Claude to generate the email,
    following the edusales-writer patterns.
    
    Args:
        opportunity: Opportunity data
        email_type: Type of email to generate
        prior_context: Context from prior emails
        pain_points: Identified pain points
        conversation_excerpts: Key quotes from transcript/email
        
    Returns:
        Prompt string for email generation
    """
    contact = opportunity.get("contact", {})
    opp_type = opportunity.get("opportunity_type", "consulting")
    
    framework = EMAIL_FRAMEWORKS.get(opp_type, EMAIL_FRAMEWORKS["consulting"])
    email_framework = framework.get(email_type, framework["cold"])
    
    prompt = f"""Generate a {email_type} outreach email for a {opp_type} opportunity.

## Contact Information
- Name: {contact.get("name", "Unknown")}
- Company: {contact.get("company", "their practice")}
- Title: {contact.get("title", "N/A")}
- Email: {contact.get("email", "N/A")}

## Opportunity Type: {opp_type.replace("_", " ").title()}

## Pain Points Identified
{chr(10).join(f"- {p}" for p in (pain_points or ["General interest in services"]))}

## Key Conversation Excerpts
{chr(10).join(f'- "{e}"' for e in (conversation_excerpts or ["No specific excerpts"]))}

## Prior Context
{prior_context or "No prior email history"}

## Email Framework to Follow

**Subject Line Options:**
{chr(10).join(f"- {s}" for s in email_framework["subject_templates"])}

**Opening Hook Patterns:**
{chr(10).join(f"- {h}" for h in email_framework["opening_hooks"])}

**Value Bridge:**
{email_framework["value_bridge"]}

**Soft CTA:**
{email_framework["soft_cta"]}

## Requirements

1. **Word limit:** {"150-200 words" if email_type == "cold" else "200-280 words"}
2. **Tone:** Helpful expert, not salesy
3. **Structure:**
   - Subject line (under 60 chars)
   - Personal opening (reference specific context)
   - Value statement (what's in it for them)
   - Single, clear CTA

4. **MUST include:**
   - Their name in opening
   - Reference to at least one pain point
   - Specific value prop relevant to their situation

5. **MUST NOT include:**
   - "Hope this finds you well"
   - "Just checking in"
   - "Touching base"
   - Multiple CTAs
   - Feature lists
   - Pricing in cold emails

## Output Format

```
Subject: [Your subject line]

[Email body]

[Sign-off]
Anant
```
"""
    return prompt


def generate_email_refinement_prompt(
    original_email: str,
    quality_result: Dict[str, Any],
    attempt_number: int
) -> str:
    """
    Generate a refinement prompt based on quality gate feedback.
    
    Args:
        original_email: The email that failed quality gate
        quality_result: Quality gate result with failures and suggestions
        attempt_number: Which refinement attempt this is
        
    Returns:
        Prompt for email refinement
    """
    failed_checks = quality_result.get("failedChecks", [])
    suggestions = quality_result.get("suggestions", [])
    
    prompt = f"""Refine this email based on quality feedback (Attempt {attempt_number}/3).

## Original Email
```
{original_email}
```

## Quality Gate Failures
{chr(10).join(f"- {f}" for f in failed_checks)}

## Suggestions for Improvement
{chr(10).join(f"- {s}" for s in suggestions)}

## Requirements

1. Fix ALL the issues listed above
2. Maintain the core message and value prop
3. Keep the personal touches and context references
4. Ensure word count stays within limits

## Output

Provide the refined email in the same format:

```
Subject: [Updated subject if needed]

[Refined email body]

[Sign-off]
```
"""
    return prompt


# =============================================================================
# EMAIL CONTEXT EXTRACTION
# =============================================================================

def extract_email_context(
    opportunity: Dict[str, Any],
    prior_emails: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Extract relevant context for email drafting.
    
    Args:
        opportunity: Opportunity data
        prior_emails: Prior email exchanges
        
    Returns:
        Context dict with pain points, excerpts, and prior summary
    """
    signals = opportunity.get("signals", [])
    
    # Extract pain points
    pain_points = [
        s.get("content", "")
        for s in signals
        if s.get("type") == "PAIN_POINT"
    ]
    
    # Extract explicit interest quotes
    interest_quotes = [
        s.get("content", "")
        for s in signals
        if s.get("type") in ["EXPLICIT_INTEREST", "FOLLOW_UP_REQUEST"]
    ]
    
    # Summarize prior emails
    prior_context = ""
    if prior_emails:
        subjects = [e.get("subject", "") for e in prior_emails[:3]]
        prior_context = f"Prior threads: {', '.join(subjects)}"
        
        # Get the most recent email content summary
        if prior_emails[0].get("content"):
            last_email = prior_emails[0]["content"][:500]
            prior_context += f"\n\nMost recent exchange:\n{last_email}..."
    
    return {
        "pain_points": pain_points,
        "interest_quotes": interest_quotes,
        "prior_context": prior_context,
        "conversation_excerpts": pain_points + interest_quotes
    }


# =============================================================================
# EMAIL DRAFT WORKFLOW
# =============================================================================

def draft_email_workflow(
    opportunity: Dict[str, Any],
    prior_emails: Optional[List[Dict[str, Any]]] = None,
    last_activity_days: int = 0
) -> Dict[str, Any]:
    """
    Complete workflow for drafting an email.
    
    Returns instructions for the iterative drafting process.
    
    Args:
        opportunity: Opportunity data
        prior_emails: Prior email exchanges
        last_activity_days: Days since last activity
        
    Returns:
        Workflow instructions dict
    """
    prior_emails = prior_emails or []
    
    # Determine email type
    email_type = determine_email_type(opportunity, prior_emails, last_activity_days)
    
    # Extract context
    context = extract_email_context(opportunity, prior_emails)
    
    # Generate initial prompt
    initial_prompt = generate_email_prompt(
        opportunity=opportunity,
        email_type=email_type,
        prior_context=context["prior_context"],
        pain_points=context["pain_points"],
        conversation_excerpts=context["conversation_excerpts"]
    )
    
    contact = opportunity.get("contact", {})
    opp_id = opportunity.get("id", "unknown")
    
    return {
        "email_type": email_type,
        "contact_name": contact.get("name", "Unknown"),
        "company": contact.get("company", ""),
        "initial_prompt": initial_prompt,
        "context": context,
        "output_path": f".bizdev/drafts/emails/{opp_id}-{email_type}-{datetime.now().strftime('%Y%m%d')}.md",
        "workflow": f"""
## Email Drafting Workflow

### Step 1: Generate Initial Draft

Use the prompt below to generate the email:

```
{initial_prompt[:500]}...
```

### Step 2: Run Quality Gate

```python
from quality_gates import evaluate_email_quality

result = evaluate_email_quality(
    email_content=draft,
    email_type="{email_type}",
    opportunity=opportunity,
    pain_points={context["pain_points"]}
)
```

### Step 3: Iterate if Needed

If quality gate fails:
1. Generate refinement prompt with failures
2. Regenerate email
3. Re-run quality gate
4. Max 3 iterations

### Step 4: Save Draft

Save to: `.bizdev/drafts/emails/{opp_id}-{email_type}.md`

Include:
- Email content
- Quality gate score
- Suggestions for manual review
"""
    }


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

EMAIL_DRAFTER_WORKFLOW = """
## Email Drafter Usage

### IMPORTANT: Command Center Protocol (Required)

Before generating ANY email draft, you MUST follow the Command Center protocol
to prevent context loss and degradation:

```python
from command_center import CommandCenter

cc = CommandCenter.initialize()

# Step 1: Verify context is complete
ready, failures = cc.verify_context_for_email("opp-001")

if not ready:
    # Get instructions for gathering missing context
    instructions = cc.gather_missing_context_instructions("opp-001", failures)
    print(instructions)
    # Follow instructions, then record what was found:
    cc.record_transcript_search("opp-001", source_ids=[...], pain_points=[...])
    cc.record_email_search("opp-001", thread_ids=[...])
    cc.record_unified_context("opp-001")

# Step 2: Generate draft (only after context is verified)
workflow = draft_email_workflow(
    opportunity=opportunity_data,
    prior_emails=email_history,
    last_activity_days=15
)

# Step 3: After generation + quality gate, log to ledger
cc.log_email_draft(
    opportunity_id="opp-001",
    contact_name="Dr. Smith",
    content=email_content,
    file_path=workflow["output_path"],
    quality_result=gate_result.to_dict()
)

# Step 4: Finalize session
cc.finalize_session()
```

### Basic Flow (Legacy - use Command Center instead)

```python
from email_drafter import draft_email_workflow

# Get workflow instructions
workflow = draft_email_workflow(
    opportunity=opportunity_data,
    prior_emails=email_history,
    last_activity_days=15
)

print(f"Email type: {workflow['email_type']}")
print(f"Output path: {workflow['output_path']}")
```

### Integration with Quality Gates

```python
from email_drafter import generate_email_prompt, generate_email_refinement_prompt
from quality_gates import evaluate_email_quality, evaluate_context_completeness

# FIRST: Check context completeness
ctx_result = evaluate_context_completeness(context_state, "email")
if not ctx_result.passed:
    print("BLOCKED: Context incomplete")
    for suggestion in ctx_result.suggestions:
        print(f"  → {suggestion}")
    # DO NOT proceed with drafting

# Generate initial draft
prompt = generate_email_prompt(opportunity, email_type, ...)
email_draft = generate_with_claude(prompt)

# Evaluate
result = evaluate_email_quality(
    email_content=email_draft,
    email_type=email_type,
    opportunity=opportunity,
    pain_points=pain_points
)

# Iterate if needed
if not result.passed:
    refinement_prompt = generate_email_refinement_prompt(
        original_email=email_draft,
        quality_result=result.to_dict(),
        attempt_number=1
    )
    email_draft = generate_with_claude(refinement_prompt)
```

### Email Type Selection

The system automatically selects email type:
- **Cold**: No prior emails, first contact
- **Warm**: Recent conversation (within 14 days)
- **Re-engagement**: Stale contact (over 30 days)
"""
