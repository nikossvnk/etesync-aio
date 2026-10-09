// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// How the calendar and the tasks show dates and times, which the "Date and time format" setting
// chooses (like the locale setting of the web app)

import * as React from "react";
import { useSelector } from "react-redux";

import { StoreState } from "../store";

export const locales: { [locale: string]: string } = {
  "en-gb": "Day first, 24-hour clock, weeks start on Monday",
  "en-us": "Month first, 12-hour clock, weeks start on Sunday",
};

// The formats of a locale ("en-gb" or "en-us")
export function dateFormats(locale: string) {
  const known = (locale in locales) ? locale : "en-gb";
  const us = known === "en-us";
  const time = new Intl.DateTimeFormat(known, { hour: (us) ? "numeric" : "2-digit", minute: "2-digit" });
  const timeSeconds = new Intl.DateTimeFormat(known, { hour: (us) ? "numeric" : "2-digit", minute: "2-digit", second: "2-digit" });
  const shortDate = new Intl.DateTimeFormat(known, { day: "numeric", month: "short" });
  const mediumDate = new Intl.DateTimeFormat(known, { day: "numeric", month: "short", year: "numeric" });
  const pad = (x: number) => String(x).padStart(2, "0");
  return {
    locale: known,
    // 0 is Sunday, 1 is Monday
    weekStart: (us) ? 0 : 1,
    // Whether times have AM and PM (rather than 24 hours)
    twelveHours: us,
    month: new Intl.DateTimeFormat(known, { month: "long", year: "numeric" }),
    day: new Intl.DateTimeFormat(known, { weekday: "long", day: "numeric", month: "long" }),
    weekDay: new Intl.DateTimeFormat(known, { weekday: "short" }),
    weekDayLong: new Intl.DateTimeFormat(known, { weekday: "long" }),
    monthName: new Intl.DateTimeFormat(known, { month: "long" }),
    monthShort: new Intl.DateTimeFormat(known, { month: "short" }),
    // e.g. "9 October" (or "October 9")
    dayMonth: new Intl.DateTimeFormat(known, { day: "numeric", month: "long" }),
    time: (date: Date) => time.format(date),
    timeSeconds: (date: Date) => timeSeconds.format(date),
    // e.g. "9 Oct" (or "Oct 9")
    shortDate: (date: Date) => shortDate.format(date),
    // e.g. "9 Oct 2026" (or "Oct 9, 2026")
    mediumDate: (date: Date) => mediumDate.format(date),
    // e.g. "09/10/2026" (or "10/09/2026"), as the date fields show and take dates
    numericDate: (date: Date) => (us) ? `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}` :
      `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    numericDatePattern: (us) ? "MM/DD/YYYY" : "DD/MM/YYYY",
  };
}

export type DateFormats = ReturnType<typeof dateFormats>;

export function useDateFormats() {
  const locale = useSelector((state: StoreState) => state.settings.locale);
  return React.useMemo(() => dateFormats(locale), [locale]);
}

// When a note (or something else) was changed, as short as it can be: the time today, the day this
// week, the date this year, and the date with the year before
export function formatChanged(date: Date, fmt: DateFormats) {
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / (24 * 3600 * 1000));
  if (days === 0) {
    return fmt.time(date);
  } else if (days === 1) {
    return "Yesterday";
  } else if ((days > 0) && (days < 7)) {
    return fmt.weekDay.format(date);
  } else if (date.getFullYear() === now.getFullYear()) {
    return fmt.shortDate(date);
  }
  return fmt.mediumDate(date);
}
