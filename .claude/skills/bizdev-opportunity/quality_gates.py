"""
Quality Gates for BizDev Opportunity Intelligence

Defines evaluation criteria for:
1. Opportunity analysis quality
2. Email draft quality
3. Proposal quality

Each gate returns pass/fail with detailed reasoning for iterative improvement.
"""

from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
import re


# =============================================================================
# QUALITY GATE DEFINITIONS
# =============================================================================

@dataclass
class QualityGateResult:
    """Result of a quality gate evaluation."""
    passed: bool
    gate_name: str
    score: float  # 0.0 to 1.0
    passed_checks: List[str]
    failed_checks: List[str]
    suggestions: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "gateName": self.gate_name,
            "score": self.score,
            "passedChecks": self.passed_checks,
            "failedChecks": self.failed_checks,
            "suggestions": self.suggestions
        }


# =============================================================================
# OPPORTUNITY ANALYSIS GATE
# =============================================================================

OPPORTUNITY_GATE_CONFIG = {
    "min_signal_confidence": 0.6,
    "required_contact_fields": ["name"],
    "min_signals": 1,
    "max_contradictions": 0,
    "min_classification_confidence": 0.5
}


def evaluate_opportunity_quality(
    opportunity: Dict[str, Any],
    signals: List[Dict[str, Any]],
    classification_confidence: float = 0.5
) -> QualityGateResult:
    """
    Evaluate the quality of an opportunity analysis.
    
    Args:
        opportunity: Opportunity data dict
        signals: List of detected signals
        classification_confidence: Confidence in opportunity type classification
        
    Returns:
        QualityGateResult with pass/fail and details
    """
    config = OPPORTUNITY_GATE_CONFIG
    passed_checks = []
    failed_checks = []
    suggestions = []
    
    # Check 1: Minimum signals
    if len(signals) >= config["min_signals"]:
        passed_checks.append(f"Has {len(signals)} signal(s) (min: {config['min_signals']})")
    else:
        failed_checks.append(f"Only {len(signals)} signal(s) found (min: {config['min_signals']})")
        suggestions.append("Look for additional signals like pain points, timeline mentions, or budget discussions")
    
    # Check 2: Signal confidence
    high_confidence_signals = [
        s for s in signals 
        if s.get("confidence", 0) >= config["min_signal_confidence"]
    ]
    if high_confidence_signals:
        passed_checks.append(f"{len(high_confidence_signals)} signal(s) with confidence >= {config['min_signal_confidence']}")
    else:
        failed_checks.append(f"No signals with confidence >= {config['min_signal_confidence']}")
        suggestions.append("Re-analyze transcript for clearer interest signals")
    
    # Check 3: Contact completeness
    contact = opportunity.get("contact", {})
    has_name = bool(contact.get("name"))
    has_email_or_company = bool(contact.get("email") or contact.get("company"))
    
    if has_name:
        passed_checks.append("Contact name identified")
    else:
        failed_checks.append("Contact name missing")
        suggestions.append("Extract contact name from transcript")
    
    if has_email_or_company:
        passed_checks.append("Contact email or company identified")
    else:
        failed_checks.append("Neither email nor company identified")
        suggestions.append("Look for company name or email address in conversation")
    
    # Check 4: Classification confidence
    if classification_confidence >= config["min_classification_confidence"]:
        passed_checks.append(f"Classification confidence: {classification_confidence:.2f}")
    else:
        failed_checks.append(f"Low classification confidence: {classification_confidence:.2f}")
        suggestions.append("Review signals to better determine opportunity type")
    
    # Check 5: No contradictions
    signal_types = [s.get("type") for s in signals]
    # Example contradiction: both explicit interest and explicit disinterest
    # This is a simplified check - real implementation would be more nuanced
    contradictions = 0
    if contradictions <= config["max_contradictions"]:
        passed_checks.append("No contradictory signals")
    else:
        failed_checks.append(f"{contradictions} contradictory signal(s)")
        suggestions.append("Resolve conflicting signals before proceeding")
    
    # Calculate overall score
    total_checks = len(passed_checks) + len(failed_checks)
    score = len(passed_checks) / total_checks if total_checks > 0 else 0
    
    # Determine pass/fail (need at least 60% of checks to pass)
    passed = score >= 0.6 and len(failed_checks) <= 2
    
    return QualityGateResult(
        passed=passed,
        gate_name="opportunity_analysis",
        score=score,
        passed_checks=passed_checks,
        failed_checks=failed_checks,
        suggestions=suggestions
    )


