// Serves the web build of the app (default: ../web-build) on port 8765, with every unknown path
// answered by index.html, so that the app's own URLs (e.g. /settings/about) work when loaded directly.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || path.join(__dirname, "..", "web-build"));
const port = Number(process.env.PORT || 8765);
// (read from local-web/serve.py, which the installed app is served by)
const csp = fs.readFileSync(path.join(__dirname, "..", "local-web", "serve.py"), "utf8")
  .match(/^CSP = "; ".join\(\[([\s\S]*?)\]\)/m)[1]
  .split("\n").map((x) => x.trim()).filter((x) => x.startsWith("\"")).map((x) => JSON.parse(x.replace(/,$/, ""))).join("; ");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    f = path.join(root, "index.html");
  }
  // The same security headers as local-web/serve.py, so that the tests run under its policy
  res.writeHead(200, {
    "Content-Type": types[path.extname(f)] || "application/octet-stream",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  fs.createReadStream(f).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://localhost:${port}`));
