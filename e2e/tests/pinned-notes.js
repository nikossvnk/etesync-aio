// Pinning notes: they're shown above the others, as cards, and the pin is in the note's metadata on
// the server ("pinned: true", and no "pinned" at all when unpinned, as in EteSync Notes). On phones
// (a long press and "Pin selected", the Pin button of a note, another device, pinning offline while
// the note is changed elsewhere) and on wide screens (the notes column, ctrl-click and "Pin selected",
// the pin of the note's bar, folding the pinned notes away). It uses an account of its own.
const { launch, session, run, check, api, unique, config, Etebase } = require("../lib");

run(async () => {
  const n = unique();
  config.username = `pin-${n}`;
  config.password = "pinned-notes-tester-password";
  await (await Etebase.Account.signup({ username: config.username, email: `${config.username}@example.invalid` }, config.password, config.serverUrl)).logout();
  // Named to come first in the list, which is sorted by name
  const [one, two, three, four] = ["Ab pin one " + n, "Ab pin two " + n, "Ab pin three " + n, "Ab pin four " + n];
  for (const name of [one, two, three, four]) {
    await api.addNote("My Notes", name, "content of " + name);
  }
  const mtimeBefore = (await api.noteMeta("My Notes", one)).mtime;
  const b = await launch();

  const A = await session(b, "A");
  await A.login();
  const pinnedCard = (s, name) => s.p.locator(`[data-testid="pinned-notes"] [aria-label="${name}"] >> visible=true`);
  const row = (name) => A.p.locator(`a[href*="/note/"] [aria-label="${name}"] >> visible=true`).first();
  const longPress = async (name) => {
    await row(name).scrollIntoViewIfNeeded();
    const box = await row(name).boundingBox();
    await A.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await A.p.mouse.down(); await A.wait(800); await A.p.mouse.up(); await A.wait(800);
  };

  // Pinning with a long press, from the list
  check("nothing is pinned yet", await pinnedCard(A, one).count() === 0);
  await longPress(one);
  await A.btn(/^pin selected$/i).click(); await A.wait(6000);
  const meta = await api.noteMeta("My Notes", one);
  check("pinning a note pins it on the server", meta?.pinned === true, meta);
  check("without changing when it was changed", meta?.mtime === mtimeBefore, [meta?.mtime, mtimeBefore]);
  check("and not the others", !(await api.noteMeta("My Notes", two)).pinned && !(await api.noteMeta("My Notes", three)).pinned);
  check("it's shown in the pinned notes, and not among the others",
    await pinnedCard(A, one).count() === 1 && await A.p.locator(`a[href*="/note/"] [aria-label="${one}"] >> visible=true`).count() === 1);
  check("the list has a pinned section and one for the others", /PINNED/.test(await A.text()) && /OTHER NOTES/.test(await A.text()), await A.text());
  await pinnedCard(A, one).first().click(); await A.wait(2500);
  check("its card opens the note", (await A.viewerText()).includes("content of " + one));

  // Pinning from the note itself
  await A.back();
  await A.open(two);
  await A.btn(/^pin note$/i).click(); await A.wait(6000);
  check("the pin button of a note pins it on the server", (await api.noteMeta("My Notes", two))?.pinned === true);
  const unpin = A.p.getByRole("button", { name: /^unpin note$/i }).locator("visible=true");
  check("then it's an unpin button, shown as pressed", (await unpin.count() === 1) && ((await unpin.first().getAttribute("aria-pressed")) === "true"));
  await A.back();
  check("and it's shown in the pinned notes", await pinnedCard(A, two).count() === 1);

  // Another device gets the pins
  const B = await session(b, "B");
  await B.login();
  check("another device shows both of them as pinned", await pinnedCard(B, one).count() === 1 && await pinnedCard(B, two).count() === 1);
  await pinnedCard(B, two).first().click(); await B.wait(2500);
  check("and they open there", (await B.viewerText()).includes("content of " + two));
  await B.btn(/^unpin note$/i).click(); await B.wait(6000);
  const metaTwo = await api.noteMeta("My Notes", two);
  check("unpinning a note unpins it on the server (without a \"pinned\" key)", metaTwo && !("pinned" in metaTwo), metaTwo);
  await B.back();
  check("and it's not shown as pinned anymore", await pinnedCard(B, two).count() === 0);
  await B.ctx.close();

  // Pinned on a device that's offline while the note is changed elsewhere: both are kept, without a conflict copy
  await A.ctx.setOffline(true); await A.wait(1000);
  await longPress(three);
  await A.btn(/^pin selected$/i).click(); await A.wait(1500);
  await api.setNoteContent("My Notes", three, "changed elsewhere");
  await A.ctx.setOffline(false); await A.wait(4000);
  await A.sync(); await A.sync();
  check("the note pinned offline is pinned on the server", (await api.noteMeta("My Notes", three))?.pinned === true, await api.noteMeta("My Notes", three));
  check("with the content from elsewhere", (await api.noteContent("My Notes", three)) === "changed elsewhere");
  check("and no conflict copy was made", !(await api.noteNames()).some((x) => x.includes(three + " (conflict copy)")));
  await pinnedCard(A, three).first().click(); await A.wait(2500);
  check("it opens with the content from elsewhere", (await A.noteText()) === "changed elsewhere");
  await A.ctx.close();

  // Wide screens: the pinned notes are cards at the top of the notes column
  const W = await session(b, "W", { width: 1440, height: 900 });
  await W.login();
  const column = W.p.locator('[data-testid="notes-column"] >> visible=true');
  const card = (name) => column.locator(`[data-testid="pinned-notes"] [aria-label="${name}"]`);
  const columnRow = (name) => column.locator(`a [aria-label="${name}"]`);
  check("the notes column has the pinned notes as cards", (await card(one).count() === 1) && (await card(three).count() === 1) && (await card(two).count() === 0));
  check("with the notebook on them", (await card(one).innerText()).includes("My Notes"));
  check("and the others under \"Other notes\"", /OTHER NOTES\s*2/.test(await column.innerText()) && (await columnRow(two).count() === 1), await column.innerText());
  await card(one).click(); await W.wait(2500);
  check("a card opens its note next to the column", (await W.viewerText()).includes("content of " + one));
  check("and is shown as the open one", (await card(one).getAttribute("aria-selected")) === "true");
  const pinButton = W.p.getByRole("button", { name: "Unpin note", exact: true }).locator("visible=true");
  check("the bar of a pinned note has the pin, pressed", (await pinButton.count() === 1) && ((await pinButton.first().getAttribute("aria-pressed")) === "true"));
  await pinButton.first().click(); await W.wait(5000);
  const metaOne = await api.noteMeta("My Notes", one);
  check("which unpins it on the server", metaOne && !("pinned" in metaOne) && (metaOne.mtime === mtimeBefore), metaOne);
  check("and it's a row again", (await card(one).count() === 0) && (await columnRow(one).count() === 1));
  check("the button is \"Pin note\" again, not pressed", (await W.p.getByRole("button", { name: "Pin note", exact: true }).locator("visible=true").first().getAttribute("aria-pressed")) === "false");

  // Several at once, with ctrl-click
  await columnRow(two).click({ modifiers: ["Control"] }); await W.wait(300);
  await columnRow(four).click({ modifiers: ["Control"] }); await W.wait(500);
  check("ctrl-clicking selects them (with the open note)", (await column.innerText()).includes("3 selected"), await column.innerText());
  await W.btn(/^pin selected$/i).click(); await W.wait(5000);
  check("\"Pin selected\" pins them all on the server", await (async () => {
    const metas = await Promise.all([one, two, four].map((x) => api.noteMeta("My Notes", x)));
    return metas.every((x) => x?.pinned === true);
  })());
  await card(three).click({ modifiers: ["Control"] }); await W.wait(300);
  await card(two).click({ modifiers: ["Control"] }); await W.wait(500);
  // (the open note is in the selection too: three, two and the open one, which are all pinned)
  check("when all of the selected ones are pinned it's \"Unpin selected\"", await W.btn(/^unpin selected$/i).count() === 1);
  await W.btn(/^unpin selected$/i).click(); await W.wait(5000);
  check("which unpins them on the server", await (async () => {
    const metas = await Promise.all([one, two, three].map((x) => api.noteMeta("My Notes", x)));
    return metas.every((x) => x && !("pinned" in x)) && ((await api.noteMeta("My Notes", four))?.pinned === true);
  })());
  check("an odd number of cards: the last one is as wide as two, with the beginning of the note", await (async () => {
    const cards = column.locator('[data-testid="pinned-notes"] a');
    const width = (await column.locator('[data-testid="pinned-notes"]').boundingBox()).width;
    return (await cards.count() === 1) && ((await cards.first().boundingBox()).width > width * 0.9) && (await cards.first().innerText()).includes("content of " + four);
  })(), await column.locator('[data-testid="pinned-notes"]').innerText().catch(() => ""));

  // Folding the pinned notes away
  await column.getByRole("button", { name: /^Pinned, \d+$/ }).click(); await W.wait(500);
  check("the pinned notes can be folded away", (await column.locator('[data-testid="pinned-notes"]').count() === 0) &&
    ((await column.getByRole("button", { name: /^Pinned, \d+$/ }).getAttribute("aria-expanded")) === "false"));
  await W.p.reload(); await W.wait(6000);
  check("and stay folded after a reload", await column.locator('[data-testid="pinned-notes"]').count() === 0);
  await column.getByRole("button", { name: /^Pinned, \d+$/ }).click(); await W.wait(500);
  check("and come back", await column.locator('[data-testid="pinned-notes"]').count() === 1);

  await W.ctx.close();

  await b.close();
});
