// Deleting a calendar's old events from its ⋯ menu in the sidebar: the ones that happened once and
// ended more than a year ago are deleted on the server, after asking; repeating ones (even if they
// ended long ago) and newer ones stay. It uses an account of its own.
const { launch, session, run, check, unique, newAccount, waitFor, collectionOf, Etebase } = require("../lib");

const pad = (x) => String(x).padStart(2, "0");
const icalDay = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const daysAgo = (days) => new Date(Date.now() - days * 24 * 3600 * 1000);

// The titles of the (not deleted) events on the server
async function titles(etebase) {
  const col = await collectionOf(etebase, "etebase.vevent");
  const items = (await etebase.getCollectionManager().getItemManager(col).list({ limit: 200 })).data.filter((x) => !x.isDeleted);
  const contents = await Promise.all(items.map((x) => x.getContent(Etebase.OutputFormat.String)));
  return contents.map((c) => /SUMMARY:(.*)/.exec(c)?.[1].trim());
}

run(async () => {
  const n = unique();
  const { username, password, etebase } = await newAccount("aio-old");
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, wait } = A;
  await A.login({ username, password });
  await A.btn(/^finish$/i).click(); await wait(6000);

  const col = await collectionOf(etebase, "etebase.vevent");
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const events = [
    [`Old ${n}`, daysAgo(800), ""],
    [`Also old ${n}`, daysAgo(400), ""],
    [`Old weekly ${n}`, daysAgo(800), "RRULE:FREQ=WEEKLY;COUNT=3"],
    [`Recent ${n}`, daysAgo(30), ""],
  ];
  for (const [title, day, rule] of events) {
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:${title.replace(/ /g, "-")}`, "DTSTAMP:20261001T000000Z",
      `DTSTART:${icalDay(day)}T100000Z`, `DTEND:${icalDay(day)}T110000Z`, ...((rule) ? [rule] : []), `SUMMARY:${title}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
    await itemMgr.batch([await itemMgr.create({ name: title, mtime: Date.now() }, content)]);
  }
  await p.reload(); await wait(5000);
  await p.keyboard.press("Alt+1"); await wait(3000);

  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  await sidebar.getByRole("button", { name: "My Calendar options" }).click({ force: true }); await wait(600);
  await p.getByRole("menuitem", { name: "Delete old events…" }).click(); await wait(800);
  check("it asks first, saying how many and that repeating events are kept",
    await A.has("Delete the 2 events of My Calendar that ended more than a year ago?") && await A.has("repeating events are kept"), await A.text());
  check("nothing is deleted before that", (await titles(etebase)).length === 4);
  await p.getByRole("button", { name: "Delete", exact: true }).click(); await wait(2000);
  check("the old one-time events are deleted on the server, the others stay", await waitFor(async () => {
    const t = await titles(etebase);
    return !t.includes(`Old ${n}`) && !t.includes(`Also old ${n}`) && t.includes(`Old weekly ${n}`) && t.includes(`Recent ${n}`);
  }), await titles(etebase));
  check("and it says so", await A.has("2 old events of My Calendar deleted"), await A.text());

  // Again: nothing left to delete
  await sidebar.getByRole("button", { name: "My Calendar options" }).click({ force: true }); await wait(600);
  await p.getByRole("menuitem", { name: "Delete old events…" }).click(); await wait(800);
  check("then there's nothing old left", await A.has("My Calendar has no events that ended more than a year ago."), await A.text());
  await p.getByRole("button", { name: "OK", exact: true }).click(); await wait(500);
  check("and OK deletes nothing", (await titles(etebase)).length === 2);
  await b.close();
});
