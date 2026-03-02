#!/usr/bin/env python3
"""Minimal OpenAI-compatible mock API for CI integration tests.

Accepts any POST to any path and returns a trivial FLE observation call,
letting the run-worker execute steps without a real LLM.
"""
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

_step = 0


class MockLLMHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        global _step
        content_length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(content_length)  # consume body

        _step += 1
        body = json.dumps({
            "id": f"mock-{_step}-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "mock",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "get_observation()",
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 50,
                "completion_tokens": 5,
                "total_tokens": 55,
            },
        }).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # silence access logs


if __name__ == "__main__":
    port = 8000
    print(f"Mock LLM API listening on :{port}", flush=True)
    HTTPServer(("0.0.0.0", port), MockLLMHandler).serve_forever()
