#!/usr/bin/env bash
# Builds a release of EteSync Desktop: the web build, with the server and the installer, packed as
# dist/etesync-desktop-VERSION.tar.gz, and its checksum, dist/etesync-desktop-VERSION.tar.gz.sha256.
# The release workflow (.github/workflows/release.yml) runs it for each tag, and uploads both.
#
#   desktop/build-release.sh v1.2.0     # the version, e.g. the tag (a leading "v" is left out)
#   desktop/build-release.sh            # the version from git describe
#
# Needs Node.js 20 or newer and the packages (npm ci). Only committed changes are released, so it
# stops when the repository has uncommitted ones (ALLOW_DIRTY=1 builds anyway, for trying it out).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
    echo "The repository has uncommitted changes, commit them first (or ALLOW_DIRTY=1 to build anyway)" >&2
    exit 1
fi
[ -d node_modules ] || { echo "The packages aren't installed, run: npm ci" >&2; exit 1; }

VERSION="${1:-$(git describe --tags --always --dirty)}"
VERSION="${VERSION#v}"
NAME="etesync-desktop-$VERSION"
DIST="$ROOT/dist"
STAGE="$DIST/$NAME"
COMMIT="$(git rev-parse HEAD)"
SOURCE="https://github.com/nikossvnk/etesync-aio/tree/$COMMIT"

echo "Building $NAME (at $(git log -1 --format='%h %s'))"
rm -rf "$STAGE" "$DIST/$NAME.tar.gz" "$DIST/$NAME.tar.gz.sha256"
mkdir -p "$STAGE"
npx expo export --platform web --output-dir "$STAGE/site" > "$DIST/build.log" 2>&1 ||
    { echo "The build failed, see $DIST/build.log" >&2; exit 1; }

cp desktop/serve.py desktop/install.sh desktop/etesync-desktop "$STAGE/"
cp assets/icon.png "$STAGE/icon.png"
cp -r LICENSES "$STAGE/LICENSES"
echo "$VERSION" > "$STAGE/VERSION"
# (the app reads it from there, for its About page, see src/appVersion.ts)
echo "$VERSION" > "$STAGE/site/version.txt"
cat > "$STAGE/README.txt" <<README
EteSync Desktop $VERSION

Notes, bookmarks, calendar, tasks and contacts on EteSync, end-to-end encrypted, as a web app
that runs on this computer only (http://localhost:8092).

To try it without installing anything, run ./etesync-desktop in this directory.

To install it (an entry in the applications menu, and with systemd a service that starts it when
you log in), or to update an installed one, run ./install.sh. ./install.sh --uninstall removes it
again. It needs Python 3 (Linux; systemd is optional, SERVICE=no installs it without).

Made from $SOURCE
Licence: GPL-3.0, except the files taken from etesync-web, which are AGPL-3.0, so the app as a
whole is under the AGPL-3.0. Both texts are in LICENSES.
README

# The same archive for the same commit: sorted, without owners, and with the time of the commit
epoch="$(git log -1 --format=%ct)"
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@$epoch" -C "$DIST" -cf - "$NAME" |
    gzip -9n > "$DIST/$NAME.tar.gz"
(cd "$DIST" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
rm -rf "$STAGE"

echo "Made $DIST/$NAME.tar.gz ($(du -h "$DIST/$NAME.tar.gz" | cut -f1))"
cat "$DIST/$NAME.tar.gz.sha256"
