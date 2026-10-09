#!/usr/bin/env python3
"""Serves the web build of EteSync (all-in-one) on this computer only (127.0.0.1).

Paths that aren't files are answered with index.html, so that the app's own URLs (e.g. /settings)
also work when they are loaded directly. Installed and started by install.sh."""
import argparse
import functools
import http.server
import os


# What the page may load and run. Only its own scripts (and WebAssembly, which the encryption uses), so
# that nothing that comes in synced data could run as code. It connects to the Etebase server, which
# can be any (https, or http on the local network, which a policy can't tell apart from other http).
# Images can come from anywhere, as notes can show remote images (each one only when asked to).
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src * data: blob:",
    # (data: is the encryption's WebAssembly, which is part of the app)
    "connect-src 'self' https: http: data:",
    # (the encryption's key derivation runs in a worker made from the app's own code)
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
])


class Handler(http.server.SimpleHTTPRequestHandler):
    # Set by main(): the host names (with the port) that requests have to be for. Others are refused,
    # so that a web site can't reach this server through a DNS name it points to 127.0.0.1.
    allowed_hosts = set()

    def send_head(self):
        if self.headers.get("Host", "").lower() not in self.allowed_hosts:
            self.send_error(421, "Misdirected Request")
            return None
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        # index.html must not be cached, so that an update is used right away (the rest have hashed names)
        if self.path.split("?")[0] in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8092)
    parser.add_argument("--dir", required=True, help="the web build to serve")
    args = parser.parse_args()
    Handler.allowed_hosts = {f"localhost:{args.port}", f"127.0.0.1:{args.port}"}
    handler = functools.partial(Handler, directory=args.dir)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {args.dir} on http://localhost:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
