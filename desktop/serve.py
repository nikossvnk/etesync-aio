#!/usr/bin/env python3
"""Serves the web build of EteSync (all-in-one) on this computer only (127.0.0.1).

Paths that aren't files are answered with index.html, so that the app's own URLs (e.g. /settings)
also work when they are loaded directly. /bookmark-title reads the title of a web page for the
bookmarks, which the browser doesn't let the app do itself. /reminders takes the notifications of the
reminders of events and tasks that are due soon, which this shows as notifications of the computer
when it's time (also while the app's window is closed). With --open-links, /open-link opens links of
the app in the computer's default browser (for when the app's window is in a browser profile of its
own). Installed and started by install.sh."""
import argparse
import functools
import html
import http.server
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
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


class Reminders:
    """The notifications the app handed over (each with when it's due), and the ones shown already.

    They're kept in a file (only readable by the user), so that they're also shown after the computer
    was restarted, before the app's window is opened again. One that was missed (e.g. while the
    computer was asleep) is shown when it's at most an hour late."""

    late = 3600
    lock = threading.Lock()

    def __init__(self, path=None):
        self.path = path
        self.notices = []
        # (key, at) of the ones shown, kept for two days
        self.shown = {}
        if path and os.path.exists(path):
            try:
                with open(path) as f:
                    data = json.load(f)
                self.notices = valid_notices(data.get("reminders", []))
                self.shown = {k: float(v) for k, v in data.get("shown", {}).items()}
            except (OSError, ValueError, AttributeError, TypeError):
                pass

    def save(self):
        if not self.path:
            return
        directory = os.path.dirname(os.path.abspath(self.path))
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".reminders.")
        with os.fdopen(fd, "w") as f:
            json.dump({"reminders": self.notices, "shown": self.shown}, f)
        os.replace(tmp, self.path)

    def replace(self, notices):
        with self.lock:
            self.notices = notices
            self.save()

    def due(self, now):
        """The notifications to show now (each once), which are then recorded as shown."""
        with self.lock:
            ret = []
            for notice in self.notices:
                key = f"{notice['key']}@{notice['at']}"
                if (notice["at"] / 1000 <= now) and (notice["at"] / 1000 > now - self.late) and (key not in self.shown):
                    self.shown[key] = notice["at"] / 1000
                    ret.append(notice)
            for key, at in list(self.shown.items()):
                if at < now - 2 * 86400:
                    del self.shown[key]
            if ret:
                self.save()
            return ret


def valid_notices(items):
    """The notifications in what the app sent, as they're kept (others are left out)."""
    ret = []
    for x in items[:1000] if isinstance(items, list) else []:
        if (isinstance(x, dict) and isinstance(x.get("at"), (int, float)) and isinstance(x.get("key"), str)
                and isinstance(x.get("title"), str) and isinstance(x.get("body", ""), str)):
            ret.append({"key": x["key"][:300], "at": float(x["at"]), "title": x["title"][:300], "body": x.get("body", "")[:500]})
    return ret


ICON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.png")


