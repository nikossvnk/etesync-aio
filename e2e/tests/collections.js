// Collections (calendars, task lists, address books, notebooks): making them with the + of the sidebar,
// their ⋯ menu, importing files (choose, review, done) and the Settings → Collections page (editing,
// sharing with another user, exporting, deleting). What's done is checked on the server.
// It uses accounts of its own (made for each run).
const { launch, session, run, check, config, Etebase, unique, waitFor } = require("../lib");

const types = { notes: "etebase.md.note", calendar: "etebase.vevent", tasks: "etebase.vtodo", contacts: "etebase.vcard" };

async function collections(etebase) {
  const colMgr = etebase.getCollectionManager();
  const ret = [];
  for (const col of (await colMgr.list(Object.values(types), { limit: 50 })).data) {
    if (col.isDeleted) {
      continue;
    }
    const contents = [];
    for (const item of (await colMgr.getItemManager(col).list({ limit: 200 })).data) {
      if (!item.isDeleted) {
        contents.push(`${item.getMeta().name}\n${await item.getContent(Etebase.OutputFormat.String)}`);
      }
    }
    ret.push({ col, type: col.getCollectionType(), meta: col.getMeta(), contents });
  }
  return ret;
}

run(async () => {
  const n = unique();
  const password = "collections-tester-password";
  const username = `col-${n}`;
  const other = `col-other-${n}`;
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);
  const otherAccount = await Etebase.Account.signup({ username: other, email: `${other}@example.invalid` }, password, config.serverUrl);
  const colMgr = etebase.getCollectionManager();
  for (const [type, name] of [[types.notes, "My Notes"], [types.calendar, "Work"]]) {
    const col = await colMgr.create(type, { name, mtime: Date.now() }, "");
    await colMgr.upload(col);
  }

  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, vis, btn, wait } = A;
  await A.login({ username, password }, 9000);
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const side = (label) => sidebar.getByRole("button", { name: label, exact: true });
  const has = async (text) => (await p.innerText("body")).includes(text);

  // A calendar from the + of the section
  await side("Calendar").click(); await wait(2500);
  await sidebar.getByRole("button", { name: "New calendar" }).click(); await wait(800);
  const newDialog = p.locator('[data-testid="new-collection"] >> visible=true');
  check("the + of the calendars opens the dialog, with a calendar chosen", (await newDialog.count() === 1) &&
    ((await newDialog.getByRole("radio", { name: "Calendar" }).getAttribute("aria-checked")) === "true"));
  await newDialog.locator('input[aria-label="Name"]').fill(`Family ${n}`);
  await newDialog.locator('input[aria-label="Description"]').fill("At home");
  await newDialog.getByRole("radio", { name: "Green" }).click();
  await newDialog.getByRole("button", { name: "Create calendar" }).click(); await wait(3000);
  check("it's made on the server, with its description and colour", await waitFor(async () => (await collections(etebase)).some((x) => (x.type === types.calendar) &&
    (x.meta.name === `Family ${n}`) && (x.meta.description === "At home") && (x.meta.color === "#5CC59B"))));
  check("and listed in the sidebar", await sidebar.getByRole("checkbox", { name: `Show Family ${n}` }).count() === 1);

  // Its ⋯ menu
  await sidebar.getByRole("button", { name: `Family ${n} options` }).click({ force: true }); await wait(600);
  await p.getByRole("menuitem", { name: "Show only this one" }).click(); await wait(800);
  check("show only this one hides the others", ((await sidebar.getByRole("checkbox", { name: "Show Work" }).getAttribute("aria-checked")) === "false") &&
    ((await sidebar.getByRole("checkbox", { name: `Show Family ${n}` }).getAttribute("aria-checked")) === "true"));
  await sidebar.getByRole("checkbox", { name: "Show Work" }).click(); await wait(300);

  // Importing a file into it
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e",
    "BEGIN:VTIMEZONE", "TZID:Europe/Berlin", "BEGIN:STANDARD", "DTSTART:19701025T030000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:weekly-${n}`, "DTSTART;TZID=Europe/Berlin:20261012T100000", "DTEND;TZID=Europe/Berlin:20261012T110000", `SUMMARY:Weekly ${n}`, "RRULE:FREQ=WEEKLY", "END:VEVENT",
    "BEGIN:VEVENT", `UID:weekly-${n}`, "RECURRENCE-ID;TZID=Europe/Berlin:20261019T100000", "DTSTART;TZID=Europe/Berlin:20261019T120000", "DTEND;TZID=Europe/Berlin:20261019T130000", `SUMMARY:Weekly ${n} (moved)`, "END:VEVENT",
    "BEGIN:VEVENT", `UID:nostart-${n}`, "SUMMARY:No start", "END:VEVENT",
    "BEGIN:VTODO", `UID:task-${n}`, `SUMMARY:Imported task ${n}`, "DUE;VALUE=DATE:20261020", "END:VTODO",
    "END:VCALENDAR", "",
  ].join("\r\n");
  const icsLine = ics.split("\r\n").indexOf(`UID:nostart-${n}`) + 1;
  const chooseFile = async (dialog, files) => {
    const [chooser] = await Promise.all([p.waitForEvent("filechooser"), dialog.getByRole("button", { name: "Choose files…" }).click()]);
    await chooser.setFiles(files); await wait(1500);
  };
  const icsFile = { name: `holidays-${n}.ics`, mimeType: "text/calendar", buffer: Buffer.from(ics) };
  await sidebar.getByRole("button", { name: `Family ${n} options` }).click({ force: true }); await wait(600);
  await p.getByRole("menuitem", { name: "Import into this calendar…" }).click(); await wait(800);
  const importDialog = p.locator('[data-testid="import-dialog"] >> visible=true');
  check("import from the ⋯ menu starts with the calendar picked", (await importDialog.count() === 1) && (await importDialog.innerText()).includes(`Into\nFamily ${n}`.replace("\n", "")) || (await importDialog.innerText()).includes(`Family ${n}`));
  await chooseFile(importDialog, [icsFile]);
  check("the review says what's in the file", (await importDialog.locator('[data-testid="import-found"]').innerText()).includes("1 event and 1 task found"),
    await importDialog.innerText());
  check("and that an entry can't be read", (await importDialog.innerText()).includes("1 entry can’t be read"));
  check("the events go to the calendar it was opened from", (await importDialog.getByRole("button", { name: `Where the events go: Family ${n}` }).count()) === 1);
  check("the tasks to a new list (there's none)", (await importDialog.getByRole("button", { name: "Where the tasks go: New task list…" }).count()) === 1);
  await importDialog.getByRole("button", { name: "Preview first 5 items" }).click(); await wait(300);
  check("the preview shows the items", (await importDialog.innerText()).includes(`Weekly ${n}`) && (await importDialog.innerText()).includes(`Imported task ${n}`));
  await importDialog.getByRole("button", { name: "Import 2 items" }).click(); await wait(4000);
  check("done: what was imported where, and what couldn't be read (with its line)", (await importDialog.locator('[data-testid="import-done"]').innerText()).includes("2 items imported") &&
    (await importDialog.innerText()).includes(`Events added to Family ${n}`) && (await importDialog.innerText()).includes(`Event “No start” has no start date (line ${icsLine})`),
    await importDialog.innerText());
  check("the event is on the server, one item with its moved time and its time zone", await waitFor(async () => (await collections(etebase)).some((x) => (x.meta.name === `Family ${n}`) &&
    (x.contents.length === 1) && x.contents[0].includes(`SUMMARY:Weekly ${n}`) && x.contents[0].includes("RECURRENCE-ID") && x.contents[0].includes("BEGIN:VTIMEZONE"))));
  check("the task in a new list, named after the file", await waitFor(async () => (await collections(etebase)).some((x) => (x.type === types.tasks) &&
    (x.meta.name === `holidays-${n}`) && x.contents.some((c) => c.includes(`SUMMARY:Imported task ${n}`)))));

  // Again: what's there already is skipped
  await importDialog.getByRole("button", { name: "Import another file" }).click(); await wait(500);
  await chooseFile(importDialog, [icsFile]);
  await importDialog.getByRole("button", { name: "Import 2 items" }).click(); await wait(4000);
  check("importing the same file again skips what's there already", (await importDialog.innerText()).includes(`Skipped, already in Family ${n}`) &&
    (await importDialog.locator('[data-testid="import-done"]').innerText()).includes("0 items imported"), await importDialog.innerText());
  // ... or updates it
  await importDialog.getByRole("button", { name: "Import another file" }).click(); await wait(500);
  await chooseFile(importDialog, [{ ...icsFile, buffer: Buffer.from(ics.replace(`SUMMARY:Weekly ${n}\r\n`, `SUMMARY:Weekly ${n} renamed\r\n`)) }]);
  await importDialog.getByRole("radio", { name: "Update them from the file" }).click();
  await importDialog.getByRole("checkbox", { name: "Import 1 task" }).click();
  await importDialog.getByRole("button", { name: "Import 1 item" }).click(); await wait(4000);
  check("or updates it from the file", await waitFor(async () => (await collections(etebase)).some((x) => (x.meta.name === `Family ${n}`) &&
    (x.contents.length === 1) && x.contents[0].includes(`SUMMARY:Weekly ${n} renamed`))));
  // ... or imports it as a copy (with an ID of its own)
  await importDialog.getByRole("button", { name: "Import another file" }).click(); await wait(500);
  await chooseFile(importDialog, [icsFile]);
  await importDialog.getByRole("radio", { name: "Import as copies" }).click();
  await importDialog.getByRole("checkbox", { name: "Import 1 task" }).click();
  await importDialog.getByRole("button", { name: "Import 1 item" }).click(); await wait(4000);
  check("or imports it as a copy, with an ID of its own", await waitFor(async () => (await collections(etebase)).some((x) => (x.meta.name === `Family ${n}`) &&
    (x.contents.length === 2) && x.contents.some((c) => !c.includes(`UID:weekly-${n}`)))));
  await importDialog.getByRole("button", { name: "Close" }).click(); await wait(500);

  // Editing the repeating event in the app keeps the time of it that was moved (from the file)
  const family = (await collections(etebase)).find((x) => x.meta.name === `Family ${n}`).col;
  const weekly = (await colMgr.getItemManager(family).list()).data.find((x) => !x.isDeleted && x.getMeta().name === `weekly-${n}`);
  await p.goto(`${config.appUrl}/calendar/event?colUid=${family.uid}&itemUid=${weekly.uid}`); await wait(6000);
  await vis('input[aria-label="Title"]').fill(`Weekly ${n} edited`);
  await btn(/^save$/i).click(); await wait(3000);
  check("editing a repeating event keeps its changed times", await waitFor(async () => {
    const content = await (await colMgr.getItemManager(family).fetch(weekly.uid)).getContent(Etebase.OutputFormat.String);
    return content.includes(`SUMMARY:Weekly ${n} edited`) && content.includes("RECURRENCE-ID") && content.includes(`SUMMARY:Weekly ${n} (moved)`);
  }));

  // Notes, from Markdown files, from the dialog of a new notebook ("import it instead")
  await side("Notes").click(); await wait(2000);
  await sidebar.getByRole("button", { name: "New notebook" }).click(); await wait(800);
  await p.getByRole("link", { name: /Import it instead/ }).click(); await wait(800);
  await chooseFile(importDialog, [{ name: `Shopping ${n}.md`, mimeType: "text/markdown", buffer: Buffer.from("- milk\n- bread\n") }]);
  check("a Markdown file is a note", (await importDialog.locator('[data-testid="import-found"]').innerText()).includes("1 note found"));
  await importDialog.getByRole("button", { name: "Import 1 item" }).click(); await wait(4000);
  check("which is on the server, in the notebook", await waitFor(async () => (await collections(etebase)).some((x) => (x.type === types.notes) &&
    x.contents.some((c) => c.startsWith(`Shopping ${n}\n- milk`)))));
  await importDialog.getByRole("button", { name: "Close" }).click(); await wait(500);

  // Settings → Collections
  await side("Settings").click(); await wait(1500);
  check("the settings have their own list in the sidebar", (await side("Settings: Collections").count()) === 1);
  await side("Settings: Collections").click(); await wait(3000);
  check("the collections page lists them by kind, with how much is in them", (await p.locator('[data-testid="collections-calendar"] >> visible=true').innerText()).includes(`Family ${n}`) &&
    (await p.locator('[data-testid="collections-calendar"] >> visible=true').innerText()).includes("2 events"), await p.innerText("body"));
  await p.getByRole("tab", { name: "Task lists" }).click(); await wait(500);
  check("and filters them by kind", (await p.locator('[data-testid="collections-calendar"] >> visible=true').count() === 0) &&
    (await p.locator('[data-testid="collections-tasks"] >> visible=true').innerText()).includes(`holidays-${n}`));
  await p.getByRole("tab", { name: "All" }).click(); await wait(500);
  await p.getByRole("button", { name: `Calendar Family ${n}` }).click(); await wait(1500);
  const panel = p.locator('[data-testid="collection-panel"] >> visible=true');
  await panel.locator('input[aria-label="Name"]').fill(`Family renamed ${n}`);
  await panel.getByRole("radio", { name: "Pink" }).click();
  await panel.getByRole("button", { name: "Save changes" }).click(); await wait(3000);
  check("editing it changes it on the server", await waitFor(async () => (await collections(etebase)).some((x) => (x.meta.name === `Family renamed ${n}`) && (x.meta.color === "#E8838F"))));

  // Sharing it with another user
  await panel.locator('input[aria-label="Invite by username"]').fill(other);
  await panel.getByRole("button", { name: "Invite" }).click(); await wait(2000);
  check("inviting shows their security fingerprint first", await has("Verify the security fingerprint"));
  await p.getByRole("button", { name: "Invite" }).last().click(); await wait(3000);
  const inviteMgr = otherAccount.getInvitationManager();
  const incoming = (await inviteMgr.listIncoming()).data.filter((x) => x.fromUsername === username);
  check("the other user gets the invitation", incoming.length === 1, incoming.length);
  await inviteMgr.accept(incoming[0]);
  await p.reload(); await wait(6000);
  await p.getByRole("button", { name: `Calendar Family renamed ${n}` }).click(); await wait(3000);
  check("once accepted, they're listed with their access", (await panel.innerText()).includes(other) && (await panel.getByRole("button", { name: `Access for ${other}: Read & write` }).count() === 1));
  await panel.getByRole("button", { name: `Access for ${other}: Read & write` }).click(); await wait(500);
  await p.getByRole("menuitem", { name: "Read only" }).click(); await wait(2500);
  const sharedCol = (await collections(etebase)).find((x) => x.meta.name === `Family renamed ${n}`).col;
  const memberList = async () => (await colMgr.getMemberManager(sharedCol).list()).data;
  check("their access can be changed, on the server", (await memberList()).some((m) => (m.username === other) && (m.accessLevel === Etebase.CollectionAccessLevel.ReadOnly)));
  await panel.getByRole("button", { name: `Access for ${other}: Read only` }).click(); await wait(500);
  await p.getByRole("menuitem", { name: "Remove access" }).click(); await wait(2500);
  check("and taken away", !(await memberList()).some((m) => m.username === other));

  // Its changes, exporting, deleting
  await panel.getByRole("button", { name: "Changes", exact: true }).click(); await wait(2000);
  check("its changes list its events by their titles", await has(`Weekly ${n} edited`));
  await btn(/^back$/i).click(); await wait(2000);
  await p.getByRole("button", { name: `Calendar Family renamed ${n}` }).click(); await wait(1000);
  const [download] = await Promise.all([p.waitForEvent("download"), panel.getByRole("button", { name: "Export", exact: true }).click()]);
  const exported = require("fs").readFileSync(await download.path(), "utf8");
  check("exporting saves an .ics file with its events", download.suggestedFilename() === `Family renamed ${n}.ics` && exported.includes(`SUMMARY:Weekly ${n} edited`) &&
    exported.includes("RECURRENCE-ID") && ((exported.match(/BEGIN:VTIMEZONE/g) ?? []).length === 1),
    [download.suggestedFilename(), exported.includes(`SUMMARY:Weekly ${n} edited`), exported.includes("RECURRENCE-ID"), (exported.match(/BEGIN:VTIMEZONE/g) ?? []).length]);
  await panel.getByRole("button", { name: "Delete calendar…" }).click(); await wait(800);
  check("deleting says what it does", await has("This can’t be undone"));
  await p.getByRole("button", { name: "Delete" }).last().click(); await wait(3000);
  check("and deletes it on the server", await waitFor(async () => !(await collections(etebase)).some((x) => x.meta.name === `Family renamed ${n}`)));

  await b.close();
  await etebase.logout();
  await otherAccount.logout();
});
