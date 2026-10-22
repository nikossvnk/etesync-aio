// The parsed events, tasks and contacts that the screens show (pim/data.ts): every screen gets the
// same list, which is only made again when an item of its type changed (not when e.g. a note is
// saved), and then only the item that changed is parsed again.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Map: ImmutableMap } = require("immutable");

const { EventType } = require("../src/pim/pim-types");
const { entriesOfType, loadPimItems } = require("../src/pim/data");

const ics = (uid, title) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", "BEGIN:VEVENT", `UID:${uid}`,
  "DTSTART:20261021T130000Z", "DTEND:20261021T140000Z", `SUMMARY:${title}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");

// The cache as the store has it: here an item's encrypted cache is just its content
const cached = (content, name) => ({ cache: content, meta: { name }, isDeleted: false });
const collections = ImmutableMap({
  cal: { cache: "cal", meta: { name: "Work" }, collectionType: "etebase.vevent" },
  notes: { cache: "notes", meta: { name: "My Notes" }, collectionType: "etebase.md.note" },
});
const stateOf = (items) => ({ allCache: { collections, items } });

// An account whose collections and items load from that cache
const etebase = {
  getCollectionManager: () => ({
    cacheLoad: (cache) => cache,
    getItemManager: () => ({ cacheLoad: (cache) => ({ getContent: async () => cache }) }),
  }),
};

function counting(parse) {
  const fn = (content) => {
    fn.count++;
    return parse(content);
  };
  fn.count = 0;
  return fn;
}

const items = ImmutableMap({
  cal: ImmutableMap({ a: cached(ics("a", "Lunch"), "a"), b: cached(ics("b", "Review"), "b") }),
  notes: ImmutableMap({ n: cached("Shopping", "Shopping") }),
});

test("the entries of a type are the same object while none of its items changes", () => {
  const before = stateOf(items);
  const entries = entriesOfType(before, "etebase.vevent");
  assert.equal(entriesOfType(before, "etebase.vevent"), entries);
  // A note saved: other maps, the same events
  const noteSaved = stateOf(items.setIn(["notes", "n"], cached("Shopping, milk", "Shopping")));
  assert.equal(entriesOfType(noteSaved, "etebase.vevent"), entries);
  // An event changed
  const eventChanged = stateOf(noteSaved.allCache.items.setIn(["cal", "b"], cached(ics("b", "Review 2"), "b")));
  assert.notEqual(entriesOfType(eventChanged, "etebase.vevent"), entries);
});

test("the screens get one list, parsed once, and an item that changed is the only one parsed again", async () => {
  const parse = counting(EventType.parse);
  const state = stateOf(items.setIn(["cal", "a"], cached(ics("a", "Lunch at noon"), "a")));
  const entries = entriesOfType(state, "etebase.vevent");
  // (e.g. the calendar and the sidebar, at once)
  const [first, second] = await Promise.all([loadPimItems(etebase, entries, parse), loadPimItems(etebase, entries, parse)]);
  assert.equal(first, second);
  assert.deepEqual(first.map((x) => [x.summary, x.collectionUid, x.itemUid]).sort(), [["Lunch at noon", "cal", "a"], ["Review", "cal", "b"]]);
  const parsed = parse.count;
  assert.ok(parsed <= 2, `parsed ${parsed} times`);

  const changed = stateOf(state.allCache.items.setIn(["cal", "b"], cached(ics("b", "Review moved"), "b")));
  const again = await loadPimItems(etebase, entriesOfType(changed, "etebase.vevent"), parse);
  assert.deepEqual(again.map((x) => x.summary).sort(), ["Lunch at noon", "Review moved"]);
  assert.equal(parse.count, parsed + 1);
});

test("deleted items and those of other types are left out", async () => {
  const state = stateOf(items.setIn(["cal", "a"], { ...cached(ics("a", "Gone"), "a"), isDeleted: true }));
  const list = await loadPimItems(etebase, entriesOfType(state, "etebase.vevent"), EventType.parse);
  assert.deepEqual(list.map((x) => x.summary), ["Review"]);
});
