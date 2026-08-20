"""
Iterative Scanner for BizDev Opportunity Intelligence

Core execution loop that processes each transcript with:
1. Fresh LLM context (Haiku 4.5)
2. Quality gate evaluation
3. Feedback-driven refinement (up to 3 iterations)
4. Detailed logging for audit trail

This implements the Ralph-style iterative pattern for opportunity extraction.
"""

import os
import json
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, field
import time

from .fast_llm_client import HaikuClient, LLMResponse
from .quality_gates import evaluate_opportunity_quality, QualityGateResult
from .prompts import (
    ITERATIVE_EXTRACTION_PROMPT,
    ITERATIVE_REFINEMENT_PROMPT,
    ITERATIVE_EVALUATION_PROMPT
)


# =============================================================================
# CONFIGURATION
# =============================================================================

MAX_ITERATIONS_PER_TRANSCRIPT = 3
MIN_CONFIDENCE_THRESHOLD = 0.6
LOG_DIR = ".bizdev/iteration_logs"


@dataclass
class IterationResult:
    """Result of a single iteration attempt."""
    iteration_num: int
    extraction: Optional[Dict[str, Any]]
    quality_gate: Optional[QualityGateResult]
    llm_response: LLMResponse
    passed: bool
    feedback: List[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class TranscriptScanResult:
    """Final result of scanning a transcript."""
    transcript_id: str
    transcript_name: str
    success: bool
    opportunities: List[Dict[str, Any]]
    iterations: List[IterationResult]
    total_iterations: int
    total_tokens: int
    total_latency_ms: int
    final_quality_score: float
    needs_manual_review: bool = False
    error: Optional[str] = None


# =============================================================================
# ITERATIVE SCANNER CLASS
# =============================================================================

class IterativeScanner:
    """
    Scans transcripts iteratively with quality gates and refinement.
    
    Each transcript gets fresh LLM context to avoid bias.
    Quality gates enforce extraction accuracy.
    Failed extractions are refined with specific feedback.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize scanner with Haiku client."""
        self.client = HaikuClient(api_key)
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.results: List[TranscriptScanResult] = []
        self.total_tokens_used = 0
        
    def scan_transcript(
        self,
        transcript_id: str,
        transcript_name: str,
        transcript_text: str,
        max_iterations: int = MAX_ITERATIONS_PER_TRANSCRIPT
    ) -> TranscriptScanResult:
        """
        Scan a single transcript with iterative refinement.
        
        Args:
            transcript_id: Unique ID for the transcript
            transcript_name: Human-readable name
            transcript_text: Full transcript text
            max_iterations: Maximum refinement attempts
            
        Returns:
            TranscriptScanResult with extracted opportunities
        """
        iterations: List[IterationResult] = []
        total_tokens = 0
        total_latency = 0
        current_extraction = None
        
        print(f"\n{'='*60}")
        print(f"SCANNING: {transcript_name}")
        print(f"{'='*60}")
        
        for iteration_num in range(1, max_iterations + 1):
            print(f"\n--- Iteration {iteration_num}/{max_iterations} ---")
            
            # Step 1: Extract or refine
            if iteration_num == 1:
                # Fresh extraction
                response = self.client.analyze_transcript(
                    transcript_text,
                    ITERATIVE_EXTRACTION_PROMPT
                )
            else:
                # Refine based on feedback
                feedback = iterations[-1].feedback
                response = self.client.refine_extraction(
                    current_extraction,
                    feedback,
                    transcript_text,
                    ITERATIVE_REFINEMENT_PROMPT
                )
            
            total_tokens += response.usage.get('input_tokens', 0) + response.usage.get('output_tokens', 0)
            total_latency += response.latency_ms
            
            if not response.success:
                print(f"  LLM Error: {response.error}")
                iterations.append(IterationResult(
                    iteration_num=iteration_num,
                    extraction=None,
                    quality_gate=None,
                    llm_response=response,
                    passed=False,
                    feedback=[f"LLM call failed: {response.error}"]
                ))
                continue
            
            current_extraction = response.content
            if not current_extraction:
                print(f"  Failed to parse JSON from response")
                iterations.append(IterationResult(
                    iteration_num=iteration_num,
                    extraction=None,
                    quality_gate=None,
                    llm_response=response,
                    passed=False,
                    feedback=["Failed to parse JSON response"]
                ))
                continue
            
            # Step 2: Run quality gate
            opportunities = current_extraction.get('opportunities', [])
            print(f"  Extracted {len(opportunities)} opportunity(ies)")
            
            if not opportunities:
                # No opportunities found - this might be valid
                gate_result = QualityGateResult(
                    passed=True,
                    gate_name="no_opportunities",
                    score=1.0,
                    passed_checks=["No opportunities in transcript (valid)"],
                    failed_checks=[],
                    suggestions=[]
                )
                iterations.append(IterationResult(
                    iteration_num=iteration_num,
                    extraction=current_extraction,
                    quality_gate=gate_result,
                    llm_response=response,
                    passed=True
                ))
                print(f"  Quality Gate: PASS (no opportunities found)")
                break
            
            # Evaluate each opportunity
            all_passed = True
            all_feedback = []
            
            for i, opp in enumerate(opportunities):
                signals = opp.get('signals', [])
                gate_result = evaluate_opportunity_quality(
                    opportunity=opp,
                    signals=signals,
                    classification_confidence=opp.get('classification_confidence', 0.5)
                )
                
                if not gate_result.passed:
                    all_passed = False
                    all_feedback.extend([
                        f"Opportunity {i+1}: {check}" 
                        for check in gate_result.failed_checks
                    ])
                    all_feedback.extend(gate_result.suggestions)
                
                print(f"  Opportunity {i+1} ({opp.get('contact', {}).get('name', 'Unknown')}): "
                      f"{'PASS' if gate_result.passed else 'FAIL'} (score: {gate_result.score:.2f})")
            
            # Check for exact quotes (critical quality check)
            quote_feedback = self._verify_quotes(opportunities, transcript_text)
            if quote_feedback:
                all_passed = False
                all_feedback.extend(quote_feedback)
                print(f"  Quote verification: FAIL ({len(quote_feedback)} issues)")
            
            iterations.append(IterationResult(
                iteration_num=iteration_num,
                extraction=current_extraction,
                quality_gate=gate_result,
                llm_response=response,
                passed=all_passed,
                feedback=all_feedback
            ))
            
            if all_passed:
                print(f"  Quality Gate: PASS")
                break
            else:
                print(f"  Quality Gate: FAIL - {len(all_feedback)} issue(s)")
                if iteration_num < max_iterations:
                    print(f"  Refining with feedback...")
        
        # Determine final result
        final_passed = iterations[-1].passed if iterations else False
        final_extraction = iterations[-1].extraction if iterations else None
        final_opportunities = final_extraction.get('opportunities', []) if final_extraction else []
        
        result = TranscriptScanResult(
            transcript_id=transcript_id,
            transcript_name=transcript_name,
            success=final_passed,
            opportunities=final_opportunities,
            iterations=iterations,
            total_iterations=len(iterations),
            total_tokens=total_tokens,
            total_latency_ms=total_latency,
            final_quality_score=iterations[-1].quality_gate.score if iterations and iterations[-1].quality_gate else 0.0,
            needs_manual_review=not final_passed and len(iterations) >= max_iterations
        )
        
        self.results.append(result)
        self.total_tokens_used += total_tokens
        
        # Log result
        self._log_result(result)
        
        return result
    
    def _verify_quotes(
        self,
        opportunities: List[Dict[str, Any]],
        transcript_text: str
    ) -> List[str]:
        """
        Verify that signal quotes actually exist in the transcript.
        
        Returns list of feedback for any missing quotes.
        """
        feedback = []
        transcript_lower = transcript_text.lower()
        
        for i, opp in enumerate(opportunities):
            for j, signal in enumerate(opp.get('signals', [])):
                quote = signal.get('quote', signal.get('content', ''))
                if quote and len(quote) > 20:
                    # Check if quote exists in transcript (fuzzy match)
                    quote_lower = quote.lower()
                    # Allow for minor differences
                    quote_words = quote_lower.split()[:10]
                    match_found = any(
                        word in transcript_lower 
                        for word in quote_words 
                        if len(word) > 4
                    )
                    
                    if not match_found:
                        feedback.append(
                            f"Opportunity {i+1}, Signal {j+1}: Quote not found in transcript. "
                            f"Provide exact quote from transcript."
                        )
        
        return feedback
    
    def _log_result(self, result: TranscriptScanResult):
        """Log scan result to iteration log file."""
        os.makedirs(LOG_DIR, exist_ok=True)
        
        log_file = os.path.join(LOG_DIR, f"session_{self.session_id}.jsonl")
        
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "transcript_id": result.transcript_id,
            "transcript_name": result.transcript_name,
            "success": result.success,
            "total_iterations": result.total_iterations,
            "opportunities_found": len(result.opportunities),
            "tokens_used": result.total_tokens,
            "latency_ms": result.total_latency_ms,
            "needs_manual_review": result.needs_manual_review,
            "iterations": [
                {
                    "num": it.iteration_num,
                    "passed": it.passed,
                    "feedback_count": len(it.feedback)
                }
                for it in result.iterations
            ]
        }
        
        with open(log_file, 'a') as f:
            f.write(json.dumps(log_entry) + "\n")
    
    def scan_all(
        self,
        transcripts: List[Dict[str, Any]],
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Scan all transcripts iteratively.
        
        Args:
            transcripts: List of {id, name, text} dicts
            progress_callback: Optional callback(current, total, result)
            
        Returns:
            Summary dict with all results
        """
        total = len(transcripts)
        all_opportunities = []
        successful = 0
        needs_review = 0
        
        print(f"\n{'='*60}")
        print(f"ITERATIVE SCAN: {total} transcripts")
        print(f"Session ID: {self.session_id}")
        print(f"{'='*60}")
        
        start_time = time.time()
        
        for i, transcript in enumerate(transcripts, 1):
            result = self.scan_transcript(
                transcript_id=transcript['id'],
                transcript_name=transcript['name'],
                transcript_text=transcript['text']
            )
            
            all_opportunities.extend(result.opportunities)
            
            if result.success:
                successful += 1
            if result.needs_manual_review:
                needs_review += 1
            
            if progress_callback:
                progress_callback(i, total, result)
            
            print(f"\nProgress: {i}/{total} | Success: {successful} | Review: {needs_review}")
        
        elapsed_time = time.time() - start_time
        
        summary = {
            "session_id": self.session_id,
            "total_transcripts": total,
            "successful": successful,
            "needs_manual_review": needs_review,
            "total_opportunities": len(all_opportunities),
            "total_tokens_used": self.total_tokens_used,
            "elapsed_seconds": int(elapsed_time),
            "avg_tokens_per_transcript": self.total_tokens_used // total if total > 0 else 0,
            "estimated_cost_usd": self._estimate_cost(),
            "opportunities": all_opportunities,
            "results": [
                {
                    "id": r.transcript_id,
                    "name": r.transcript_name,
                    "success": r.success,
                    "opportunities": len(r.opportunities),
                    "iterations": r.total_iterations,
                    "needs_review": r.needs_manual_review
                }
                for r in self.results
            ]
        }
        
        # Save summary
        self._save_summary(summary)
        
        print(f"\n{'='*60}")
        print(f"SCAN COMPLETE")
        print(f"{'='*60}")
        print(f"Transcripts: {total}")
        print(f"Successful: {successful}")
        print(f"Needs Review: {needs_review}")
        print(f"Opportunities Found: {len(all_opportunities)}")
        print(f"Tokens Used: {self.total_tokens_used:,}")
        print(f"Estimated Cost: ${self._estimate_cost():.4f}")
        print(f"Time: {int(elapsed_time)}s")
        
        return summary
    
    def _estimate_cost(self) -> float:
        """Estimate USD cost based on Haiku pricing."""
        # Haiku pricing: $0.25/1M input, $1.25/1M output
        # Assume 70% input, 30% output tokens
        input_tokens = int(self.total_tokens_used * 0.7)
        output_tokens = int(self.total_tokens_used * 0.3)
        return (input_tokens * 0.25 + output_tokens * 1.25) / 1_000_000
    
    def _save_summary(self, summary: Dict[str, Any]):
        """Save scan summary to file."""
        os.makedirs(".bizdev", exist_ok=True)
        
        summary_file = f".bizdev/scan_summary_{self.session_id}.json"
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2, default=str)
        
        print(f"\nSummary saved to: {summary_file}")


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def scan_transcripts_iteratively(
    transcripts: List[Dict[str, Any]],
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Convenience function to scan transcripts iteratively.
    
    Args:
        transcripts: List of {id, name, text} dicts
        api_key: Optional Anthropic API key
        
    Returns:
        Summary dict with all results
    """
    scanner = IterativeScanner(api_key)
    return scanner.scan_all(transcripts)


# =============================================================================
# USAGE DOCUMENTATION
# =============================================================================

USAGE = """
## Iterative Scanner Usage

### Basic Usage

```python
from iterative_scanner import IterativeScanner

# Initialize scanner
scanner = IterativeScanner()

# Scan a single transcript
result = scanner.scan_transcript(
    transcript_id="file123",
    transcript_name="Meeting with Dr. Smith",
    transcript_text=transcript_content
)

print(f"Success: {result.success}")
print(f"Iterations: {result.total_iterations}")
print(f"Opportunities: {len(result.opportunities)}")
```

### Batch Processing

```python
from iterative_scanner import scan_transcripts_iteratively

transcripts = [
    {"id": "1", "name": "Meeting A", "text": "..."},
    {"id": "2", "name": "Meeting B", "text": "..."},
]

summary = scan_transcripts_iteratively(transcripts)
print(f"Total opportunities: {summary['total_opportunities']}")
```

### With Progress Callback

```python
def on_progress(current, total, result):
    print(f"[{current}/{total}] {result.transcript_name}: "
          f"{'OK' if result.success else 'REVIEW'}")

summary = scanner.scan_all(transcripts, progress_callback=on_progress)
```

### Accessing Iteration Details

```python
result = scanner.scan_transcript(...)

for iteration in result.iterations:
    print(f"Iteration {iteration.iteration_num}:")
    print(f"  Passed: {iteration.passed}")
    print(f"  Feedback: {iteration.feedback}")
    print(f"  Tokens: {iteration.llm_response.usage}")
```
"""
