// Where the hours of the calendar show events (placeEvents): at the hours of the clock, also on the
// days the clocks change, which have 23 or 25 hours.
process.env.TZ = "Europe/Berlin";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { placeEvents } = require("../src/pim/TimeGrid");

const hourHeight = 48;

function placed(day, start, end) {
  const [x] = placeEvents([{ key: "x", start, end, allDay: false }], day);
  return { top: x.top / hourHeight, height: x.height / hourHeight };
}

test("on an ordinary day, an event is at its hours", () => {
  assert.deepEqual(placed(new Date(2026, 9, 20), new Date(2026, 9, 20, 10, 0), new Date(2026, 9, 20, 11, 30)), { top: 10, height: 1.5 });
});

test("on the day the clocks go back (25 hours), 10:00 is still at 10:00", () => {
  assert.deepEqual(placed(new Date(2026, 9, 25), new Date(2026, 9, 25, 10, 0), new Date(2026, 9, 25, 11, 0)), { top: 10, height: 1 });
});

test("on the day the clocks go forward (23 hours), 10:00 is still at 10:00", () => {
  assert.deepEqual(placed(new Date(2026, 2, 29), new Date(2026, 2, 29, 10, 0), new Date(2026, 2, 29, 11, 0)), { top: 10, height: 1 });
});

test("an event across the change is as long as it is on the clock", () => {
  // 01:00 to 05:00 on the clock is five hours on the day the clocks go back
  assert.deepEqual(placed(new Date(2026, 9, 25), new Date(2026, 9, 25, 1, 0), new Date(2026, 9, 25, 5, 0)), { top: 1, height: 4 });
});

test("an event that ends at midnight reaches the bottom of the day", () => {
  assert.deepEqual(placed(new Date(2026, 9, 25), new Date(2026, 9, 25, 22, 0), new Date(2026, 9, 26)), { top: 22, height: 2 });
});
