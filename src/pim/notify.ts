// SPDX-FileCopyrightText: © 2026 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The reminders, as notifications of the computer: the app hands the ones that are due in the next two
// weeks to its local server (desktop/serve.py), which shows each one when it's time, also while the
// app's window is closed. The server only gets those notifications (titles, times and places), and
// none when the user logged out. Only in the installed desktop app (the web build), where that server
// is; the development server doesn't have it, so there are none there.

import * as React from "react";
import { Platform } from "react-native";
import { useSelector } from "react-redux";

import { useCredentials } from "../credentials";
import { StoreState } from "../store";
import * as C from "../constants";
import { EventType, TaskType } from "./pim-types";
import { usePimItems } from "./data";
import { useDateFormats } from "./format";
import { Notice, upcomingNotices } from "./reminders";

const hour = 3600 * 1000;
// (and the ones of the last hour, which the server shows when they were missed, e.g. while the
// computer was asleep, but not again when it showed them already)
const ahead = 14 * 24 * hour;
const missed = hour;

let lastSent: string | undefined;
let sendTimer: ReturnType<typeof setTimeout> | undefined;

function send(notices: Notice[]) {
  const body = JSON.stringify({ reminders: notices });
  if (body === lastSent) {
    return;
  }
  // (a change of many items at once is sent once)
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    lastSent = body;
    fetch("/reminders", {
      method: "POST",
      // (which a page of another site can't send without asking first, so only the app can use it)
      headers: { "Content-Type": "application/json", "X-EteSync-Request": "reminders" },
      body,
    }).then((response) => {
      if (!response.ok) {
        lastSent = undefined;
      }
    }).catch(() => {
      // (sent again with the next change)
      lastSent = undefined;
    });
  }, 1000);
}

export function useReminderNotices() {
  const etebase = useCredentials();
  const events = usePimItems(etebase, C.calendarType, EventType.parse);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  // (the calendars that are hidden don't remind, as on Android)
  const hidden = useSelector((state: StoreState) => state.settings.hiddenCalendars) ?? [];
  const fmt = useDateFormats();
  // The next two weeks are worked out again every hour
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), hour);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    if (etebase === null) {
      send([]);
      return;
    }
    if (!etebase || !events || !tasks) {
      return;
    }
    const shown = events.filter((x) => !hidden.includes(x.collectionUid!));
    send(upcomingNotices(shown, tasks, new Date(now - missed), new Date(now + ahead), fmt).slice(0, 1000));
  }, [etebase, events, tasks, hidden.join(","), fmt, now]);
}
