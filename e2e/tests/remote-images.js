// Images from the internet in notes are only loaded when tapped (also without a scheme), embedded ones are shown
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const name = "Images " + unique();
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
  await api.addNote("My Notes", name, `![with scheme](https://placehold.co/120x80.png)\n\n![no scheme](placehold.co/60x40.png)\n\n![slashes](//placehold.co/30x20.png)\n\n![inline](${png})\n\n![broken](https://placehold.co/does-not-exist-404/x/y/z.png)`);
  const b = await launch();
  const A = await session(b, "A");
  const remote = [];
  A.p.on("request", (r) => { if (/placehold\.co/.test(r.url())) remote.push(r.url()); });
  await A.login();
  await A.open(name); await A.wait(2000);
  const state = () => A.p.evaluate(() => ({
    placeholders: [...document.querySelectorAll('[aria-label^="Load image from"]')].filter((e) => e.offsetParent).length,
    spinners: [...document.querySelectorAll("[role=progressbar]")].filter((e) => e.offsetParent).length,
    images: [...document.querySelectorAll('[data-testid="note-viewer"] img')].filter((e) => e.offsetParent).length,
  }));
  let s = await state();
  check("four remote images wait to be tapped", s.placeholders === 4, s);
  check("the embedded image is shown", s.images === 1, s);
  check("nothing was loaded from the internet", remote.length === 0, remote);
  for (let i = 0; i < 4; i++) {
    await A.p.locator('[aria-label^="Load image from"] >> visible=true').first().click(); await A.wait(2500);
  }
  await A.wait(3000);
  s = await state();
  check("tapped, they are loaded", s.placeholders === 0 && remote.length >= 4, { ...s, requests: remote.length });
  check("the broken one says it could not be loaded", /could not be loaded/.test(await A.p.innerText("body")));
  await A.back(); await A.open(name); await A.wait(5000);
  s = await state();
  check("reopened: no spinner over the loaded images", s.spinners === 0 && s.placeholders === 0, s);
  await b.close();
});
