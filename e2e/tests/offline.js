// A note created and written while offline is kept locally, and uploaded when back online
const { launch, session, run, check, unique } = require("../lib");
run(async () => {
  const b = await launch();
  const A = await session(b, "A");
  await A.login();
  await A.ctx.setOffline(true); await A.wait(1000);
  const name = "Offline note " + unique();
  await A.createNote(name);
  check("a new note opens in the editor", /\/note\//.test(A.p.url()), A.p.url());
  await (await A.editor()).fill("written offline");
  await A.wait(300);
  await A.back();
  check("the note is listed while offline", await A.has(name));
  check("it's waiting to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.open(name);
  check("reopened offline, it shows its content", (await A.noteText()) === "written offline");
  await A.back();
  await A.ctx.setOffline(false); await A.wait(8000);
  check("back online, it's uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  const B = await session(b, "B");
  await B.login();
  check("another device sees the note", await B.has(name));
  await B.open(name);
  check("with its content", (await B.noteText()) === "written offline");
  await b.close();
});
