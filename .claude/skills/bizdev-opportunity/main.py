"""
Main Orchestration Module for BizDev Opportunity Intelligence

This is the primary entry point for the bizdev-opportunity skill.
It coordinates all sub-modules to provide a unified interface for:

1. Scanning all data sources for opportunities
2. Generating pipeline reports and dashboards
3. Retrieving opportunity details
4. Preparing proposals from opportunities

Usage:
    /bizdev-opportunity scan --folder-id <ID> --lookback 6
    /bizdev-opportunity report
    /bizdev-opportunity detail <opportunity-id>
    /bizdev-opportunity proposal <opportunity-id>
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

# =============================================================================
# DEFAULT CONFIGURATION
# =============================================================================

DEFAULT_CONFIG = {
    "transcript_folder_id": None,  # Must be provided
    "lookback_months": 6,
    "email_search_terms": [
        "longevity medicine",
        "functional medicine",
        "consulting",
        "platform demo",
        "lab reports",
        "partnership"
    ],
    "output_dir": "content/docs"
}


# =============================================================================
# OPPORTUNITY STORAGE (In-Memory for Session)
# =============================================================================

# Opportunities discovered during this session
# In practice, Claude maintains this through conversation context
_session_opportunities: List[Dict[str, Any]] = []


def get_session_opportunities() -> List[Dict[str, Any]]:
    """Get all opportunities discovered in current session."""
    return _session_opportunities


def add_opportunity(opportunity: Dict[str, Any]) -> str:
    """Add an opportunity to session storage, returns ID."""
    if "id" not in opportunity:
        opportunity["id"] = f"opp-{uuid.uuid4().hex[:8]}"
    _session_opportunities.append(opportunity)
    return opportunity["id"]


def find_opportunity_by_id(opportunity_id: str) -> Optional[Dict[str, Any]]:
    """Find opportunity by ID in session storage."""
    for opp in _session_opportunities:
        if opp.get("id") == opportunity_id:
            return opp
    return None


# =============================================================================
# MAIN ORCHESTRATION FUNCTIONS
# =============================================================================

def scan_all_sources(
    transcript_folder_id: str,
    lookback_months: int = 6,
    email_search_terms: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Orchestrate scanning of all data sources for opportunities.

    This function coordinates the transcript scanner and email scanner
    to gather opportunities from all configured sources, then merges
    and deduplicates the results.

    Args:
        transcript_folder_id: Google Drive folder ID for transcripts
        lookback_months: How many months to look back (default: 6)
        email_search_terms: Optional list of search terms for email

    Returns:
        Dict with:
        - success: bool
        - opportunities: List of opportunity dicts
        - counts: Breakdown by source
        - instructions: Claude workflow instructions
    """
    if not transcript_folder_id:
        return {
            "success": False,
            "error": "transcript_folder_id is required",
            "instructions": """
## Missing Configuration

Please provide the Google Drive folder ID containing meeting transcripts:

```
/bizdev-opportunity scan --folder-id YOUR_FOLDER_ID
```

To find your folder ID:
1. Open the folder in Google Drive
2. Copy the ID from the URL: drive.google.com/drive/folders/[THIS_IS_THE_ID]
"""
        }

    search_terms = email_search_terms or DEFAULT_CONFIG["email_search_terms"]

    # Return workflow instructions for Claude to execute
    workflow = f"""
## Opportunity Scanning Workflow

Execute the following steps to scan for opportunities:

### Step 1: Scan Meeting Transcripts

Use the Google Drive MCP to list and read transcripts:

```
1. List files in folder: {transcript_folder_id}
   Use: mcp__google-drive__list_files(folder_id="{transcript_folder_id}")

2. Filter to last {lookback_months} months

3. For each transcript file:
   a. Read content: mcp__google-drive__export_google_doc(file_id=FILE_ID)
   b. Apply TRANSCRIPT_OPPORTUNITY_EXTRACTION prompt from prompts.py
   c. Parse JSON response for opportunities
```

### Step 2: Scan Emails

Use the Gmail MCP to search for opportunity signals:

```
1. Search emails with terms: {', '.join(search_terms[:5])}
   Use: mcp__gmail__search_threads(query="...", date_from=LOOKBACK_DATE)

2. For promising threads:
   a. Get full content: mcp__gmail__get_email_content(email_id=EMAIL_ID)
   b. Apply EMAIL_OPPORTUNITY_EXTRACTION prompt from prompts.py
   c. Parse JSON response for opportunities
```

### Step 3: Process Results

```python
# After collecting all opportunities:

from analyzer import classify_opportunity, score_opportunity, assign_pipeline_stage, merge_duplicate_opportunities

# Classify and score each opportunity
for opp in opportunities:
    classification = classify_opportunity(opp["signals"])
    opp["opportunity_type"] = classification["primary_type"]

    scoring = score_opportunity(opp["signals"], opp["opportunity_type"])
    opp["confidence_score"] = scoring["score"]

    stage = assign_pipeline_stage(opp["signals"], opp["confidence_score"])
    opp["stage"] = stage["stage"]
    opp["next_action"] = stage["next_action"]

# Merge duplicates
merged = merge_duplicate_opportunities(opportunities)
final_opportunities = merged["merged"]
```

### Step 4: Store Results

Store the opportunities for this session so they can be used for:
- Dashboard generation
- Detail views
- Proposal creation

Configuration used:
- Transcript Folder: {transcript_folder_id}
- Lookback: {lookback_months} months
- Email Terms: {', '.join(search_terms[:3])}...
"""

    return {
        "success": True,
        "instructions": workflow,
        "config": {
            "transcript_folder_id": transcript_folder_id,
            "lookback_months": lookback_months,
            "email_search_terms": search_terms
        }
    }


