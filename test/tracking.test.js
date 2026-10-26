// Tracking parameters are taken out of the links of bookmarks: only the well-known ones, and without
// changing anything else in the link.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const { withoutTracking, enteredUrl, comparableUrl, metaOf } = require("../src/bookmarks");

test("tracking parameters are taken out, and the others are kept in their order", () => {
  assert.equal(withoutTracking("https://example.com/a?utm_source=news&utm_medium=email"), "https://example.com/a");
  assert.equal(withoutTracking("https://example.com/a?id=4&fbclid=IwAR0x&page=2"), "https://example.com/a?id=4&page=2");
  assert.equal(withoutTracking("https://example.com/?gclid=1&q=a+b%20c#part"), "https://example.com/?q=a+b%20c#part");
  assert.equal(withoutTracking("https://example.com/?UTM_Campaign=x&%75tm_term=y"), "https://example.com/");
  // (without a scheme, as it's often written)
  assert.equal(withoutTracking("example.com/a?mc_cid=1&b=2"), "example.com/a?b=2");
  assert.equal(withoutTracking("https://example.com/a?_hsenc=1&_hsmi=2#top"), "https://example.com/a#top");
});

test("the ones of some sites are only taken out there", () => {
  assert.equal(withoutTracking("https://youtu.be/dQw4w9WgXcQ?si=abc&t=42"), "https://youtu.be/dQw4w9WgXcQ?t=42");
  assert.equal(withoutTracking("https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&si=abc"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(withoutTracking("https://m.youtube.com/watch?v=x&si=abc"), "https://m.youtube.com/watch?v=x");
  assert.equal(withoutTracking("https://open.spotify.com/track/1?si=abc"), "https://open.spotify.com/track/1");
  assert.equal(withoutTracking("https://x.com/someone/status/1?s=20&t=abc"), "https://x.com/someone/status/1");
  assert.equal(withoutTracking("https://example.com/search?s=20&t=abc&si=1&feature=x"), "https://example.com/search?s=20&t=abc&si=1&feature=x");
});

test("other links are left exactly as they are", () => {
  for (const url of [
    "https://example.com/a?id=4&page=2",
    "https://example.com/a?x=%E2%82%AC&y=a%2Fb&&z",
    "https://example.com/#/route?utm_source=x",
    "https://example.com/a?utmost=1&butm_source=2",
    "https://example.com/a?%E0%A4%A=1",
    "mailto:someone@example.com?subject=utm_source&utm_source=x",
    "https://example.com",
    "",
  ]) {
    assert.equal(withoutTracking(url), url);
  }
});

test("a pasted link is cleaned at once, a typed one only when it's saved", () => {
  assert.equal(enteredUrl("", "https://example.com/?utm_source=x"), "https://example.com/");
  assert.equal(enteredUrl("https://", "https://example.com/?a=1&fbclid=2"), "https://example.com/?a=1");
  assert.equal(enteredUrl("https://example.com/?utm", "https://example.com/?utm_"), "https://example.com/?utm_");
  assert.equal(metaOf({ url: "example.com/?utm_source=x&a=1", title: "", note: "", tags: [] }, 1).url, "https://example.com/?a=1");
});

test("a link with tracking parameters is the same page as the one without", () => {
  assert.equal(comparableUrl("https://www.example.com/a/?utm_source=news"), comparableUrl("http://example.com/a"));
  assert.notEqual(comparableUrl("https://example.com/a?id=1"), comparableUrl("https://example.com/a"));
});
