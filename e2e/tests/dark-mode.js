// Dark mode: the notebook line under the title of a note (narrow screens) has to be dark too, not
// white text on the light background of the screens behind it
const { launch, session, run, check, api, unique } = require("../lib");

run(async () => {
  const n = unique();
  const notebook = "Dark " + n;
  await api.addNote(notebook, "Night " + n, "a note in dark mode");
  const b = await launch();
  const A = await session(b, "A");
  await A.p.emulateMedia({ colorScheme: "dark" });
  await A.login();
  await A.home(); await A.openNotebook(notebook);
  await A.open("Night " + n);
  check("the note opens and shows its text", (await A.viewerText()).includes("a note in dark mode"));

  // The color of the notebook's name and the one shown behind it (of the first ancestor that has one)
  const colors = await A.p.locator('[aria-label^="Notebook: "] >> visible=true').first().evaluate((el) => {
    const text = getComputedStyle(el.querySelector('[dir="auto"]') || el).color;
    let bg = "rgba(0, 0, 0, 0)";
    for (let e = el; e && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); e = e.parentElement) {
      bg = getComputedStyle(e).backgroundColor;
    }
    return { text, bg };
  });
  // Relative luminance, as in WCAG
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((x) => {
      const v = Number(x) / 255;
      return (v <= 0.03928) ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(colors.text), lum(colors.bg)].sort((x, y) => y - x);
  const contrast = (hi + 0.05) / (lo + 0.05);
  check("the notebook line's text can be read on its background", contrast >= 4.5, { ...colors, contrast: contrast.toFixed(2) });
  check("and the background is dark", lum(colors.bg) < 0.1, colors);
  await b.close();
});
