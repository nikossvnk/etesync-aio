// Serves the web build of the app (default: ../web-build) on port 8765, with every unknown path
// answered by index.html, so that the app's own URLs (e.g. /settings/about) work when loaded directly.
// /bookmark-title reads the title of a web page, like desktop/serve.py does.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || path.join(__dirname, "..", "web-build"));
const port = Number(process.env.PORT || 8765);
// (read from desktop/serve.py, which the installed app is served by)
const csp = fs.readFileSync(path.join(__dirname, "..", "desktop", "serve.py"), "utf8")
  .match(/^CSP = "; ".join\(\[([\s\S]*?)\]\)/m)[1]
  .split("\n").map((x) => x.trim()).filter((x) => x.startsWith("\"")).map((x) => JSON.parse(x.replace(/,$/, ""))).join("; ");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
// The title of a web page (its og:title, or else its <title>), as desktop/serve.py reads it
async function pageTitle(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EteSync bookmarks)" }, signal: AbortSignal.timeout(10000) });
  const text = (await response.text()).slice(0, 300000);
  const m = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(text) || /<title[^>]*>([^<]*)<\/title>/i.exec(text);
  const entities = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#39": "'" };
  return (m) ? m[1].replace(/&(\w+|#\d+);/g, (all, x) => entities[x] ?? all).replace(/\s+/g, " ").trim() || null : null;
}

http.createServer(async (req, res) => {
  if (req.url.startsWith("/bookmark-title?")) {
    const url = new URL(req.url, "http://localhost").searchParams.get("url") || "";
    if ((req.headers["x-etesync-request"] !== "title") || !/^https?:/i.test(url)) {
      res.writeHead(403).end();
      return;
    }
    const title = await pageTitle(url).catch(() => null);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ title }));
    return;
  }
  let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    f = path.join(root, "index.html");
  }
  // The same security headers as desktop/serve.py, so that the tests run under its policy
  res.writeHead(200, {
    "Content-Type": types[path.extname(f)] || "application/octet-stream",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  fs.createReadStream(f).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://localhost:${port}`));
