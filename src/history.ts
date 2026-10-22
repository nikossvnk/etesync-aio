// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The history of an item: the versions of it that the server keeps (Etebase keeps each one that was
// saved, as a revision), compared with the one before them, and bringing one back. The versions are
// only on the server, so this needs a connection; nothing of it is kept on the device.

import * as Etebase from "etebase";

import { loadItem } from "./cached";
import { saveItemsLocally } from "./sync/SyncManager";

export interface Version {
  // The revision's ID (its etag)
  id: string;
  mtime?: number;
  // The item's name (a note's title) and content, as they were then
  name: string;
  content: string;
  meta: Etebase.ItemMetadata;
  deleted: boolean;
}

// The versions of an item, newest first (the first is the one the server has now)
export async function loadVersions(etebase: Etebase.Account, colUid: string, itemUid: string): Promise<Version[]> {
  const { itemMgr, item } = loadItem(etebase, colUid, itemUid);
  const ret: Version[] = [];
  let iterator: string | null = null;
  let done = false;
  while (!done) {
    const revisions = await itemMgr.itemRevisions(item, { iterator, limit: 30 });
    iterator = revisions.iterator;
    done = revisions.done;
    for (const revision of revisions.data) {
      const meta = revision.getMeta();
      ret.push({
        id: revision.etag,
        mtime: meta.mtime,
        name: meta.name ?? "",
        content: (revision.isDeleted) ? "" : await revision.getContent(Etebase.OutputFormat.String),
        meta,
        deleted: revision.isDeleted,
      });
    }
  }
  return ret;
}

// Whether loading the versions failed because there is no connection (rather than an error of the
// server)
export function isOffline(e: unknown) {
  return (e instanceof Etebase.NetworkError) || ((typeof navigator !== "undefined") && (navigator.onLine === false));
}

// Brings a version back: it's saved as the item's new version (so the current one stays in the
// history), like a change made here, so it's also pushed by the sync. The item keeps what its meta
// has that isn't about the content (e.g. whether a note is pinned); a note gets its title back.
export async function restoreVersion(etebase: Etebase.Account, colUid: string, itemUid: string, version: Version, withName: boolean) {
  const { col, itemMgr, item } = loadItem(etebase, colUid, itemUid);
  await item.setContent(version.content);
  item.setMeta({ ...item.getMeta(), ...((withName) ? { name: version.name } : {}), mtime: (new Date()).getTime() });
  await saveItemsLocally(etebase, col, itemMgr, [item]);
}

export type LineChange = "same" | "added" | "removed";

// The lines of two texts, as one list: the ones both have, the ones only the newer one has (added),
// and the ones only the older one has (removed), in their order (the longest common subsequence)
export function diffLines(older: string, newer: string): { text: string, change: LineChange }[] {
  const a = older.split("\n");
  const b = newer.split("\n");
  // (a text too long to compare is shown as it is)
  if (a.length * b.length > 4000000) {
    return b.map((text) => ({ text, change: "same" }));
  }
  const lengths: Uint32Array[] = [];
  for (let i = 0; i <= a.length; i++) {
    lengths.push(new Uint32Array(b.length + 1));
  }
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = (a[i] === b[j]) ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const ret: { text: string, change: LineChange }[] = [];
  let i = 0;
  let j = 0;
  while ((i < a.length) || (j < b.length)) {
    if ((i < a.length) && (j < b.length) && (a[i] === b[j])) {
      ret.push({ text: a[i], change: "same" });
      i++;
      j++;
    } else if ((j < b.length) && ((i >= a.length) || (lengths[i][j + 1] >= lengths[i + 1][j]))) {
      ret.push({ text: b[j], change: "added" });
      j++;
    } else {
      ret.push({ text: a[i], change: "removed" });
      i++;
    }
  }
  return ret;
}
