"""
Context Registry for BizDev Command Center

Tracks what context has been gathered for each opportunity,
preventing the pattern where drafts/proposals are generated
with incomplete information.

Every opportunity must have its context verified before any
draft or proposal generation can proceed.

Key Invariant: No generation without verified context.
"""

import json
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict


# =============================================================================
# PATHS
# =============================================================================

REGISTRY_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "command-center", "context_registry.json"
)


# =============================================================================
# CONTEXT STATE PER OPPORTUNITY
# =============================================================================

@dataclass
class ContextState:
    """
    Tracks which context sources have been searched for an opportunity.

    Before any draft/proposal can be generated, the orchestrator
    checks this state to ensure all required sources have been consulted.
    """
    opportunity_id: str
    contact_name: str
    contact_email: Optional[str] = None
    company: Optional[str] = None

    # Source search tracking
    transcript_searched: bool = False
    transcript_search_timestamp: Optional[str] = None
    transcript_source_ids: List[str] = field(default_factory=list)
    transcript_pain_points: List[str] = field(default_factory=list)
    transcript_key_quotes: List[str] = field(default_factory=list)

    email_searched: bool = False
    email_search_timestamp: Optional[str] = None
    email_thread_ids: List[str] = field(default_factory=list)
    email_thread_count: int = 0

    slack_searched: bool = False
    slack_search_timestamp: Optional[str] = None

    # Unified context
    unified_context_generated: bool = False
    unified_context_timestamp: Optional[str] = None

    # Pricing extraction
    pricing_extracted: bool = False
    pricing_extraction_timestamp: Optional[str] = None
    pricing_terms: Optional[Dict[str, Any]] = None
    pricing_source: Optional[str] = None  # "transcript", "email", "manual"

    # Quality gate
    context_completeness_score: float = 0.0
    context_gate_passed: bool = False
    context_gate_timestamp: Optional[str] = None
    context_gate_failures: List[str] = field(default_factory=list)

    # Metadata
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        now = datetime.utcnow().isoformat()
        if not self.created_at:
            self.created_at = now
        self.updated_at = now

    def mark_transcript_searched(
        self,
        source_ids: List[str],
        pain_points: List[str] = None,
        key_quotes: List[str] = None
    ):
        """Record that transcripts have been searched for this contact."""
        self.transcript_searched = True
        self.transcript_search_timestamp = datetime.utcnow().isoformat()
        self.transcript_source_ids = source_ids
        if pain_points:
            self.transcript_pain_points = pain_points
        if key_quotes:
            self.transcript_key_quotes = key_quotes
        self._update_completeness()

    def mark_email_searched(
        self,
        thread_ids: List[str],
        thread_count: int = 0
    ):
        """Record that emails have been searched for this contact."""
        self.email_searched = True
        self.email_search_timestamp = datetime.utcnow().isoformat()
        self.email_thread_ids = thread_ids
        self.email_thread_count = thread_count or len(thread_ids)
        self._update_completeness()

    def mark_unified_context_generated(self):
        """Record that unified context has been generated."""
        self.unified_context_generated = True
        self.unified_context_timestamp = datetime.utcnow().isoformat()
        self._update_completeness()

    def mark_pricing_extracted(
        self,
        terms: Dict[str, Any],
        source: str
    ):
        """Record that pricing has been extracted from a source."""
        self.pricing_extracted = True
        self.pricing_extraction_timestamp = datetime.utcnow().isoformat()
        self.pricing_terms = terms
        self.pricing_source = source
        self._update_completeness()

    def _update_completeness(self):
        """Recalculate context completeness score."""
        score = 0.0
        checks_total = 4  # transcript, email, unified, pricing

        if self.transcript_searched:
            score += 1.0
        if self.email_searched:
            score += 1.0
        if self.unified_context_generated:
            score += 1.0
        if self.pricing_extracted:
            score += 1.0

        self.context_completeness_score = score / checks_total
        self.updated_at = datetime.utcnow().isoformat()

    def evaluate_gate(self, require_pricing: bool = False) -> bool:
        """
        Evaluate whether this opportunity's context is sufficient
        for draft/proposal generation.

        Args:
            require_pricing: If True, pricing must be extracted (for proposals)

        Returns:
            True if context is sufficient
        """
        failures = []

        if not self.transcript_searched:
            failures.append("TRANSCRIPT_NOT_SEARCHED: No transcript search performed")

        if not self.email_searched:
            failures.append("EMAIL_NOT_SEARCHED: No email search performed")

        if not self.unified_context_generated:
            failures.append("UNIFIED_CONTEXT_MISSING: Transcript and email context not merged")

        if require_pricing and not self.pricing_extracted:
            failures.append("PRICING_NOT_EXTRACTED: No pricing terms found from transcripts")

        # Check for stale context (older than 7 days)
        if self.unified_context_timestamp:
            ctx_time = datetime.fromisoformat(self.unified_context_timestamp)
            if datetime.utcnow() - ctx_time > timedelta(days=7):
                failures.append("CONTEXT_STALE: Unified context is older than 7 days")

        self.context_gate_failures = failures
        self.context_gate_passed = len(failures) == 0
        self.context_gate_timestamp = datetime.utcnow().isoformat()
        self.updated_at = datetime.utcnow().isoformat()

        return self.context_gate_passed

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "opportunity_id": self.opportunity_id,
            "contact_name": self.contact_name,
            "contact_email": self.contact_email,
            "company": self.company,
            "transcript": {
                "searched": self.transcript_searched,
                "timestamp": self.transcript_search_timestamp,
                "source_ids": self.transcript_source_ids,
                "pain_points": self.transcript_pain_points,
                "key_quotes": self.transcript_key_quotes
            },
            "email": {
                "searched": self.email_searched,
                "timestamp": self.email_search_timestamp,
                "thread_ids": self.email_thread_ids,
                "thread_count": self.email_thread_count
            },
            "slack": {
                "searched": self.slack_searched,
                "timestamp": self.slack_search_timestamp
            },
            "unified_context": {
                "generated": self.unified_context_generated,
                "timestamp": self.unified_context_timestamp
            },
            "pricing": {
                "extracted": self.pricing_extracted,
                "timestamp": self.pricing_extraction_timestamp,
                "terms": self.pricing_terms,
                "source": self.pricing_source
            },
            "gate": {
                "completeness_score": self.context_completeness_score,
                "passed": self.context_gate_passed,
                "timestamp": self.context_gate_timestamp,
                "failures": self.context_gate_failures
            },
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContextState":
        """Create ContextState from saved dict."""
        transcript = data.get("transcript", {})
        email = data.get("email", {})
        slack = data.get("slack", {})
        unified = data.get("unified_context", {})
        pricing = data.get("pricing", {})
        gate = data.get("gate", {})

        return cls(
            opportunity_id=data["opportunity_id"],
            contact_name=data["contact_name"],
            contact_email=data.get("contact_email"),
            company=data.get("company"),
            transcript_searched=transcript.get("searched", False),
            transcript_search_timestamp=transcript.get("timestamp"),
            transcript_source_ids=transcript.get("source_ids", []),
            transcript_pain_points=transcript.get("pain_points", []),
            transcript_key_quotes=transcript.get("key_quotes", []),
            email_searched=email.get("searched", False),
            email_search_timestamp=email.get("timestamp"),
            email_thread_ids=email.get("thread_ids", []),
            email_thread_count=email.get("thread_count", 0),
            slack_searched=slack.get("searched", False),
            slack_search_timestamp=slack.get("timestamp"),
            unified_context_generated=unified.get("generated", False),
            unified_context_timestamp=unified.get("timestamp"),
            pricing_extracted=pricing.get("extracted", False),
            pricing_extraction_timestamp=pricing.get("timestamp"),
            pricing_terms=pricing.get("terms"),
            pricing_source=pricing.get("source"),
            context_completeness_score=gate.get("completeness_score", 0.0),
            context_gate_passed=gate.get("passed", False),
            context_gate_timestamp=gate.get("timestamp"),
            context_gate_failures=gate.get("failures", []),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", "")
        )


