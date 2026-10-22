// Repeating events: the times of them that were changed or cancelled (by another app, or here) are
// shown as they are, and are kept when the event is changed; a time can be changed, moved or deleted
// on its own ("Only this time"), or all of them ("All times"). What's done is checked on the server,
// in the form other calendars read: RRULE, EXDATE, and more VEVENTs with a RECURRENCE-ID.
// It uses an account of its own (made for each run), in the time zone of Berlin (the event's).
const { launch, session, run, check, config, Etebase, unique } = require("../lib");

const types = { notes: "etebase.md.note", calendar: "etebase.vevent", tasks: "etebase.vtodo", contacts: "etebase.vcard" };

// The contents of the (not deleted) items of the calendars, from the server
async function events(etebase) {
  const colMgr = etebase.getCollectionManager();
  const ret = [];
  for (const col of (await colMgr.list([types.calendar], { limit: 50 })).data) {
    if (col.isDeleted) {
      continue;
    }
    for (const item of (await colMgr.getItemManager(col).list({ limit: 200 })).data) {
      if (!item.isDeleted) {
        ret.push((await item.getContent(Etebase.OutputFormat.String)).replace(/\r\n[ \t]/g, ""));
      }
    }
  }
  return ret;
}

// The VEVENTs of the item of an event (by its UID), each as its lines, or undefined when there is none
async function components(etebase, uid) {
  const item = (await events(etebase)).find((c) => c.includes(`UID:${uid}`));
  return item && item.split("BEGIN:VEVENT").slice(1).map((x) => x.split("END:VEVENT")[0].split(/\r?\n/).filter((l) => l));
}

