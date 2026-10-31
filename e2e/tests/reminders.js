// Reminders of events and tasks: added in the editors, they're VALARMs on the server as Android's
// calendar reads them; one made by another app (e.g. EteSync on Android) is shown and kept with what
// it has when the event is changed; and the app hands the notifications that are due soon to its
// local server (e2e/serve.js, like desktop/serve.py, which shows them), without those of a hidden
// calendar. It uses an account of its own (made for each run).
const { launch, session, run, check, config, Etebase, unique, newAccount, collectionOf, waitFor } = require("../lib");

const types = { calendar: "etebase.vevent", tasks: "etebase.vtodo" };
const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ukDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

// The contents of the (not deleted) items of a collection on the server, unfolded
async function contents(etebase, col) {
  const items = await etebase.getCollectionManager().getItemManager(col).list({ limit: 100 });
  return Promise.all(items.data.filter((x) => !x.isDeleted).map(async (x) => (await x.getContent(Etebase.OutputFormat.String)).replace(/\r\n[ \t]/g, "")));
}

// The VALARMs of the item that has a text, on the server
async function alarmsOf(etebase, col, text) {
  const item = (await contents(etebase, col)).find((x) => x.includes(text));
  return (item) ? (item.match(/BEGIN:VALARM[\s\S]*?END:VALARM/g) ?? []) : undefined;
}

// The notifications the app handed to the local server last
async function handed() {
  const response = await fetch(`${config.appUrl}/reminders`);
  return (await response.json()).reminders ?? [];
}

