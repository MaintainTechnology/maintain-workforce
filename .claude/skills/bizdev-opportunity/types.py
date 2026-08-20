"""
Type definitions for BizDev Opportunity Intelligence skill.

Defines dataclasses for opportunities, signals, and pipeline stages
used throughout the opportunity scanning and analysis workflow.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class OpportunityType(str, Enum):
    """Types of NGM service opportunities."""
    
    CONSULTING = "consulting"  # Strategy sessions, retainers, practice transformation ($2,500-$75,000)
    MEMBERSHIP = "membership"  # LIP platform subscriptions ($299-$599/month)
    REPORT_GENERATOR = "report_generator"  # AI lab report capability interest
    COMMONS_PARTNERSHIP = "commons_partnership"  # Vendor profiles ($5,000-$12,500/year)


class PipelineStage(str, Enum):
    """Pipeline stages for opportunity tracking."""
    
    DISCOVERED = "discovered"  # Initial signal detected
    QUALIFIED = "qualified"  # Verified interest and fit
    ENGAGED = "engaged"  # Active conversation ongoing
    PROPOSAL_SENT = "proposal_sent"  # Formal proposal delivered
    CLOSED_WON = "closed_won"  # Deal closed successfully
    CLOSED_LOST = "closed_lost"  # Deal lost or disqualified


class SignalType(str, Enum):
    """Types of opportunity signals detected in conversations."""
    
    EXPLICIT_INTEREST = "explicit_interest"  # Direct request or inquiry
    PAIN_POINT = "pain_point"  # Problem that NGM can solve
    BUDGET_MENTION = "budget_mention"  # Budget or pricing discussion
    TIMELINE_MENTION = "timeline_mention"  # Urgency or timeline reference
    COMPETITOR_MENTION = "competitor_mention"  # Mention of alternatives
    FOLLOW_UP_REQUEST = "follow_up_request"  # Request for more info
    DECISION_MAKER = "decision_maker"  # Indication of authority


class SourceType(str, Enum):
    """Source of the opportunity signal."""
    
    MEETING_TRANSCRIPT = "meeting_transcript"
    EMAIL = "email"
    LINKEDIN_DM = "linkedin_dm"
    MANUAL_ENTRY = "manual_entry"


@dataclass
class Signal:
    """
    A signal indicating opportunity potential.
    
    Captures evidence from transcripts or emails that suggests
    interest in NGM services.
    """
    
    type: SignalType
    content: str  # The actual text/quote containing the signal
    timestamp: str  # ISO timestamp of when signal was detected
    source_id: Optional[str] = None  # Reference to source document/email
    confidence: float = 0.5  # 0.0 to 1.0 confidence in signal
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "type": self.type.value,
            "content": self.content,
            "timestamp": self.timestamp,
            "sourceId": self.source_id,
            "confidence": self.confidence,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Signal":
        """Create Signal from dictionary."""
        return cls(
            type=SignalType(data["type"]),
            content=data["content"],
            timestamp=data["timestamp"],
            source_id=data.get("sourceId"),
            confidence=data.get("confidence", 0.5),
        )


@dataclass
class ContactInfo:
    """Contact information for an opportunity."""
    
    name: str
    email: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    linkedin_url: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {"name": self.name}
        if self.email:
            result["email"] = self.email
        if self.company:
            result["company"] = self.company
        if self.title:
            result["title"] = self.title
        if self.linkedin_url:
            result["linkedinUrl"] = self.linkedin_url
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContactInfo":
        """Create ContactInfo from dictionary."""
        return cls(
            name=data["name"],
            email=data.get("email"),
            company=data.get("company"),
            title=data.get("title"),
            linkedin_url=data.get("linkedinUrl"),
        )


@dataclass
class Opportunity:
    """
    A business development opportunity.
    
    Represents a potential client or partner identified from
    meeting transcripts or emails.
    """
    
    id: str  # Unique identifier
    contact: ContactInfo  # Contact information
    opportunity_type: OpportunityType  # Type of service interest
    stage: PipelineStage  # Current pipeline stage
    source: SourceType  # Where the opportunity was discovered
    source_id: str  # Reference to original source (file ID, email ID)
    signals: List[Signal]  # Evidence supporting the opportunity
    confidence_score: int  # 0-100 overall confidence
    discovered_at: str  # ISO timestamp of discovery
    last_activity: str  # ISO timestamp of most recent activity
    estimated_value: Optional[int] = None  # Estimated deal value in USD
    notes: Optional[str] = None  # Additional context
    proposal_id: Optional[str] = None  # Link to generated proposal
    # NEW: Enhanced tracking fields
    last_contact_date: Optional[str] = None  # Last communication date
    days_since_contact: int = 0  # Days since last communication
    contact_history: List["ContactEvent"] = field(default_factory=list)  # Communication timeline
    engagement_score: float = 0.0  # 0.0-1.0 engagement metric
    status: Optional["OpportunityStatus"] = None  # Current status based on communications
    last_outbound_date: Optional[str] = None  # Last email we sent
    last_inbound_date: Optional[str] = None  # Last email we received
    awaiting_response_days: int = 0  # Days waiting for their response
    priority_score: float = 0.0  # Composite priority score for ranking
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "id": self.id,
            "contact": self.contact.to_dict(),
            "opportunityType": self.opportunity_type.value,
            "stage": self.stage.value,
            "source": self.source.value,
            "sourceId": self.source_id,
            "signals": [s.to_dict() for s in self.signals],
            "confidenceScore": self.confidence_score,
            "discoveredAt": self.discovered_at,
            "lastActivity": self.last_activity,
        }
        if self.estimated_value is not None:
            result["estimatedValue"] = self.estimated_value
        if self.notes:
            result["notes"] = self.notes
        if self.proposal_id:
            result["proposalId"] = self.proposal_id
        # NEW: Enhanced tracking fields
        if self.last_contact_date:
            result["lastContactDate"] = self.last_contact_date
        result["daysSinceContact"] = self.days_since_contact
        if self.contact_history:
            result["contactHistory"] = [e.to_dict() for e in self.contact_history]
        result["engagementScore"] = self.engagement_score
        if self.status:
            result["status"] = self.status.value
        if self.last_outbound_date:
            result["lastOutboundDate"] = self.last_outbound_date
        if self.last_inbound_date:
            result["lastInboundDate"] = self.last_inbound_date
        result["awaitingResponseDays"] = self.awaiting_response_days
        result["priorityScore"] = self.priority_score
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Opportunity":
        """Create Opportunity from dictionary."""
        contact_history = []
        if "contactHistory" in data:
            contact_history = [ContactEvent.from_dict(e) for e in data["contactHistory"]]
        
        status = None
        if "status" in data:
            status = OpportunityStatus(data["status"])
        
        return cls(
            id=data["id"],
            contact=ContactInfo.from_dict(data["contact"]),
            opportunity_type=OpportunityType(data["opportunityType"]),
            stage=PipelineStage(data["stage"]),
            source=SourceType(data["source"]),
            source_id=data["sourceId"],
            signals=[Signal.from_dict(s) for s in data["signals"]],
            confidence_score=data["confidenceScore"],
            discovered_at=data["discoveredAt"],
            last_activity=data["lastActivity"],
            estimated_value=data.get("estimatedValue"),
            notes=data.get("notes"),
            proposal_id=data.get("proposalId"),
            last_contact_date=data.get("lastContactDate"),
            days_since_contact=data.get("daysSinceContact", 0),
            contact_history=contact_history,
            engagement_score=data.get("engagementScore", 0.0),
            status=status,
            last_outbound_date=data.get("lastOutboundDate"),
            last_inbound_date=data.get("lastInboundDate"),
            awaiting_response_days=data.get("awaitingResponseDays", 0),
            priority_score=data.get("priorityScore", 0.0),
        )


@dataclass
class OpportunityPipeline:
    """
    Collection of opportunities organized by pipeline stage.
    
    Used for generating dashboard views.
    """
    
    opportunities: List[Opportunity] = field(default_factory=list)
    generated_at: str = ""  # ISO timestamp
    lookback_months: int = 6
    
    def by_stage(self) -> Dict[PipelineStage, List[Opportunity]]:
        """Group opportunities by pipeline stage."""
        result: Dict[PipelineStage, List[Opportunity]] = {
            stage: [] for stage in PipelineStage
        }
        for opp in self.opportunities:
            result[opp.stage].append(opp)
        return result
    
    def by_type(self) -> Dict[OpportunityType, List[Opportunity]]:
        """Group opportunities by type."""
        result: Dict[OpportunityType, List[Opportunity]] = {
            t: [] for t in OpportunityType
        }
        for opp in self.opportunities:
            result[opp.opportunity_type].append(opp)
        return result
    
    def total_estimated_value(self) -> int:
        """Calculate total estimated pipeline value."""
        return sum(
            opp.estimated_value or 0
            for opp in self.opportunities
            if opp.stage not in [PipelineStage.CLOSED_LOST]
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "opportunities": [o.to_dict() for o in self.opportunities],
            "generatedAt": self.generated_at,
            "lookbackMonths": self.lookback_months,
            "summary": {
                "total": len(self.opportunities),
                "byStage": {
                    stage.value: len(opps)
                    for stage, opps in self.by_stage().items()
                },
                "byType": {
                    t.value: len(opps)
                    for t, opps in self.by_type().items()
                },
                "totalEstimatedValue": self.total_estimated_value(),
            },
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OpportunityPipeline":
        """Create OpportunityPipeline from dictionary."""
        return cls(
            opportunities=[Opportunity.from_dict(o) for o in data["opportunities"]],
            generated_at=data.get("generatedAt", ""),
            lookback_months=data.get("lookbackMonths", 6),
        )


# Value estimation ranges by opportunity type
OPPORTUNITY_VALUE_RANGES: Dict[OpportunityType, Dict[str, int]] = {
    OpportunityType.CONSULTING: {"min": 2500, "typical": 15000, "max": 75000},
    OpportunityType.MEMBERSHIP: {"min": 299 * 12, "typical": 599 * 12, "max": 599 * 12},  # Annual
    OpportunityType.REPORT_GENERATOR: {"min": 299 * 12, "typical": 599 * 12, "max": 599 * 12},
    OpportunityType.COMMONS_PARTNERSHIP: {"min": 5000, "typical": 8750, "max": 12500},
}


# =============================================================================
# ITERATIVE PROCESSING TYPES (Ralph-style)
# =============================================================================

class TaskStatus(str, Enum):
    """Status of a PRD task."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"
    SKIPPED = "skipped"


