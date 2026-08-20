"""
Degradation Detector for BizDev Command Center

Runs at session start to detect if the system is regressing:
- Opportunity count dropping
- Draft quality scores declining
- Context coverage shrinking
- Files being deleted or overwritten without tracking

This is the "immune system" that prevents the oscillation pattern.
"""

import json
import os
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field


# =============================================================================
# PATHS
# =============================================================================

SNAPSHOT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "command-center", "health_snapshots.json"
)

OPPORTUNITIES_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "opportunities-enhanced.json"
)

DRAFTS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "drafts"
)


# =============================================================================
# HEALTH SNAPSHOT
# =============================================================================

@dataclass
class HealthSnapshot:
    """
    Point-in-time snapshot of system health.

    Taken at the start of each session and compared against
    previous snapshots to detect degradation.
    """

    snapshot_id: str = ""
    taken_at: str = ""

    # Opportunity metrics
    total_opportunities: int = 0
    active_opportunities: int = 0
    critical_opportunities: int = 0
    high_priority_opportunities: int = 0
    stale_opportunities: int = 0

    # Draft metrics
    total_email_drafts: int = 0
    total_proposal_drafts: int = 0
    email_draft_files: List[str] = field(default_factory=list)
    proposal_draft_files: List[str] = field(default_factory=list)

    # Context coverage
    opportunities_with_transcript: int = 0
    opportunities_with_email: int = 0
    opportunities_with_unified: int = 0
    opportunities_with_pricing: int = 0

    # Pipeline value
    estimated_pipeline_value: int = 0

    def __post_init__(self):
        if not self.taken_at:
            self.taken_at = datetime.utcnow().isoformat()
        if not self.snapshot_id:
            self.snapshot_id = f"snap-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "taken_at": self.taken_at,
            "opportunities": {
                "total": self.total_opportunities,
                "active": self.active_opportunities,
                "critical": self.critical_opportunities,
                "high_priority": self.high_priority_opportunities,
                "stale": self.stale_opportunities
            },
            "drafts": {
                "total_emails": self.total_email_drafts,
                "total_proposals": self.total_proposal_drafts,
                "email_files": self.email_draft_files,
                "proposal_files": self.proposal_draft_files
            },
            "context_coverage": {
                "with_transcript": self.opportunities_with_transcript,
                "with_email": self.opportunities_with_email,
                "with_unified": self.opportunities_with_unified,
                "with_pricing": self.opportunities_with_pricing
            },
            "pipeline_value": self.estimated_pipeline_value
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "HealthSnapshot":
        opps = data.get("opportunities", {})
        drafts = data.get("drafts", {})
        ctx = data.get("context_coverage", {})

        return cls(
            snapshot_id=data.get("snapshot_id", ""),
            taken_at=data.get("taken_at", ""),
            total_opportunities=opps.get("total", 0),
            active_opportunities=opps.get("active", 0),
            critical_opportunities=opps.get("critical", 0),
            high_priority_opportunities=opps.get("high_priority", 0),
            stale_opportunities=opps.get("stale", 0),
            total_email_drafts=drafts.get("total_emails", 0),
            total_proposal_drafts=drafts.get("total_proposals", 0),
            email_draft_files=drafts.get("email_files", []),
            proposal_draft_files=drafts.get("proposal_files", []),
            opportunities_with_transcript=ctx.get("with_transcript", 0),
            opportunities_with_email=ctx.get("with_email", 0),
            opportunities_with_unified=ctx.get("with_unified", 0),
            opportunities_with_pricing=ctx.get("with_pricing", 0),
            estimated_pipeline_value=data.get("pipeline_value", 0)
        )


# =============================================================================
# DEGRADATION ALERTS
# =============================================================================

@dataclass
class DegradationAlert:
    """A specific degradation signal detected."""

    alert_type: str  # Category of degradation
    severity: str  # "critical", "warning", "info"
    message: str
    metric_name: str
    previous_value: Any = None
    current_value: Any = None
    delta: Any = None
    recommendation: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "metric": self.metric_name,
            "previous": self.previous_value,
            "current": self.current_value,
            "delta": self.delta,
            "recommendation": self.recommendation
        }


# =============================================================================
# DEGRADATION DETECTOR
# =============================================================================