run(async () => {
  const n = unique();
  const account = await newAccount("desktop-remind");
  const { etebase } = account;
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, vis, btn, wait } = A;
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const side = (label) => sidebar.getByRole("button", { name: label, exact: true });
  await A.login(account);
  await btn(/^finish$/i).click(); await wait(6000);
  const calendar = await collectionOf(etebase, types.calendar);
  const tasks = await collectionOf(etebase, types.tasks);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const at = (hour, minute = 0) => new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hour, minute).getTime();

  // An event with two reminders
  await side("Calendar").click(); await wait(2500);
  await btn(/^new event$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Dentist ${n}`);
  await vis('input[aria-label="Start date"]').fill(ukDate(tomorrow)); await wait(200);
  await vis('input[aria-label="End date"]').fill(ukDate(tomorrow)); await wait(200);
  await vis('input[aria-label="Start time"]').fill("14:00");
  await vis('input[aria-label="End time"]').fill("15:00");
  await vis('input[aria-label="Location"]').fill("Main street 1");
  await btn(/^add a reminder$/i).click(); await wait(300);
  await btn(/^remind 15 minutes before$/i).click(); await wait(200);
  await btn(/^remind 2 hours before$/i).click(); await wait(200);
  check("the reminders are in the editor", (await btn(/^remove reminder 15 minutes before$/i).count() === 1) && (await btn(/^remove reminder 2 hours before$/i).count() === 1));
  await btn(/^save$/i).click(); await wait(3000);
  let alarms;
  check("they're VALARMs of the event on the server, relative to its start", await waitFor(async () => {
    alarms = await alarmsOf(etebase, calendar, `SUMMARY:Dentist ${n}`);
    return (alarms?.length === 2) && alarms.every((x) => x.includes("ACTION:DISPLAY") && x.includes(`DESCRIPTION:Dentist ${n}`)) &&
      alarms.some((x) => x.includes("TRIGGER:-PT2H")) && alarms.some((x) => x.includes("TRIGGER:-PT15M"));
  }), alarms);
  let notices;
  check("and the app hands their notifications to the local server, at their times, with when and where", await waitFor(async () => {
    notices = (await handed()).filter((x) => x.title === `Dentist ${n}`);
    return (notices.length === 2) && (notices[0].at === at(12)) && (notices[1].at === at(13, 45)) &&
      notices[0].body.includes("14:00–15:00") && notices[0].body.includes("Main street 1");
  }), notices);

  // An event with a reminder of another app (as EteSync on Android writes them)
  const uid = `android-${n}`;
  const itemMgr = etebase.getCollectionManager().getItemManager(calendar);
  await itemMgr.batch([await itemMgr.create({ name: uid, mtime: Date.now() }, ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:+//IDN bitfire.at//ical4android", "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTART:${icalDate(tomorrow)}T100000`, `DTEND:${icalDate(tomorrow)}T110000`, `SUMMARY:Phone call ${n}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:Phone call ${n}`, "TRIGGER;RELATED=START:-PT30M", `X-WR-ALARMUID:alarm-${n}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"))]);
  await btn(/^sync$/i).click(); await wait(5000);
  await btn(/^week view$/i).click(); await wait(1500);
  if (tomorrow.getDay() === 1) {
    await btn(/^next week$/i).click(); await wait(1500);
  }
  await p.getByRole("button", { name: `Event Phone call ${n}`, exact: true }).locator("visible=true").first().click(); await wait(1000);
  const details = p.locator('[data-testid="event-details"] >> visible=true');
  check("the details of an event show its reminders", (await details.locator('[data-testid="event-reminders"]').innerText()).includes("30 minutes before"), await details.innerText());
  check("and its notification is handed over too", await waitFor(async () => (await handed()).some((x) => (x.title === `Phone call ${n}`) && (x.at === at(9, 30)))));
  await details.getByRole("button", { name: "Edit" }).click(); await wait(2000);
  check("the editor shows the reminder", await btn(/^remove reminder 30 minutes before$/i).count() === 1, await A.text());
  await vis('input[aria-label="Title"]').fill(`Phone call with Ada ${n}`);
  await btn(/^add a reminder$/i).click(); await wait(300);
  await btn(/^remind at the start$/i).click(); await wait(200);
  await btn(/^save$/i).click(); await wait(3000);
  check("changing the event keeps the reminder as the other app made it, and adds the new one", await waitFor(async () => {
    alarms = await alarmsOf(etebase, calendar, `SUMMARY:Phone call with Ada ${n}`);
    return (alarms?.length === 2) && alarms.some((x) => x.includes(`X-WR-ALARMUID:alarm-${n}`) && x.includes("TRIGGER;RELATED=START:-PT30M")) &&
      alarms.some((x) => x.includes("TRIGGER:PT0S"));
  }), alarms);

  // Removing one (in the same week)
  await p.getByRole("button", { name: `Event Dentist ${n}`, exact: true }).locator("visible=true").first().click(); await wait(1000);
  await details.getByRole("button", { name: "Edit" }).click(); await wait(2000);
  await btn(/^remove reminder 2 hours before$/i).click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("a reminder removed in the editor is gone from the server, and the other one is kept", await waitFor(async () => {
    alarms = await alarmsOf(etebase, calendar, `SUMMARY:Dentist ${n}`);
    return (alarms?.length === 1) && alarms[0].includes("TRIGGER:-PT15M");
  }), alarms);
  check("and from the notifications", await waitFor(async () => {
    notices = (await handed()).filter((x) => x.title === `Dentist ${n}`);
    return (notices.length === 1) && (notices[0].at === at(13, 45));
  }), notices);

  // A task, reminded on the day it's due
  await side("Tasks").click(); await wait(2500);
  await vis('input[aria-label="Add a task"]').fill(`Pay rent ${n}`);
  await vis('input[aria-label="Add a task"]').press("Enter"); await wait(2000);
  await p.getByRole("button", { name: `Task Pay rent ${n}` }).click(); await wait(1500);
  const taskDetails = p.locator('[data-testid="task-details"] >> visible=true');
  await taskDetails.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  await vis('input[aria-label="Due date"]').fill(isoDate(tomorrow));
  await btn(/^add a reminder$/i).click(); await wait(300);
  await btn(/^remind on the day at 09:00$/i).click(); await wait(200);
  await btn(/^save$/i).click(); await wait(3000);
  check("a task's reminder is a VALARM relative to its due date on the server", await waitFor(async () => {
    alarms = await alarmsOf(etebase, tasks, `SUMMARY:Pay rent ${n}`);
    return (alarms?.length === 1) && alarms[0].includes("TRIGGER;RELATED=END:PT9H") && alarms[0].includes("ACTION:DISPLAY");
  }), alarms);
  await p.getByRole("button", { name: `Task Pay rent ${n}` }).click(); await wait(1500);
  check("the task's details show it", (await taskDetails.innerText()).includes("On the day at 09:00"), await taskDetails.innerText());
  check("and its notification is handed over, at 09:00 on the day", await waitFor(async () => (await handed()).some((x) => (x.title === `Pay rent ${n}`) && (x.at === at(9)))));

  // A hidden calendar doesn't remind
  await side("Calendar").click(); await wait(2500);
  await sidebar.getByRole("checkbox", { name: "Show My Calendar" }).click(); await wait(2500);
  check("the events of a hidden calendar have no notifications, and the task still has", await waitFor(async () => {
    notices = await handed();
    return !notices.some((x) => x.title.includes(n) && (x.title !== `Pay rent ${n}`)) && notices.some((x) => x.title === `Pay rent ${n}`);
  }), notices);
  await sidebar.getByRole("checkbox", { name: "Show My Calendar" }).click(); await wait(1500);

  await b.close();
  await etebase.logout();
});