class TaskType(str, Enum):
    """Types of tasks in the PRD."""
    SCAN_TRANSCRIPT = "scan_transcript"
    SCAN_EMAIL = "scan_email"
    DRAFT_EMAIL = "draft_email"
    DRAFT_PROPOSAL = "draft_proposal"
    EVALUATE_OUTPUT = "evaluate_output"


class EmailType(str, Enum):
    """Types of outreach emails."""
    COLD = "cold"
    WARM = "warm"
    REENGAGEMENT = "reengagement"


class ConversationStage(str, Enum):
    """Stage of email conversation with a contact."""
    NEW = "new"
    INITIAL = "initial"
    ONGOING = "ongoing"
    WARM = "warm"
    COOLING = "cooling"
    STALE = "stale"
    COLD = "cold"


class OpportunityStatus(str, Enum):
    """Status of an opportunity based on communications."""
    ACTIVE = "active"  # Recent activity, engaged
    STALE = "stale"  # No activity > 30 days
    NEEDS_FOLLOWUP = "needs_followup"  # We need to reach out
    AWAITING_RESPONSE = "awaiting_response"  # Ball in their court
    CLOSED = "closed"  # Deal completed or lost


@dataclass
class ContactEvent:
    """A communication event with a contact."""
    
    event_type: str  # "email_sent", "email_received", "meeting", "call"
    timestamp: str  # ISO timestamp
    subject: Optional[str] = None
    snippet: Optional[str] = None  # Brief content excerpt
    direction: str = "unknown"  # "inbound", "outbound", "bidirectional"
    thread_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "eventType": self.event_type,
            "timestamp": self.timestamp,
            "subject": self.subject,
            "snippet": self.snippet,
            "direction": self.direction,
            "threadId": self.thread_id
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContactEvent":
        return cls(
            event_type=data["eventType"],
            timestamp=data["timestamp"],
            subject=data.get("subject"),
            snippet=data.get("snippet"),
            direction=data.get("direction", "unknown"),
            thread_id=data.get("threadId")
        )


