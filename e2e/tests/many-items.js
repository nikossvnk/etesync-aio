// Many items: importing 500 contacts at once (all of them reach the server, and it doesn't take long,
// as they're saved together), and an event that repeats every day since 2015, which the week shows on
// each of its days (but not on the one it was cancelled). It uses an account of its own (made for
// each run), whose screen after logging in has its title as a heading.
const { launch, session, run, check, Etebase, unique, newAccount, collectionOf, waitFor } = require("../lib");

const types = { calendar: "etebase.vevent", contacts: "etebase.vcard" };

// The names of the (not deleted) contacts of an address book on the server
async function contactNames(etebase, col) {
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const ret = [];
  let stoken;
  for (;;) {
    const page = await itemMgr.list({ stoken, limit: 100 });
    for (const item of page.data.filter((x) => !x.isDeleted)) {
      const m = /^FN:(.*)$/m.exec(await item.getContent(Etebase.OutputFormat.String));
      ret.push(m ? m[1].trim() : "");
    }
    stoken = page.stoken;
    if (page.done) {
      return ret;
    }
  }
}

const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

run(async () => {
  const n = unique();
  const account = await newAccount("aio-many");
  const { etebase } = account;

  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, wait } = A;
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const side = (label) => sidebar.getByRole("button", { name: label, exact: true });

  await A.login(account);
  check("the screen after logging in has its title as a heading", await p.getByRole("heading", { name: "Set Up Your Account" }).count() === 1, await A.text());
  await A.btn(/^finish$/i).click(); await wait(6000);

  // 500 contacts from one file
  const count = 500;
  const names = Array.from({ length: count }, (_x, i) => `Person ${i} ${n}`);
  const vcf = names.map((name, i) => ["BEGIN:VCARD", "VERSION:3.0", `UID:person-${n}-${i}`, `FN:${name}`, `N:${n};Person ${i};;;`,
    `EMAIL:person${i}@example.invalid`, "END:VCARD"].join("\r\n")).join("\r\n") + "\r\n";
  await side("Contacts").click(); await wait(2500);
  await sidebar.getByRole("button", { name: "My Contacts options" }).click({ force: true }); await wait(600);
  await p.getByRole("menuitem", { name: "Import into this address book…" }).click(); await wait(800);
  const dialog = p.locator('[data-testid="import-dialog"] >> visible=true');
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), dialog.getByRole("button", { name: "Choose files…" }).click()]);
  await chooser.setFiles([{ name: `people-${n}.vcf`, mimeType: "text/vcard", buffer: Buffer.from(vcf) }]); await wait(2000);
  check("the review counts the contacts", (await dialog.locator('[data-testid="import-found"]').innerText()).includes(`${count} contacts found`), await dialog.innerText());

  const started = Date.now();
  await dialog.getByRole("button", { name: `Import ${count} items` }).click();
  const done = dialog.locator('[data-testid="import-done"]');
  await done.waitFor({ timeout: 120000 });
  const took = Date.now() - started;
  check("the import says they were imported", (await done.innerText()).includes(`${count} items imported`), await dialog.innerText());
  console.log(`(importing ${count} contacts took ${took} ms)`);
  // (about 6 s when each contact was a change of the store of its own, now about 2 s; GitHub's
  // machines are slower, about 5 s now, so the limit there is higher)
  const limit = process.env.CI ? 10 : 4;
  check(`importing them took less than ${limit} seconds`, took < limit * 1000, `${took} ms`);

  const contacts = await collectionOf(etebase, types.contacts);
  let onServer = [];
  check("all of them are on the server, with their names", await waitFor(async () => {
    onServer = await contactNames(etebase, contacts);
    return (onServer.length === count) && names.every((x) => onServer.includes(x));
  }, 60), `${onServer.length} on the server`);
  await dialog.getByRole("button", { name: "Close" }).click(); await wait(500);
  await side("Contacts").click(); await wait(2000);
  check("and the contacts list them", await A.has(`Person 499 ${n}`) || await A.has(`Person 0 ${n}`), (await A.text()).slice(0, 400));

  // Every day since 2015, but not today (cancelled)
  const calendar = await collectionOf(etebase, types.calendar);
  const uid = `standup-${n}`;
  const today = new Date();
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:${uid}`,
    "DTSTART:20150105T090000", "DTEND:20150105T093000", `SUMMARY:Standup ${n}`, "RRULE:FREQ=DAILY",
    `EXDATE:${icalDate(today)}T090000`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  const itemMgr = etebase.getCollectionManager().getItemManager(calendar);
  await itemMgr.batch([await itemMgr.create({ name: uid, mtime: Date.now() }, ics)]);
  await side("Calendar").click(); await wait(2500);
  await A.btn(/^sync$/i).click(); await wait(5000);
  await A.btn(/^week view$/i).click(); await wait(2000);
  const grid = p.locator('[data-testid="time-grid"] >> visible=true');
  const times = grid.getByRole("button", { name: `Event Standup ${n}`, exact: true });
  check("the week shows the daily event on each day but the cancelled one", await times.count() === 6, `${await times.count()} times`);
  await A.btn(/^day view$/i).click(); await wait(1500);
  check("and today doesn't have it", await grid.getByRole("button", { name: `Event Standup ${n}`, exact: true }).count() === 0, await A.text());

  await b.close();
  await etebase.logout();
});
