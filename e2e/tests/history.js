// The history of notes and events: their versions on the server (made here by saving them on the
// server a few times), what changed since the one before, bringing back an earlier one (checked on
// the server: it's the item's content and title again, as a new version), and what's shown offline.
// It uses an account of its own (made for each run).
const { launch, session, run, check, config, Etebase, unique } = require("../lib");

const types = { notes: "etebase.md.note", calendar: "etebase.vevent" };

async function collection(etebase, type) {
  for (let i = 0; i < 20; i++) {
    const col = (await etebase.getCollectionManager().list([type], { limit: 50 })).data.find((x) => !x.isDeleted);
    if (col) {
      return col;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No collection of ${type}`);
}

// Saves an item on the server once for each of its versions (each is a revision), a second apart
async function addVersions(etebase, col, versions) {
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const item = await itemMgr.create({ name: versions[0].name, mtime: Date.now() }, versions[0].content);
  await itemMgr.batch([item]);
  for (const v of versions.slice(1)) {
    await new Promise((r) => setTimeout(r, 1100));
    item.setMeta({ ...item.getMeta(), name: v.name, mtime: Date.now() });
    await item.setContent(v.content);
    await itemMgr.batch([item]);
  }
  return item.uid;
}

// The item as the server has it now, and how many versions it has
async function serverItem(etebase, col, uid) {
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const item = await itemMgr.fetch(uid);
  const revisions = await itemMgr.itemRevisions(item, { limit: 50 });
  return { name: item.getMeta().name, content: await item.getContent(Etebase.OutputFormat.String), versions: revisions.data.length };
}

let last;
async function waitForItem(etebase, col, uid, fn) {
  for (let i = 0; i < 20; i++) {
    last = await serverItem(etebase, col, uid);
    if (fn(last)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const ics = (uid, title, location) => [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:${uid}`,
  `DTSTART:${icalDate(new Date())}T110000`, `DTEND:${icalDate(new Date())}T120000`, `SUMMARY:${title}`, `LOCATION:${location}`,
  "END:VEVENT", "END:VCALENDAR", "",
].join("\r\n");

run(async () => {
  const n = unique();
  const username = `aio-hist-${n}`;
  const password = "aio-tester-password";
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);

  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, vis, btn, wait } = A;
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const sideRow = (label) => sidebar.getByRole("button", { name: label, exact: true });
  const versionRow = (i) => p.getByRole("button", { name: /^Version of / }).locator("visible=true").nth(i);
  // (whitespace as one space: the labels for screen readers are blocks of their own in the text)
  const shown = async () => (await vis('[data-testid="history-version"]').innerText()).replace(/\s+/g, " ");

  await p.goto(config.appUrl + "/"); await wait(4000);
  await vis('[aria-label="Change the server"]').click(); await wait(500);
  await vis('input[aria-label="Username"]').fill(username);
  await vis('input[aria-label="Password"]').fill(password);
  await vis('input[aria-label="Server URL"]').fill(config.serverUrl);
  await btn(/^log in$/i).click(); await wait(8000);
  await btn(/^finish$/i).click(); await wait(6000);

  // A note saved three times: the second added a line and changed one, the third changed the title
  const notes = await collection(etebase, types.notes);
  const first = { name: `Plan ${n}`, content: "Kickoff with design and eng.\n\n- Ship offline mode" };
  const second = { name: `Plan ${n}`, content: "Kickoff with design, eng and support.\n\n- Ship offline mode\n- Cut response times" };
  const third = { name: `Q4 plan ${n}`, content: second.content };
  const noteUid = await addVersions(etebase, notes, [first, second, third]);
  const single = await addVersions(etebase, notes, [{ name: `Ideas ${n}`, content: "Only one version" }]);
  check("the server has the versions", (await serverItem(etebase, notes, noteUid)).versions === 3 &&
    (await serverItem(etebase, notes, single)).versions === 1);

  await btn(/^sync$/i).click(); await wait(5000);
  await A.open(`Q4 plan ${n}`);
  await btn(/^history$/i).click(); await wait(4000);
  check("the history lists the versions, newest first, the first as the current one", (await p.getByRole("button", { name: /^Version of / }).locator("visible=true").count() === 3) &&
    (await versionRow(0).getAttribute("aria-label")).endsWith("Current") && (await versionRow(2).getAttribute("aria-label")).endsWith("Earlier version"), await A.text());
  check("the current version shows its title change", (await shown()).includes(`Q4 plan ${n}`) && (await shown()).includes(`was Plan ${n}`) &&
    (await shown()).includes("This is the current version"), await shown());
  await versionRow(1).click(); await wait(800);
  const second_ = await shown();
  check("an earlier version shows the lines added and removed since the one before it", second_.includes("Added: Kickoff with design, eng and support.") &&
    second_.includes("Removed: Kickoff with design and eng.") && second_.includes("Added: • Cut response times") && second_.includes("+ 2 added") && second_.includes("− 1 removed"), second_);
  await versionRow(2).click(); await wait(800);
  check("the first version has nothing to compare with", (await shown()).includes("First version") && !(await shown()).includes("Added:"), await shown());

  // Bringing back the first version: a new version, with the first one's title and content
  await btn(/^restore this version$/i).click(); await wait(800);
  const dialog = p.locator('[data-testid="restore-dialog"] >> visible=true');
  check("restoring asks first", (await dialog.count() === 1) && (await dialog.innerText()).includes("saved as a new version"));
  await dialog.getByRole("button", { name: "Restore", exact: true }).click(); await wait(3000);
  check("the restored version is the note's content and title on the server, as a fourth version", await waitForItem(etebase, notes, noteUid, (x) =>
    (x.name === first.name) && (x.content === first.content) && (x.versions === 4)), JSON.stringify(last));
  check("and the note shows it", await A.has("Kickoff with design and eng.") && !(await A.has("Cut response times")), await A.text());

  // A note with only one version
  await A.open(`Ideas ${n}`);
  await btn(/^history$/i).click(); await wait(4000);
  check("a note with one version says so", (await shown()).includes("This is the only version so far"), await shown());
  await btn(/^back$/i).click(); await wait(1500);

  // An event whose place changed
  const calendar = await collection(etebase, types.calendar);
  const eventUid = `lunch-${n}`;
  const eventItem = await addVersions(etebase, calendar, [
    { name: eventUid, content: ics(eventUid, `Lunch ${n}`, "Room 2") },
    { name: eventUid, content: ics(eventUid, `Lunch ${n}`, "Main room") },
  ]);
  await sideRow("Calendar").click(); await wait(3000);
  await btn(/^sync$/i).click(); await wait(5000);
  await btn(/^week view$/i).click(); await wait(1500);
  await p.locator('[data-testid="time-grid"] >> visible=true').getByRole("button", { name: `Event Lunch ${n}`, exact: true }).click(); await wait(800);
  await p.locator('[data-testid="event-details"] >> visible=true').getByRole("button", { name: "History" }).click(); await wait(4000);
  const event = await shown();
  check("the history of an event shows the field that changed, and what it was", event.includes("Location") && event.includes("Changed") &&
    event.includes("Main room") && event.includes("was Room 2") && event.includes("± 1 changed"), event);
  await versionRow(1).click(); await wait(800);
  await btn(/^restore this version$/i).click(); await wait(800);
  await dialog.getByRole("button", { name: "Restore", exact: true }).click(); await wait(3000);
  check("restoring an event puts its earlier content back on the server", await waitForItem(etebase, calendar, eventItem, (x) =>
    x.content.includes("LOCATION:Room 2") && (x.versions === 3)), JSON.stringify(last));

  // Offline, the history can't be loaded, which it says; once online again it can
  await p.locator('[data-testid="time-grid"] >> visible=true').getByRole("button", { name: `Event Lunch ${n}`, exact: true }).click(); await wait(800);
  await A.ctx.setOffline(true); await wait(500);
  await p.locator('[data-testid="event-details"] >> visible=true').getByRole("button", { name: "History" }).click(); await wait(3000);
  const problem = vis('[data-testid="history-problem"]');
  check("offline, it says that the history needs a connection", (await problem.count() === 1) && (await problem.innerText()).includes("History needs a connection"),
    await A.text());
  await A.ctx.setOffline(false); await wait(1000);
  await btn(/^try again$/i).click(); await wait(4000);
  check("and loads it when asked to again, online", await p.getByRole("button", { name: /^Version of / }).locator("visible=true").count() === 3, await A.text());

  await b.close();
});
