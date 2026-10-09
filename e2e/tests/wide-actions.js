// The actions of the screens are buttons in their bars (and above the notes on wide screens), not in a menu
const { launch, session, run, check, api, unique, config } = require("../lib");
run(async () => {
  const n = unique();
  const notebook = "Actions " + n;
  // Added one after the other, so sorting by name and by modification time gives different orders
  await api.addNote(notebook, "Apple " + n, "added first");
  await sleep(1500);
  await api.addNote(notebook, "Zebra " + n, "added second");
  const b = await launch();
  const A = await session(b, "A", { width: 1280, height: 800 });
  await A.login();
  const path = () => new URL(A.p.url()).pathname.replace(/[A-Za-z0-9_-]{32}/g, "ID");
  const bar = (name) => A.p.getByRole("button", { name, exact: true }).locator("visible=true");
  const noMenu = async () => (await bar("Menu").count()) === 0;
  const sidebar = A.p.locator('[data-testid="sidebar"] >> visible=true');
  // The names of the notes in the list, in their order
  const cards = () => A.p.locator("[aria-label] >> visible=true").evaluateAll((els) => els
    .filter((e) => !e.closest('[data-testid="sidebar"]') && e.closest('a[href*="/note/"]'))
    .map((e) => e.getAttribute("aria-label")));
  const order = async () => (await cards()).filter((x) => x.endsWith(" " + n));

  // The list of notes
  await sidebar.getByRole("button", { name: "Notebook " + notebook, exact: true }).click(); await A.wait(2500);
  check("the list has no menu", await noMenu());
  check("it has the sync and sort buttons and the one to manage the notebook",
    await bar("Sync").count() === 1 && await bar(/^Sorted by /).count() === 1 && await bar("Manage Notebook").count() === 1);
  const sort = bar(/^Sorted by /);
  const firstOrder = await order();
  const firstTitle = await sort.getAttribute("aria-label");
  await sort.click(); await A.wait(1500);
  const secondOrder = await order();
  check("the sort button switches the order", (await sort.getAttribute("aria-label")) !== firstTitle &&
    JSON.stringify(secondOrder) === JSON.stringify([...firstOrder].reverse()), [firstTitle, firstOrder, secondOrder]);
  const byName = (await sort.getAttribute("aria-label")).startsWith("Sorted by name") ? secondOrder : firstOrder;
  check("by name: alphabetical", JSON.stringify(byName) === JSON.stringify(["Apple " + n, "Zebra " + n]), byName);
  await sort.hover(); await A.wait(1200);
  check("the buttons say what they do when hovered", await A.p.getByText(/^Sorted by /).locator("visible=true").count() > 0);

  // Managing the notebook
  await bar("Manage Notebook").click(); await A.wait(2000);
  check("manage notebook: no menu, edit and members buttons", await noMenu() && await bar("Edit").count() === 1 && await bar("Members").count() === 1);
  await bar("Members").click(); await A.wait(2000);
  check("members opens the members", path() === "/notebook/ID/members", path());
  await A.back();
  await bar("Edit").click(); await A.wait(2000);
  check("edit opens the notebook's form", path() === "/notebook/ID/edit", path());
  await A.back(); await A.back();

  // A note
  await A.open("Apple " + n);
  check("a note has no menu", await noMenu());
  for (const name of ["View mode", "Save", "Delete"]) {
    check(`it has the ${name} button`, await bar(name).count() === 1);
  }
  check("but none for the properties or to move it, which are in the note itself", await bar("Edit Properties").count() === 0 && await bar("Move").count() === 0);
  check("save is off while there's nothing to save", await bar("Save").isDisabled());
  await (await A.editor()).fill("added first, changed"); await A.wait(300);
  check("and on once the note was changed", !(await bar("Save").isDisabled()));
  await bar("Save").click(); await A.wait(5000);
  const saved = await api.noteContent(notebook, "Apple " + n);
  check("save saves it to the server", saved === "added first, changed", saved);
  await bar("Delete").click(); await A.wait(1000);
  await A.p.getByRole("button", { name: /^ok$/i }).locator("visible=true").last().click(); await A.wait(5000);
  check("delete deletes the note", (await api.noteNames()).includes("DELETED:Apple " + n), (await api.noteNames()).filter((x) => x.endsWith("Apple " + n)));
  check("and goes back to the list", path() === "/", path());

  // Narrow screens too (the note is opened by its address, as the list is long)
  await A.p.locator(`[data-testid="notes-column"] a[href*="/note/"] [aria-label="Zebra ${n}"] >> visible=true`).first().click(); await A.wait(2000);
  const zebra = new URL(A.p.url()).pathname;
  const narrow = await session(b, "narrow");
  await narrow.login();
  await narrow.p.goto(config.appUrl + zebra); await narrow.wait(6000);
  check("a narrow screen has the buttons in the bar too, without a menu", await narrow.p.getByRole("button", { name: "Menu", exact: true }).locator("visible=true").count() === 0 &&
    await narrow.p.getByRole("button", { name: "Delete", exact: true }).locator("visible=true").count() === 1);
  await b.close();
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
