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

export function useDateFormats() {
  const locale = useSelector((state: StoreState) => state.settings.locale);
  return React.useMemo(() => {
    const known = (locale in locales) ? locale : "en-gb";
    const time = new Intl.DateTimeFormat(known, { hour: (known === "en-us") ? "numeric" : "2-digit", minute: "2-digit" });
    const shortDate = new Intl.DateTimeFormat(known, { day: "numeric", month: "short" });
    return {
      // 0 is Sunday, 1 is Monday
      weekStart: (known === "en-us") ? 0 : 1,
      month: new Intl.DateTimeFormat(known, { month: "long", year: "numeric" }),
      day: new Intl.DateTimeFormat(known, { weekday: "long", day: "numeric", month: "long" }),
      weekDay: new Intl.DateTimeFormat(known, { weekday: "short" }),
      weekDayLong: new Intl.DateTimeFormat(known, { weekday: "long" }),
      monthName: new Intl.DateTimeFormat(known, { month: "long" }),
      monthShort: new Intl.DateTimeFormat(known, { month: "short" }),
      // e.g. "9 October" (or "October 9")
      dayMonth: new Intl.DateTimeFormat(known, { day: "numeric", month: "long" }),
      time: (date: Date) => time.format(date),
      shortDate: (date: Date) => shortDate.format(date),
    };
  }, [locale]);
}

export type DateFormats = ReturnType<typeof useDateFormats>;
