// Which links the installed app hands to its local server, to open them in the default browser: links
// to other sites, and email and phone links, but not the app's own pages, nor anything else.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const { outsideLink } = require("../src/externalLinks");

const base = "http://localhost:8092/bookmarks";

test("links to other sites, and email and phone links, are opened by the server", () => {
  assert.equal(outsideLink("https://en.wikipedia.org/wiki/Spreewald", base), "https://en.wikipedia.org/wiki/Spreewald");
  assert.equal(outsideLink(new URL("http://example.com"), base), "http://example.com/");
  // (another port is another site)
  assert.equal(outsideLink("http://localhost:3000/", base), "http://localhost:3000/");
  assert.equal(outsideLink("mailto:someone@example.com", base), "mailto:someone@example.com");
  assert.equal(outsideLink("tel:+301234567", base), "tel:+301234567");
});

test("the app's own pages, and other kinds of links, are not", () => {
  for (const url of ["/notes", "http://localhost:8092/settings", "#top", "blob:http://localhost:8092/1234", "data:text/plain,hi", "javascript:alert(1)", "file:///etc/passwd", "http://[", undefined]) {
    assert.equal(outsideLink(url, base), undefined, String(url));
  }
});
