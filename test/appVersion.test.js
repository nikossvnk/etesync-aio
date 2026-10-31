// The version About shows: the one in version.txt, which a release has next to the app, and
// "(development build)" without it (also when the server answers with the app's page instead).
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

// A fresh copy of the module, with fetch answering as given
function load(answer) {
  delete require.cache[require.resolve("../src/appVersion")];
  global.fetch = async (url) => {
    assert.equal(url, "/version.txt");
    if (answer instanceof Error) {
      throw answer;
    }
    return { ok: answer.status === 200, text: async () => answer.body };
  };
  return require("../src/appVersion");
}

test("a release's version", async () => {
  const m = load({ status: 200, body: "0.1.11\n" });
  assert.equal(await m.loadAppVersion(), "0.1.11");
  assert.equal(m.appVersion, "0.1.11");
});

test("without version.txt: a development build", async () => {
  assert.equal(await load({ status: 404, body: "Not found" }).loadAppVersion(), "(development build)");
  assert.equal(await load({ status: 200, body: "<!DOCTYPE html><html>…</html>" }).loadAppVersion(), "(development build)");
  assert.equal(await load(new Error("offline")).loadAppVersion(), "(development build)");
});
