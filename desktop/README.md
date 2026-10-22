# EteSync Desktop: installing it on a computer

Runs the web version of the app on your own computer, at `http://localhost:8092`, with an entry in
the applications menu and a shortcut on the desktop. Linux for now.

Why locally instead of on a server: the app's code then comes from your own computer (a release
built from this repository), so the server only ever sees encrypted data, like with the Android
app. A web version served by the server could be changed to capture the password if the server
was taken over. It's only reachable from this computer.

## Installing (and updating)

Needs Python 3, which most Linux systems have, and a browser (Chromium, Chrome, Brave, Edge or
Firefox). Nothing is built on your computer: a release is the built app (about 2 MB).

```
curl -fsSL https://raw.githubusercontent.com/nikossvnk/etesync-aio/main/desktop/get.sh | sh
```

It downloads the latest release from the repository's GitHub releases, checks its checksum, and
installs it. Running it again updates it (it says so when the latest version is installed already).
Then open "EteSync Desktop" from the applications menu or the desktop, and log in with the server
URL (under "Advanced settings"), e.g. `https://etebase.example.com`.

Or by hand: download `etesync-desktop-VERSION.tar.gz` from the releases, unpack it, and:

- `./etesync-desktop` runs it without installing anything (it starts the server, which keeps running
  in the background until `./etesync-desktop --stop`, and opens the window), or
- `./install.sh` installs it.

Options of `install.sh` (environment variables, also passed on by `get.sh`, e.g.
`curl … | SERVICE=no sh`). What isn't given stays as it was installed:

| Variable | Default | |
|---|---|---|
| `SERVICE` | `yes` when there's a systemd user session, else `no` | `yes`: the server runs as a systemd user service, started when you log in. `no`: no service, the shortcut starts the server when it isn't running (it then keeps running in the background) |
| `PORT` | `8092` | The port on localhost. Changing it later means logging in again, as the browser keeps the login per address |
| `BROWSER` | the first one found of Chromium, Chrome, Brave, Edge, Firefox | The browser the shortcut opens. Chromium-based browsers open it in an app window, Firefox in a new window |
| `LOW_MEMORY` | `1` | Chromium-based browsers get flags that make them use a bit less memory (no spare page process, at most two, no background downloads, updates or sync); `0` leaves them out |

`get.sh` also has `VERSION` (a given version instead of the latest) and `FORCE=1` (install it even
when that version is installed already).

The checksum is only checked against the one in the same release, so it finds broken downloads,
not a changed release. That a release was built from this repository by its release workflow can be
checked with GitHub's attestation: `gh attestation verify etesync-desktop-VERSION.tar.gz --repo nikossvnk/etesync-aio`.

## What's installed

Everything is in your home directory, nothing needs root:

| What | Where |
|---|---|
| The app, the server (`serve.py`, on 127.0.0.1 only), the launcher (`etesync-desktop`) and the settings | `~/.local/share/etesync-aio-web/` |
| The service, with `SERVICE=yes` | `~/.config/systemd/user/etesync-aio-web.service` |
| The menu entry and the desktop shortcut, which run the launcher | `~/.local/share/applications/etesync-aio-web.desktop`, `~/Desktop/etesync-aio-web.desktop` |

The launcher opens the window, and starts the server first when it isn't running (with the service,
it always is). `etesync-desktop --stop` stops a server it started, `--status` says whether it runs.

## Making a release

Pushing a tag `vVERSION` (e.g. `git tag v1.2.0 && git push origin v1.2.0`) makes the release
workflow (`.github/workflows/release.yml`) build it and put it on that tag's GitHub release:
`etesync-desktop-VERSION.tar.gz`, its `.sha256`, and the attestation. `get.sh` installs the latest
one.

To build one here: `desktop/build-release.sh v1.2.0` (after `npm ci`), which writes them to `dist/`.
It only builds committed changes (`ALLOW_DIRTY=1` to try it out with others). An unpacked release
has the web build (`site/`), `serve.py`, `etesync-desktop`, `install.sh`, the icon, `VERSION`, a
`README.txt` with the commit it was made from, and the licences.

## Good to know

- The login is kept in the browser's storage for `http://localhost:8092`. Anyone who can use your
  browser profile can use the account, so only use it on your own computer.
- "Get title" of a bookmark makes the server fetch the page of its link, from this computer, to
  read its title (the browser doesn't let the app do it). Only the title goes to the app. Nothing
  is fetched without that button.
- Reminders of events and tasks are shown as notifications of the computer (with `notify-send`, or
  D-Bus), also while the window is closed, as long as the server runs (the service does from when you
  log in). For that, the app hands the server the reminders of the next two weeks: their titles,
  times and places, which it keeps in `reminders.json` in the install directory (readable only by
  you) until they're shown, and empties when you log out. A reminder missed while the computer was
  asleep is shown when it wakes, if it's at most an hour late. Calendars you hide don't remind.
- Notes, events, tasks and contacts you have opened stay available offline, but the browser needs the
  server running to load the app.

## Removing it

```
~/.local/share/etesync-aio-web/install.sh --uninstall
```

It removes the service, the server, the app and the shortcuts. The browser keeps the login and the
synced data for the app's address until you clear that site's data (or log out in the app first).
