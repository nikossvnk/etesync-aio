// Runs all of the tests in tests/ (or the ones given), one after the other, and sums up. A run of all
// of them starts with an empty test account (E2E_KEEP_DATA=1 keeps what's there), as the notes that
// earlier runs left behind would fill the lists that the tests look for their notes in.
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path");
const { api } = require("./lib");
const dir = path.join(__dirname, "tests");
const args = process.argv.slice(2);
const tests = args.length ? args : fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();

(async () => {
  if (!args.length && !process.env.E2E_KEEP_DATA) {
    const deleted = await api.reset();
    console.log(`Emptied the test account (deleted ${deleted} notebooks)`);
  }
  const results = [];
  for (const t of tests) {
    console.log(`\n=== ${t}`);
    const r = spawnSync(process.execPath, [path.join(dir, path.basename(t))], { stdio: "inherit", cwd: __dirname });
    results.push([t, r.status === 0]);
  }
  console.log("\n=== Summary");
  for (const [t, ok] of results) {
    console.log(`${ok ? "pass" : "FAIL"}  ${t}`);
  }
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
})().catch((e) => {
  console.log("FAILED", e);
  process.exit(1);
});
