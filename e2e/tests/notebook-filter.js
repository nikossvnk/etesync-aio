// The chips above the notes filter them by notebook, the choice is remembered, and new notes go into it
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  const other = "Filter " + n;
  await api.addNote("My Notes", "In my notes " + n, "x");
  await api.addNote(other, "In the other " + n, "y");
  const b = await launch();
  const A = await session(b, "A");
  await A.login();
  await A.p.setViewportSize({ width: 400, height: 800 }); await A.wait(1000);
  const chips = () => A.p.evaluate(() => [...document.querySelectorAll('[aria-label^="Filter: "]')].filter((e) => e.offsetParent).map((e) => e.getAttribute("aria-label").slice(8)));
  const chip = async (name) => { await A.p.getByLabel("Filter: " + name, { exact: true }).locator("visible=true").first().click(); await A.wait(1200); };
  const listed = async (name) => (await A.p.getByLabel(name, { exact: true }).locator("visible=true").count()) > 0;

  const all = await chips();
  check("there are chips for All and the notebooks", all[0] === "All" && all.includes("My Notes") && all.includes(other), all);
  check("All lists the notes of both notebooks", await listed("In my notes " + n) && await listed("In the other " + n));
  await chip(other);
  check("a notebook's chip lists only its notes", !(await listed("In my notes " + n)) && await listed("In the other " + n));
  await A.btn(/^new$/i).click(); await A.wait(2500);
  check("a new note is in the filtered notebook", (await A.notebookOfNote()) === other, await A.notebookOfNote());
  await A.back();
  await A.p.reload(); await A.wait(6000);
  check("the filter is remembered after a reload", !(await listed("In my notes " + n)) && await listed("In the other " + n));
  await chip(other);
  check("tapping the chip again shows all notes", await listed("In my notes " + n) && await listed("In the other " + n));
  await b.close();
});
