// The times of events that the calendar shows (occurrencesBetween): a repeating event that started
// long ago is shown at the right times, with its changed and cancelled times, without working out
// each of its times since it started; and one whose times can't all be worked out isn't shown twice.
// Also which old events "Delete old events" deletes.
process.env.TZ = "UTC";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const ICAL = require("ical.js");

const { EventType } = require("../src/pim/pim-types");
const { occurrencesBetween } = require("../src/pim/occurrences");

const calendars = [{ colUid: "cal", name: "Work", color: "#7B98F2", collectionType: "etebase.vevent" }];

function eventOf(...components) {
  const event = EventType.parse(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", ...components.flat(), "END:VCALENDAR", ""].join("\r\n"));
  event.collectionUid = "cal";
  event.itemUid = "item";
  return event;
}

// Counts how many times ical.js is asked for the details of a time
function countDetails(fn) {
  const original = ICAL.Event.prototype.getOccurrenceDetails;
  let count = 0;
  ICAL.Event.prototype.getOccurrenceDetails = function (...args) {
    count++;
    return original.apply(this, args);
  };
  try {
    return { result: fn(), count };
  } finally {
    ICAL.Event.prototype.getOccurrenceDetails = original;
  }
}

const week = [new Date("2026-10-19T00:00:00Z"), new Date("2026-10-26T00:00:00Z")];
const shown = (occurrences) => occurrences.map((x) => `${x.start.toISOString().slice(0, 16)} ${x.title}`);

test("a daily event since 2015 is shown on the days of the week, without its cancelled times", () => {
  const event = eventOf(
    ["BEGIN:VEVENT", "UID:daily", "DTSTART:20150105T090000Z", "DTEND:20150105T100000Z", "SUMMARY:Standup",
      "RRULE:FREQ=DAILY", "EXDATE:20261021T090000Z", "END:VEVENT"],
    // A time of 2015 moved into the week
    ["BEGIN:VEVENT", "UID:daily", "RECURRENCE-ID:20150110T090000Z", "DTSTART:20261020T150000Z", "DTEND:20261020T160000Z",
      "SUMMARY:Moved", "END:VEVENT"],
    // A time cancelled the way some apps do it
    ["BEGIN:VEVENT", "UID:daily", "RECURRENCE-ID:20261022T090000Z", "DTSTART:20261022T090000Z", "DTEND:20261022T100000Z",
      "SUMMARY:Standup", "STATUS:CANCELLED", "END:VEVENT"],
  );
  const { result, count } = countDetails(() => occurrencesBetween([event], calendars, ...week));
  assert.deepEqual(shown(result).sort(), [
    "2026-10-19T09:00 Standup",
    "2026-10-20T09:00 Standup",
    "2026-10-20T15:00 Moved",
    "2026-10-23T09:00 Standup",
    "2026-10-24T09:00 Standup",
    "2026-10-25T09:00 Standup",
  ]);
  assert.equal(result.find((x) => x.title === "Moved").changed, true);
  assert.equal(new Set(result.map((x) => x.key)).size, result.length, "the keys are unique");
  // (it's about 4300 times since 2015: only the ones of the week, and the changed ones, are looked at)
  assert.ok(count < 20, `the details of ${count} times were worked out`);
});

test("when all of the times after one were moved (RANGE=THISANDFUTURE), the week has them at their new time", () => {
  const event = eventOf(
    ["BEGIN:VEVENT", "UID:range", "DTSTART:20150105T090000Z", "DTEND:20150105T100000Z", "SUMMARY:Review",
      "RRULE:FREQ=WEEKLY", "END:VEVENT"],
    ["BEGIN:VEVENT", "UID:range", "RECURRENCE-ID;RANGE=THISANDFUTURE:20150112T090000Z", "DTSTART:20150112T110000Z",
      "DTEND:20150112T120000Z", "SUMMARY:Review", "END:VEVENT"],
  );
  assert.deepEqual(shown(occurrencesBetween([event], calendars, ...week)), ["2026-10-19T11:00 Review"]);
});

test("a repeating event whose later times can't be worked out is shown once, not again at its start", () => {
  const event = eventOf(["BEGIN:VEVENT", "UID:broken", "DTSTART:20261019T090000Z", "DTEND:20261019T100000Z", "SUMMARY:Broken",
    "RRULE:FREQ=DAILY", "END:VEVENT"]);
  // The first time works, the rule fails after it
  event.iterator = () => {
    let calls = 0;
    return {
      next: () => {
        if (calls++ === 0) {
          return ICAL.Time.fromString("2026-10-19T09:00:00Z");
        }
        throw new Error("A rule that can't be read");
      },
    };
  };
  const result = occurrencesBetween([event], calendars, ...week);
  assert.deepEqual(shown(result), ["2026-10-19T09:00 Broken"]);
});

test("an event that doesn't repeat is shown when it's in the range, and not otherwise", () => {
  const event = eventOf(["BEGIN:VEVENT", "UID:once", "DTSTART:20261021T130000Z", "DTEND:20261021T140000Z", "SUMMARY:Lunch", "END:VEVENT"]);
  assert.deepEqual(shown(occurrencesBetween([event], calendars, ...week)), ["2026-10-21T13:00 Lunch"]);
  assert.deepEqual(occurrencesBetween([event], calendars, new Date("2026-10-26T00:00:00Z"), new Date("2026-11-02T00:00:00Z")), []);
});

test("the old events that are deleted are the ones that happened once and ended before the date", () => {
  const once = (uid, start, end) => eventOf(["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20241001T000000Z", `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${uid}`, "END:VEVENT"]);
  const events = [
    once("old", "20240110T100000Z", "20240110T110000Z"),
    once("ends-after", "20241020T100000Z", "20241030T100000Z"),
    once("recent", "20260901T100000Z", "20260901T110000Z"),
    eventOf(["BEGIN:VEVENT", "UID:weekly", "DTSTAMP:20241001T000000Z", "DTSTART:20240110T100000Z", "DTEND:20240110T110000Z",
      "RRULE:FREQ=WEEKLY;COUNT=3", "SUMMARY:weekly", "END:VEVENT"]),
    eventOf(["BEGIN:VEVENT", "UID:allday", "DTSTAMP:20241001T000000Z", "DTSTART;VALUE=DATE:20241025", "DTEND;VALUE=DATE:20241026", "SUMMARY:allday", "END:VEVENT"]),
  ];
  const before = new Date("2024-10-27T00:00:00Z");
  const { oneTimeEventsBefore } = require("../src/pim/occurrences");
  assert.deepEqual(oneTimeEventsBefore(events, before).map((x) => x.uid), ["old", "allday"]);
});
