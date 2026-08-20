"""
Subagent Orchestrator for BizDev Opportunity Intelligence

Coordinates fresh-context subagents for specific tasks:
1. Email Drafter - Generates outreach emails
2. Proposal Generator - Creates HTML proposals
3. Quality Evaluator - Evaluates outputs objectively
4. Context Searcher - Finds related information

Each subagent runs with fresh context to avoid bias from prior processing.
Uses the Task tool for delegation.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime


# =============================================================================
# SUBAGENT DEFINITIONS
# =============================================================================

class SubagentType:
    EMAIL_DRAFTER = "email_drafter"
    PROPOSAL_GENERATOR = "proposal_generator"
    QUALITY_EVALUATOR = "quality_evaluator"
    CONTEXT_SEARCHER = "context_searcher"


SUBAGENT_CONFIGS = {
    SubagentType.EMAIL_DRAFTER: {
        "name": "Email Drafter",
        "description": "Drafts contextually appropriate outreach emails",
        "fresh_context": True,
        "allowed_tools": ["Read"],
        "timeout_minutes": 5
    },
    SubagentType.PROPOSAL_GENERATOR: {
        "name": "Proposal Generator",
        "description": "Generates HTML proposals following NGM style",
        "fresh_context": True,
        "allowed_tools": ["Read", "Write", "Glob"],
        "timeout_minutes": 10
    },
    SubagentType.QUALITY_EVALUATOR: {
        "name": "Quality Evaluator",
        "description": "Objectively evaluates drafts against quality criteria",
        "fresh_context": True,
        "allowed_tools": ["Read"],
        "timeout_minutes": 3
    },
    SubagentType.CONTEXT_SEARCHER: {
        "name": "Context Searcher",
        "description": "Searches emails and files for relevant context",
        "fresh_context": True,
        "allowed_tools": ["Read", "Glob", "Grep", "mcp__gmail__search_threads", "mcp__gmail__get_email_content"],
        "timeout_minutes": 5
    }
}


# =============================================================================
# SUBAGENT PROMPT TEMPLATES
# =============================================================================

EMAIL_DRAFTER_PROMPT = """
You are an email drafting subagent. Your task is to write a single outreach email.

## Context
{context}

## Opportunity Data
Contact: {contact_name} ({contact_email})
Company: {company}
Opportunity Type: {opportunity_type}
Email Type: {email_type}

## Pain Points Identified
{pain_points}

## Prior Email History
{prior_context}

## Instructions
1. Follow the NGM voice guidelines (helpful expert, not salesy)
2. Keep under {word_limit} words
3. Open with value or relevance, never cliche phrases
4. Reference at least one specific pain point
5. End with a single, low-commitment CTA

## Output Format
```
Subject: [Your subject line - under 60 chars]

[Email body]

[Sign-off]
Anant
```

Write the email now.
"""


PROPOSAL_GENERATOR_PROMPT = """
You are a proposal generation subagent. Your task is to create an HTML proposal.

## Context
{context}

## Opportunity Data
Contact: {contact_name}
Company: {company}
Opportunity Type: {opportunity_type}
Confidence Score: {confidence_score}
Recommended Tier: {recommended_tier}

## Pain Points to Address
{pain_points}

## Interest Signals
{interest_signals}

## Pricing Recommendation
{pricing}

## Instructions
1. Follow the NGM proposal style guide exactly
2. Use the HTML template structure with proper CSS
3. Include all required sections (understanding, solution, pricing, next steps)
4. Personalize with contact name and company throughout
5. Address identified pain points in the Understanding section
6. Use the recommended pricing tier
7. NO placeholder text - everything must be filled in

## Output
Generate a complete HTML proposal document.
Save to: {output_path}
"""


QUALITY_EVALUATOR_PROMPT = """
You are a quality evaluation subagent. Your task is to objectively evaluate the following {output_type}.

## Quality Criteria
{criteria}

## Content to Evaluate
```
{content}
```

## Context
Opportunity Type: {opportunity_type}
Pain Points: {pain_points}
Recommended Tier: {recommended_tier}

## Instructions
1. Evaluate against each criterion listed above
2. Be objective - this is a fresh evaluation
3. Identify specific passages that pass or fail
4. Provide actionable improvement suggestions