def notify(title, body):
    """Shows a notification of the computer (with notify-send, or else D-Bus, which both reach the
    desktop's notifications)."""
    title = title or "Reminder"
    if shutil.which("notify-send"):
        command = ["notify-send", "--app-name=EteSync Desktop"]
        if os.path.exists(ICON):
            command.append(f"--icon={ICON}")
        # (the body can have markup, which the event's text mustn't be taken as; "--" ends the options)
        command += ["--", title, html.escape(body)]
    elif shutil.which("gdbus"):
        # (GVariant's strings are written like JSON's)
        command = ["gdbus", "call", "--session", "--dest=org.freedesktop.Notifications",
                   "--object-path=/org/freedesktop/Notifications", "--method=org.freedesktop.Notifications.Notify", "--",
                   json.dumps("EteSync Desktop"), "0", json.dumps(ICON if os.path.exists(ICON) else ""),
                   json.dumps(title), json.dumps(html.escape(body)), "[]", "{}", "-1"]
    else:
        print("Can't show a reminder: there's neither notify-send nor gdbus", flush=True)
        return
    try:
        subprocess.run(command, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    except (OSError, subprocess.SubprocessError) as e:
        print(f"Can't show a reminder: {e}", flush=True)


def show_reminders(reminders, every):
    while True:
        for notice in reminders.due(time.time()):
            notify(notice["title"], notice["body"])
        time.sleep(every)


def valid_link(url):
    """The link as it's opened, if it's a web, email or phone link (the ones the app opens), or None."""
    if not isinstance(url, str) or not 0 < len(url) <= 8000 or re.search(r"[\x00-\x20\x7f]", url):
        return None
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    if parts.scheme.lower() in ("http", "https"):
        return url if parts.netloc else None
    return url if (parts.scheme.lower() in ("mailto", "tel")) and parts.path else None


# What the desktop's session has (e.g. when the service was started before it), for the browser that
# the link opens in
SESSION_VARIABLES = ("DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_CURRENT_DESKTOP", "XDG_SESSION_TYPE", "DBUS_SESSION_BUS_ADDRESS")


def session_environment():
    env = dict(os.environ)
    if (env.get("DISPLAY") or env.get("WAYLAND_DISPLAY")) or not shutil.which("systemctl"):
        return env
    try:
        output = subprocess.run(["systemctl", "--user", "show-environment"], capture_output=True, text=True, timeout=5, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return env
    for line in output.splitlines():
        name, _, value = line.partition("=")
        if (name in SESSION_VARIABLES) and not env.get(name):
            env[name] = value
    return env


def open_link(url):
    """Opens the link in the computer's default browser (or mail or phone app), with xdg-open, or
    else gio. (The link starts with its scheme, so neither takes it as an option.)"""
    if shutil.which("xdg-open"):
        command = ["xdg-open", url]
    elif shutil.which("gio"):
        command = ["gio", "open", url]
    else:
        print("Can't open a link: there's neither xdg-open nor gio", flush=True)
        return False
    try:
        process = subprocess.Popen(command, env=session_environment(), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as e:
        print(f"Can't open a link: {e}", flush=True)
        return False
    # (xdg-open can wait for the browser it started to be closed)
    threading.Thread(target=process.wait, daemon=True).start()
    return True


class Handler(http.server.SimpleHTTPRequestHandler):
    # Set by main(): the host names (with the port) that requests have to be for. Others are refused,
    # so that a web site can't reach this server through a DNS name it points to 127.0.0.1.
    allowed_hosts = set()
    # (the launcher, etesync-desktop, tells by it that it's this server answering on the port)
    server_version = "EteSyncDesktop"
    # Set by main()
    reminders = None
    open_links = False

    # Whether the request comes from the app: it's for this server's own name, and has the header (a
    # page of another site can't send it without asking first, which this server doesn't allow)
    def from_app(self, request):
        return (self.headers.get("Host", "").lower() in self.allowed_hosts) and (self.headers.get("X-EteSync-Request") == request)

    # The JSON the app sent, or None (after answering with an error)
    def read_json(self):
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self.send_error(403, "Forbidden")
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= 1000000:
            self.send_error(413 if length > 0 else 400, "Too long" if length > 0 else "Bad Request")
            return None
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            data = None
        if not isinstance(data, dict):
            self.send_error(400, "Bad Request")
            return None
        return data

    def send_no_content(self):
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    # Takes the notifications of the reminders that are due soon (they replace the ones it had), and
    # opens links. Only from the app, like /bookmark-title (a page of another site can't send the
    # header, nor JSON).
    def do_POST(self):
        if (self.path == "/open-link") and self.open_links:
            self.open_link()
            return
        if self.path != "/reminders":
            self.send_error(404, "Not Found")
            return
        if not self.from_app("reminders"):
            self.send_error(403, "Forbidden")
            return
        data = self.read_json()
        if data is None:
            return
        self.reminders.replace(valid_notices(data.get("reminders")))
        self.send_no_content()

    # Opens a link of the app ({"url": ...}) in the computer's default browser
    def open_link(self):
        if not self.from_app("open"):
            self.send_error(403, "Forbidden")
            return
        data = self.read_json()
        if data is None:
            return
        url = valid_link(data.get("url"))
        if not url:
            self.send_error(400, "Not a web, email or phone link")
            return
        if not open_link(url):
            self.send_error(500, "Can't open links")
            return
        self.send_no_content()

    def do_GET(self):
        if self.path.startswith("/bookmark-title?"):
            self.bookmark_title()
        elif self.path == "/open-link":
            # (the app asks whether this server opens its links)
            if not self.open_links:
                self.send_error(404, "Not Found")
                return
            if not self.from_app("open"):
                self.send_error(403, "Forbidden")
                return
            body = json.dumps({"enabled": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    # Reads the title of the page of a bookmark (?url=...). Only for the app (see from_app()), so other
    # sites can't make it fetch pages.
    def bookmark_title(self):
        if not self.from_app("title"):
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
    parser.add_argument("--reminders", help="the file the reminders that are due soon are kept in (default: only in memory)")
    parser.add_argument("--open-links", action="store_true", help="open the app's links in the default browser (/open-link)")
    parser.add_argument("--check-every", type=float, default=15, help=argparse.SUPPRESS)
    args = parser.parse_args()
    Handler.allowed_hosts = {f"localhost:{args.port}", f"127.0.0.1:{args.port}"}
    Handler.reminders = Reminders(args.reminders)
    Handler.open_links = args.open_links
    threading.Thread(target=show_reminders, args=(Handler.reminders, args.check_every), daemon=True).start()
    handler = functools.partial(Handler, directory=args.dir)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {args.dir} on http://localhost:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