@dataclass
class QualityGateResult:
    """Result from a quality gate evaluation."""
    
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
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "QualityGateResult":
        return cls(
            passed=data["passed"],
            gate_name=data["gateName"],
            score=data["score"],
            passed_checks=data["passedChecks"],
            failed_checks=data["failedChecks"],
            suggestions=data["suggestions"]
        )


@dataclass
class Task:
    """A task in the iterative PRD."""
    
    id: str
    type: TaskType
    source_id: str
    source_name: str
    source_type: str  # "transcript" or "email"
    priority: int
    status: TaskStatus
    depends_on: List[str]
    metadata: Dict[str, Any]
    attempts: int
    max_attempts: int
    created_at: str
    started_at: Optional[str]
    completed_at: Optional[str]
    result: Optional[Dict[str, Any]]
    error: Optional[str]
    quality_gates: Dict[str, List[str]]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "sourceId": self.source_id,
            "sourceName": self.source_name,
            "sourceType": self.source_type,
            "priority": self.priority,
            "status": self.status.value,
            "dependsOn": self.depends_on,
            "metadata": self.metadata,
            "attempts": self.attempts,
            "maxAttempts": self.max_attempts,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "result": self.result,
            "error": self.error,
            "qualityGates": self.quality_gates
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        return cls(
            id=data["id"],
            type=TaskType(data["type"]),
            source_id=data["sourceId"],
            source_name=data["sourceName"],
            source_type=data["sourceType"],
            priority=data["priority"],
            status=TaskStatus(data["status"]),
            depends_on=data.get("dependsOn", []),
            metadata=data.get("metadata", {}),
            attempts=data.get("attempts", 0),
            max_attempts=data.get("maxAttempts", 3),
            created_at=data["createdAt"],
            started_at=data.get("startedAt"),
            completed_at=data.get("completedAt"),
            result=data.get("result"),
            error=data.get("error"),
            quality_gates=data.get("qualityGates", {"passed": [], "failed": []})
        )


