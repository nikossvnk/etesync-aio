// Selecting notes to delete several at once: with a long press on phones (then a press selects
// more), and with ctrl and a click next to the sidebar
const { launch, session, run, check, api, unique } = require("../lib");

// The notes on the server with the name, "DELETED:" in front of the deleted ones
const onServer = async (name) => (await api.noteNames()).filter((x) => x.endsWith(name));

run(async () => {
  const n = unique();
  // Named to come first in the list, which is sorted by name
  const names = ["Aa one " + n, "Aa two " + n, "Aa three " + n, "Aa four " + n];
  for (const name of names) {
    await api.addNote("My Notes", name, "to select " + name);
  }
  const b = await launch();

  // Phones: a long press selects
  const A = await session(b, "narrow");
  await A.login();
  const row = (name) => A.p.locator(`a[href*="/note/"] [aria-label="${name}"] >> visible=true`).first();
  const selected = async (name) => (await row(name).getAttribute("aria-selected")) === "true";
  const longPress = async (name) => {
    await row(name).scrollIntoViewIfNeeded(); await A.wait(300);
    const box = await row(name).boundingBox();
    await A.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await A.p.mouse.down(); await A.wait(800); await A.p.mouse.up(); await A.wait(800);
  };
  const path = () => new URL(A.p.url()).pathname;

  await longPress(names[0]);
  check("narrow: a long press selects a note, without opening it", await selected(names[0]) && path() === "/", path());
  check("narrow: the bar says how many are selected", await A.has("1 selected"));
  await row(names[1]).click(); await A.wait(800);
  check("narrow: then a press selects another one", await selected(names[1]) && path() === "/" && await A.has("2 selected"));
  await row(names[1]).click(); await A.wait(800);
  check("narrow: and pressed again it's not selected", !(await selected(names[1])) && await A.has("1 selected"));
  await A.btn(/^clear selection$/i).click(); await A.wait(800);
  check("narrow: clearing the selection selects none", !(await selected(names[0])) && !(await A.has("selected")));
  await row(names[1]).click(); await A.wait(2500);
  check("narrow: then a press opens the note again", path().includes("/note/") && (await A.viewerText()).includes("to select " + names[1]));
  await A.back();

  // Deleting two of them
  await longPress(names[0]);
  await row(names[1]).click(); await A.wait(800);
  await A.btn(/^delete selected$/i).click(); await A.wait(800);
  await A.p.getByRole("button", { name: /^ok$/i }).locator("visible=true").last().click(); await A.wait(6000);
  check("narrow: deleting the selected notes deletes them on the server",
    JSON.stringify(await onServer(names[0])) === JSON.stringify(["DELETED:" + names[0]]) &&
    JSON.stringify(await onServer(names[1])) === JSON.stringify(["DELETED:" + names[1]]), [await onServer(names[0]), await onServer(names[1])]);
  check("narrow: and not the others", JSON.stringify(await onServer(names[2])) === JSON.stringify([names[2]]));
  check("narrow: they're gone from the list, and none is selected", !(await A.has(names[0])) && !(await A.has(names[1])) && !(await A.has("selected")));
  await A.ctx.close();

  // Wide screens: ctrl and a click
  const W = await session(b, "wide", { width: 1280, height: 800 });
  await W.login();
  const column = W.p.locator('[data-testid="notes-column"] >> visible=true');
  const note = (name) => column.locator(`a[href*="/note/"] [aria-label="${name}"]`).first();
  const wSelected = async (name) => (await note(name).getAttribute("aria-selected")) === "true";
  await note(names[2]).click(); await W.wait(2500);
  check("wide: a click opens a note", (await W.viewerText()).includes("to select " + names[2]));
  await note(names[3]).click({ modifiers: ["Control"] }); await W.wait(800);
  check("wide: ctrl-click selects it and the open one", await wSelected(names[2]) && await wSelected(names[3]) && (await column.innerText()).includes("2 selected"));
  check("wide: without opening it (or a tab)", (await W.viewerText()).includes("to select " + names[2]) && W.ctx.pages().length === 1);
  await note(names[3]).click({ modifiers: ["Control"] }); await W.wait(800);
  check("wide: ctrl-click again takes it out", !(await wSelected(names[3])) && (await column.innerText()).includes("1 selected"));
  await note(names[3]).click({ modifiers: ["Control"] }); await W.wait(800);
  await W.p.keyboard.press("Escape"); await W.wait(800);
  check("wide: escape selects none", !(await column.innerText()).includes("selected") && !(await wSelected(names[3])));
  await note(names[3]).click({ modifiers: ["Control"] }); await W.wait(800);
  await note(names[3]).click(); await W.wait(2500);
  check("wide: a click without ctrl selects none and opens the note", !(await column.innerText()).includes(" selected") &&
    (await W.viewerText()).includes("to select " + names[3]));

  // Deleting the open note with another one goes back to no note open
  await note(names[2]).click({ modifiers: ["Control"] }); await W.wait(800);
  await W.btn(/^delete selected$/i).click(); await W.wait(800);
  await W.p.getByRole("button", { name: /^ok$/i }).locator("visible=true").last().click(); await W.wait(6000);
  check("wide: deleting them deletes them on the server",
    JSON.stringify(await onServer(names[2])) === JSON.stringify(["DELETED:" + names[2]]) &&
    JSON.stringify(await onServer(names[3])) === JSON.stringify(["DELETED:" + names[3]]), [await onServer(names[2]), await onServer(names[3])]);
  check("wide: and the open note was closed", (await W.p.getByText("No note open").locator("visible=true").count()) === 1);
  await b.close();
});
