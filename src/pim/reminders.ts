// SPDX-FileCopyrightText: © 2026 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The reminders of events and tasks: VALARM components in them (RFC 5545), which other calendars
// show too (EteSync's Android app makes them reminders of Android's calendar, and back). A reminder
// here is a time before or after the start of an event, or the due date of a task (TRIGGER with
// RELATED=END), as Android's are. Others (e.g. at a set time, or relative to the other end) are
// shown and kept as they are.

import * as ICAL from "ical.js";

import { EventType, TaskType } from "./pim-types";
import { occurrencesBetween } from "./occurrences";
import { DateFormats } from "./format";

export interface Reminder {
  // Seconds after the start or the due date (negative: before), or undefined for one this app can't
  // change, which is kept as it is
  seconds?: number;
  // The VALARM it was read from (none for a new one)
  alarm?: ICAL.Component;
}

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

// The reminders the form offers: for an event at a time, before its start; for one that's all day
// (or a task due on a day), at a time of the day, 09:00 (from the start of the day it's on)
export function reminderPresets(allDay: boolean): number[] {
  return (allDay) ?
    [9 * hour, -15 * hour, -(day + 15 * hour), -(6 * day + 15 * hour)] :
    [0, -5 * minute, -10 * minute, -15 * minute, -30 * minute, -hour, -2 * hour, -day, -2 * day, -7 * day];
}

// What a component's reminders are relative to: the due date of a task that has one, else the start
function relatedOf(comp: ICAL.Component): "START" | "END" {
  return (comp.name === "vtodo" && comp.hasProperty("due")) ? "END" : "START";
}

// The seconds of a VALARM's TRIGGER, when it's relative to what this app makes them relative to
function relativeSeconds(alarm: ICAL.Component, related: "START" | "END"): number | undefined {
  const prop = alarm.getFirstProperty("trigger");
  const value = prop?.getFirstValue<any>();
  if (!(value instanceof ICAL.Duration)) {
    return undefined;
  }
  const relatedTo = String(prop!.getParameter("related") ?? "START").toUpperCase();
  return (relatedTo === related) ? value.toSeconds() : undefined;
}

export function remindersOf(comp: ICAL.Component): Reminder[] {
  const related = relatedOf(comp);
  return comp.getAllSubcomponents("valarm").map((alarm) => ({ seconds: relativeSeconds(alarm, related), alarm }));
}

// Replaces the reminders of an event or a task. The ones it had stay as they were (with what else
// they have, e.g. the properties of other apps), new ones are shown as a notification with the
// title, as RFC 5545 asks (ACTION:DISPLAY needs a DESCRIPTION).
export function setReminders(comp: ICAL.Component, reminders: Reminder[]) {
  const related = relatedOf(comp);
  for (const alarm of comp.getAllSubcomponents("valarm")) {
    comp.removeSubcomponent(alarm);
  }
  for (const reminder of reminders) {
    if (reminder.alarm && (relativeSeconds(reminder.alarm, related) === reminder.seconds)) {
      comp.addSubcomponent(ICAL.Component.fromString(reminder.alarm.toString()));
      continue;
    }
    const alarm = new ICAL.Component("valarm");
    alarm.addPropertyWithValue("action", "DISPLAY");
    alarm.addPropertyWithValue("description", String(comp.getFirstPropertyValue("summary") ?? "") || "Reminder");
    const trigger = new ICAL.Property("trigger");
    trigger.setValue(ICAL.Duration.fromSeconds(reminder.seconds ?? 0));
    if (related === "END") {
      trigger.setParameter("related", "END");
    }
    alarm.addProperty(trigger);
    comp.addSubcomponent(alarm);
  }
}

// What tells reminders apart in the form (the same time twice is one)
export function reminderKey(reminder: Reminder) {
  return (reminder.seconds !== undefined) ? String(reminder.seconds) : `other:${reminder.alarm?.toString()}`;
}

function amount(seconds: number) {
  const parts: string[] = [];
  const unit = (n: number, name: string) => (n) && parts.push(`${n} ${name}${(n === 1) ? "" : "s"}`);
  unit(Math.floor(seconds / (7 * day)), "week");
  unit(Math.floor((seconds % (7 * day)) / day), "day");
  unit(Math.floor((seconds % day) / hour), "hour");
  unit(Math.floor((seconds % hour) / minute), "minute");
  return parts.join(" ") || "0 minutes";
}

