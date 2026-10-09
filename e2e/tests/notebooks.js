// Notebooks created, renamed and deleted offline, conflicting renames, and a notebook made and removed offline
const { launch, session, run, check, unique, api } = require("../lib");
run(async () => {
  const b = await launch();
  const A = await session(b, "A"); const B = await session(b, "B");
  await A.login(); await B.login();
  const n = unique();
  const nb = "NB " + n;

  await A.ctx.setOffline(true); await A.wait(800);
  await A.createNotebook(nb);
  check("a notebook created offline waits to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.home(); await A.tab("Notes");
  await A.createNote("note in " + nb, nb);
  await (await A.editor()).fill("inside offline notebook"); await A.wait(300);
  await A.back(); await A.home(); await A.openNotebook(nb);
  check("a note in it is listed", await A.has("note in " + nb));
  check("both wait to be uploaded", (await A.syncLabel()).includes("2 not uploaded"), await A.syncLabel());

  await A.ctx.setOffline(false); await A.wait(9000);
  check("back online, they're uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  await B.sync(); await B.tab("Notebooks");
  check("the other device has the notebook", await B.has(nb));
  await B.openNotebook(nb);
  check("and the note in it", await B.has("note in " + nb));

  await A.ctx.setOffline(true); await A.wait(800);
  await A.home();
  await A.renameNotebook(nb, nb + " renamed");
  await A.home();
  check("renamed offline", await A.has(nb + " renamed"));
  check("the rename waits to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.ctx.setOffline(false); await A.wait(9000);
  await B.home(); await B.sync();
  check("the rename is uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("the other device has the new name", await B.has(nb + " renamed"));

  // Renamed on both devices: the device that was offline wins
  await A.ctx.setOffline(true); await A.wait(800);
  await A.renameNotebook(nb + " renamed", nb + " A-name");
  await B.renameNotebook(nb + " renamed", nb + " B-name"); await B.wait(4000);
  await A.ctx.setOffline(false); await A.wait(10000);
  await A.home(); await B.home(); await B.sync();
  check("conflicting renames: nothing left to upload", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("A keeps its name", await A.has(nb + " A-name"));
  check("B gets A's name", await B.has(nb + " A-name") && !(await B.has(nb + " B-name")));

  await A.ctx.setOffline(true); await A.wait(800);
  await A.deleteNotebook(nb + " A-name");
  await A.home();
  check("deleted offline, it's gone", !(await A.has(nb + " A-name")));
  check("the deletion waits to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.ctx.setOffline(false); await A.wait(9000);
  await B.sync();
  check("the deletion is uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("and the notebook is gone on the other device", !(await B.has(nb + " A-name")));

  // Created and deleted while offline: nothing reaches the server
  await A.ctx.setOffline(true); await A.wait(800);
  await A.btn(/^new$/i).click(); await A.wait(1500);
  await A.vis('input[aria-label="Display name (title)"]').fill("Ghost " + n);
  await A.btn(/^save$/i).click(); await A.wait(3000);
  await A.home();
  check("a notebook made offline is listed", await A.has("Ghost " + n));
  await A.deleteNotebook("Ghost " + n); await A.home();
  check("and deleted again, nothing waits to be uploaded", !(await A.has("Ghost " + n)) && (await A.syncLabel()) === "Sync", await A.syncLabel());
  await A.ctx.setOffline(false); await A.wait(8000);
  await B.sync();
  check("it never reaches the other device", !(await B.has("Ghost " + n)));
  const etebase = await api.login();
  const names = (await api.notebooks(etebase)).map((c) => c.getMeta().name);
  await etebase.logout();
  check("or the server", !names.includes("Ghost " + n));
  await b.close();
});
