"""
Unified Task Streams - Multi-stream task aggregator for Command Center

Aggregates tasks from THREE distinct streams into one unified view:

1. PERSONAL   - Motion calendar, Julie's Slack priorities, family/admin tasks
2. PRODUCT    - Dev tasks, PRDs, repo issues, weekly team meeting actions
3. PROFESSIONAL - BizDev pipeline actions, admin meetings, professional development

Each stream has its own sources, extraction patterns, and staleness thresholds.
The Command Center orchestrates all three for comprehensive visibility.
"""

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from enum import Enum


# =============================================================================
# TASK STREAM TYPES
# =============================================================================

class TaskStream(str, Enum):
    """The three operational streams."""
    PERSONAL = "personal"
    PRODUCT = "product"
    PROFESSIONAL = "professional"


class TaskPriority(str, Enum):
    """Priority levels."""
    CRITICAL = "critical"    # Do today
    HIGH = "high"            # This week
    MEDIUM = "medium"        # This sprint
    LOW = "low"              # Backlog


class TaskSource(str, Enum):
    """Where the task was extracted from."""
    MOTION_RECAP = "motion_recap"
    SLACK_MESSAGE = "slack_message"
    EMAIL_THREAD = "email_thread"
    MEETING_TRANSCRIPT = "meeting_transcript"
    REPO_ISSUE = "repo_issue"
    MANUAL_ENTRY = "manual_entry"
    BIZDEV_PIPELINE = "bizdev_pipeline"
    DAILY_ACTIONS = "daily_actions"


