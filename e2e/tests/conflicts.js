// Notes changed on two devices: live updates, and keeping both versions when they conflict
const { launch, session, run, check, unique } = require("../lib");
run(async () => {
  const b = await launch();
  const A = await session(b, "A"); const B = await session(b, "B");
  await A.login(); await B.login();
  const copies = async (S) => ((await S.text()).split("(conflict copy)").length - 1);
  const copiesBefore = await copies(A);

  // Edits while syncs are running must not create conflict copies
  const name = "Shared " + unique();
  await A.createNote(name);
  const editor = await A.editor();
  for (const chunk of ["one ", "two ", "three ", "four "]) {
    await editor.pressSequentially(chunk, { delay: 40 }); await A.wait(1300);
  }
  await A.back(); await A.wait(4000);
  check("edits while syncing are all uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("without conflict copies", (await copies(A)) === copiesBefore);

  await B.sync();
  await B.open(name);
  check("the other device gets the note", (await B.noteText()) === "one two three four ");

  // A change on one device shows up on the other
  await A.open(name); await (await A.editor()).fill("A second version"); await A.back(); await A.wait(4000);
  await B.back(); await B.sync(); await B.open(name);
  check("a change shows up on the other device", (await B.noteText()) === "A second version");
  await B.back();

  // Changed offline on A and online on B: both versions are kept
  await A.ctx.setOffline(true); await A.wait(500);
  await A.open(name); await (await A.editor()).fill("A offline version"); await A.back();
  await B.open(name); await (await B.editor()).fill("B online version"); await B.back(); await B.wait(4000);
  check("B's change is uploaded", (await B.syncLabel()) === "Sync", await B.syncLabel());
  await A.ctx.setOffline(false); await A.wait(8000);
  check("A has nothing left to upload", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("A has a conflict copy", await A.has(name + " (conflict copy)"));
  await A.open(name);
  check("the note has B's version", (await A.noteText()) === "B online version");
  await A.back();
  await A.open(name + " (conflict copy)");
  check("the copy has A's version", (await A.noteText()) === "A offline version");
  await A.back();
  await B.sync();
  check("B sees the copy too", await B.has(name + " (conflict copy)"));

  // Deleted offline, then reconnected
  await A.ctx.setOffline(true); await A.wait(500);
  await A.open(name + " (conflict copy)");
  await A.btn(/^delete$/i).click(); await A.wait(800);
  await A.btn(/^ok$/i).click(); await A.wait(2500);
  check("deleted offline, it's gone from the list", !(await A.has(name + " (conflict copy)")));
  check("the deletion waits to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.ctx.setOffline(false); await A.wait(6000);
  await B.sync();
  check("back online, it's uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("and gone on the other device", !(await B.has(name + " (conflict copy)")));
  await b.close();
});
