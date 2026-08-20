#!/usr/bin/env python3
"""
Fetch VectorShift pipeline outputs by span_id.

Usage:
    python3 fetch_outputs.py --span-ids id1 id2 id3 --output-dir /tmp/outputs
    python3 fetch_outputs.py --span-ids id1 --module-id module-1 --output-dir content/ngm-lectures
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

# Configuration
API_BASE = "https://api.vectorshift.ai/v1"
PIPELINE_ID = "6961308d6fdec16163ee0e2f"
API_KEY = os.environ.get("VECTORSHIFT_API_KEY", "sk_6L1cRGLL5qN2d9rjViLVAFr6ATqE1OAE78L5bgYltWBkryoE")

MAX_POLL_ATTEMPTS = 60  # 10 minutes at 10s intervals
POLL_INTERVAL = 10  # seconds


def fetch_status(span_id: str) -> dict:
    """Fetch pipeline run status for a given span_id."""
    url = f"{API_BASE}/pipeline/{PIPELINE_ID}/run/status/{span_id}"
    
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        return {"status": "error", "error": str(e)}
    except urllib.error.URLError as e:
        print(f"  URL Error: {e.reason}", file=sys.stderr)
        return {"status": "error", "error": str(e)}


def extract_json(raw_output: str) -> dict | None:
    """Extract JSON from VectorShift output (may be wrapped in markdown fences)."""
    if not raw_output:
        return None
        
    content = raw_output.strip()
    
    # Remove markdown code fences if present
    if content.startswith('```json'):
        content = content[7:]
    elif content.startswith('```'):
        content = content[3:]
    
    if content.endswith('```'):
        content = content[:-3]
    
    content = content.strip()
    
    # Find JSON object
    match = re.search(r'\{[\s\S]*\}', content)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError as e:
            print(f"  JSON decode error: {e}", file=sys.stderr)
            return None
    return None


def slugify(title: str) -> str:
    """Convert title to URL-friendly slug."""
    slug = title.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def fetch_and_save(span_ids: list[str], output_dir: str, module_id: str | None = None) -> list[dict]:
    """Fetch outputs for all span_ids and save to files."""
    results = []
    
    for span_id in span_ids:
        print(f"\nFetching span_id: {span_id}")
        
        # Poll until completed or timeout
        for attempt in range(MAX_POLL_ATTEMPTS):
            status_data = fetch_status(span_id)
            status = status_data.get("status", "unknown")
            
            if status == "completed":
                print(f"  Status: [OK] completed")
                result = status_data.get("result", {})
                
                # Extract lecture_json
                lecture_json_raw = result.get("lecture_json", "")
                lecture_data = extract_json(lecture_json_raw)
                
                if lecture_data:
                    # Try multiple title locations for compatibility
                    title = (
                        lecture_data.get("title") or 
                        lecture_data.get("meta", {}).get("title") or 
                        f"lecture-{span_id[:8]}"
                    )
                    print(f"  Lecture: {title}")
                    
                    # Determine output path
                    slug = slugify(title)
                    if module_id:
                        module_dir = os.path.join(output_dir, module_id)
                        os.makedirs(module_dir, exist_ok=True)
                        output_path = os.path.join(module_dir, f"{slug}.json")
                    else:
                        os.makedirs(output_dir, exist_ok=True)
                        output_path = os.path.join(output_dir, f"{slug}.json")
                    
                    # Save lecture JSON
                    with open(output_path, 'w', encoding='utf-8') as f:
                        json.dump(lecture_data, f, indent=2)
                    print(f"  Saved: {output_path}")
                    
                    results.append({
                        "span_id": span_id,
                        "status": "completed",
                        "title": title,
                        "slug": slug,
                        "path": output_path,
                        "data": lecture_data,
                        "all_outputs": result
                    })
                else:
                    print(f"  Warning: Could not extract lecture_json")
                    results.append({
                        "span_id": span_id,
                        "status": "completed",
                        "error": "Could not extract lecture_json",
                        "raw_result": result
                    })
                break
                
            elif status == "in_progress":
                if attempt == 0:
                    print(f"  Status: in_progress (polling...)")
                elif attempt % 6 == 0:  # Log every minute
                    print(f"  Still processing... ({attempt * POLL_INTERVAL}s)")
                time.sleep(POLL_INTERVAL)
                
            elif status == "failed":
                print(f"  Status: [FAILED]")
                error = status_data.get("error", "Unknown error")
                print(f"  Error: {error}")
                results.append({
                    "span_id": span_id,
                    "status": "failed",
                    "error": error
                })
                break
                
            else:
                print(f"  Status: {status}")
                results.append({
                    "span_id": span_id,
                    "status": status,
                    "data": status_data
                })
                break
        else:
            print(f"  Timeout: exceeded {MAX_POLL_ATTEMPTS * POLL_INTERVAL}s")
            results.append({
                "span_id": span_id,
                "status": "timeout"
            })
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Fetch VectorShift pipeline outputs")
    parser.add_argument("--span-ids", nargs="+", required=True, help="One or more span_ids to fetch")
    parser.add_argument("--output-dir", default=".", help="Output directory for JSON files")
    parser.add_argument("--module-id", help="Module ID for organizing outputs (e.g., module-1)")
    parser.add_argument("--json-summary", help="Path to save JSON summary of results")
    
    args = parser.parse_args()
    
    print(f"VectorShift Output Fetcher")
    print(f"Pipeline ID: {PIPELINE_ID}")
    print(f"Span IDs: {len(args.span_ids)}")
    print(f"Output Dir: {args.output_dir}")
    if args.module_id:
        print(f"Module ID: {args.module_id}")
    
    results = fetch_and_save(args.span_ids, args.output_dir, args.module_id)
    
    # Summary
    print(f"\n{'='*50}")
    print(f"Summary:")
    completed = sum(1 for r in results if r.get("status") == "completed" and "data" in r)
    failed = sum(1 for r in results if r.get("status") in ("failed", "error", "timeout"))
    print(f"  Completed: {completed}/{len(args.span_ids)}")
    if failed:
        print(f"  Failed: {failed}/{len(args.span_ids)}")
    
    # Save summary if requested
    if args.json_summary:
        with open(args.json_summary, 'w', encoding='utf-8') as f:
            # Remove large data from summary
            summary = []
            for r in results:
                s = {k: v for k, v in r.items() if k not in ("data", "all_outputs", "raw_result")}
                summary.append(s)
            json.dump(summary, f, indent=2)
        print(f"  Summary saved: {args.json_summary}")
    
    # Return results for programmatic use
    return results


if __name__ == "__main__":
    main()
