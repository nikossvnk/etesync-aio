# EteSync as a local web app

Runs the web version of EteSync on your own computer, at `http://localhost:8092`, with an
entry in the applications menu and a shortcut on the desktop.

Why locally instead of on a server: the app's code then comes from your own computer, built from
this repository (the one this directory is in), so the server only ever sees encrypted data, like with the Android app. A web
version served by the server could be changed to capture the password if the server was taken over.
It's only reachable from this computer.

## Installing (and updating)

Needs Python 3, systemd and Node.js 20 or newer (e.g. `sudo dnf install python3 nodejs` on Fedora,
or Node.js through nvm). With a clone of the repository, run the script, from any directory:

```
local-web/install.sh              # e.g. from the root of the repository
```

It builds the repository it's in (the directory above it, so it has to stay in `local-web/`), with a
note when it has uncommitted changes. To update later:

```
git pull
local-web/install.sh
```

The packages needed to build (`node_modules`, a few hundred MB) are reused when the repository has
them, e.g. because it's also used for development. When it doesn't, they are installed for the build
and removed again afterwards, so the next update installs them again.

Options (environment variables):

| Variable | Default | |
|---|---|---|
| `PORT` | `8092` | The port on localhost |
| `BROWSER` | the first one found of Chromium, Chrome, Brave, Edge, Firefox | The browser the shortcut opens. Chromium-based browsers open it in an app window, Firefox in a new window |
| `LOW_MEMORY` | `1` | Chromium-based browsers get flags that make them use a bit less memory (no spare page process, at most two, no background downloads, updates or sync); `0` leaves them out |

Then open "EteSync Desktop" from the applications menu or the desktop, and log in with the server URL
(under "Advanced settings"), e.g. `https://etebase.example.com`.

## What the script sets up

Everything is in your home directory, nothing needs root:

| What | Where |
|---|---|
| The web build | `~/.local/share/etesync-aio-web/site` |
| The server (`serve.py` from this directory), on 127.0.0.1 only | `~/.local/share/etesync-aio-web/serve.py` |
| The service, started when you log in | `~/.config/systemd/user/etesync-aio-web.service` |
| The menu entry and the desktop shortcut | `~/.local/share/applications/etesync-aio-web.desktop`, `~/Desktop/etesync-aio-web.desktop` |

To do the same by hand:

1. In the root of the repository: `npm ci` (if `node_modules` isn't there), then
2. `npx expo export --platform web --output-dir ~/.local/share/etesync-aio-web/site`
3. Copy `serve.py` to `~/.local/share/etesync-aio-web/`, and create
   `~/.config/systemd/user/etesync-aio-web.service`:

   ```
   [Unit]
   Description=EteSync Desktop, served on http://localhost:8092 (this computer only)

   [Service]
   ExecStart=/usr/bin/python3 %h/.local/share/etesync-aio-web/serve.py --port 8092 --dir %h/.local/share/etesync-aio-web/site
   Restart=on-failure

   [Install]
   WantedBy=default.target
   ```

   then `systemctl --user daemon-reload && systemctl --user enable --now etesync-aio-web`
4. Create `~/.local/share/applications/etesync-aio-web.desktop` (and a copy on the desktop, made
   executable):

   ```
   [Desktop Entry]
   Type=Application
   Name=EteSync Desktop
   Exec=chromium --app=http://localhost:8092
   Icon=/home/<you>/.local/share/etesync-aio-web/icon.png
   Categories=Office;
   ```

   (with Firefox: `Exec=firefox --new-window http://localhost:8092`, the icon is `assets/icon.png` of the repository)

## Good to know

- The login is kept in the browser's storage for `http://localhost:8092`. Anyone who can use your
  browser profile can use the account, so only use it on your own computer.
- "Get title" of a bookmark makes the service fetch the page of its link, from this computer, to
  read its title (the browser doesn't let the app do it). Only the title goes to the app. Nothing
  is fetched without that button.
- Notes, events, tasks and contacts you have opened stay available offline, but the browser needs the service running to load
  the app.
- Changing `PORT` later means a new origin for the browser, so you have to log in again.

## Removing it

```
systemctl --user disable --now etesync-aio-web
rm -rf ~/.local/share/etesync-aio-web ~/.config/systemd/user/etesync-aio-web.service \
       ~/.local/share/applications/etesync-aio-web.desktop ~/Desktop/etesync-aio-web.desktop
systemctl --user daemon-reload
```
