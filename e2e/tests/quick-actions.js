// Small things of the wide layout: Alt+1 to Alt+5 go to the sections of the sidebar, ? and Ctrl+/
// show the keyboard shortcuts, the calendar's
// Import button imports a file into the calendar, and the rows of the tasks are one button (the
// whole row is highlighted under the pointer) with the checkbox in it. It uses an account of its own.
const { launch, session, run, check, unique, newAccount, waitFor, collectionOf, Etebase } = require("../lib");

// The contents of the (not deleted) items of the first collection of a type, from the server
async function contents(etebase, type) {
  const col = await collectionOf(etebase, type);
  const items = (await etebase.getCollectionManager().getItemManager(col).list({ limit: 200 })).data.filter((x) => !x.isDeleted);
  return Promise.all(items.map((x) => x.getContent(Etebase.OutputFormat.String)));
}

run(async () => {
  const n = unique();
  const { username, password, etebase } = await newAccount("desktop-quick");
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  await A.login({ username, password });
  await A.btn(/^finish$/i).click(); await A.wait(6000);
  const path = () => new URL(A.p.url()).pathname;

  // The sections, by their place in the sidebar
  const sections = [["Calendar", "/calendar"], ["Tasks", "/tasks"], ["Notes", "/"], ["Bookmarks", "/bookmarks"], ["Contacts", "/contacts"]];
  for (const [i, [name, where]] of [...sections.entries()].reverse()) {
    await A.p.keyboard.press(`Alt+${i + 1}`); await A.wait(1500);
    check(`Alt+${i + 1} goes to ${name}`, path() === where, path());
  }
  await A.vis('input[aria-label="Search"]').click();
  await A.p.keyboard.press("Alt+2"); await A.wait(1500);
  check("also while typing in a field", path() === "/tasks", path());
  await A.p.keyboard.press("Control+Alt+1"); await A.wait(1000);
  check("but not with ctrl too", path() === "/tasks", path());

  // The list of the shortcuts
  const shortcuts = A.p.locator('[data-testid="shortcuts"] >> visible=true');
  const closeShortcuts = async () => { await shortcuts.getByRole("button", { name: "Close" }).first().click(); await A.wait(600); };
  await A.vis('input[aria-label="Search"]').fill("");
  await A.vis('input[aria-label="Search"]').press("?"); await A.wait(600);
  check("? in a field is only a question mark", (await shortcuts.count() === 0) && ((await A.vis('input[aria-label="Search"]').inputValue()) === "?"));
  await A.p.keyboard.press("Control+/"); await A.wait(800);
  const list = (await shortcuts.count()) ? await shortcuts.innerText() : "";
  check("Ctrl+/ shows the shortcuts, also while typing", list.includes("Alt") && list.includes("Bookmarks") && list.includes("!high"), list);
  await closeShortcuts();
  await A.vis('input[aria-label="Search"]').fill("");
  await A.p.locator("body").click({ position: { x: 700, y: 880 } });
  await A.p.keyboard.press("?"); await A.wait(800);
  check("? shows them when not typing", await shortcuts.count() === 1);
  await closeShortcuts();
  await A.p.getByRole("button", { name: "Account menu" }).click(); await A.wait(600);
  await A.p.getByRole("menuitem", { name: "Keyboard shortcuts" }).click(); await A.wait(800);
  check("and so does the account menu", await shortcuts.count() === 1);
  await closeShortcuts();
  await A.p.getByRole("link", { name: "Keyboard shortcuts" }).click(); await A.wait(800);
  check("and the link under the tasks' box", await shortcuts.count() === 1);
  await closeShortcuts();

  // Importing from the calendar's bar
  await A.p.keyboard.press("Alt+1"); await A.wait(2000);
  await A.btn(/^import$/i).click(); await A.wait(800);
  const dialog = A.p.locator('[data-testid="import-dialog"] >> visible=true');
  check("the calendar's Import button opens the Import dialog", await dialog.count() === 1);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VEVENT", `UID:bar-import-${n}`, "DTSTAMP:20261001T000000Z",
    "DTSTART:20261110T120000Z", "DTEND:20261110T130000Z", `SUMMARY:From the bar ${n}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  const [chooser] = await Promise.all([A.p.waitForEvent("filechooser"), dialog.getByRole("button", { name: "Choose files…" }).click()]);
  await chooser.setFiles({ name: `bar-${n}.ics`, mimeType: "text/calendar", buffer: Buffer.from(ics) }); await A.wait(1500);
  await dialog.getByRole("button", { name: "Import 1 item" }).click(); await A.wait(4000);
  check("and the file's event is imported into the calendar, on the server", await waitFor(async () =>
    (await contents(etebase, "etebase.vevent")).some((c) => c.includes(`SUMMARY:From the bar ${n}`))));
  await dialog.getByRole("button", { name: "Close" }).click(); await A.wait(500);

  // The rows of the tasks
  await A.p.keyboard.press("Alt+2"); await A.wait(2000);
  for (const title of [`Hovered ${n}`, `Opened ${n}`]) {
    await A.vis('input[aria-label="Add a task"]').fill(title);
    await A.vis('input[aria-label="Add a task"]').press("Enter"); await A.wait(1500);
  }
  const taskRow = (title) => A.p.getByRole("button", { name: `Task ${title}` }).locator("visible=true").first();
  const box = (title) => taskRow(title).evaluate((el) => {
    const check = el.querySelector('[role="checkbox"]').getBoundingClientRect();
    const row = el.getBoundingClientRect();
    return { background: getComputedStyle(el).backgroundColor, checkInside: (check.left >= row.left) && (check.right <= row.right) };
  });
  await A.p.mouse.move(5, 5); await A.wait(300);
  const before = await box(`Hovered ${n}`);
  await taskRow(`Hovered ${n}`).getByText(`Hovered ${n}`, { exact: true }).hover(); await A.wait(300);
  const hovered = await box(`Hovered ${n}`);
  check("a task's row is one button, its checkbox in it", hovered.checkInside, hovered);
  check("which is highlighted as a whole under the pointer", (before.background !== hovered.background) && (hovered.background !== "rgba(0, 0, 0, 0)"), [before, hovered]);
  await A.p.getByRole("checkbox", { name: `Done: Hovered ${n}` }).locator("visible=true").first().click(); await A.wait(2000);
  check("its checkbox marks it done, on the server", await waitFor(async () => (await contents(etebase, "etebase.vtodo"))
    .some((c) => c.includes(`SUMMARY:Hovered ${n}`) && c.includes("STATUS:COMPLETED"))));
  check("without opening it", await A.p.locator('[data-testid="task-details"] >> visible=true').count() === 0);
  await taskRow(`Opened ${n}`).click(); await A.wait(1500);
  const details = A.p.locator('[data-testid="task-details"] >> visible=true');
  check("the rest of the row opens it", (await details.count() === 1) && (await details.innerText()).includes(`Opened ${n}`));
  check("and doesn't mark it done", (await contents(etebase, "etebase.vtodo")).some((c) => c.includes(`SUMMARY:Opened ${n}`) && c.includes("STATUS:NEEDS-ACTION")));
  await b.close();
});
