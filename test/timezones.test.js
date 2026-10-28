// The time zones of events, made from the browser's data (Intl): ical.js finds the same moments as
// Intl from the times on the clock, in zones with odd rules, also when it reads them back from the
// text that's saved; and events are saved with their time zone, never as floating times.
process.env.TZ = "America/New_York";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const ICAL = require("ical.js");

const { vtimezoneOf } = require("../src/pim/timezones");
const { EventType, timezoneLoadFromName } = require("../src/pim/pim-types");

const hour = 3600 * 1000;

function wallClock(format, t) {
  const p = Object.fromEntries(format.formatToParts(t).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: 0 };
}

// The times (as moments) at which ical.js, from the clock's time, finds another moment than Intl
function wrongTimes(name, zone, times) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: name, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const wrong = [];
  for (const t of times) {
    const wall = wallClock(format, t);
    const back = ICAL.Time.fromData({ ...wall, isDate: false }, zone).toUnixTime() * 1000;
    // (the same time on the clock; after the clocks went back it's there twice, either one will do)
    if (JSON.stringify(wallClock(format, back)) !== JSON.stringify(wall)) {
      wrong.push(new Date(t).toISOString());
    }
  }
  return wrong;
}

// Every ten days from 1971 to 2035 (from 2036 on ical.js doesn't work out the changes), and the
// hours around the changes of 2024 to 2028
function timesOf(name) {
  const times = [];
  for (let t = Date.UTC(1971, 0, 1); t < Date.UTC(2035, 0, 1); t += 241 * hour) {
    times.push(t);
  }
  const format = new Intl.DateTimeFormat("en-US", { timeZone: name, timeZoneName: "longOffset" });
  const offset = (t) => format.formatToParts(t).find((x) => x.type === "timeZoneName").value;
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += hour) {
    if (offset(t) !== offset(t + hour)) {
      for (let m = -150; m <= 150; m += 30) {
        times.push(t + hour + m * 60 * 1000);
      }
    }
  }
  return times;
}

const zones = [
  "Europe/Berlin", "America/New_York", "Pacific/Auckland", "Australia/Lord_Howe", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Jerusalem", "America/Santiago", "Africa/Casablanca", "America/Sao_Paulo",
  "America/Mexico_City", "Europe/Dublin", "Etc/GMT+5",
  // Names the time zone table of etesync-web didn't have, which Chromium uses
  "America/Indianapolis", "America/Cordoba", "America/Ciudad_Juarez", "America/Coyhaique",
];

for (const name of zones) {
  test(`${name}: the moments of the times on the clock are those of Intl, also read back from the text`, () => {
    const comp = vtimezoneOf(name, name, new Date("2026-10-28T12:00:00Z"));
    const times = timesOf(name);
    assert.deepEqual(wrongTimes(name, new ICAL.Timezone(comp), times), []);
    const text = comp.toString();
    assert.deepEqual(wrongTimes(name, new ICAL.Timezone(ICAL.Component.fromString(text)), times), []);
  });
}

test("the rules that repeat are saved as yearly rules, not as every change", () => {
  const text = vtimezoneOf("Europe/Berlin", "Europe/Berlin", new Date("2026-10-28T12:00:00Z")).toString();
  assert.match(text, /DTSTART:19960331T020000\r\nTZOFFSETFROM:\+0100\r\nTZOFFSETTO:\+0200\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\n/);
  assert.match(text, /DTSTART:19961027T030000\r\nTZOFFSETFROM:\+0200\r\nTZOFFSETTO:\+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\n/);
  // Israel's start of summer time is the Friday before the last Sunday of March
  const jerusalem = vtimezoneOf("Asia/Jerusalem", "Asia/Jerusalem", new Date("2026-10-28T12:00:00Z")).toString();
  assert.match(jerusalem, /RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29\r\n/);
});

test("a name the browser doesn't know has no time zone; Windows' names are those of the zone", () => {
  assert.equal(timezoneLoadFromName("Mars/Olympus_Mons"), null);
  assert.equal(timezoneLoadFromName("floating"), null);
  const windows = timezoneLoadFromName("W. Europe Standard Time");
  assert.equal(windows.tzid, "W. Europe Standard Time");
  assert.equal(ICAL.Time.fromData({ year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0, isDate: false }, windows).toJSDate().toISOString(), "2026-07-01T10:00:00.000Z");
});

test("an event in a zone the old table didn't know is saved in it, and read back at the same moment", () => {
  const zone = timezoneLoadFromName("America/Indianapolis");
  const event = new EventType();
  event.uid = "tz-test";
  event.summary = "Meeting";
  event.startDate = ICAL.Time.fromData({ year: 2026, month: 11, day: 2, hour: 9, minute: 30, second: 0, isDate: false }, zone);
  event.endDate = ICAL.Time.fromData({ year: 2026, month: 11, day: 2, hour: 10, minute: 30, second: 0, isDate: false }, zone);
  const text = event.toIcal();
  assert.match(text, /DTSTART;TZID=America\/Indianapolis:20261102T093000\r\n/);
  assert.match(text, /BEGIN:VTIMEZONE\r\nTZID:America\/Indianapolis\r\n/);
  const back = EventType.parse(text);
  // 09:30 in Indiana on 2 November 2026 (after the clocks went back, -05:00)
  assert.equal(back.startDate.toJSDate().toISOString(), "2026-11-02T14:30:00.000Z");
});
