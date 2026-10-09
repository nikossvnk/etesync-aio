// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The times events happen, which the calendar, the sidebar, the contacts and the search show. The
// birthdays of contacts are events too, of a calendar of their own that isn't on the server.

import * as React from "react";
import { useSelector } from "react-redux";
import * as ICAL from "ical.js";

import { useCredentials } from "../credentials";
import { StoreState } from "../store";
import * as C from "../constants";
import { ContactType, EventType } from "./pim-types";
import { defaultColor, PimCollection, usePimCollections, usePimItems } from "./data";

// The calendar the birthdays of contacts are in, which can be hidden like the others
export const birthdaysUid = "birthdays";
export const birthdaysColor = "#5CC59B";

export interface Attendee {
  name: string;
  email?: string;
}

// An event as it's shown on a day: repeating events have one for every time they happen
export interface Occurrence {
  // Unique among the occurrences (the event and its start)
  key: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  colUid: string;
  calendarName: string;
  location: string;
  attendees: Attendee[];
  repeats: boolean;
  // The event (none for birthdays), and the contact of a birthday
  event?: EventType;
  contact?: ContactType;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function eventAttendees(event: EventType): Attendee[] {
  return event.component.getAllProperties("attendee").map((prop) => {
    const value = String(prop.getFirstValue() ?? "");
    const email = (value.toLowerCase().startsWith("mailto:")) ? value.slice(7) : undefined;
    const cn = prop.getParameter("cn");
    return { name: (cn) ? String(cn) : (email ?? value), email };
  });
}

export function initials(name: string) {
  return name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((x) => x).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
}

// The month and day (and year, when known) of a contact's birthday
export function contactBirthday(contact: ContactType): { month: number, day: number, year?: number } | undefined {
  const prop = contact.comp.getFirstProperty("bday");
  if (!prop) {
    return undefined;
  }
  const value = prop.getFirstValue();
  if (value && (typeof value === "object") && ("month" in value) && value.month) {
    return { month: value.month - 1, day: value.day, year: value.year ?? undefined };
  }
  // e.g. "--1021" (no year) or "19901021"
  const text = String(prop.toJSON()[3] ?? value ?? "").replace(/-/g, "");
  if (/^\d{8}$/.test(text)) {
    return { year: parseInt(text.slice(0, 4)), month: parseInt(text.slice(4, 6)) - 1, day: parseInt(text.slice(6, 8)) };
  } else if (/^\d{4}$/.test(text)) {
    return { month: parseInt(text.slice(0, 2)) - 1, day: parseInt(text.slice(2, 4)) };
  }
  return undefined;
}

// The times the events happen between two dates (and the birthdays then)
export function occurrencesBetween(events: EventType[], calendars: PimCollection[], from: Date, to: Date, contacts?: ContactType[]) {
  const ret: Occurrence[] = [];
  const byUid = new Map(calendars.map((x) => [x.colUid, x]));
  const toTime = ICAL.Time.fromJSDate(to, false);
  for (const event of events) {
    if (!event.startDate) {
      continue;
    }
    const calendar = byUid.get(event.collectionUid!);
    const allDay = event.startDate.isDate;
    const start = event.startDate.toJSDate();
    const end = event.endDate?.toJSDate() ?? ((allDay) ? addDays(start, 1) : start);
    const length = end.getTime() - start.getTime();
    const repeats = event.isRecurring();
    const attendees = eventAttendees(event);
    const add = (s: Date) => {
      const e = new Date(s.getTime() + length);
      if (((e > from) || (s >= from)) && (s < to)) {
        ret.push({
          key: `${event.collectionUid}/${event.itemUid}/${s.getTime()}`,
          title: event.title || "(no title)",
          start: s,
          end: e,
          allDay,
          color: calendar?.color ?? defaultColor,
          colUid: event.collectionUid!,
          calendarName: calendar?.name ?? "",
          location: event.location ?? "",
          attendees,
          repeats,
          event,
        });
      }
    };
    try {
      if (repeats) {
        const recur = event.iterator();
        let next;
        let count = 0;
        while ((next = recur.next()) && (next.compare(toTime) < 0) && (count++ < 50000)) {
          add(next.toJSDate());
        }
      } else {
        add(start);
      }
    } catch (e) {
      add(start);
    }
  }

  for (const contact of contacts ?? []) {
    const bday = contactBirthday(contact);
    if (!bday || contact.group) {
      continue;
    }
    for (let year = from.getFullYear() ; year <= to.getFullYear() ; year++) {
      const start = new Date(year, bday.month, bday.day);
      if ((start >= startOfDay(from)) && (start < to) && (!bday.year || (bday.year <= year))) {
        const name = (contact.fn as string) || "(no name)";
        ret.push({
          key: `bday/${contact.collectionUid}/${contact.itemUid}/${year}`,
          title: `${name}’s birthday`,
          start,
          end: addDays(start, 1),
          allDay: true,
          color: birthdaysColor,
          colUid: birthdaysUid,
          calendarName: "Birthdays",
          location: "",
          attendees: [],
          repeats: true,
          contact,
        });
      }
    }
  }
  return ret.sort((a, b) => (Number(b.allDay) - Number(a.allDay)) || (a.start.getTime() - b.start.getTime()));
}

// The occurrences that are on a day (all day ones end at the start of the day after their last one)
export function onDay(occurrences: Occurrence[], day: Date) {
  const next = addDays(day, 1);
  return occurrences.filter((x) => (x.start < next) && ((x.end > day) || (x.start >= day)));
}

// The events, calendars and contacts the calendar needs, and the occurrences between two dates of the
// calendars that are shown (the sidebar hides and shows them)
export function useOccurrences(from: Date, to: Date) {
  const etebase = useCredentials();
  const calendars = usePimCollections(C.calendarType);
  const events = usePimItems(etebase, C.calendarType, EventType.parse);
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const hidden = useSelector((state: StoreState) => state.settings.hiddenCalendars) ?? [];
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const occurrences = React.useMemo(() => {
    if (!events) {
      return undefined;
    }
    const shown = events.filter((x) => !hidden.includes(x.collectionUid!));
    return occurrencesBetween(shown, calendars, from, to, (hidden.includes(birthdaysUid)) ? [] : contacts);
  }, [events, contacts, calendars, hidden.join(","), fromTime, toTime]);
  return { occurrences, events, calendars, contacts };
}
