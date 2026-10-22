// Coming back to the app (its window or tab shown again) syncs, so what changed elsewhere in the
// meantime is there without pressing sync. On wide screens, where the notes column has the sync.
const { launch, session, run, check, unique, api } = require("../lib");

// Hides the page or shows it again, the way the browser does when the window is minimised or another
// tab is chosen
const setVisible = (p, visible) => p.evaluate((visible) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (visible) ? "visible" : "hidden" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => !visible });
  document.dispatchEvent(new Event("visibilitychange"));
}, visible);

run(async () => {
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, wait } = A;
  await A.login();
  const n = unique();
  const name = `Written elsewhere ${n}`;

  await setVisible(p, false); await wait(3000);
  await api.addNote("My Notes", name, "While the app was in the background");
  check("the note isn't there while the app is hidden", !(await A.has(name)));

  await setVisible(p, true); await wait(6000);
  check("coming back syncs, and the note is listed", await A.has(name), (await A.text()).slice(0, 400));
  await A.open(name);
  check("and it opens with its text", (await A.viewerText()).includes("While the app was in the background"), await A.text());

  await b.close();
});
