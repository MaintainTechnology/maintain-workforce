"""
Proactive Drafter - Document Studio integration for auto-teed-up drafts/proposals

Scans the opportunity pipeline and context registry to identify opportunities
that are READY for drafting, then generates tee-up briefs that can be handed
to the document-studio skill for proposal/email generation.

This is the bridge between the Command Center's readiness assessment and
the document-studio's generation capabilities.

Flow:
    Command Center → Context Registry → Proactive Drafter → Document Studio
                                            ↓
                                      Draft Ledger (logs result)

Key Principle: Nothing is generated unless context is verified complete.
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum


# =============================================================================
# DRAFT READINESS TYPES
# =============================================================================

class DraftType(str, Enum):
    """Types of documents that can be proactively teed up."""
    EMAIL_COLD = "email_cold"
    EMAIL_WARM = "email_warm"
    EMAIL_REENGAGEMENT = "email_reengagement"
    PROPOSAL_CONSULTING = "proposal_consulting"
    PROPOSAL_ENTERPRISE = "proposal_enterprise"
    ONE_PAGER = "one_pager"
    FLYER = "flyer"


class ReadinessLevel(str, Enum):
    """How ready an opportunity is for draft generation."""
    READY = "ready"           # All context gathered, quality gate passed
    ALMOST = "almost"         # 1-2 minor gaps (e.g., missing pricing for email)
    BLOCKED = "blocked"       # Major context missing (no transcript, no email)
    ALREADY_DRAFTED = "already_drafted"  # Draft exists and quality is good
    NOT_APPLICABLE = "not_applicable"    # Wrong stage or status


# =============================================================================
# TEE-UP BRIEF
# =============================================================================

@dataclass
class TeeUpBrief:
    """
    A brief describing everything needed to generate a draft/proposal
    via document-studio.

    This is the hand-off document from Command Center to document-studio.
    """
    opportunity_id: str
    contact_name: str
    company: str
    contact_email: str
    draft_type: DraftType
    readiness: ReadinessLevel

    # Context gathered (from context registry)
    transcript_sources: List[str] = field(default_factory=list)
    email_threads: List[str] = field(default_factory=list)
    pain_points: List[str] = field(default_factory=list)
    key_quotes: List[str] = field(default_factory=list)
    pricing_terms: Optional[Dict[str, Any]] = None

    # Proposal-specific
    opportunity_type: str = "consulting"
    recommended_tier: str = "mid"
    proposal_framing: Optional[Dict[str, Any]] = None

    # Email-specific
    conversation_stage: str = "new"      # new, warm, cooling, stale
    days_since_contact: int = 0
    last_outbound_date: Optional[str] = None
    last_inbound_date: Optional[str] = None

    # Generation instructions
    suggested_output_path: str = ""
    document_studio_instructions: str = ""

    # Tracking
    generated_at: str = ""
    priority_score: float = 0.0
    missing_context: List[str] = field(default_factory=list)

    # Existing draft info (if any)
    existing_draft_path: Optional[str] = None
    existing_draft_quality: Optional[float] = None
    existing_draft_version: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "opportunityId": self.opportunity_id,
            "contactName": self.contact_name,
            "company": self.company,
            "contactEmail": self.contact_email,
            "draftType": self.draft_type.value,
            "readiness": self.readiness.value,
            "transcriptSources": self.transcript_sources,
            "emailThreads": self.email_threads,
            "painPoints": self.pain_points,
            "keyQuotes": self.key_quotes,
            "pricingTerms": self.pricing_terms,
            "opportunityType": self.opportunity_type,
            "recommendedTier": self.recommended_tier,
            "proposalFraming": self.proposal_framing,
            "conversationStage": self.conversation_stage,
            "daysSinceContact": self.days_since_contact,
            "lastOutboundDate": self.last_outbound_date,
            "lastInboundDate": self.last_inbound_date,
            "suggestedOutputPath": self.suggested_output_path,
            "documentStudioInstructions": self.document_studio_instructions,
            "generatedAt": self.generated_at,
            "priorityScore": self.priority_score,
            "missingContext": self.missing_context,
            "existingDraftPath": self.existing_draft_path,
            "existingDraftQuality": self.existing_draft_quality,
            "existingDraftVersion": self.existing_draft_version,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TeeUpBrief":
        return cls(
            opportunity_id=data["opportunityId"],
            contact_name=data["contactName"],
            company=data.get("company", ""),
            contact_email=data.get("contactEmail", ""),
            draft_type=DraftType(data["draftType"]),
            readiness=ReadinessLevel(data["readiness"]),
            transcript_sources=data.get("transcriptSources", []),
            email_threads=data.get("emailThreads", []),
            pain_points=data.get("painPoints", []),
            key_quotes=data.get("keyQuotes", []),
            pricing_terms=data.get("pricingTerms"),
            opportunity_type=data.get("opportunityType", "consulting"),
            recommended_tier=data.get("recommendedTier", "mid"),
            proposal_framing=data.get("proposalFraming"),
            conversation_stage=data.get("conversationStage", "new"),
            days_since_contact=data.get("daysSinceContact", 0),
            last_outbound_date=data.get("lastOutboundDate"),
            last_inbound_date=data.get("lastInboundDate"),
            suggested_output_path=data.get("suggestedOutputPath", ""),
            document_studio_instructions=data.get("documentStudioInstructions", ""),
            generated_at=data.get("generatedAt", ""),
            priority_score=data.get("priorityScore", 0.0),
            missing_context=data.get("missingContext", []),
            existing_draft_path=data.get("existingDraftPath"),
            existing_draft_quality=data.get("existingDraftQuality"),
            existing_draft_version=data.get("existingDraftVersion", 0),
        )


# =============================================================================
# PROACTIVE DRAFTER
# =============================================================================

# Path for tee-up queue
TEEUP_QUEUE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "command-center", "teeup_queue.json"
)

# Existing draft directories
DRAFT_EMAILS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "drafts", "emails"
)
DRAFT_PROPOSALS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", ".bizdev", "drafts", "proposals"
)


class ProactiveDrafter:
    """
    Scans opportunities and generates tee-up briefs for document-studio.

    The drafter does NOT generate content itself - it prepares everything
    needed so document-studio can generate with full context.
    """

    def __init__(self):
        self.briefs: List[TeeUpBrief] = []
        self._opportunities: List[Dict[str, Any]] = []
        self._context_states: Dict[str, Dict[str, Any]] = {}
        self._draft_history: Dict[str, List[Dict[str, Any]]] = {}

    def load_pipeline_data(
        self,
        opportunities: List[Dict[str, Any]],
        context_registry_data: Optional[Dict[str, Any]] = None,
        draft_ledger_data: Optional[Dict[str, Any]] = None,
    ):
        """Load current pipeline state for analysis."""
        self._opportunities = opportunities

        if context_registry_data:
            for state in context_registry_data.get("states", []):
                opp_id = state.get("opportunity_id", "")
                if opp_id:
                    self._context_states[opp_id] = state

        if draft_ledger_data:
            for entry in draft_ledger_data.get("entries", []):
                opp_id = entry.get("opportunity_id", "")
                if opp_id not in self._draft_history:
                    self._draft_history[opp_id] = []
                self._draft_history[opp_id].append(entry)

    def scan_for_ready_opportunities(
        self,
        min_priority: float = 50.0,
        include_almost_ready: bool = True,
    ) -> List[TeeUpBrief]:
        """
        Scan all opportunities and generate tee-up briefs for those
        that are ready (or almost ready) for drafting.

        Returns briefs sorted by priority (highest first).
        """
        self.briefs = []

        for opp in self._opportunities:
            priority_score = opp.get("priorityScore", 0)
            if priority_score < min_priority:
                continue

            status = opp.get("status", "")
            if status in ("closed",):
                continue

            # Determine what drafts are needed
            needed_drafts = self._determine_needed_drafts(opp)

            for draft_type in needed_drafts:
                brief = self._build_brief(opp, draft_type)

                if brief.readiness == ReadinessLevel.READY:
                    self.briefs.append(brief)
                elif brief.readiness == ReadinessLevel.ALMOST and include_almost_ready:
                    self.briefs.append(brief)

        # Sort by priority (highest first), then readiness (ready before almost)
        self.briefs.sort(key=lambda b: (
            0 if b.readiness == ReadinessLevel.READY else 1,
            -b.priority_score,
        ))

        return self.briefs

    def _determine_needed_drafts(self, opp: Dict[str, Any]) -> List[DraftType]:
        """Determine what draft types are needed for this opportunity."""
        opp_id = opp.get("id", "")
        opp_type = opp.get("opportunityType", "consulting")
        stage = opp.get("stage", "discovered")
        days_since = opp.get("daysSinceContact", 0)
        priority_score = opp.get("priorityScore", 0)
        status = opp.get("status", "active")

        needed = []

        # Email is almost always needed
        if status == "stale" or days_since > 30:
            needed.append(DraftType.EMAIL_REENGAGEMENT)
        elif stage in ("discovered", "qualified") and days_since <= 7:
            needed.append(DraftType.EMAIL_WARM)
        elif stage == "discovered":
            needed.append(DraftType.EMAIL_COLD)
        else:
            needed.append(DraftType.EMAIL_WARM)

        # Proposal for high-priority opportunities
        if priority_score >= 70 and stage in ("qualified", "engaged", "proposal_sent"):
            if opp_type in ("consulting", "membership", "report_generator"):
                needed.append(DraftType.PROPOSAL_CONSULTING)
            elif opp_type == "commons_partnership":
                needed.append(DraftType.PROPOSAL_ENTERPRISE)

        # Filter out already-drafted items with good quality
        draft_history = self._draft_history.get(opp_id, [])
        filtered = []
        for draft_type in needed:
            has_good_draft = False
            for entry in draft_history:
                entry_type = entry.get("draft_type", "")
                quality = entry.get("quality_score", 0)
                if (
                    ("email" in draft_type.value and entry_type == "email" and quality >= 0.7)
                    or ("proposal" in draft_type.value and entry_type == "proposal" and quality >= 0.7)
                ):
                    has_good_draft = True
                    break
            if not has_good_draft:
                filtered.append(draft_type)

        return filtered

    def _build_brief(self, opp: Dict[str, Any], draft_type: DraftType) -> TeeUpBrief:
        """Build a tee-up brief for a specific opportunity + draft type."""
        opp_id = opp.get("id", "")
        contact = opp.get("contact", {})
        contact_name = contact.get("name", "Unknown")
        company = contact.get("company", "")
        contact_email = contact.get("email", "")
        opp_type = opp.get("opportunityType", "consulting")

        # Check context state
        ctx = self._context_states.get(opp_id, {})
        transcript_searched = ctx.get("transcript_searched", False)
        email_searched = ctx.get("email_searched", False)
        unified_context = ctx.get("unified_context_generated", False)
        pricing_extracted = ctx.get("pricing_extracted", False)

        # Determine readiness
        missing = []
        if not transcript_searched:
            missing.append("TRANSCRIPT_NOT_SEARCHED")
        if not email_searched:
            missing.append("EMAIL_NOT_SEARCHED")
        if not unified_context:
            missing.append("UNIFIED_CONTEXT_MISSING")

        is_proposal = "proposal" in draft_type.value
        if is_proposal and not pricing_extracted:
            missing.append("PRICING_NOT_EXTRACTED")

        if not missing:
            readiness = ReadinessLevel.READY
        elif len(missing) <= 1 and not is_proposal:
            readiness = ReadinessLevel.ALMOST
        elif len(missing) <= 1 and is_proposal and "PRICING_NOT_EXTRACTED" not in missing:
            readiness = ReadinessLevel.ALMOST
        else:
            readiness = ReadinessLevel.BLOCKED

        # Check for existing drafts
        existing_path = self._find_existing_draft(opp_id, contact_name, draft_type)
        existing_quality = None
        existing_version = 0
        for entry in self._draft_history.get(opp_id, []):
            if ("email" in draft_type.value and entry.get("draft_type") == "email") or \
               ("proposal" in draft_type.value and entry.get("draft_type") == "proposal"):
                existing_version = max(existing_version, entry.get("version", 0))
                if entry.get("quality_score"):
                    existing_quality = entry["quality_score"]

        # Determine conversation stage
        days_since = opp.get("daysSinceContact", 0)
        if days_since == 0:
            conv_stage = "new"
        elif days_since <= 7:
            conv_stage = "warm"
        elif days_since <= 30:
            conv_stage = "cooling"
        else:
            conv_stage = "stale"

        # Build suggested output path
        name_slug = contact_name.lower().replace(" ", "-").replace(".", "")[:30]
        date_str = datetime.now().strftime("%Y-%m-%d")
        if "email" in draft_type.value:
            suggested_path = f".bizdev/drafts/emails/{opp_id}-{name_slug}.md"
        else:
            suggested_path = f".bizdev/drafts/proposals/{opp_id}-{name_slug}.html"

        # Build document-studio invocation instructions
        instructions = self._build_studio_instructions(
            opp, draft_type, ctx, conv_stage
        )

        return TeeUpBrief(
            opportunity_id=opp_id,
            contact_name=contact_name,
            company=company,
            contact_email=contact_email,
            draft_type=draft_type,
            readiness=readiness,
            transcript_sources=ctx.get("transcript_source_ids", []),
            email_threads=ctx.get("email_thread_ids", []),
            pain_points=ctx.get("pain_points", []),
            key_quotes=ctx.get("key_quotes", []),
            pricing_terms=ctx.get("pricing_terms"),
            opportunity_type=opp_type,
            recommended_tier=self._recommend_tier(opp),
            conversation_stage=conv_stage,
            days_since_contact=days_since,
            last_outbound_date=opp.get("lastOutboundDate"),
            last_inbound_date=opp.get("lastInboundDate"),
            suggested_output_path=suggested_path,
            document_studio_instructions=instructions,
            generated_at=datetime.utcnow().isoformat(),
            priority_score=opp.get("priorityScore", 0),
            missing_context=missing,
            existing_draft_path=existing_path,
            existing_draft_quality=existing_quality,
            existing_draft_version=existing_version,
        )

    def _find_existing_draft(
        self, opp_id: str, contact_name: str, draft_type: DraftType
    ) -> Optional[str]:
        """Check if a draft file already exists on disk."""
        name_slug = contact_name.lower().replace(" ", "-").replace(".", "")

        if "email" in draft_type.value:
            search_dir = DRAFT_EMAILS_DIR
            patterns = [
                f"{opp_id}-{name_slug}.md",
                f"{opp_id}*.md",
            ]
        else:
            search_dir = DRAFT_PROPOSALS_DIR
            patterns = [
                f"{opp_id}-{name_slug}.html",
                f"{opp_id}*.html",
            ]

        if not os.path.isdir(search_dir):
            return None

        for filename in os.listdir(search_dir):
            for pattern in patterns:
                if pattern.replace("*", "") in filename:
                    return os.path.join(search_dir, filename)

        return None

    def _recommend_tier(self, opp: Dict[str, Any]) -> str:
        """Recommend pricing tier based on signals."""
        signals = opp.get("signals", [])
        confidence = opp.get("confidenceScore", 50)

        has_budget = any(s.get("type") == "budget_mention" for s in signals)
        has_decision_maker = any(s.get("type") == "decision_maker" for s in signals)

        score = 0
        if has_budget:
            score += 2
        if has_decision_maker:
            score += 1
        if confidence >= 70:
            score += 2

        if score >= 4:
            return "high"
        elif score >= 2:
            return "mid"
        return "low"

    def _build_studio_instructions(
        self,
        opp: Dict[str, Any],
        draft_type: DraftType,
        ctx: Dict[str, Any],
        conv_stage: str,
    ) -> str:
        """
        Build document-studio invocation instructions.

        These instructions tell the document-studio skill exactly
        what to generate and with what context.
        """
        contact = opp.get("contact", {})
        contact_name = contact.get("name", "Unknown")
        company = contact.get("company", "")
        opp_type = opp.get("opportunityType", "consulting")

        lines = []

        if "proposal" in draft_type.value:
            lines.append(f"## Document Studio: Generate Proposal")
            lines.append(f"")
            lines.append(f"**Invoke:** `/document-studio`")
            lines.append(f"**Type:** Proposal")
            lines.append(f"**Client:** {contact_name}")
            lines.append(f"**Company:** {company}")
            lines.append(f"**Opportunity Type:** {opp_type}")
            lines.append(f"")
            lines.append(f"### Context Inputs")
            lines.append(f"- Transcripts searched: {len(ctx.get('transcript_source_ids', []))}")
            lines.append(f"- Email threads found: {len(ctx.get('email_thread_ids', []))}")
            if ctx.get("pricing_terms"):
                lines.append(f"- Pricing terms: {json.dumps(ctx['pricing_terms'])}")
            if ctx.get("pain_points"):
                lines.append(f"- Pain points:")
                for pp in ctx["pain_points"]:
                    lines.append(f"  - {pp}")
            lines.append(f"")
            lines.append(f"### Proposal Requirements")
            lines.append(f"1. Use proposal template from document-studio/templates/")
            lines.append(f"2. Follow voice-and-style.md guidelines")
            lines.append(f"3. Reference ngm-programs.md for accurate program descriptions")
            lines.append(f"4. Apply design-system.md for styling")
            lines.append(f"5. Include pricing from transcript (NOT defaults)")
            lines.append(f"6. Structure: Header > Executive Summary > Understanding > Solution > Why NGM > Investment > Next Steps")
        else:
            email_subtype = draft_type.value.replace("email_", "")
            lines.append(f"## Document Studio: Generate Email Draft")
            lines.append(f"")
            lines.append(f"**Type:** {email_subtype.title()} email")
            lines.append(f"**To:** {contact_name} ({contact.get('email', 'unknown')})")
            lines.append(f"**Company:** {company}")
            lines.append(f"**Conversation Stage:** {conv_stage}")
            lines.append(f"**Days Since Contact:** {opp.get('daysSinceContact', 0)}")
            lines.append(f"")
            lines.append(f"### Context Inputs")
            if ctx.get("pain_points"):
                lines.append(f"- Pain points to address:")
                for pp in ctx["pain_points"]:
                    lines.append(f"  - {pp}")
            if ctx.get("key_quotes"):
                lines.append(f"- Their words to reference:")
                for kq in ctx["key_quotes"]:
                    lines.append(f"  - \"{kq}\"")
            lines.append(f"")
            lines.append(f"### Email Requirements")
            lines.append(f"1. Follow voice-and-style.md (confident, specific, outcome-focused)")
            lines.append(f"2. Reference their ACTUAL words from transcripts/emails")
            lines.append(f"3. Open with value, not cliche phrases")
            lines.append(f"4. Single clear CTA")
            if email_subtype == "cold":
                lines.append(f"5. Under 200 words")
            elif email_subtype == "warm":
                lines.append(f"5. Under 300 words")
                lines.append(f"6. Reference prior conversation naturally")
            elif email_subtype == "reengagement":
                lines.append(f"5. Lead with new value/insight")
                lines.append(f"6. Don't guilt-trip about silence")

        return "\n".join(lines)

    # =========================================================================
    # QUEUE MANAGEMENT
    # =========================================================================

    def get_ready_queue(self) -> List[TeeUpBrief]:
        """Get all READY briefs (can be generated immediately)."""
        return [b for b in self.briefs if b.readiness == ReadinessLevel.READY]

    def get_almost_ready_queue(self) -> List[TeeUpBrief]:
        """Get ALMOST ready briefs (need 1-2 more context steps)."""
        return [b for b in self.briefs if b.readiness == ReadinessLevel.ALMOST]

    def get_unblock_instructions(self) -> Dict[str, List[str]]:
        """
        For each almost-ready brief, return what needs to be done
        to unblock it.
        """
        instructions = {}
        for brief in self.get_almost_ready_queue():
            key = f"{brief.opportunity_id}:{brief.draft_type.value}"
            steps = []
            for gap in brief.missing_context:
                if gap == "TRANSCRIPT_NOT_SEARCHED":
                    steps.append(
                        f"Search transcripts for '{brief.contact_name}'"
                        + (f" / '{brief.company}'" if brief.company else "")
                    )
                elif gap == "EMAIL_NOT_SEARCHED":
                    steps.append(
                        f"Search emails for '{brief.contact_email or brief.contact_name}'"
                    )
                elif gap == "UNIFIED_CONTEXT_MISSING":
                    steps.append("Generate unified context from transcript + email data")
                elif gap == "PRICING_NOT_EXTRACTED":
                    steps.append(
                        f"Extract pricing from transcripts for '{brief.contact_name}'"
                    )
            instructions[key] = steps
        return instructions

    def get_generation_summary(self) -> Dict[str, Any]:
        """Summary of what's ready to generate."""
        ready = self.get_ready_queue()
        almost = self.get_almost_ready_queue()

        return {
            "ready_count": len(ready),
            "almost_ready_count": len(almost),
            "ready_emails": len([b for b in ready if "email" in b.draft_type.value]),
            "ready_proposals": len([b for b in ready if "proposal" in b.draft_type.value]),
            "almost_emails": len([b for b in almost if "email" in b.draft_type.value]),
            "almost_proposals": len([b for b in almost if "proposal" in b.draft_type.value]),
            "total_pipeline_value": sum(b.priority_score for b in ready),
            "top_ready": [
                {
                    "contact": b.contact_name,
                    "company": b.company,
                    "type": b.draft_type.value,
                    "priority": b.priority_score,
                }
                for b in ready[:5]
            ],
            "unblock_actions": self.get_unblock_instructions(),
        }

    # =========================================================================
    # PERSISTENCE
    # =========================================================================

    def save_queue(self):
        """Save the tee-up queue to disk."""
        os.makedirs(os.path.dirname(TEEUP_QUEUE_PATH), exist_ok=True)

        data = {
            "metadata": {
                "schema_version": "1.0.0",
                "generated_at": datetime.utcnow().isoformat(),
                "total_briefs": len(self.briefs),
                "ready_count": len(self.get_ready_queue()),
                "almost_ready_count": len(self.get_almost_ready_queue()),
            },
            "summary": self.get_generation_summary(),
            "briefs": [b.to_dict() for b in self.briefs],
        }

        with open(TEEUP_QUEUE_PATH, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load_queue(cls) -> "ProactiveDrafter":
        """Load the last saved tee-up queue."""
        drafter = cls()

        if not os.path.exists(TEEUP_QUEUE_PATH):
            return drafter

        try:
            with open(TEEUP_QUEUE_PATH, "r") as f:
                data = json.load(f)

            for brief_data in data.get("briefs", []):
                try:
                    brief = TeeUpBrief.from_dict(brief_data)
                    drafter.briefs.append(brief)
                except (KeyError, ValueError):
                    continue
        except (json.JSONDecodeError, KeyError):
            pass

        return drafter


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def scan_and_teeup(
    opportunities_path: Optional[str] = None,
    registry_path: Optional[str] = None,
    ledger_path: Optional[str] = None,
    min_priority: float = 50.0,
) -> Dict[str, Any]:
    """
    One-call function to scan the pipeline and generate tee-up briefs.

    Loads all data, scans for ready opportunities, saves the queue,
    and returns a summary.
    """
    base_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "..", "..", ".bizdev"
    )

    # Load opportunities
    opp_path = opportunities_path or os.path.join(base_dir, "opportunities-enhanced.json")
    opportunities = []
    if os.path.exists(opp_path):
        try:
            with open(opp_path, "r") as f:
                data = json.load(f)
            opportunities = data.get("opportunities", [])
        except (json.JSONDecodeError, KeyError):
            pass

    # Load context registry
    reg_path = registry_path or os.path.join(base_dir, "command-center", "context_registry.json")
    registry_data = None
    if os.path.exists(reg_path):
        try:
            with open(reg_path, "r") as f:
                registry_data = json.load(f)
        except (json.JSONDecodeError, KeyError):
            pass

    # Load draft ledger
    led_path = ledger_path or os.path.join(base_dir, "command-center", "draft_ledger.json")
    ledger_data = None
    if os.path.exists(led_path):
        try:
            with open(led_path, "r") as f:
                ledger_data = json.load(f)
        except (json.JSONDecodeError, KeyError):
            pass

    # Run scan
    drafter = ProactiveDrafter()
    drafter.load_pipeline_data(opportunities, registry_data, ledger_data)
    drafter.scan_for_ready_opportunities(min_priority=min_priority)
    drafter.save_queue()

    return drafter.get_generation_summary()


def get_next_to_generate() -> Optional[Dict[str, Any]]:
    """
    Get the single highest-priority ready brief.

    Returns the brief dict with document_studio_instructions
    that can be directly passed to the document-studio skill.
    """
    drafter = ProactiveDrafter.load_queue()
    ready = drafter.get_ready_queue()

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
