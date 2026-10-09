// Clicking a note opens it in the editor (but not selecting its text, or ticking a checkbox), and
// the editor's bar formats the Markdown around the selection
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  const name = "Formatting " + n;
  await api.addNote("My Notes", name, "make this bold\nsecond line\n- [ ] a task");
  const b = await launch();
  for (const [tag, viewport] of [["narrow", undefined], ["wide", { width: 1280, height: 800 }]]) {
    const A = await session(b, tag, viewport);
    await A.login();
    const textarea = A.p.locator('textarea[aria-label="Content"] >> visible=true');
    const inEditor = async () => (await textarea.count()) > 0;
    const server = () => api.noteContent("My Notes", name);
    // Selects text in the editor, as from..to, and returns what's selected after a formatting button
    const select = (from, to) => textarea.evaluate((el, [a, b]) => { el.focus(); el.setSelectionRange(a, b); }, [from, to]);
    const selected = () => textarea.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));
    const press = async (label) => { await A.p.getByRole("button", { name: label, exact: true }).locator("visible=true").first().click(); await A.wait(400); };

    await A.open(name);
    check(`${tag}: the note opens in the viewer`, (await A.viewerText()).includes("make this bold") && !(await inEditor()));

    // Selecting text doesn't open the editor
    const paragraph = A.p.locator('[data-testid="note-viewer"] >> text=second line').first();
    await paragraph.selectText(); await A.wait(300);
    await paragraph.click({ clickCount: 3 }); await A.wait(800);
    check(`${tag}: selecting text stays in the viewer`, !(await inEditor()));

    // Neither does ticking a checkbox, which changes the note
    const checkbox = A.p.locator('[data-testid="note-viewer"] [role="checkbox"] >> visible=true').first();
    await checkbox.click(); await A.wait(1500);
    check(`${tag}: ticking a checkbox stays in the viewer`, !(await inEditor()));
    check(`${tag}: and ticks it`, (await checkbox.getAttribute("aria-checked")) === "true");

    // A click does
    await A.p.evaluate(() => window.getSelection()?.removeAllRanges());
    await A.p.locator('[data-testid="note-viewer"] >> text=make this bold').first().click(); await A.wait(1500);
    check(`${tag}: clicking the note opens the editor`, await inEditor());
    check(`${tag}: with the formatting bar`, await A.p.getByRole("toolbar", { name: "Formatting" }).locator("visible=true").count() === 1);
    check(`${tag}: and the cursor in the note`, await A.p.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Content");

    // Bold around the selection, and off again
    const start = "make ".length;
    await select(start, start + "this".length);
    await press("Bold");
    check(`${tag}: bold puts ** around the selection`, (await textarea.inputValue()).startsWith("make **this** bold") && (await selected()) === "this");
    await press("Bold");
    check(`${tag}: pressed again it takes them away`, (await textarea.inputValue()).startsWith("make this bold"));
    await press("Italic");
    check(`${tag}: italic puts _ around it`, (await textarea.inputValue()).startsWith("make _this_ bold"));

    // Lines: a checklist, a heading
    const second = (await textarea.inputValue()).indexOf("second line");
    await select(second + 3, second + 3);
    await press("Checklist");
    check(`${tag}: checklist makes the line a task`, (await textarea.inputValue()).includes("\n- [ ] second line\n"));
    await select(0, 0);
    await press("Heading");
    check(`${tag}: heading makes the line a heading`, (await textarea.inputValue()).startsWith("# make _this_ bold"));

    // Shown formatted in the viewer
    await A.btn(/^view mode$/i).click(); await A.wait(1000);
    check(`${tag}: the viewer shows the heading and the tasks`, await A.p.locator('[data-testid="note-viewer"] [role="checkbox"] >> visible=true').count() === 2 &&
      (await A.viewerText()).includes("make this bold"));

    // Leaving the note uploads it
    await A.back(); await A.wait(6000);
    const saved = await server();
    check(`${tag}: the ticked task and the formatting are saved to the server`, saved === "# make _this_ bold\n- [ ] second line\n- [x] a task", JSON.stringify(saved));

    // Back to how it was for the other layout
    await api.setNoteContent("My Notes", name, "make this bold\nsecond line\n- [ ] a task");
    await A.ctx.close();
  }
  await b.close();
});
