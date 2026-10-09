// A notebook deleted offline while it's renamed elsewhere is restored, and queued changes survive a reload
const { launch, session, run, check, unique, config } = require("../lib");
run(async () => {
  const b = await launch();
  const A = await session(b, "A"); const B = await session(b, "B");
  await A.login(); await B.login();
  const nb = "NB2 " + unique();
  await A.createNotebook(nb);
  await A.home(); await A.tab("Notes");
  await A.createNote("note in " + nb, nb);
  await (await A.editor()).fill("keep me"); await A.wait(300);
  await A.back(); await A.wait(5000);
  await B.sync(); await B.tab("Notebooks");
  check("the other device has the notebook", await B.has(nb));

  await A.ctx.setOffline(true); await A.wait(800);
  await A.deleteNotebook(nb); await A.home();
  await B.renameNotebook(nb, nb + " B-name"); await B.wait(4000);
  check("deleted offline", !(await A.has(nb)));
  await A.ctx.setOffline(false); await A.wait(10000);
  check("back online, nothing left to upload", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("the notebook is restored with the other device's name", await A.has(nb + " B-name"));
  await A.dismiss(); await A.openNotebook(nb + " B-name");
  check("with its note", await A.has("note in " + nb));
  await B.home(); await B.sync();
  check("the other device still has it", await B.has(nb + " B-name"));

  // Renamed while the server can't be reached (the page itself still loads), then reloaded
  const server = new RegExp(new URL(config.serverUrl).host.replace(/[.]/g, "\\."));
  await A.ctx.route(server, (r) => r.abort());
  await A.renameNotebook(nb + " B-name", nb + " final"); await A.home();
  check("renamed while the server is unreachable, it waits to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.p.reload(); await A.wait(6000); A.inNotebook = false; await A.tab("Notebooks");
  check("after a reload it still has the new name", await A.has(nb + " final"));
  check("and still waits to be uploaded", (await A.syncLabel()).includes("1 not uploaded"), await A.syncLabel());
  await A.ctx.unroute(server);
  await A.sync(); await A.wait(3000); await B.sync();
  check("once the server is back it's uploaded", (await A.syncLabel()) === "Sync", await A.syncLabel());
  check("and the other device has the new name", await B.has(nb + " final"));
  await b.close();
});
