#!/usr/bin/env python3
"""
Claudetorio Activity Reporter — sidecar that captures Claude Code output,
parses it into structured activity events, and POSTs them to the broker.

Usage:
    claude ... 2>&1 | python3 reporter.py --session-id ID --broker-url URL
"""

import sys
import re
import json
import time
import threading
import urllib.request
import argparse
from datetime import datetime, timezone
from collections import deque


def classify_line(line: str) -> tuple[str, str]:
    """Classify a line of Claude Code output into (event_type, summary)."""
    stripped = line.strip()
    if not stripped:
        return ("system", "")

    # Tool use patterns
    if re.match(r"^(Read|Write|Edit|Glob|Grep|Bash|LSP|WebFetch|WebSearch)\b", stripped):
        return ("tool_use", stripped[:200])
    if re.match(r"^mcp__\w+__\w+", stripped):
        return ("tool_use", stripped[:200])

    # Code execution
    if stripped.startswith("```") or stripped.startswith(">>> "):
        return ("code_exec", stripped[:200])

    # Errors
    if re.match(r"^(Error|error|ERROR|Traceback|Exception|FAILED)", stripped):
        return ("error", stripped[:200])

    # Commits
    if re.match(r"^\[commit [a-f0-9]+\]", stripped):
        return ("commit", stripped[:200])

    # Output / results (indented or prefixed)
    if stripped.startswith(("Result:", "Output:", "  ", "\t")):
        return ("output", stripped[:200])

    # Default: thinking
    return ("thinking", stripped[:200])


def make_event(event_type: str, summary: str, detail: str | None = None) -> dict:
    return {
        "type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "detail": detail,
    }


def flush_events(events: list[dict], broker_url: str, session_id: str):
    """POST a batch of events to the broker."""
    if not events:
        return
    try:
        payload = json.dumps({"events": events}).encode("utf-8")
        req = urllib.request.Request(
            f"{broker_url}/api/session/{session_id}/events",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass  # Best effort — don't interrupt the agent


def main():
    parser = argparse.ArgumentParser(description="Claudetorio activity reporter")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--broker-url", required=True)
    parser.add_argument("--flush-interval", type=float, default=0.5)
    args = parser.parse_args()

    buffer: deque[dict] = deque()
    lock = threading.Lock()

    def flusher():
        """Background thread that flushes buffered events periodically."""
        while True:
            time.sleep(args.flush_interval)
            with lock:
                batch = list(buffer)
                buffer.clear()
            flush_events(batch, args.broker_url, args.session_id)

    flush_thread = threading.Thread(target=flusher, daemon=True)
    flush_thread.start()

    try:
        for line in sys.stdin:
            # Pass through to stdout so the user still sees output
            sys.stdout.write(line)
            sys.stdout.flush()

            event_type, summary = classify_line(line)
            if not summary:
                continue

            event = make_event(event_type, summary)
            with lock:
                buffer.append(event)

    except KeyboardInterrupt:
        pass
    finally:
        # Final flush
        with lock:
            batch = list(buffer)
            buffer.clear()
        flush_events(batch, args.broker_url, args.session_id)


if __name__ == "__main__":
    main()
