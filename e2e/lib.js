// Helpers for the browser tests. See README.md for how to run them.
const { chromium } = require("playwright-core");
const Etebase = require("etebase");

const config = {
  // The web build of the app, served by serve.js
  appUrl: process.env.E2E_APP_URL || "http://localhost:8765",
  // An Etebase test server, and an account on it that the tests may change (setup.js creates it)
  serverUrl: process.env.E2E_SERVER || "http://127.0.0.1:3735",
  username: process.env.E2E_USER || "e2e-tester",
  password: process.env.E2E_PASSWORD || "e2e-tester-password",
  // A Chromium binary, if Playwright's own isn't installed (npx playwright install chromium)
  chromium: process.env.E2E_CHROMIUM || undefined,
};
exports.config = config;
exports.Etebase = Etebase;

exports.launch = () => chromium.launch({ executablePath: config.chromium });

let failures = 0;
// Prints the result of a check, a failed one makes the test fail (at the end, so that the others still run)
exports.check = (label, ok, detail) => {
  // The details are only shown when it failed
  const shown = (!ok && (detail !== undefined)) ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "";
  console.log(`${ok ? "ok  " : "FAIL"} - ${label}${shown}`);
  if (!ok) {
    failures++;
  }
};
// Runs a test: a thrown error or a failed check makes the process exit with 1
exports.run = (fn) => {
  fn().then(async () => {
    process.exit(failures ? 1 : 0);
  }, (e) => {
    console.log("FAIL - " + e.message.split("\n").slice(0, 4).join(" / "));
    process.exit(1);
  });
};
exports.unique = () => String(Date.now() % 1000000);

// Direct access to the account through the Etebase client, to prepare data and check the server's side
exports.api = {
  async login() {
    return Etebase.Account.login(config.username, config.password, config.serverUrl);
  },
  // Deletes all of the notebooks (and so their notes) and makes an empty "My Notes", so that the
  // notes of earlier runs don't fill the lists. Only for the test account!
  async reset() {
    const etebase = await this.login();
    const colMgr = etebase.getCollectionManager();
    let deleted = 0;
    for (const col of await this.notebooks(etebase)) {
      if (!col.isDeleted) {
        col.delete();
        await colMgr.upload(col);
        deleted++;
      }
    }
    await this.notebook(etebase, "My Notes");
    await etebase.logout();
    return deleted;
  },
  // All of the notebooks, which come in pages (the test account gets more of them with every run)
  async notebooks(etebase) {
    const colMgr = etebase.getCollectionManager();
    const ret = [];
    let stoken;
    for (;;) {
      const page = await colMgr.list("etebase.md.note", { stoken, limit: 50 });
      ret.push(...page.data);
      stoken = page.stoken;
      if (page.done) {
        return ret;
      }
    }
  },
  // All of the notes of a notebook (also in pages)
  async items(etebase, col) {
    const itemMgr = etebase.getCollectionManager().getItemManager(col);
    const ret = [];
    let stoken;
    for (;;) {
      const page = await itemMgr.list({ stoken, limit: 50 });
      ret.push(...page.data);
      stoken = page.stoken;
      if (page.done) {
        return ret;
      }
    }
  },
  // The content of the note with the name in the notebook (that isn't deleted), if there's one
  async noteContent(notebookName, name) {
    const etebase = await this.login();
    const col = await this.notebook(etebase, notebookName);
    const item = (await this.items(etebase, col)).find((x) => !x.isDeleted && x.getMeta().name === name);
    const content = (item) ? await item.getContent(Etebase.OutputFormat.String) : undefined;
    await etebase.logout();
    return content;
  },
  async notebook(etebase, name) {
    const colMgr = etebase.getCollectionManager();
    const existing = (await this.notebooks(etebase)).find((x) => !x.isDeleted && x.getMeta().name === name);
    if (existing) {
      return existing;
    }
    const col = await colMgr.create("etebase.md.note", { name }, "");
    await colMgr.upload(col);
    return col;
  },
  // Changes the content of the note with the name in the notebook, directly on the server
  async setNoteContent(notebookName, name, content) {
    const etebase = await this.login();
    const col = await this.notebook(etebase, notebookName);
    const itemMgr = etebase.getCollectionManager().getItemManager(col);
    const item = (await this.items(etebase, col)).find((x) => !x.isDeleted && x.getMeta().name === name);
    await item.setContent(content);
    await itemMgr.batch([item]);
    await etebase.logout();
  },
  // Adds a note (and its notebook, if needed) directly on the server
  async addNote(notebookName, name, content) {
    const etebase = await this.login();
    const col = await this.notebook(etebase, notebookName);
    const itemMgr = etebase.getCollectionManager().getItemManager(col);
    const item = await itemMgr.create({ name, mtime: Date.now() }, content);
    await itemMgr.batch([item]);
    await etebase.logout();
  },
  // The names of all of the notes on the server ("DELETED:" in front of deleted ones)
  async noteNames() {
    const etebase = await this.login();
    const colMgr = etebase.getCollectionManager();
    const names = [];
    for (const col of await this.notebooks(etebase)) {
      let stoken;
      for (;;) {
        const items = await colMgr.getItemManager(col).list({ stoken });
        names.push(...items.data.map((it) => (it.isDeleted ? "DELETED:" : "") + it.getMeta().name));
        stoken = items.stoken;
        if (items.done) {
          break;
        }
      }
    }
    await etebase.logout();
    return names;
  },
};

