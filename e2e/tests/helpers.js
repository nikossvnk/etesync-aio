// Checks that the helpers really fail when a note doesn't open in the viewer or doesn't show its content
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const name = "Helpers check " + unique();
  await api.addNote("My Notes", name, "the content of the note");
  const b = await launch(); const A = await session(b, "A");
  await A.login();
  await A.open(name);
  check("a saved note shows its text in the viewer", (await A.viewerText()).includes("the content of the note"));
  check("noteText reads the note", (await A.noteText()) === "the content of the note");

  // The viewer shows nothing
  await A.p.evaluate(() => { document.querySelector('[data-testid="note-viewer"]').innerHTML = ""; });
  let error = await A.noteText().then(() => null, (e) => e.message);
  check("noteText fails when the viewer shows nothing", !!error && error.includes("the viewer showed"), error);

  // A saved note is open in the editor
  await A.back(); await A.open(name);
  await A.btn(/^view mode$/i).click(); await A.wait(800);
  error = await A.editor().then(() => null, (e) => e.message);
  check("editor fails when a saved note is in the editor", !!error && error.includes("opened in the editor"), error);
  error = await A.viewerText().then(() => null, (e) => e.message);
  check("viewerText fails when there's no viewer", !!error && error.includes("did not open in the viewer"), error);
  await A.btn(/^view mode$/i).click(); await A.wait(500);
  await b.close();
});