# =============================================================================
# REGISTRY MANAGER
# =============================================================================

class ContextRegistry:
    """
    Persistent registry tracking context completeness for all opportunities.

    Usage:
        registry = ContextRegistry.load()
        state = registry.get_or_create("opp-001", "Dr. Smith")
        state.mark_transcript_searched(["file-123"])
        state.mark_email_searched(["thread-abc"])
        state.mark_unified_context_generated()

        if state.evaluate_gate():
            # Safe to generate drafts/proposals
            pass
        else:
            print(f"Missing: {state.context_gate_failures}")

        registry.save()
    """

    def __init__(self):
        self.states: Dict[str, ContextState] = {}
        self.metadata = {
            "schema_version": "1.0.0",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

    def get_or_create(
        self,
        opportunity_id: str,
        contact_name: str,
        contact_email: Optional[str] = None,
        company: Optional[str] = None
    ) -> ContextState:
        """Get existing state or create new one."""
        if opportunity_id not in self.states:
            self.states[opportunity_id] = ContextState(
                opportunity_id=opportunity_id,
                contact_name=contact_name,
                contact_email=contact_email,
                company=company
            )
        return self.states[opportunity_id]

    def get(self, opportunity_id: str) -> Optional[ContextState]:
        """Get state for an opportunity, or None if not tracked."""
        return self.states.get(opportunity_id)

    def check_ready_for_email(self, opportunity_id: str) -> tuple:
        """
        Check if an opportunity is ready for email draft generation.

        Returns:
            (is_ready: bool, failures: List[str])
        """
        state = self.states.get(opportunity_id)
        if not state:
            return False, ["NOT_REGISTERED: Opportunity not in context registry"]

        passed = state.evaluate_gate(require_pricing=False)
        return passed, state.context_gate_failures

    def check_ready_for_proposal(self, opportunity_id: str) -> tuple:
        """
        Check if an opportunity is ready for proposal generation.
        Requires pricing extraction in addition to other checks.

        Returns:
            (is_ready: bool, failures: List[str])
        """
        state = self.states.get(opportunity_id)
        if not state:
            return False, ["NOT_REGISTERED: Opportunity not in context registry"]

        passed = state.evaluate_gate(require_pricing=True)
        return passed, state.context_gate_failures

    def get_incomplete_opportunities(self) -> List[Dict[str, Any]]:
        """Return list of opportunities with incomplete context."""
        incomplete = []
        for opp_id, state in self.states.items():
            if not state.context_gate_passed:
                state.evaluate_gate()
                if not state.context_gate_passed:
                    incomplete.append({
                        "opportunity_id": opp_id,
                        "contact_name": state.contact_name,
                        "completeness_score": state.context_completeness_score,
                        "failures": state.context_gate_failures
                    })
        return incomplete

    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics for the registry."""
        total = len(self.states)
        complete = sum(1 for s in self.states.values() if s.context_gate_passed)
        transcript_searched = sum(1 for s in self.states.values() if s.transcript_searched)
        email_searched = sum(1 for s in self.states.values() if s.email_searched)
        unified = sum(1 for s in self.states.values() if s.unified_context_generated)
        pricing = sum(1 for s in self.states.values() if s.pricing_extracted)

        return {
            "total_tracked": total,
            "context_complete": complete,
            "context_incomplete": total - complete,
            "transcript_searched": transcript_searched,
            "email_searched": email_searched,
            "unified_context_generated": unified,
            "pricing_extracted": pricing,
            "completeness_rate": complete / total if total > 0 else 0
        }

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the full registry."""
        return {
            "metadata": self.metadata,
            "summary": self.get_summary(),
            "states": {
                opp_id: state.to_dict()
                for opp_id, state in self.states.items()
            }
        }

    def save(self, path: Optional[str] = None):
        """Save registry to disk."""
        save_path = path or REGISTRY_PATH
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        self.metadata["updated_at"] = datetime.utcnow().isoformat()

        with open(save_path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: Optional[str] = None) -> "ContextRegistry":
        """Load registry from disk, or create new if not found."""
        load_path = path or REGISTRY_PATH

        registry = cls()

        if os.path.exists(load_path):
            try:
                with open(load_path, "r") as f:
                    data = json.load(f)

                registry.metadata = data.get("metadata", registry.metadata)

                for opp_id, state_data in data.get("states", {}).items():
                    registry.states[opp_id] = ContextState.from_dict(state_data)
            except (json.JSONDecodeError, KeyError) as e:
                # Corrupted file - start fresh but log the error
                registry.metadata["load_error"] = str(e)
                registry.metadata["load_error_at"] = datetime.utcnow().isoformat()

        return registry