class DegradationDetector:
    """
    Detects system regression by comparing current state against
    previous snapshots.

    Usage:
        detector = DegradationDetector()
        report = detector.run_health_check()

        if report["has_degradation"]:
            for alert in report["alerts"]:
                print(f"[{alert['severity']}] {alert['message']}")

        # Always save snapshot for future comparison
        detector.save_snapshot()
    """

    def __init__(self):
        self.snapshots: List[HealthSnapshot] = []
        self.current_snapshot: Optional[HealthSnapshot] = None
        self._load_snapshots()

    def _load_snapshots(self):
        """Load previous snapshots from disk."""
        if os.path.exists(SNAPSHOT_PATH):
            try:
                with open(SNAPSHOT_PATH, "r") as f:
                    data = json.load(f)
                self.snapshots = [
                    HealthSnapshot.from_dict(s)
                    for s in data.get("snapshots", [])
                ]
            except (json.JSONDecodeError, KeyError):
                self.snapshots = []

    def _take_snapshot(self) -> HealthSnapshot:
        """Take a snapshot of current system state."""
        snapshot = HealthSnapshot()

        # Count opportunities from enhanced JSON
        if os.path.exists(OPPORTUNITIES_PATH):
            try:
                with open(OPPORTUNITIES_PATH, "r") as f:
                    data = json.load(f)

                opps = data.get("opportunities", [])
                snapshot.total_opportunities = len(opps)

                for opp in opps:
                    status = opp.get("status", "")
                    priority = opp.get("priority_score", 0)
                    urgency = opp.get("urgency_level", "")

                    if status == "active":
                        snapshot.active_opportunities += 1
                    if urgency == "critical":
                        snapshot.critical_opportunities += 1
                    if priority >= 70:
                        snapshot.high_priority_opportunities += 1
                    if status == "stale":
                        snapshot.stale_opportunities += 1

                summary = data.get("summary", {})
                snapshot.estimated_pipeline_value = summary.get(
                    "estimated_pipeline_value", 0
                )
            except (json.JSONDecodeError, KeyError):
                pass

        # Count draft files
        email_dir = os.path.join(DRAFTS_DIR, "emails")
        proposal_dir = os.path.join(DRAFTS_DIR, "proposals")

        if os.path.exists(email_dir):
            email_files = [
                f for f in os.listdir(email_dir)
                if f.endswith(('.md', '.html'))
            ]
            snapshot.total_email_drafts = len(email_files)
            snapshot.email_draft_files = sorted(email_files)

        if os.path.exists(proposal_dir):
            proposal_files = [
                f for f in os.listdir(proposal_dir)
                if f.endswith(('.html', '.md'))
            ]
            snapshot.total_proposal_drafts = len(proposal_files)
            snapshot.proposal_draft_files = sorted(proposal_files)

        # Context coverage (from context registry if available)
        registry_path = os.path.join(
            os.path.dirname(SNAPSHOT_PATH), "context_registry.json"
        )
        if os.path.exists(registry_path):
            try:
                with open(registry_path, "r") as f:
                    reg_data = json.load(f)

                for state_data in reg_data.get("states", {}).values():
                    transcript = state_data.get("transcript", {})
                    email = state_data.get("email", {})
                    unified = state_data.get("unified_context", {})
                    pricing = state_data.get("pricing", {})

                    if transcript.get("searched"):
                        snapshot.opportunities_with_transcript += 1
                    if email.get("searched"):
                        snapshot.opportunities_with_email += 1
                    if unified.get("generated"):
                        snapshot.opportunities_with_unified += 1
                    if pricing.get("extracted"):
                        snapshot.opportunities_with_pricing += 1
            except (json.JSONDecodeError, KeyError):
                pass

        self.current_snapshot = snapshot
        return snapshot

    def run_health_check(self) -> Dict[str, Any]:
        """
        Run a full health check comparing current state to previous snapshot.

        Returns:
            Dict with:
            - has_degradation: bool
            - alerts: List of alert dicts
            - current_snapshot: Current state
            - comparison: Delta from previous
        """
        current = self._take_snapshot()
        alerts: List[DegradationAlert] = []

        # Get previous snapshot for comparison
        previous = self.snapshots[-1] if self.snapshots else None

        if previous:
            alerts.extend(self._check_opportunity_degradation(previous, current))
            alerts.extend(self._check_draft_degradation(previous, current))
            alerts.extend(self._check_context_degradation(previous, current))
            alerts.extend(self._check_pipeline_degradation(previous, current))

        # Always check for absolute issues (no comparison needed)
        alerts.extend(self._check_absolute_issues(current))

        # Sort by severity
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        alerts.sort(key=lambda a: severity_order.get(a.severity, 3))

        has_degradation = any(
            a.severity in ("critical", "warning") for a in alerts
        )

        return {
            "has_degradation": has_degradation,
            "alert_count": len(alerts),
            "critical_count": sum(1 for a in alerts if a.severity == "critical"),
            "warning_count": sum(1 for a in alerts if a.severity == "warning"),
            "alerts": [a.to_dict() for a in alerts],
            "current_snapshot": current.to_dict(),
            "previous_snapshot": previous.to_dict() if previous else None,
            "checked_at": datetime.utcnow().isoformat()
        }

    def _check_opportunity_degradation(
        self,
        previous: HealthSnapshot,
        current: HealthSnapshot
    ) -> List[DegradationAlert]:
        """Check if opportunities have disappeared."""
        alerts = []

        # Total opportunity count dropped
        if current.total_opportunities < previous.total_opportunities:
            delta = previous.total_opportunities - current.total_opportunities
            pct = delta / previous.total_opportunities * 100 if previous.total_opportunities > 0 else 0

            severity = "critical" if pct > 20 else "warning"
            alerts.append(DegradationAlert(
                alert_type="OPPORTUNITY_COUNT_DROP",
                severity=severity,
                message=f"Opportunity count dropped from {previous.total_opportunities} to {current.total_opportunities} (-{delta}, -{pct:.0f}%)",
                metric_name="total_opportunities",
                previous_value=previous.total_opportunities,
                current_value=current.total_opportunities,
                delta=-delta,
                recommendation="Check if opportunities were accidentally deleted or if a scan used a shorter lookback period"
            ))

        # Active opportunities dropped
        if current.active_opportunities < previous.active_opportunities:
            delta = previous.active_opportunities - current.active_opportunities
            alerts.append(DegradationAlert(
                alert_type="ACTIVE_OPP_DROP",
                severity="warning",
                message=f"Active opportunities dropped from {previous.active_opportunities} to {current.active_opportunities} (-{delta})",
                metric_name="active_opportunities",
                previous_value=previous.active_opportunities,
                current_value=current.active_opportunities,
                delta=-delta,
                recommendation="Review if status changes were intentional or if context was lost"
            ))

        # Critical opportunities disappeared
        if current.critical_opportunities < previous.critical_opportunities:
            alerts.append(DegradationAlert(
                alert_type="CRITICAL_OPP_DROP",
                severity="critical",
                message=f"Critical opportunities dropped from {previous.critical_opportunities} to {current.critical_opportunities}",
                metric_name="critical_opportunities",
                previous_value=previous.critical_opportunities,
                current_value=current.critical_opportunities,
                delta=current.critical_opportunities - previous.critical_opportunities,
                recommendation="URGENT: Critical opportunities should never disappear without explicit closure"
            ))

        return alerts

    def _check_draft_degradation(
        self,
        previous: HealthSnapshot,
        current: HealthSnapshot
    ) -> List[DegradationAlert]:
        """Check if drafts have been lost."""
        alerts = []

        # Email drafts disappeared
        if current.total_email_drafts < previous.total_email_drafts:
            delta = previous.total_email_drafts - current.total_email_drafts

            # Find which files are missing
            missing = set(previous.email_draft_files) - set(current.email_draft_files)

            alerts.append(DegradationAlert(
                alert_type="EMAIL_DRAFTS_LOST",
                severity="warning",
                message=f"Email drafts dropped from {previous.total_email_drafts} to {current.total_email_drafts} (-{delta}). Missing: {', '.join(list(missing)[:5])}",
                metric_name="email_drafts",
                previous_value=previous.total_email_drafts,
                current_value=current.total_email_drafts,
                delta=-delta,
                recommendation="Check if drafts were overwritten during regeneration. Use draft_ledger to track versions."
            ))

        # Proposal drafts disappeared
        if current.total_proposal_drafts < previous.total_proposal_drafts:
            delta = previous.total_proposal_drafts - current.total_proposal_drafts
            missing = set(previous.proposal_draft_files) - set(current.proposal_draft_files)

            alerts.append(DegradationAlert(
                alert_type="PROPOSAL_DRAFTS_LOST",
                severity="critical",
                message=f"Proposal drafts dropped from {previous.total_proposal_drafts} to {current.total_proposal_drafts} (-{delta}). Missing: {', '.join(list(missing)[:5])}",
                metric_name="proposal_drafts",
                previous_value=previous.total_proposal_drafts,
                current_value=current.total_proposal_drafts,
                delta=-delta,
                recommendation="URGENT: Proposals should never be deleted. Check git history for recovery."
            ))

        return alerts

    def _check_context_degradation(
        self,
        previous: HealthSnapshot,
        current: HealthSnapshot
    ) -> List[DegradationAlert]:
        """Check if context coverage is shrinking."""
        alerts = []

        # Unified context coverage dropped
        if (previous.opportunities_with_unified > 0 and
                current.opportunities_with_unified < previous.opportunities_with_unified):
            alerts.append(DegradationAlert(
                alert_type="CONTEXT_COVERAGE_DROP",
                severity="warning",
                message=f"Unified context coverage dropped from {previous.opportunities_with_unified} to {current.opportunities_with_unified}",
                metric_name="unified_context_coverage",
                previous_value=previous.opportunities_with_unified,
                current_value=current.opportunities_with_unified,
                delta=current.opportunities_with_unified - previous.opportunities_with_unified,
                recommendation="Ensure unified context is generated for all opportunities before drafting"
            ))

        return alerts

    def _check_pipeline_degradation(
        self,
        previous: HealthSnapshot,
        current: HealthSnapshot
    ) -> List[DegradationAlert]:
        """Check if pipeline value is declining."""
        alerts = []

        if (previous.estimated_pipeline_value > 0 and
                current.estimated_pipeline_value < previous.estimated_pipeline_value * 0.8):
            delta = previous.estimated_pipeline_value - current.estimated_pipeline_value
            alerts.append(DegradationAlert(
                alert_type="PIPELINE_VALUE_DROP",
                severity="warning",
                message=f"Pipeline value dropped from ${previous.estimated_pipeline_value:,} to ${current.estimated_pipeline_value:,} (-${delta:,})",
                metric_name="pipeline_value",
                previous_value=previous.estimated_pipeline_value,
                current_value=current.estimated_pipeline_value,
                delta=-delta,
                recommendation="Review opportunity estimates and ensure they haven't been reset to defaults"
            ))

        return alerts

    def _check_absolute_issues(
        self,
        current: HealthSnapshot
    ) -> List[DegradationAlert]:
        """Check for issues regardless of comparison (first-run safe)."""
        alerts = []

        # No opportunities at all
        if current.total_opportunities == 0:
            alerts.append(DegradationAlert(
                alert_type="NO_OPPORTUNITIES",
                severity="critical",
                message="No opportunities found in the system",
                metric_name="total_opportunities",
                current_value=0,
                recommendation="Run a full scan: /bizdev-opportunity scan-deep"
            ))

        # High stale ratio
        if (current.total_opportunities > 0 and
                current.stale_opportunities / current.total_opportunities > 0.3):
            pct = current.stale_opportunities / current.total_opportunities * 100
            alerts.append(DegradationAlert(
                alert_type="HIGH_STALE_RATIO",
                severity="warning",
                message=f"{pct:.0f}% of opportunities are stale ({current.stale_opportunities}/{current.total_opportunities})",
                metric_name="stale_ratio",
                current_value=f"{pct:.0f}%",
                recommendation="Review stale opportunities - close lost ones and re-engage viable ones"
            ))

        # No drafts for critical opportunities
        if current.critical_opportunities > 0 and current.total_email_drafts == 0:
            alerts.append(DegradationAlert(
                alert_type="CRITICAL_WITHOUT_DRAFTS",
                severity="warning",
                message=f"{current.critical_opportunities} critical opportunities exist but no email drafts found",
                metric_name="critical_without_drafts",
                current_value=current.critical_opportunities,
                recommendation="Generate email drafts for critical opportunities immediately"
            ))

        return alerts

    def save_snapshot(self):
        """Save current snapshot and full history."""
        if self.current_snapshot:
            self.snapshots.append(self.current_snapshot)

        # Keep last 30 snapshots
        if len(self.snapshots) > 30:
            self.snapshots = self.snapshots[-30:]

        os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)

        with open(SNAPSHOT_PATH, "w") as f:
            json.dump({
                "metadata": {
                    "schema_version": "1.0.0",
                    "total_snapshots": len(self.snapshots),
                    "updated_at": datetime.utcnow().isoformat()
                },
                "snapshots": [s.to_dict() for s in self.snapshots]
            }, f, indent=2)

    def get_trend_report(self) -> Dict[str, Any]:
        """Generate a trend report across all snapshots."""
        if len(self.snapshots) < 2:
            return {"insufficient_data": True, "snapshots_available": len(self.snapshots)}

        return {
            "period": {
                "from": self.snapshots[0].taken_at,
                "to": self.snapshots[-1].taken_at,
                "snapshots": len(self.snapshots)
            },
            "opportunity_trend": {
                "first": self.snapshots[0].total_opportunities,
                "latest": self.snapshots[-1].total_opportunities,
                "peak": max(s.total_opportunities for s in self.snapshots),
                "trough": min(s.total_opportunities for s in self.snapshots)
            },
            "draft_trend": {
                "email_first": self.snapshots[0].total_email_drafts,
                "email_latest": self.snapshots[-1].total_email_drafts,
                "proposal_first": self.snapshots[0].total_proposal_drafts,
                "proposal_latest": self.snapshots[-1].total_proposal_drafts
            },
            "pipeline_trend": {
                "first": self.snapshots[0].estimated_pipeline_value,
                "latest": self.snapshots[-1].estimated_pipeline_value
            }
        }
