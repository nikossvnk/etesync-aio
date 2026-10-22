// Notebooks on phones are made with the dialog of new collections (as everything else is) and edited
// in Settings → Collections: the colours offered, with their names, and the one chosen is the
// notebook's colour on the server. A new note without any notebook asks for one with the same
// dialog, and is then written in it (on the server). And the sync button of the notebook's notes
// syncs. It uses an account of its own (made for each run), which ends up without notebooks.
const { launch, session, run, check, unique, newAccount, collectionOf, waitFor, Etebase } = require("../lib");

const swatches = ["Blue", "Orange", "Green", "Purple", "Pink", "Yellow", "Teal", "Grey"];

// The notebooks on the server, by their name (not deleted)
async function notebooks(etebase) {
  const page = await etebase.getCollectionManager().list(["etebase.md.note"], { limit: 50 });
  return new Map(page.data.filter((x) => !x.isDeleted).map((x) => [x.getMeta().name, x]));
}

run(async () => {
  const n = unique();
  const account = await newAccount("aio-nb");
  const { etebase } = account;
  const b = await launch();
  const A = await session(b, "A");
  const { p, btn, vis, wait } = A;
  await A.login(account);
  await btn(/^finish$/i).click(); await wait(6000);
  await collectionOf(etebase, "etebase.md.note");
  const nb = `Colours ${n}`;
  const dialog = p.locator('[data-testid="new-collection"] >> visible=true');
  const colour = (name) => p.getByRole("radio", { name, exact: true }).locator("visible=true");

  // Made with the dialog
  await A.tab("Notebooks");
  await btn(/^new$/i).click(); await wait(1000);
  check("new opens the dialog of new collections, for a notebook", (await dialog.count() === 1) &&
    (await dialog.getByRole("radio", { name: "Notebook", exact: true }).getAttribute("aria-checked")) === "true");
  const offered = await dialog.getByRole("radiogroup", { name: "Colour" }).getByRole("radio").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check("the colours offered have their names", JSON.stringify(offered) === JSON.stringify(swatches), offered);
  await dialog.locator('input[aria-label="Name"]').fill(nb);
  await colour("Teal").click(); await wait(300);
  await dialog.getByRole("button", { name: "Create notebook", exact: true }).click(); await wait(3000);
  check("it's on the server, with that colour", await waitFor(async () => (await notebooks(etebase)).get(nb)?.getMeta().color === "#5BC0C8"),
    Array.from((await notebooks(etebase)).keys()));
  check("and its notes are shown", await A.has(nb), (await A.text()).slice(0, 300));

  // Edited in the collections
  await A.editNotebook(nb);
  check("editing it shows its colour", await colour("Teal").getAttribute("aria-checked") === "true");
  await colour("Pink").click(); await wait(300);
  await btn(/^save changes$/i).click(); await wait(3000);
  check("and another one replaces it on the server", await waitFor(async () => (await notebooks(etebase)).get(nb)?.getMeta().color === "#E8838F"));

  // A note added elsewhere, which the sync button of the notebook's notes brings
  await A.home(); await A.openNotebook(nb);
  const col = (await notebooks(etebase)).get(nb);
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  await itemMgr.batch([await itemMgr.create({ name: `Added elsewhere ${n}`, mtime: Date.now() }, "From another device")]);
  check("the note isn't there before syncing", !(await A.has(`Added elsewhere ${n}`)));
  await A.sync();
  check("the sync button brings it", await A.has(`Added elsewhere ${n}`), await A.text());

  // Without notebooks, a new note asks for one
  await A.deleteNotebook(nb);
  check("deleted, it's not on the server", await waitFor(async () => !(await notebooks(etebase)).has(nb)));
  await A.deleteNotebook("My Notes");
  check("and no notebook is left", await waitFor(async () => (await notebooks(etebase)).size === 0));
  await A.tab("Notes");
  await btn(/^new$/i).click(); await wait(2000);
  check("a new note says it needs a notebook", await A.has("there has to be one first"), await A.text());
  await btn(/^create a notebook$/i).click(); await wait(1000);
  check("which is made with the same dialog", (await dialog.count() === 1) &&
    (await dialog.getByRole("radio", { name: "Notebook", exact: true }).getAttribute("aria-checked")) === "true");
  await dialog.locator('input[aria-label="Name"]').fill(`Journal ${n}`);
  await dialog.getByRole("button", { name: "Create notebook", exact: true }).click(); await wait(4000);
  check("then the new note opens, in the editor", await vis("textarea").count() === 1, await A.text());
  await (await A.editor()).fill(`First words ${n}`); await wait(3000);
  await A.back();
  let content;
  check("and it's saved in the new notebook on the server", await waitFor(async () => {
    const journal = (await notebooks(etebase)).get(`Journal ${n}`);
    if (!journal) {
      return false;
    }
    const items = (await etebase.getCollectionManager().getItemManager(journal).list({ limit: 50 })).data.filter((x) => !x.isDeleted);
    content = await Promise.all(items.map((x) => x.getContent(Etebase.OutputFormat.String)));
    return content.includes(`First words ${n}`);
  }), content);

  await b.close();
  await etebase.logout();
});
