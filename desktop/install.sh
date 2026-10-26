#!/usr/bin/env bash
# Installs EteSync Desktop from the release this script is in (unpacked from
# etesync-desktop-VERSION.tar.gz), or updates the installed one to it. get.sh downloads the latest
# release and runs this. See README.md in the repository's desktop directory. (To only try it out,
# without installing anything, run ./etesync-desktop in the unpacked release instead.)
#
#   ./install.sh                      # install, or update
#   ./install.sh --uninstall          # remove it again (FORCE=1: without asking)
#   SERVICE=no ./install.sh           # without the service: the shortcut starts the server
#   PORT=8093 ./install.sh            # another port (default 8092, or the one it's installed on)
#   BROWSER=chromium ./install.sh     # the browser the shortcut opens (default: found when opening it)
#   LOW_MEMORY=0 ./install.sh         # without the flags that make Chromium-based browsers use less memory
#   PROFILE=shared ./install.sh       # open it in the browser's usual profile (default: own, a profile of its own)
#
# What it does, all in your home directory (nothing needs root):
#   1. Copies the app to ~/.local/share/etesync-aio-web
#   2. With systemd (SERVICE=yes, the default when there's a systemd user session): serves it on
#      http://localhost:PORT with a user service, etesync-aio-web.service, which starts when you log
#      in. Without it (SERVICE=no): the shortcut starts the server when it isn't running. Either way
#      it's only reachable from this computer.
#   3. Adds "EteSync Desktop" to the applications menu, and a shortcut on the desktop
set -euo pipefail

BASE="${XDG_DATA_HOME:-$HOME/.local/share}/etesync-aio-web"
SITE="$BASE/site"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/etesync-aio-web.service"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_DIR="$(command -v xdg-user-dir >/dev/null 2>&1 && xdg-user-dir DESKTOP || echo "$HOME/Desktop")"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() { printf '\n==> %s\n' "$*"; }
have_systemd() { command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; }
remove_service() {
    if [ -f "$UNIT" ]; then
        systemctl --user disable --now --quiet etesync-aio-web.service 2>/dev/null || true
        rm -f "$UNIT"
        systemctl --user daemon-reload 2>/dev/null || true
    fi
}

if [ "${1:-}" = "--uninstall" ]; then
    if [ -d "$BASE/profile" ] && [ -t 0 ] && [ "${FORCE:-}" != "1" ]; then
        echo "This also removes the window's browser profile, with the changes that aren't synced yet."
        printf "Sync in the app first (e.g. press Sync while online). Remove it? [y/N] "
        read -r answer
        case "$answer" in
            y|Y|yes) ;;
            *) echo "Nothing was removed"; exit 1 ;;
        esac
    fi
    step "Removing EteSync Desktop"
    remove_service
    [ -x "$BASE/etesync-desktop" ] && "$BASE/etesync-desktop" --stop > /dev/null || true
    rm -f "$APPS_DIR/etesync-aio-web.desktop" "$DESKTOP_DIR/etesync-aio-web.desktop"
    rm -rf "$BASE"
    echo "Removed, with the app window's own browser profile. A browser it was opened in with"
    echo "PROFILE=shared (or by its address) still has the login and the synced data for the app's"
    echo "address, until you clear that site's data in it (logging out in the app before removing it does that too)."
    exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "Missing python3, install it, e.g. with: sudo dnf install python3 (or sudo apt install python3)" >&2
    exit 1
fi
if [ ! -f "$HERE/VERSION" ] || [ ! -f "$HERE/site/index.html" ]; then
    echo "$HERE isn't an unpacked release (etesync-desktop-VERSION.tar.gz), this script has to stay in it" >&2
    exit 1
fi
VERSION="$(cat "$HERE/VERSION")"

# What's not given stays as it's installed: the port above all, as the browser keeps the login per
# address (a new port means logging in again)
given_port="${PORT:-}" given_browser="${BROWSER:-}" given_low_memory="${LOW_MEMORY:-}" given_profile="${PROFILE:-}"
installed=no
[ -f "$BASE/VERSION" ] && installed=yes
# shellcheck source=/dev/null
[ -f "$BASE/settings" ] && . "$BASE/settings"
# (installed by a version without it, which opened the window in the browser's usual profile)
had_profile="${PROFILE:-}"
if [ -z "$given_port" ] && [ -z "${PORT:-}" ] && [ -f "$UNIT" ]; then
    # (installed by a version that kept the port only in the service)
    PORT="$(sed -n 's/.*--port \([0-9]\+\).*/\1/p' "$UNIT" | head -n 1)"
fi
PORT="${given_port:-${PORT:-8092}}"
BROWSER="${given_browser:-${BROWSER:-}}"
LOW_MEMORY="${given_low_memory:-${LOW_MEMORY:-1}}"
PROFILE="${given_profile:-${PROFILE:-own}}"
case "$PROFILE" in
    own|shared) ;;
    *) echo "PROFILE is own or shared" >&2; exit 1 ;;
