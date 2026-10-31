// The formatting bar's bold, italic and strikethrough put their markers where Markdown reads them: not
// around the spaces or the line break at the ends of the selection, around each line on its own, and
// after a line's list or heading marker. Checked with the viewer's Markdown parser.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const MarkdownIt = require(require.resolve("markdown-it", { paths: [require.resolve("react-native-markdown-display")] }));

const { wrap } = require("../src/markdownFormat");

// Applies strikethrough to the part of the text between « and »
function strike(marked) {
  const start = marked.indexOf("«");
  const end = marked.indexOf("»") - 1;
  const edit = wrap({ text: marked.replace("«", "").replace("»", ""), start, end }, "~~", "struck text");
  return { ...edit, selected: edit.text.slice(edit.start, edit.end) };
}

// The text that the viewer strikes through
function struck(text) {
  return [...MarkdownIt().render(text).matchAll(/<s>(.*?)<\/s>/g)].map((x) => x[1]);
}

test("a word, as before", () => {
  const edit = strike("make «this» struck");
  assert.equal(edit.text, "make ~~this~~ struck");
  assert.equal(edit.selected, "this");
  assert.deepEqual(struck(edit.text), ["this"]);
});

test("a selection that ends with a space keeps it outside", () => {
  const edit = strike("make «this »struck");
  assert.equal(edit.text, "make ~~this~~ struck");
  assert.deepEqual(struck(edit.text), ["this"]);
});

test("a whole line with its line break (three clicks)", () => {
  const edit = strike("«first line\n»second line");
  assert.equal(edit.text, "~~first line~~\nsecond line");
  assert.deepEqual(struck(edit.text), ["first line"]);
});

test("several lines: each one, after its list marker, the empty ones left as they are", () => {
  const edit = strike("«- one\n- [ ] two\n\n  - three\n# Four»");
  assert.equal(edit.text, "- ~~one~~\n- [ ] ~~two~~\n\n  - ~~three~~\n# ~~Four~~");
  assert.deepEqual(struck(edit.text), ["one", "two", "three", "Four"]);
  const again = wrap({ text: edit.text, start: edit.start, end: edit.end }, "~~", "struck text");
  assert.equal(again.text, "- one\n- [ ] two\n\n  - three\n# Four", "pressed again, they go away");
});

test("pressed again on a word, it goes away", () => {
  const edit = strike("make «this» struck");
  assert.equal(wrap({ text: edit.text, start: edit.start, end: edit.end }, "~~", "struck text").text, "make this struck");
});

test("only spaces chosen: markers to type between", () => {
  const edit = strike("a « »  b");
  assert.equal(edit.text, "a ~~struck text~~   b");
  assert.equal(edit.selected, "struck text");
});

test("bold the same way", () => {
  const edit = wrap({ text: "one\ntwo\n", start: 0, end: 8 }, "**", "bold text");
  assert.equal(edit.text, "**one**\n**two**\n");
});
