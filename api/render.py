"""Vercel Python serverless function: POST per-repo hourly commit counts,
get back the rendered inkblot image.

On Vercel this is served at ``/api/render`` by the Python runtime. The same
file doubles as a CLI for local validation:

    python3 api/render.py < payload.json > out.png
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _inkblot import render_inkblot  # noqa: E402

try:
    from http.server import BaseHTTPRequestHandler
except ImportError:  # pragma: no cover - stdlib always present
    BaseHTTPRequestHandler = object  # type: ignore


class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel requires this name
    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("content-length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
            img = render_inkblot(payload)
        except Exception as exc:  # surface the failure loudly, never a blank 200
            self.send_response(400)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode())
            return

        fmt = str(payload.get("format", "png")).lower()
        self.send_response(200)
        self.send_header(
            "content-type", "image/svg+xml" if fmt == "svg" else "image/png"
        )
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(img)


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    sys.stdout.buffer.write(render_inkblot(payload))
