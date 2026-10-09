// Exporting the notes from the settings: a zip with a folder for every notebook and a Markdown file
// for every note, which has to have the notes' content as it is on the server
const { launch, session, run, check, api, unique, config, Etebase } = require("../lib");
const fs = require("fs");
const { unzipSync, strFromU8 } = require("fflate");

// The notes on the server, by notebook: { notebook: [{ name, content }] }, without the deleted ones
async function serverNotes(notebooks) {
  const etebase = await api.login();
  const ret = {};
  for (const name of notebooks) {
    const col = await api.notebook(etebase, name);
    ret[name] = [];
    for (const item of await api.items(etebase, col)) {
      if (!item.isDeleted) {
        ret[name].push({ name: item.getMeta().name, content: await item.getContent(Etebase.OutputFormat.String) });
      }
    }
  }
  await etebase.logout();
  return ret;
}

run(async () => {
  const n = unique();
  const first = `Export ${n}`, second = `Export/other ${n}`;
  await api.addNote(first, "Plain " + n, "# Heading\n\nSome **bold** text, ünïcødé and an emoji 📝\n");
  await api.addNote(first, "Twice " + n, "the first one");
  await api.addNote(first, "Twice " + n, "the second one");
  await api.addNote(second, "What? A: note " + n, "a title with characters files can't have");
  await api.addNote(second, "Gone " + n, "deleted before the export");

  const b = await launch();
  const A = await session(b, "A");
  await A.login();

  // A note deleted in the app isn't exported
  await A.home(); await A.openNotebook(second);
  await A.open("Gone " + n);
  await A.btn(/^delete$/i).click(); await A.wait(800);
  await A.p.getByRole("button", { name: /^ok$/i }).locator("visible=true").last().click(); await A.wait(5000);
  check("the note was deleted on the server", (await api.noteNames()).includes("DELETED:Gone " + n));

  await A.p.goto(config.appUrl + "/settings"); await A.wait(6000);
  const [download] = await Promise.all([
    A.p.waitForEvent("download", { timeout: 30000 }),
    A.p.getByText("Export Notes", { exact: true }).locator("visible=true").first().click(),
  ]);
  check("the file is named after the app and the day", /^etesync-notes-\d{4}-\d{2}-\d{2}\.zip$/.test(download.suggestedFilename()), download.suggestedFilename());
  const zip = unzipSync(fs.readFileSync(await download.path()));
  const files = Object.keys(zip).filter((x) => !x.endsWith("/"));
  const read = (path) => (zip[path] ? strFromU8(zip[path]) : undefined);
  await A.wait(1000);
  const message = (await A.text()).match(/Exported (\d+) notes? to etesync-notes-[\d-]+\.zip/);
  check("it says how many notes were exported", message && Number(message[1]) === files.length, [message && message[0], files.length]);
  check("every file is a note in a notebook's folder", files.every((x) => /^[^/]+\/[^/]+\.md$/.test(x)), files.filter((x) => !/^[^/]+\/[^/]+\.md$/.test(x)));

  // The notes of the two notebooks, compared with what's on the server
  const server = await serverNotes([first, second]);
  const folder1 = `Export ${n}/`, folder2 = `Export_other ${n}/`;
  const plain = server[first].find((x) => x.name === "Plain " + n).content;
  check("a note is in its notebook's folder, with its content", read(folder1 + `Plain ${n}.md`) === plain, read(folder1 + `Plain ${n}.md`));
  const twice = [read(folder1 + `Twice ${n}.md`), read(folder1 + `Twice ${n} (2).md`)].sort();
  check("notes with the same title are both there", JSON.stringify(twice) === JSON.stringify(server[first].filter((x) => x.name === "Twice " + n).map((x) => x.content).sort()), twice);
  check("the first notebook has just these", files.filter((x) => x.startsWith(folder1)).length === 3, files.filter((x) => x.startsWith(folder1)));
  check("characters files can't have are replaced", read(folder2 + `What_ A_ note ${n}.md`) === "a title with characters files can't have", files.filter((x) => x.startsWith(folder2)));
  check("deleted notes aren't exported", files.filter((x) => x.startsWith(folder2)).length === 1 && server[second].length === 1, files.filter((x) => x.startsWith(folder2)));
  await b.close();
});