// Waits until the server has what's checked (the app uploads in the background)
let last;
async function waitForEvent(etebase, uid, fn) {
  for (let i = 0; i < 20; i++) {
    last = await components(etebase, uid);
    if (fn(last)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
const detail = () => JSON.stringify(last, null, 1);

const main = (comps) => (comps ?? []).filter((x) => !x.some((l) => l.startsWith("RECURRENCE-ID")));
const changed = (comps) => (comps ?? []).filter((x) => x.some((l) => l.startsWith("RECURRENCE-ID")));
const line = (comp, name) => comp?.find((l) => l.startsWith(name + ":") || l.startsWith(name + ";"));
const at = (comps, rid) => changed(comps).find((x) => line(x, "RECURRENCE-ID") === `RECURRENCE-ID;TZID=Europe/Berlin:${rid}`);
const exdates = (comp) => (comp ?? []).filter((l) => l.startsWith("EXDATE")).flatMap((l) => l.split(":")[1].split(","));

async function addItem(etebase, col, content) {
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const item = await itemMgr.create({ name: String(Math.random()), mtime: Date.now() }, content);
  await itemMgr.batch([item]);
}

const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

run(async () => {
  const n = unique();
  const username = `aio-rec-${n}`;
  const password = "aio-tester-password";
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);

  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 }, { timezoneId: "Europe/Berlin" });
  const { p, vis, btn, wait } = A;
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const sideRow = (label) => sidebar.getByRole("button", { name: label, exact: true });
  const grid = p.locator('[data-testid="time-grid"] >> visible=true');
  const block = (title) => grid.getByRole("button", { name: `Event ${title}`, exact: true });
  const choice = p.locator('[data-testid="repeat-choice"] >> visible=true');

  await p.goto(config.appUrl + "/"); await wait(4000);
  await vis('[aria-label="Change the server"]').click(); await wait(500);
  await vis('input[aria-label="Username"]').fill(username);
  await vis('input[aria-label="Password"]').fill(password);
  await vis('input[aria-label="Server URL"]').fill(config.serverUrl);
  await btn(/^log in$/i).click(); await wait(8000);
  await btn(/^finish$/i).click(); await wait(6000);

  // A standup every day for ten days at 9:00 in Berlin, made by another app: the time of the second
  // day was moved to 14:00 (and given another title), and the one of the third was cancelled. The
  // changed time comes first in the item, which iCalendar allows.
  let calendar;
  for (let i = 0; (i < 20) && !calendar; i++) {
    calendar = (await etebase.getCollectionManager().list([types.calendar], { limit: 50 })).data.find((x) => !x.isDeleted);
    if (!calendar) {
      await wait(1000);
    }
  }
  const day = (k) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  };
  const t = (k, time) => `${icalDate(day(k))}T${time}`;
  const uid = `standup-${n}`;
  const title = `Standup ${n}`;
  await addItem(etebase, calendar, [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e//other app",
    "BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20261001T000000Z", `RECURRENCE-ID;TZID=Europe/Berlin:${t(1, "090000")}`,
    `DTSTART;TZID=Europe/Berlin:${t(1, "140000")}`, `DTEND;TZID=Europe/Berlin:${t(1, "143000")}`, `SUMMARY:Standup (moved) ${n}`, "END:VEVENT",
    "BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20261001T000000Z",
    `DTSTART;TZID=Europe/Berlin:${t(0, "090000")}`, `DTEND;TZID=Europe/Berlin:${t(0, "093000")}`, `SUMMARY:${title}`,
    "RRULE:FREQ=DAILY;COUNT=10", `EXDATE;TZID=Europe/Berlin:${t(2, "090000")}`, "END:VEVENT",
    "END:VCALENDAR", "",
  ].join("\r\n"));

  // The day view, a number of days after today
  await sideRow("Calendar").click(); await wait(3000);
  await btn(/^sync$/i).click(); await wait(5000);
  await btn(/^day view$/i).click(); await wait(1500);
  const goto = async (k) => {
    await btn(/^today$/i).click(); await wait(500);
    for (let i = 0; i < k; i++) {
      await btn(/^next day$/i).click(); await wait(400);
    }
    await wait(600);
  };
  const shows = async (k, name, time) => {
    await goto(k);
    const x = block(name);
    return (await x.count() === 1) && (!time || (await x.innerText()).includes(time));
  };

  check("the event is shown at its time", await shows(0, title, "09:00"), await grid.innerText());
  check("a time that was changed is shown at its new time, with its own title", await shows(1, `Standup (moved) ${n}`, "14:00") &&
    (await block(title).count() === 0), await grid.innerText());
  check("a time that was cancelled isn't shown", (await shows(2, title)) === false, await grid.innerText());
  check("and the ones after it are", await shows(3, title, "09:00"));

  // All times: the event moves to 10:00, and its cancelled and changed times move with it
  await goto(0);
  await block(title).click(); await wait(2000);
  check("opening a time of a repeating event says that it's one of its times",
    (await vis('[data-testid="repeat-note"]').innerText()).includes("This is the time on"), await vis('[data-testid="repeat-note"]').innerText());
  await vis('input[aria-label="Start time"]').fill("10:00");
  await vis('input[aria-label="End time"]').fill("10:30");
  await btn(/^save$/i).click(); await wait(1000);
  check("saving it asks whether it's for only this time or all of them", (await choice.count() === 1) &&
    (await choice.getByRole("button", { name: "All times", exact: true }).count() === 1) &&
    (await choice.getByRole("button", { name: "Only this time", exact: true }).count() === 1));
  await choice.getByRole("button", { name: "All times", exact: true }).click(); await wait(3000);
  check("all times: the event starts at 10:00, with its rule, as one item with one event", await waitForEvent(etebase, uid, (c) =>
    (main(c).length === 1) && (line(main(c)[0], "DTSTART") === `DTSTART;TZID=Europe/Berlin:${t(0, "100000")}`) &&
    (line(main(c)[0], "RRULE") === "RRULE:FREQ=DAILY;COUNT=10") && (line(main(c)[0], "SUMMARY") === `SUMMARY:${title}`)), detail());
  check("the cancelled time moved with it", exdates(main(last)[0]).join() === t(2, "100000"), detail());
  check("so did the changed one, which keeps its own time and title", (changed(last).length === 1) && !!at(last, t(1, "100000")) &&
    (line(at(last, t(1, "100000")), "DTSTART") === `DTSTART;TZID=Europe/Berlin:${t(1, "140000")}`) &&
    (line(at(last, t(1, "100000")), "SUMMARY") === `SUMMARY:Standup (moved) ${n}`), detail());
  check("and the change counts as one (SEQUENCE)", line(main(last)[0], "SEQUENCE") === "SEQUENCE:1", detail());
  check("the calendar shows it at 10:00, and still not on the cancelled day", await shows(0, title, "10:00") &&
    ((await shows(2, title)) === false) && await shows(1, `Standup (moved) ${n}`, "14:00"), await grid.innerText());

  // Only this time: the fourth day gets a title of its own
  await goto(3);
  await block(title).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Standup (special) ${n}`);
  await btn(/^save$/i).click(); await wait(1000);
  await choice.getByRole("button", { name: "Only this time", exact: true }).click(); await wait(3000);
  check("only this time: that time is changed, as a VEVENT with its RECURRENCE-ID", await waitForEvent(etebase, uid, (c) =>
    (line(at(c, t(3, "100000")), "SUMMARY") === `SUMMARY:Standup (special) ${n}`) &&
    (line(at(c, t(3, "100000")), "DTSTART") === `DTSTART;TZID=Europe/Berlin:${t(3, "100000")}`) &&
    !line(at(c, t(3, "100000")), "RRULE")), detail());
  check("and not the event", (main(last).length === 1) && (line(main(last)[0], "SUMMARY") === `SUMMARY:${title}`), detail());
  check("the calendar shows it on that day only", await shows(3, `Standup (special) ${n}`, "10:00") && await shows(4, title, "10:00"), await grid.innerText());

  // Dragging a time an hour later, only that time
  const drag = async (locator, dy) => {
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 10);
    await p.mouse.move(x, y); await p.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await p.mouse.move(x, y + dy * i / 6); await wait(50);
    }
    await p.mouse.up(); await wait(1000);
  };
  await goto(4);
  await drag(block(title), 48);
  check("dragging a time of a repeating event asks which times move", await choice.count() === 1);
  await choice.getByRole("button", { name: "Only this time", exact: true }).click(); await wait(3000);
  check("only that time moves to 11:00", await waitForEvent(etebase, uid, (c) =>
    (line(at(c, t(4, "100000")), "DTSTART") === `DTSTART;TZID=Europe/Berlin:${t(4, "110000")}`) &&
    (line(at(c, t(4, "100000")), "DTEND") === `DTEND;TZID=Europe/Berlin:${t(4, "113000")}`) &&
    (line(main(c)[0], "DTSTART") === `DTSTART;TZID=Europe/Berlin:${t(0, "100000")}`)), detail());
  check("and is shown there", await shows(4, title, "11:00") && await shows(5, title, "10:00"), await grid.innerText());

  // A new title for all times: the times that had the event's title get it too, the others keep theirs
  await goto(0);
  await block(title).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Daily ${n}`);
  await btn(/^save$/i).click(); await wait(1000);
  await choice.getByRole("button", { name: "All times", exact: true }).click(); await wait(3000);
  check("a new title for all times is the event's", await waitForEvent(etebase, uid, (c) =>
    line(main(c)[0], "SUMMARY") === `SUMMARY:Daily ${n}`), detail());
  check("and of the time that was only moved, which keeps its time", (line(at(last, t(4, "100000")), "SUMMARY") === `SUMMARY:Daily ${n}`) &&
    (line(at(last, t(4, "100000")), "DTSTART") === `DTSTART;TZID=Europe/Berlin:${t(4, "110000")}`), detail());
  check("the times with titles of their own keep them", (line(at(last, t(3, "100000")), "SUMMARY") === `SUMMARY:Standup (special) ${n}`) &&
    (line(at(last, t(1, "100000")), "SUMMARY") === `SUMMARY:Standup (moved) ${n}`), detail());

  // Deleting only this time cancels it (EXDATE); one that was changed is then gone too
  await goto(5);
  await block(`Daily ${n}`).click(); await wait(2000);
  await btn(/^delete$/i).click(); await wait(1000);
  check("deleting a time of a repeating event asks which times", await choice.count() === 1);
  await choice.getByRole("button", { name: "Only this time", exact: true }).click(); await wait(3000);
  check("only this time: it's cancelled, and the event is still there", await waitForEvent(etebase, uid, (c) =>
    (main(c).length === 1) && exdates(main(c)[0]).includes(t(5, "100000")) && exdates(main(c)[0]).includes(t(2, "100000"))), detail());
  check("the calendar doesn't show it anymore, and shows the next day", ((await shows(5, `Daily ${n}`)) === false) && await shows(6, `Daily ${n}`, "10:00"),
    await grid.innerText());
  await goto(3);
  await block(`Standup (special) ${n}`).click(); await wait(2000);
  await btn(/^delete$/i).click(); await wait(1000);
  await choice.getByRole("button", { name: "Only this time", exact: true }).click(); await wait(3000);
  check("deleting a changed time removes it, and cancels it", await waitForEvent(etebase, uid, (c) =>
    !at(c, t(3, "100000")) && exdates(main(c)[0]).includes(t(3, "100000")) && !!at(c, t(1, "100000"))), detail());

  // Repeating in another way: the times that were changed or cancelled belong to the old rule
  await goto(0);
  await block(`Daily ${n}`).click(); await wait(2000);
  await btn(/^repeat weekly$/i).click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("a change to how it repeats is for all times, without asking", await choice.count() === 0);
  check("and the changed and cancelled times are gone with the old rule", await waitForEvent(etebase, uid, (c) =>
    (c.length === 1) && (line(c[0], "RRULE") === "RRULE:FREQ=WEEKLY") && (exdates(c[0]).length === 0)), detail());

  // Deleting all times deletes the event
  await goto(0);
  await block(`Daily ${n}`).click(); await wait(2000);
  await btn(/^delete$/i).click(); await wait(1000);
  await choice.getByRole("button", { name: "All times", exact: true }).click(); await wait(3000);
  check("all times: the event is deleted", await waitForEvent(etebase, uid, (c) => !c), detail());

  await b.close();
});
