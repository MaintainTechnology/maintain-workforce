"""
PRD Generator for BizDev Opportunity Intelligence

Generates a PRD (Product Requirements Document) with tasks for processing
opportunity sources. Follows the Ralph pattern of iterative task execution.

Functions:
1. generate_prd: Create PRD from input sources
2. create_task: Create individual task entries
3. initialize_tracking: Set up progress.txt and prd.json
4. update_task_status: Update task completion status
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import uuid


# =============================================================================
# TASK STATUS DEFINITIONS
# =============================================================================

class TaskStatus:
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"
    SKIPPED = "skipped"


class TaskType:
    SCAN_TRANSCRIPT = "scan_transcript"
    SCAN_EMAIL = "scan_email"
    DRAFT_EMAIL = "draft_email"
    DRAFT_PROPOSAL = "draft_proposal"
    EVALUATE_OUTPUT = "evaluate_output"


# =============================================================================
# PRD STRUCTURE
# =============================================================================

PRD_TEMPLATE = {
    "version": "1.0",
    "skill": "bizdev-opportunity",
    "createdAt": "",
    "updatedAt": "",
    "config": {
        "maxIterations": 50,
        "maxFailuresPerTask": 3,
        "draftEmails": True,
        "draftProposals": True,
        "emailScoreThreshold": 40,
        "proposalScoreThreshold": 60,
        "lookbackMonths": 6
    },
    "sources": {
        "transcriptFolderId": None,
        "emailSearchTerms": [],
        "transcriptFiles": [],
        "emailThreads": []
    },
    "tasks": [],
    "summary": {
        "totalTasks": 0,
        "pending": 0,
        "inProgress": 0,
        "passed": 0,
        "failed": 0,
        "blocked": 0,
        "skipped": 0,
        "iterationsRun": 0
    }
}


# =============================================================================
# TASK CREATION
# =============================================================================

def create_task(
    task_type: str,
    source_id: str,
    source_name: str,
    source_type: str,
    priority: int = 1,
    depends_on: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create a single task entry for the PRD.
    
    Args:
        task_type: Type of task (scan_transcript, draft_email, etc.)
        source_id: ID of the source (file ID, email ID)
        source_name: Human-readable source name
        source_type: transcript or email
        priority: Task priority (lower = higher priority)
        depends_on: List of task IDs this depends on
        metadata: Additional task-specific data
        
    Returns:
        Task dictionary
    """
    task_id = f"T-{uuid.uuid4().hex[:8].upper()}"
    
    return {
        "id": task_id,
        "type": task_type,
        "sourceId": source_id,
        "sourceName": source_name,
        "sourceType": source_type,
        "priority": priority,
        "status": TaskStatus.PENDING,
        "dependsOn": depends_on or [],
        "metadata": metadata or {},
        "attempts": 0,
        "maxAttempts": 3,
        "createdAt": datetime.now().isoformat(),
        "startedAt": None,
        "completedAt": None,
        "result": None,
        "error": None,
        "qualityGates": {
            "passed": [],
            "failed": []
        }
    }


def create_scan_task(
    source_id: str,
    source_name: str,
    source_type: str,  # "transcript" or "email"
    priority: int = 1
) -> Dict[str, Any]:
    """Create a scanning task for a transcript or email."""
    task_type = TaskType.SCAN_TRANSCRIPT if source_type == "transcript" else TaskType.SCAN_EMAIL
    return create_task(
        task_type=task_type,
        source_id=source_id,
        source_name=source_name,
        source_type=source_type,
        priority=priority
    )


def create_draft_email_task(
    opportunity_id: str,
    contact_name: str,
    scan_task_id: str,
    priority: int = 2
) -> Dict[str, Any]:
    """Create an email drafting task."""
    return create_task(
        task_type=TaskType.DRAFT_EMAIL,
        source_id=opportunity_id,
        source_name=f"Email draft for {contact_name}",
        source_type="opportunity",
        priority=priority,
        depends_on=[scan_task_id],
        metadata={"opportunityId": opportunity_id, "contactName": contact_name}
    )


