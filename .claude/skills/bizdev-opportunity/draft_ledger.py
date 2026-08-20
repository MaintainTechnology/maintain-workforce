"""
Draft Ledger for BizDev Command Center

Tracks every draft generation with version history, quality scores,
context sources used, and iteration data. Prevents the pattern where
drafts are overwritten without preserving what was learned.

Key Invariant: No draft is ever lost. Every generation is logged.
"""

import json
import os
import hashlib
from typing import Dict, Any, List, Optional
from datetime import datetime
from dataclasses import dataclass, field


# =============================================================================
# PATHS
# =============================================================================

LEDGER_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "command-center", "draft_ledger.json"
)


# =============================================================================
# DRAFT ENTRY
# =============================================================================

@dataclass
class DraftEntry:
    """
    A single draft generation event.

    Captures everything about a draft: what context was used,
    what quality score it got, what iteration it was, and where
    it was saved.
    """

    # Identity
    draft_id: str
    opportunity_id: str
    draft_type: str  # "email" or "proposal"
    contact_name: str
    company: Optional[str] = None

    # Version tracking
    version: int = 1
    previous_draft_id: Optional[str] = None

    # Content fingerprint (hash of content, not content itself)
    content_hash: str = ""
    file_path: str = ""

    # Quality
    quality_score: float = 0.0
    quality_gate_passed: bool = False
    quality_gate_checks_passed: List[str] = field(default_factory=list)
    quality_gate_checks_failed: List[str] = field(default_factory=list)
    quality_suggestions: List[str] = field(default_factory=list)

    # Iteration tracking
    iteration_number: int = 1
    max_iterations: int = 3
    refinement_applied: bool = False
    refinement_feedback: Optional[str] = None

    # Context sources used
    context_sources: Dict[str, Any] = field(default_factory=lambda: {
        "transcript_searched": False,
        "transcript_ids": [],
        "email_searched": False,
        "email_thread_ids": [],
        "unified_context_used": False,
        "pricing_extracted": False,
        "pricing_terms": None
    })

    # Metadata
    generated_at: str = ""
    generation_duration_ms: Optional[int] = None

    def __post_init__(self):
        if not self.generated_at:
            self.generated_at = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dict."""
        return {
            "draft_id": self.draft_id,
            "opportunity_id": self.opportunity_id,
            "draft_type": self.draft_type,
            "contact_name": self.contact_name,
            "company": self.company,
            "version": self.version,
            "previous_draft_id": self.previous_draft_id,
            "content_hash": self.content_hash,
            "file_path": self.file_path,
            "quality": {
                "score": self.quality_score,
                "gate_passed": self.quality_gate_passed,
                "checks_passed": self.quality_gate_checks_passed,
                "checks_failed": self.quality_gate_checks_failed,
                "suggestions": self.quality_suggestions
            },
            "iteration": {
                "number": self.iteration_number,
                "max": self.max_iterations,
                "refinement_applied": self.refinement_applied,
                "refinement_feedback": self.refinement_feedback
            },
            "context_sources": self.context_sources,
            "generated_at": self.generated_at,
            "generation_duration_ms": self.generation_duration_ms
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DraftEntry":
        """Create from saved dict."""
        quality = data.get("quality", {})
        iteration = data.get("iteration", {})

        return cls(
            draft_id=data["draft_id"],
            opportunity_id=data["opportunity_id"],
            draft_type=data["draft_type"],
            contact_name=data["contact_name"],
            company=data.get("company"),
            version=data.get("version", 1),
            previous_draft_id=data.get("previous_draft_id"),
            content_hash=data.get("content_hash", ""),
            file_path=data.get("file_path", ""),
            quality_score=quality.get("score", 0.0),
            quality_gate_passed=quality.get("gate_passed", False),
            quality_gate_checks_passed=quality.get("checks_passed", []),
            quality_gate_checks_failed=quality.get("checks_failed", []),
            quality_suggestions=quality.get("suggestions", []),
            iteration_number=iteration.get("number", 1),
            max_iterations=iteration.get("max", 3),
            refinement_applied=iteration.get("refinement_applied", False),
            refinement_feedback=iteration.get("refinement_feedback"),
            context_sources=data.get("context_sources", {}),
            generated_at=data.get("generated_at", ""),
            generation_duration_ms=data.get("generation_duration_ms")
        )


# =============================================================================
# DRAFT LEDGER MANAGER
# =============================================================================

class DraftLedger:
    """
    Persistent ledger tracking all draft generations.

    Usage:
        ledger = DraftLedger.load()

        # Log a new draft
        entry = ledger.log_draft(
            opportunity_id="opp-001",
            draft_type="email",
            contact_name="Dr. Smith",
            content="Subject: ...\n\nBody...",
            file_path=".bizdev/drafts/emails/opp-001-warm.md",
            quality_result=gate_result,
            context_sources={
                "transcript_searched": True,
                "email_searched": True,
                "unified_context_used": True
            }
        )

        # Check draft history
        history = ledger.get_history("opp-001", "email")
        print(f"This is version {len(history)} for this contact")

        # Detect quality degradation
        trend = ledger.get_quality_trend("opp-001", "email")
        if trend == "declining":
            print("WARNING: Quality scores are declining")

        ledger.save()
    """

    def __init__(self):
        self.entries: List[DraftEntry] = []
        self.metadata = {
            "schema_version": "1.0.0",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

    def log_draft(
        self,
        opportunity_id: str,
        draft_type: str,
        contact_name: str,
        content: str,
        file_path: str,
        quality_result: Optional[Dict[str, Any]] = None,
        context_sources: Optional[Dict[str, Any]] = None,
        company: Optional[str] = None,
        iteration_number: int = 1,
        refinement_applied: bool = False,
        refinement_feedback: Optional[str] = None
    ) -> DraftEntry:
        """
        Log a draft generation event.

        Args:
            opportunity_id: Which opportunity this draft is for
            draft_type: "email" or "proposal"
            contact_name: Contact name
            content: The draft content (used for hashing, not stored)
            file_path: Where the draft was saved
            quality_result: Quality gate result dict
            context_sources: What context was used
            company: Company name
            iteration_number: Which iteration of refinement
            refinement_applied: Whether this was refined from a previous draft
            refinement_feedback: What feedback was applied

        Returns:
            The created DraftEntry
        """
        # Get version number
        history = self.get_history(opportunity_id, draft_type)
        version = len(history) + 1
        previous_id = history[-1].draft_id if history else None

        # Create content hash
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

        # Check if this is a duplicate (same content hash)
        if history and history[-1].content_hash == content_hash:
            # Same content - don't log duplicate
            return history[-1]

        # Generate draft ID
        draft_id = f"draft-{opportunity_id}-{draft_type}-v{version}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

        # Parse quality result
        quality_score = 0.0
        gate_passed = False
        checks_passed = []
        checks_failed = []
        suggestions = []

        if quality_result:
            quality_score = quality_result.get("score", 0.0)
            gate_passed = quality_result.get("passed", False)
            checks_passed = quality_result.get("passedChecks", quality_result.get("passed_checks", []))
            checks_failed = quality_result.get("failedChecks", quality_result.get("failed_checks", []))
            suggestions = quality_result.get("suggestions", [])

        entry = DraftEntry(
            draft_id=draft_id,
            opportunity_id=opportunity_id,
            draft_type=draft_type,
            contact_name=contact_name,
            company=company,
            version=version,
            previous_draft_id=previous_id,
            content_hash=content_hash,
            file_path=file_path,
            quality_score=quality_score,
            quality_gate_passed=gate_passed,
            quality_gate_checks_passed=checks_passed,
            quality_gate_checks_failed=checks_failed,
            quality_suggestions=suggestions,
            iteration_number=iteration_number,
            max_iterations=3,
            refinement_applied=refinement_applied,
            refinement_feedback=refinement_feedback,
            context_sources=context_sources or {}
        )

        self.entries.append(entry)
        return entry

    def get_history(
        self,
        opportunity_id: str,
        draft_type: Optional[str] = None
    ) -> List[DraftEntry]:
        """
        Get all draft versions for an opportunity.

        Args:
            opportunity_id: Which opportunity
            draft_type: Optional filter by "email" or "proposal"

        Returns:
            List of DraftEntry sorted by generation time
        """
        filtered = [
            e for e in self.entries
            if e.opportunity_id == opportunity_id
            and (draft_type is None or e.draft_type == draft_type)
        ]
        return sorted(filtered, key=lambda e: e.generated_at)

    def get_latest(
        self,
        opportunity_id: str,
        draft_type: str
    ) -> Optional[DraftEntry]:
        """Get the most recent draft for an opportunity."""
        history = self.get_history(opportunity_id, draft_type)
        return history[-1] if history else None

    def get_quality_trend(
        self,
        opportunity_id: str,
        draft_type: str
    ) -> str:
        """
        Analyze quality score trend for an opportunity's drafts.

        Returns:
            "improving" | "stable" | "declining" | "insufficient_data"
        """
        history = self.get_history(opportunity_id, draft_type)

        if len(history) < 2:
            return "insufficient_data"

        scores = [e.quality_score for e in history]

        # Compare last 3 scores
        recent = scores[-3:] if len(scores) >= 3 else scores

        if all(recent[i] <= recent[i+1] for i in range(len(recent)-1)):
            return "improving"
        elif all(recent[i] >= recent[i+1] for i in range(len(recent)-1)):
            return "declining"
        else:
            return "stable"

    def get_global_quality_stats(self) -> Dict[str, Any]:
        """Get quality statistics across all drafts."""
        if not self.entries:
            return {
                "total_drafts": 0,
                "avg_quality_score": 0,
                "pass_rate": 0,
                "first_try_pass_rate": 0,
                "declining_opportunities": []
            }

        total = len(self.entries)
        passed = sum(1 for e in self.entries if e.quality_gate_passed)
        first_try = sum(
            1 for e in self.entries
            if e.quality_gate_passed and e.iteration_number == 1
        )
        avg_score = sum(e.quality_score for e in self.entries) / total

        # Find opportunities with declining quality
        opp_ids = set(e.opportunity_id for e in self.entries)
        declining = []
        for opp_id in opp_ids:
            for draft_type in ["email", "proposal"]:
                trend = self.get_quality_trend(opp_id, draft_type)
                if trend == "declining":
                    declining.append({
                        "opportunity_id": opp_id,
                        "draft_type": draft_type,
                        "contact": next(
                            (e.contact_name for e in self.entries if e.opportunity_id == opp_id),
                            "Unknown"
                        )
                    })

        return {
            "total_drafts": total,
            "total_passed": passed,
            "avg_quality_score": round(avg_score, 3),
            "pass_rate": round(passed / total, 3) if total > 0 else 0,
            "first_try_pass_rate": round(first_try / total, 3) if total > 0 else 0,
            "declining_opportunities": declining
        }

    def get_context_usage_stats(self) -> Dict[str, Any]:
        """Track how often unified context is actually being used."""
        if not self.entries:
            return {
                "total_drafts": 0,
                "unified_context_used": 0,
                "unified_context_rate": 0,
                "transcript_searched": 0,
                "email_searched": 0
            }

        total = len(self.entries)
        unified = sum(
            1 for e in self.entries
            if e.context_sources.get("unified_context_used", False)
        )
        transcript = sum(
            1 for e in self.entries
            if e.context_sources.get("transcript_searched", False)
        )
        email = sum(
            1 for e in self.entries
            if e.context_sources.get("email_searched", False)
        )

        return {
            "total_drafts": total,
            "unified_context_used": unified,
            "unified_context_rate": round(unified / total, 3) if total > 0 else 0,
            "transcript_searched": transcript,
            "email_searched": email
        }

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the full ledger."""
        return {
            "metadata": self.metadata,
            "stats": self.get_global_quality_stats(),
            "context_usage": self.get_context_usage_stats(),
            "entries": [e.to_dict() for e in self.entries]
        }

    def save(self, path: Optional[str] = None):
        """Save ledger to disk."""
        save_path = path or LEDGER_PATH
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        self.metadata["updated_at"] = datetime.utcnow().isoformat()

        with open(save_path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: Optional[str] = None) -> "DraftLedger":
        """Load ledger from disk, or create new if not found."""
        load_path = path or LEDGER_PATH

        ledger = cls()

        if os.path.exists(load_path):
            try:
                with open(load_path, "r") as f:
                    data = json.load(f)

                ledger.metadata = data.get("metadata", ledger.metadata)

                for entry_data in data.get("entries", []):
                    ledger.entries.append(DraftEntry.from_dict(entry_data))
            except (json.JSONDecodeError, KeyError) as e:
                ledger.metadata["load_error"] = str(e)
                ledger.metadata["load_error_at"] = datetime.utcnow().isoformat()

        return ledger
