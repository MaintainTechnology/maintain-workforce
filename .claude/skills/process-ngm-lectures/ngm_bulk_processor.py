#!/usr/bin/env python3
"""
NGM Bulk Lecture Processor

Processes HTML content through the HTML-to-Lecture-JSON-SVG VectorShift pipeline.
Uses asyncio for parallel processing (5 concurrent jobs by default).

This script is called by the process-ngm-lectures Claude skill.

Usage:
    python ngm_bulk_processor.py \
        --module-id "foundations" \
        --lectures '[{"lecture_number": 1, "lecture_title": "Title", "html_content": "<html>..."}]' \
        --output-dir "content/ngm-lectures"

    # Or read lectures from a JSON file:
    python ngm_bulk_processor.py \
        --module-id "foundations" \
        --lectures-file "lectures_to_process.json" \
        --output-dir "content/ngm-lectures"
"""

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any

try:
    import aiohttp
except ImportError:
    print("ERROR: aiohttp is required for parallel execution.")
    print("Install with: pip install aiohttp")
    sys.exit(1)


# =============================================================================
# CONFIGURATION
# =============================================================================

# VectorShift API configuration
# API docs: https://docs.vectorshift.ai/api-reference/pipelines/run
# Base URL uses /v1 NOT /api (verified from working parallel_lecture_runner.py)
VECTORSHIFT_API_KEY = os.environ.get("VECTORSHIFT_API_KEY", "")
API_BASE_URL = "https://api.vectorshift.ai/v1"  # CORRECT: /v1 not /api
PIPELINE_ID = "6961308d6fdec16163ee0e2f"  # HTML to Lecture JSON (SVG Diagrams)

# VectorShift API endpoints (verified from parallel_lecture_runner.py):
# - Run pipeline: POST /v1/pipeline/{id}/run with Authorization: Bearer header
# - Check status: GET /v1/pipeline/{id}/run/status/{task_id}

# Processing settings
MAX_CONCURRENT = 5
POLL_INTERVAL_SECONDS = 5
MAX_POLL_MINUTES = 15  # 15 minute timeout per job


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class LectureJob:
    """Tracks state of a single lecture processing job."""
    module_id: str
    lecture_number: int
    lecture_title: str
    html_content: str
    task_id: Optional[str] = None
    status: str = "pending"  # pending, submitted, processing, completed, failed
    outputs: Optional[Dict] = None
    error: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    poll_failures: int = 0


@dataclass
class ProcessingResult:
    """Result from the bulk processing run."""
    module_id: str
    total_lectures: int
    successful: int
    failed: int
    duration_seconds: float
    jobs: List[LectureJob] = field(default_factory=list)
    output_files: List[Path] = field(default_factory=list)


# =============================================================================
# BULK PROCESSOR CLASS
# =============================================================================