## Output Format
```json
{{
    "overall_pass": true/false,
    "score": 0.0-1.0,
    "passed_checks": ["check1", "check2"],
    "failed_checks": ["check3"],
    "suggestions": ["suggestion1", "suggestion2"],
    "specific_issues": [
        {{"location": "opening", "issue": "...", "fix": "..."}}
    ]
}}
```
"""


CONTEXT_SEARCHER_PROMPT = """
You are a context searching subagent. Your task is to find relevant information about a contact.

## Search Target
Name: {contact_name}
Email: {contact_email}
Company: {company}

## Instructions
1. Search Gmail for prior email exchanges with this contact
2. Look for any files mentioning this contact or company
3. Extract relevant context: pain points, interests, commitments
4. Determine the conversation stage (new, warm, cooling, stale)

## MCP Commands to Execute
1. Search emails:
   mcp__gmail__search_threads(query="{email_query}", max_results=10)

2. Get email content for relevant threads:
   mcp__gmail__get_email_content(email_id=THREAD_ID)

## Output Format
```json
{{
    "conversation_stage": "new|warm|cooling|stale|cold",
    "days_since_contact": null or number,
    "prior_threads": [
        {{"subject": "...", "date": "...", "summary": "..."}}
    ],
    "extracted_context": {{
        "pain_points": ["..."],
        "interests": ["..."],
        "commitments": ["..."]
    }},
    "recommended_email_type": "cold|warm|reengagement"
}}
```
"""


# =============================================================================
# SUBAGENT INVOCATION
# =============================================================================

def create_subagent_task(
    subagent_type: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Create a Task tool invocation for a subagent.
    
    Args:
        subagent_type: Type of subagent to spawn
        **kwargs: Arguments for the subagent prompt
        
    Returns:
        Task invocation dict with prompt and config
    """
    config = SUBAGENT_CONFIGS.get(subagent_type)
    if not config:
        raise ValueError(f"Unknown subagent type: {subagent_type}")
    
    # Build prompt based on type
    if subagent_type == SubagentType.EMAIL_DRAFTER:
        prompt = EMAIL_DRAFTER_PROMPT.format(
            context=kwargs.get("context", ""),
            contact_name=kwargs.get("contact_name", "Unknown"),
            contact_email=kwargs.get("contact_email", ""),
            company=kwargs.get("company", ""),
            opportunity_type=kwargs.get("opportunity_type", "consulting"),
            email_type=kwargs.get("email_type", "warm"),
            pain_points="\n".join(f"- {p}" for p in kwargs.get("pain_points", [])),
            prior_context=kwargs.get("prior_context", "No prior history"),
            word_limit=kwargs.get("word_limit", 250)
        )
    
    elif subagent_type == SubagentType.PROPOSAL_GENERATOR:
        prompt = PROPOSAL_GENERATOR_PROMPT.format(
            context=kwargs.get("context", ""),
            contact_name=kwargs.get("contact_name", "Unknown"),
            company=kwargs.get("company", ""),
            opportunity_type=kwargs.get("opportunity_type", "consulting"),
            confidence_score=kwargs.get("confidence_score", 50),
            recommended_tier=kwargs.get("recommended_tier", "mid"),
            pain_points="\n".join(f"- {p}" for p in kwargs.get("pain_points", [])),
            interest_signals="\n".join(f"- {s}" for s in kwargs.get("interest_signals", [])),
            pricing=kwargs.get("pricing", "See recommended tier"),
            output_path=kwargs.get("output_path", ".bizdev/drafts/proposals/draft.html")
        )
    
    elif subagent_type == SubagentType.QUALITY_EVALUATOR:
        prompt = QUALITY_EVALUATOR_PROMPT.format(
            output_type=kwargs.get("output_type", "content"),
            criteria=kwargs.get("criteria", "Standard quality criteria"),
            content=kwargs.get("content", ""),
            opportunity_type=kwargs.get("opportunity_type", ""),
            pain_points="\n".join(f"- {p}" for p in kwargs.get("pain_points", [])),
            recommended_tier=kwargs.get("recommended_tier", "")
        )
    
    elif subagent_type == SubagentType.CONTEXT_SEARCHER:
        contact_email = kwargs.get("contact_email", "")
        email_query = f"from:{contact_email} OR to:{contact_email}" if contact_email else f'"{kwargs.get("contact_name", "")}"'
        
        prompt = CONTEXT_SEARCHER_PROMPT.format(
            contact_name=kwargs.get("contact_name", "Unknown"),
            contact_email=contact_email,
            company=kwargs.get("company", ""),
            email_query=email_query
        )
    
    else:
        prompt = f"Execute {subagent_type} task with kwargs: {kwargs}"
    
    return {
        "subagent_type": subagent_type,
        "name": config["name"],
        "prompt": prompt,
        "fresh_context": config["fresh_context"],
        "timeout_minutes": config["timeout_minutes"],
        "task_instruction": f"""
## Subagent Task: {config["name"]}

This task should be executed using the Task tool with fresh context.

### Task Prompt
{prompt}

### Execution
```
Task(
    description="{config['description']}",
    prompt=<prompt above>
)
```

### Expected Output
The subagent will return its output according to the format specified in the prompt.
"""
    }


