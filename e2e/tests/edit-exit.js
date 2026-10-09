// Wide screens: editing ends with escape, or with a click around the note (not in it). And the
// message after moving a note to another notebook can be read, over the columns.
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  const name = "Aa exit " + n, other = "Exit other " + n;
  await api.addNote("My Notes", name, "a note to edit");
  await api.addNote(other, "Placeholder " + n, "so that the notebook is there");
  const b = await launch();
  for (const scheme of ["light", "dark"]) {
    const A = await session(b, scheme, { width: 1280, height: 800 });
    await A.p.emulateMedia({ colorScheme: scheme });
    await A.login();
    const inEditor = async () => (await A.p.locator('textarea[aria-label="Content"] >> visible=true').count()) > 0;
    const edit = async () => { await A.p.locator('[data-testid="note-viewer"] >> text=a note to edit').first().click(); await A.wait(1200); };

    await A.open(name);
    await edit();
    check(`${scheme}: clicking the note edits it`, await inEditor());
    await A.p.keyboard.press("Escape"); await A.wait(1000);
    check(`${scheme}: escape ends editing`, !(await inEditor()) && (await A.viewerText()).includes("a note to edit"));

    await edit();
    await A.p.locator('textarea[aria-label="Content"] >> visible=true').click(); await A.wait(800);
    check(`${scheme}: a click in the note keeps editing`, await inEditor());
    // Around the sheet: just left of it
    const sheet = await A.p.locator('textarea[aria-label="Content"] >> visible=true').boundingBox();
    await A.p.mouse.click(sheet.x - 45, sheet.y + 100); await A.wait(1000);
    check(`${scheme}: a click around the note ends editing`, !(await inEditor()));

    // Moving it to another notebook says so, readably
    await edit();
    await A.chooseNotebook((scheme === "light") ? other : "My Notes"); await A.wait(300);
    const message = await A.p.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => d.childElementCount === 0 && (d.textContent || "").startsWith("Moved to"));
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + 5, r.y + r.height / 2);
      // Its color and the background behind it
      let bg = "rgba(0, 0, 0, 0)";
      for (let e = el; e && /rgba\(0, 0, 0, 0\)/.test(bg); e = e.parentElement) {
        bg = getComputedStyle(e).backgroundColor;
      }
      return { text: el.textContent, onTop: el === top || el.contains(top), color: getComputedStyle(el).color, bg };
    });
    check(`${scheme}: moving the note shows a message`, !!message && message.text.startsWith("Moved to"), message);
    check(`${scheme}: which isn't covered by the columns`, !!message && message.onTop, message);
    check(`${scheme}: and can be read`, !!message && message.color !== message.bg, message);
    await A.ctx.close();
  }
  await b.close();
});
