// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Platform } from "react-native";

export const appName = "EteSync";
export const sourceCode = "https://github.com/nikossvnk/etesync-aio";
export const reportIssue = sourceCode + "/issues";

// In generic mode we don't have anything specific to EteSync's hosted service (app store guidelines)
export const genericMode = Platform.OS === "ios";


export const colType = "etebase.md.note";

// The other kinds of collections, which the calendar, the tasks and the contacts are in
export const calendarType = "etebase.vevent";
export const tasksType = "etebase.vtodo";
export const contactsType = "etebase.vcard";
const pimTypes = [calendarType, tasksType, contactsType];
// Bookmarks: the title is the item's name, the link and the rest are in its meta (see bookmarks.ts).
// The same type as the bookmarks of EteSync Notes (on Android).
export const bookmarkColType = "etebase.bookmark";
// All of the types that are synced
export const collectionTypes = [colType, ...pimTypes, bookmarkColType];

// The colour of a collection that has none
export const defaultColor = "#8BC34A";

// The colours to choose from (any other one a collection has is kept)
export const swatches: { name: string, color: string }[] = [
  { name: "Blue", color: "#7B98F2" },
  { name: "Orange", color: "#F09A5C" },
  { name: "Green", color: "#5CC59B" },
  { name: "Purple", color: "#B794E6" },
  { name: "Pink", color: "#E8838F" },
  { name: "Yellow", color: "#F2C94C" },
  { name: "Teal", color: "#5BC0C8" },
  { name: "Grey", color: "#9A9CA3" },
];
