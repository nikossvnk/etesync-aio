// New notes that are left without a title and content are thrown away, without anything reaching the server
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  await api.addNote("My Notes", "Existing " + n, "an existing note");
  const b = await launch();
  const A = await session(b, "A");
  await A.login();
  const listed = (name) => A.listed(name);
  const onServer = async (name) => (await api.noteNames()).filter((x) => x.endsWith(name));
  const message = async () => ((await A.p.innerText("body")).match(/Empty note discarded/) || ["-"])[0];
  const count = async () => (await api.noteNames()).length;

  let before = await count();
  await A.createNote();
  await A.back();
  // (the message is only shown for a few seconds)
  check("left without a title and content: thrown away, with a message", (await message()) === "Empty note discarded");
  await A.wait(4000);
  check("not listed", !(await listed("Untitled")));
  check("and not on the server", (await count()) === before, [before, await count()]);

  await A.createNote("Written " + n); await (await A.editor()).fill("some content"); await A.wait(1500);
  await A.back(); await A.wait(6000);
  check("with a title and content: listed", await listed("Written " + n));
  check("and on the server", JSON.stringify(await onServer("Written " + n)) === JSON.stringify(["Written " + n]), await onServer("Written " + n));

  await A.createNote("Title only " + n);
  await A.back(); await A.wait(6000);
  check("with only a title: kept", await listed("Title only " + n));
  check("and on the server", JSON.stringify(await onServer("Title only " + n)) === JSON.stringify(["Title only " + n]), await onServer("Title only " + n));

  // Without a title it's named after its first line, and thrown away when that's removed again
  const namesBefore = await api.noteNames();
  await A.createNote(); await (await A.editor()).fill("Cleared " + n); await A.wait(4000);
  const placeholder = await A.vis('input[aria-label="Title"]').getAttribute("placeholder");
  check("without a title, it's named after its first line", placeholder === "Cleared " + n, placeholder);
  await A.vis("textarea").fill(""); await A.wait(1500);
  await A.back(); await A.wait(6000);
  check("typed, cleared and left: not listed", !(await listed("Cleared " + n)));
  // If it was uploaded in the meantime it's deleted there, under the name it had last
  const left = await api.noteNames();
  for (const name of namesBefore) {
    left.splice(left.indexOf(name), 1);
  }
  check("and not on the server (other than deleted)", left.every((x) => x.startsWith("DELETED:")), left);
  check("nothing left to upload", (await A.syncLabel()) === "Sync", await A.syncLabel());

  before = await count();
  await A.ctx.setOffline(true); await A.wait(800);
  await A.createNote(); await A.back(); await A.wait(2000);
  check("offline, left empty: not listed and nothing to upload", !(await listed("Untitled")) && (await A.syncLabel()) === "Sync", await A.syncLabel());
  await A.ctx.setOffline(false); await A.wait(6000);
  check("back online, it never reaches the server", (await count()) === before, [before, await count()]);

  await A.open("Existing " + n); await A.back(); await A.wait(1500);
  check("an existing note opened and left is still there", await listed("Existing " + n));
  await b.close();
});
