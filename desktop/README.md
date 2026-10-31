# EteSync Desktop: installing it on a computer

Runs the web version of the app on your own computer, at `http://localhost:8092`, with an entry in
the applications menu (and a shortcut on the desktop if you want one). Linux for now.

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
Then open "EteSync Desktop" from the applications menu, and log in with the server
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
| `PROFILE` | `own` | `own`: the window opens in a browser profile of its own (see below), and links open in your default browser. `shared`: in the browser's usual profile, with its extensions, and links open in that browser. Changing it means logging in again |
| `DESKTOP_ICON` | `no` | `yes`: also a shortcut on the desktop. It can be added or removed later too, without installing again: `~/.local/share/etesync-desktop/install.sh --desktop-icon` (or `--no-desktop-icon`) |

`get.sh` also has `VERSION` (a given version instead of the latest) and `FORCE=1` (install it even
when that version is installed already).

The checksum is only checked against the one in the same release, so it finds broken downloads,
not a changed release. That a release was built from this repository by its release workflow can be
checked with GitHub's attestation: `gh attestation verify etesync-desktop-VERSION.tar.gz --repo nikossvnk/etesync-aio`.

## What's installed

Everything is in your home directory, nothing needs root:

| What | Where |
|---|---|
| The app, the server (`serve.py`, on 127.0.0.1 only), the launcher (`etesync-desktop`) and the settings | `~/.local/share/etesync-desktop/` |
| The window's browser profile, with `PROFILE=own` (the login and the synced data) | `~/.local/share/etesync-desktop/profile/` (Firefox: `profile-firefox/`) |
| The service, with `SERVICE=yes` | `~/.config/systemd/user/etesync-desktop.service` |
| The menu entry, which runs the launcher | `~/.local/share/applications/etesync-desktop.desktop` |
| The desktop shortcut, with `DESKTOP_ICON=yes` | `~/Desktop/etesync-desktop.desktop` |

Versions before 0.1.11 were installed as `etesync-aio-web` (the folder, the service and the
shortcuts). Installing 0.1.11 or later moves such an install to the names above, with its settings
and the window's profile (so the login stays), and removes the old service and shortcuts. Close the
app's window first: while it's open, the installer stops and asks for that.

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

## The window's own browser profile

With `PROFILE=own` (the default), the window opens with a browser profile of its own, readable only
by you: Chromium-based browsers with `--user-data-dir` (`profile/`, made the first time it's
opened), Firefox with `--profile` (`profile-firefox/`, with its settings in `user.js`, written at
every start):

- **No extensions** (Chromium: `--disable-extensions`; Firefox: a new profile has none, installing
  them is turned off, and ones put in by other programs stay off). An extension of your usual profile that may "read and
  change data on all websites" could otherwise read the app's page, the login with the account's
  keys included.
- **The permissions the app doesn't use are turned off**: notifications (the reminders are the
  computer's, shown by the server), location, camera, microphone, reading the clipboard (copying a
  link still works), USB, serial, HID and Bluetooth devices, sensors, MIDI, and others (in Firefox
  also reaching programs on this computer and devices of the local network, which other sites
  would need it for: the app is on localhost, and reaches its server without it). Saving
  passwords and form data are off too, and so is what would send the decrypted notes, events and
  contacts to other sites: in Chromium translating, and the spell checking of Google's service (the
  browser's own spell checking still works); in Firefox its chatbot. Firefox translates on the
  computer, so only its offer to translate is off, and translating still works from its menu. Firefox
  also gets no welcome pages, telemetry, daily usage ping or studies, and doesn't restore the old
  tabs after it was ended abnormally (the app keeps its own data).
- **Clearing your browser's data doesn't log you out**, nor remove changes that aren't synced yet.
- The flags of `LOW_MEMORY` work in Chromium: the window runs in a browser of its own. (In the shared
  profile, a browser that runs already opens the window, without them.)
- **Your usual browser isn't disturbed**: opening the app again while its window's browser runs
  opens a window there (Firefox too: it's told apart by the profile), not in your usual one.
- **Links open in your default browser**, where you're logged in to their sites: the app hands
  links to other sites (and email and phone links) to the server, which opens them with `xdg-open`.
  It only takes them from the app (like the other requests, see below), and only web, email and phone
  links. Opening a link from the right-click menu still opens it in the window's profile.

It doesn't protect the login from programs that run as you: the profile is a directory in your
home, like your browser's. Firefox has no app window, so it's a usual window, with tabs and an
address bar.

Changing between `own` and `shared` means logging in again: the login and the synced data are in
the profile. When an update switches an install to `own`, the old ones stay in your browser's usual
profile: if the app was offline before the update, open `http://localhost:8092` in that browser to
sync what was changed, then log out there to remove them.

## Good to know

- The login is kept in the browser's storage for `http://localhost:8092` (in the window's own
  profile, with `PROFILE=own`). Anyone who can use that browser profile can use the account, so only
  use it on your own computer.
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
~/.local/share/etesync-desktop/install.sh --uninstall
```

It removes the service, the server, the app, the window's own profile (with the login and the synced
data) and the shortcuts. Changes that aren't synced yet are lost with the profile, so sync first; it
asks before removing it (`FORCE=1` doesn't). A browser the app was opened in with `PROFILE=shared` (or by its address)
keeps the login and the synced data for the app's address until you clear that site's data (or log
out in the app first).