# =============================================================================
# EMAIL DRAFT GATE
# =============================================================================

EMAIL_GATE_CONFIG = {
    "max_words_cold": 200,
    "max_words_warm": 300,
    "max_words_reengagement": 250,
    "required_elements": ["value_hook", "relevance", "single_cta"],
    "forbidden_openers": [
        "just checking in",
        "hope this finds you",
        "hope you're doing well",
        "wanted to follow up",
        "touching base",
        "circling back",
        "per my last email"
    ],
    "forbidden_patterns": [
        r"(?i)buy now",
        r"(?i)limited time",
        r"(?i)act fast",
        r"(?i)don't miss out",
        r"(?i)amazing opportunity"
    ],
    "min_personalization_score": 0.5
}


def evaluate_email_quality(
    email_content: str,
    email_type: str,  # "cold", "warm", "reengagement"
    opportunity: Dict[str, Any],
    pain_points: List[str]
) -> QualityGateResult:
    """
    Evaluate the quality of a drafted email.
    
    Args:
        email_content: The email text (subject + body)
        email_type: Type of email (cold, warm, reengagement)
        opportunity: Source opportunity data
        pain_points: Pain points from the opportunity
        
    Returns:
        QualityGateResult with pass/fail and details
    """
    config = EMAIL_GATE_CONFIG
    passed_checks = []
    failed_checks = []
    suggestions = []
    
    # Parse email parts
    lines = email_content.strip().split('\n')
    subject_line = ""
    body = email_content
    
    for i, line in enumerate(lines):
        if line.lower().startswith("subject:"):
            subject_line = line[8:].strip()
            body = '\n'.join(lines[i+1:]).strip()
            break
    
    # Check 1: Word count
    word_count = len(body.split())
    max_words = {
        "cold": config["max_words_cold"],
        "warm": config["max_words_warm"],
        "reengagement": config["max_words_reengagement"]
    }.get(email_type, 250)
    
    if word_count <= max_words:
        passed_checks.append(f"Word count: {word_count} (max: {max_words})")
    else:
        failed_checks.append(f"Too long: {word_count} words (max: {max_words})")
        suggestions.append(f"Cut {word_count - max_words} words. Focus on one key point.")
    
    # Check 2: No forbidden openers
    first_paragraph = body.split('\n\n')[0].lower() if body else ""
    found_forbidden = [
        opener for opener in config["forbidden_openers"]
        if opener in first_paragraph
    ]
    
    if not found_forbidden:
        passed_checks.append("Opens with value, not cliche")
    else:
        failed_checks.append(f"Forbidden opener: '{found_forbidden[0]}'")
        suggestions.append("Start with a specific insight, question, or value statement")
    
    # Check 3: No salesy patterns
    found_patterns = []
    for pattern in config["forbidden_patterns"]:
        if re.search(pattern, body):
            found_patterns.append(pattern)
    
    if not found_patterns:
        passed_checks.append("No salesy language patterns")
    else:
        failed_checks.append(f"Found {len(found_patterns)} salesy pattern(s)")
        suggestions.append("Remove pushy language. Focus on helping, not selling.")
    
    # Check 4: Has clear CTA
    cta_patterns = [
        r"(?i)would you be open to",
        r"(?i)can we schedule",
        r"(?i)let me know if",
        r"(?i)reply to this",
        r"(?i)click here",
        r"(?i)book a",
        r"(?i)sign up",
        r"(?i)join us",
        r"(?i)\?$"  # Ends with question
    ]
    has_cta = any(re.search(p, body) for p in cta_patterns)
    
    if has_cta:
        passed_checks.append("Has clear call-to-action")
    else:
        failed_checks.append("No clear call-to-action found")
        suggestions.append("End with a specific, low-commitment ask")
    
    # Check 5: References pain points (personalization)
    contact_name = opportunity.get("contact", {}).get("name", "")
    company = opportunity.get("contact", {}).get("company", "")
    
    personalization_score = 0.0
    if contact_name and contact_name.split()[0].lower() in body.lower():
        personalization_score += 0.3
    if company and company.lower() in body.lower():
        personalization_score += 0.3
    
    # Check for pain point references
    pain_references = 0
    for pain in pain_points:
        # Check if key words from pain point appear in email
        pain_words = set(pain.lower().split())
        body_words = set(body.lower().split())
        if len(pain_words & body_words) >= 2:
            pain_references += 1
    
    if pain_references > 0:
        personalization_score += min(0.4, pain_references * 0.2)
    
    if personalization_score >= config["min_personalization_score"]:
        passed_checks.append(f"Good personalization (score: {personalization_score:.2f})")
    else:
        failed_checks.append(f"Low personalization (score: {personalization_score:.2f})")
        suggestions.append("Reference specific pain points or context from the conversation")
    
    # Check 6: Subject line quality (if present)
    if subject_line:
        if len(subject_line) <= 60:
            passed_checks.append(f"Subject line length OK ({len(subject_line)} chars)")
        else:
            failed_checks.append(f"Subject line too long ({len(subject_line)} chars)")
            suggestions.append("Keep subject under 60 characters")
        
        if not any(word in subject_line.lower() for word in ["free", "urgent", "act now"]):
            passed_checks.append("Subject line not spammy")
        else:
            failed_checks.append("Subject line has spammy words")
            suggestions.append("Remove promotional language from subject")
    
    # Calculate score
    total_checks = len(passed_checks) + len(failed_checks)
    score = len(passed_checks) / total_checks if total_checks > 0 else 0
    
    # Must pass at least 70% of checks and have no critical failures
    critical_failures = [
        f for f in failed_checks 
        if "opener" in f.lower() or "salesy" in f.lower()
    ]
    passed = score >= 0.7 and len(critical_failures) == 0
    
    return QualityGateResult(
        passed=passed,
        gate_name="email_draft",
        score=score,
        passed_checks=passed_checks,
        failed_checks=failed_checks,
        suggestions=suggestions
    )