def generate_pipeline_report(
    opportunities: Optional[List[Dict[str, Any]]] = None,
    output_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate HTML pipeline dashboard from opportunities.

    Delegates to dashboard.py to create a complete visual report.

    Args:
        opportunities: List of opportunity dicts (uses session if not provided)
        output_path: Optional custom output path

    Returns:
        Dict with:
        - success: bool
        - output_path: Path to generated file
        - stats: Summary statistics
        - instructions: Next steps
    """
    opps = opportunities or get_session_opportunities()

    if not opps:
        return {
            "success": False,
            "error": "No opportunities available",
            "instructions": """
## No Opportunities Found

Run a scan first to discover opportunities:

```
/bizdev-opportunity scan --folder-id YOUR_FOLDER_ID
```

Or provide opportunities directly to this function.
"""
        }

    # Generate workflow instructions
    workflow = f"""
## Dashboard Generation

Execute the following to generate the pipeline dashboard:

```python
from dashboard import generate_dashboard

result = generate_dashboard(
    opportunities=opportunities,  # {len(opps)} opportunities
    output_path="{output_path or 'content/docs/bizdev-dashboard-' + datetime.now().strftime('%Y-%m-%d') + '.html'}"
)

if result["success"]:
    print(f"Dashboard generated: {{result['output_path']}}")
    print(f"Total: {{result['stats']['total_opportunities']}}")
    print(f"High Priority: {{result['stats']['high_priority_count']}}")
    print(f"Needs Attention: {{result['stats']['stale_count']}}")
else:
    print(f"Error: {{result['error']}}")
```

### After Generation

Open the dashboard in browser:
```bash
open {output_path or 'content/docs/bizdev-dashboard-' + datetime.now().strftime('%Y-%m-%d') + '.html'}
```

The dashboard provides:
- Kanban-style pipeline visualization
- Opportunity cards grouped by stage
- Summary statistics
- Color-coded by opportunity type
- Quick actions for proposals
"""

    return {
        "success": True,
        "opportunity_count": len(opps),
        "instructions": workflow
    }


def get_opportunity_detail(opportunity_id: str) -> Dict[str, Any]:
    """
    Retrieve detailed information about a specific opportunity.

    Args:
        opportunity_id: The opportunity ID to look up

    Returns:
        Dict with full opportunity context or error
    """
    opportunity = find_opportunity_by_id(opportunity_id)

    if not opportunity:
        return {
            "success": False,
            "error": f"Opportunity '{opportunity_id}' not found",
            "instructions": """
## Opportunity Not Found

The specified opportunity ID was not found in the current session.

To see available opportunities:
1. Run a scan: `/bizdev-opportunity scan --folder-id YOUR_FOLDER_ID`
2. Generate a report: `/bizdev-opportunity report`

Or search for opportunities by contact name or company.
"""
        }

    # Enrich with analysis
    workflow = f"""
## Opportunity Detail: {opportunity.get('contact', {}).get('name', 'Unknown')}

### Contact Information
- **Name:** {opportunity.get('contact', {}).get('name', 'N/A')}
- **Company:** {opportunity.get('contact', {}).get('company', 'N/A')}
- **Email:** {opportunity.get('contact', {}).get('email', 'N/A')}
- **Title:** {opportunity.get('contact', {}).get('title', 'N/A')}

### Opportunity Analysis
- **Type:** {opportunity.get('opportunity_type', 'N/A').replace('_', ' ').title()}
- **Stage:** {opportunity.get('stage', 'N/A').replace('_', ' ').title()}
- **Confidence:** {opportunity.get('confidence_score', 'N/A')}/100
- **Source:** {opportunity.get('source', 'N/A')} ({opportunity.get('source_id', 'N/A')})

### Signals Detected
"""

    for signal in opportunity.get('signals', []):
        workflow += f"- **{signal.get('type', 'UNKNOWN')}:** \"{signal.get('content', '')[:100]}\"\n"

    workflow += f"""
### Timeline
- **Discovered:** {opportunity.get('discovered_at', 'N/A')}
- **Last Activity:** {opportunity.get('last_activity', 'N/A')}

### Recommended Next Action
{opportunity.get('next_action', 'Review and qualify this opportunity')}

### Actions Available
1. **Generate Proposal:** `/bizdev-opportunity proposal {opportunity_id}`
2. **View in Dashboard:** `/bizdev-opportunity report`
"""

    return {
        "success": True,
        "opportunity": opportunity,
        "detail": workflow
    }


def prepare_proposal(opportunity_id: str) -> Dict[str, Any]:
    """
    Prepare proposal generation context for an opportunity.

    Delegates to proposal_bridge.py to format opportunity data
    for the proposal-generator skill.

    Args:
        opportunity_id: The opportunity ID to create proposal for

    Returns:
        Dict with proposal context and invocation instructions
    """
    opportunity = find_opportunity_by_id(opportunity_id)

    if not opportunity:
        return {
            "success": False,
            "error": f"Opportunity '{opportunity_id}' not found",
            "instructions": "Run a scan first or provide a valid opportunity ID."
        }

    # Generate workflow instructions
    contact_name = opportunity.get('contact', {}).get('name', 'the prospect')
    company = opportunity.get('contact', {}).get('company', '')

    workflow = f"""
## Proposal Generation for {contact_name}

Execute the following to generate a proposal:

### Step 1: Prepare Context

```python
from proposal_bridge import generate_proposal_prompt

prompt = generate_proposal_prompt(opportunity)
```

### Step 2: Invoke Proposal Generator

Use the generated prompt with the proposal-generator skill:

```
/proposal-generator

Client: {contact_name}
Company: {company}
Type: {opportunity.get('opportunity_type', 'consulting')}

[The prepared prompt will include all relevant context from the opportunity]
```

### Step 3: Review Output

The proposal will be saved to:
`content/proposals/proposal-{company.lower().replace(' ', '-')[:20] or 'client'}-{datetime.now().strftime('%Y-%m-%d')}.html`

### Context Summary

**Opportunity Type:** {opportunity.get('opportunity_type', 'N/A').replace('_', ' ').title()}
**Confidence Score:** {opportunity.get('confidence_score', 'N/A')}/100
**Signals:**
"""

    for signal in opportunity.get('signals', [])[:5]:
        workflow += f"- {signal.get('type', 'UNKNOWN')}: \"{signal.get('content', '')[:80]}...\"\n"

    workflow += """
### Alternative: Manual Proposal

If you prefer to create the proposal manually, use the context above
and follow the proposal-generator SKILL.md guidelines.
"""

    return {
        "success": True,
        "opportunity": opportunity,
        "instructions": workflow
    }


# =============================================================================
# SKILL ENTRY POINT
# =============================================================================

def run_skill(
    command: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for skill invocation.

    Commands:
    - scan: Scan all sources for opportunities
    - report: Generate pipeline dashboard
    - detail: Get opportunity details
    - proposal: Prepare proposal for opportunity

    Args:
        command: The command to execute
        **kwargs: Command-specific arguments

    Returns:
        Dict with command results
    """
    commands = {
        "scan": lambda: scan_all_sources(
            transcript_folder_id=kwargs.get("folder_id"),
            lookback_months=kwargs.get("lookback", 6),
            email_search_terms=kwargs.get("search_terms")
        ),
        "report": lambda: generate_pipeline_report(
            opportunities=kwargs.get("opportunities"),
            output_path=kwargs.get("output_path")
        ),
        "detail": lambda: get_opportunity_detail(
            opportunity_id=kwargs.get("opportunity_id", "")
        ),
        "proposal": lambda: prepare_proposal(
            opportunity_id=kwargs.get("opportunity_id", "")
        )
    }

    if command not in commands:
        return {
            "success": False,
            "error": f"Unknown command: {command}",
            "available_commands": list(commands.keys()),
            "instructions": """
## BizDev Opportunity Intelligence

Available commands:

### Scan for Opportunities
```
/bizdev-opportunity scan --folder-id YOUR_FOLDER_ID --lookback 6
```

### Generate Pipeline Report
```
/bizdev-opportunity report
```

### View Opportunity Details
```
/bizdev-opportunity detail <opportunity-id>
```

### Prepare Proposal
```
/bizdev-opportunity proposal <opportunity-id>
```
"""
        }

    try:
        return commands[command]()
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "command": command
        }


