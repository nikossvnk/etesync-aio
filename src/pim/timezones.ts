// SPDX-FileCopyrightText: © 2026 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The time zones of events, made from the browser's own time zone data (Intl): every zone the
// browser knows works, with the rules it has, which it keeps up to date. Each one is written as the
// VTIMEZONE of iCalendar (RFC 5545) that ical.js and other calendars read: the rules that repeat
// every year as RRULEs, and the changes that don't as RDATEs.

import * as ICAL from "ical.js";

const second = 1000;
const day = 24 * 3600 * second;

// The changes are worked out from here to 20 years from now (later ones are the rules of the last
// years, which go on)
const firstYear = 1970;
const yearsAhead = 20;

const formatters = new Map<string, Intl.DateTimeFormat>();

// A formatter for the time zone, or undefined if the browser doesn't know it
function formatterOf(zone: string) {
  if (!formatters.has(zone)) {
    try {
      formatters.set(zone, new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23",
        year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
      }));
    } catch (e) {
      return undefined;
    }
  }
  return formatters.get(zone);
}

// The offset from UTC in the time zone at a moment, in seconds
function offsetAt(format: Intl.DateTimeFormat, ms: number) {
  const parts: { [type: string]: number } = {};
  for (const part of format.formatToParts(ms)) {
    parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wall - Math.floor(ms / second) * second) / second);
}

interface Change {
  // The moment of the change, and the offsets before and after it (in seconds)
  at: number;
  from: number;
  to: number;
}

// The changes of offset between the two moments: it looks at every week, and finds the second of
// each change in between
function changesOf(format: Intl.DateTimeFormat, start: number, end: number) {
  const changes: Change[] = [];
  let before = offsetAt(format, start);
  for (let t = start; t < end; t += 7 * day) {
    const next = Math.min(t + 7 * day, end);
    const after = offsetAt(format, next);
    if (after !== before) {
      // The first second with the new offset
      let lo = t / second, hi = next / second;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetAt(format, mid * second) === before) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      changes.push({ at: hi * second, from: before, to: after });
      before = after;
    }
  }
  return changes;
}