# =============================================================================
# PROPOSAL GATE
# =============================================================================

PROPOSAL_GATE_CONFIG = {
    "required_sections": [
        "understanding",
        "solution", 
        "pricing",
        "next_steps"
    ],
    "placeholder_patterns": [
        r"\[.*?\]",  # [placeholder]
        r"TBD",
        r"TODO",
        r"INSERT",
        r"PLACEHOLDER"
    ],
    "min_pain_point_coverage": 0.5,
    "required_html_elements": [
        "<html",
        "<head",
        "<body",
        "<style"
    ]
}


def evaluate_proposal_quality(
    proposal_html: str,
    opportunity: Dict[str, Any],
    pain_points: List[str],
    recommended_tier: str
) -> QualityGateResult:
    """
    Evaluate the quality of a generated proposal.
    
    Args:
        proposal_html: The proposal HTML content
        opportunity: Source opportunity data
        pain_points: Pain points from the opportunity
        recommended_tier: Recommended pricing tier
        
    Returns:
        QualityGateResult with pass/fail and details
    """
    config = PROPOSAL_GATE_CONFIG
    passed_checks = []
    failed_checks = []
    suggestions = []
    
    # Convert to lowercase for checking
    html_lower = proposal_html.lower()
    
    # Check 1: Required sections
    section_keywords = {
        "understanding": ["understand", "situation", "challenge", "you mentioned"],
        "solution": ["solution", "approach", "proposal", "we will", "deliverable"],
        "pricing": ["investment", "pricing", "price", "$", "cost"],
        "next_steps": ["next step", "cta", "proceed", "get started", "contact"]
    }
    
    for section in config["required_sections"]:
        keywords = section_keywords.get(section, [])
        found = any(kw in html_lower for kw in keywords)
        if found:
            passed_checks.append(f"Contains {section} section")
        else:
            failed_checks.append(f"Missing {section} section")
            suggestions.append(f"Add a clear {section.replace('_', ' ')} section")
    
    # Check 2: No placeholders
    found_placeholders = []
    for pattern in config["placeholder_patterns"]:
        matches = re.findall(pattern, proposal_html, re.IGNORECASE)
        found_placeholders.extend(matches)
    
    if not found_placeholders:
        passed_checks.append("No placeholder text found")
    else:
        failed_checks.append(f"Found {len(found_placeholders)} placeholder(s)")
        suggestions.append(f"Replace placeholders: {found_placeholders[:3]}")
    
    # Check 3: HTML structure valid
    valid_html = all(
        elem in html_lower 
        for elem in config["required_html_elements"]
    )
    
    if valid_html:
        passed_checks.append("Valid HTML structure")
    else:
        failed_checks.append("Invalid HTML structure")
        suggestions.append("Ensure proposal is complete HTML document")
    
    # Check 4: Pain points coverage
    pain_coverage = 0
    if pain_points:
        for pain in pain_points:
            pain_words = pain.lower().split()
            if any(word in html_lower for word in pain_words if len(word) > 4):
                pain_coverage += 1
        
        coverage_ratio = pain_coverage / len(pain_points)
        if coverage_ratio >= config["min_pain_point_coverage"]:
            passed_checks.append(f"Pain point coverage: {coverage_ratio:.0%}")
        else:
            failed_checks.append(f"Low pain point coverage: {coverage_ratio:.0%}")
            suggestions.append("Address more of the identified pain points")
    else:
        passed_checks.append("No pain points to check")
    
    # Check 5: Pricing alignment
    tier_keywords = {
        "low": ["strategy session", "initial", "2,500", "5,000", "299"],
        "mid": ["retainer", "advisory", "10,000", "15,000", "599"],
        "high": ["transformation", "fractional", "25,000", "50,000", "enterprise"]
    }
    
    tier_found = None
    for tier, keywords in tier_keywords.items():
        if any(kw in html_lower for kw in keywords):
            tier_found = tier
            if tier == recommended_tier:
                passed_checks.append(f"Pricing aligned with {recommended_tier} tier")
                break
    
    if tier_found and tier_found != recommended_tier:
        failed_checks.append(f"Pricing mismatch: found {tier_found}, expected {recommended_tier}")
        suggestions.append(f"Adjust pricing to match {recommended_tier} tier recommendation")
    elif not tier_found:
        failed_checks.append("No clear pricing found")
        suggestions.append("Add specific pricing information")
    
    # Check 6: Contact personalization
    contact = opportunity.get("contact", {})
    contact_name = contact.get("name", "")
    company = contact.get("company", "")
    
    if contact_name and contact_name.lower() in html_lower:
        passed_checks.append("Client name included")
    else:
        failed_checks.append("Client name not found")
        suggestions.append("Personalize with client name")
    
    if company and company.lower() in html_lower:
        passed_checks.append("Company name included")
    elif company:
        failed_checks.append("Company name not found")
        suggestions.append("Include company name in proposal")
    
    # Calculate score
    total_checks = len(passed_checks) + len(failed_checks)
    score = len(passed_checks) / total_checks if total_checks > 0 else 0
    
    # Must pass at least 75% and have no critical failures
    critical_failures = [
        f for f in failed_checks
        if "placeholder" in f.lower() or "html" in f.lower()
    ]
    passed = score >= 0.75 and len(critical_failures) == 0
    
    return QualityGateResult(
        passed=passed,
        gate_name="proposal",
        score=score,
        passed_checks=passed_checks,
        failed_checks=failed_checks,
        suggestions=suggestions
    )


