// The screens of logging in and signing up: a bar with help links and a card on wide screens, the
// menu on phones; the server can be changed; signing up needs agreeing that the password can't be
// recovered, and makes the account on the server.
const { launch, session, run, check, config, Etebase, unique } = require("../lib");

run(async () => {
  const n = unique();
  const b = await launch();

  // Wide screens
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, vis, btn, wait } = A;
  // (the whole page: these screens have no drawer, which A.has leaves out)
  const has = async (text) => (await p.innerText("body")).includes(text);
  await p.goto(config.appUrl + "/"); await wait(4000);
  check("the login has its own bar with the help links, and no menu", (await p.getByRole("link", { name: "FAQ" }).count() === 1) &&
    (await p.getByRole("link", { name: "Report an issue" }).count() === 1) && (await btn(/^main menu$/i).count() === 0));
  check("it says which server it logs in to", await has("api.etebase.com") && await has("Default"));
  await btn(/^log in$/i).click(); await wait(800);
  check("empty fields are required", ((await p.innerText("body")).match(/This field is required/g) ?? []).length === 2);
  await vis('[aria-label="Change the server"]').click(); await wait(300);
  await vis('input[aria-label="Server URL"]').fill("http://example.com");
  await vis('input[aria-label="Username"]').fill("someone");
  await vis('input[aria-label="Password"]').fill("something");
  await btn(/^log in$/i).click(); await wait(800);
  check("a server without https is refused", await has("Has to start with https"));
  await btn(/^show password$/i).click(); await wait(300);
  // (shown, it has no type, which is text)
  check("the password can be shown", ((await vis('input[aria-label="Password"]').getAttribute("type")) ?? "text") === "text");

  // Signing up
  await p.getByRole("link", { name: "Create an account" }).click(); await wait(2000);
  check("the signup is reached from the login", await has("Create an account") && await has("free trial"));
  const username = `auth-${n}`;
  const password = `auth-password-${n}`;
  await vis('[aria-label="Change the server"]').click(); await wait(300);
  await vis('input[aria-label="Server URL"]').fill(config.serverUrl);
  await vis('input[aria-label="Username"]').fill(username);
  await vis('input[aria-label="Email"]').fill(`${username}@example.invalid`);
  await vis('input[aria-label="Password"]').fill("short");
  check("a short password is shown as too short", await has("Too short"));
  await vis('input[aria-label="Password"]').fill(password);
  check("a long one as strong", await has("Strong"));
  const create = btn(/^create account$/i);
  check("signing up needs agreeing that the password can't be recovered", (await create.getAttribute("aria-disabled")) === "true");
  await create.click({ force: true }); await wait(1500);
  let made = true;
  try {
    await (await Etebase.Account.login(username, password, config.serverUrl)).logout();
  } catch (e) {
    made = false;
  }
  check("and nothing is made without it", !made);
  await p.getByRole("checkbox", { name: "I understand my password can't be recovered" }).click(); await wait(300);
  await create.click(); await wait(10000);
  check("then the account is made, and set up", await has("Set Up Your Account"), (await p.innerText("body")).slice(0, 300));
  let loggedIn = false;
  try {
    await (await Etebase.Account.login(username, password, config.serverUrl)).logout();
    loggedIn = true;
  } catch (e) {
    loggedIn = false;
  }
  check("the account is on the server", loggedIn);
  await A.ctx.close();

  // Phones: the menu has logging in and signing up
  const B = await session(b, "B", { width: 400, height: 820 });
  await B.p.goto(config.appUrl + "/"); await B.wait(4000);
  await B.btn(/^main menu$/i).click(); await B.wait(1000);
  check("on a phone, the menu says it's not logged in", await B.p.getByText("Not logged in").count() === 1);
  await B.btn(/^create account$/i).click(); await B.wait(2000);
  check("and opens the signup", (await B.p.innerText("body")).includes("Already have one?"));
  await B.btn(/^main menu$/i).click(); await B.wait(1000);
  await B.btn(/^log in$/i).first().click(); await B.wait(2000);
  check("and the login", (await B.p.innerText("body")).includes("New here?"));
  await b.close();
});