class NGMBulkProcessor:
    """Manages concurrent lecture processing using asyncio."""

    def __init__(
        self,
        api_key: str,
        pipeline_id: str = PIPELINE_ID,
        max_concurrent: int = MAX_CONCURRENT,
        poll_interval: int = POLL_INTERVAL_SECONDS,
        max_poll_minutes: int = MAX_POLL_MINUTES
    ):
        self.api_key = api_key
        self.pipeline_id = pipeline_id
        self.max_concurrent = max_concurrent
        self.poll_interval = poll_interval
        self.max_poll_minutes = max_poll_minutes
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Create aiohttp session on context entry."""
        # Use Authorization: Bearer header (verified from parallel_lecture_runner.py)
        # Longer timeout (5 min) because pipeline submission can be slow
        self.session = aiohttp.ClientSession(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            timeout=aiohttp.ClientTimeout(total=300)  # 5 min timeout
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Close aiohttp session on context exit."""
        if self.session:
            await self.session.close()

    async def submit_job(self, job: LectureJob) -> None:
        """
        Submit a single lecture job to VectorShift.

        Uses VectorShift API: POST /v1/pipeline/{id}/run
        Verified from working parallel_lecture_runner.py

        Args:
            job: LectureJob to submit
        """
        url = f"{API_BASE_URL}/pipeline/{self.pipeline_id}/run"

        payload = {
            "inputs": {
                "html_content": job.html_content,
                "lecture_title": job.lecture_title,
                "module_name": job.module_id
            },
            "background": True  # Enable async processing
        }

        try:
            job.start_time = time.time()
            job.status = "submitted"

            async with self.session.post(url, json=payload) as response:
                if response.status != 200:
                    text = await response.text()
                    raise Exception(f"HTTP {response.status}: {text[:200]}")

                data = await response.json()
                task_id = data.get("task_id")

                if not task_id:
                    raise Exception(f"No task_id in response: {data}")

                job.task_id = task_id
                job.status = "processing"
                print(f"  Submitted: Lecture {job.lecture_number} - {job.lecture_title[:40]}...")

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.end_time = time.time()
            print(f"  ERROR: Lecture {job.lecture_number} failed to submit: {e}")

    async def poll_job(self, job: LectureJob) -> bool:
        """
        Poll status of a single job.

        Uses VectorShift API: GET /v1/pipeline/{id}/run/status/{task_id}
        Verified from working parallel_lecture_runner.py

        Args:
            job: LectureJob to poll

        Returns:
            True if job completed (success or failure), False if still processing
        """
        if job.status in ["completed", "failed", "pending"]:
            return job.status != "pending"

        if not job.task_id:
            return True

        url = f"{API_BASE_URL}/pipeline/{self.pipeline_id}/run/status/{job.task_id}"

        try:
            async with self.session.get(url) as response:
                if response.status != 200:
                    job.poll_failures += 1
                    if job.poll_failures > 10:
                        job.status = "failed"
                        job.error = f"Too many poll failures (HTTP {response.status})"
                        job.end_time = time.time()
                        return True
                    return False

                data = await response.json()

                # Check status first
                status = data.get("status", "")

                if status == "completed":
                    # VectorShift returns result object with outputs directly
                    # e.g., {"status": "completed", "result": {"lecture_json": "...", "transcript": "..."}}
                    result = data.get("result", {})
                    if result:
                        job.status = "completed"
                        job.outputs = result
                        job.end_time = time.time()
                        job.poll_failures = 0
                        return True

                if status == "failed" or data.get("error"):
                    job.status = "failed"
                    job.error = data.get("error", "Pipeline failed")
                    job.end_time = time.time()
                    return True

                # Still processing (status == "in_progress" or similar)
                job.poll_failures = 0
                return False

        except aiohttp.ClientError as e:
            job.poll_failures += 1
            if job.poll_failures > 10:
                job.status = "failed"
                job.error = f"Network error: {str(e)}"
                job.end_time = time.time()
                return True
            return False

    def check_timeout(self, job: LectureJob) -> bool:
        """Check if a job has exceeded the timeout."""
        if job.start_time and job.status == "processing":
            elapsed = time.time() - job.start_time
            if elapsed > self.max_poll_minutes * 60:
                job.status = "failed"
                job.error = f"Timeout after {self.max_poll_minutes} minutes"
                job.end_time = time.time()
                return True
        return False

    def print_progress(self, jobs: List[LectureJob], start_time: float):
        """Print real-time progress status."""
        pending = sum(1 for j in jobs if j.status == "pending")
        submitted = sum(1 for j in jobs if j.status == "submitted")
        processing = sum(1 for j in jobs if j.status == "processing")
        completed = sum(1 for j in jobs if j.status == "completed")
        failed = sum(1 for j in jobs if j.status == "failed")

        elapsed = time.time() - start_time
        elapsed_min = int(elapsed // 60)
        elapsed_sec = int(elapsed % 60)

        status_parts = []
        if pending > 0:
            status_parts.append(f"Pending: {pending}")
        if submitted > 0:
            status_parts.append(f"Submitting: {submitted}")
        if processing > 0:
            status_parts.append(f"Processing: {processing}")
        if completed > 0:
            status_parts.append(f"Completed: {completed}")
        if failed > 0:
            status_parts.append(f"Failed: {failed}")

        status_line = " | ".join(status_parts)
        print(f"\r[{elapsed_min:02d}:{elapsed_sec:02d}] {status_line}    ", end="", flush=True)

    async def process_batch(self, jobs: List[LectureJob]) -> List[LectureJob]:
        """
        Main entry point: submit all jobs and poll until complete.

        Args:
            jobs: List of LectureJob objects to process

        Returns:
            List of processed LectureJob objects
        """
        start_time = time.time()
        semaphore = asyncio.Semaphore(self.max_concurrent)

        print(f"\nSubmitting {len(jobs)} lectures (max {self.max_concurrent} concurrent)...")
        print("-" * 60)

        # Phase 1: Submit all jobs with rate limiting
        async def submit_with_limit(job: LectureJob):
            async with semaphore:
                await self.submit_job(job)
                return job

        # Submit all jobs concurrently
        await asyncio.gather(*[submit_with_limit(job) for job in jobs])

        # Check how many were submitted successfully
        submitted_count = sum(1 for j in jobs if j.task_id is not None)
        print(f"\nSubmitted {submitted_count}/{len(jobs)} jobs successfully")

        if submitted_count == 0:
            print("ERROR: No jobs were submitted successfully!")
            return jobs

        print(f"\nPolling for results (max {self.max_poll_minutes} minutes per lecture)...")
        print("-" * 60)

        # Phase 2: Poll until all complete
        while True:
            # Get jobs that are still active
            active_jobs = [j for j in jobs if j.status in ["submitted", "processing"]]

            if not active_jobs:
                break

            # Check timeouts
            for job in active_jobs:
                self.check_timeout(job)

            # Poll all active jobs
            await asyncio.gather(*[self.poll_job(job) for job in active_jobs])

            # Print progress
            self.print_progress(jobs, start_time)

            # Wait before next poll cycle
            await asyncio.sleep(self.poll_interval)

        # Final newline after progress
        print()

        return jobs


# =============================================================================
# OUTPUT HANDLING
# =============================================================================

def extract_json_from_output(raw_output: str) -> Optional[Dict]:
    """
    Extract clean JSON from VectorShift output.

    The output may contain markdown code blocks or extra text.
    """
    if not raw_output:
        return None

    # If it's already a dict, return it
    if isinstance(raw_output, dict):
        return raw_output

    # Try to find JSON in markdown code blocks
    json_pattern = r'```(?:json)?\s*([\s\S]*?)```'
    matches = re.findall(json_pattern, raw_output)

    for match in matches:
        try:
            return json.loads(match.strip())
        except json.JSONDecodeError:
            continue

    # Try parsing the whole string as JSON
    try:
        return json.loads(raw_output.strip())
    except json.JSONDecodeError:
        pass

    # Try to find JSON object pattern
    json_obj_pattern = r'\{[\s\S]*\}'
    match = re.search(json_obj_pattern, raw_output)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return None


def save_lecture_output(
    job: LectureJob,
    output_dir: Path
) -> Optional[Path]:
    """
    Save a single lecture's output to a JSON file.

    Args:
        job: Completed LectureJob with outputs
        output_dir: Directory to save files

    Returns:
        Path to saved file, or None if save failed
    """
    if not job.outputs:
        return None

    # Get the lecture JSON from outputs
    lecture_json_raw = job.outputs.get("lecture_json", "")
    lecture_json = extract_json_from_output(lecture_json_raw)

    if not lecture_json:
        print(f"  WARNING: Could not extract JSON for lecture {job.lecture_number}")
        return None

    # Create module directory
    module_dir = output_dir / job.module_id
    module_dir.mkdir(parents=True, exist_ok=True)

    # Save lecture JSON
    filename = f"lecture-{job.lecture_number}.json"
    filepath = module_dir / filename

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(lecture_json, f, indent=2, ensure_ascii=False)

    print(f"  Saved: {filepath}")

    # Optionally save transcript as separate file
    transcript_raw = job.outputs.get("transcript", "")
    if transcript_raw:
        transcript_path = module_dir / f"lecture-{job.lecture_number}-transcript.md"
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(transcript_raw)
        print(f"  Saved: {transcript_path}")

    return filepath


# =============================================================================
# MAIN RUNNER
# =============================================================================

async def run_bulk_processing(
    module_id: str,
    lectures: List[Dict[str, Any]],
    output_dir: Path,
    api_key: str,
    max_concurrent: int = MAX_CONCURRENT
) -> ProcessingResult:
    """
    Run bulk lecture processing.

    Args:
        module_id: Module identifier (e.g., "foundations")
        lectures: List of lecture data dicts with keys:
            - lecture_number: int
            - lecture_title: str
            - html_content: str
        output_dir: Base output directory
        api_key: VectorShift API key
        max_concurrent: Maximum concurrent jobs

    Returns:
        ProcessingResult with summary and output file paths
    """
    print("=" * 60)
    print("NGM BULK LECTURE PROCESSOR")
    print("=" * 60)
    print(f"\nModule ID: {module_id}")
    print(f"Lectures to process: {len(lectures)}")
    print(f"Output directory: {output_dir}")
    print(f"Pipeline ID: {PIPELINE_ID}")
    print(f"Max concurrent: {max_concurrent}")

    # Create jobs
    jobs = []
    for lec in lectures:
        job = LectureJob(
            module_id=module_id,
            lecture_number=lec["lecture_number"],
            lecture_title=lec["lecture_title"],
            html_content=lec["html_content"]
        )
        jobs.append(job)

    # Sort by lecture number
    jobs.sort(key=lambda j: j.lecture_number)

    start_time = time.time()

    # Process all jobs
    async with NGMBulkProcessor(
        api_key=api_key,
        max_concurrent=max_concurrent
    ) as processor:
        jobs = await processor.process_batch(jobs)

    # Save outputs
    print("\n" + "=" * 60)
    print("SAVING OUTPUTS")
    print("=" * 60)

    output_files = []
    for job in jobs:
        if job.status == "completed" and job.outputs:
            filepath = save_lecture_output(job, output_dir)
            if filepath:
                output_files.append(filepath)
        elif job.status == "failed":
            print(f"  FAILED: Lecture {job.lecture_number} - {job.error}")

    # Calculate results
    duration = time.time() - start_time
    successful = sum(1 for j in jobs if j.status == "completed")
    failed = sum(1 for j in jobs if j.status == "failed")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"\nTotal lectures: {len(jobs)}")
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Duration: {duration:.1f}s ({duration/60:.1f} minutes)")
    print(f"Output files: {len(output_files)}")

    if failed > 0:
        print("\nFailed lectures:")
        for job in jobs:
            if job.status == "failed":
                print(f"  - Lecture {job.lecture_number}: {job.error[:80]}")

    return ProcessingResult(
        module_id=module_id,
        total_lectures=len(jobs),
        successful=successful,
        failed=failed,
        duration_seconds=duration,
        jobs=jobs,
        output_files=output_files
    )