def create_draft_proposal_task(
    opportunity_id: str,
    contact_name: str,
    company: str,
    scan_task_id: str,
    priority: int = 3
) -> Dict[str, Any]:
    """Create a proposal drafting task."""
    return create_task(
        task_type=TaskType.DRAFT_PROPOSAL,
        source_id=opportunity_id,
        source_name=f"Proposal for {company or contact_name}",
        source_type="opportunity",
        priority=priority,
        depends_on=[scan_task_id],
        metadata={
            "opportunityId": opportunity_id,
            "contactName": contact_name,
            "company": company
        }
    )


# =============================================================================
# PRD GENERATION
# =============================================================================

def generate_prd(
    transcript_folder_id: Optional[str] = None,
    transcript_files: Optional[List[Dict[str, str]]] = None,
    email_threads: Optional[List[Dict[str, str]]] = None,
    email_search_terms: Optional[List[str]] = None,
    lookback_months: int = 6,
    draft_emails: bool = True,
    draft_proposals: bool = True,
    email_score_threshold: int = 40,
    proposal_score_threshold: int = 60
) -> Dict[str, Any]:
    """
    Generate a PRD with tasks for all sources.
    
    Args:
        transcript_folder_id: Google Drive folder ID for transcripts
        transcript_files: List of {id, name, modifiedTime} for transcript files
        email_threads: List of {id, subject, participants} for email threads
        email_search_terms: Search terms used for email discovery
        lookback_months: How many months to look back
        draft_emails: Whether to create email drafting tasks
        draft_proposals: Whether to create proposal drafting tasks
        email_score_threshold: Min score for email drafts
        proposal_score_threshold: Min score for proposal drafts
        
    Returns:
        Complete PRD dictionary
    """
    prd = PRD_TEMPLATE.copy()
    prd["createdAt"] = datetime.now().isoformat()
    prd["updatedAt"] = datetime.now().isoformat()
    
    # Update config
    prd["config"]["lookbackMonths"] = lookback_months
    prd["config"]["draftEmails"] = draft_emails
    prd["config"]["draftProposals"] = draft_proposals
    prd["config"]["emailScoreThreshold"] = email_score_threshold
    prd["config"]["proposalScoreThreshold"] = proposal_score_threshold
    
    # Store sources
    prd["sources"]["transcriptFolderId"] = transcript_folder_id
    prd["sources"]["emailSearchTerms"] = email_search_terms or []
    prd["sources"]["transcriptFiles"] = transcript_files or []
    prd["sources"]["emailThreads"] = email_threads or []
    
    tasks = []
    priority = 1
    
    # Create scan tasks for transcripts
    for file_info in (transcript_files or []):
        task = create_scan_task(
            source_id=file_info.get("id", ""),
            source_name=file_info.get("name", "Unknown"),
            source_type="transcript",
            priority=priority
        )
        tasks.append(task)
        priority += 1
    
    # Create scan tasks for email threads
    for thread_info in (email_threads or []):
        task = create_scan_task(
            source_id=thread_info.get("id", ""),
            source_name=thread_info.get("subject", "Email Thread"),
            source_type="email",
            priority=priority
        )
        tasks.append(task)
        priority += 1
    
    prd["tasks"] = tasks
    
    # Update summary
    prd["summary"]["totalTasks"] = len(tasks)
    prd["summary"]["pending"] = len(tasks)
    
    return prd


# =============================================================================
# TASK STATUS MANAGEMENT
# =============================================================================

