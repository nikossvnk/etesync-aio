#!/bin/sh
# Downloads a release of EteSync Desktop (the latest one), checks its checksum, and installs it, or
# updates the installed one. Nothing is built, it needs Python 3, curl and tar (systemd is optional).
#
#   curl -fsSL https://raw.githubusercontent.com/nikossvnk/etesync-aio/main/desktop/get.sh | sh
#   curl -fsSL .../get.sh | VERSION=1.2.0 sh     # a given version
#   curl -fsSL .../get.sh | FORCE=1 sh           # install it again even when it's that version already
#
# The options of install.sh (SERVICE, PORT, BROWSER, LOW_MEMORY) are passed on to it. RELEASES (default: the
# repository's releases on GitHub) is where the files are downloaded from, VERSION's files being in
# RELEASES/download/vVERSION/.
set -eu

# All in a function that's only called at the end, so that nothing runs if the download of this
# script breaks off
main() {
    releases="${RELEASES:-https://github.com/nikossvnk/etesync-aio/releases}"
    installed_file="${XDG_DATA_HOME:-$HOME/.local/share}/etesync-aio-web/VERSION"

    for cmd in curl tar bash python3; do
        command -v "$cmd" >/dev/null 2>&1 || fail "Missing $cmd, it's needed to install EteSync Desktop"
    done
    if command -v sha256sum >/dev/null 2>&1; then
        sha256="sha256sum"
    elif command -v shasum >/dev/null 2>&1; then
        sha256="shasum -a 256"
    else
        fail "Missing sha256sum, it's needed to check the download"
    fi

    version="${VERSION:-}"
    if [ -z "$version" ]; then
        # The latest release's page redirects to its tag (this needs no API, which has rate limits)
        latest="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$releases/latest")" ||
            fail "Couldn't find the latest release at $releases"
        version="${latest##*/tag/}"
        [ "$version" != "$latest" ] || fail "There's no release at $releases yet"
    fi
    version="${version#v}"
    case "$version" in
        *[!A-Za-z0-9._-]*|"") fail "\"$version\" isn't a version" ;;
    esac

    if [ -f "$installed_file" ] && [ "$(cat "$installed_file")" = "$version" ] && [ "${FORCE:-0}" != "1" ]; then
        echo "EteSync Desktop $version is installed already (FORCE=1 installs it again)"
        exit 0
    fi

    name="etesync-desktop-$version"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT INT TERM
    echo "Downloading EteSync Desktop $version"
    curl -fsSL -o "$tmp/$name.tar.gz" "$releases/download/v$version/$name.tar.gz" ||
        fail "Couldn't download $name.tar.gz from $releases"
    curl -fsSL -o "$tmp/$name.tar.gz.sha256" "$releases/download/v$version/$name.tar.gz.sha256" ||
        fail "Couldn't download its checksum, $name.tar.gz.sha256"
    expected="$(cut -d ' ' -f 1 < "$tmp/$name.tar.gz.sha256")"
    actual="$(cd "$tmp" && $sha256 "$name.tar.gz" | cut -d ' ' -f 1)"
    [ -n "$expected" ] && [ "$expected" = "$actual" ] ||
        fail "The download doesn't match its checksum, it wasn't installed"

    mkdir "$tmp/unpacked"
    tar -xzf "$tmp/$name.tar.gz" -C "$tmp/unpacked" --no-same-owner
    [ -f "$tmp/unpacked/$name/install.sh" ] || fail "The download isn't a release of EteSync Desktop"
    bash "$tmp/unpacked/$name/install.sh"
}

fail() {
    echo "$*" >&2
    exit 1
}

main