// e.g. "15 minutes before", "At the start", "The day before at 09:00", or what another app made
export function reminderLabel(reminder: Reminder, allDay: boolean, isTask: boolean, fmt: DateFormats) {
  const { seconds } = reminder;
  if (seconds === undefined) {
    const prop = reminder.alarm?.getFirstProperty("trigger");
    const value = prop?.getFirstValue<any>();
    if (value instanceof ICAL.Time) {
      return `On ${fmt.shortDate(value.toJSDate())} at ${fmt.time(value.toJSDate())}`;
    } else if (!(value instanceof ICAL.Duration)) {
      return "Other reminder";
    }
    const end = String(prop!.getParameter("related") ?? "START").toUpperCase() === "END";
    const what = (!end) ? "the start" : (isTask) ? "it's due" : "the end";
    if (value.toSeconds() === 0) {
      return (what === "it's due") ? "When it's due" : `At ${what}`;
    }
    return `${amount(Math.abs(value.toSeconds()))} ${(value.toSeconds() < 0) ? "before" : "after"} ${what}`;
  }
  if (allDay) {
    const days = Math.floor(seconds / day);
    const rest = seconds - days * day;
    const time = fmt.time(new Date(2000, 0, 1, Math.floor(rest / hour), Math.floor((rest % hour) / minute)));
    const which = (days === 0) ? "On the day" : (days === -1) ? "The day before" : (days < 0) ? `${-days} days before` :
      (days === 1) ? "The day after" : `${days} days after`;
    return `${which} at ${time}`;
  }
  if (seconds === 0) {
    return (isTask) ? "When it's due" : "At the start";
  }
  return `${amount(Math.abs(seconds))} ${(seconds < 0) ? "before" : "after"}`;
}

// A notification that's due at a time
export interface Notice {
  // Unique for the reminder and the time of the event it's for
  key: string;
  // When it's shown (milliseconds since 1970)
  at: number;
  title: string;
  body: string;
}

// When a reminder was dismissed (ACKNOWLEDGED, of RFC 9074, which ical.js reads as text)
function acknowledgedAt(alarm: ICAL.Component) {
  const value = alarm.getFirstPropertyValue<any>("acknowledged");
  if (value instanceof ICAL.Time) {
    return value.toJSDate().getTime();
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(value ?? ""));
  return (m) ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : undefined;
}

// The notifications of the reminders (the ones shown on a screen, not e.g. sent as an email) that are
// due between two times
export function upcomingNotices(events: EventType[], tasks: TaskType[], from: Date, to: Date, fmt: DateFormats): Notice[] {
  const ret: Notice[] = [];
  const fromMs = from.getTime();
  const toMs = to.getTime();
  function addAlarms(comp: ICAL.Component, uid: string, start: Date, end: Date, title: string, body: string) {
    for (const alarm of comp.getAllSubcomponents("valarm")) {
      const action = String(alarm.getFirstPropertyValue("action") ?? "DISPLAY").toUpperCase();
      if (!["DISPLAY", "AUDIO"].includes(action)) {
        continue;
      }
      const prop = alarm.getFirstProperty("trigger");
      const value = prop?.getFirstValue<any>();
      let at: number;
      if (value instanceof ICAL.Time) {
        at = value.toJSDate().getTime();
      } else if (value instanceof ICAL.Duration) {
        const base = (String(prop!.getParameter("related") ?? "START").toUpperCase() === "END") ? end : start;
        at = base.getTime() + value.toSeconds() * 1000;
      } else {
        continue;
      }
      // (one that was dismissed in another app, e.g. Thunderbird, which keeps when that was)
      const acknowledged = acknowledgedAt(alarm);
      if ((acknowledged !== undefined) && (acknowledged >= at)) {
        continue;
      }
      if ((at >= fromMs) && (at < toMs)) {
        ret.push({ key: `${uid}/${start.getTime()}/${at}`, at, title, body });
      }
    }
  }

  // (reminders can be up to some weeks before the event, and after it)
  const longest = 8 * 7 * day * 1000;
  const occurrences = occurrencesBetween(events, [], new Date(fromMs - longest), new Date(toMs + longest));
  for (const x of occurrences) {
    if (!x.event) {
      continue;
    }
    const item = (x.changed && x.recurrenceId) ? x.event.getOccurrenceDetails(x.recurrenceId).item : x.event;
    const when = (x.allDay) ? `${fmt.day.format(x.start)}, all day` : `${fmt.day.format(x.start)}, ${fmt.time(x.start)}–${fmt.time(x.end)}`;
    addAlarms(item.component, `${x.colUid}/${x.event.itemUid}`, x.start, x.end, x.title, [when, x.location].filter((s) => s).join(" · "));
  }
  for (const task of tasks) {
    const due = task.dueDate?.toJSDate();
    const start = task.startDate?.toJSDate() ?? due;
    if (task.finished || !start) {
      continue;
    }
    const when = (due) ? `Due ${fmt.day.format(due)}${(task.dueDate!.isDate) ? "" : `, ${fmt.time(due)}`}` : "";
    addAlarms(task.component, `${task.collectionUid}/${task.itemUid}`, start, due ?? start, task.title || "(no title)", when);
  }
  return ret.sort((a, b) => a.at - b.at);
}
