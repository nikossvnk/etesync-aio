// Importing notes from the settings: a zip with a folder for every notebook and a Markdown file for
// every note (as the export makes it). The notes have to be on the server, in their notebooks.
const { launch, session, run, check, api, unique, config, Etebase } = require("../lib");
const { zipSync, strToU8 } = require("fflate");

// The notes of a notebook on the server, by name (without the deleted ones), or undefined without it
async function serverNotes(notebook) {
  const etebase = await api.login();
  const col = (await api.notebooks(etebase)).find((x) => !x.isDeleted && x.getMeta().name === notebook);
  let ret;
  if (col) {
    ret = {};
    for (const item of await api.items(etebase, col)) {
      if (!item.isDeleted) {
        ret[item.getMeta().name] = await item.getContent(Etebase.OutputFormat.String);
      }
    }
  }
  await etebase.logout();
  return ret;
}

run(async () => {
  const n = unique();
  const first = `Import ${n}`, second = `Import other ${n}`;
  await api.addNote("My Notes", "Already here " + n, "an existing note");
  const zip = Buffer.from(zipSync({
    [first]: {
      [`One ${n}.md`]: strToU8("# One\n\nThe **first** imported note"),
      [`Two ${n}.md`]: strToU8("﻿second, with a byte order mark"),
      "not a note.txt": strToU8("left out"),
    },
    [second]: {
      [`Three ${n}.md`]: strToU8("- [ ] a task"),
    },
    "My Notes": {
      [`Into existing ${n}.md`]: strToU8("into a notebook that's there"),
    },
    [`Loose ${n}.md`]: strToU8("not in a folder"),
    "__MACOSX": { [first]: { [`._One ${n}.md`]: strToU8("junk") } },
  }));

  const b = await launch();
  const A = await session(b, "A");
  await A.login();
  const importZip = async () => {
    await A.p.goto(config.appUrl + "/settings"); await A.wait(5000);
    const [chooser] = await Promise.all([
      A.p.waitForEvent("filechooser", { timeout: 15000 }),
      A.p.getByText("Import Notes", { exact: true }).locator("visible=true").first().click(),
    ]);
    await chooser.setFiles({ name: "notes.zip", mimeType: "application/zip", buffer: zip });
    await A.wait(3000);
    return ((await A.p.innerText("body")).match(/Imported \d+ notes?[^\n]*/) || [""])[0];
  };

  const message = await importZip();
  check("it says how many notes were imported", /^Imported 5 notes, (2|3) new notebooks/.test(message), message);
  // (the import uploads them by itself)
  await A.wait(8000);

  const one = await serverNotes(first);
  check("a folder becomes a notebook, with its notes", !!one && JSON.stringify(Object.keys(one).sort()) === JSON.stringify([`One ${n}`, `Two ${n}`]), one);
  check("named after their files, with their content", one?.[`One ${n}`] === "# One\n\nThe **first** imported note", one);
  check("without a byte order mark", one?.[`Two ${n}`] === "second, with a byte order mark", one);
  const other = await serverNotes(second);
  check("another folder is another notebook", JSON.stringify(other) === JSON.stringify({ [`Three ${n}`]: "- [ ] a task" }), other);
  const mine = await serverNotes("My Notes");
  check("notes go into a notebook that's there already", mine?.[`Into existing ${n}`] === "into a notebook that's there" && mine?.["Already here " + n] === "an existing note");
  const loose = await serverNotes("Imported");
  check("files that aren't in a folder go into \"Imported\"", loose?.[`Loose ${n}`] === "not in a folder", loose && Object.keys(loose));
  check("other files are left out", !Object.keys({ ...one, ...other, ...mine, ...loose }).some((x) => x.includes("not a note") || x.startsWith("._")));

  // Importing it again doesn't add them twice
  const again = await importZip();
  check("imported again: nothing new, it says they're there", again === "Imported 0 notes, 5 already there", again);
  await A.wait(6000);
  check("and the notebooks have them once", Object.keys(await serverNotes(first)).length === 2 && Object.keys(await serverNotes(second)).length === 1);

  // The app shows them
  await A.p.goto(config.appUrl + "/"); await A.wait(6000);
  await A.open(`One ${n}`);
  check("an imported note opens and shows its text", (await A.viewerText()).includes("The first imported note"));
  await b.close();
});
