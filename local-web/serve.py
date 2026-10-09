#!/usr/bin/env python3
"""Serves the web build of EteSync (all-in-one) on this computer only (127.0.0.1).

Paths that aren't files are answered with index.html, so that the app's own URLs (e.g. /settings)
also work when they are loaded directly. Installed and started by install.sh."""
import argparse
import functools
import http.server
import os


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        # index.html must not be cached, so that an update is used right away (the rest have hashed names)
        if self.path.split("?")[0] in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8092)
    parser.add_argument("--dir", required=True, help="the web build to serve")
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=args.dir)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {args.dir} on http://localhost:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