# =============================================================================
# CONTEXT COMPLETENESS GATE
# =============================================================================

CONTEXT_GATE_CONFIG = {
    "require_transcript_search": True,
    "require_email_search": True,
    "require_unified_context": True,
    "require_pricing_for_proposals": True,
    "max_context_age_days": 7
}


def evaluate_context_completeness(
    context_state: Dict[str, Any],
    generation_type: str = "email"  # "email" or "proposal"
) -> QualityGateResult:
    """
    Evaluate whether sufficient context has been gathered
    before generating a draft or proposal.

    This gate MUST pass before any generation proceeds.
    It prevents the pattern where drafts are generated with
    incomplete information from only one source.

    Args:
        context_state: Dict from ContextState.to_dict() with:
            - transcript.searched (bool)
            - email.searched (bool)
            - unified_context.generated (bool)
            - pricing.extracted (bool)
        generation_type: "email" or "proposal"

    Returns:
        QualityGateResult with pass/fail and details
    """
    config = CONTEXT_GATE_CONFIG
    passed_checks = []
    failed_checks = []
    suggestions = []

    transcript = context_state.get("transcript", {})
    email = context_state.get("email", {})
    unified = context_state.get("unified_context", {})
    pricing = context_state.get("pricing", {})

    # Check 1: Transcript search
    if transcript.get("searched", False):
        source_count = len(transcript.get("source_ids", []))
        passed_checks.append(f"Transcript searched ({source_count} sources found)")
    else:
        failed_checks.append("Transcript NOT searched for this contact")
        suggestions.append("Search Google Drive transcripts for mentions of this contact before drafting")

    # Check 2: Email search
    if email.get("searched", False):
        thread_count = email.get("thread_count", 0)
        passed_checks.append(f"Email searched ({thread_count} threads found)")
    else:
        failed_checks.append("Email NOT searched for this contact")
        suggestions.append("Search Gmail for email exchanges with this contact before drafting")

    # Check 3: Unified context
    if unified.get("generated", False):
        passed_checks.append("Unified context generated (transcript + email merged)")
    else:
        failed_checks.append("Unified context NOT generated")
        suggestions.append("Run unified_context.generate_unified_context_workflow() to merge transcript and email context")

    # Check 4: Pricing (required for proposals, optional for emails)
    if generation_type == "proposal":
        if pricing.get("extracted", False):
            passed_checks.append(f"Pricing extracted from {pricing.get('source', 'unknown')}")
        else:
            failed_checks.append("Pricing NOT extracted from transcripts")
            suggestions.append("CRITICAL: Search all transcripts for pricing terms discussed with this contact before generating a proposal")
    else:
        # For emails, pricing is a bonus
        if pricing.get("extracted", False):
            passed_checks.append(f"Pricing context available (from {pricing.get('source', 'unknown')})")

    # Check 5: Context freshness
    unified_timestamp = unified.get("timestamp")
    if unified_timestamp:
        try:
            from datetime import datetime, timedelta
            ctx_time = datetime.fromisoformat(unified_timestamp)
            age_days = (datetime.utcnow() - ctx_time).days
            if age_days <= config["max_context_age_days"]:
                passed_checks.append(f"Context is fresh ({age_days} days old)")
            else:
                failed_checks.append(f"Context is stale ({age_days} days old, max {config['max_context_age_days']})")
                suggestions.append("Re-search transcripts and emails to catch recent communications")
        except (ValueError, TypeError):
            pass

    # Calculate score
    total_checks = len(passed_checks) + len(failed_checks)
    score = len(passed_checks) / total_checks if total_checks > 0 else 0

    # For proposals: must pass all checks (100%)
    # For emails: must pass at least 75%
    if generation_type == "proposal":
        passed = len(failed_checks) == 0
    else:
        passed = score >= 0.75 and not any("NOT searched" in f for f in failed_checks[:2])

    return QualityGateResult(
        passed=passed,
        gate_name="context_completeness",
        score=score,
        passed_checks=passed_checks,
        failed_checks=failed_checks,
        suggestions=suggestions
    )