# =============================================================================
# ORCHESTRATION WORKFLOWS
# =============================================================================

def orchestrate_email_draft(
    opportunity: Dict[str, Any],
    prior_context: Optional[str] = None,
    email_type: str = "warm"
) -> Dict[str, Any]:
    """
    Orchestrate the complete email drafting workflow with subagents.
    
    Args:
        opportunity: Opportunity data
        prior_context: Prior email context
        email_type: Type of email to draft
        
    Returns:
        Orchestration workflow dict
    """
    contact = opportunity.get("contact", {})
    signals = opportunity.get("signals", [])
    
    pain_points = [
        s.get("content", "")
        for s in signals
        if s.get("type") == "PAIN_POINT"
    ]
    
    return {
        "workflow_type": "email_draft",
        "steps": [
            {
                "step": 1,
                "name": "Search for prior context",
                "subagent": SubagentType.CONTEXT_SEARCHER,
                "task": create_subagent_task(
                    SubagentType.CONTEXT_SEARCHER,
                    contact_name=contact.get("name"),
                    contact_email=contact.get("email"),
                    company=contact.get("company")
                ),
                "skip_if": "prior_context is already provided"
            },
            {
                "step": 2,
                "name": "Draft email",
                "subagent": SubagentType.EMAIL_DRAFTER,
                "task": create_subagent_task(
                    SubagentType.EMAIL_DRAFTER,
                    contact_name=contact.get("name"),
                    contact_email=contact.get("email"),
                    company=contact.get("company"),
                    opportunity_type=opportunity.get("opportunity_type", "consulting"),
                    email_type=email_type,
                    pain_points=pain_points,
                    prior_context=prior_context or "Search results from Step 1"
                )
            },
            {
                "step": 3,
                "name": "Evaluate email quality",
                "subagent": SubagentType.QUALITY_EVALUATOR,
                "task": create_subagent_task(
                    SubagentType.QUALITY_EVALUATOR,
                    output_type="email draft",
                    criteria="""
- Opens with value, not cliche
- Under word limit (cold: 200, warm: 300)
- References specific pain point
- Has clear, single CTA
- No salesy language
- Personalized to recipient
""",
                    content="[Email from Step 2]",
                    opportunity_type=opportunity.get("opportunity_type"),
                    pain_points=pain_points
                ),
                "iterate_if_fail": True,
                "max_iterations": 3
            }
        ]
    }