def update_task_status(
    prd: Dict[str, Any],
    task_id: str,
    status: str,
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    quality_gates: Optional[Dict[str, List[str]]] = None
) -> Dict[str, Any]:
    """
    Update the status of a task in the PRD.
    
    Args:
        prd: The PRD dictionary
        task_id: ID of the task to update
        status: New status
        result: Task result data (for passed tasks)
        error: Error message (for failed tasks)
        quality_gates: Quality gate results
        
    Returns:
        Updated PRD dictionary
    """
    for task in prd["tasks"]:
        if task["id"] == task_id:
            old_status = task["status"]
            task["status"] = status
            task["updatedAt"] = datetime.now().isoformat()
            
            if status == TaskStatus.IN_PROGRESS:
                task["startedAt"] = datetime.now().isoformat()
                task["attempts"] += 1
            elif status in [TaskStatus.PASSED, TaskStatus.FAILED, TaskStatus.BLOCKED]:
                task["completedAt"] = datetime.now().isoformat()
            
            if result:
                task["result"] = result
            if error:
                task["error"] = error
            if quality_gates:
                task["qualityGates"] = quality_gates
            
            # Update summary counts
            if old_status != status:
                if old_status == TaskStatus.PENDING:
                    prd["summary"]["pending"] -= 1
                elif old_status == TaskStatus.IN_PROGRESS:
                    prd["summary"]["inProgress"] -= 1
                
                if status == TaskStatus.IN_PROGRESS:
                    prd["summary"]["inProgress"] += 1
                elif status == TaskStatus.PASSED:
                    prd["summary"]["passed"] += 1
                elif status == TaskStatus.FAILED:
                    prd["summary"]["failed"] += 1
                elif status == TaskStatus.BLOCKED:
                    prd["summary"]["blocked"] += 1
                elif status == TaskStatus.SKIPPED:
                    prd["summary"]["skipped"] += 1
            
            break
    
    prd["updatedAt"] = datetime.now().isoformat()
    return prd


