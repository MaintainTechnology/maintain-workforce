"""
Master Command Center Orchestrator for BizDev Intelligence

Single entry point that enforces the anti-degradation protocol:

1. HEALTH CHECK  → Detect regressions before doing anything
2. CONTEXT GATE  → Verify all sources searched before generation
3. GENERATE      → Create drafts/proposals with full context
4. QUALITY GATE  → Evaluate output quality
5. LEDGER LOG    → Record everything for future reference
6. SNAPSHOT      → Save system state for next session

Key Invariant: Steps cannot be skipped. The orchestrator enforces order.
"""

import json
import os
from typing import Dict, Any, List, Optional
from datetime import datetime

from .context_registry import ContextRegistry, ContextState
from .draft_ledger import DraftLedger, DraftEntry
from .degradation_detector import DegradationDetector
from .quality_gates import (
    evaluate_opportunity_quality,
    evaluate_email_quality,
    evaluate_proposal_quality,
    QualityGateResult
)
from .unified_task_streams import (
    UnifiedTaskStore,
    TaskStream,
    TaskPriority,
    TaskSource,
    TaskStatus,
    StreamTask,
)
from .proactive_drafter import (
    ProactiveDrafter,
    TeeUpBrief,
    ReadinessLevel,
    scan_and_teeup,
    get_next_to_generate,
)


# =============================================================================
# PATHS
# =============================================================================

SESSION_LOG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "command-center", "session_log.json"
)


# =============================================================================
# ORCHESTRATOR
# =============================================================================

