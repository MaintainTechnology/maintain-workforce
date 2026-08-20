"""
Transcript Scanner for Google Drive

Scans meeting transcripts from a Google Drive folder to extract
business development opportunities using LLM-based analysis.

This module provides instructions for Claude to:
1. List transcripts from Google Drive using MCP tools
2. Parse transcript content
3. Extract opportunity signals using structured prompts
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any

# Import types from parent directory
# Note: These are reference definitions for Claude, not runtime imports
"""
from ..types import (
    Opportunity, ContactInfo, Signal,
    OpportunityType, PipelineStage, SignalType, SourceType
)
"""


# =============================================================================
# TRANSCRIPT EXTRACTION PROMPT
# =============================================================================

TRANSCRIPT_OPPORTUNITY_EXTRACTION_PROMPT = """
Analyze this meeting transcript to identify business development opportunities for NGM services.

**NGM Service Types:**
1. **Consulting** ($2,500-$75,000): Strategy sessions, advisory retainers, practice transformation
2. **Membership** ($299-$599/month): Longevity Intelligence Platform access
3. **Report Generator**: AI lab report capability (part of LIP or standalone interest)
4. **Commons Partnership** ($5,000-$12,500/year): Vendor profiles on NGM Commons

**Look for these signals:**
- EXPLICIT_INTEREST: Direct questions about services, pricing, how to get started
- PAIN_POINT: Problems NGM can solve (time on lab reports, need for protocols, scaling challenges)
- BUDGET_MENTION: Discussion of budget, pricing expectations, investment capacity
- TIMELINE_MENTION: Urgency indicators ("launching soon", "need this Q1")
- DECISION_MAKER: Indications they can make purchasing decisions
- FOLLOW_UP_REQUEST: Requests for more info, demos, proposals

**Transcript:**
{transcript_content}

**Meeting Filename:** {filename}
**Meeting Date:** {meeting_date}

**Instructions:**
Extract all potential opportunities. For each opportunity, provide:

```json
{{
  "opportunities": [
    {{
      "contact_name": "Name from transcript",
      "company": "Company name if mentioned",
      "title": "Title/role if mentioned",
      "email": "Email if mentioned",
      "opportunity_type": "consulting|membership|report_generator|commons_partnership",
      "signals": [
        {{
          "type": "EXPLICIT_INTEREST|PAIN_POINT|BUDGET_MENTION|TIMELINE_MENTION|DECISION_MAKER|FOLLOW_UP_REQUEST",
          "content": "Exact quote or paraphrase from transcript",
          "confidence": 0.0-1.0
        }}
      ],
      "confidence_score": 0-100,
      "notes": "Brief summary of the opportunity"
    }}
  ]
}}
```

If no opportunities are found, return: {{"opportunities": []}}
"""


# =============================================================================
# SCANNER FUNCTIONS
# =============================================================================

def get_lookback_date(lookback_months: int) -> str:
    """
    Calculate the cutoff date for lookback period.
    
    Args:
        lookback_months: Number of months to look back
        
    Returns:
        ISO format date string for the cutoff
    """
    cutoff = datetime.now() - timedelta(days=lookback_months * 30)
    return cutoff.strftime("%Y-%m-%d")


def scan_transcript_folder(folder_id: str, lookback_months: int = 6) -> Dict[str, Any]:
    """
    Instructions for scanning a Google Drive folder for transcripts.
    
    This function provides the workflow for Claude to execute.
    
    Args:
        folder_id: Google Drive folder ID containing transcripts
        lookback_months: How many months back to scan (default: 6)
        
    Returns:
        Dict with scanning instructions and expected output format
    """
    cutoff_date = get_lookback_date(lookback_months)
    
    return {
        "workflow": [
            {
                "step": 1,
                "action": "List files in folder",
                "tool": "mcp__google-drive__list_files",
                "params": {"folder_id": folder_id},
                "note": "Get all files in the transcript folder"
            },
            {
                "step": 2,
                "action": "Filter by date",
                "logic": f"Keep only files modified after {cutoff_date}",
                "note": "Filter based on modifiedTime field"
            },
            {
                "step": 3,
                "action": "Read each transcript",
                "tool": "mcp__google-drive__export_google_doc OR mcp__google-drive__get_file_content",
                "note": "Use export_google_doc for Google Docs, get_file_content for .txt files"
            },
            {
                "step": 4,
                "action": "Extract opportunities",
                "function": "extract_opportunities_from_transcript",
                "note": "Use the TRANSCRIPT_OPPORTUNITY_EXTRACTION_PROMPT for each file"
            },
            {
                "step": 5,
                "action": "Aggregate results",
                "note": "Combine all opportunities into a single list"
            }
        ],
        "expected_output": {
            "transcripts_scanned": "int",
            "opportunities_found": "List[Opportunity]",
            "scan_date": "ISO timestamp",
            "folder_id": folder_id,
            "lookback_months": lookback_months
        }
    }


def extract_opportunities_from_transcript(
    content: str,
    filename: str,
    meeting_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Instructions for extracting opportunities from a single transcript.
    
    Args:
        content: Full text content of the transcript
        filename: Original filename for reference
        meeting_date: Date of the meeting (extracted from filename or metadata)
        
    Returns:
        Dict with extraction instructions and prompt
    """
    # Try to extract date from filename if not provided
    if not meeting_date:
        meeting_date = "Unknown (extract from transcript content if mentioned)"
    
    prompt = TRANSCRIPT_OPPORTUNITY_EXTRACTION_PROMPT.format(
        transcript_content=content[:15000],  # Truncate very long transcripts
        filename=filename,
        meeting_date=meeting_date
    )
    
    return {
        "prompt": prompt,
        "output_format": {
            "opportunities": [
                {
                    "contact_name": "string",
                    "company": "string|null",
                    "title": "string|null",
                    "email": "string|null",
                    "opportunity_type": "OpportunityType enum value",
                    "signals": [
                        {
                            "type": "SignalType enum value",
                            "content": "string",
                            "confidence": "float 0-1"
                        }
                    ],
                    "confidence_score": "int 0-100",
                    "notes": "string"
                }
            ]
        },
        "post_processing": [
            "Create Opportunity objects from extracted data",
            "Set source=SourceType.MEETING_TRANSCRIPT",
            "Set source_id to the Google Drive file ID",
            "Set discovered_at to current timestamp",
            "Set last_activity to meeting_date or discovered_at",
            "Assign pipeline stage based on signals (use analyzer.py)"
        ]
    }