# =============================================================================
# CLI
# =============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Process HTML content through VectorShift HTML-to-Lecture-JSON-SVG pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process lectures from JSON string
  python ngm_bulk_processor.py \\
      --module-id "foundations" \\
      --lectures '[{"lecture_number": 1, "lecture_title": "Intro", "html_content": "<html>..."}]'

  # Process lectures from JSON file
  python ngm_bulk_processor.py \\
      --module-id "foundations" \\
      --lectures-file "lectures_data.json"

Environment Variables:
  VECTORSHIFT_API_KEY - Required for VectorShift API access
        """
    )

    parser.add_argument(
        "--module-id",
        type=str,
        required=True,
        help="Module identifier (e.g., 'foundations')"
    )

    # Either lectures JSON string or lectures file
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--lectures",
        type=str,
        help="JSON string array of lecture data"
    )
    input_group.add_argument(
        "--lectures-file",
        type=Path,
        help="Path to JSON file with lecture data"
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("content/ngm-lectures"),
        help="Output directory for lecture JSON files"
    )

    parser.add_argument(
        "--max-concurrent",
        type=int,
        default=MAX_CONCURRENT,
        help=f"Maximum concurrent jobs (default: {MAX_CONCURRENT})"
    )

    parser.add_argument(
        "--api-key",
        type=str,
        default=VECTORSHIFT_API_KEY,
        help="VectorShift API key (default: from VECTORSHIFT_API_KEY env var)"
    )

    args = parser.parse_args()

    # Validate API key
    api_key = args.api_key or os.environ.get("VECTORSHIFT_API_KEY")
    if not api_key:
        print("ERROR: VectorShift API key required.")
        print("Set VECTORSHIFT_API_KEY environment variable or use --api-key")
        sys.exit(1)

    # Load lectures data
    if args.lectures:
        try:
            lectures = json.loads(args.lectures)
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid JSON in --lectures: {e}")
            sys.exit(1)
    else:
        if not args.lectures_file.exists():
            print(f"ERROR: Lectures file not found: {args.lectures_file}")
            sys.exit(1)
        with open(args.lectures_file, "r", encoding="utf-8") as f:
            lectures = json.load(f)

    # Validate lectures data
    if not isinstance(lectures, list):
        print("ERROR: Lectures must be a JSON array")
        sys.exit(1)

    for i, lec in enumerate(lectures):
        required_keys = ["lecture_number", "lecture_title", "html_content"]
        missing = [k for k in required_keys if k not in lec]
        if missing:
            print(f"ERROR: Lecture {i+1} missing required keys: {missing}")
            sys.exit(1)

    # Run processing
    try:
        result = asyncio.run(run_bulk_processing(
            module_id=args.module_id,
            lectures=lectures,
            output_dir=args.output_dir,
            api_key=api_key,
            max_concurrent=args.max_concurrent
        ))

        # Print output file paths (useful for Claude skill)
        if result.output_files:
            print("\n" + "=" * 60)
            print("OUTPUT FILES")
            print("=" * 60)
            for filepath in result.output_files:
                print(filepath)

        # Exit with error code if any lectures failed
        if result.failed > 0:
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