@dataclass
class EmailDraft:
    """A generated email draft."""
    
    id: str
    opportunity_id: str
    email_type: EmailType
    contact_name: str
    contact_email: Optional[str]
    company: Optional[str]
    subject: str
    body: str
    created_at: str
    quality_score: float
    iteration_count: int
    status: str  # "draft", "reviewed", "sent"
    file_path: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "opportunityId": self.opportunity_id,
            "emailType": self.email_type.value,
            "contactName": self.contact_name,
            "contactEmail": self.contact_email,
            "company": self.company,
            "subject": self.subject,
            "body": self.body,
            "createdAt": self.created_at,
            "qualityScore": self.quality_score,
            "iterationCount": self.iteration_count,
            "status": self.status,
            "filePath": self.file_path
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EmailDraft":
        return cls(
            id=data["id"],
            opportunity_id=data["opportunityId"],
            email_type=EmailType(data["emailType"]),
            contact_name=data["contactName"],
            contact_email=data.get("contactEmail"),
            company=data.get("company"),
            subject=data["subject"],
            body=data["body"],
            created_at=data["createdAt"],
            quality_score=data["qualityScore"],
            iteration_count=data["iterationCount"],
            status=data["status"],
            file_path=data["filePath"]
        )


@dataclass
class ProposalDraft:
    """A generated proposal draft."""
    
    id: str
    opportunity_id: str
    contact_name: str
    company: str
    opportunity_type: OpportunityType
    recommended_tier: str  # "low", "mid", "high"
    html_content: str
    created_at: str
    quality_score: float
    iteration_count: int
    status: str  # "draft", "reviewed", "sent"
    file_path: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "opportunityId": self.opportunity_id,
            "contactName": self.contact_name,
            "company": self.company,
            "opportunityType": self.opportunity_type.value,
            "recommendedTier": self.recommended_tier,
            "htmlContent": self.html_content,
            "createdAt": self.created_at,
            "qualityScore": self.quality_score,
            "iterationCount": self.iteration_count,
            "status": self.status,
            "filePath": self.file_path
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProposalDraft":
        return cls(
            id=data["id"],
            opportunity_id=data["opportunityId"],
            contact_name=data["contactName"],
            company=data["company"],
            opportunity_type=OpportunityType(data["opportunityType"]),
            recommended_tier=data["recommendedTier"],
            html_content=data["htmlContent"],
            created_at=data["createdAt"],
            quality_score=data["qualityScore"],
            iteration_count=data["iterationCount"],
            status=data["status"],
            file_path=data["filePath"]
        )


@dataclass
class SessionProgress:
    """Progress tracking for a bizdev session."""
    
    session_id: str
    started_at: str
    updated_at: str
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    opportunities_found: int
    emails_drafted: int
    proposals_drafted: int
    learnings: List[str]
    patterns_discovered: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "startedAt": self.started_at,
            "updatedAt": self.updated_at,
            "totalTasks": self.total_tasks,
            "completedTasks": self.completed_tasks,
            "failedTasks": self.failed_tasks,
            "opportunitiesFound": self.opportunities_found,
            "emailsDrafted": self.emails_drafted,
            "proposalsDrafted": self.proposals_drafted,
            "learnings": self.learnings,
            "patternsDiscovered": self.patterns_discovered
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionProgress":
        return cls(
            session_id=data["sessionId"],
            started_at=data["startedAt"],
            updated_at=data["updatedAt"],
            total_tasks=data["totalTasks"],
            completed_tasks=data["completedTasks"],
            failed_tasks=data["failedTasks"],
            opportunities_found=data["opportunitiesFound"],
            emails_drafted=data["emailsDrafted"],
            proposals_drafted=data["proposalsDrafted"],
            learnings=data.get("learnings", []),
            patterns_discovered=data.get("patternsDiscovered", [])
        )