# =============================================================================
# AGGREGATED GATE RUNNER
# =============================================================================

def run_quality_gate(
    gate_type: str,
    **kwargs
) -> QualityGateResult:
    """
    Run the appropriate quality gate based on type.
    
    Args:
        gate_type: "opportunity", "email", or "proposal"
        **kwargs: Gate-specific arguments
        
    Returns:
        QualityGateResult
    """
    gates = {
        "opportunity": evaluate_opportunity_quality,
        "email": evaluate_email_quality,
        "proposal": evaluate_proposal_quality,
        "context": evaluate_context_completeness
    }
    
    gate_func = gates.get(gate_type)
    if not gate_func:
        return QualityGateResult(
            passed=False,
            gate_name="unknown",
            score=0.0,
            passed_checks=[],
            failed_checks=[f"Unknown gate type: {gate_type}"],
            suggestions=["Use 'opportunity', 'email', or 'proposal'"]
        )
    
    return gate_func(**kwargs)


# =============================================================================
# QUALITY GATE WORKFLOW
# =============================================================================

QUALITY_GATE_WORKFLOW = """
## Quality Gate Usage

### Evaluating Opportunity Analysis

```python
from quality_gates import evaluate_opportunity_quality

result = evaluate_opportunity_quality(
    opportunity={
        "contact": {"name": "Dr. Smith", "company": "Wellness Clinic"},
        "opportunity_type": "consulting"
    },
    signals=[
        {"type": "EXPLICIT_INTEREST", "content": "...", "confidence": 0.8},
        {"type": "PAIN_POINT", "content": "...", "confidence": 0.7}
    ],
    classification_confidence=0.75
)

if result.passed:
    print("Opportunity quality: PASS")
else:
    print("Failed checks:", result.failed_checks)
    print("Suggestions:", result.suggestions)
```

### Evaluating Email Draft

```python
from quality_gates import evaluate_email_quality

result = evaluate_email_quality(
    email_content=\"\"\"Subject: Quick thought on your practice growth

    Dr. Smith,

    After seeing your work in longevity medicine...
    
    Would you be open to a brief call next week?
    \"\"\",
    email_type="warm",
    opportunity=opportunity_data,
    pain_points=["spending too much time on reports", "scaling challenges"]
)

if not result.passed:
    # Iterate with suggestions
    for suggestion in result.suggestions:
        print(f"Improve: {suggestion}")
```

### Evaluating Proposal

```python
from quality_gates import evaluate_proposal_quality

result = evaluate_proposal_quality(
    proposal_html=html_content,
    opportunity=opportunity_data,
    pain_points=["need protocol development", "want to scale"],
    recommended_tier="mid"
)
```

## Iteration Pattern

When a gate fails, use the suggestions to guide refinement:

```python
max_iterations = 3
for iteration in range(max_iterations):
    result = evaluate_email_quality(...)
    
    if result.passed:
        break
    
    # Pass suggestions to next draft attempt
    refinement_context = {
        "failed_checks": result.failed_checks,
        "suggestions": result.suggestions,
        "attempt": iteration + 1
    }
    
    # Regenerate with feedback
    email_content = regenerate_email(original_context, refinement_context)
```
"""
