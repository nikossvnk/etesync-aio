// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The notes that were created (in this run of the app) and didn't get a title or content yet. They
// are only in the local cache, and are not pushed to the server unless they get one: if they are
// left empty, they are thrown away again.
export const newNotes = new Set<string>();

// The notes that open in the editor rather than the viewer the next time they're opened: new
// notes, and notes that were moved to another notebook while they were being edited
export const openInEditor = new Set<string>();