# =============================================================================
# ITERATIVE EXECUTION (Ralph-style)
# =============================================================================

def run_iterative_scan(
    transcript_folder_id: str,
    lookback_months: int = 6,
    draft_emails: bool = True,
    draft_proposals: bool = True,
    email_score_threshold: int = 40,
    proposal_score_threshold: int = 60
) -> Dict[str, Any]:
    """
    Execute iterative opportunity scanning with quality gates.
    
    This is the main entry point for the Ralph-style iterative workflow.
    It generates a PRD, processes tasks one at a time, runs quality gates,
    and drafts outputs with feedback loops.
    
    Args:
        transcript_folder_id: Google Drive folder ID for transcripts
        lookback_months: How many months to look back
        draft_emails: Whether to generate email drafts
        draft_proposals: Whether to generate proposal drafts
        email_score_threshold: Min score for email drafts
        proposal_score_threshold: Min score for proposal drafts
        
    Returns:
        Workflow instructions for iterative execution
    """
    session_id = f"session-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}"
    
    workflow = f"""
# BizDev Opportunity Intelligence - Iterative Execution

## Session: {session_id}

This executes the Ralph-style iterative workflow:
1. **Planning** - Generate PRD with tasks
2. **Execution** - Process tasks with quality gates
3. **Drafting** - Generate emails and proposals with iteration
4. **Compounding** - Log learnings and generate dashboard

---

## Phase 1: Planning

### Step 1.1: Initialize Session Files

```bash
mkdir -p .bizdev/drafts/emails
mkdir -p .bizdev/drafts/proposals
```

### Step 1.2: List Transcript Files

```
mcp__google-drive__list_files(folder_id="{transcript_folder_id}")
```

Filter to files modified within last {lookback_months} months.

### Step 1.3: Search Email Threads

```
mcp__gmail__search_threads(
    query="longevity medicine OR functional medicine OR consulting OR platform",
    max_results=20
)
```

### Step 1.4: Generate PRD

```python
from prd_generator import generate_prd

prd = generate_prd(
    transcript_folder_id="{transcript_folder_id}",
    transcript_files=transcript_list,  # From Step 1.2
    email_threads=email_threads,        # From Step 1.3
    lookback_months={lookback_months},
    draft_emails={draft_emails},
    draft_proposals={draft_proposals},
    email_score_threshold={email_score_threshold},
    proposal_score_threshold={proposal_score_threshold}
)

# Save PRD
Write(".bizdev/prd.json", json.dumps(prd, indent=2))
```

### Step 1.5: Initialize Progress Log

```python
from prd_generator import generate_initial_progress

progress = generate_initial_progress()
Write(".bizdev/progress.txt", progress)
```

### Step 1.6: Confirm with User

Present summary:
```
BIZDEV OPPORTUNITY PLANNING COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Session: {session_id}
Sources Found:
  - Transcripts: [N]
  - Email Threads: [N]

Tasks Generated: [N]
  - Scan tasks: [N]
  - Draft tasks: TBD (depends on scores)

Configuration:
  - Lookback: {lookback_months} months
  - Draft Emails: {draft_emails} (threshold: {email_score_threshold})
  - Draft Proposals: {draft_proposals} (threshold: {proposal_score_threshold})

PRD saved to: .bizdev/prd.json
Progress log: .bizdev/progress.txt

Begin iterative execution? [Y/n]
```

---

## Phase 2: Iterative Execution

Execute the main loop:

```python
from prd_generator import get_next_task, update_task_status, add_follow_up_tasks, TaskStatus
from quality_gates import evaluate_opportunity_quality, evaluate_email_quality, evaluate_proposal_quality
from email_drafter import draft_email_workflow
from email_searcher import search_contact_emails_workflow
from context_loader import get_email_drafting_context, get_proposal_drafting_context
from subagents import orchestrate_email_draft, orchestrate_proposal_draft

iteration = 0

while True:
    # Get next task
    task = get_next_task(prd)
    if not task:
        break  # All tasks complete
    
    iteration += 1
    prd = update_task_status(prd, task["id"], TaskStatus.IN_PROGRESS)
    
    print(f"\\nITERATION {{iteration}} | {{task['id']}}: {{task['sourceName']}}")
    
    # Execute based on task type
    if task["type"] in ["scan_transcript", "scan_email"]:
        result = execute_scan_task(task)
        
        # Quality gate
        if result.get("opportunity"):
            gate_result = evaluate_opportunity_quality(
                opportunity=result["opportunity"],
                signals=result["signals"],
                classification_confidence=result.get("classification_confidence", 0.5)
            )
            
            if gate_result.passed:
                # Add follow-up tasks
                prd = add_follow_up_tasks(
                    prd,
                    scan_task_id=task["id"],
                    opportunity=result["opportunity"],
                    confidence_score=result["opportunity"]["confidence_score"]
                )
                prd = update_task_status(prd, task["id"], TaskStatus.PASSED, result=result)
            else:
                # Log failure, continue
                prd = update_task_status(prd, task["id"], TaskStatus.FAILED, error=str(gate_result.failed_checks))
    
    elif task["type"] == "draft_email":
        result = execute_email_draft_task(task, prd)
        # Quality gate with iteration
        for attempt in range(3):
            gate_result = evaluate_email_quality(
                email_content=result["draft"],
                email_type=result["email_type"],
                opportunity=result["opportunity"],
                pain_points=result["pain_points"]
            )
            if gate_result.passed:
                prd = update_task_status(prd, task["id"], TaskStatus.PASSED, result=result)
                break
            else:
                # Iterate with feedback
                result = refine_email_draft(result, gate_result)
        else:
            prd = update_task_status(prd, task["id"], TaskStatus.FAILED)
    
    elif task["type"] == "draft_proposal":
        # Similar pattern for proposals
        pass
    
    # Log progress
    append_to_progress(task, result)
    
    # Save PRD state
    Write(".bizdev/prd.json", json.dumps(prd, indent=2))
```

### Task Execution Functions

**Scan Task:**
```python
def execute_scan_task(task):
    # Read source content
    if task["sourceType"] == "transcript":
        content = mcp__google-drive__export_google_doc(file_id=task["sourceId"])
    else:
        content = mcp__gmail__get_email_content(email_id=task["sourceId"])
    
    # Apply extraction prompt
    from prompts import format_transcript_prompt, format_email_prompt
    prompt = format_transcript_prompt(content, task["sourceName"]) if task["sourceType"] == "transcript" else format_email_prompt(...)
    
    # Parse response for opportunities
    result = parse_extraction_response(llm_response)
    
    return result
```

**Email Draft Task:**
```python
def execute_email_draft_task(task, prd):
    opportunity_id = task["metadata"]["opportunityId"]
    opportunity = find_opportunity_by_id(opportunity_id)
    
    # Search for prior email context
    from email_searcher import search_contact_emails_workflow
    context_workflow = search_contact_emails_workflow(
        contact_name=opportunity["contact"]["name"],
        contact_email=opportunity["contact"].get("email"),
        company=opportunity["contact"].get("company")
    )
    # Execute context search...
    
    # Get drafting context
    from context_loader import get_email_drafting_context
    context = get_email_drafting_context(opportunity["opportunity_type"])
    
    # Generate draft
    from email_drafter import draft_email_workflow
    workflow = draft_email_workflow(
        opportunity=opportunity,
        prior_emails=prior_context,
        last_activity_days=days_since
    )
    # Execute draft generation...
    
    return result
```

---

## Phase 3: Compounding

### Step 3.1: Generate Dashboard

```python
from dashboard import generate_dashboard

opportunities = [find_opportunity_by_id(t["result"]["opportunity"]["id"]) 
                 for t in prd["tasks"] 
                 if t["status"] == "passed" and t["type"].startswith("scan")]

result = generate_dashboard(
    opportunities=opportunities,
    output_path=f"content/docs/bizdev-dashboard-{datetime.now().strftime('%Y-%m-%d')}.html"
)
```

### Step 3.2: Update Progress with Learnings

```python
# Append session summary to progress.txt
summary = f'''
================================================================================
SESSION COMPLETE: {session_id}
================================================================================

Opportunities Found: {{len(opportunities)}}
  - High Priority (≥70): {{high_priority_count}}
  - Medium (40-69): {{medium_count}}
  - Low (<40): {{low_count}}

Drafts Generated:
  - Emails: {{emails_count}}
  - Proposals: {{proposals_count}}

Quality Gate Summary:
  - Pass on First Try: {{first_try_count}}
  - Pass After Iteration: {{iterated_count}}
  - Failed: {{failed_count}}

Key Patterns Discovered:
{{patterns}}

================================================================================
'''
```

### Step 3.3: Final Report

```
BIZDEV OPPORTUNITY INTELLIGENCE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Session: {session_id}

Opportunities Found: [N]
  - High Priority: [N]
  - Medium: [N]  
  - Low: [N]

Drafts Generated:
  - Emails: [N] (cold: [N], warm: [N], reengagement: [N])
  - Proposals: [N]

Quality Gate Results:
  - Pass First Try: [N] ([%])
  - Pass After Iteration: [N] ([%])
  - Failed: [N] ([%])

Outputs:
  - Dashboard: content/docs/bizdev-dashboard-YYYY-MM-DD.html
  - Email Drafts: .bizdev/drafts/emails/
  - Proposals: .bizdev/drafts/proposals/
  - Changelog: .claude/skills/bizdev-opportunity/changelogs/{session_id}.md

Learnings saved to: .bizdev/progress.txt

Next Steps:
1. Review dashboard: open content/docs/bizdev-dashboard-*.html
2. Review email drafts before sending
3. Review proposals before sending
```

---

## Session Persistence

### Resuming a Session

If a session was interrupted:

```
/bizdev-opportunity execute
```

This loads `.bizdev/prd.json` and continues from the last pending task.

### Viewing Progress

```bash
cat .bizdev/progress.txt
cat .bizdev/prd.json | jq '.summary'
```
"""
    
    return {
        "success": True,
        "session_id": session_id,
        "workflow": workflow,
        "config": {
            "transcript_folder_id": transcript_folder_id,
            "lookback_months": lookback_months,
            "draft_emails": draft_emails,
            "draft_proposals": draft_proposals,
            "email_score_threshold": email_score_threshold,
            "proposal_score_threshold": proposal_score_threshold
        }
    }