class TaskStatus(str, Enum):
    """Task lifecycle status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    DEFERRED = "deferred"


# =============================================================================
# TASK ITEM
# =============================================================================

@dataclass
class StreamTask:
    """
    A task item belonging to one of the three streams.

    Each task tracks its origin, owner, and staleness.
    """
    id: str
    title: str
    stream: TaskStream
    source: TaskSource
    priority: TaskPriority
    status: TaskStatus
    owner: str = ""                          # jeff, julie, ayen, anant, unassigned
    description: str = ""
    created_at: str = ""                     # ISO timestamp
    due_date: Optional[str] = None           # ISO date (YYYY-MM-DD)
    completed_at: Optional[str] = None
    source_id: Optional[str] = None          # Reference to source (thread ID, file ID, etc.)
    source_snippet: Optional[str] = None     # Brief excerpt from source
    related_opportunity_id: Optional[str] = None  # Link to bizdev opportunity
    related_draft_path: Optional[str] = None      # Link to draft file
    tags: List[str] = field(default_factory=list)
    blocked_reason: Optional[str] = None
    notes: str = ""

    @property
    def days_since_created(self) -> int:
        if not self.created_at:
            return 0
        try:
            created = datetime.fromisoformat(self.created_at.replace("Z", "+00:00"))
            return (datetime.now(created.tzinfo) - created).days
        except (ValueError, TypeError):
            return 0

    @property
    def is_stale(self) -> bool:
        """A task is stale if pending/in_progress for too long."""
        if self.status in (TaskStatus.COMPLETED, TaskStatus.DEFERRED):
            return False
        thresholds = {
            TaskPriority.CRITICAL: 1,
            TaskPriority.HIGH: 7,
            TaskPriority.MEDIUM: 14,
            TaskPriority.LOW: 30,
        }
        return self.days_since_created > thresholds.get(self.priority, 14)

    @property
    def is_overdue(self) -> bool:
        if not self.due_date:
            return False
        try:
            due = datetime.strptime(self.due_date, "%Y-%m-%d")
            return datetime.now() > due and self.status not in (
                TaskStatus.COMPLETED, TaskStatus.DEFERRED
            )
        except (ValueError, TypeError):
            return False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "stream": self.stream.value,
            "source": self.source.value,
            "priority": self.priority.value,
            "status": self.status.value,
            "owner": self.owner,
            "description": self.description,
            "createdAt": self.created_at,
            "dueDate": self.due_date,
            "completedAt": self.completed_at,
            "sourceId": self.source_id,
            "sourceSnippet": self.source_snippet,
            "relatedOpportunityId": self.related_opportunity_id,
            "relatedDraftPath": self.related_draft_path,
            "tags": self.tags,
            "blockedReason": self.blocked_reason,
            "notes": self.notes,
            "daysSinceCreated": self.days_since_created,
            "isStale": self.is_stale,
            "isOverdue": self.is_overdue,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StreamTask":
        return cls(
            id=data["id"],
            title=data["title"],
            stream=TaskStream(data["stream"]),
            source=TaskSource(data["source"]),
            priority=TaskPriority(data["priority"]),
            status=TaskStatus(data["status"]),
            owner=data.get("owner", ""),
            description=data.get("description", ""),
            created_at=data.get("createdAt", ""),
            due_date=data.get("dueDate"),
            completed_at=data.get("completedAt"),
            source_id=data.get("sourceId"),
            source_snippet=data.get("sourceSnippet"),
            related_opportunity_id=data.get("relatedOpportunityId"),
            related_draft_path=data.get("relatedDraftPath"),
            tags=data.get("tags", []),
            blocked_reason=data.get("blockedReason"),
            notes=data.get("notes", ""),
        )


# =============================================================================
# STREAM CONFIGURATION
# =============================================================================

STREAM_CONFIG = {
    TaskStream.PERSONAL: {
        "display_name": "Personal & Admin",
        "color": "#22c55e",  # green
        "default_owner": "anant",
        "sources": [
            TaskSource.SLACK_MESSAGE,      # Julie's daily priorities
            TaskSource.MOTION_RECAP,       # Personal meetings
            TaskSource.MANUAL_ENTRY,
        ],
        "stale_days": 7,
        "extraction_patterns": {
            "slack": [
                "library books", "itinerary", "camp", "babysitter",
                "prenatal", "shades", "tax forms", "fingerprinting",
                "livescan", "insurance", "dentist", "doctor",
                "school", "birthday", "appointment", "pharmacy",
            ],
            "motion": [
                "compound planning", "family", "personal",
                "vacation", "trip", "home",
            ],
        },
        "example_tasks": [
            "Return Leela's overdue library books",
            "Finalize Hawaii trip itinerary",
            "Coordinate prenatal massage for Nithya",
            "Complete Superpower tax forms",
            "IMLCC fingerprinting / LiveScan",
        ],
    },
    TaskStream.PRODUCT: {
        "display_name": "Product & Engineering",
        "color": "#a855f7",  # purple
        "default_owner": "jeff",
        "sources": [
            TaskSource.MOTION_RECAP,       # Weekly team meetings
            TaskSource.SLACK_MESSAGE,       # #product, #dev channels
            TaskSource.REPO_ISSUE,         # GitHub issues
            TaskSource.MANUAL_ENTRY,
        ],
        "stale_days": 14,
        "extraction_patterns": {
            "slack_channels": ["#product", "#dev", "#ngm-partnership"],
            "motion_keywords": [
                "Weekly Team", "AI Working Session", "Sprint",
                "Albert", "Sarthak", "Jeph", "Markus",
            ],
            "task_keywords": [
                "build", "launch", "deploy", "fix", "implement",
                "design", "review", "test", "migrate", "refactor",
                "API", "database", "frontend", "backend", "bot",
                "directory", "platform", "feature",
            ],
        },
        "owners": {
            "jeff": "Product & Strategy",
            "ayen": "Engineering",
            "julie": "Backend & Transcripts",
            "albert": "AI/ML",
            "sarthak": "Frontend",
        },
        "example_tasks": [
            "Build Claude/Moldbot in Slack",
            "Launch conference site and directory listing",
            "Upload educational sessions to platform",
            "Implement Welldercare API integration",
        ],
    },
    TaskStream.PROFESSIONAL: {
        "display_name": "BizDev & Professional",
        "color": "#c5a572",  # gold (NGM brand)
        "default_owner": "anant",
        "sources": [
            TaskSource.BIZDEV_PIPELINE,     # Opportunity actions
            TaskSource.DAILY_ACTIONS,       # Priority action list
            TaskSource.EMAIL_THREAD,        # Professional emails
            TaskSource.MEETING_TRANSCRIPT,  # External meetings
            TaskSource.MOTION_RECAP,        # Sales meetings
            TaskSource.MANUAL_ENTRY,
        ],
        "stale_days": 14,
        "extraction_patterns": {
            "motion_keywords": [
                "follow up", "proposal", "demo", "partnership",
                "sponsor", "investor", "advisory",
            ],
        },
        "example_tasks": [
            "Send proposal to Larry Siegel (Yunique Medical)",
            "Follow up with INEXION demo request",
            "Draft commons partnership for HuMann",
            "Schedule Welldercare API walkthrough",
        ],
    },
}


# =============================================================================
# UNIFIED TASK STORE
# =============================================================================

TASK_STORE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "command-center", "unified_tasks.json"
)


class UnifiedTaskStore:
    """
    Persistent store for all tasks across all three streams.

    Provides filtering, querying, and analytics across streams.
    """

    def __init__(self):
        self.tasks: Dict[str, StreamTask] = {}
        self._next_id_counter: int = 1
        self.last_sync: Dict[str, str] = {}  # stream -> ISO timestamp

    def _generate_id(self, stream: TaskStream) -> str:
        """Generate a unique task ID."""
        prefix = {
            TaskStream.PERSONAL: "per",
            TaskStream.PRODUCT: "prod",
            TaskStream.PROFESSIONAL: "prof",
        }[stream]
        task_id = f"{prefix}-{self._next_id_counter:04d}"
        self._next_id_counter += 1
        return task_id

    # -------------------------------------------------------------------------
    # CRUD Operations
    # -------------------------------------------------------------------------

    def add_task(
        self,
        title: str,
        stream: TaskStream,
        source: TaskSource,
        priority: TaskPriority = TaskPriority.MEDIUM,
        owner: str = "",
        description: str = "",
        due_date: Optional[str] = None,
        source_id: Optional[str] = None,
        source_snippet: Optional[str] = None,
        related_opportunity_id: Optional[str] = None,
        tags: List[str] = None,
    ) -> StreamTask:
        """Add a new task to the store."""
        if not owner:
            owner = STREAM_CONFIG[stream]["default_owner"]

        task = StreamTask(
            id=self._generate_id(stream),
            title=title,
            stream=stream,
            source=source,
            priority=priority,
            status=TaskStatus.PENDING,
            owner=owner,
            description=description,
            created_at=datetime.utcnow().isoformat(),
            due_date=due_date,
            source_id=source_id,
            source_snippet=source_snippet,
            related_opportunity_id=related_opportunity_id,
            tags=tags or [],
        )

        self.tasks[task.id] = task
        return task

    def complete_task(self, task_id: str) -> Optional[StreamTask]:
        """Mark a task as completed."""
        task = self.tasks.get(task_id)
        if task:
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.utcnow().isoformat()
        return task

    def update_task(self, task_id: str, **kwargs) -> Optional[StreamTask]:
        """Update task fields."""
        task = self.tasks.get(task_id)
        if not task:
            return None
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)
        return task

    def get_task(self, task_id: str) -> Optional[StreamTask]:
        """Get a task by ID."""
        return self.tasks.get(task_id)

    # -------------------------------------------------------------------------
    # Querying
    # -------------------------------------------------------------------------

    def get_by_stream(self, stream: TaskStream, active_only: bool = True) -> List[StreamTask]:
        """Get all tasks in a stream."""
        tasks = [t for t in self.tasks.values() if t.stream == stream]
        if active_only:
            tasks = [t for t in tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.DEFERRED)]
        return sorted(tasks, key=lambda t: (
            {"critical": 0, "high": 1, "medium": 2, "low": 3}[t.priority.value],
            t.created_at or ""
        ))

    def get_by_owner(self, owner: str, active_only: bool = True) -> List[StreamTask]:
        """Get all tasks assigned to an owner."""
        tasks = [t for t in self.tasks.values() if t.owner == owner]
        if active_only:
            tasks = [t for t in tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.DEFERRED)]
        return sorted(tasks, key=lambda t: (
            {"critical": 0, "high": 1, "medium": 2, "low": 3}[t.priority.value],
            t.created_at or ""
        ))

    def get_stale_tasks(self) -> List[StreamTask]:
        """Get all stale tasks across streams."""
        return [t for t in self.tasks.values() if t.is_stale]

    def get_overdue_tasks(self) -> List[StreamTask]:
        """Get all overdue tasks across streams."""
        return [t for t in self.tasks.values() if t.is_overdue]

    def get_today_actions(self) -> List[StreamTask]:
        """Get critical + overdue tasks = today's action list."""
        return sorted(
            [
                t for t in self.tasks.values()
                if t.status not in (TaskStatus.COMPLETED, TaskStatus.DEFERRED)
                and (t.priority == TaskPriority.CRITICAL or t.is_overdue or t.is_stale)
            ],
            key=lambda t: (
                0 if t.is_overdue else (1 if t.priority == TaskPriority.CRITICAL else 2),
                t.created_at or ""
            )
        )

    def find_duplicates(self, title: str, stream: TaskStream) -> List[StreamTask]:
        """Check for potential duplicate tasks by fuzzy title match."""
        title_lower = title.lower().strip()
        keywords = set(title_lower.split())
        candidates = []
        for task in self.tasks.values():
            if task.stream != stream or task.status == TaskStatus.COMPLETED:
                continue
            task_keywords = set(task.title.lower().split())
            overlap = keywords & task_keywords
            if len(overlap) >= max(2, len(keywords) // 2):
                candidates.append(task)
        return candidates

    # -------------------------------------------------------------------------
    # Analytics
    # -------------------------------------------------------------------------

    def get_stream_summary(self) -> Dict[str, Any]:
        """Summary statistics per stream."""
        summary = {}
        for stream in TaskStream:
            tasks = [t for t in self.tasks.values() if t.stream == stream]
            active = [t for t in tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.DEFERRED)]
            summary[stream.value] = {
                "display_name": STREAM_CONFIG[stream]["display_name"],
                "color": STREAM_CONFIG[stream]["color"],
                "total": len(tasks),
                "active": len(active),
                "completed": len([t for t in tasks if t.status == TaskStatus.COMPLETED]),
                "stale": len([t for t in active if t.is_stale]),
                "overdue": len([t for t in active if t.is_overdue]),
                "by_priority": {
                    p.value: len([t for t in active if t.priority == p])
                    for p in TaskPriority
                },
                "by_owner": {},
            }
            # Count by owner
            for task in active:
                owner = task.owner or "unassigned"
                summary[stream.value]["by_owner"][owner] = (
                    summary[stream.value]["by_owner"].get(owner, 0) + 1
                )
        return summary

    def get_global_summary(self) -> Dict[str, Any]:
        """Global summary across all streams."""
        all_tasks = list(self.tasks.values())
        active = [t for t in all_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.DEFERRED)]

        return {
            "total_tasks": len(all_tasks),
            "active_tasks": len(active),
            "completed_tasks": len([t for t in all_tasks if t.status == TaskStatus.COMPLETED]),
            "stale_tasks": len([t for t in active if t.is_stale]),
            "overdue_tasks": len([t for t in active if t.is_overdue]),
            "today_actions": len(self.get_today_actions()),
            "streams": self.get_stream_summary(),
            "last_sync": self.last_sync,
        }

    # -------------------------------------------------------------------------
    # Import from Existing Data
    # -------------------------------------------------------------------------

    def import_from_bizdev_pipeline(
        self,
        opportunities: List[Dict[str, Any]],
        daily_actions: Optional[List[Dict[str, Any]]] = None
    ) -> int:
        """
        Import professional tasks from bizdev opportunity pipeline.

        Creates tasks from high-priority opportunities that need follow-up.
        """
        imported = 0
        for opp in opportunities:
            status = opp.get("status", "")
            priority_score = opp.get("priorityScore", 0)

            # Only import actionable opportunities
            if status in ("closed",) or priority_score < 50:
                continue

            contact_name = opp.get("contact", {}).get("name", "Unknown")
            company = opp.get("contact", {}).get("company", "")
            opp_type = opp.get("opportunityType", "consulting")
            opp_id = opp.get("id", "")

            # Determine priority from pipeline
            if priority_score >= 85 or status == "stale":
                priority = TaskPriority.CRITICAL
            elif priority_score >= 70 or status == "needs_followup":
                priority = TaskPriority.HIGH
            elif priority_score >= 50:
                priority = TaskPriority.MEDIUM
            else:
                priority = TaskPriority.LOW

            # Check for duplicates
            title = f"Follow up with {contact_name}" + (f" ({company})" if company else "")
            if self.find_duplicates(title, TaskStream.PROFESSIONAL):
                continue

            self.add_task(
                title=title,
                stream=TaskStream.PROFESSIONAL,
                source=TaskSource.BIZDEV_PIPELINE,
                priority=priority,
                description=f"{opp_type.replace('_', ' ').title()} opportunity - Priority: {priority_score}",
                related_opportunity_id=opp_id,
                tags=[opp_type, status or "active"],
            )
            imported += 1

        self.last_sync["professional_bizdev"] = datetime.utcnow().isoformat()
        return imported

    def import_from_motion_recaps(self, recaps: List[Dict[str, Any]]) -> int:
        """
        Import tasks from Motion meeting recaps.

        Categorizes each recap into the appropriate stream.
        """
        imported = 0
        for recap in recaps:
            category = recap.get("category", "sales_bizdev")
            action_items = recap.get("action_items", [])
            meeting_title = recap.get("title", "")
            meeting_date = recap.get("date", "")

            # Determine stream
            if category == "personal_admin":
                stream = TaskStream.PERSONAL
            elif category == "product_work":
                stream = TaskStream.PRODUCT
            else:
                stream = TaskStream.PROFESSIONAL

            for action in action_items:
                action_text = action if isinstance(action, str) else action.get("text", "")
                if not action_text:
                    continue

                # Check for duplicates
                if self.find_duplicates(action_text, stream):
                    continue

                self.add_task(
                    title=action_text,
                    stream=stream,
                    source=TaskSource.MOTION_RECAP,
                    priority=TaskPriority.MEDIUM,
                    source_snippet=f"From: {meeting_title} ({meeting_date})",
                    tags=["motion_recap", category],
                )
                imported += 1

        self.last_sync["motion_recaps"] = datetime.utcnow().isoformat()
        return imported

    def import_from_slack_tasks(self, tasks: List[Dict[str, Any]]) -> int:
        """
        Import tasks extracted from Slack messages.

        Handles Julie's daily priorities (personal) and team channels (product).
        """
        imported = 0
        for task in tasks:
            title = task.get("title", task.get("text", ""))
            if not title:
                continue

            category = task.get("category", "product")
            owner = task.get("owner", "")
            channel = task.get("channel", "")

            # Determine stream from category
            if category == "personal_admin":
                stream = TaskStream.PERSONAL
            elif category in ("product", "engineering", "backend"):
                stream = TaskStream.PRODUCT
            else:
                stream = TaskStream.PROFESSIONAL

            # Determine priority
            priority_str = task.get("priority", "medium").lower()
            priority = {
                "high": TaskPriority.HIGH,
                "critical": TaskPriority.CRITICAL,
                "low": TaskPriority.LOW,
            }.get(priority_str, TaskPriority.MEDIUM)

            # Check for duplicates
            if self.find_duplicates(title, stream):
                continue

            self.add_task(
                title=title,
                stream=stream,
                source=TaskSource.SLACK_MESSAGE,
                priority=priority,
                owner=owner,
                source_id=task.get("message_ts"),
                source_snippet=f"#{channel}" if channel else "",
                tags=["slack", category],
            )
            imported += 1

        self.last_sync["slack"] = datetime.utcnow().isoformat()
        return imported

    # -------------------------------------------------------------------------
    # Persistence
    # -------------------------------------------------------------------------

    def save(self):
        """Save task store to disk."""
        os.makedirs(os.path.dirname(TASK_STORE_PATH), exist_ok=True)

        data = {
            "metadata": {
                "schema_version": "1.0.0",
                "updated_at": datetime.utcnow().isoformat(),
                "task_count": len(self.tasks),
                "next_id_counter": self._next_id_counter,
            },
            "last_sync": self.last_sync,
            "tasks": [t.to_dict() for t in self.tasks.values()],
        }

        with open(TASK_STORE_PATH, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load(cls) -> "UnifiedTaskStore":
        """Load task store from disk."""
        store = cls()

        if not os.path.exists(TASK_STORE_PATH):
            return store

        try:
            with open(TASK_STORE_PATH, "r") as f:
                data = json.load(f)

            store._next_id_counter = data.get("metadata", {}).get("next_id_counter", 1)
            store.last_sync = data.get("last_sync", {})

            for task_data in data.get("tasks", []):
                try:
                    task = StreamTask.from_dict(task_data)
                    store.tasks[task.id] = task
                    # Update counter to avoid ID collisions
                    try:
                        num = int(task.id.split("-")[-1])
                        if num >= store._next_id_counter:
                            store._next_id_counter = num + 1
                    except (ValueError, IndexError):
                        pass
                except (KeyError, ValueError):
                    continue

        except (json.JSONDecodeError, KeyError):
            pass

        return store


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def get_unified_dashboard_data() -> Dict[str, Any]:
    """
    Get all data needed for a unified dashboard view.

    Returns task summaries for all three streams plus today's actions.
    """
    store = UnifiedTaskStore.load()

    return {
        "global_summary": store.get_global_summary(),
        "today_actions": [t.to_dict() for t in store.get_today_actions()],
        "stale_tasks": [t.to_dict() for t in store.get_stale_tasks()],
        "overdue_tasks": [t.to_dict() for t in store.get_overdue_tasks()],
        "personal_tasks": [t.to_dict() for t in store.get_by_stream(TaskStream.PERSONAL)],
        "product_tasks": [t.to_dict() for t in store.get_by_stream(TaskStream.PRODUCT)],
        "professional_tasks": [t.to_dict() for t in store.get_by_stream(TaskStream.PROFESSIONAL)],
    }


def quick_task_count() -> Dict[str, int]:
    """Quick count of active tasks per stream."""
    store = UnifiedTaskStore.load()
    return {
        stream.value: len(store.get_by_stream(stream, active_only=True))
        for stream in TaskStream
    }
