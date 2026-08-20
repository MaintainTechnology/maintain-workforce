"""
Fast LLM Client for BizDev Opportunity Intelligence

Uses Claude 3.5 Haiku for cost-efficient, high-quality transcript analysis.
Each call is stateless (fresh context) to avoid bias between transcripts.

Requires: ANTHROPIC_API_KEY environment variable
"""

import os
import json
import re
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import time


# =============================================================================
# CONFIGURATION
# =============================================================================

HAIKU_MODEL = "claude-3-5-haiku-20241022"
MAX_TOKENS = 4000
DEFAULT_TEMPERATURE = 0.3  # Lower for more consistent extractions

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2


@dataclass
class LLMResponse:
    """Structured response from LLM call."""
    success: bool
    content: Optional[Dict[str, Any]]
    raw_text: str
    model: str
    usage: Dict[str, int]
    error: Optional[str] = None
    latency_ms: int = 0


# =============================================================================
# JSON PARSING HELPERS
# =============================================================================

def extract_json_from_response(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from LLM response text.
    Handles markdown code blocks and raw JSON.
    """
    # Try to find JSON in code blocks first
    json_patterns = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
        r'\{[\s\S]*\}'
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            try:
                # Clean the match
                json_str = match.strip()
                if not json_str.startswith('{'):
                    continue
                return json.loads(json_str)
            except json.JSONDecodeError:
                continue
    
    # Try parsing the entire text as JSON
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return None


def validate_extraction_response(data: Dict[str, Any]) -> bool:
    """Validate that extraction response has required fields."""
    required_fields = ['opportunities']
    return all(field in data for field in required_fields)


# =============================================================================
# HAIKU CLIENT
# =============================================================================

class HaikuClient:
    """
    Client for Claude 3.5 Haiku API calls.
    
    Each method call is stateless - no conversation history is maintained.
    This ensures fresh context for each transcript analysis.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize client with API key.
        
        Args:
            api_key: Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var.
        """
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not found. Set environment variable or pass api_key.")
        
        self._client = None
    
    @property
    def client(self):
        """Lazy initialization of Anthropic client."""
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError("anthropic package not installed. Run: pip install anthropic")
        return self._client
    
    def call(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = MAX_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE
    ) -> LLMResponse:
        """
        Make a single API call to Haiku.
        
        Args:
            prompt: User prompt text
            system: Optional system prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            
        Returns:
            LLMResponse with parsed content
        """
        start_time = time.time()
        
        for attempt in range(MAX_RETRIES):
            try:
                messages = [{"role": "user", "content": prompt}]
                
                kwargs = {
                    "model": HAIKU_MODEL,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": messages
                }
                
                if system:
                    kwargs["system"] = system
                
                response = self.client.messages.create(**kwargs)
                
                raw_text = response.content[0].text
                latency_ms = int((time.time() - start_time) * 1000)
                
                # Try to parse JSON from response
                parsed_content = extract_json_from_response(raw_text)
                
                return LLMResponse(
                    success=True,
                    content=parsed_content,
                    raw_text=raw_text,
                    model=HAIKU_MODEL,
                    usage={
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    },
                    latency_ms=latency_ms
                )
                
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
                    continue
                
                return LLMResponse(
                    success=False,
                    content=None,
                    raw_text="",
                    model=HAIKU_MODEL,
                    usage={"input_tokens": 0, "output_tokens": 0},
                    error=str(e),
                    latency_ms=int((time.time() - start_time) * 1000)
                )
    
    def analyze_transcript(
        self,
        transcript_text: str,
        extraction_prompt: str
    ) -> LLMResponse:
        """
        Analyze a meeting transcript for business opportunities.
        
        Args:
            transcript_text: Full transcript text
            extraction_prompt: Prompt template for extraction (should have {transcript} placeholder)
            
        Returns:
            LLMResponse with extracted opportunities
        """
        # Format prompt with transcript
        full_prompt = extraction_prompt.format(transcript=transcript_text[:30000])  # Limit context
        
        system = """You are an expert business development analyst for Next Generation Medicine (NGM), 
a platform that provides longevity medicine education, AI-powered lab reports, and consulting services.

Your task is to analyze meeting transcripts and extract business opportunities with HIGH PRECISION.
You must provide EXACT QUOTES from the transcript for every signal you identify.
Never hallucinate or infer information not explicitly stated in the transcript.

Output ONLY valid JSON - no explanations before or after."""
        
        return self.call(full_prompt, system=system)
    
    def refine_extraction(
        self,
        original_result: Dict[str, Any],
        feedback: List[str],
        transcript_text: str,
        refinement_prompt: str
    ) -> LLMResponse:
        """
        Refine a previous extraction based on quality gate feedback.
        
        Args:
            original_result: Previous extraction result
            feedback: List of quality gate failures/suggestions
            transcript_text: Original transcript
            refinement_prompt: Prompt for refinement
            
        Returns:
            LLMResponse with refined extraction
        """
        feedback_str = "\n".join(f"- {f}" for f in feedback)
        
        full_prompt = refinement_prompt.format(
            original_result=json.dumps(original_result, indent=2),
            feedback=feedback_str,
            transcript=transcript_text[:25000]
        )
        
        system = """You are refining a business opportunity extraction based on quality feedback.
Fix the specific issues mentioned while maintaining accuracy.
Provide EXACT QUOTES from the transcript for all signals.
Output ONLY valid JSON."""
        
        return self.call(full_prompt, system=system)
    
    def evaluate_quality(
        self,
        extraction: Dict[str, Any],
        transcript_text: str,
        evaluation_prompt: str
    ) -> LLMResponse:
        """
        Evaluate extraction quality using LLM as judge.
        
        Args:
            extraction: The extraction to evaluate
            transcript_text: Original transcript for verification
            evaluation_prompt: Prompt for evaluation
            
        Returns:
            LLMResponse with quality assessment
        """
        full_prompt = evaluation_prompt.format(
            extraction=json.dumps(extraction, indent=2),
            transcript=transcript_text[:20000]
        )
        
        system = """You are a quality assurance evaluator.
Verify that the extraction is accurate and all quotes exist in the transcript.
Be strict - reject any hallucinated content.
Output ONLY valid JSON with your evaluation."""
        
        return self.call(full_prompt, system=system, temperature=0.1)


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

_default_client: Optional[HaikuClient] = None


def get_client() -> HaikuClient:
    """Get or create default Haiku client."""
    global _default_client
    if _default_client is None:
        _default_client = HaikuClient()
    return _default_client


def analyze_transcript(transcript_text: str, prompt: str) -> LLMResponse:
    """Convenience function for transcript analysis."""
    return get_client().analyze_transcript(transcript_text, prompt)


def refine_extraction(
    original: Dict[str, Any],
    feedback: List[str],
    transcript: str,
    prompt: str
) -> LLMResponse:
    """Convenience function for extraction refinement."""
    return get_client().refine_extraction(original, feedback, transcript, prompt)


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

USAGE_EXAMPLE = """
## Fast LLM Client Usage

### Basic Analysis

```python
from fast_llm_client import HaikuClient, analyze_transcript

# Using convenience function
response = analyze_transcript(
    transcript_text=transcript,
    prompt=EXTRACTION_PROMPT
)

if response.success and response.content:
    opportunities = response.content.get('opportunities', [])
    print(f"Found {len(opportunities)} opportunities")
    print(f"Tokens used: {response.usage}")
    print(f"Latency: {response.latency_ms}ms")
else:
    print(f"Error: {response.error}")
```

### With Refinement Loop

```python
from fast_llm_client import HaikuClient

client = HaikuClient()

# Initial extraction
response = client.analyze_transcript(transcript, EXTRACTION_PROMPT)

# If quality gate fails, refine
if not quality_gate_passed:
    response = client.refine_extraction(
        original_result=response.content,
        feedback=["Missing exact quotes", "Contact name incomplete"],
        transcript_text=transcript,
        refinement_prompt=REFINEMENT_PROMPT
    )
```

### Cost Tracking

```python
total_input_tokens = 0
total_output_tokens = 0

for transcript in transcripts:
    response = analyze_transcript(transcript, prompt)
    total_input_tokens += response.usage['input_tokens']
    total_output_tokens += response.usage['output_tokens']

# Haiku pricing: $0.25/1M input, $1.25/1M output
cost = (total_input_tokens * 0.25 + total_output_tokens * 1.25) / 1_000_000
print(f"Total cost: ${cost:.4f}")
```
"""