// A browser session (its own context, so like a separate device) with helpers for driving the app
// (900 pixels wide by default, which is too narrow for the sidebar of wide screens)
exports.session = async (browser, tag, viewport = { width: 900, height: 700 }) => {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => console.log(tag, "PAGEERROR", e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Fragment|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) {
      console.log(tag, "CONSOLE", m.text().slice(0, 500));
    }
  });
  const vis = (s) => p.locator(s + " >> visible=true").first();
  const btn = (re) => p.getByRole("button", { name: re }).locator("visible=true").first();
  // The text of the page without the drawer (which ends with "Report issue")
  const text = async () => (await p.innerText("body")).replace(/\s+/g, " ").split("Report issue")[1] || "";
  const wait = (ms) => p.waitForTimeout(ms);
  const s = { tag, ctx, p, vis, btn, text, wait };

  s.login = async () => {
    await p.goto(config.appUrl + "/"); await wait(4000);
    await vis("text=Advanced settings").click(); await wait(500);
    await vis('input[aria-label="Username"]').fill(config.username);
    await vis('input[aria-label="Password"]').fill(config.password);
    await vis('input[aria-label="Server URL"]').fill(config.serverUrl);
    await btn(/^log in$/i).click(); await wait(8000);
  };
  // Opens a note or a notebook by its name
  // (scrolling the list to it, which only has the rows it scrolled to)
  s.open = async (name) => {
    const target = p.getByText(name, { exact: true }).locator("visible=true");
    for (let i = 0; (i < 40) && (await target.count() === 0); i++) {
      await p.mouse.move(p.viewportSize().width * 0.6, p.viewportSize().height / 2);
      await p.mouse.wheel(0, 600); await wait(250);
    }
    await target.first().click(); await wait(2500);
  };
  s.back = async () => { await btn(/^back$/i).click(); await wait(2000); };
  s.dismiss = async () => {
    const d = p.getByRole("button", { name: /^dismiss$/i }).locator("visible=true");
    for (let i = 0; (i < 4) && (await d.count() > 0); i++) {
      await d.first().click({ timeout: 1500 }).catch(() => {}); await wait(600);
    }
  };
  s.tab = async (name) => {
    await s.dismiss();
    // The notes and the notebooks are in the menu (the drawer), the search is opened from the notes
    if (name === "Search") {
      await p.getByRole("search", { name: "Search notes" }).locator("visible=true").first().click(); await wait(1500);
      return;
    }
    await btn(/^main menu$/i).click(); await wait(800);
    // (the name of a menu item starts with its icon's character)
    await p.getByRole("button", { name: new RegExp(`(^|\\s)${name}$`) }).locator("visible=true").last().click(); await wait(1500);
  };
  s.sync = async () => { await btn(/^sync/i).click(); await wait(5000); };
  s.has = async (str) => (await text()).includes(str);
  // Whether the list shows a note with the name, scrolling through it (it only has the rows it
  // scrolled to), and back to the top
  s.listed = async (name) => {
    await p.mouse.move(p.viewportSize().width / 2, p.viewportSize().height / 2);
    let found = false;
    for (let i = 0; (i < 40) && !found; i++) {
      found = await s.has(name);
      if (!found) {
        await p.mouse.wheel(0, 600); await wait(250);
      }
    }
    await p.mouse.wheel(0, -100000); await wait(300);
    return found;
  };
  s.syncLabel = () => p.evaluate(() => [...document.querySelectorAll('[aria-label^="Sync"]')].filter((e) => e.offsetParent).map((e) => e.getAttribute("aria-label")).join("|"));
  s.shot = (name) => p.screenshot({ path: `${name}-${tag}.png` });

  // Creates a note with the "New" button of the notes list, which opens it in the editor, with the
  // title (if any) typed in, and in the given notebook (or the preselected one)
  s.createNote = async (name, notebook) => {
    // ("New note" in the sidebar of wide screens)
    await btn(/^new( note)?$/i).click(); await wait(2500);
    if (name) {
      await vis('input[aria-label="Title"]').fill(name); await wait(300);
    }
    if (notebook) {
      await s.chooseNotebook(notebook);
    }
  };
  // The notebook of the open note, as it says next to the title or under it
  s.notebookOfNote = async () => ((await p.locator('[aria-label^="Notebook: "] >> visible=true').first().getAttribute("aria-label")) || "").replace(/^Notebook: /, "");
  // Puts the open note (which has to be in the editor) in another notebook
  s.chooseNotebook = async (name) => {
    await p.getByRole("button", { name: /^Notebook: / }).locator("visible=true").first().click(); await wait(1000);
    await p.getByText(name, { exact: true }).locator("visible=true").last().click({ force: true }); await wait(3000);
  };

  // A saved note has to open in the viewer and show its text there
  const norm = (str) => str.replace(/\s+/g, " ").trim();
  s.viewerText = async () => {
    const viewer = p.locator('[data-testid="note-viewer"] >> visible=true');
    if (await viewer.count() === 0) {
      throw new Error("the note did not open in the viewer");
    }
    return viewer.first().innerText();
  };
  // The text of the open note: read from the editor, after checking that the viewer showed the same text
  s.noteText = async () => {
    const shown = await s.viewerText();
    await btn(/^view mode$/i).click(); await wait(800);
    const value = await vis("textarea").inputValue();
    if (norm(shown) !== norm(value)) {
      throw new Error(`the viewer showed ${JSON.stringify(shown)}, but the note is ${JSON.stringify(value)}`);
    }
    await btn(/^view mode$/i).click(); await wait(500);
    return value;
  };
  // The editor of the open note. A saved note has to be in the viewer first, showing its text,
  // only a new (empty) note may open in the editor.
  s.editor = async () => {
    const textarea = p.locator("textarea >> visible=true");
    if (await textarea.count() > 0) {
      const value = await textarea.first().inputValue();
      if (value !== "") {
        throw new Error(`a saved note opened in the editor instead of the viewer: ${JSON.stringify(value)}`);
      }
      return vis("textarea");
    }
    await s.viewerText();
    await btn(/^view mode$/i).click(); await wait(800);
    return vis("textarea");
  };

  // Notebooks: going back to the list of notebooks (from the screens above it, or the notes), and editing one
  s.home = async () => {
    for (let i = 0; i < 6; i++) {
      await s.dismiss();
      const back = p.getByRole("button", { name: /^back$/i }).locator("visible=true");
      if (await back.count() === 0) {
        break;
      }
      await back.first().click(); await wait(1200);
    }
    await s.tab("Notebooks");
    s.inNotebook = false;
  };
  s.openNotebook = async (name) => { await s.open(name); s.inNotebook = true; };
  s.editNotebook = async (name) => {
    await s.home(); await s.openNotebook(name);
    await btn(/^manage notebook$/i).click(); await wait(1500);
    await btn(/^edit$/i).click(); await wait(1500);
  };
  s.createNotebook = async (name) => {
    await s.tab("Notebooks");
    await btn(/^new$/i).click(); await wait(1500);
    await p.locator('input[aria-label="Display name (title)"] >> visible=true').last().fill(name);
    await p.getByRole("button", { name: /^save$/i }).locator("visible=true").last().click(); await wait(3000);
  };
  s.renameNotebook = async (from, to) => {
    await s.editNotebook(from);
    await vis('input[aria-label="Display name (title)"]').fill(to);
    await btn(/^save$/i).click(); await wait(2500);
  };
  s.deleteNotebook = async (name) => {
    await s.editNotebook(name);
    await btn(/^delete collection$/i).click(); await wait(800);
    await btn(/^ok$/i).click(); await wait(2500);
    s.inNotebook = false; // a fresh home screen is shown after deleting
  };
  return s;
};