def resume_execution() -> Dict[str, Any]:
    """
    Resume execution from existing PRD.
    
    Loads .bizdev/prd.json and continues processing pending tasks.
    
    Returns:
        Workflow instructions for resuming
    """
    return {
        "success": True,
        "workflow": """
## Resume BizDev Execution

### Step 1: Load Existing PRD

```python
import json

# Read PRD
prd_content = Read(".bizdev/prd.json")
prd = json.loads(prd_content)

print(f"Session: Resuming")
print(f"Total Tasks: {prd['summary']['totalTasks']}")
print(f"Completed: {prd['summary']['passed']}")
print(f"Pending: {prd['summary']['pending']}")
```

### Step 2: Load Progress Context

```python
progress = Read(".bizdev/progress.txt")
# Review learnings from previous iterations
```

### Step 3: Continue Execution

Resume the main loop from Phase 2 of the iterative workflow.

```python
from prd_generator import get_next_task

task = get_next_task(prd)
if task:
    print(f"Next task: {task['id']} - {task['sourceName']}")
else:
    print("All tasks complete!")
```
"""
    }


# =============================================================================
# UPDATED SKILL ENTRY POINT
# =============================================================================

def run_skill_v2(
    command: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Enhanced entry point with iterative execution support.
    
    New Commands:
    - scan: Quick scan (original behavior)
    - scan-iterative: Full iterative scan with drafts
    - execute: Resume from existing PRD
    - process: Deep-dive single opportunity
    - evaluate: Evaluate existing draft
    - context: Search for contact context
    
    Original Commands:
    - report: Generate pipeline dashboard
    - detail: Get opportunity details
    - proposal: Prepare proposal for opportunity
    """
    commands = {
        # Original commands
        "scan": lambda: scan_all_sources(
            transcript_folder_id=kwargs.get("folder_id"),
            lookback_months=kwargs.get("lookback", 6),
            email_search_terms=kwargs.get("search_terms")
        ),
        "report": lambda: generate_pipeline_report(
            opportunities=kwargs.get("opportunities"),
            output_path=kwargs.get("output_path")
        ),
        "detail": lambda: get_opportunity_detail(
            opportunity_id=kwargs.get("opportunity_id", "")
        ),
        "proposal": lambda: prepare_proposal(
            opportunity_id=kwargs.get("opportunity_id", "")
        ),
        
        # New iterative commands
        "scan-iterative": lambda: run_iterative_scan(
            transcript_folder_id=kwargs.get("folder_id"),
            lookback_months=kwargs.get("lookback", 6),
            draft_emails=kwargs.get("draft_emails", True),
            draft_proposals=kwargs.get("draft_proposals", True),
            email_score_threshold=kwargs.get("email_threshold", 40),
            proposal_score_threshold=kwargs.get("proposal_threshold", 60)
        ),
        "scan-deep": lambda: generate_deep_scan_workflow(
            folder_id=kwargs.get("folder_id", ""),
            lookback_months=kwargs.get("lookback", 6)
        ),
        "execute": lambda: resume_execution(),
        "context": lambda: {
            "success": True,
            "workflow": f"""
## Contact Context Search

Search for email context about: {kwargs.get("contact_name", "Unknown")}

```python
from email_searcher import search_contact_emails_workflow

workflow = search_contact_emails_workflow(
    contact_name="{kwargs.get('contact_name', '')}",
    contact_email="{kwargs.get('contact_email', '')}",
    company="{kwargs.get('company', '')}"
)
```

Then execute the MCP commands in the workflow.
"""
        }
    }
    
    if command not in commands:
        return {
            "success": False,
            "error": f"Unknown command: {command}",
            "available_commands": list(commands.keys()),
            "instructions": QUICK_START_V2
        }
    
    try:
        return commands[command]()
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "command": command
        }


# =============================================================================
# QUICK START WORKFLOW (Updated)
# =============================================================================

QUICK_START = """
## BizDev Opportunity Intelligence - Quick Start

### 1. Configure Data Sources

Set your transcript folder ID:
```
/bizdev-opportunity scan --folder-id YOUR_GOOGLE_DRIVE_FOLDER_ID
```

### 2. Run Analysis

Follow the workflow instructions to:
- Scan transcripts from Google Drive
- Search emails via Gmail MCP
- Extract and score opportunities

### 3. Generate Dashboard

Create a visual pipeline view:
```
/bizdev-opportunity report
```

### 4. Take Action

For any opportunity:
- View details: `/bizdev-opportunity detail <id>`
- Create proposal: `/bizdev-opportunity proposal <id>`

### Key Files

- `SKILL.md` - Full documentation
- `types.py` - Data structures
- `prompts.py` - LLM prompt templates
- `analyzer.py` - Scoring and classification
- `dashboard.py` - HTML generation
- `proposal_bridge.py` - Proposal integration

### MCP Servers Required

- `google-drive` - For transcript access
- `gmail` - For email scanning

Ensure these are configured in `.mcp.json`.
"""


QUICK_START_V2 = """
## BizDev Opportunity Intelligence (v2 - Iterative)

### Quick Commands

**Deep Iterative Scan (Haiku 4.5 - RECOMMENDED):**
```
/bizdev-opportunity scan-deep --folder-id YOUR_FOLDER_ID --lookback 6
```
Uses Claude 3.5 Haiku for each transcript with quality gates and refinement.

**Full Iterative Scan (with drafts):**
```
/bizdev-opportunity scan-iterative --folder-id YOUR_FOLDER_ID --lookback 6
```

**Resume Execution:**
```
/bizdev-opportunity execute
```

**Quick Scan (original):**
```
/bizdev-opportunity scan --folder-id YOUR_FOLDER_ID
```

**Generate Dashboard:**
```
/bizdev-opportunity report
```

**Search Contact Context:**
```
/bizdev-opportunity context "Dr. Smith" --email james@smith.com
```

### Iterative Features

- **Quality Gates**: Every output evaluated against criteria
- **Iteration**: Failed drafts refined up to 3 times
- **Email Search**: Prior context discovered automatically
- **Audit Logs**: Every action logged in changelogs
- **Learning**: Patterns compound in progress.txt

### Key Files

- `SKILL.md` - Full documentation
- `prd_generator.py` - Task generation (Ralph-style)
- `quality_gates.py` - Evaluation criteria
- `email_drafter.py` - Email generation
- `email_searcher.py` - Gmail context search
- `context_loader.py` - NGM context aggregation
- `subagents.py` - Fresh-context delegation
- `fast_llm_client.py` - Haiku 4.5 API client
- `iterative_scanner.py` - Deep scan execution loop

### Session Files

- `.bizdev/prd.json` - Current PRD state
- `.bizdev/progress.txt` - Learnings and patterns
- `.bizdev/drafts/emails/` - Generated email drafts
- `.bizdev/drafts/proposals/` - Generated proposals
- `.bizdev/iteration_logs/` - Per-transcript scan logs
"""


# =============================================================================
# DEEP SCAN WITH HAIKU 4.5
# =============================================================================

def run_deep_scan(
    transcripts: list,
    api_key: str = None
) -> Dict[str, Any]:
    """
    Execute deep iterative scan using Haiku 4.5.
    
    Each transcript is analyzed with fresh LLM context, quality gates,
    and up to 3 refinement iterations.
    
    Args:
        transcripts: List of {id, name, text} dicts
        api_key: Optional Anthropic API key (uses env var if not provided)
        
    Returns:
        Summary dict with all opportunities
    """
    try:
        from .iterative_scanner import IterativeScanner
    except ImportError:
        return {
            "success": False,
            "error": "iterative_scanner module not available",
            "instructions": "Ensure iterative_scanner.py is in the skill directory"
        }
    
    scanner = IterativeScanner(api_key)
    return scanner.scan_all(transcripts)


def generate_deep_scan_workflow(
    folder_id: str,
    lookback_months: int = 6
) -> Dict[str, Any]:
    """
    Generate workflow instructions for deep scan.
    
    This is called when user invokes scan-deep command.
    The actual scanning requires:
    1. Downloading transcripts from Google Drive
    2. Extracting text from PDFs
    3. Running iterative scanner
    """
    workflow = f"""
## Deep Iterative Scan Workflow (Haiku 4.5)

This workflow uses Claude 3.5 Haiku to analyze each transcript with:
- Fresh context (no bias between transcripts)
- Quality gates (exact quotes, proper names, reasoning)
- Up to 3 refinement iterations per transcript

### Prerequisites

1. **ANTHROPIC_API_KEY** environment variable must be set
2. Transcripts must be downloaded and converted to text

### Step 1: Download Transcripts

```python
# Use Google Drive MCP to list and download files
from mcp__google-drive import list_files, export_google_doc

files = list_files(folder_id="{folder_id}")
# Filter to last {lookback_months} months
# Download each file
```

### Step 2: Extract Text from PDFs

```python
from PyPDF2 import PdfReader

transcripts = []
for file in downloaded_files:
    reader = PdfReader(file.path)
    text = "".join(page.extract_text() for page in reader.pages)
    transcripts.append({{
        "id": file.id,
        "name": file.name,
        "text": text
    }})
```

### Step 3: Run Iterative Scanner

```python
from iterative_scanner import IterativeScanner

scanner = IterativeScanner()  # Uses ANTHROPIC_API_KEY env var

# Process all transcripts
summary = scanner.scan_all(transcripts)

print(f"Opportunities found: {{summary['total_opportunities']}}")
print(f"Tokens used: {{summary['total_tokens_used']}}")
print(f"Estimated cost: ${{summary['estimated_cost_usd']:.4f}}")
```

### Step 4: Review Results

Results saved to:
- `.bizdev/scan_summary_<session_id>.json` - Full summary
- `.bizdev/opportunities.json` - Extracted opportunities
- `.bizdev/iteration_logs/session_<id>.jsonl` - Per-transcript logs

### Cost Estimate

- ~$0.01-0.02 per transcript
- ~$1.50-3.00 for 150 transcripts

### Configuration

- Folder ID: {folder_id}
- Lookback: {lookback_months} months
- Model: claude-3-5-haiku-20241022
- Max iterations per transcript: 3
"""
    
    return {
        "success": True,
        "workflow": workflow,
        "config": {
            "folder_id": folder_id,
            "lookback_months": lookback_months,
            "model": "claude-3-5-haiku-20241022"
        }
    }
