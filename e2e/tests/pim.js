// The calendar, the tasks and the contacts next to the notes: a new account gets a notebook, a
// calendar, a task list and an address book from the wizard; what's on the server shows up in the
// app (repeating events on every week); and what's made or changed in the app gets to the server.
// It uses an account of its own (made for each run), so the notes of the other tests are not touched.
const { launch, session, run, check, config, Etebase, unique } = require("../lib");

const types = { notes: "etebase.md.note", calendar: "etebase.vevent", tasks: "etebase.vtodo", contacts: "etebase.vcard" };

// The collections of the account, and the (not deleted) names and contents of their items, from the server
async function serverState(etebase) {
  const colMgr = etebase.getCollectionManager();
  const ret = [];
  const cols = await colMgr.list(Object.values(types), { limit: 50 });
  for (const col of cols.data) {
    if (col.isDeleted) {
      continue;
    }
    const items = await colMgr.getItemManager(col).list({ limit: 200 });
    const contents = [];
    for (const item of items.data) {
      if (!item.isDeleted) {
        // (notes have their title as the name of the item)
        contents.push(`${item.getMeta().name}\n${await item.getContent(Etebase.OutputFormat.String)}`);
      }
    }
    ret.push({ col, type: col.getCollectionType(), name: col.getMeta().name, contents });
  }
  return ret;
}

