// The priorities of tasks: a day's tasks are sorted by priority, a new task's "!medium" and the
// details' Priority buttons are its PRIORITY on the server, the list can be grouped by priority and
// filtered by it (each list remembers how), and a task marked as done can be undone, with the done
// ones folded away at the bottom and deleted with Delete completed. It uses an account of its own.
const { launch, session, run, check, unique, newAccount, waitFor, collectionOf, Etebase } = require("../lib");

const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// The contents of the (not deleted) tasks on the server
async function contents(etebase) {
  const col = await collectionOf(etebase, "etebase.vtodo");
  const items = (await etebase.getCollectionManager().getItemManager(col).list({ limit: 200 })).data.filter((x) => !x.isDeleted);
  return Promise.all(items.map((x) => x.getContent(Etebase.OutputFormat.String)));
}

// The task with this title on the server, once it's there
async function taskOf(etebase, title) {
  let found;
  await waitFor(async () => (found = (await contents(etebase)).find((c) => c.includes(`SUMMARY:${title}\r\n`))));
  return found;
}

run(async () => {
  const n = unique();
  const { username, password, etebase } = await newAccount("desktop-prio");
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, vis, wait } = A;
  await A.login({ username, password });
  await A.btn(/^finish$/i).click(); await wait(6000);

  // Two tasks from another app, due today: the one without a priority was made first
  const col = await collectionOf(etebase, "etebase.vtodo");
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const today = icalDate(new Date());
  for (const [uid, title, priority] of [[`plain-${n}`, `Plain ${n}`, null], [`urgent-${n}`, `Urgent ${n}`, 2]]) {
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VTODO", `UID:${uid}`, "DTSTAMP:20261001T000000Z",
      `SUMMARY:${title}`, `DUE;VALUE=DATE:${today}`, ...((priority) ? [`PRIORITY:${priority}`] : []), "STATUS:NEEDS-ACTION",
      "END:VTODO", "END:VCALENDAR", ""].join("\r\n");
    await itemMgr.batch([await itemMgr.create({ name: uid, mtime: Date.now() }, content)]);
  }
  await p.reload(); await wait(5000);
  await p.keyboard.press("Alt+2"); await wait(3000);
  const group = (title) => p.locator(`[data-testid="group-${title}"] >> visible=true`);
  const groupText = async (title) => (await group(title).count()) ? group(title).innerText() : "";
  const todayText = await groupText("Today");
  check("today's tasks, the high priority one first", todayText.includes(`Urgent ${n}`) && (todayText.indexOf(`Urgent ${n}`) < todayText.indexOf(`Plain ${n}`)), todayText);
  check("with its priority shown in its row", /Urgent \d+[\s\S]*High/.test(todayText), todayText);

  // "!low !medium" in a new task: the last one counts
  await vis('input[aria-label="Add a task"]').fill(`Fix tap ${n} !low !medium`);
  await vis('input[aria-label="Add a task"]').press("Enter"); await wait(2000);
  const fixTap = await taskOf(etebase, `Fix tap ${n}`);
  check("a new task's !medium is its priority on the server, not in its title", !!fixTap && fixTap.includes("PRIORITY:5") && !fixTap.includes("!"), fixTap);

  // The details' Priority buttons
  await p.getByRole("button", { name: `Task Plain ${n}` }).click(); await wait(1500);
  const details = p.locator('[data-testid="task-details"] >> visible=true');
  await details.getByRole("radio", { name: "Low" }).click(); await wait(2000);
  check("choosing Low in the details saves PRIORITY:9", await waitFor(async () => (await taskOf(etebase, `Plain ${n}`)).includes("PRIORITY:9")));
  check("and the row shows it", /Plain \d+[\s\S]*Low/.test(await groupText("Today")), await groupText("Today"));
  check("another app's PRIORITY:2 is left as it is", (await taskOf(etebase, `Urgent ${n}`)).includes("PRIORITY:2"));

  // Grouped by priority, and filtered
  await p.getByRole("radio", { name: "Priority" }).click(); await wait(1000);
  check("grouped by priority", (await groupText("High")).includes(`Urgent ${n}`) && (await groupText("Medium")).includes(`Fix tap ${n}`) &&
    (await groupText("Low")).includes(`Plain ${n}`) && (await group("Today").count()) === 0, await A.text());
  await p.getByRole("button", { name: /^High priority/ }).click(); await wait(1000);
  const note = p.locator('[data-testid="tasks-filter-note"] >> visible=true');
  check("the High filter shows only the high one", (await p.getByRole("button", { name: `Task Fix tap ${n}` }).count()) === 0 &&
    (await p.getByRole("button", { name: `Task Urgent ${n}` }).count()) === 1, await A.text());
  check("and says so", (await note.count()) === 1 && (await note.innerText()).includes("Showing 1 of 3 tasks · high"), await A.text());

  // Each list remembers its own
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  await sidebar.getByRole("button", { name: "List My Tasks", exact: true }).click(); await wait(1500);
  check("another list shows all of them by due date", (await note.count()) === 0 && (await group("Today").count()) === 1, await A.text());
  await sidebar.getByRole("button", { name: "All tasks", exact: true }).click(); await wait(1500);
  check("and going back, the first one is as it was", (await note.count()) === 1 && (await group("High").count()) === 1, await A.text());
  await p.reload(); await wait(5000);
  check("also after a reload", (await note.count()) === 1 && (await group("High").count()) === 1, await A.text());
  await p.getByRole("button", { name: "Clear" }).click(); await wait(1000);
  await p.getByRole("radio", { name: "Due date" }).click(); await wait(1000);

  // Done, and undone
  await p.getByRole("checkbox", { name: `Done: Fix tap ${n}` }).click(); await wait(1500);
  check("a done task says so, with an Undo", await A.has(`“Fix tap ${n}” completed`), await A.text());
  check("it's done on the server", await waitFor(async () => (await taskOf(etebase, `Fix tap ${n}`)).includes("STATUS:COMPLETED")));
  check("and folded away at the bottom", (await groupText("Completed")).includes("1 completed task hidden") &&
    (await p.getByRole("button", { name: `Task Fix tap ${n}` }).count()) === 0, await groupText("Completed"));
  await p.getByRole("button", { name: "Undo" }).click(); await wait(1500);
  check("Undo makes it a task to do again, on the server", await waitFor(async () => {
    const c = await taskOf(etebase, `Fix tap ${n}`);
    return c.includes("STATUS:NEEDS-ACTION") && !/\r\nCOMPLETED:/.test(c);
  }));
  check("back in its group", (await groupText("No date")).includes(`Fix tap ${n}`), await A.text());
  await p.getByRole("checkbox", { name: `Done: Fix tap ${n}` }).click(); await wait(1500);
  await group("Completed").getByRole("checkbox", { name: "Show completed" }).click(); await wait(800);
  check("Show completed shows the done ones", (await groupText("Completed")).includes(`Fix tap ${n}`), await groupText("Completed"));

  // Deleting the done ones
  await group("Completed").getByRole("button", { name: "Delete completed" }).click(); await wait(800);
  check("Delete completed asks first", await A.has("Delete the completed task in All tasks?"), await A.text());
  await p.getByRole("button", { name: "Delete", exact: true }).click(); await wait(2000);
  check("and deletes the done ones from the server, not the others", await waitFor(async () => {
    const c = await contents(etebase);
    return !c.some((x) => x.includes(`SUMMARY:Fix tap ${n}`)) && c.some((x) => x.includes(`SUMMARY:Plain ${n}`)) && c.some((x) => x.includes(`SUMMARY:Urgent ${n}`));
  }));
  check("the Completed section is gone", (await group("Completed").count()) === 0 && (await groupText("Today")).includes(`Plain ${n}`), await A.text());
  await b.close();
});
