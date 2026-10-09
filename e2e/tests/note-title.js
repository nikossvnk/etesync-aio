// A note's title and notebook are changed in the note itself, above its content: the notebook (and
// the date) and under it the title. New notes open there right away.
const { launch, session, run, check, api, unique, config, Etebase } = require("../lib");

// The notes on the server, by notebook: { notebook: { name: content } }, without the deleted ones
async function serverNotes(notebooks) {
  const etebase = await api.login();
  const ret = {};
  for (const name of notebooks) {
    const col = await api.notebook(etebase, name);
    ret[name] = {};
    for (const item of await api.items(etebase, col)) {
      if (!item.isDeleted) {
        ret[name][item.getMeta().name] = await item.getContent(Etebase.OutputFormat.String);
      }
    }
  }
  await etebase.logout();
  return ret;
}

run(async () => {
  const b = await launch();
  for (const [tag, viewport] of [["narrow", undefined], ["wide", { width: 1280, height: 800 }]]) {
    const n = unique();
    const first = `Titles ${tag} ${n}`, second = `Other ${tag} ${n}`;
    await api.addNote(first, "Existing " + n, "an existing note");
    await api.addNote(second, "Placeholder " + n, "so that the notebook is there");
    const A = await session(b, tag, viewport);
    await A.login();
    const path = () => new URL(A.p.url()).pathname.replace(/[A-Za-z0-9_-]{32}/g, "ID");
    const title = A.p.locator('input[aria-label="Title"] >> visible=true');
    const notebookButton = A.p.getByRole("button", { name: /^Notebook: / }).locator("visible=true");
    const notes = () => serverNotes([first, second]);
    // The notebook is above the title, under the bar at the top
    const aboveTitle = async () => {
      const notebook = await A.p.locator('[aria-label^="Notebook: "] >> visible=true').first().boundingBox();
      const titleBox = await title.first().boundingBox();
      return notebook.y > 50 && notebook.y + notebook.height <= titleBox.y + 2;
    };

    // A new note opens right away, in the editor, with the cursor in the title
    await A.dismiss();
    await A.p.getByRole("button", { name: /^new( note)?$/i }).locator("visible=true").first().click(); await A.wait(2500);
    check(`${tag}: "new" opens the note itself`, path() === "/notebook/ID/note/ID", path());
    check(`${tag}: in the editor, with the title being typed in`, await title.count() === 1 && await A.vis("textarea").count() === 1 &&
      await A.p.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Title");
    check(`${tag}: the notebook can be chosen there`, await notebookButton.count() === 1);
    check(`${tag}: the notebook is above the title, in the note`, await aboveTitle());
    await A.chooseNotebook(first);
    check(`${tag}: choosing the notebook of the new note`, (await A.notebookOfNote()) === first, await A.notebookOfNote());
    await title.fill("Groceries " + n); await title.press("Enter"); await A.wait(300);
    check(`${tag}: enter in the title goes on to the content`, await A.p.evaluate(() => document.activeElement?.tagName) === "TEXTAREA");
    await A.p.keyboard.type("milk and bread"); await A.wait(5000);
    await A.back(); await A.wait(6000);
    let saved = await notes();
    check(`${tag}: the new note is saved with its title and content`, saved[first]["Groceries " + n] === "milk and bread", saved);

    // Without a title it's named after its first line
    await A.createNote(undefined, first);
    await (await A.editor()).fill("# Ideas for " + n + "\n\nmore text"); await A.wait(5000);
    await A.back(); await A.wait(6000);
    saved = await notes();
    check(`${tag}: a note without a title is named after its first line`, saved[first]["Ideas for " + n] === "# Ideas for " + n + "\n\nmore text", Object.keys(saved[first]));

    // View mode: the title and notebook are shown, but can't be changed
    await A.open("Existing " + n);
    check(`${tag}: in the viewer the title is shown above the note`, await A.p.getByRole("heading", { name: "Existing " + n, exact: true }).locator("visible=true").count() > 0 && await title.count() === 0);
    check(`${tag}: and the notebook is shown, but isn't a button`, (await A.notebookOfNote()) === first && await notebookButton.count() === 0);

    // Renaming a note in the editor
    await (await A.editor());
    check(`${tag}: in the editor the title can be changed`, (await title.inputValue()) === "Existing " + n);
    await title.fill("Renamed " + n); await A.wait(5000);
    await A.btn(/^view mode$/i).click(); await A.wait(1000);
    check(`${tag}: the new title is shown`, await A.p.getByText("Renamed " + n, { exact: true }).locator("visible=true").count() > 0);
    await A.back(); await A.wait(6000);
    saved = await notes();
    check(`${tag}: and saved, with the content as it was`, saved[first]["Renamed " + n] === "an existing note" && !("Existing " + n in saved[first]), Object.keys(saved[first]));

    // Moving it to another notebook
    await A.open("Renamed " + n);
    const before = new URL(A.p.url()).pathname;
    await (await A.editor());
    await A.vis("textarea").fill("an existing note, moved"); await A.wait(300);
    await A.chooseNotebook(second);
    check(`${tag}: choosing another notebook moves the note there`, (await A.notebookOfNote()) === second && new URL(A.p.url()).pathname !== before);
    check(`${tag}: and stays in the editor, with what was typed`, (await A.vis("textarea").inputValue()) === "an existing note, moved");
    await A.back(); await A.wait(6000);
    saved = await notes();
    check(`${tag}: on the server it's in the other notebook only, with the change`,
      saved[second]["Renamed " + n] === "an existing note, moved" && !("Renamed " + n in saved[first]), saved);

    // A new note moved before it got a title or content is still thrown away, and nothing is sent
    const count = (await api.noteNames()).length;
    await A.createNote(undefined, second);
    check(`${tag}: a new note can be put in another notebook right away`, (await A.notebookOfNote()) === second);
    await A.back(); await A.wait(5000);
    check(`${tag}: left empty it's thrown away, and nothing reached the server`, (await api.noteNames()).length === count);
    await A.ctx.close();
  }
  await b.close();
});
