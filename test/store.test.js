// The store: saving many items is one change of it (each change makes the screens look at it again),
// and the notes part's view of the cache stays the same while no notebook or note changed.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Map: ImmutableMap } = require("immutable");

const { store } = require("../src/store");
const { notesView } = require("../src/store/construct");
const { SyncManager, saveItemsLocally } = require("../src/sync/SyncManager");

test("saving 200 items changes the store a few times, and they're all saved and queued to be uploaded", async () => {
  // (no syncing here, that would need a server)
  SyncManager.prototype.sync = async () => undefined;
  const etebase = { user: { username: "tester" } };
  const col = { uid: "contacts" };
  const itemMgr = { cacheSave: (item) => new TextEncoder().encode(item.uid) };
  const items = Array.from({ length: 200 }, (_x, i) => ({ uid: `item${i}`, isDeleted: false, getMeta: () => ({ name: `item${i}` }) }));

  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  await saveItemsLocally(etebase, col, itemMgr, items);
  unsubscribe();

  const state = store.getState();
  assert.equal(state.allCache.items.get("contacts").size, 200);
  assert.equal(new TextDecoder().decode(state.allCache.items.getIn(["contacts", "item42"]).cache), "item42");
  assert.equal(state.allCache.items.getIn(["contacts", "item42"]).meta.name, "item42");
  assert.equal(state.sync.items.get("contacts").size, 200);
  assert.ok(changes <= 5, `the store changed ${changes} times`);
});

test("the notes part's view of the cache stays the same while no notebook or note changed", () => {
  const notebook = { cache: "nb", meta: { name: "My Notes" }, collectionType: "etebase.md.note" };
  const calendar = { cache: "cal", meta: { name: "Work" }, collectionType: "etebase.vevent" };
  const note = { cache: "n", meta: { name: "Shopping" }, isDeleted: false };
  const first = {
    collections: ImmutableMap({ nb: notebook, cal: calendar }),
    items: ImmutableMap({ nb: ImmutableMap({ n: note }), cal: ImmutableMap() }),
  };
  const view = notesView(first);
  assert.deepEqual(Array.from(view.collections.keys()), ["nb"]);
  assert.deepEqual(Array.from(view.items.keys()), ["nb"]);

  // An event saved: everything is a new object, but not for the notes
  const eventSaved = { ...first, items: first.items.setIn(["cal", "e"], { cache: "e", meta: { name: "e" }, isDeleted: false }) };
  assert.equal(notesView(eventSaved), view);

  // A note saved
  const noteSaved = { ...eventSaved, items: eventSaved.items.setIn(["nb", "n"], { ...note, meta: { name: "Shopping list" } }) };
  const after = notesView(noteSaved);
  assert.notEqual(after.items, view.items);
  assert.equal(after.collections, view.collections);
  assert.equal(after.items.getIn(["nb", "n"]).meta.name, "Shopping list");

  // A notebook renamed
  const renamed = { ...noteSaved, collections: noteSaved.collections.set("nb", { ...notebook, meta: { name: "Notes" } }) };
  assert.equal(notesView(renamed).collections.get("nb").meta.name, "Notes");
  assert.equal(notesView(renamed).items, after.items);
});
