// The times the app writes of when an event or a task was changed (LAST-MODIFIED) are in UTC, as
// RFC 5545 asks (with a Z), not times of this device's clock without a time zone, which other apps
// read as other moments. In New York, so that the two would differ.
process.env.TZ = "America/New_York";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { EventType, TaskType } = require("../src/pim/pim-types");
const { changeOccurrence } = require("../src/pim/recurrence");

function parse(type, ...lines) {
  return type.parse(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", ...lines, "END:VCALENDAR", ""].join("\r\n"));
}

// The LAST-MODIFIED lines of the text, each as the moment it says, when it's in UTC
function lastModified(text) {
  return text.split("\r\n").filter((l) => l.startsWith("LAST-MODIFIED")).map((l) => {
    const m = /^LAST-MODIFIED:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(l);
    return (m) ? Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]) : l;
  });
}

// Whether each one is a moment within the test (and not a line that isn't in UTC)
function isNow(times, before, after) {
  return (times.length > 0) && times.every((t) => (typeof t === "number") && (t >= before - 1000) && (t <= after + 1000));
}

test("a time of a repeating event that's changed on its own says when, in UTC", () => {
  const event = parse(EventType, "BEGIN:VEVENT", "UID:standup", "DTSTAMP:20261001T000000Z", "DTSTART:20261026T140000Z",
    "DTEND:20261026T143000Z", "SUMMARY:Standup", "RRULE:FREQ=DAILY;COUNT=5", "END:VEVENT");
  const before = Date.now();
  changeOccurrence(event, event.startDate.clone(), (x) => (x.summary = "Standup (short)"));
  const times = lastModified(event.toIcal());
  assert.ok(isNow(times, before, Date.now()), JSON.stringify(times));
});

test("the next time of a repeating task, made when it's done, says when, in UTC", () => {
  const task = parse(TaskType, "BEGIN:VTODO", "UID:water", "DTSTAMP:20261001T000000Z", "DUE;VALUE=DATE:20261001",
    "SUMMARY:Water the plants", "RRULE:FREQ=WEEKLY", "END:VTODO");
  const before = Date.now();
  const next = task.getNextOccurence();
  const times = lastModified(next.toIcal());
  assert.ok(isNow(times, before, Date.now()), JSON.stringify(times));
});
