// Items the app can't read (e.g. written by another app in a way it doesn't know, or by someone a
// calendar is shared with) are left out: the app keeps working, says that something is left out,
// and doesn't show or log what's in them (the parser's errors quote it).
// It uses an account of its own (made for each run).
const { launch, session, run, check, config, Etebase, unique } = require("../lib");

run(async () => {
  const n = unique();
  const username = `unreadable-${n}`;
  const password = "unreadable-tester-password";
  const secret = `UnreadableSecret${n}`;
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);
  const colMgr = etebase.getCollectionManager();
  const make = async (type, name) => {
    const col = await colMgr.create(type, { name, mtime: Date.now() }, "");
    await colMgr.upload(col);
    return col;
  };
  const add = async (col, content) => {
    const itemMgr = colMgr.getItemManager(col);
    await itemMgr.batch([await itemMgr.create({ name: String(Math.random()), mtime: Date.now() }, content)]);
  };
  await make("etebase.md.note", "My Notes");
  const calendar = await make("etebase.vevent", "My Calendar");
  const book = await make("etebase.vcard", "My Contacts");
  const pad = (x) => String(x).padStart(2, "0");
  const today = new Date();
  const day = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  await add(calendar, ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:good", `DTSTART:${day}T100000`, `DTEND:${day}T110000`,
    `SUMMARY:Readable ${n}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"));
  // (a quote that isn't closed, which the parser stops at and quotes in its error)
  await add(calendar, ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `SUMMARY;X="${secret}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"));
  await add(book, ["BEGIN:VCARD", "VERSION:4.0", `FN;X="${secret}`, "END:VCARD", ""].join("\r\n"));

  const b = await launch();
  const A = await session(b, "A", { width: 1400, height: 900 });
  const { p, wait } = A;
  await A.login({ username, password }, 9000);
  const side = (label) => p.locator('[data-testid="sidebar"] >> visible=true').getByRole("button", { name: label, exact: true });
  await side("Calendar").click(); await wait(3000);
  const body = async () => p.innerText("body");

  check("the app keeps working", !(await body()).includes("Something went wrong") && (await body()).includes(`Readable ${n}`), (await body()).slice(0, 400));
  check("and says that something is left out", (await body()).includes("couldn't be read"));
  await side("Contacts").click(); await wait(3000);
  check("the contacts work too", !(await body()).includes("Something went wrong") && (await body()).includes("Contacts"));
  check("what's in them isn't shown", !(await body()).includes(secret));
  const stored = await p.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join("\n"));
  check("or kept readable, e.g. in the logs", !stored.includes(secret));

  await b.close();
  await etebase.logout();
});