# =============================================================================
# TRANSCRIPT FORMAT HANDLERS
# =============================================================================

def detect_transcript_format(content: str) -> str:
    """
    Detect the format of a transcript (Fireflies, Otter, plain text).
    
    Returns:
        Format identifier: 'fireflies', 'otter', 'plain'
    """
    content_lower = content.lower()
    
    if "fireflies.ai" in content_lower or "meeting notes" in content[:500].lower():
        return "fireflies"
    elif "otter.ai" in content_lower or "transcript by otter" in content_lower:
        return "otter"
    else:
        return "plain"


def parse_fireflies_transcript(content: str) -> Dict[str, Any]:
    """
    Parse Fireflies.ai transcript format.
    
    Fireflies typically includes:
    - Meeting title and date at top
    - Attendees list
    - AI-generated summary
    - Full transcript with speaker labels
    """
    return {
        "format": "fireflies",
        "sections": {
            "summary": "Extract AI summary if present (usually at top)",
            "attendees": "Extract attendee list",
            "transcript": "Main transcript content with speaker labels",
            "action_items": "Extract action items if present"
        },
        "parsing_hints": [
            "Look for 'Attendees:' or 'Participants:' section",
            "Summary often starts with 'Summary' or 'Meeting Summary'",
            "Transcript has format 'Speaker Name: dialogue'",
            "Action items may be at end or in summary"
        ]
    }


def parse_otter_transcript(content: str) -> Dict[str, Any]:
    """
    Parse Otter.ai transcript format.
    
    Otter typically includes:
    - Title and duration
    - Speaker identification
    - Timestamped dialogue
    """
    return {
        "format": "otter",
        "sections": {
            "header": "Title and metadata at top",
            "transcript": "Timestamped dialogue with speakers"
        },
        "parsing_hints": [
            "Look for timestamp format [HH:MM:SS]",
            "Speakers labeled as 'Speaker 1', 'Speaker 2' or identified names",
            "May include summary at top if premium"
        ]
    }


def parse_plain_transcript(content: str) -> Dict[str, Any]:
    """
    Parse plain text transcript.
    
    For unformatted transcripts or manual notes.
    """
    return {
        "format": "plain",
        "sections": {
            "content": "Full text content"
        },
        "parsing_hints": [
            "Look for speaker patterns like 'Name:' or '[Name]'",
            "Date may be in filename or first few lines",
            "May need to infer attendees from context"
        ]
    }


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def create_opportunity_from_extraction(
    extracted: Dict[str, Any],
    source_id: str,
    meeting_date: str
) -> Dict[str, Any]:
    """
    Template for converting extracted opportunity data to Opportunity object.
    
    This is a reference for how to construct the final Opportunity.
    """
    import uuid
    from datetime import datetime
    
    return {
        "id": f"OPP-{uuid.uuid4().hex[:8].upper()}",
        "contact": {
            "name": extracted["contact_name"],
            "email": extracted.get("email"),
            "company": extracted.get("company"),
            "title": extracted.get("title")
        },
        "opportunity_type": extracted["opportunity_type"],
        "stage": "discovered",  # Initial stage - use analyzer to refine
        "source": "meeting_transcript",
        "source_id": source_id,
        "signals": [
            {
                "type": sig["type"],
                "content": sig["content"],
                "timestamp": meeting_date,
                "confidence": sig.get("confidence", 0.5)
            }
            for sig in extracted.get("signals", [])
        ],
        "confidence_score": extracted.get("confidence_score", 50),
        "discovered_at": datetime.now().isoformat(),
        "last_activity": meeting_date,
        "notes": extracted.get("notes")
    }


# =============================================================================
# EXECUTION INSTRUCTIONS
# =============================================================================

SCANNER_USAGE = """
## How to Use Transcript Scanner

### Step 1: Get Transcript Folder Contents
```
Use mcp__google-drive__list_files with folder_id parameter
```

### Step 2: For Each Transcript File
1. Check modifiedTime against lookback cutoff
2. If Google Doc: use mcp__google-drive__export_google_doc
3. If plain file: use mcp__google-drive__get_file_content
4. Call extract_opportunities_from_transcript with content

### Step 3: Extract Opportunities
Use TRANSCRIPT_OPPORTUNITY_EXTRACTION_PROMPT with the transcript content.
Parse the JSON response to extract opportunity data.

### Step 4: Build Opportunity Objects
For each extracted opportunity:
1. Generate unique ID
2. Create ContactInfo from extracted data
3. Create Signal objects for each signal
4. Set source and source_id
5. Use analyzer.py to determine pipeline stage

### Step 5: Return Results
Return list of Opportunity objects with metadata about the scan.
"""
