// The time zones of events in any time zone of the browser, not only the ones of the old table of
// etesync-web: a device in Indiana (which Chromium calls America/Indianapolis, a name the table didn't
// have, so its events were saved without a time zone) saves its events in its time zone, with the
// VTIMEZONE other devices need, and a device in Berlin shows them at the right time. The times of an
// event in a time zone nobody knows are saved in the device's when they're changed, never without one.
// It uses an account of its own (made for each run).
const { launch, session, run, check, Etebase, unique, newAccount, waitFor, collectionOf } = require("../lib");

const calendarType = "etebase.vevent";

// The contents of the (not deleted) events, from the server
async function events(etebase) {
  const colMgr = etebase.getCollectionManager();
  const col = await collectionOf(etebase, calendarType);
  const ret = [];
  for (const item of (await colMgr.getItemManager(col).list({ limit: 200 })).data) {
    if (!item.isDeleted) {
      ret.push((await item.getContent(Etebase.OutputFormat.String)).replace(/\r\n[ \t]/g, ""));
    }
  }
  return ret;
}

let last;
const waitForEvent = (etebase, summary, fn) => waitFor(async () => {
  last = (await events(etebase)).find((c) => c.includes(`SUMMARY:${summary}\r\n`));
  return !!last && fn(last);
});

// The date and the time on the clock in a time zone, at a moment
function clock(zone, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}${p.month}${p.day}`, time: `${p.hour}:${p.minute}` };
}

// The moment of a time on the clock in a time zone, on a day (as 20261028), at an hour that isn't
// one of the clocks changing
function momentOf(zone, day, time) {
  const [h, m] = time.split(":").map(Number);
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)), h, m);
  const wall = clock(zone, new Date(guess));
  const [wh, wm] = wall.time.split(":").map(Number);
  const wallMs = Date.UTC(Number(wall.date.slice(0, 4)), Number(wall.date.slice(4, 6)) - 1, Number(wall.date.slice(6, 8)), wh, wm);
  return new Date(guess - (wallMs - guess));
}

run(async () => {
  const n = unique();
  const { username, password, etebase } = await newAccount("aio-tz");
  const b = await launch();

  // A device in Indiana
  const A = await session(b, "A", { width: 1440, height: 900 }, { timezoneId: "America/Indiana/Indianapolis" });
  const sideRow = (s, label) => s.p.locator('[data-testid="sidebar"] >> visible=true').getByRole("button", { name: label, exact: true });
  await A.login({ username, password });
  await A.btn(/^finish$/i).click(); await A.wait(6000);
  await sideRow(A, "Calendar").click(); await A.wait(3000);

  const title = `Indiana call ${n}`;
  await A.btn(/^new event$/i).click(); await A.wait(2000);
  await A.vis('input[aria-label="Title"]').fill(title);
  await A.vis('input[aria-label="Start time"]').fill("10:00");
  await A.vis('input[aria-label="End time"]').fill("11:00");
  const zoneName = await A.vis('input[aria-label="Time zone"]').inputValue();
  check("a new event is in the device's time zone, by the name the browser has", zoneName === "America/Indianapolis", zoneName);
  check("which the app knows", await A.p.locator('[data-testid="timezone-unknown"] >> visible=true').count() === 0);
  await A.btn(/^save$/i).click(); await A.wait(3000);

  // The day of the event, in Indiana
  const today = clock("America/Indianapolis", new Date()).date;
  check("it's on the server in that time zone, with a VTIMEZONE of its rules", await waitForEvent(etebase, title, (c) =>
    c.includes(`DTSTART;TZID=America/Indianapolis:${today}T100000`) && c.includes(`DTEND;TZID=America/Indianapolis:${today}T110000`) &&
    c.includes("BEGIN:VTIMEZONE\r\nTZID:America/Indianapolis\r\n") && c.includes("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU")), last);

  // A device in Berlin shows it at the same moment, on its own clock
  const B = await session(b, "B", { width: 1440, height: 900 }, { timezoneId: "Europe/Berlin" });
  await B.login({ username, password });
  await sideRow(B, "Calendar").click(); await B.wait(3000);
  // Its day in Berlin is Indiana's, which from midnight in Berlin to midnight in Indiana is Berlin's
  // yesterday (maybe in the month before), so the calendar's own day can't be the one to look at
  const at = momentOf("America/Indianapolis", today, "10:00");
  const day = clock("Europe/Berlin", at).date;
  if (day.slice(0, 6) !== clock("Europe/Berlin", new Date()).date.slice(0, 6)) {
    await B.btn(/^previous month$/i).click(); await B.wait(1000);
  }
  const dayName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)), 12)));
  await B.p.getByRole("button", { name: `${dayName}, ` }).locator("visible=true").first().click(); await B.wait(1000);
  await B.p.getByRole("button", { name: `Event ${title}` }).locator("visible=true").first().click(); await B.wait(2000);
  const berlin = clock("Europe/Berlin", at).time;
  check("opened in Berlin, it's still at 10:00 in Indiana's time zone", ((await B.vis('input[aria-label="Start time"]').inputValue()) === "10:00") &&
    ((await B.vis('input[aria-label="Time zone"]').inputValue()) === "America/Indianapolis"));
  const note = await B.p.locator('[data-testid="timezone-local"] >> visible=true').innerText().catch(() => "");
  check(`and says it starts at ${berlin} there`, note.includes(`Starts at ${berlin} where you are`), note);
  await B.btn(/^back$/i).click(); await B.wait(1500);

  // An event of another app, in a time zone nobody knows (and without a VTIMEZONE): it's shown on
  // the device's clock, a change that isn't to its times keeps them as they are, and new times are in
  // the device's time zone
  const col = await collectionOf(etebase, calendarType);
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const other = `Mars meeting ${n}`;
  const item = await itemMgr.create({ name: `mars-${n}`, mtime: Date.now() }, [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:mars-${n}`, "DTSTAMP:20261001T000000Z",
    `DTSTART;TZID=Mars/Olympus_Mons:${today}T130000`, `DTEND;TZID=Mars/Olympus_Mons:${today}T140000`, `SUMMARY:${other}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n"));
  await itemMgr.batch([item]);
  await A.sync();
  const open = async (summary) => {
    await A.p.getByRole("button", { name: `Event ${summary}` }).locator("visible=true").first().click(); await A.wait(2000);
  };
  await open(other);
  check("an event in a time zone nobody knows is shown in the device's", ((await A.vis('input[aria-label="Start time"]').inputValue()) === "13:00") &&
    ((await A.vis('input[aria-label="Time zone"]').inputValue()) === "America/Indianapolis"));
  await A.vis('input[aria-label="Title"]').fill(`${other} (renamed)`);
  await A.btn(/^save$/i).click(); await A.wait(3000);
  check("changing its title keeps its times as they are", await waitForEvent(etebase, `${other} (renamed)`, (c) =>
    c.includes(`DTSTART;TZID=Mars/Olympus_Mons:${today}T130000`)), last);
  await open(`${other} (renamed)`);
  await A.vis('input[aria-label="Start time"]').fill("12:00");
  await A.btn(/^save$/i).click(); await A.wait(3000);
  check("and new times are in the device's time zone, not floating", await waitForEvent(etebase, `${other} (renamed)`, (c) =>
    c.includes(`DTSTART;TZID=America/Indianapolis:${today}T120000`) && c.includes(`DTEND;TZID=America/Indianapolis:${today}T140000`) &&
    c.includes("BEGIN:VTIMEZONE\r\nTZID:America/Indianapolis\r\n")), last);
  await b.close();
});
