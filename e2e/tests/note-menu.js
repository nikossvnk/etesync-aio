// The right-click menu of the notes column (wide screens): moving notes to another notebook and
// deleting them, one note or the selected ones, and moving the open note with what was just typed in
// it. It uses an account of its own.
const { launch, session, run, check, api, unique, config, waitFor, Etebase } = require("../lib");

run(async () => {
  const n = unique();
  config.username = `menu-${n}`;
  config.password = "note-menu-tester-password";
  await (await Etebase.Account.signup({ username: config.username, email: `${config.username}@example.invalid` }, config.password, config.serverUrl)).logout();
  const work = `Work ${n}`;
  const [alpha, beta, gamma, delta, epsilon] = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((x) => `${x} ${n}`);
  for (const name of [alpha, beta, gamma, delta, epsilon]) {
    await api.addNote("My Notes", name, "content of " + name);
  }
  await api.addNote(work, `Already at work ${n}`, "was there");
  const etebase = await api.login();
  const workUid = (await api.notebook(etebase, work)).uid;
  await etebase.logout();

  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  await A.login();
  const row = (name) => A.p.locator(`[data-testid="notes-column"] a[href*="/note/"] [aria-label="${name}"] >> visible=true`).first();
  const item = (name) => A.p.getByRole("menuitem", { name, exact: true }).locator("visible=true");
  // The names of the notes of a notebook on the server, without the deleted ones
  const names = async (notebook) => {
    const e = await api.login();
    const ret = (await api.items(e, await api.notebook(e, notebook))).filter((x) => !x.isDeleted).map((x) => x.getMeta().name).sort();
    await e.logout();
    return ret;
  };
  const moveTo = async (name, notebook) => {
    await row(name).click({ button: "right" }); await A.wait(500);
    await item("Move to…").click(); await A.wait(300);
    await item(`Move to ${notebook}`).click(); await A.wait(1500);
  };

  // Moving a note
  await A.p.evaluate(() => window.addEventListener("contextmenu", (e) => { window.browserMenu = !e.defaultPrevented; }));
  await row(alpha).click({ button: "right" }); await A.wait(500);
  check("a right click on a note opens its menu, with Move and Delete", await item("Move to…").count() === 1 && await item("Delete").count() === 1);
  check("and not the browser's", await A.p.evaluate(() => window.browserMenu) === false);
  await item("Move to…").click(); await A.wait(300);
  check("Move lists the other notebooks", await item(`Move to ${work}`).count() === 1 && await item("Move to My Notes").count() === 0);
  await item(`Move to ${work}`).click(); await A.wait(1500);
  check("it says where the note went", (await A.text()).includes(`Moved the note to ${work}`), await A.text());
  check("the note is in the other notebook on the server, with its content", await waitFor(async () =>
    (await api.noteContent(work, alpha)) === "content of " + alpha && !(await names("My Notes")).includes(alpha)), [await names(work), await names("My Notes")]);

  // Deleting one
  await row(beta).click({ button: "right" }); await A.wait(500);
  await item("Delete").click(); await A.wait(500);
  await A.btn(/^ok$/i).click(); await A.wait(1500);
  check("Delete (after asking) deletes the note on the server", await waitFor(async () => (await api.noteNames()).includes(`DELETED:${beta}`) &&
    !(await names("My Notes")).includes(beta)), await api.noteNames());
  check("and it leaves the list", await row(beta).count() === 0);

  // The open note, with what was typed in it a moment ago (not saved yet)
  await row(gamma).click(); await A.wait(2500);
  await (await A.editor()).fill("typed just now"); await A.wait(100);
  await moveTo(gamma, work);
  check("the open note is moved with what was just typed", await waitFor(async () => (await api.noteContent(work, gamma)) === "typed just now"),
    await api.noteContent(work, gamma));
  check("once (not left in its notebook, no copy)", JSON.stringify(await names(work)) === JSON.stringify([`Already at work ${n}`, alpha, gamma].sort()) &&
    !(await names("My Notes")).includes(gamma), [await names(work), await names("My Notes")]);
  check("and it stays open, in its new notebook", A.p.url().includes(`/notebook/${workUid}/note/`) &&
    (await A.p.locator("textarea >> visible=true").first().inputValue()) === "typed just now", A.p.url());
  await A.wait(6000);
  check("which doesn't bring it back in the old one when the editor is left", !(await names("My Notes")).includes(gamma), await names("My Notes"));

  // The selected notes
  await A.p.goto(config.appUrl + "/"); await A.wait(5000);
  await row(delta).click({ modifiers: ["Control"] }); await A.wait(300);
  await row(epsilon).click({ modifiers: ["Control"] }); await A.wait(300);
  await row(delta).click({ button: "right" }); await A.wait(500);
  check("on a selected note, the menu is for all of the selected ones", await item("Delete 2 notes").count() === 1);
  await item("Move to…").click(); await A.wait(300);
  await item(`Move to ${work}`).click(); await A.wait(1500);
  check("it says how many were moved", (await A.text()).includes(`Moved 2 notes to ${work}`), await A.text());
  check("and both are in the other notebook on the server", await waitFor(async () => {
    const there = await names(work);
    return there.includes(delta) && there.includes(epsilon) && (await names("My Notes")).length === 0;
  }), [await names(work), await names("My Notes")]);
  check("with their content", (await api.noteContent(work, epsilon)) === "content of " + epsilon);
  await b.close();
});
