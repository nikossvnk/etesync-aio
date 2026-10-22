// The reminders of events and tasks (pim/reminders.ts): they're saved as VALARMs the way Android's
// calendar reads them (relative to the start, or to the due date of a task), the ones another app
// made keep what they have, and the notifications are due at the right times (also of the times of
// a repeating event, and of one that was changed with its own reminders).
process.env.TZ = "UTC";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { EventType, TaskType } = require("../src/pim/pim-types");
const { reminderLabel, remindersOf, setReminders, upcomingNotices } = require("../src/pim/reminders");
const { dateFormats } = require("../src/pim/format");
const { changeOccurrence, updateSeries } = require("../src/pim/recurrence");

const fmt = dateFormats("en-gb");
const ics = (...lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", ...lines.flat(), "END:VCALENDAR", ""].join("\r\n");
const alarm = (...lines) => ["BEGIN:VALARM", ...lines, "END:VALARM"];

function eventOf(...lines) {
  const event = EventType.parse(ics(lines.flat()));
  event.collectionUid = "cal";
  event.itemUid = "item";
  return event;
}

// The VALARMs as text, as they're saved
const alarmsOf = (comp) => comp.getAllSubcomponents("valarm").map((x) => x.toString().replace(/\r\n/g, "\n"));

test("new reminders are saved as Android reads them, and those of another app keep what they have", () => {
  const event = eventOf("BEGIN:VEVENT", "UID:a", "DTSTART:20261023T090000Z", "DTEND:20261023T100000Z", "SUMMARY:Dentist",
    alarm("ACTION:DISPLAY", "DESCRIPTION:Dentist", "TRIGGER;RELATED=START:-PT1H", "X-WR-ALARMUID:from-android"),
    alarm("ACTION:DISPLAY", "DESCRIPTION:Set", "TRIGGER;VALUE=DATE-TIME:20261022T180000Z"), "END:VEVENT");
  const reminders = remindersOf(event.component);
  assert.deepEqual(reminders.map((x) => x.seconds), [-3600, undefined]);
  assert.deepEqual(reminders.map((x) => reminderLabel(x, false, false, fmt)), ["1 hour before", "On 22 Oct at 18:00"]);

  setReminders(event.component, [...reminders, { seconds: -15 * 60 }]);
  const saved = alarmsOf(EventType.parse(event.toIcal()).component);
  assert.equal(saved.length, 3);
  assert.match(saved[0], /X-WR-ALARMUID:from-android/);
  assert.match(saved[1], /TRIGGER;VALUE=DATE-TIME:20261022T180000Z/);
  assert.equal(saved[2], "BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Dentist\nTRIGGER:-PT15M\nEND:VALARM");

  // Removing one leaves the others
  setReminders(event.component, remindersOf(event.component).filter((x) => x.seconds !== -3600));
  assert.deepEqual(remindersOf(event.component).map((x) => x.seconds), [undefined, -900]);
});

test("a task's reminders are relative to its due date, and an all day one's at a time of the day", () => {
  const task = TaskType.parse(ics("BEGIN:VTODO", "UID:t", "DUE;VALUE=DATE:20261030", "SUMMARY:Pay rent", "END:VTODO"));
  setReminders(task.component, [{ seconds: 9 * 3600 }, { seconds: -15 * 3600 }]);
  assert.deepEqual(alarmsOf(task.component).map((x) => x.match(/TRIGGER.*/)[0]), ["TRIGGER;RELATED=END:PT9H", "TRIGGER;RELATED=END:-PT15H"]);
  assert.deepEqual(remindersOf(task.component).map((x) => reminderLabel(x, true, true, fmt)), ["On the day at 09:00", "The day before at 09:00"]);

  const notices = upcomingNotices([], [task], new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), fmt);
  assert.deepEqual(notices.map((x) => [new Date(x.at).toISOString(), x.title, x.body]),
    [["2026-10-29T09:00:00.000Z", "Pay rent", "Due Friday 30 October"], ["2026-10-30T09:00:00.000Z", "Pay rent", "Due Friday 30 October"]]);
  // (one that's done doesn't remind)
  task.status = "COMPLETED";
  assert.deepEqual(upcomingNotices([], [task], new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), fmt), []);
});

