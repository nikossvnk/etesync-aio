// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Platform } from "react-native";

export const appName = "EteSync";
export const homePage = "https://www.etesync.com/";
export const faq = homePage + "faq/";
export const pricing = homePage + "pricing/";
export const sourceCode = "https://github.com/nikossvnk/etesync-notes";
export const reportIssue = sourceCode + "/issues";

export const forgotPassword = faq + "#forgot-password";

export const serviceApiBase = "https://api.etebase.com/partner/etesync/";

// In generic mode we don't have anything etesync.com specific (app store guidelines)
export const genericMode = Platform.OS === "ios";


export const colType = "etebase.md.note";

// The other kinds of collections, which the calendar, the tasks and the contacts are in
export const calendarType = "etebase.vevent";
export const tasksType = "etebase.vtodo";
export const contactsType = "etebase.vcard";
export const pimTypes = [calendarType, tasksType, contactsType];
