// Bookmarks on wide screens: the section of the sidebar with the bookmark lists, saving a link by
// pasting it (its title is read from the page only with "Get title"), copying a link, where it was saved from, the list (search, tags, several at once: moving,
// tagging, deleting), the panel to edit one, deleting with undo, importing a browser's bookmark file,
// exporting a list, and the bookmark lists in Settings → Collections and the New collection dialog.
// What's done is checked on the server. It uses an account of its own (made for each run).
const http = require("http");
const { launch, session, run, check, config, Etebase, unique, waitFor } = require("../lib");

const bookmarkType = "etebase.bookmark";

// The bookmark lists on the server, with their bookmarks (that aren't deleted, as their meta)
async function lists(etebase) {
  const colMgr = etebase.getCollectionManager();
  const ret = [];
  for (const col of (await colMgr.list(bookmarkType, { limit: 50 })).data) {
    if (col.isDeleted) {
      continue;
    }
    const bookmarks = [];
    for (const item of (await colMgr.getItemManager(col).list({ limit: 200 })).data) {
      if (!item.isDeleted) {
        bookmarks.push({ ...item.getMeta(), content: await item.getContent(Etebase.OutputFormat.String) });
      }
    }
    ret.push({ col, name: col.getMeta().name, bookmarks });
  }
  return ret;
}

