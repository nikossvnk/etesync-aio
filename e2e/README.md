# Browser tests

These tests use the web build of EteSync Notes in a headless Chromium, against an Etebase test
server, the way a person would: logging in, writing notes offline, two devices changing the same
note, notebooks, navigation, and so on. Every check prints `ok` or `FAIL`, and a test fails when any
of its checks does.

They change the data of the test account, so never point them at a real server or account.

## Running them

1. An Etebase test server that allows signing up, e.g. the `test-server` image of the Etebase server
   (`docker/test-server` in its repository), on `http://127.0.0.1:3735`:

   ```
   docker run -d --name etebase-test -p 127.0.0.1:3735:3735 etesync/test-server
   ```

2. The web build of the app, served on `http://localhost:8765`:

   ```
   npx expo export --platform web --output-dir web-build    # in the root of the repository
   cd e2e
   npm install
   node serve.js &
   ```

3. A Chromium for Playwright: `npx playwright install chromium`, or set `E2E_CHROMIUM` to the path
   of a Chromium (or chrome-headless-shell) binary.

4. Create the test account (only needed once per server), then run the tests:

   ```
   node setup.js
   node run.js                    # all of them
   node run.js offline.js         # or some of them
   ```

A full run takes about 15 minutes, as the tests wait for syncs and reconnections. It starts by
emptying the test account (deleting all of its notebooks), as the notes that earlier runs left behind
fill the lists the tests look in; `E2E_KEEP_DATA=1` skips that. Running some of the tests keeps the data.

## Configuration

| Variable | Default | |
|---|---|---|
| `E2E_APP_URL` | `http://localhost:8765` | Where the web build is served |
| `E2E_SERVER` | `http://127.0.0.1:3735` | The Etebase test server |
| `E2E_USER`, `E2E_PASSWORD` | `e2e-tester`, `e2e-tester-password` | The test account, created by `setup.js` |
| `E2E_CHROMIUM` | Playwright's Chromium | The Chromium binary to use |

## Writing tests

The helpers are in `lib.js`. Tests create the notes they need with `api.addNote()` (directly on the
server), rather than relying on what's already in the account. To check what a note shows use
`noteText()` or `viewerText()`: they fail when a saved note doesn't open in the viewer or doesn't
show its text there, so that "opening a note shows it" is part of every test that reads a note.

Sessions are 900 pixels wide, which is the layout of phones and small tablets. For the layout of wide
screens (the sidebar, and the actions in the bars instead of menus), pass a size:
`session(browser, "A", { width: 1280, height: 800 })`, as `sidebar.js` and `wide-actions.js` do.