def get_next_task(prd: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Get the next pending task to execute.
    
    Returns highest-priority pending task whose dependencies are met.
    
    Args:
        prd: The PRD dictionary
        
    Returns:
        Next task to execute, or None if no tasks available
    """
    pending_tasks = [
        t for t in prd["tasks"]
        if t["status"] == TaskStatus.PENDING
    ]
    
    if not pending_tasks:
        return None
    
    # Sort by priority
    pending_tasks.sort(key=lambda t: t["priority"])
    
    # Find first task with all dependencies met
    completed_ids = {
        t["id"] for t in prd["tasks"]
        if t["status"] in [TaskStatus.PASSED, TaskStatus.SKIPPED]
    }
    
    for task in pending_tasks:
        deps = set(task.get("dependsOn", []))
        if deps.issubset(completed_ids):
            return task
    
    return None


def add_follow_up_tasks(
    prd: Dict[str, Any],
    scan_task_id: str,
    opportunity: Dict[str, Any],
    confidence_score: int
) -> Dict[str, Any]:
    """
    Add email and proposal drafting tasks based on scan results.
    
    Args:
        prd: The PRD dictionary
        scan_task_id: ID of the completed scan task
        opportunity: Discovered opportunity data
        confidence_score: Opportunity confidence score
        
    Returns:
        Updated PRD with new tasks
    """
    contact_name = opportunity.get("contact", {}).get("name", "Unknown")
    company = opportunity.get("contact", {}).get("company", "")
    opportunity_id = opportunity.get("id", f"opp-{uuid.uuid4().hex[:8]}")
    
    config = prd["config"]
    new_tasks = []
    
    # Add email draft task if score meets threshold
    if config["draftEmails"] and confidence_score >= config["emailScoreThreshold"]:
        email_task = create_draft_email_task(
            opportunity_id=opportunity_id,
            contact_name=contact_name,
            scan_task_id=scan_task_id,
            priority=100 + len(prd["tasks"])  # Lower priority than scans
        )
        new_tasks.append(email_task)
    
    # Add proposal task if score meets threshold
    if config["draftProposals"] and confidence_score >= config["proposalScoreThreshold"]:
        proposal_task = create_draft_proposal_task(
            opportunity_id=opportunity_id,
            contact_name=contact_name,
            company=company,
            scan_task_id=scan_task_id,
            priority=200 + len(prd["tasks"])  # Even lower priority
        )
        new_tasks.append(proposal_task)
    
    if new_tasks:
        prd["tasks"].extend(new_tasks)
        prd["summary"]["totalTasks"] += len(new_tasks)
        prd["summary"]["pending"] += len(new_tasks)
        prd["updatedAt"] = datetime.now().isoformat()
    
    return prd


# =============================================================================
# PROGRESS TRACKING
# =============================================================================

def generate_initial_progress() -> str:
    """
    Generate initial progress.txt content.
    
    Returns:
        Initial progress file content
    """
    return f"""================================================================================
BIZDEV OPPORTUNITY INTELLIGENCE - PROGRESS LOG
================================================================================

Session Started: {datetime.now().isoformat()}

================================================================================
CODEBASE PATTERNS (Consolidated)
================================================================================

Add discovered patterns here as you process opportunities:
- Pattern 1: [Add as discovered]
- Pattern 2: [Add as discovered]

================================================================================
OPPORTUNITY PATTERNS
================================================================================

Common signals by type:
- Consulting: [Add as discovered]
- Membership: [Add as discovered]
- Commons Partnership: [Add as discovered]

================================================================================
ITERATION LOG
================================================================================

"""


def format_iteration_log(
    iteration_num: int,
    task: Dict[str, Any],
    status: str,
    learnings: List[str],
    files_created: List[str],
    quality_gates: Dict[str, List[str]],
    opportunity_summary: Optional[str] = None
) -> str:
    """
    Format a single iteration log entry.
    
    Args:
        iteration_num: Iteration number
        task: The task that was processed
        status: Final status (PASSED, FAILED, etc.)
        learnings: List of learnings from this iteration
        files_created: List of files created
        quality_gates: Quality gate results
        opportunity_summary: Brief summary of opportunity found
        
    Returns:
        Formatted log entry string
    """
    entry = f"""
--- ITERATION {iteration_num} | {task['id']}: {task['sourceName']} ---
Timestamp: {datetime.now().isoformat()}
Task Type: {task['type']}
Status: {status}

"""
    
    if opportunity_summary:
        entry += f"""Opportunity Found:
{opportunity_summary}

"""
    
    if learnings:
        entry += "Learnings for future iterations:\n"
        for learning in learnings:
            entry += f"- {learning}\n"
        entry += "\n"
    
    if files_created:
        entry += "Files Created:\n"
        for file_path in files_created:
            entry += f"- {file_path}\n"
        entry += "\n"
    
    entry += "Quality Gates:\n"
    for gate in quality_gates.get("passed", []):
        entry += f"  ✓ {gate}: PASSED\n"
    for gate in quality_gates.get("failed", []):
        entry += f"  ✗ {gate}: FAILED\n"
    
    entry += "\n---\n"
    
    return entry


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

PRD_WORKFLOW = """
## PRD Generator Workflow

### Step 1: Initialize PRD

When starting a new bizdev scan session:

```python
from prd_generator import generate_prd

prd = generate_prd(
    transcript_folder_id="YOUR_FOLDER_ID",
    transcript_files=[
        {"id": "file1", "name": "Meeting-2026-01-10.docx"},
        {"id": "file2", "name": "Call-DrSmith.docx"}
    ],
    email_threads=[
        {"id": "thread1", "subject": "Re: Platform Demo"},
    ],
    lookback_months=6,
    draft_emails=True,
    draft_proposals=True
)

# Save to .bizdev/prd.json
```

### Step 2: Process Tasks

```python
from prd_generator import get_next_task, update_task_status, TaskStatus

while True:
    task = get_next_task(prd)
    if not task:
        break
    
    # Mark in progress
    prd = update_task_status(prd, task["id"], TaskStatus.IN_PROGRESS)
    
    # Execute task...
    result = execute_task(task)
    
    # Update status
    prd = update_task_status(
        prd, 
        task["id"], 
        TaskStatus.PASSED if result["success"] else TaskStatus.FAILED,
        result=result.get("data"),
        error=result.get("error")
    )
```

### Step 3: Add Follow-up Tasks

When an opportunity is discovered:

```python
from prd_generator import add_follow_up_tasks

prd = add_follow_up_tasks(
    prd,
    scan_task_id=task["id"],
    opportunity=discovered_opportunity,
    confidence_score=75
)
```

This automatically adds email and proposal tasks if thresholds are met.
"""
