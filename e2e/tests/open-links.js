// Links in the installed app, whose window is in a browser profile of its own: the local server opens
// links to other sites (and email and phone links) in the default browser (serve.js, like
// desktop/serve.py with --open-links, writes them down), from notes and from bookmarks, with the left
// and the middle button, and the window doesn't open them itself, nor contact their sites. The app's
// own links still work in the window. It uses an account of its own.
const { launch, session, run, check, config, Etebase, newAccount, waitFor, unique } = require("../lib");

run(async () => {
  const n = unique();
  const account = await newAccount("links");
  const colMgr = account.etebase.getCollectionManager();
  const notes = await colMgr.create("etebase.md.note", { name: "My Notes", mtime: Date.now() }, "");
  await colMgr.upload(notes);
  const noteItems = colMgr.getItemManager(notes);
  const noteName = `Links ${n}`;
  await noteItems.batch([await noteItems.create({ name: noteName, mtime: Date.now() },
    `Read [the article](https://news.example.org/article-${n}) or write to [the author](mailto:author-${n}@example.org).`)]);
  const marks = await colMgr.create("etebase.bookmark", { name: "Bookmarks", mtime: Date.now() }, "");
  await colMgr.upload(marks);
  const markItems = colMgr.getItemManager(marks);
  const markUrl = `https://bookmarked.example.org/page-${n}`;
  await markItems.batch([await markItems.create({ name: `Bookmarked ${n}`, mtime: Date.now(), url: markUrl, tags: [], created: Date.now() }, markUrl)]);

  const opened = async () => (await (await fetch(config.appUrl + "/opened-links")).json()).filter((x) => x.includes(n));
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, ctx, wait } = A;
  // What the window asks for of other sites (none of these may be asked for)
  const contacted = [];
  ctx.on("request", (r) => {
    if (r.url().includes("example.org")) {
      contacted.push(r.url());
    }
  });
  await A.login(account, 9000);

  // A link in a note (opened by the app, with Linking.openURL)
  await A.open(noteName); await wait(1500);
  await p.getByText("the article", { exact: true }).locator("visible=true").first().click(); await wait(1000);
  check("a link in a note is handed to the server, to open it in the default browser",
    await waitFor(async () => (await opened()).includes(`https://news.example.org/article-${n}`), 10), await opened());
  await p.getByText("the author", { exact: true }).locator("visible=true").first().click(); await wait(1000);
  check("and so is an email link", await waitFor(async () => (await opened()).includes(`mailto:author-${n}@example.org`), 10), await opened());

  // A bookmark's links (links of the page, which are clicked), with the left and the middle button
  await p.goto(config.appUrl + "/bookmarks"); await wait(4000);
  const list = p.locator('[data-testid="bookmark-list"] >> visible=true');
  await list.locator(`[aria-label="Open Bookmarked ${n}"]`).click(); await wait(1000);
  check("a bookmark's open button hands its link to the server", await waitFor(async () => (await opened()).filter((x) => x === markUrl).length === 1, 10), await opened());
  await list.locator(`[aria-label="Open Bookmarked ${n}"]`).click({ button: "middle" }); await wait(1000);
  check("and so does the middle button", await waitFor(async () => (await opened()).filter((x) => x === markUrl).length === 2, 10), await opened());
  await list.getByRole("button", { name: `Bookmark Bookmarked ${n}` }).click(); await wait(800);
  const panel = p.locator('[data-testid="bookmark-panel"] >> visible=true');
  await panel.locator(`[aria-label="Open"]`).click(); await wait(1000);
  check("and the panel's open button", await waitFor(async () => (await opened()).filter((x) => x === markUrl).length === 3, 10), await opened());

  check("the window opened none of them itself", ctx.pages().length === 1, ctx.pages().map((x) => x.url()));
  check("nor asked their sites for anything", contacted.length === 0, contacted);
  check("nothing else was handed to the server", (await opened()).length === 5, await opened());

  // The app's own links still open in the window
  await p.goto(config.appUrl + "/"); await wait(3000);
  await A.open(noteName); await wait(1500);
  check("the app's own links still work in the window", (await A.viewerText()).includes("Read the article") && /\/note\//.test(p.url()), p.url());
  await b.close();
  await account.etebase.logout().catch(() => undefined);
});