test("a repeating event reminds before each of its times, and a changed time with its own reminders", () => {
  const event = eventOf("BEGIN:VEVENT", "UID:r", "DTSTART:20150105T090000Z", "DTEND:20150105T093000Z", "SUMMARY:Standup", "LOCATION:Room 3",
    "RRULE:FREQ=DAILY", "EXDATE:20261021T090000Z", alarm("ACTION:DISPLAY", "DESCRIPTION:Standup", "TRIGGER:-PT10M"), "END:VEVENT",
    "BEGIN:VEVENT", "UID:r", "RECURRENCE-ID:20261022T090000Z", "DTSTART:20261022T110000Z", "DTEND:20261022T113000Z", "SUMMARY:Standup (late)",
    alarm("ACTION:DISPLAY", "DESCRIPTION:Late", "TRIGGER:-PT1H"), "END:VEVENT");
  const notices = upcomingNotices([event], [], new Date("2026-10-20T00:00:00Z"), new Date("2026-10-24T00:00:00Z"), fmt);
  assert.deepEqual(notices.map((x) => [new Date(x.at).toISOString().slice(0, 16), x.title, x.body]), [
    ["2026-10-20T08:50", "Standup", "Tuesday 20 October, 09:00–09:30 · Room 3"],
    // (the changed time has no place)
    ["2026-10-22T10:00", "Standup (late)", "Thursday 22 October, 11:00–11:30"],
    ["2026-10-23T08:50", "Standup", "Friday 23 October, 09:00–09:30 · Room 3"],
  ]);
  assert.equal(new Set(notices.map((x) => x.key)).size, 3);
});

test("reminders that aren't shown on a screen, or were dismissed in another app, aren't notifications", () => {
  const event = eventOf("BEGIN:VEVENT", "UID:e", "DTSTART:20261023T090000Z", "DTEND:20261023T100000Z", "SUMMARY:Call",
    alarm("ACTION:EMAIL", "DESCRIPTION:Call", "SUMMARY:Call", "ATTENDEE:mailto:me@example.invalid", "TRIGGER:-PT30M"),
    alarm("ACTION:DISPLAY", "DESCRIPTION:Call", "TRIGGER:-PT1H", "ACKNOWLEDGED:20261023T080100Z"),
    alarm("ACTION:AUDIO", "TRIGGER:-PT5M"), "END:VEVENT");
  const notices = upcomingNotices([event], [], new Date("2026-10-23T00:00:00Z"), new Date("2026-10-24T00:00:00Z"), fmt);
  assert.deepEqual(notices.map((x) => new Date(x.at).toISOString().slice(11, 16)), ["08:55"]);
});

test("changing the reminders of all the times changes those of the changed times that had the same", () => {
  const before = eventOf("BEGIN:VEVENT", "UID:s", "DTSTART:20261019T090000Z", "DTEND:20261019T093000Z", "SUMMARY:Standup",
    "RRULE:FREQ=DAILY", alarm("ACTION:DISPLAY", "DESCRIPTION:Standup", "TRIGGER:-PT10M"), "END:VEVENT");
  // One time with another title (it has the event's reminders), and another with a reminder of its own
  const time = (day) => {
    const ret = before.startDate.clone();
    ret.adjust(day, 0, 0, 0);
    return ret;
  };
  changeOccurrence(before, time(1), (x) => (x.summary = "Standup (short)"));
  changeOccurrence(before, time(2), (x) => setReminders(x.component, [{ seconds: -3600 }]));
  assert.equal(before.changedTimes.length, 2);

  const event = before.clone();
  setReminders(event.component, [{ seconds: -30 * 60 }]);
  updateSeries(event, before);
  const triggers = event.changedTimes.map((x) => alarmsOf(x).map((a) => a.match(/TRIGGER.*/)[0]));
  assert.deepEqual(triggers, [["TRIGGER:-PT30M"], ["TRIGGER:-PT1H"]]);
});