// Waits until the server has what's checked (the app uploads in the background)
let lastState;
async function waitForServer(etebase, fn) {
  for (let i = 0; i < 20; i++) {
    lastState = await serverState(etebase);
    if (fn(lastState)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
// What the server has, for the details of a failed check
const serverDetail = (type) => () => lastState.filter((x) => x.type === type).flatMap((x) => x.contents).join("\n---\n");

async function addItem(etebase, col, content) {
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const item = await itemMgr.create({ name: String(Math.random()), mtime: Date.now() }, content);
  await itemMgr.batch([item]);
}

const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

run(async () => {
  const n = unique();
  const username = `aio-${n}`;
  const password = "aio-tester-password";
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);

  const b = await launch();
  const A = await session(b, "A", { width: 1400, height: 900 });
  const { p, vis, btn, wait } = A;
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const sideRow = (label) => sidebar.getByRole("button", { name: label, exact: true });

  // Logging in to a new account opens the wizard
  await p.goto(config.appUrl + "/"); await wait(4000);
  await vis('[aria-label="Change the server"]').click(); await wait(500);
  await vis('input[aria-label="Username"]').fill(username);
  await vis('input[aria-label="Password"]').fill(password);
  await vis('input[aria-label="Server URL"]').fill(config.serverUrl);
  await btn(/^log in$/i).click(); await wait(8000);
  check("the wizard offers the four collections", await A.has("My Notes, My Calendar, My Tasks, My Contacts"), await A.text());
  await btn(/^finish$/i).click(); await wait(6000);
  check("and creates them on the server", await waitForServer(etebase, (s) => (
    s.some((x) => (x.type === types.notes) && (x.name === "My Notes")) &&
    s.some((x) => (x.type === types.calendar) && (x.name === "My Calendar")) &&
    s.some((x) => (x.type === types.tasks) && (x.name === "My Tasks")) &&
    s.some((x) => (x.type === types.contacts) && (x.name === "My Contacts"))
  )));

  // Data made elsewhere (like by another app): a weekly event that started today, a task and a contact
  const server = await serverState(etebase);
  const byType = (type) => server.find((x) => x.type === type).col;
  const today = new Date();
  const bday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  await addItem(etebase, byType(types.calendar), [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:standup-${n}`,
    `DTSTART:${icalDate(today)}T100000`, `DTEND:${icalDate(today)}T103000`, `SUMMARY:Standup ${n}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${["SU", "MO", "TU", "WE", "TH", "FR", "SA"][today.getDay()]}`, "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n"));
  const tripEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  await addItem(etebase, byType(types.calendar), [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:trip-${n}`,
    `DTSTART;VALUE=DATE:${icalDate(today)}`, `DTEND;VALUE=DATE:${icalDate(tripEnd)}`, `SUMMARY:Trip ${n}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n"));
  await addItem(etebase, byType(types.tasks), [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VTODO", `UID:milk-${n}`,
    `SUMMARY:Buy milk ${n}`, "STATUS:NEEDS-ACTION", "END:VTODO", "END:VCALENDAR", "",
  ].join("\r\n"));
  await addItem(etebase, byType(types.contacts), [
    "BEGIN:VCARD", "VERSION:4.0", `UID:ada-${n}`, `FN:Ada Lovelace ${n}`, `N:Lovelace;Ada ${n};;;`,
    `EMAIL;TYPE=work:ada${n}@example.invalid`, `BDAY:1990${pad(bday.getMonth() + 1)}${pad(bday.getDate())}`, "END:VCARD", "",
  ].join("\r\n"));

  // The sidebar has the calendar, the tasks and the contacts, and only the notebook as a notebook
  check("the sidebar has Calendar, Tasks and Contacts", (await sideRow("Calendar").count() === 1) &&
    (await sideRow("Tasks").count() === 1) && (await sideRow("Contacts").count() === 1));
  check("the calendar is not listed as a notebook", (await sideRow("Notebook My Notes").count() === 1) &&
    (await sideRow("Notebook My Calendar").count() === 0));

  // The calendar
  await sideRow("Calendar").click(); await wait(3000);
  await btn(/^sync$/i).click(); await wait(5000);
  check("the calendar replaces the notes column", await p.locator('[data-testid="notes-column"] >> visible=true').count() === 0);
  check("the calendar is selected in the sidebar", (await sideRow("Calendar").getAttribute("aria-selected")) === "true");
  check("today's event from the server is shown", await A.has(`Standup ${n}`) && await A.has("10:00 – 10:30"), await A.text());
  // (a month shows at least four weeks from today, unless today is near its end; the next one is checked then)
  const titles = () => p.getByText(`Standup ${n}`, { exact: true }).locator("visible=true").count();
  let chips = await titles() - 1;
  if (chips < 4) {
    await btn(/^next month$/i).click(); await wait(1000);
    chips += await titles() - 1;
  }
  check("the weekly event is on every week", chips >= 4, chips);
  await btn(/^today$/i).click(); await wait(500);

  // The sidebar lists the calendars, which can be hidden, and the birthdays of the contacts
  check("the sidebar lists the calendars and the birthdays", (await sidebar.getByRole("checkbox", { name: "Show My Calendar" }).count() === 1) &&
    (await sidebar.getByRole("checkbox", { name: "Show Birthdays" }).count() === 1));
  await sidebar.getByRole("checkbox", { name: "Show My Calendar" }).click(); await wait(1500);
  check("hiding a calendar hides its events", !(await A.has(`Standup ${n}`)));
  await sidebar.getByRole("checkbox", { name: "Show My Calendar" }).click(); await wait(1500);
  check("and showing it shows them again", await A.has(`Standup ${n}`));

  await btn(/^new event$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Dentist ${n}`);
  await vis('input[aria-label="Start time"]').fill("14:00");
  await vis('input[aria-label="End time"]').fill("15:15");
  await vis('input[aria-label="Location"]').fill("Main street 1");
  await btn(/^save$/i).click(); await wait(3000);
  check("a new event is shown on its day", await A.has(`Dentist ${n}`) && await A.has("14:00 – 15:15"), await A.text());
  check("and is on the server", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) && x.contents.some((c) => (
    c.includes(`SUMMARY:Dentist ${n}`) && new RegExp(`DTSTART[^:]*:${icalDate(today)}T140000`).test(c) &&
    new RegExp(`DTEND[^:]*:${icalDate(today)}T151500`).test(c) && c.includes("LOCATION:Main street 1")
  )))));

  // Changing it
  await p.getByRole("button", { name: `Event Dentist ${n}` }).locator("visible=true").first().click(); await wait(2000);
  check("opening the event shows what it has", (await vis('input[aria-label="Title"]').inputValue()) === `Dentist ${n}` &&
    (await vis('input[aria-label="Start time"]').inputValue()) === "14:00");
  await vis('input[aria-label="Title"]').fill(`Dentist (moved) ${n}`);
  await btn(/^save$/i).click(); await wait(3000);
  check("the changed event is on the server, and not also the old one", await waitForServer(etebase, (s) => {
    const all = s.filter((x) => x.type === types.calendar).flatMap((x) => x.contents);
    return all.some((c) => c.includes(`SUMMARY:Dentist (moved) ${n}`)) && !all.some((c) => c.includes(`SUMMARY:Dentist ${n}`));
  }));

  // Events of several days are bars over their days
  const tripBars = p.getByRole("button", { name: new RegExp(`^Event Trip ${n}, 3 days$`) }).locator("visible=true");
  const barCount = await tripBars.count();
  const crosses = (today.getDay() === 0) || (today.getDay() === 6);
  check("an event of several days is a bar over them in the month", barCount === ((crosses) ? 2 : 1), barCount);
  if (!crosses) {
    check("which says how many days it is", (await tripBars.first().innerText()).includes("3 days"), await tripBars.first().innerText());
  }
  await tripBars.first().click(); await wait(800);
  const dayPanel = p.locator('[data-testid="day-panel"] >> visible=true');
  check("choosing it shows it on its first day, with which day of it that is", (await dayPanel.innerText()).includes(`Trip ${n}`) &&
    (await dayPanel.innerText()).includes("All day · day 1 of 3"), await dayPanel.innerText());

  // An event in another time zone
  await btn(/^new event$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Call New York ${n}`);
  await vis('input[aria-label="Start time"]').fill("10:00");
  await vis('input[aria-label="End time"]').fill("11:00");
  await vis('input[aria-label="Time zone"]').click(); await wait(300);
  await vis('input[aria-label="Time zone"]').fill("new york"); await wait(500);
  await btn(/^time zone america\/new york$/i).click(); await wait(500);
  check("choosing another time zone says when it starts here", await A.has("where you are"), await A.text());
  await btn(/^save$/i).click(); await wait(3000);
  check("the event is on the server in that time zone", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) &&
    x.contents.some((c) => c.includes(`SUMMARY:Call New York ${n}`) && c.includes(`DTSTART;TZID=America/New_York:${icalDate(today)}T100000`) &&
      c.includes("BEGIN:VTIMEZONE") && c.includes("TZID:America/New_York")))), serverDetail(types.calendar)());
  await p.getByRole("button", { name: `Event Call New York ${n}` }).locator("visible=true").first().click(); await wait(2000);
  check("opened again, it's in its time zone", ((await vis('input[aria-label="Start time"]').inputValue()) === "10:00") &&
    ((await vis('input[aria-label="Time zone"]').inputValue()) === "America/New York"));
  await btn(/^back$/i).click(); await wait(1500);

  // An event that repeats every week
  await btn(/^new event$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Yoga ${n}`);
  await vis('input[aria-label="Start time"]').fill("18:00");
  await vis('input[aria-label="End time"]').fill("19:00");
  await btn(/^repeat weekly$/i).click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("an event can be made to repeat weekly", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) &&
    x.contents.some((c) => c.includes(`SUMMARY:Yoga ${n}`) && c.includes("RRULE:FREQ=WEEKLY")))), serverDetail(types.calendar)());
  // The standup repeats with a rule the editor can't make, which is kept when it's changed
  await p.getByRole("button", { name: `Event Standup ${n}` }).locator("visible=true").first().click(); await wait(2000);
  check("a rule the editor can't make shows as custom", (await btn(/^repeat custom$/i).getAttribute("aria-selected")) === "true");
  await btn(/^save$/i).click(); await wait(2500);
  check("and is kept when the event is saved", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) &&
    x.contents.some((c) => c.includes(`SUMMARY:Standup ${n}`) && c.includes("RRULE:FREQ=WEEKLY;BYDAY=")))), serverDetail(types.calendar)());

  // The week and the day views
  const grid = p.locator('[data-testid="time-grid"] >> visible=true');
  await btn(/^week view$/i).click(); await wait(1500);
  check("the week view shows the hours of seven days", (await grid.count() === 1) &&
    (await grid.getByRole("button", { name: /^New event .* 15:00$/ }).count() === 7));
  const standup = grid.getByRole("button", { name: `Event Standup ${n}` });
  check("with the event of today in its hours", (await standup.count() === 1) && (await standup.innerText()).includes(`10:00 Standup ${n}`),
    await grid.innerText());
  // Where it is: from 10:00 to 10:30, so half an hour (of 48 pixels) high, below the 10:00 line
  const slot10 = await grid.getByRole("button", { name: /^New event .* 10:00$/ }).first().boundingBox();
  const box = await standup.boundingBox();
  check("at its time, as long as it is", Math.abs(box.y - slot10.y) < 4 && Math.abs(box.height - 22) < 4, { box, slot10 });
  check("and a line at the current time", await grid.locator('[data-testid="now-line"]').count() === 1);

  // Choosing an empty hour makes an event then
  await grid.getByRole("button", { name: /^New event .* 15:00$/ }).nth((today.getDay() + 6) % 7).click(); await wait(2000);
  check("an event made from an hour starts then", (await vis('input[aria-label="Start time"]').inputValue()) === "15:00" &&
    (await vis('input[aria-label="End time"]').inputValue()) === "16:00" &&
    (await vis('input[aria-label="Start date"]').inputValue()) === isoDate(today));
  await vis('input[aria-label="Title"]').fill(`Week event ${n}`);
  await btn(/^save$/i).click(); await wait(3000);
  check("it's shown in the week", await grid.getByRole("button", { name: `Event Week event ${n}` }).count() === 1);
  check("and is on the server", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) && x.contents.some((c) => (
    c.includes(`SUMMARY:Week event ${n}`) && new RegExp(`DTSTART[^:]*:${icalDate(today)}T150000`).test(c)
  )))));

  // Dragging an event an hour down moves it an hour later, dragging its lower edge changes its end
  const drag = async (locator, dy) => {
    const b = await locator.boundingBox();
    const x = b.x + b.width / 2, y = b.y + Math.min(b.height / 2, 10);
    await p.mouse.move(x, y); await p.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await p.mouse.move(x, y + dy * i / 6); await wait(50);
    }
    await p.mouse.up(); await wait(3000);
  };
  const weekEvent = () => grid.getByRole("button", { name: `Event Week event ${n}` });
  await drag(weekEvent(), 48);
  check("dragging an event moves it to another time, on the server", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) && x.contents.some((c) => (
    c.includes(`SUMMARY:Week event ${n}`) && new RegExp(`DTSTART[^:]*:${icalDate(today)}T160000`).test(c) && new RegExp(`DTEND[^:]*:${icalDate(today)}T170000`).test(c)
  )))), serverDetail(types.calendar)());
  const end = weekEvent().locator('[data-testid="time-grid-resize"]');
  const endBox = await end.boundingBox();
  await p.mouse.move(endBox.x + endBox.width / 2, endBox.y + 3); await p.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await p.mouse.move(endBox.x + endBox.width / 2, endBox.y + 3 + 24 * i / 6); await wait(50);
  }
  await p.mouse.up(); await wait(3000);
  check("dragging its lower edge changes when it ends", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) && x.contents.some((c) => (
    c.includes(`SUMMARY:Week event ${n}`) && new RegExp(`DTSTART[^:]*:${icalDate(today)}T160000`).test(c) && new RegExp(`DTEND[^:]*:${icalDate(today)}T173000`).test(c)
  )))), serverDetail(types.calendar)());

  // The all day row has the trip as a bar, and its details have its days
  const weekTrip = grid.getByRole("button", { name: new RegExp(`^Event Trip ${n}, 3 days$`) });
  check("the week's all day row has the event of several days as a bar", (await weekTrip.count()) >= 1, await weekTrip.count());
  await weekTrip.first().click(); await wait(800);
  const tripDetails = p.locator('[data-testid="event-details"] >> visible=true');
  check("its details have its days", (await tripDetails.count() === 1) && (await tripDetails.innerText()).includes("All day · 3 days") &&
    / – /.test(await tripDetails.innerText()), (await tripDetails.count()) ? await tripDetails.innerText() : "no details");

  // Choosing an event in the week shows its details next to it
  await standup.click(); await wait(800);
  const panel = p.locator('[data-testid="event-details"] >> visible=true');
  check("choosing an event in the week shows its details", (await panel.count() === 1) && (await panel.innerText()).includes(`Standup ${n}`) &&
    (await panel.innerText()).includes("Repeats"), (await panel.count()) ? await panel.innerText() : "no panel");

  await btn(/^day view$/i).click(); await wait(1500);
  check("the day view shows one day, with today's events", (await grid.getByRole("button", { name: /^New event .* 15:00$/ }).count() === 1) &&
    (await grid.getByRole("button", { name: `Event Week event ${n}` }).count() === 1) &&
    (await grid.getByRole("button", { name: `Event Standup ${n}` }).count() === 1));
  await btn(/^next day$/i).click(); await wait(1000);
  await btn(/^next day$/i).click(); await wait(1000);
  await btn(/^next day$/i).click(); await wait(1000);
  await btn(/^next day$/i).click(); await wait(1000);
  await btn(/^next day$/i).click(); await wait(1000);
  await btn(/^next day$/i).click(); await wait(1000);
  await btn(/^next day$/i).click(); await wait(1000);
  check("a week later the weekly event is there again, and not the other one",
    (await grid.getByRole("button", { name: `Event Standup ${n}` }).count() === 1) &&
    (await grid.getByRole("button", { name: `Event Week event ${n}` }).count() === 0));
  await btn(/^today$/i).click(); await wait(500);

  await btn(/^agenda view$/i).click(); await wait(1500);
  const agenda = async () => p.locator('[data-testid="agenda"] >> visible=true').innerText();
  check("the agenda lists the coming events and birthdays, without the repeating ones", (await agenda()).includes(`Dentist (moved) ${n}`) &&
    (await agenda()).includes(`Ada Lovelace ${n}’s birthday`) && !(await agenda()).includes(`Standup ${n}`), await agenda());
  await p.getByRole("checkbox", { name: "Show repeating events" }).click(); await wait(1000);
  check("which it shows when asked to", (await agenda()).includes(`Standup ${n}`));
  await p.getByRole("checkbox", { name: "Show repeating events" }).click(); await wait(500);
  await btn(/^month view$/i).click(); await wait(1500);

  // Loaded from its address, the calendar is open on its own too (without the notes column)
  await p.goto(config.appUrl + "/calendar"); await wait(6000);
  check("the calendar's address opens it without the notes column", (await p.locator('[data-testid="notes-column"] >> visible=true').count() === 0) &&
    ((await sideRow("Calendar").getAttribute("aria-selected")) === "true") && await A.has(`Standup ${n}`));

  // The tasks
  await sideRow("Tasks").click(); await wait(3000);
  check("the task from the server is listed", await A.has(`Buy milk ${n}`), await A.text());
  await vis('input[aria-label="Add a task"]').fill(`Call mom ${n}`);
  await vis('input[aria-label="Add a task"]').press("Enter"); await wait(2000);
  check("a task added from the list is shown", await A.has(`Call mom ${n}`));
  await p.getByRole("checkbox", { name: `Done: Buy milk ${n}` }).click(); await wait(2000);
  check("a done task leaves the list", !(await A.has(`Buy milk ${n}`)));
  check("and both are on the server: the new one to do, the other one done", await waitForServer(etebase, (s) => {
    const all = s.filter((x) => x.type === types.tasks).flatMap((x) => x.contents);
    return all.some((c) => c.includes(`SUMMARY:Call mom ${n}`) && c.includes("STATUS:NEEDS-ACTION")) &&
      all.some((c) => c.includes(`SUMMARY:Buy milk ${n}`) && c.includes("STATUS:COMPLETED") && c.includes("COMPLETED:"));
  }));
  await p.getByRole("button", { name: `Task Call mom ${n}` }).click(); await wait(1500);
  const details = p.locator('[data-testid="task-details"] >> visible=true');
  check("choosing a task shows its details", (await details.count() === 1) && (await details.innerText()).includes(`Call mom ${n}`));
  await details.locator('input[aria-label="Add subtask"]').fill(`Buy flowers ${n}`);
  await details.locator('input[aria-label="Add subtask"]').press("Enter"); await wait(2000);
  check("a subtask added there is shown in it", (await details.innerText()).includes(`Buy flowers ${n}`) && /0 of 1/i.test(await details.innerText()), await details.innerText());
  check("and is on the server, as a subtask of it", await waitForServer(etebase, (s) => {
    const all = s.filter((x) => x.type === types.tasks).flatMap((x) => x.contents);
    const parent = all.find((c) => c.includes(`SUMMARY:Call mom ${n}`));
    const uid = parent && /UID:(.*)/.exec(parent)[1].trim();
    return !!uid && all.some((c) => c.includes(`SUMMARY:Buy flowers ${n}`) && c.includes(`RELATED-TO:${uid}`));
  }), serverDetail(types.tasks)());
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  await vis('input[aria-label="Due date"]').fill(isoDate(due));
  await btn(/^repeat weekly$/i).click(); await wait(300);
  await btn(/^save$/i).click(); await wait(2500);
  check("a due date set in the editor is on the server", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.tasks) &&
    x.contents.some((c) => c.includes(`SUMMARY:Call mom ${n}`) && c.includes(`DUE;VALUE=DATE:${icalDate(due)}`) && c.includes("RRULE:FREQ=WEEKLY")))));

  // The contacts
  await sideRow("Contacts").click(); await wait(3000);
  check("the contact from the server is listed, with its details", await A.has(`Ada Lovelace ${n}`) && await A.has(`ada${n}@example.invalid`), await A.text());
  await btn(/^new contact$/i).click(); await wait(2000);
  await vis('input[aria-label="Name"]').fill(`Grace ${n} Hopper`);
  await vis('input[aria-label="Phone"]').fill("+1 555 0100");
  await vis('input[aria-label="Organization"]').fill("US Navy");
  await btn(/^save$/i).click(); await wait(3000);
  check("a new contact is listed", await A.has(`Grace ${n} Hopper`));
  check("and is on the server", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.contacts) && x.contents.some((c) => (
    c.includes(`FN:Grace ${n} Hopper`) && c.includes("TEL") && c.includes("+1 555 0100") && c.includes("ORG:US Navy") && c.includes(`N:Hopper;Grace ${n};`)
  )))), serverDetail(types.contacts)());
  await p.getByRole("button", { name: `Contact Grace ${n} Hopper` }).click(); await wait(2000);
  await btn(/^schedule$/i).click(); await wait(2000);
  check("scheduling with a contact makes an event with them", (await vis('input[aria-label="Title"]').inputValue()) === `With Grace ${n} Hopper`);
  await btn(/^save$/i).click(); await wait(3000);
  check("which is on the server, with them invited", await waitForServer(etebase, (s) => s.some((x) => (x.type === types.calendar) &&
    x.contents.some((c) => c.includes(`SUMMARY:With Grace ${n} Hopper`) && /ATTENDEE;CN=Grace \d+ Hopper/.test(c)))), serverDetail(types.calendar)());

  // The search of the sidebar finds all kinds of things
  await vis('input[aria-label="Search"]').fill(`${n}`); await wait(3000);
  const results = async (kind) => {
    const group = p.locator(`[data-testid="results-${kind}"] >> visible=true`);
    return (await group.count()) ? group.innerText() : "";
  };
  check("searching finds events, tasks and contacts", (await results("Events")).includes(`Dentist (moved) ${n}`) &&
    (await results("Tasks")).includes(`Call mom ${n}`) && (await results("Contacts")).includes(`Grace ${n} Hopper`), await A.text());
  await p.getByRole("button", { name: `Contact Grace ${n} Hopper` }).first().click(); await wait(2500);
  check("and opens them", await A.has("US Navy"));
  await sidebar.getByRole("button", { name: "Clear the search" }).click(); await wait(1000);

  // The settings of the web app are in the settings of the notes: the date and time format
  await sideRow("Settings").click(); await wait(2000);
  check("the settings have the calendar and the tasks", await A.has("Calendar and Tasks") && await A.has("Date and time format") && await A.has("Sort tasks by"));
  await p.getByText("Date and time format").click(); await wait(800);
  await p.getByRole("menuitem", { name: "US" }).click(); await wait(800);
  await p.reload(); await wait(6000);
  await sideRow("Calendar").click(); await wait(3000);
  const firstDay = await p.getByText(/^(Mon|Sun)$/).first().innerText();
  check("with the US format weeks start on Sunday, also after reloading", firstDay === "Sun", firstDay);
  check("and times have AM and PM", await A.has("10:00 AM – 10:30 AM"), await A.text());

  // The notes are still there, and work as before
  await sideRow("Notes").click(); await wait(2500);
  check("choosing the notes shows the notes column again", await p.locator('[data-testid="notes-column"] >> visible=true').count() === 1);
  await p.locator('[data-testid="notes-column"] >> visible=true').getByRole("button", { name: "New note" }).click(); await wait(2500);
  await p.keyboard.type(`Notes still work ${n}`); await wait(1500);
  await A.sync();
  check("a note is saved to the notebook, not to the calendar", await waitForServer(etebase, (s) => (
    s.some((x) => (x.type === types.notes) && x.contents.some((c) => c.includes(`Notes still work ${n}`))) &&
    !s.some((x) => (x.type !== types.notes) && x.contents.some((c) => c.includes(`Notes still work ${n}`)))
  )), serverDetail(types.notes)() + " | page: " + (await A.text()).slice(0, 300));
  await A.ctx.close();

  // Phones: the drawer has them too
  const B = await session(b, "B", { width: 420, height: 800 });
  await B.p.goto(config.appUrl + "/"); await B.wait(4000);
  await B.vis('[aria-label="Change the server"]').click(); await B.wait(500);
  await B.vis('input[aria-label="Username"]').fill(username);
  await B.vis('input[aria-label="Password"]').fill(password);
  await B.vis('input[aria-label="Server URL"]').fill(config.serverUrl);
  await B.btn(/^log in$/i).click(); await B.wait(10000);
  await B.tab("Tasks"); await B.wait(3000);
  check("on a phone, Tasks from the drawer shows the tasks", await B.has(`Call mom ${n}`), await B.text());
  await B.tab("Contacts"); await B.wait(2000);
  await B.p.getByRole("button", { name: `Contact Grace ${n} Hopper` }).click(); await B.wait(2000);
  check("and a contact opens on its own screen", await B.has("US Navy") && await B.has("+1 555 0100"), await B.text());
  await B.back();
  await B.tab("Search all"); await B.wait(2000);
  await B.vis('input[aria-label="Search everything"]').fill(`${n}`); await B.wait(3000);
  check("on a phone, the search of everything has its own field", (await B.text()).includes(`Grace ${n} Hopper`) && (await B.text()).includes(`Call mom ${n}`), await B.text());
  await B.ctx.close();

  await b.close();
  await etebase.logout();
});