class CommandCenter:
    """
    Master orchestrator that prevents recursive degradation.

    Every action flows through this class, ensuring:
    - Context is complete before generation
    - Quality is evaluated after generation
    - Everything is logged
    - Degradation is detected

    Usage:
        cc = CommandCenter.initialize()

        # Step 1: Always run health check first
        health = cc.health_check()
        if health["has_degradation"]:
            print("DEGRADATION DETECTED - review alerts before proceeding")

        # Step 2: Before drafting an email, verify context
        ready, failures = cc.verify_context_for_email("opp-001")
        if not ready:
            # System returns what's missing
            cc.gather_missing_context("opp-001", failures)

        # Step 3: Generate with full context
        draft = cc.generate_email_draft("opp-001", email_content, quality_result)

        # Step 4: Finalize session
        cc.finalize_session()
    """

    def __init__(self):
        self.registry: Optional[ContextRegistry] = None
        self.ledger: Optional[DraftLedger] = None
        self.detector: Optional[DegradationDetector] = None
        self.task_store: Optional[UnifiedTaskStore] = None
        self.drafter: Optional[ProactiveDrafter] = None
        self.session_id: str = ""
        self.session_log: List[Dict[str, Any]] = []
        self._initialized = False

    @classmethod
    def initialize(cls) -> "CommandCenter":
        """
        Initialize the Command Center, loading all persistent state.

        This is the ONLY way to create a CommandCenter instance.
        It loads the registry, ledger, and detector, then runs
        an initial health check.
        """
        cc = cls()
        cc.session_id = f"session-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

        # Load persistent components
        cc.registry = ContextRegistry.load()
        cc.ledger = DraftLedger.load()
        cc.detector = DegradationDetector()
        cc.task_store = UnifiedTaskStore.load()
        cc.drafter = ProactiveDrafter()

        cc._initialized = True
        cc._log_event("SESSION_START", {
            "session_id": cc.session_id,
            "registry_size": len(cc.registry.states),
            "ledger_size": len(cc.ledger.entries),
            "task_count": len(cc.task_store.tasks),
        })

        return cc

    def _assert_initialized(self):
        """Guard: ensure initialize() was called."""
        if not self._initialized:
            raise RuntimeError(
                "CommandCenter not initialized. Use CommandCenter.initialize()"
            )

    def _log_event(self, event_type: str, data: Dict[str, Any]):
        """Log an event to the session log."""
        self.session_log.append({
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        })

    # =========================================================================
    # STEP 1: HEALTH CHECK
    # =========================================================================

    def health_check(self) -> Dict[str, Any]:
        """
        Run degradation detection.

        Should be called at the START of every session.
        Returns a report with any detected issues.
        """
        self._assert_initialized()

        report = self.detector.run_health_check()

        self._log_event("HEALTH_CHECK", {
            "has_degradation": report["has_degradation"],
            "alert_count": report["alert_count"],
            "critical_count": report["critical_count"],
            "warning_count": report["warning_count"]
        })

        return report

    # =========================================================================
    # STEP 2: CONTEXT VERIFICATION
    # =========================================================================

    def verify_context_for_email(
        self,
        opportunity_id: str,
        contact_name: str = "",
        contact_email: str = None,
        company: str = None
    ) -> tuple:
        """
        Verify that sufficient context exists for email generation.

        Args:
            opportunity_id: The opportunity to check
            contact_name: Contact name (needed if first time)
            contact_email: Contact email
            company: Company name

        Returns:
            (is_ready: bool, missing_steps: List[str])
        """
        self._assert_initialized()

        # Get or create context state
        state = self.registry.get_or_create(
            opportunity_id, contact_name, contact_email, company
        )

        is_ready = state.evaluate_gate(require_pricing=False)

        self._log_event("CONTEXT_CHECK_EMAIL", {
            "opportunity_id": opportunity_id,
            "is_ready": is_ready,
            "failures": state.context_gate_failures
        })

        return is_ready, state.context_gate_failures

    def verify_context_for_proposal(
        self,
        opportunity_id: str,
        contact_name: str = "",
        contact_email: str = None,
        company: str = None
    ) -> tuple:
        """
        Verify that sufficient context exists for proposal generation.
        Stricter than email - requires pricing extraction.

        Returns:
            (is_ready: bool, missing_steps: List[str])
        """
        self._assert_initialized()

        state = self.registry.get_or_create(
            opportunity_id, contact_name, contact_email, company
        )

        is_ready = state.evaluate_gate(require_pricing=True)

        self._log_event("CONTEXT_CHECK_PROPOSAL", {
            "opportunity_id": opportunity_id,
            "is_ready": is_ready,
            "failures": state.context_gate_failures
        })

        return is_ready, state.context_gate_failures

    def gather_missing_context_instructions(
        self,
        opportunity_id: str,
        failures: List[str]
    ) -> str:
        """
        Generate instructions for gathering missing context.

        Given a list of failures from verify_context, returns
        step-by-step instructions for what needs to be done.
        """
        state = self.registry.get(opportunity_id)
        if not state:
            return "ERROR: Opportunity not in registry"

        instructions = []
        instructions.append(f"## Missing Context for {state.contact_name}")
        instructions.append(f"**Opportunity:** {opportunity_id}")
        instructions.append(f"**Completeness:** {state.context_completeness_score:.0%}")
        instructions.append("")

        for failure in failures:
            if "TRANSCRIPT_NOT_SEARCHED" in failure:
                instructions.append("### 1. Search Transcripts")
                instructions.append(f"Search Google Drive for transcripts mentioning **{state.contact_name}**")
                if state.company:
                    instructions.append(f"Also search for **{state.company}**")
                instructions.append("```")
                instructions.append(f"mcp__google-drive__list_files(folder_id=TRANSCRIPT_FOLDER_ID)")
                instructions.append(f"# Filter for files mentioning: {state.contact_name}")
                instructions.append("```")
                instructions.append("")

            elif "EMAIL_NOT_SEARCHED" in failure:
                instructions.append("### 2. Search Emails")
                search_query = state.contact_name
                if state.contact_email:
                    search_query = f"from:{state.contact_email} OR to:{state.contact_email}"
                instructions.append(f"Search Gmail for exchanges with **{state.contact_name}**")
                instructions.append("```")
                instructions.append(f"# Search: {search_query}")
                instructions.append("```")
                instructions.append("")

            elif "UNIFIED_CONTEXT_MISSING" in failure:
                instructions.append("### 3. Generate Unified Context")
                instructions.append("Merge transcript and email context into unified profile")
                instructions.append("```python")
                instructions.append("from unified_context import generate_unified_context_workflow")
                instructions.append(f'workflow = generate_unified_context_workflow(')
                instructions.append(f'    contact_name="{state.contact_name}",')
                if state.contact_email:
                    instructions.append(f'    contact_email="{state.contact_email}",')
                if state.company:
                    instructions.append(f'    company="{state.company}"')
                instructions.append(f')')
                instructions.append("```")
                instructions.append("")

            elif "PRICING_NOT_EXTRACTED" in failure:
                instructions.append("### 4. Extract Pricing from Transcripts")
                instructions.append(f"Search ALL transcripts mentioning **{state.contact_name}** for pricing:")
                instructions.append("- Look for dollar amounts, rates, discounts")
                instructions.append("- Check for commitment terms (monthly, quarterly, annual)")
                instructions.append("- Note any special arrangements or custom pricing")
                instructions.append("")

            elif "CONTEXT_STALE" in failure:
                instructions.append("### 5. Refresh Stale Context")
                instructions.append("Context is older than 7 days - re-run search to catch new communications")
                instructions.append("")

        return "\n".join(instructions)

    # =========================================================================
    # STEP 3: RECORD CONTEXT GATHERING
    # =========================================================================

    def record_transcript_search(
        self,
        opportunity_id: str,
        source_ids: List[str],
        pain_points: List[str] = None,
        key_quotes: List[str] = None
    ):
        """Record that transcripts have been searched for an opportunity."""
        self._assert_initialized()

        state = self.registry.get(opportunity_id)
        if state:
            state.mark_transcript_searched(source_ids, pain_points, key_quotes)
            self.registry.save()

            self._log_event("TRANSCRIPT_SEARCHED", {
                "opportunity_id": opportunity_id,
                "source_count": len(source_ids),
                "pain_points_found": len(pain_points or [])
            })

    def record_email_search(
        self,
        opportunity_id: str,
        thread_ids: List[str],
        thread_count: int = 0
    ):
        """Record that emails have been searched for an opportunity."""
        self._assert_initialized()

        state = self.registry.get(opportunity_id)
        if state:
            state.mark_email_searched(thread_ids, thread_count)
            self.registry.save()

            self._log_event("EMAIL_SEARCHED", {
                "opportunity_id": opportunity_id,
                "thread_count": thread_count or len(thread_ids)
            })

    def record_unified_context(self, opportunity_id: str):
        """Record that unified context has been generated."""
        self._assert_initialized()

        state = self.registry.get(opportunity_id)
        if state:
            state.mark_unified_context_generated()
            self.registry.save()

            self._log_event("UNIFIED_CONTEXT_GENERATED", {
                "opportunity_id": opportunity_id
            })

    def record_pricing_extraction(
        self,
        opportunity_id: str,
        terms: Dict[str, Any],
        source: str
    ):
        """Record that pricing has been extracted."""
        self._assert_initialized()

        state = self.registry.get(opportunity_id)
        if state:
            state.mark_pricing_extracted(terms, source)
            self.registry.save()

            self._log_event("PRICING_EXTRACTED", {
                "opportunity_id": opportunity_id,
                "source": source,
                "terms": terms
            })

    # =========================================================================
    # STEP 4: DRAFT GENERATION WITH LOGGING
    # =========================================================================

    def log_email_draft(
        self,
        opportunity_id: str,
        contact_name: str,
        content: str,
        file_path: str,
        quality_result: Optional[Dict[str, Any]] = None,
        company: Optional[str] = None,
        iteration_number: int = 1,
        refinement_applied: bool = False,
        refinement_feedback: Optional[str] = None
    ) -> DraftEntry:
        """
        Log an email draft generation to the ledger.

        This should be called AFTER the draft is generated and
        quality-gated.
        """
        self._assert_initialized()

        # Get context state for this opportunity
        ctx_state = self.registry.get(opportunity_id)
        context_sources = {}
        if ctx_state:
            context_sources = {
                "transcript_searched": ctx_state.transcript_searched,
                "transcript_ids": ctx_state.transcript_source_ids,
                "email_searched": ctx_state.email_searched,
                "email_thread_ids": ctx_state.email_thread_ids,
                "unified_context_used": ctx_state.unified_context_generated,
                "pricing_extracted": ctx_state.pricing_extracted,
                "pricing_terms": ctx_state.pricing_terms
            }

        entry = self.ledger.log_draft(
            opportunity_id=opportunity_id,
            draft_type="email",
            contact_name=contact_name,
            content=content,
            file_path=file_path,
            quality_result=quality_result,
            context_sources=context_sources,
            company=company,
            iteration_number=iteration_number,
            refinement_applied=refinement_applied,
            refinement_feedback=refinement_feedback
        )

        self.ledger.save()

        self._log_event("EMAIL_DRAFT_LOGGED", {
            "draft_id": entry.draft_id,
            "opportunity_id": opportunity_id,
            "version": entry.version,
            "quality_score": entry.quality_score,
            "gate_passed": entry.quality_gate_passed
        })

        return entry

    def log_proposal_draft(
        self,
        opportunity_id: str,
        contact_name: str,
        content: str,
        file_path: str,
        quality_result: Optional[Dict[str, Any]] = None,
        company: Optional[str] = None,
        iteration_number: int = 1,
        refinement_applied: bool = False,
        refinement_feedback: Optional[str] = None
    ) -> DraftEntry:
        """Log a proposal draft generation to the ledger."""
        self._assert_initialized()

        ctx_state = self.registry.get(opportunity_id)
        context_sources = {}
        if ctx_state:
            context_sources = {
                "transcript_searched": ctx_state.transcript_searched,
                "transcript_ids": ctx_state.transcript_source_ids,
                "email_searched": ctx_state.email_searched,
                "email_thread_ids": ctx_state.email_thread_ids,
                "unified_context_used": ctx_state.unified_context_generated,
                "pricing_extracted": ctx_state.pricing_extracted,
                "pricing_terms": ctx_state.pricing_terms
            }

        entry = self.ledger.log_draft(
            opportunity_id=opportunity_id,
            draft_type="proposal",
            contact_name=contact_name,
            content=content,
            file_path=file_path,
            quality_result=quality_result,
            context_sources=context_sources,
            company=company,
            iteration_number=iteration_number,
            refinement_applied=refinement_applied,
            refinement_feedback=refinement_feedback
        )

        self.ledger.save()

        self._log_event("PROPOSAL_DRAFT_LOGGED", {
            "draft_id": entry.draft_id,
            "opportunity_id": opportunity_id,
            "version": entry.version,
            "quality_score": entry.quality_score,
            "gate_passed": entry.quality_gate_passed
        })

        return entry

    # =========================================================================
    # MULTI-STREAM TASK MANAGEMENT
    # =========================================================================

    def add_task(
        self,
        title: str,
        stream: str,
        source: str = "manual_entry",
        priority: str = "medium",
        owner: str = "",
        description: str = "",
        due_date: Optional[str] = None,
        related_opportunity_id: Optional[str] = None,
        tags: List[str] = None,
    ) -> Dict[str, Any]:
        """
        Add a task to the unified task store.

        Args:
            title: Task description
            stream: "personal", "product", or "professional"
            source: Where it came from (motion_recap, slack_message, etc.)
            priority: "critical", "high", "medium", or "low"
            owner: Who owns it (jeff, julie, ayen, anant)
            description: Additional details
            due_date: Optional YYYY-MM-DD
            related_opportunity_id: Link to bizdev opportunity
            tags: Additional labels

        Returns:
            Dict with the created task
        """
        self._assert_initialized()

        task = self.task_store.add_task(
            title=title,
            stream=TaskStream(stream),
            source=TaskSource(source),
            priority=TaskPriority(priority),
            owner=owner,
            description=description,
            due_date=due_date,
            related_opportunity_id=related_opportunity_id,
            tags=tags or [],
        )

        self.task_store.save()

        self._log_event("TASK_ADDED", {
            "task_id": task.id,
            "stream": stream,
            "title": title,
            "owner": task.owner,
        })

        return task.to_dict()

    def complete_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Mark a task as completed."""
        self._assert_initialized()

        task = self.task_store.complete_task(task_id)
        if task:
            self.task_store.save()
            self._log_event("TASK_COMPLETED", {
                "task_id": task_id,
                "stream": task.stream.value,
            })
            return task.to_dict()
        return None

    def get_task_summary(self) -> Dict[str, Any]:
        """Get unified task summary across all three streams."""
        self._assert_initialized()
        return self.task_store.get_global_summary()

    def get_today_actions(self) -> List[Dict[str, Any]]:
        """Get today's priority actions across all streams."""
        self._assert_initialized()
        return [t.to_dict() for t in self.task_store.get_today_actions()]

    def get_stream_tasks(self, stream: str, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get tasks for a specific stream."""
        self._assert_initialized()
        return [
            t.to_dict()
            for t in self.task_store.get_by_stream(TaskStream(stream), active_only)
        ]

    def get_owner_queue(self, owner: str) -> List[Dict[str, Any]]:
        """Get task queue for a specific team member."""
        self._assert_initialized()
        return [t.to_dict() for t in self.task_store.get_by_owner(owner)]

    def import_bizdev_tasks(self, opportunities: List[Dict[str, Any]]) -> int:
        """Import professional tasks from the bizdev pipeline."""
        self._assert_initialized()
        count = self.task_store.import_from_bizdev_pipeline(opportunities)
        self.task_store.save()
        self._log_event("BIZDEV_TASKS_IMPORTED", {"count": count})
        return count

    def import_motion_tasks(self, recaps: List[Dict[str, Any]]) -> int:
        """Import tasks from Motion meeting recaps (all three streams)."""
        self._assert_initialized()
        count = self.task_store.import_from_motion_recaps(recaps)
        self.task_store.save()
        self._log_event("MOTION_TASKS_IMPORTED", {"count": count})
        return count

    def import_slack_tasks(self, tasks: List[Dict[str, Any]]) -> int:
        """Import tasks from Slack messages."""
        self._assert_initialized()
        count = self.task_store.import_from_slack_tasks(tasks)
        self.task_store.save()
        self._log_event("SLACK_TASKS_IMPORTED", {"count": count})
        return count

    # =========================================================================
    # PROACTIVE DRAFT TEE-UP (Document Studio Integration)
    # =========================================================================

    def scan_for_teeup(
        self,
        opportunities: List[Dict[str, Any]],
        min_priority: float = 50.0,
    ) -> Dict[str, Any]:
        """
        Scan the pipeline for opportunities ready to have drafts/proposals
        teed up via document-studio.

        Returns a summary of what's ready to generate.
        """
        self._assert_initialized()

        # Load registry and ledger data for the drafter
        registry_data = {"states": [
            s.to_dict() for s in self.registry.states.values()
        ]}
        ledger_data = {"entries": [
            e.to_dict() for e in self.ledger.entries
        ]}

        self.drafter.load_pipeline_data(
            opportunities, registry_data, ledger_data
        )
        self.drafter.scan_for_ready_opportunities(min_priority=min_priority)
        self.drafter.save_queue()

        summary = self.drafter.get_generation_summary()

        self._log_event("TEEUP_SCAN", {
            "ready": summary["ready_count"],
            "almost_ready": summary["almost_ready_count"],
            "ready_emails": summary["ready_emails"],
            "ready_proposals": summary["ready_proposals"],
        })

        return summary

    def get_next_teeup(self) -> Optional[Dict[str, Any]]:
        """
        Get the highest-priority brief ready for document-studio generation.

        Returns the brief with instructions for invoking document-studio.
        """
        self._assert_initialized()

        ready = self.drafter.get_ready_queue()
        if not ready:
            return None

        brief = ready[0]
        return {
            "brief": brief.to_dict(),
            "instructions": brief.document_studio_instructions,
            "output_path": brief.suggested_output_path,
            "contact": brief.contact_name,
            "company": brief.company,
            "type": brief.draft_type.value,
        }

    def get_teeup_unblock_actions(self) -> Dict[str, List[str]]:
        """
        Get instructions for unblocking almost-ready drafts.

        Returns a dict of opportunity:draft_type -> list of steps needed.
        """
        self._assert_initialized()
        return self.drafter.get_unblock_instructions()

    # =========================================================================
    # STEP 5: SESSION REPORTS
    # =========================================================================

    def get_status_report(self) -> Dict[str, Any]:
        """
        Generate a comprehensive status report for the current session.

        Returns everything needed to understand system health at a glance,
        including all three task streams and proactive draft readiness.
        """
        self._assert_initialized()

        return {
            "session_id": self.session_id,
            "generated_at": datetime.utcnow().isoformat(),
            "registry": self.registry.get_summary(),
            "ledger": self.ledger.get_global_quality_stats(),
            "context_usage": self.ledger.get_context_usage_stats(),
            "incomplete_opportunities": self.registry.get_incomplete_opportunities(),
            "task_streams": self.task_store.get_global_summary(),
            "teeup_queue": self.drafter.get_generation_summary() if self.drafter.briefs else None,
            "session_events": len(self.session_log),
        }

    def get_opportunity_briefing(self, opportunity_id: str) -> Dict[str, Any]:
        """
        Get a complete briefing for an opportunity including context
        state, draft history, and quality trends.
        """
        self._assert_initialized()

        ctx_state = self.registry.get(opportunity_id)
        email_history = self.ledger.get_history(opportunity_id, "email")
        proposal_history = self.ledger.get_history(opportunity_id, "proposal")
        email_trend = self.ledger.get_quality_trend(opportunity_id, "email")
        proposal_trend = self.ledger.get_quality_trend(opportunity_id, "proposal")

        return {
            "opportunity_id": opportunity_id,
            "context": ctx_state.to_dict() if ctx_state else None,
            "email_drafts": {
                "total_versions": len(email_history),
                "latest": email_history[-1].to_dict() if email_history else None,
                "quality_trend": email_trend
            },
            "proposal_drafts": {
                "total_versions": len(proposal_history),
                "latest": proposal_history[-1].to_dict() if proposal_history else None,
                "quality_trend": proposal_trend
            },
            "ready_for_email": ctx_state.evaluate_gate(require_pricing=False) if ctx_state else False,
            "ready_for_proposal": ctx_state.evaluate_gate(require_pricing=True) if ctx_state else False
        }

    # =========================================================================
    # STEP 6: FINALIZE SESSION
    # =========================================================================

    def finalize_session(self):
        """
        Finalize the session: save all state and take a health snapshot.

        This MUST be called at the end of every session to prevent
        context loss.
        """
        self._assert_initialized()

        self._log_event("SESSION_END", {
            "session_id": self.session_id,
            "total_events": len(self.session_log)
        })

        # Save all persistent state
        self.registry.save()
        self.ledger.save()
        self.task_store.save()

        # Save proactive drafter queue if scanned
        if self.drafter.briefs:
            self.drafter.save_queue()

        # Take a health snapshot for next session comparison
        self.detector.save_snapshot()

        # Save session log
        self._save_session_log()

    def _save_session_log(self):
        """Save the session log to disk."""
        os.makedirs(os.path.dirname(SESSION_LOG_PATH), exist_ok=True)

        # Load existing logs
        existing_sessions = []
        if os.path.exists(SESSION_LOG_PATH):
            try:
                with open(SESSION_LOG_PATH, "r") as f:
                    data = json.load(f)
                existing_sessions = data.get("sessions", [])
            except (json.JSONDecodeError, KeyError):
                pass

        # Add current session
        existing_sessions.append({
            "session_id": self.session_id,
            "started_at": self.session_log[0]["timestamp"] if self.session_log else "",
            "ended_at": datetime.utcnow().isoformat(),
            "event_count": len(self.session_log),
            "events": self.session_log
        })

        # Keep last 20 sessions
        if len(existing_sessions) > 20:
            existing_sessions = existing_sessions[-20:]

        with open(SESSION_LOG_PATH, "w") as f:
            json.dump({
                "metadata": {
                    "schema_version": "1.0.0",
                    "total_sessions_logged": len(existing_sessions),
                    "updated_at": datetime.utcnow().isoformat()
                },
                "sessions": existing_sessions
            }, f, indent=2)


# =============================================================================
# CONVENIENCE FUNCTIONS (for use in SKILL.md workflows)
# =============================================================================

def quick_health_check() -> Dict[str, Any]:
    """
    Run a quick health check without initializing the full command center.
    Useful for a fast status overview.
    """
    detector = DegradationDetector()
    return detector.run_health_check()


def get_pipeline_status() -> Dict[str, Any]:
    """
    Get a quick pipeline status overview.
    """
    registry = ContextRegistry.load()
    ledger = DraftLedger.load()

    return {
        "registry": registry.get_summary(),
        "ledger": ledger.get_global_quality_stats(),
        "context_usage": ledger.get_context_usage_stats()
    }


# =============================================================================
# WORKFLOW DOCUMENTATION
# =============================================================================

COMMAND_CENTER_WORKFLOW = """
## Master Command Center - Session Protocol (v2: Multi-Stream + Proactive Drafts)

### Every Session Must Follow This Protocol:

```
1. INITIALIZE
   cc = CommandCenter.initialize()

2. HEALTH CHECK (always first)
   health = cc.health_check()
   if health["has_degradation"]:
       for alert in health["alerts"]:
           print(f"[{alert['severity']}] {alert['message']}")

3. TASK STREAMS - View unified tasks across all streams
   summary = cc.get_task_summary()        # Global overview
   today = cc.get_today_actions()          # Critical + overdue
   personal = cc.get_stream_tasks("personal")
   product = cc.get_stream_tasks("product")
   professional = cc.get_stream_tasks("professional")
   jeff_queue = cc.get_owner_queue("jeff")  # Team member view

4. IMPORT TASKS from sources
   cc.import_bizdev_tasks(opportunities)   # From pipeline
   cc.import_motion_tasks(recaps)          # From Motion recaps
   cc.import_slack_tasks(slack_tasks)      # From Slack

5. PROACTIVE DRAFTS - Scan for ready-to-generate opportunities
   teeup = cc.scan_for_teeup(opportunities)  # Returns summary
   next_draft = cc.get_next_teeup()          # Highest priority ready brief
   # next_draft["instructions"] → pass to document-studio
   unblock = cc.get_teeup_unblock_actions()  # Steps to unblock almost-ready

6. VERIFY CONTEXT (before manual generation)
   ready, failures = cc.verify_context_for_email("opp-001")
   if not ready:
       instructions = cc.gather_missing_context_instructions("opp-001", failures)
       cc.record_transcript_search("opp-001", ["file-123"], pain_points=[...])
       cc.record_email_search("opp-001", ["thread-abc"])
       cc.record_unified_context("opp-001")

7. GENERATE & LOG
   cc.log_email_draft(
       opportunity_id="opp-001",
       contact_name="Dr. Smith",
       content=email_content,
       file_path=".bizdev/drafts/emails/opp-001-warm.md",
       quality_result=gate_result.to_dict()
   )

8. TASK MANAGEMENT
   cc.add_task("Follow up with Larry", stream="professional", priority="high")
   cc.complete_task("prof-0001")

9. FINALIZE (always last)
   cc.finalize_session()
```

### Key Rules:

1. NEVER skip the health check
2. NEVER generate without verifying context first
3. NEVER overwrite a draft without logging the new version
4. ALWAYS finalize the session to save state
5. If health check shows degradation, address it before doing new work
6. Use scan_for_teeup() to proactively identify what's ready for document-studio
7. Import tasks from ALL sources (bizdev, Motion, Slack) for full visibility

### Quick Commands:

- Health check only: `quick_health_check()`
- Pipeline status: `get_pipeline_status()`
- Task counts: `quick_task_count()`
- Next draft ready: `get_next_to_generate()`
- Full tee-up scan: `scan_and_teeup()`
- Full session: `CommandCenter.initialize()` → workflow → `finalize_session()`
"""