// A change as it is on the clock just before it (VTIMEZONEs give them in local time)
function localOf(change: Change) {
  const d = new Date(change.at + change.from * second);
  const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, date = d.getUTCDate();
  return {
    year, month, day: date, weekday: d.getUTCDay(),
    time: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(),
    // Which one of the weekday it is in the month (1 to 5), and whether it's the last one
    nth: Math.ceil(date / 7),
    last: date + 7 > new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

// How a change can be repeated every year: the nth weekday of the month (e.g. 2SU), the last one
// (-1SU), or the weekday in a week of days of the month (e.g. the Friday of the 23rd to the 29th)
interface Rule {
  month: number;
  weekday: number;
  time: number;
  from: number;
  to: number;
  nth?: number;
  last: boolean;
  // The first and the last days of the month that it was on
  firstDay: number;
  lastDay: number;
}

function ruleOf(change: Change): Rule {
  const l = localOf(change);
  return { month: l.month, weekday: l.weekday, time: l.time, from: change.from, to: change.to, nth: l.nth, last: l.last, firstDay: l.day, lastDay: l.day };
}

// The rule of both changes, or undefined if they can't have one
function joinRules(a: Rule, b: Rule): Rule | undefined {
  if ((a.month !== b.month) || (a.weekday !== b.weekday) || (a.time !== b.time) || (a.from !== b.from) || (a.to !== b.to)) {
    return undefined;
  }
  const joined = {
    ...a,
    nth: (a.nth === b.nth) ? a.nth : undefined,
    last: a.last && b.last,
    firstDay: Math.min(a.firstDay, b.firstDay),
    lastDay: Math.max(a.lastDay, b.lastDay),
  };
  return ((joined.nth && (joined.nth <= 4)) || joined.last || (joined.lastDay - joined.firstDay <= 6)) ? joined : undefined;
}

const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function recurOf(rule: Rule, until?: number) {
  const byday = weekdays[rule.weekday];
  const parts = [`FREQ=YEARLY`, `BYMONTH=${rule.month}`];
  if (rule.nth && (rule.nth <= 4)) {
    parts.push(`BYDAY=${rule.nth}${byday}`);
  } else if (rule.last) {
    parts.push(`BYDAY=-1${byday}`);
  } else {
    const days = Array.from({ length: 7 }, (_, i) => rule.firstDay + i).filter((x) => x <= 31);
    parts.push(`BYDAY=${byday}`, `BYMONTHDAY=${days.join(",")}`);
  }
  if (until !== undefined) {
    parts.push(`UNTIL=${utcString(until)}`);
  }
  return ICAL.Recur.fromString(parts.join(";"));
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function utcString(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// The local time of a change, as a floating time
function localTime(change: Change) {
  const d = new Date(change.at + change.from * second);
  return ICAL.Time.fromData({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), isDate: false });
}

// An offset as ical.js reads it (e.g. "+05:30", it leaves out seconds)
function offsetString(seconds: number) {
  const minutes = Math.round(Math.abs(seconds) / 60);
  return `${(seconds < 0) ? "-" : "+"}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function observance(from: number, to: number, start: ICAL.Time) {
  const comp = new ICAL.Component((to > from) ? "daylight" : "standard");
  comp.addPropertyWithValue("dtstart", start);
  comp.addPropertyWithValue("tzoffsetfrom", ICAL.UtcOffset.fromString(offsetString(from)));
  comp.addPropertyWithValue("tzoffsetto", ICAL.UtcOffset.fromString(offsetString(to)));
  return comp;
}

// The VTIMEZONE of a time zone the browser knows, named `tzid` (the name of the zone, or another
// one of it, e.g. Windows' "W. Europe Standard Time"), or null if the browser doesn't know it
export function vtimezoneOf(zone: string, tzid = zone, now = new Date()) {
  const format = formatterOf(zone);
  if (!format) {
    return null;
  }
  const lastYear = now.getUTCFullYear() + yearsAhead;
  const changes = changesOf(format, Date.UTC(firstYear, 0, 1), Date.UTC(lastYear + 1, 0, 1));
  const comp = new ICAL.Component("vtimezone");
  comp.addPropertyWithValue("tzid", tzid);
  // The offset before the first change (ical.js takes times before the first observance as UTC, so
  // this one starts long before)
  const initial = offsetAt(format, Date.UTC(firstYear, 0, 1));
  comp.addSubcomponent(observance(initial, initial, ICAL.Time.fromData({ year: 1601, month: 1, day: 1, hour: 0, minute: 0, second: 0, isDate: false })));

  // The changes of each year
  const years = new Map<number, Change[]>();
  for (const change of changes) {
    const year = localOf(change).year;
    years.set(year, [...(years.get(year) ?? []), change]);
  }
  // The years are split into runs whose changes repeat with the same rules, from the last year back
  // (so that the last run, which goes on, is as long as can be)
  const single: Change[] = [];
  let year = lastYear;
  while (year >= firstYear) {
    let rules = (years.get(year) ?? []).map(ruleOf);
    let start = year;
    while (start - 1 >= firstYear) {
      const earlier = years.get(start - 1) ?? [];
      if (earlier.length !== rules.length) {
        break;
      }
      const joined = rules.map((rule, i) => joinRules(rule, ruleOf(earlier[i])));
      if (joined.some((x) => !x)) {
        break;
      }
      rules = joined as Rule[];
      start--;
    }
    // Repeating rules for runs of three years or more, the changes one by one for shorter ones
    const run = Array.from({ length: year - start + 1 }, (_, i) => years.get(start + i) ?? []);
    if ((run.length >= 3) && rules.length) {
      rules.forEach((rule, i) => {
        const first = run[0][i];
        const sub = observance(rule.from, rule.to, localTime(first));
        sub.addPropertyWithValue("rrule", recurOf(rule, (year === lastYear) ? undefined : run[run.length - 1][i].at));
        comp.addSubcomponent(sub);
      });
    } else {
      single.push(...run.flat());
    }
    year = start - 1;
  }
  // The other changes, with the same offsets in one observance each. ical.js only reads the first
  // value of an RDATE, and not DTSTART when there are RDATEs, so each one is an RDATE of its own,
  // the first one too.
  const groups = new Map<string, Change[]>();
  for (const change of single.sort((a, b) => a.at - b.at)) {
    const key = `${change.from} ${change.to}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  for (const group of groups.values()) {
    const sub = observance(group[0].from, group[0].to, localTime(group[0]));
    if (group.length > 1) {
      for (const change of group) {
        sub.addPropertyWithValue("rdate", localTime(change));
      }
    }
    comp.addSubcomponent(sub);
  }
  return comp;
}

// The names of the time zones the browser knows
export function knownTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch (e) {
    return [];
  }
}
