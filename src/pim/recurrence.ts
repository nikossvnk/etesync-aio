// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The times of repeating events (and tasks), as other calendars save them (RFC 5545): the rule
// (RRULE), the times that were cancelled (EXDATE), and the ones that were changed, which are more
// components of the item with the event's UID and the time they replace (RECURRENCE-ID). Those
// times are the event's start as it was on that day, in its time zone, so when the event's start
// moves, they move with it, or other calendars wouldn't find the times they belong to.

import * as ICAL from "ical.js";

import { EventType } from "./pim-types";

// A time property, with its time zone (as ical.js does it for DTSTART)
function timeProperty(name: string, time: ICAL.Time) {
  const prop = new ICAL.Property(name);
  if (!time.isDate && time.zone && (time.zone !== ICAL.Timezone.localTimezone) && (time.zone !== ICAL.Timezone.utcTimezone)) {
    prop.setParameter("tzid", time.zone.tzid);
  }
  prop.setValue(time);
  return prop;
}

function setRecurrenceId(comp: ICAL.Component, time: ICAL.Time) {
  comp.removeAllProperties("recurrence-id");
  comp.addProperty(timeProperty("recurrence-id", time));
}

function exdates(comp: ICAL.Component): ICAL.Time[] {
  return comp.getAllProperties("exdate").flatMap((x) => x.getValues<ICAL.Time>());
}

function setExdates(comp: ICAL.Component, times: ICAL.Time[]) {
  comp.removeAllProperties("exdate");
  for (const time of times) {
    comp.addProperty(timeProperty("exdate", time));
  }
}

// The start the times of a repeating event (or task) are counted from
function base(event: EventType): ICAL.Time | undefined {
  return event.startDate ?? (event as any).dueDate;
}

export function bumpSequence(comp: ICAL.Component) {
  comp.updatePropertyWithValue("sequence", (Number(comp.getFirstPropertyValue("sequence")) || 0) + 1);
}

// The times are passed around (e.g. in the address of the editor) as their text, e.g.
// "2026-10-06T09:00:00" (in the event's time zone), "2026-10-06T07:00:00Z" or "2026-10-06"
export function occurrenceId(time: ICAL.Time) {
  return time.toString();
}

// The time of a repeating event that has this text, if it's one of its times
export function findOccurrence(event: EventType, id: string | undefined): ICAL.Time | undefined {
  if (!id || !event.isRecurring()) {
    return undefined;
  }
  try {
    const recur = event.iterator();
    let next;
    let count = 0;
    while ((next = recur.next()) && (count++ < 50000)) {
      const text = next.toString();
      if (text === id) {
        return next;
      } else if ((text.length === id.length) && (text > id)) {
        return undefined;
      }
    }
  } catch (e) {
    // (a rule that can't be read has none)
  }
  return undefined;
}

// The changed time that replaces a time of a repeating event
export function changedTimeAt(event: EventType, rid: ICAL.Time): ICAL.Event | undefined {
  return event.exceptions[rid.toString()] ?? event.exceptions[rid.convertToZone(ICAL.Timezone.utcTimezone).toString()];
}

export function hasChangedTimes(event: EventType) {
  return (event.changedTimes.length > 0) || event.component.hasProperty("exdate");
}

// Changes one time of a repeating event (e.g. what it's called, or when it is), which is then a
// changed time of its own. One that isn't yet starts as a copy of the event.
export function changeOccurrence(event: EventType, rid: ICAL.Time, change: (x: ICAL.Event) => void) {
  let changed = changedTimeAt(event, rid);
  if (!changed) {
    const comp = ICAL.Component.fromString(event.component.toString());
    for (const name of ["rrule", "rdate", "exdate", "exrule", "recurrence-id", "dtstart", "dtend", "duration", "due"]) {
      comp.removeAllProperties(name);
    }
    setRecurrenceId(comp, rid);
    changed = new ICAL.Event(comp, { exceptions: [] });
    const details = event.getOccurrenceDetails(rid);
    changed.startDate = details.startDate.clone();
    if (event.component.name === "vevent") {
      changed.endDate = details.endDate.clone();
    }
    event.setChangedTimes([...event.changedTimes, comp]);
  }
  change(changed);
  bumpSequence(changed.component);
  changed.component.updatePropertyWithValue("last-modified", ICAL.Time.now());
}

// Cancels one time of a repeating event (and what was changed of it)
export function excludeOccurrence(event: EventType, rid: ICAL.Time) {
  const changed = changedTimeAt(event, rid);
  event.setChangedTimes(event.changedTimes.filter((x) => x !== changed?.component));
  setExdates(event.component, [...exdates(event.component), rid]);
  bumpSequence(event.component);
}

// A time that is later (or earlier) by a number of seconds on the clock (whole days, for an all day
// one)
export function addSeconds(time: ICAL.Time, seconds: number) {
  const ret = time.clone();
  if (ret.isDate) {
    ret.adjust(Math.round(seconds / (24 * 3600)), 0, 0, 0);
  } else {
    ret.adjust(0, 0, 0, seconds);
  }
  return ret;
}

function dayNumber(time: ICAL.Time) {
  return Date.UTC(time.year, time.month - 1, time.day) / (24 * 3600 * 1000);
}

