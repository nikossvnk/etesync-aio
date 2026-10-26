// Saved notes open in the viewer (showing their text), new empty notes in the editor
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  await api.addNote("My Notes", "View A " + n, "first saved note");
  await api.addNote("My Notes", "View B " + n, "second saved note");
  const long = "Long" + "x".repeat(600) + "End";
  await api.addNote("My Notes", "View long " + n, "before " + long + " after\n\n- in a list " + long);
  const b = await launch();
  const A = await session(b, "A");
  await A.login();
  // VIEW only when the viewer shows the note's text, EDIT when the editor is shown
  const mode = async () => {
    if (await A.p.locator("textarea >> visible=true").count() > 0) return "EDIT";
    return (await A.viewerText()).trim() ? "VIEW" : "NOTHING SHOWN";
  };
  await A.open("View A " + n);
  check("a saved note opens in the viewer", (await mode()) === "VIEW");
  check("showing its text", (await A.viewerText()).includes("first saved note"));
  await A.btn(/^view mode$/i).click(); await A.wait(1000);
  check("it can be switched to the editor", (await mode()) === "EDIT");
  await A.back(); await A.open("View A " + n);
  check("reopened after using the editor, it's in the viewer again", (await mode()) === "VIEW");
  await A.back(); await A.open("View B " + n);
  check("another saved note opens in the viewer too", (await mode()) === "VIEW" && (await A.viewerText()).includes("second saved note"));
  await A.back();

  // A word longer than the line is broken, rather than making the note wider than the window
  await A.open("View long " + n);
  check("a note with a very long word opens in the viewer", (await mode()) === "VIEW" && (await A.viewerText()).includes(long.slice(0, 50)));
  const widths = await A.p.evaluate(() => {
    const viewer = document.querySelector("[data-testid=note-viewer]");
    return { page: document.documentElement.scrollWidth, window: window.innerWidth, viewer: viewer.getBoundingClientRect().right, viewerScroll: viewer.scrollWidth, viewerWidth: viewer.clientWidth };
  });
  check("and it stays within the window", widths.page <= widths.window && widths.viewer <= widths.window && widths.viewerScroll <= widths.viewerWidth, widths);
  await A.back();
  await A.createNote("View new " + n);
  check("a new (empty) note opens in the editor", (await mode()) === "EDIT");
  await A.back();

  // Settings saved by older versions, with the old default "Last used", are changed to the viewer
  const key = await A.p.evaluate(() => Object.keys(localStorage).find((k) => k.includes("settings")));
  await A.p.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    const vs = JSON.parse(s.viewSettings); vs.defaultViewMode = "last"; vs.lastViewMode = false; s.viewSettings = JSON.stringify(vs);
    s._persist = JSON.stringify({ version: 1, rehydrated: true });
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await A.p.reload(); await A.wait(7000);
  const after = await A.p.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    return { defaultViewMode: JSON.parse(s.viewSettings).defaultViewMode, version: JSON.parse(s._persist).version };
  }, key);
  check("old settings with \"Last used\" are migrated to the viewer", after.defaultViewMode === "viewer" && after.version === 3, after);
  await A.open("View A " + n);
  check("and saved notes open in the viewer", (await mode()) === "VIEW");
  await b.close();
});
