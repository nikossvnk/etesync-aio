// The server URL has to be https unless it's on the local network, and notes are rendered as markdown
const { launch, session, run, check, api, unique, config } = require("../lib");
run(async () => {
  const name = "Markdown " + unique();
  await api.addNote("My Notes", name, "# Heading\n\nSome **bold** text.\n\n- [ ] a task\n- [x] done task");
  const b = await launch();
  const A = await session(b, "A");
  await A.p.goto(config.appUrl + "/"); await A.wait(4000);
  await A.vis("text=Advanced settings").click(); await A.wait(500);
  await A.vis('input[aria-label="Username"]').fill(config.username);
  await A.vis('input[aria-label="Password"]').fill(config.password);
  for (const [url, expected] of [["http://example.com", "Has to start with https"], ["example.com", "Must be a URL"], ["http://127.0.0.1.evil.com", "Has to start with https"]]) {
    await A.vis('input[aria-label="Server URL"]').fill(url);
    await A.btn(/^log in$/i).click(); await A.wait(1200);
    const t = await A.p.innerText("body");
    check(`${url} is refused`, t.includes(expected) && t.includes("Please Log In"));
  }
  await A.vis('input[aria-label="Server URL"]').fill(config.serverUrl);
  await A.btn(/^log in$/i).click(); await A.wait(8000);
  check("the test server is accepted", await A.has(name));
  // The menu says which server the account is on (with http://, as the test server isn't encrypted)
  await A.btn(/^main menu$/i).click(); await A.wait(1000);
  const server = await A.p.locator('[aria-label^="Server: "] >> visible=true').first().getAttribute("aria-label").catch(() => "");
  check("the menu shows the server", server === `Server: ${config.serverUrl.replace(/\/+$/, "")}` &&
    await A.p.getByText(config.serverUrl.replace(/\/+$/, ""), { exact: true }).locator("visible=true").count() === 1, server);
  await A.p.keyboard.press("Escape"); await A.p.mouse.click(1000, 400); await A.wait(800);
  await A.open(name); await A.wait(1500);
  const shown = await A.viewerText();
  check("the heading is rendered", /^Heading$/m.test(shown), shown);
  check("bold is rendered, without the asterisks", shown.includes("Some bold text.") && !shown.includes("**"));
  check("the tasks are checkboxes", (await A.p.locator('[data-testid="note-viewer"] [role=checkbox] >> visible=true').count()) === 2);
  await b.close();
});