run(async () => {
  const n = unique();
  const password = "bookmarks-tester-password";
  const username = `bm-${n}`;
  const etebase = await Etebase.Account.signup({ username, email: `${username}@example.invalid` }, password, config.serverUrl);
  const colMgr = etebase.getCollectionManager();
  const notes = await colMgr.create("etebase.md.note", { name: "My Notes", mtime: Date.now() }, "");
  await colMgr.upload(notes);
  // Two lists, the way EteSync Notes on Android saves bookmarks
  const made = {};
  for (const name of ["Bookmarks", "Work links"]) {
    made[name] = await colMgr.create(bookmarkType, { name, mtime: Date.now() }, "");
    await colMgr.upload(made[name]);
  }
  const workItems = colMgr.getItemManager(made["Work links"]);
  const old = Date.UTC(2026, 8, 28, 10, 0);
  await workItems.batch([await workItems.create({ name: `Spreewald ${n}`, mtime: old, url: "https://en.wikipedia.org/wiki/Spreewald", description: "Day trip", tags: ["travel"], created: old, savedFrom: "android-share",
    // (meta this app doesn't know, e.g. from a newer version of EteSync Notes, which has to be kept)
    future: { kept: n } }, "https://en.wikipedia.org/wiki/Spreewald")]);

  // A web page with a title, to save a link to
  const pageTitle = `Quick save page ${n}`;
  // (and how often it was asked for, which only "Get title" may do)
  let pageRequests = 0;
  const page = http.createServer((req, res) => {
    pageRequests++;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html><head><title>${pageTitle} &amp; more</title></head><body>Hello</body></html>`);
  });
  await new Promise((r) => page.listen(0, "127.0.0.1", r));
  const pageUrl = `http://127.0.0.1:${page.address().port}/article-${n}`;

  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 }, { permissions: ["clipboard-read", "clipboard-write"] });
  const { p, vis, wait } = A;
  await A.login({ username, password }, 9000);
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const side = (label) => sidebar.getByRole("button", { name: label, exact: true });
  const list = p.locator('[data-testid="bookmark-list"] >> visible=true');
  const panel = p.locator('[data-testid="bookmark-panel"] >> visible=true');

  // The section, right under the notes, and its bookmark lists
  const sections = await sidebar.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check("Bookmarks is a section of the sidebar, right under Notes", sections.indexOf("Bookmarks") === sections.indexOf("Notes") + 1, sections);
  await side("Bookmarks").click(); await wait(2500);
  check("its list has all bookmarks and the bookmark lists", (await side("All bookmarks").count() === 1) &&
    (await side("Bookmark list Bookmarks").count() === 1) && (await side("Bookmark list Work links").count() === 1));
  check("with a + to make a list, and a ⋯ menu for each", (await sidebar.getByRole("button", { name: "New bookmark list" }).count() === 1) &&
    (await sidebar.getByRole("button", { name: "Work links options" }).count() === 1));
  check("the bookmark from the server is listed, with its site, note, tag and date", await waitFor(async () => {
    const text = await list.innerText().catch(() => "");
    return text.includes(`Spreewald ${n}`) && text.includes("en.wikipedia.org") && text.includes("Day trip") && text.includes("#travel") && /28 Sept?/.test(text);
  }), await list.innerText().catch(() => ""));

  // The buttons of a row: copying the link, opening it and deleting it, in that order
  const actions = await list.locator(`[aria-label="Copy link of Spreewald ${n}"]`).evaluate((el) => {
    // (the buttons are in the closest element that also has the delete button)
    let box = el.parentElement;
    while (!box.querySelector("[aria-label^='Delete ']")) {
      box = box.parentElement;
    }
    return [...box.querySelectorAll("[aria-label]")].map((x) => x.getAttribute("aria-label")).filter((x) => /^(Copy link of|Open|Delete) /.test(x));
  });
  check("a row has the buttons copy link, open and delete, in that order", JSON.stringify(actions) === JSON.stringify([`Copy link of Spreewald ${n}`, `Open Spreewald ${n}`, `Delete Spreewald ${n}`]), actions);
  await p.evaluate(() => navigator.clipboard.writeText(""));
  await list.getByRole("button", { name: `Copy link of Spreewald ${n}` }).click(); await wait(500);
  check("copying puts the bookmark's link on the clipboard", (await p.evaluate(() => navigator.clipboard.readText())) === "https://en.wikipedia.org/wiki/Spreewald");

  await list.getByRole("button", { name: `Bookmark Spreewald ${n}` }).click(); await wait(800);
  check("the panel says where a bookmark was saved from", (await panel.locator('[data-testid="bookmark-saved"]').innerText()).includes("Saved 28 Sept 2026 from Android (Share)") ||
    (await panel.locator('[data-testid="bookmark-saved"]').innerText()).includes("Saved 28 Sep 2026 from Android (Share)"), await panel.locator('[data-testid="bookmark-saved"]').innerText());

  // Saving a link by pasting it and pressing enter: it's saved right away, without contacting its site
  await vis('input[aria-label="Paste a link to save it"]').fill(pageUrl);
  await vis('input[aria-label="Paste a link to save it"]').press("Enter");
  check("a pasted link is saved straight away (in the first list), as saved on a computer", await waitFor(async () => (await lists(etebase)).some((l) => (l.name === "Bookmarks") &&
    l.bookmarks.some((x) => (x.url === pageUrl) && (x.content === pageUrl) && (x.name === "") && (x.savedFrom === "computer")))));
  check("the input is empty again", (await vis('input[aria-label="Paste a link to save it"]').inputValue()) === "");
  await wait(3000);
  check("its page wasn't asked for", pageRequests === 0, pageRequests);
  check("it's open in the panel, shown by its site until it has a title", ((await panel.locator('input[aria-label="Title"]').inputValue()) === "") &&
    (await list.innerText()).includes("127.0.0.1") && (await panel.locator('[data-testid="bookmark-saved"]').innerText()).includes("on a computer"));
  check("the panel says that getting the title contacts the site", (await panel.innerText()).includes("Getting the title contacts 127.0.0.1"));
  await panel.getByRole("button", { name: "Get title" }).click();
  check("\"Get title\" fills in the title of the page", await waitFor(async () => (await panel.locator('input[aria-label="Title"]').inputValue()) === `${pageTitle} & more`));
  check("asking for the page once", pageRequests === 1, pageRequests);
  await panel.getByRole("button", { name: "Save changes" }).click();
  check("and saving it puts it on the server", await waitFor(async () => (await lists(etebase)).some((l) => l.bookmarks.some((x) => (x.url === pageUrl) &&
    (x.name === `${pageTitle} & more`) && (x.savedFrom === "computer")))), (await lists(etebase)).flatMap((l) => l.bookmarks).map((x) => x.name));
  await vis('input[aria-label="Paste a link to save it"]').fill(pageUrl + "/");
  await vis('input[aria-label="Paste a link to save it"]').press("Enter"); await wait(2500);
  check("saving the same link again doesn't add a second one", (await lists(etebase)).flatMap((l) => l.bookmarks).filter((x) => x.url.startsWith(pageUrl)).length === 1);
  await vis('input[aria-label="Paste a link to save it"]').fill("");

  // Editing it in the panel
  await list.getByRole("button", { name: `Bookmark ${pageTitle} & more` }).click(); await wait(800);
  await panel.locator('input[aria-label="Note"], textarea[aria-label="Note"]').first().fill("Read it later");
  await panel.getByRole("button", { name: "Add tag", exact: true }).click();
  await panel.locator('input[aria-label="New tag"]').fill("Reading");
  await panel.locator('input[aria-label="New tag"]').press("Enter");
  await panel.getByRole("button", { name: "Save changes" }).click(); await wait(2500);
  check("the panel saves its note and tags to the server", await waitFor(async () => (await lists(etebase)).some((l) => l.bookmarks.some((x) => (x.url === pageUrl) &&
    (x.description === "Read it later") && (JSON.stringify(x.tags) === "[\"reading\"]")))), (await lists(etebase)).flatMap((l) => l.bookmarks).filter((x) => x.url === pageUrl));
  check("the list shows them", (await list.innerText()).includes("Read it later") && (await list.innerText()).includes("#reading"));

  // A new one with the panel, into another list
  await p.getByRole("button", { name: "New bookmark", exact: true }).click(); await wait(800);
  check("\"New bookmark\" opens the panel empty", ((await panel.getAttribute("aria-label")) === "New bookmark") && ((await panel.locator('input[aria-label="Link"]').inputValue()) === ""));
  await panel.locator('input[aria-label="Link"]').fill(`https://example.com/manual-${n}`);
  await panel.locator('input[aria-label="Title"]').fill(`Manual ${n}`);
  await panel.getByRole("button", { name: /^List: / }).click(); await wait(500);
  await p.getByRole("menuitem", { name: "Work links" }).click(); await wait(300);
  await panel.getByRole("button", { name: "Save bookmark" }).click(); await wait(2500);
  check("a new one from the panel is saved in the chosen list", await waitFor(async () => (await lists(etebase)).some((l) => (l.name === "Work links") &&
    l.bookmarks.some((x) => (x.url === `https://example.com/manual-${n}`) && (x.name === `Manual ${n}`)))));

  // Search, tags and the lists
  await vis('input[aria-label="Search bookmarks"]').fill("spreewald");
  check("the search finds by title", (await list.innerText()).includes(`Spreewald ${n}`) && !(await list.innerText()).includes(`Manual ${n}`));
  await vis('input[aria-label="Search bookmarks"]').fill("");
  await p.getByRole("tab", { name: "#reading" }).click(); await wait(500);
  check("a tag shows its bookmarks only", (await list.innerText()).includes(pageTitle) && !(await list.innerText()).includes(`Spreewald ${n}`));
  await p.getByRole("tab", { name: "All", exact: true }).click(); await wait(500);
  await side("Bookmark list Work links").click(); await wait(1000);
  check("a list of the sidebar shows its bookmarks only", (await list.innerText()).includes(`Spreewald ${n}`) && !(await list.innerText()).includes(pageTitle));
  await side("All bookmarks").click(); await wait(1000);

  // Deleting, and undoing it
  await list.getByRole("button", { name: `Delete Manual ${n}` }).click(); await wait(2500);
  check("deleting asks nothing, it's deleted on the server", await waitFor(async () => !(await lists(etebase)).some((l) => l.bookmarks.some((x) => x.name === `Manual ${n}`))));
  check("and an Undo message is shown", (await p.getByRole("button", { name: "Undo" }).count()) === 1);
  await p.getByRole("button", { name: "Undo" }).click(); await wait(2500);
  check("undo puts it back on the server, as it was", await waitFor(async () => (await lists(etebase)).some((l) => (l.name === "Work links") &&
    l.bookmarks.some((x) => (x.name === `Manual ${n}`) && (x.url === `https://example.com/manual-${n}`)))));

  // Several at once
  await list.getByRole("checkbox", { name: `Select ${pageTitle} & more` }).click();
  await list.getByRole("checkbox", { name: `Select Spreewald ${n}` }).click(); await wait(300);
  const bar = p.getByRole("toolbar", { name: "Selected bookmarks" });
  check("ticking bookmarks shows the bar for them", (await bar.count() === 1) && (await bar.innerText()).includes("2 selected"));
  await bar.getByRole("button", { name: "Add tag…" }).click();
  await bar.locator('input[aria-label="Tag to add"]').fill("later");
  await bar.locator('input[aria-label="Tag to add"]').press("Enter"); await wait(2500);
  check("adding a tag to them together, on the server", await waitFor(async () => {
    const all = (await lists(etebase)).flatMap((l) => l.bookmarks);
    return ["reading", "later"].every((t) => all.find((x) => x.url === pageUrl)?.tags?.includes(t)) &&
      ["travel", "later"].every((t) => all.find((x) => x.name === `Spreewald ${n}`)?.tags?.includes(t));
  }));
  await bar.getByRole("button", { name: "Move to…" }).click(); await wait(500);
  await p.getByRole("menuitem", { name: "Work links" }).click(); await wait(3000);
  check("moving them together to another list, on the server", await waitFor(async () => {
    const l = await lists(etebase);
    return l.find((x) => x.name === "Work links").bookmarks.some((x) => (x.url === pageUrl) && (x.description === "Read it later") && (x.savedFrom === "computer")) &&
      !l.find((x) => x.name === "Bookmarks").bookmarks.some((x) => x.url === pageUrl);
  }));
  await list.getByRole("checkbox", { name: `Select ${pageTitle} & more` }).click();
  await list.getByRole("checkbox", { name: `Select Manual ${n}` }).click(); await wait(300);
  await bar.getByRole("button", { name: "Delete" }).click(); await wait(2500);
  check("deleting them together, on the server", await waitFor(async () => !(await lists(etebase)).some((l) => l.bookmarks.some((x) => [pageUrl, `https://example.com/manual-${n}`].includes(x.url)))));
  check("with one Undo for both", (await p.innerText("body")).includes("2 bookmarks deleted"));
  await p.getByRole("button", { name: "Undo" }).click(); await wait(3000);
  check("which puts both back, with where they were saved from", await waitFor(async () => (await lists(etebase)).flatMap((l) => l.bookmarks).filter((x) => [pageUrl, `https://example.com/manual-${n}`].includes(x.url) &&
    (x.savedFrom === "computer")).length === 2));
  check("the Spreewald bookmark still says it was saved from Android after being tagged", (await lists(etebase)).flatMap((l) => l.bookmarks).some((x) => (x.name === `Spreewald ${n}`) && (x.savedFrom === "android-share")));
  const spreewald = async () => (await lists(etebase)).flatMap((l) => l.bookmarks.map((x) => ({ ...x, list: l.name }))).filter((x) => x.name === `Spreewald ${n}`);
  check("and still has the meta this app doesn't know", (await spreewald()).some((x) => x.future?.kept === n), await spreewald());

  // Moving one to another list, and undoing deleting it, makes a new item, which keeps everything
  // of its meta: also what this app doesn't know
  const keptAll = async (listName) => {
    const found = await spreewald();
    return (found.length === 1) && (found[0].list === listName) && (found[0].future?.kept === n) && (found[0].savedFrom === "android-share") &&
      (found[0].created === old) && (found[0].description === "Day trip");
  };
  await list.getByRole("checkbox", { name: `Select Spreewald ${n}` }).click(); await wait(300);
  await bar.getByRole("button", { name: "Move to…" }).click(); await wait(500);
  await p.getByRole("menuitem", { name: "Bookmarks" }).click(); await wait(3000);
  check("a moved bookmark keeps the meta this app doesn't know, on the server", await waitFor(() => keptAll("Bookmarks")), await spreewald());
  await list.getByRole("button", { name: `Delete Spreewald ${n}` }).click(); await wait(2500);
  check("(deleted)", await waitFor(async () => (await spreewald()).length === 0));
  await p.getByRole("button", { name: "Undo" }).click(); await wait(3000);
  check("and so does one put back by undo", await waitFor(() => keptAll("Bookmarks")), await spreewald());
  await list.getByRole("checkbox", { name: `Select Spreewald ${n}` }).click(); await wait(300);
  await bar.getByRole("button", { name: "Move to…" }).click(); await wait(500);
  await p.getByRole("menuitem", { name: "Work links" }).click(); await wait(3000);
  check("(moved back)", await waitFor(() => keptAll("Work links")), await spreewald());
  check("no page was asked for apart from \"Get title\"", pageRequests === 1, pageRequests);

  // Importing a browser's bookmark file into a list, from its ⋯ menu
  const added = Math.floor(Date.UTC(2025, 2, 14) / 1000);
  const html = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">",
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    "    <DT><H3 ADD_DATE=\"1700000000\" PERSONAL_TOOLBAR_FOLDER=\"true\">Bookmarks bar</H3>",
    "    <DL><p>",
    `        <DT><A HREF="https://imported.example.org/one-${n}" ADD_DATE="${added}">Imported one ${n}</A>`,
    "        <DT><H3>Recipes</H3>",
    "        <DL><p>",
    `            <DT><A HREF="https://imported.example.org/two-${n}" ADD_DATE="${added}" TAGS="dinner">Imported two &amp; ${n}</A>`,
    "            <DD>Grandma's",
    "        </DL><p>",
    "        <DT><A HREF=\"javascript:alert(1)\">A bookmarklet</A>",
    "    </DL><p>",
    "</DL><p>",
  ].join("\n");
  const importFile = { name: `bookmarks-${n}.html`, mimeType: "text/html", buffer: Buffer.from(html) };
  const importDialog = p.locator('[data-testid="import-dialog"] >> visible=true');
  await sidebar.getByRole("button", { name: "Work links options" }).click({ force: true }); await wait(600);
  await p.getByRole("menuitem", { name: "Import into this bookmark list…" }).click(); await wait(800);
  check("the import says it takes browser bookmark files", (await importDialog.innerText()).includes(".html") && (await importDialog.innerText()).includes("Bookmarks, exported from a browser"));
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), importDialog.getByRole("button", { name: "Choose files…" }).click()]);
  await chooser.setFiles([importFile]); await wait(1500);
  check("the review says how many bookmarks are in the file", (await importDialog.locator('[data-testid="import-found"]').innerText()).includes("2 bookmarks found"),
    await importDialog.innerText());
  check("and that the bookmarklet can't be imported", (await importDialog.innerText()).includes("1 entry can’t be read"));
  check("they go to the list it was opened from", (await importDialog.getByRole("button", { name: "Where the bookmarks go: Work links" }).count()) === 1);
  await importDialog.getByRole("button", { name: "Import 2 items" }).click(); await wait(4000);
  check("done", (await importDialog.locator('[data-testid="import-done"]').innerText()).includes("2 items imported"), await importDialog.innerText());
  check("they're on the server, in the list, with their folders as tags, their note and when they were saved", await waitFor(async () => {
    const work = (await lists(etebase)).find((x) => x.name === "Work links").bookmarks;
    const one = work.find((x) => x.url === `https://imported.example.org/one-${n}`);
    const two = work.find((x) => x.url === `https://imported.example.org/two-${n}`);
    return one && two && (one.name === `Imported one ${n}`) && !one.tags && (one.created === added * 1000) && (one.savedFrom === "import") &&
      (two.name === `Imported two & ${n}`) && (JSON.stringify(two.tags) === "[\"recipes\",\"dinner\"]") && (two.description === "Grandma's");
  }), (await lists(etebase)).find((x) => x.name === "Work links").bookmarks.filter((x) => x.url.includes("imported")));
  await importDialog.getByRole("button", { name: "Import another file" }).click(); await wait(500);
  const [chooser2] = await Promise.all([p.waitForEvent("filechooser"), importDialog.getByRole("button", { name: "Choose files…" }).click()]);
  await chooser2.setFiles([importFile]); await wait(1500);
  await importDialog.getByRole("button", { name: "Import 2 items" }).click(); await wait(4000);
  check("importing it again skips the links that are there already", (await importDialog.locator('[data-testid="import-done"]').innerText()).includes("0 items imported") &&
    ((await lists(etebase)).find((x) => x.name === "Work links").bookmarks.filter((x) => x.url.includes("imported.example.org")).length === 2));
  await importDialog.getByRole("button", { name: "Open bookmarks" }).click(); await wait(1500);
  check("and \"Open bookmarks\" shows them", (await list.innerText()).includes(`Imported two & ${n}`));

  // Exporting a list as a browser's bookmark file
  await sidebar.getByRole("button", { name: "Work links options" }).click({ force: true }); await wait(600);
  const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("menuitem", { name: "Export as .html" }).click()]);
  const exported = require("fs").readFileSync(await download.path(), "utf8");
  check("exporting a list saves a browser bookmark file with its bookmarks", (download.suggestedFilename() === "Work links.html") && exported.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>") &&
    exported.includes(`HREF="https://imported.example.org/two-${n}"`) && exported.includes("TAGS=\"recipes,dinner\"") && exported.includes(`Imported two &amp; ${n}`), exported);

  // A new bookmark list, from the + of the section, which opens the dialog with "Bookmark list" chosen
  await sidebar.getByRole("button", { name: "New bookmark list" }).click(); await wait(800);
  const newDialog = p.locator('[data-testid="new-collection"] >> visible=true');
  check("the New collection dialog has bookmark lists, chosen from the +", (await newDialog.getByRole("radio", { name: "Bookmark list" }).getAttribute("aria-checked")) === "true");
  await newDialog.locator('input[aria-label="Name"]').fill(`Reading ${n}`);
  await newDialog.getByRole("button", { name: "Create bookmark list" }).click(); await wait(3000);
  check("it's made on the server", await waitFor(async () => (await lists(etebase)).some((x) => x.name === `Reading ${n}`)));
  check("and shown, empty", (await side(`Bookmark list Reading ${n}`).getAttribute("aria-selected")) === "true" && (await list.innerText()).includes("No bookmarks in this list yet"));

  // Settings → Collections
  await side("Settings").click(); await wait(1500);
  await side("Settings: Collections").click(); await wait(3000);
  const group = p.locator('[data-testid="collections-bookmarks"] >> visible=true');
  check("Settings → Collections has the bookmark lists, with how many bookmarks are in them", (await group.innerText()).includes("Bookmark lists") &&
    (await group.innerText()).includes("Work links") && (await group.innerText()).includes("5 bookmarks") && (await group.innerText()).includes(`Reading ${n}`), await group.innerText());

  // After a reload, from what's stored
  await p.goto(config.appUrl + "/bookmarks"); await wait(6000);
  check("the list that was chosen is still chosen after a reload", (await side(`Bookmark list Reading ${n}`).getAttribute("aria-selected")) === "true");
  await side("All bookmarks").click(); await wait(1000);
  check("the bookmarks are there after a reload", (await list.innerText()).includes(`Spreewald ${n}`) && (await list.innerText()).includes(`Imported one ${n}`));

  page.close();
  await b.close();
});
