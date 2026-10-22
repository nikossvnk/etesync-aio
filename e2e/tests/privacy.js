// What the server and the network see: everything the app sends and receives is recorded while a
// note, an event, a task and a contact are made, each with text no one else has. That text, and the
// password, must never be in what's sent or received (only encrypted data is), while the server does
// have the items (they're there when decrypted with the account's keys, like the app does). The app
// must talk to nothing but the server (and itself). It also shows what's kept in the browser's
// storage, which stays on the computer.
// It uses an account of its own (made for each run).
const { launch, session, run, check, config, Etebase, unique } = require("../lib");

run(async () => {
  const n = unique();
  const username = `privacy-${n}`;
  const password = `privacy-password-${n}`;
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);
  // Text that only exists in what is made in the app below
  const secret = {
    note: `NoteSecret${n}`,
    noteTitle: `NoteTitleSecret${n}`,
    event: `EventSecret${n}`,
    place: `PlaceSecret${n}`,
    task: `TaskSecret${n}`,
    contact: `ContactSecret${n}`,
    email: `mailsecret${n}@example.invalid`,
  };

  const b = await launch();
  const A = await session(b, "A", { width: 1400, height: 900 });
  const { p, vis, btn, wait } = A;
  const appOrigin = new URL(config.appUrl).origin;
  const serverOrigin = new URL(config.serverUrl).origin;

  // Everything the page sends and receives
  const exchanges = [];
  const otherHosts = new Set();
  p.on("request", (req) => {
    const origin = new URL(req.url()).origin;
    if (origin !== appOrigin && origin !== serverOrigin && !req.url().startsWith("data:") && !req.url().startsWith("blob:")) {
      otherHosts.add(origin);
    }
  });
  p.on("response", async (res) => {
    const req = res.request();
    if (new URL(req.url()).origin !== serverOrigin) {
      return;
    }
    let body = Buffer.alloc(0);
    try {
      body = await res.body();
    } catch (e) {
      // (some responses have none)
    }
    exchanges.push({
      url: req.url(),
      sent: Buffer.concat([Buffer.from(req.url()), Buffer.from(JSON.stringify(req.headers())), req.postDataBuffer() ?? Buffer.alloc(0)]),
      received: Buffer.concat([Buffer.from(JSON.stringify(res.headers())), body]),
    });
  });
  // CSP violations and other errors of the page
  const errors = [];
  p.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
    }
  });

  await A.login({ username, password });
  await btn(/^finish$/i).click(); await wait(6000);
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const side = (label) => sidebar.getByRole("button", { name: label, exact: true });

  // A note
  await p.locator('[data-testid="notes-column"] >> visible=true').getByRole("button", { name: "New note" }).click(); await wait(2500);
  await p.keyboard.type(secret.noteTitle); await p.keyboard.press("Enter");
  await p.keyboard.type(`The body: ${secret.note}`); await wait(2000);
  await A.sync();
  // An event
  await side("Calendar").click(); await wait(2500);
  await btn(/^new event$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(secret.event);
  await vis('input[aria-label="Location"]').fill(secret.place);
  await btn(/^save$/i).click(); await wait(3000);
  // A task
  await side("Tasks").click(); await wait(2500);
  await vis('input[aria-label="Add a task"]').fill(secret.task);
  await vis('input[aria-label="Add a task"]').press("Enter"); await wait(3000);
  // A contact
  await side("Contacts").click(); await wait(2500);
  await btn(/^new contact$/i).click(); await wait(2000);
  await vis('input[aria-label="Name"]').fill(secret.contact);
  await vis('input[aria-label="Email"]').fill(secret.email);
  await btn(/^save$/i).click(); await wait(3000);
  await btn(/^sync/i).first().click(); await wait(5000);
  // And everything again from the server, like another device would get it
  await p.reload(); await wait(8000);
  await side("Calendar").click(); await wait(3000);
  await btn(/^sync/i).first().click(); await wait(4000);

  // The server has all of it: decrypted with the account's keys (as the app does), it's there
  const colMgr = etebase.getCollectionManager();
  const decrypted = [];
  const cols = await colMgr.list(["etebase.md.note", "etebase.vevent", "etebase.vtodo", "etebase.vcard"], { limit: 50 });
  for (const col of cols.data) {
    decrypted.push(JSON.stringify(col.getMeta()));
    for (const item of (await colMgr.getItemManager(col).list({ limit: 100 })).data) {
      decrypted.push(JSON.stringify(item.getMeta()) + await item.getContent(Etebase.OutputFormat.String));
    }
  }
  const all = decrypted.join("\n");
  check("the server has the note, the event, the task and the contact (decrypted with the account's keys)",
    Object.values(secret).every((x) => all.includes(x)), Object.keys(secret).filter((k) => !all.includes(secret[k])));

  // ... but never got them, or the password, readable
  check("there was traffic with the server to check", exchanges.length > 20, exchanges.length);
  const findIn = (part) => {
    const found = [];
    for (const x of exchanges) {
      for (const [name, value] of [...Object.entries(secret), ["password", password]]) {
        const text = x[part];
        // (as text, and as base64, in case anything was only encoded)
        if (text.includes(Buffer.from(value)) || text.includes(Buffer.from(Buffer.from(value).toString("base64").slice(0, 12)))) {
          found.push(`${name} in ${x.url}`);
        }
      }
    }
    return found;
  };
  check("nothing of it, nor the password, was sent readable to the server", findIn("sent").length === 0, findIn("sent"));
  check("nothing of it came back readable from the server", findIn("received").length === 0, findIn("received"));
  // Not even which kinds of collections there are (Etebase sends their types as keyed hashes)
  const kinds = ["etebase.md.note", "etebase.vevent", "etebase.vtodo", "etebase.vcard"]
    .filter((type) => exchanges.some((x) => x.sent.includes(Buffer.from(type)) || x.received.includes(Buffer.from(type))));
  check("the kinds of collections (notes, calendars, ...) aren't sent readable either", kinds.length === 0, kinds);
  check("the app talked to nothing but itself and the server", otherHosts.size === 0, [...otherHosts]);
  check("the page had no errors (e.g. of its security policy)", errors.length === 0, errors.slice(0, 5));

  // What stays in the browser (on this computer): the contents are kept encrypted like on the server.
  // The titles of notes and the names of notebooks and calendars are kept readable for the lists.
  const stored = await p.evaluate(() => {
    const ret = [];
    for (let i = 0; i < localStorage.length; i++) {
      ret.push(localStorage.getItem(localStorage.key(i)));
    }
    return ret.join("\n");
  });
  const readable = Object.keys(secret).filter((k) => stored.includes(secret[k]));
  console.log(`info - kept readable in the browser's storage: ${readable.join(", ") || "nothing of it"}`);
  check("the contents of notes, events, tasks and contacts are not kept readable in the browser",
    !["note", "event", "place", "task", "contact", "email"].some((k) => readable.includes(k)), readable);

  // Logging out takes it all off the computer
  await sidebar.getByRole("button", { name: "Account menu" }).click(); await wait(800);
  await p.getByRole("menuitem", { name: "Logout" }).click(); await wait(1000);
  await p.getByRole("button", { name: /^(ok|logout)$/i }).locator("visible=true").last().click(); await wait(4000);
  const after = await p.evaluate(() => {
    const ret = [];
    for (let i = 0; i < localStorage.length; i++) {
      ret.push(localStorage.getItem(localStorage.key(i)));
    }
    return ret.join("\n");
  });
  check("after logging out, nothing of it is in the browser anymore", !Object.values(secret).some((x) => after.includes(x)) && !after.includes(username),
    Object.keys(secret).filter((k) => after.includes(secret[k])));

  await b.close();
  await etebase.logout();
});
