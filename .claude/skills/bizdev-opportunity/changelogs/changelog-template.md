# BizDev Opportunity Session Changelog

================================================================================
SESSION METADATA
================================================================================

**Session ID:** [session-YYYY-MM-DD-HHmmss]
**Started:** [ISO timestamp]
**Completed:** [ISO timestamp or "In Progress"]
**Operator:** Claude (Iterative BizDev Intelligence)

**Configuration:**
- Transcript Folder: [folder_id]
- Email Search Terms: [terms]
- Lookback Months: [N]
- Draft Emails: [true/false]
- Draft Proposals: [true/false]

================================================================================
SESSION SUMMARY
================================================================================

**Sources Processed:**
- Transcripts: [N]
- Email Threads: [N]

**Opportunities Found:**
- Total: [N]
- High Priority (≥70): [N]
- Medium (40-69): [N]
- Low (<40): [N]

**Drafts Generated:**
- Emails: [N] (cold: [N], warm: [N], reengagement: [N])
- Proposals: [N]

**Quality Gate Results:**
- Pass on First Try: [N]
- Pass After Iteration: [N]
- Failed/Skipped: [N]

**Files Created:**
| File | Type | Status |
|------|------|--------|
| [path] | [type] | [status] |

================================================================================
ITERATION LOG
================================================================================

--- ITERATION 1 | [TASK_ID]: [Source Name] ---
Timestamp:    [ISO timestamp]
Task Type:    [scan_transcript|scan_email|draft_email|draft_proposal]
Source:       [source_id]
Status:       [PASSED|FAILED|BLOCKED|SKIPPED]

Opportunity Found:
- Contact: [Name] ([Company])
- Type: [consulting|membership|commons_partnership]
- Confidence: [score]/100
- Stage: [discovered|qualified|engaged]

Signals Extracted:
- EXPLICIT_INTEREST: "[quote]" (confidence: 0.X)
- PAIN_POINT: "[quote]" (confidence: 0.X)

Quality Gates:
  ✓ Signal confidence: PASSED (0.78 ≥ 0.6)
  ✓ Contact completeness: PASSED
  ✗ Classification confidence: FAILED (0.45 < 0.5)

Actions Taken:
- Created opportunity: opp-[id]
- Queued email draft task
- Queued proposal task

Learnings:
- [Pattern discovered]
- [Gotcha encountered]

---

--- ITERATION 2 | [TASK_ID]: [Source Name] ---
[...continue for each iteration...]

---

================================================================================
OPPORTUNITIES DISCOVERED
================================================================================

### Opportunity: opp-[id]

**Contact:**
- Name: [Full Name]
- Company: [Company Name]
- Title: [Title]
- Email: [email]

**Classification:**
- Type: [consulting|membership|commons_partnership]
- Confidence Score: [0-100]
- Pipeline Stage: [discovered|qualified|engaged]

**Signals:**
1. [SIGNAL_TYPE]: "[Quote from source]"
   - Source: [file/thread]
   - Confidence: [0.X]

2. [SIGNAL_TYPE]: "[Quote from source]"
   - Source: [file/thread]
   - Confidence: [0.X]

**Pain Points:**
- [Pain point 1]
- [Pain point 2]

**Recommended Actions:**
- [x] Draft outreach email
- [x] Generate proposal
- [ ] Schedule follow-up

**Drafts Generated:**
- Email: [.bizdev/drafts/emails/[id]-[type].md]
- Proposal: [.bizdev/drafts/proposals/[id].html]

---

[Repeat for each opportunity]

================================================================================
DRAFTS GENERATED
================================================================================

### Email: [opp-id]-[type].md

**Target:** [Contact Name] ([email])
**Type:** [cold|warm|reengagement]
**Path:** [.bizdev/drafts/emails/path]

**Quality Gate History:**
- Attempt 1: FAILED (opener cliche)
- Attempt 2: PASSED (score: 0.82)

**Final Score:** [0.82]

**Key Elements:**
- Subject: "[Subject line]"
- Hook: [Description of opening hook]
- CTA: [Description of call to action]

---

### Proposal: [company-slug]-[date].html

**Target:** [Contact Name] at [Company]
**Type:** [consulting|enterprise]
**Path:** [.bizdev/drafts/proposals/path]
**Recommended Tier:** [low|mid|high]

**Quality Gate History:**
- Attempt 1: PASSED (score: 0.88)

**Final Score:** [0.88]

**Sections:**
- Understanding: ✓ References 2 pain points
- Solution: ✓ 3 deliverables outlined
- Pricing: ✓ Mid tier ($5,000-15,000/mo)
- Next Steps: ✓ Single CTA

---

================================================================================
PATTERNS & LEARNINGS
================================================================================

**Successful Patterns:**
- [Pattern 1]: [Description and when to use]
- [Pattern 2]: [Description and when to use]

**Common Failures:**
- [Failure 1]: [What went wrong and how to avoid]
- [Failure 2]: [What went wrong and how to avoid]

**Context Discovered:**
- [New context about a contact or company]
- [Industry pattern observed]

**Recommendations for Next Session:**
- [Recommendation 1]
- [Recommendation 2]

================================================================================
QUALITY GATE STATISTICS
================================================================================

### Opportunity Analysis Gate

| Metric | Value |
|--------|-------|
| Total Evaluated | [N] |
| Passed First Try | [N] ([%]) |
| Failed | [N] ([%]) |
| Avg Score | [0.XX] |

Common Failures:
- Low signal confidence: [N] times
- Missing contact info: [N] times

### Email Draft Gate

| Metric | Value |
|--------|-------|
| Total Evaluated | [N] |
| Passed First Try | [N] ([%]) |
| Passed After Iteration | [N] ([%]) |
| Failed | [N] ([%]) |
| Avg Score | [0.XX] |
| Avg Iterations | [X.X] |

Common Failures:
- Cliche opener: [N] times
- Over word limit: [N] times
- Missing CTA: [N] times

### Proposal Gate

| Metric | Value |
|--------|-------|
| Total Evaluated | [N] |
| Passed First Try | [N] ([%]) |
| Passed After Iteration | [N] ([%]) |
| Failed | [N] ([%]) |
| Avg Score | [0.XX] |

Common Failures:
- Missing section: [N] times
- Placeholder text: [N] times
- Pricing mismatch: [N] times

================================================================================
END OF SESSION LOG
================================================================================