def orchestrate_proposal_draft(
    opportunity: Dict[str, Any],
    recommended_tier: str = "mid"
) -> Dict[str, Any]:
    """
    Orchestrate the complete proposal drafting workflow.
    
    Args:
        opportunity: Opportunity data
        recommended_tier: Pricing tier to recommend
        
    Returns:
        Orchestration workflow dict
    """
    contact = opportunity.get("contact", {})
    signals = opportunity.get("signals", [])
    
    pain_points = [s.get("content", "") for s in signals if s.get("type") == "PAIN_POINT"]
    interest_signals = [s.get("content", "") for s in signals if s.get("type") in ["EXPLICIT_INTEREST", "FOLLOW_UP_REQUEST"]]
    
    company_slug = (contact.get("company") or contact.get("name", "client")).lower().replace(" ", "-")[:20]
    output_path = f".bizdev/drafts/proposals/{company_slug}-{datetime.now().strftime('%Y%m%d')}.html"
    
    return {
        "workflow_type": "proposal_draft",
        "steps": [
            {
                "step": 1,
                "name": "Load proposal context",
                "action": "Read existing proposals for style matching",
                "files": [
                    "Glob: content/proposals/*.html",
                    "Read: [most recent 2 proposals]"
                ]
            },
            {
                "step": 2,
                "name": "Generate proposal",
                "subagent": SubagentType.PROPOSAL_GENERATOR,
                "task": create_subagent_task(
                    SubagentType.PROPOSAL_GENERATOR,
                    contact_name=contact.get("name"),
                    company=contact.get("company"),
                    opportunity_type=opportunity.get("opportunity_type", "consulting"),
                    confidence_score=opportunity.get("confidence_score", 50),
                    recommended_tier=recommended_tier,
                    pain_points=pain_points,
                    interest_signals=interest_signals,
                    output_path=output_path
                )
            },
            {
                "step": 3,
                "name": "Evaluate proposal quality",
                "subagent": SubagentType.QUALITY_EVALUATOR,
                "task": create_subagent_task(
                    SubagentType.QUALITY_EVALUATOR,
                    output_type="HTML proposal",
                    criteria="""
- Has all required sections (understanding, solution, pricing, next steps)
- No placeholder text
- Valid HTML structure
- Client name and company included
- Pain points addressed
- Pricing matches recommended tier
""",
                    content="[Proposal from Step 2]",
                    opportunity_type=opportunity.get("opportunity_type"),
                    pain_points=pain_points,
                    recommended_tier=recommended_tier
                ),
                "iterate_if_fail": True,
                "max_iterations": 2
            }
        ],
        "output_path": output_path
    }


# =============================================================================
# EXECUTION HELPERS
# =============================================================================

def format_task_invocation(subagent_task: Dict[str, Any]) -> str:
    """
    Format a subagent task as a Task tool invocation string.
    
    Args:
        subagent_task: Task dict from create_subagent_task
        
    Returns:
        Formatted invocation string
    """
    return f"""
Execute with Task tool:

**Task:** {subagent_task["name"]}

**Prompt:**
```
{subagent_task["prompt"]}
```

**Timeout:** {subagent_task["timeout_minutes"]} minutes
"""


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

SUBAGENT_WORKFLOW = """
## Subagent Orchestrator Usage

### Email Draft Workflow

```python
from subagents import orchestrate_email_draft

workflow = orchestrate_email_draft(
    opportunity=opportunity_data,
    prior_context=email_history_summary,
    email_type="warm"
)

# Execute each step
for step in workflow["steps"]:
    if step.get("subagent"):
        # Use Task tool with fresh context
        result = Task(
            description=step["name"],
            prompt=step["task"]["prompt"]
        )
        
        # Check if iteration needed
        if step.get("iterate_if_fail") and not result.passed:
            # Retry with feedback
            pass
```

### Proposal Draft Workflow

```python
from subagents import orchestrate_proposal_draft

workflow = orchestrate_proposal_draft(
    opportunity=opportunity_data,
    recommended_tier="mid"
)

# Similar execution pattern
```

### Direct Subagent Invocation

```python
from subagents import create_subagent_task, SubagentType

# Create quality evaluator task
task = create_subagent_task(
    SubagentType.QUALITY_EVALUATOR,
    output_type="email",
    content=email_draft,
    criteria="...",
    pain_points=pain_points
)

# Execute with Task tool
result = Task(
    description="Evaluate email quality",
    prompt=task["prompt"]
)
```

## Subagent Types

| Type | Purpose | Fresh Context |
|------|---------|---------------|
| EMAIL_DRAFTER | Draft outreach emails | Yes |
| PROPOSAL_GENERATOR | Create HTML proposals | Yes |
| QUALITY_EVALUATOR | Evaluate output quality | Yes |
| CONTEXT_SEARCHER | Find related emails/files | Yes |

## Why Fresh Context?

Each subagent runs with fresh context to:
1. Avoid bias from prior processing
2. Provide objective evaluation
3. Keep context windows manageable
4. Enable parallel processing
"""