esac
URL="http://localhost:$PORT"
open_links=""
[ "$PROFILE" = "own" ] && open_links=" --open-links"
case "${SERVICE:-auto}" in
    yes|1) have_systemd || { echo "There's no systemd user session to run the service in (SERVICE=no installs it without)" >&2; exit 1; }
           service=yes ;;
    no|0) service=no ;;
    auto) if have_systemd; then service=yes; else service=no; fi ;;
    *) echo "SERVICE is yes, no or auto" >&2; exit 1 ;;
esac

step "Installing EteSync Desktop $VERSION"
mkdir -p "$BASE"
# A server the launcher started serves the old files, so it's stopped (and started again below)
[ -x "$BASE/etesync-desktop" ] && "$BASE/etesync-desktop" --stop > /dev/null || true
rm -rf "$BASE/site.new" "$BASE/site.old"
cp -r "$HERE/site" "$BASE/site.new"
[ -d "$SITE" ] && mv "$SITE" "$BASE/site.old"
mv "$BASE/site.new" "$SITE"
# (build.log, src and __pycache__: from earlier versions, which built the app here)
rm -rf "$BASE/site.old" "$BASE/build.log" "$BASE/src" "$BASE/__pycache__"
cp "$HERE/serve.py" "$HERE/etesync-desktop" "$HERE/install.sh" "$HERE/icon.png" "$HERE/VERSION" "$BASE/"
{
    echo "# The settings install.sh was run with, used by etesync-desktop and by the next install"
    printf 'PORT=%q\nBROWSER=%q\nLOW_MEMORY=%q\nPROFILE=%q\n' "$PORT" "$BROWSER" "$LOW_MEMORY" "$PROFILE"
} > "$BASE/settings"

if [ "$service" = "yes" ]; then
    step "Installing the service (etesync-aio-web.service on $URL)"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT" <<UNIT
[Unit]
Description=EteSync Desktop, served on $URL (this computer only)

[Service]
ExecStart=$(command -v python3) $BASE/serve.py --port $PORT --dir $SITE --reminders $BASE/reminders.json$open_links
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload
    systemctl --user enable --quiet etesync-aio-web.service
    systemctl --user restart etesync-aio-web.service
    for _ in $(seq 1 20); do
        [ "$("$BASE/etesync-desktop" --status)" = "ours" ] && break
        sleep 0.5
    done
    [ "$("$BASE/etesync-desktop" --status)" = "ours" ] ||
        { echo "The service doesn't answer on $URL, see: journalctl --user -u etesync-aio-web" >&2; exit 1; }
else
    step "Starting the server on $URL (without a service, the shortcut starts it)"
    remove_service
    "$BASE/etesync-desktop" --start
fi

step "Adding the shortcut"
mkdir -p "$APPS_DIR"
desktop_file="$APPS_DIR/etesync-aio-web.desktop"
cat > "$desktop_file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=EteSync Desktop
Comment=End-to-end encrypted notes, bookmarks, calendar, tasks and contacts (runs on this computer, $URL)
Exec="$BASE/etesync-desktop"
Icon=$BASE/icon.png
Categories=Office;Calendar;ContactManagement;
StartupNotify=true
DESKTOP
chmod +x "$desktop_file"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database --quiet "$APPS_DIR" || true
if [ -d "$DESKTOP_DIR" ]; then
    cp "$desktop_file" "$DESKTOP_DIR/etesync-aio-web.desktop"
    chmod +x "$DESKTOP_DIR/etesync-aio-web.desktop"
    # GNOME only starts desktop shortcuts that are marked as trusted
    command -v gio >/dev/null 2>&1 && gio set "$DESKTOP_DIR/etesync-aio-web.desktop" metadata::trusted true 2>/dev/null || true
fi

step "Done"
echo "EteSync Desktop $VERSION runs on $URL. Open it from the applications menu or the desktop,"
echo "or with $BASE/etesync-desktop. An open window shows the new version after reloading it."
if [ "$installed" = "yes" ] && [ -z "$had_profile" ] && [ "$PROFILE" = "own" ]; then
    echo
    echo "The window now opens in a browser profile of its own, with Chromium-based browsers (without"
    echo "your browser's extensions, and links open in your default browser), so log in again the first"
    echo "time. The old login and data stay in your browser's usual profile: if the app was offline, open"
    echo "$URL there to sync its changes, then log out there to remove them."
    echo "To keep the old way: PROFILE=shared $BASE/install.sh"
fi
if [ "$service" = "no" ]; then
    echo "Without the service, the server keeps running in the background ($BASE/etesync-desktop --stop stops it)."
fi
echo "To update it later, run the installer again (see get.sh). To remove it: $BASE/install.sh --uninstall"
