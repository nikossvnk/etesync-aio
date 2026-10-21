#!/usr/bin/env python3
"""Serves the web build of EteSync (all-in-one) on this computer only (127.0.0.1).

Paths that aren't files are answered with index.html, so that the app's own URLs (e.g. /settings)
also work when they are loaded directly. /bookmark-title reads the title of a web page for the
bookmarks, which the browser doesn't let the app do itself. Installed and started by install.sh."""
import argparse
import functools
import html
import http.server
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request


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


class OnlyWebRedirects(urllib.request.HTTPRedirectHandler):
    """Follows redirects only to other web pages (not e.g. to ftp: or file:)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme not in ("http", "https"):
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


opener = urllib.request.build_opener(OnlyWebRedirects)


def page_title(url):
    """The title of a web page (its og:title, or else its <title>), or None."""
    request = urllib.request.Request(url, headers={
        # (some sites refuse requests that don't say what they are)
        "User-Agent": "Mozilla/5.0 (compatible; EteSync bookmarks)",
        "Accept": "text/html,application/xhtml+xml",
    })
    with opener.open(request, timeout=10) as response:
        if "html" not in response.headers.get("Content-Type", "text/html"):
            return None
        data = response.read(300000)
        charset = response.headers.get_content_charset() or "utf-8"
    text = data.decode(charset, errors="replace")
    match = (re.search(r"""<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']""", text, re.I)
             or re.search(r"""<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']""", text, re.I)
             or re.search(r"<title[^>]*>([^<]*)</title>", text, re.I))
    title = re.sub(r"\s+", " ", html.unescape(match.group(1))).strip() if match else ""
    return title[:500] or None


class Handler(http.server.SimpleHTTPRequestHandler):
    # Set by main(): the host names (with the port) that requests have to be for. Others are refused,
    # so that a web site can't reach this server through a DNS name it points to 127.0.0.1.
    allowed_hosts = set()
    # (the launcher, etesync-desktop, tells by it that it's this server answering on the port)
    server_version = "EteSyncDesktop"

    def do_GET(self):
        if self.path.startswith("/bookmark-title?"):
            self.bookmark_title()
        else:
            super().do_GET()

    # Reads the title of the page of a bookmark (?url=...). Only for the app: the request has to be for
    # this server's own name, and have a header that a page of another site can't send without asking
    # first (which this server doesn't allow), so other sites can't make it fetch pages.
    def bookmark_title(self):
        if (self.headers.get("Host", "").lower() not in self.allowed_hosts) or (self.headers.get("X-EteSync-Request") != "title"):
            self.send_error(403, "Forbidden")
            return
        url = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("url", [""])[0]
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            self.send_error(400, "Not a web page")
            return
        try:
            title = page_title(url)
        except (OSError, ValueError, urllib.error.URLError):
            title = None
        body = json.dumps({"title": title}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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
