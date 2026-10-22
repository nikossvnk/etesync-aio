// The notifications of the reminders, shown by the app's local server (desktop/serve.py): it takes
// them only from the app, shows each one when it's due with notify-send (here a stand-in that writes
// down what it was given), once, also after the server was started again, and keeps them only
// readable by the user.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const serve = path.join(__dirname, "..", "desktop", "serve.py");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-test-"));
  fs.mkdirSync(path.join(dir, "bin"));
  fs.mkdirSync(path.join(dir, "site"));
  fs.writeFileSync(path.join(dir, "site", "index.html"), "<!doctype html>");
  // (one line per notification, with its arguments as JSON)
  fs.writeFileSync(path.join(dir, "bin", "notify-send"), `#!/usr/bin/env python3\nimport json, sys\nopen(${JSON.stringify(path.join(dir, "shown"))}, "a").write(json.dumps(sys.argv[1:]) + "\\n")\n`, { mode: 0o755 });
  return dir;
}

async function start(dir, port) {
  const server = spawn("python3", [serve, "--port", String(port), "--dir", path.join(dir, "site"), "--reminders", path.join(dir, "reminders.json"), "--check-every", "0.2"],
    { env: { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH}` }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${port}/`);
      return server;
    } catch (e) {
      await sleep(100);
    }
  }
  throw new Error("serve.py didn't start");
}

const shown = (dir) => (fs.existsSync(path.join(dir, "shown"))) ? fs.readFileSync(path.join(dir, "shown"), "utf8").trim().split("\n").map((x) => JSON.parse(x)) : [];

// (with http, as fetch doesn't send another Host)
function post(port, body, headers = {}) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/reminders", method: "POST",
      headers: { Host: `localhost:${port}`, "Content-Type": "application/json", "X-EteSync-Request": "reminders", "Content-Length": Buffer.byteLength(data), ...headers } },
    (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("error", reject);
    req.end(data);
  });
}

test("the server shows the reminders the app hands it when they're due, once", async (t) => {
  const dir = setup();
  const port = 18000 + Math.floor(Math.random() * 1000);
  let server = await start(dir, port);
  t.after(() => {
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const soon = Date.now() + 600;
  const reminders = [
    { key: "cal/a/1", at: soon, title: "Dentist", body: "Friday 23 October, 09:00–10:00 · <b>Room</b> & 3" },
    { key: "cal/b/1", at: Date.now() + 3600 * 1000, title: "Later", body: "" },
    // (more than an hour late: missed, not shown anymore)
    { key: "cal/c/1", at: Date.now() - 2 * 3600 * 1000, title: "Long ago", body: "" },
  ];
  // Only from the app: with its header, for its own host name, and as JSON
  assert.equal((await post(port, { reminders }, { "X-EteSync-Request": "" })).status, 403);
  assert.equal((await post(port, { reminders }, { Host: "attacker.example.com" })).status, 403);
  assert.equal((await post(port, { reminders }, { "Content-Type": "text/plain" })).status, 403);
  await sleep(1200);
  assert.deepEqual(shown(dir), []);

  assert.equal((await post(port, { reminders })).status, 204);
  await sleep(1200);
  const icon = path.join(path.dirname(serve), "icon.png");
  assert.deepEqual(shown(dir), [["--app-name=EteSync Desktop", ...(fs.existsSync(icon) ? [`--icon=${icon}`] : []), "--", "Dentist",
    "Friday 23 October, 09:00–10:00 · &lt;b&gt;Room&lt;/b&gt; &amp; 3"]]);
  assert.equal(fs.statSync(path.join(dir, "reminders.json")).mode & 0o777, 0o600);

  // The app sends them again (e.g. after a sync), and the server is started again: not shown twice
  await post(port, { reminders });
  server.kill();
  await sleep(300);
  server = await start(dir, port);
  await sleep(800);
  assert.equal(shown(dir).length, 1);

  // Logging out empties them
  await post(port, { reminders: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "reminders.json"), "utf8")).reminders, []);
});
