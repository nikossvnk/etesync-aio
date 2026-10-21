// Wide screens: three columns, the sidebar (account, search, notebooks, settings), the notes, and the
// open note. There's no drawer, the sidebar has what it has.
const { launch, session, run, check, api, unique, config } = require("../lib");
run(async () => {
  const n = unique();
  const other = "Sidebar " + n;
  await api.addNote("My Notes", "First " + n, "the first note");
  await api.addNote("My Notes", "Second " + n, "the second note");
  await api.addNote(other, "Third " + n, "the third note, about kiwis" + n);
  const b = await launch();

  // Not on narrow screens, which have the drawer
  const narrow = await session(b, "narrow");
  await narrow.login();
  check("no sidebar or notes column on a narrow screen", await narrow.p.locator('[data-testid="sidebar"] >> visible=true').count() === 0 &&
    await narrow.p.locator('[data-testid="notes-column"] >> visible=true').count() === 0);
  check("but the menu button of the drawer", await narrow.btn(/^main menu$/i).count() === 1);
  await narrow.ctx.close();

  const A = await session(b, "A", { width: 1280, height: 800 });
  await A.login();
  const sidebar = A.p.locator('[data-testid="sidebar"] >> visible=true');
  const column = A.p.locator('[data-testid="notes-column"] >> visible=true');
  const row = (label) => sidebar.getByRole("button", { name: label, exact: true });
  const shown = async (label) => (await row(label).count()) > 0;
  const selected = async (label) => (await row(label).getAttribute("aria-selected")) === "true";
  const path = () => new URL(A.p.url()).pathname.replace(/[A-Za-z0-9_-]{32}/g, "ID");
  // The notes in the notes column, in their order, and the one that is selected
  const notes = () => column.locator("a[href*='/note/'] [aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  const note = (name) => column.locator(`a[href*='/note/'] [aria-label="${name}"]`).first();
  const noteSelected = async (name) => (await note(name).getAttribute("aria-selected")) === "true";
  // Whether the column lists the note, scrolling it (it only has the rows it scrolled to), and back to its top
  const listed = async (name) => {
    const box = await column.boundingBox();
    await A.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    let found = false;
    for (let i = 0; (i < 40) && !found; i++) {
      found = (await notes()).includes(name);
      if (!found) {
        await A.p.mouse.wheel(0, 600); await A.wait(250);
      }
    }
    await A.p.mouse.wheel(0, -100000); await A.wait(300);
    return found;
  };

  check("the sidebar and the notes are shown on a wide screen", await sidebar.count() === 1 && await column.count() === 1);
  check("there's no drawer menu button", await A.btn(/^main menu$/i).count() === 0);
  check("the sidebar shows the account", (await sidebar.innerText()).includes(config.username));
  check("and the notebooks", await shown("Notebook My Notes") && await shown("Notebook " + other));
  check("the notes column lists the notes of all notebooks", await listed("First " + n) && await listed("Third " + n));
  check("next to it nothing is open yet", (await A.p.getByText("No note open").locator("visible=true").count()) === 1);

  // What the drawer has is in the account's menu, and the settings at the bottom
  await row("Account menu").click(); await A.wait(800);
  for (const item of ["Invitations", "Show Fingerprint", "Logout", "Report issue"]) {
    check(`the account menu has ${item}`, await A.p.getByText(item, { exact: true }).locator("visible=true").count() > 0);
  }
  await A.p.getByRole("menuitem", { name: "Invitations" }).locator("visible=true").first().click(); await A.wait(1500);
  check("invitations opens them, without the notes column", path() === "/invitations" && await column.count() === 0, path());
  await row("Settings").click(); await A.wait(1500);
  check("settings opens them, without the notes column", path() === "/settings" && await column.count() === 0, path());
  await row("Notes").click(); await A.wait(1500);
  check("and the notes bring it back", await column.count() === 1);

  // Opening notes from the column
  await note("First " + n).click(); await A.wait(2500);
  check("a note opens from the column", path() === "/notebook/ID/note/ID" && (await A.viewerText()).includes("the first note"));
  check("and is the selected one", await noteSelected("First " + n) && !(await noteSelected("Second " + n)));
  check("the bar shows its notebook and title", (await A.p.locator("text=My Notes >> visible=true").count()) > 0);
  await note("Third " + n).click(); await A.wait(2500);
  check("another note opens in its place", (await A.viewerText()).includes("the third note") && await noteSelected("Third " + n));
  await A.back();
  check("back closes it, not going to the note before", path() === "/" && (await A.p.getByText("No note open").locator("visible=true").count()) === 1, path());

  // Changes are saved when going to another note
  await note("Second " + n).click(); await A.wait(2500);
  await (await A.editor()).fill("the second note, changed"); await A.wait(500);
  await note("First " + n).click(); await A.wait(6000);
  const second = () => api.noteContent("My Notes", "Second " + n);
  check("an edited note is saved when another one is opened", (await second()) === "the second note, changed",
    [await second(), (await api.noteNames()).filter((x) => x.includes(n))]);

  // A notebook shows its notes in the column
  await row("Notebook " + other).click(); await A.wait(2000);
  check("a notebook lists its notes", JSON.stringify(await notes()) === JSON.stringify(["Third " + n]), await notes());
  check("and is the selected one", await selected("Notebook " + other) && !(await selected("All notes")));
  check("with its name above them", (await column.innerText()).includes(other));

  // A new note is in the chosen notebook, and thrown away when it's left empty
  const notesBefore = (await api.noteNames()).length;
  // (the notes column has the button, the sidebar has a menu for making anything)
  await column.getByRole("button", { name: "New note" }).click(); await A.wait(2500);
  check("a new note is in the chosen notebook", (await A.notebookOfNote()) === other, await A.notebookOfNote());
  check("with the title being typed in", await A.p.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Title");
  await note("Third " + n).click(); await A.wait(4000);
  check("left empty for another note: thrown away", !(await notes()).includes("Untitled") && (await A.viewerText()).includes("the third note"));
  check("and not on the server", (await api.noteNames()).length === notesBefore);
  await row("All notes").click(); await A.wait(1500);
  check("all notes lists all of them again", await listed("First " + n) && await selected("All notes"));

  // Searching the titles and contents (the search of the sidebar finds everything, the notes are
  // the first of its results)
  const search = A.p.locator('input[aria-label="Search"] >> visible=true');
  const found = async () => {
    const group = A.p.locator('[data-testid="results-Notes"] >> visible=true');
    return (await group.count()) ? group.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").replace(/^Note /, ""))) : [];
  };
  await search.fill("kiwis" + n); await A.wait(2500);
  check("searching finds a note by its content", JSON.stringify(await found()) === JSON.stringify(["Third " + n]), await found());
  await search.fill("Second " + n); await A.wait(1500);
  check("and by its title", (await found()).includes("Second " + n) && !(await found()).includes("Third " + n), await found());
  await search.fill("nothinglikethis" + n); await A.wait(1500);
  check("and says so when nothing matches", (await A.text()).includes("Nothing found"));
  await sidebar.getByRole("button", { name: "Clear the search" }).click(); await A.wait(1500);
  check("clearing it lists the notes again", await listed("First " + n) && await listed("Third " + n));

  // Hiding it, which is remembered, the notes stay
  await row("Hide the sidebar").click(); await A.wait(800);
  check("the sidebar can be hidden", await sidebar.count() === 0 && await column.count() === 1);
  await A.p.reload(); await A.wait(6000);
  check("it stays hidden after reloading", await sidebar.count() === 0);
  await A.btn(/^show the sidebar$/i).click(); await A.wait(800);
  check("and can be shown again", await sidebar.count() === 1 && await shown("Notebook " + other));

  // Changing its width by dragging its edge, which is remembered
  const width = async () => Math.round((await sidebar.boundingBox()).width);
  const drag = async (dx) => {
    const handle = (await A.p.locator('[data-testid="sidebar-resize"] >> visible=true').boundingBox());
    const x = handle.x + handle.width / 2, y = handle.y + 300;
    await A.p.mouse.move(x, y); await A.p.mouse.down();
    await A.p.mouse.move(x + dx / 2, y, { steps: 5 }); await A.p.mouse.move(x + dx, y, { steps: 5 });
    await A.p.mouse.up(); await A.wait(800);
  };
  const before = await width();
  await drag(80);
  check("dragging the edge makes the sidebar wider", Math.abs((await width()) - (before + 80)) <= 2, [before, await width()]);
  check("and moves the notes column", Math.round((await column.boundingBox()).x) >= before + 78, (await column.boundingBox()).x);
  await A.p.reload(); await A.wait(6000);
  check("the width stays after reloading", Math.abs((await width()) - (before + 80)) <= 2, await width());
  await drag(-1000);
  check("it doesn't get narrower than 200 pixels", (await width()) === 200, await width());
  await drag(2000);
  check("or wider than 400", (await width()) === 400, await width());
  await drag(before - 400);
  check("and can be dragged back", Math.abs((await width()) - before) <= 2, await width());

  // New notebook
  await row("New notebook").click(); await A.wait(1500);
  const dialog = A.p.locator('[data-testid="new-collection"] >> visible=true');
  check("new notebook opens the dialog for it, with a notebook chosen", (await dialog.count() === 1) &&
    ((await dialog.getByRole("radio", { name: "Notebook" }).getAttribute("aria-checked")) === "true"));
  await b.close();
});