// A time of a repeating event, as it is after the event's start moved from before to after: as far
// on the clock (in the event's time zone, so it's the same over a change to summer time), and in
// the time zone the event is in now. A time of an event that becomes all day (or stops being one)
// moves by the days, and is at the new start's time.
export function moveTime(time: ICAL.Time, before: ICAL.Time, after: ICAL.Time): ICAL.Time {
  const wall = (time.isDate || before.isDate || (time.zone?.tzid === before.zone?.tzid)) ? time : time.convertToZone(before.zone);
  if (!wall.isDate && !before.isDate && !after.isDate) {
    const ret = ICAL.Time.fromData({ year: wall.year, month: wall.month, day: wall.day, hour: wall.hour, minute: wall.minute, second: wall.second, isDate: false }, after.zone);
    ret.adjust(0, 0, 0, after.subtractDate(before).toSeconds());
    return ret;
  }
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + dayNumber(after) - dayNumber(before)));
  const data = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  if (after.isDate || (wall.isDate && !before.isDate)) {
    return ICAL.Time.fromData({ ...data, isDate: true });
  }
  return ICAL.Time.fromData({ ...data, hour: after.hour, minute: after.minute, second: after.second, isDate: false }, after.zone);
}

function sameText(a: ICAL.Component, b: ICAL.Component, name: string) {
  return a.getAllProperties(name).map((x) => x.toICALString()).join("\n") === b.getAllProperties(name).map((x) => x.toICALString()).join("\n");
}

function alarmsText(comp: ICAL.Component) {
  return comp.getAllSubcomponents("valarm").map((x) => x.toString()).join("\n");
}

// After all of the times of a repeating event were changed (the event was before), its changed and
// cancelled times are kept with it:
// - When the start moved, they move as far, and so does the end of the rule (UNTIL). A changed time
//   that was still at its own time moves too.
// - What was changed of the event (e.g. the title, or the reminders) is changed in the changed times that had what the
//   event had.
// - When it repeats in another way, or not anymore, they are the times of a rule that's gone, so
//   they're removed.
export function updateSeries(event: EventType, before: EventType) {
  if (!before.isRecurring() || !hasChangedTimes(before)) {
    return;
  }
  const rule = (x: EventType) => String(x.component.getFirstPropertyValue("rrule") ?? "");
  if (!event.isRecurring() || (rule(event) !== rule(before))) {
    event.setChangedTimes([]);
    event.component.removeAllProperties("exdate");
    return;
  }

  const oldStart = base(before);
  const newStart = base(event);
  const moved = !!oldStart && !!newStart && ((oldStart.toString() !== newStart.toString()) || (oldStart.zone?.tzid !== newStart.zone?.tzid));
  const move = (time: ICAL.Time) => (moved) ? moveTime(time, oldStart!, newStart!) : time;
  if (moved) {
    setExdates(event.component, exdates(event.component).map(move));
    const recur = event.component.getFirstPropertyValue<ICAL.Recur>("rrule");
    if (recur?.until) {
      let until = move(recur.until);
      // (the end of a rule is in UTC, unless the event has no time zone)
      if (!until.isDate && (until.zone !== ICAL.Timezone.localTimezone)) {
        until = until.convertToZone(ICAL.Timezone.utcTimezone);
      }
      recur.until = until;
      event.component.updatePropertyWithValue("rrule", recur);
    }
  }

  const isEvent = event.component.name === "vevent";
  // (the lengths are on the clock, like the times)
  const oldLength = (isEvent) ? before.endDate.subtractDate(before.startDate).toSeconds() : 0;
  for (const changed of Object.values(event.exceptions)) {
    const rid = changed.recurrenceId;
    if (moved) {
      if (changed.startDate && (changed.startDate.toString() === rid.toString())) {
        const length = (isEvent) ? changed.endDate.subtractDate(changed.startDate).toSeconds() : 0;
        const start = move(rid);
        changed.startDate = start;
        if (isEvent) {
          changed.endDate = addSeconds(start, (length === oldLength) ? event.endDate.subtractDate(event.startDate).toSeconds() : length);
        }
      }
      setRecurrenceId(changed.component, move(rid));
    }
    for (const name of ["summary", "location", "description", "attendee"]) {
      if (sameText(changed.component, before.component, name) && !sameText(changed.component, event.component, name)) {
        changed.component.removeAllProperties(name);
        for (const prop of event.component.getAllProperties(name)) {
          changed.component.addProperty(new ICAL.Property(prop.toJSON()));
        }
      }
    }
    // (and so are the reminders)
    if ((alarmsText(changed.component) === alarmsText(before.component)) && (alarmsText(changed.component) !== alarmsText(event.component))) {
      for (const alarm of changed.component.getAllSubcomponents("valarm")) {
        changed.component.removeSubcomponent(alarm);
      }
      for (const alarm of event.component.getAllSubcomponents("valarm")) {
        changed.component.addSubcomponent(ICAL.Component.fromString(alarm.toString()));
      }
    }
  }
  // (they're looked up by their RECURRENCE-ID, which may have changed)
  event.setChangedTimes(event.changedTimes);
}
