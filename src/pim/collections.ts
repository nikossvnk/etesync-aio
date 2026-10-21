// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The collections of all kinds (notebooks, calendars, task lists, address books, bookmark lists): what
// they are called, making, changing, deleting and exporting them, and who they are shared with

import * as React from "react";
import * as Etebase from "etebase";
import * as ICAL from "ical.js";
import { useSelector } from "react-redux";

import { store, StoreState } from "../store";
import { deleteCollectionLocally, saveCollectionLocally } from "../sync/SyncManager";
import * as C from "../constants";
import { saveFile } from "../import-export";
import { defaultColor } from "./data";
import { bookmarksFrom, bookmarksToHtml } from "../bookmarks";

export type Kind = "calendar" | "contacts" | "tasks" | "notes" | "bookmarks";

export const kinds: { [kind in Kind]: { type: string, label: string, one: string, noun: string, unit: string, icon: string, screen: string, manage: string } } = {
  calendar: { type: C.calendarType, label: "Calendars", one: "Calendar", noun: "calendar", unit: "events", icon: "calendar-blank-outline", screen: "Calendar", manage: "Manage calendars" },
  contacts: { type: C.contactsType, label: "Address books", one: "Address book", noun: "address book", unit: "contacts", icon: "card-account-details-outline", screen: "Contacts", manage: "Manage address books" },
  tasks: { type: C.tasksType, label: "Task lists", one: "Task list", noun: "task list", unit: "tasks", icon: "checkbox-marked-circle-outline", screen: "Tasks", manage: "Manage lists" },
  notes: { type: C.colType, label: "Notebooks", one: "Notebook", noun: "notebook", unit: "notes", icon: "file-document-outline", screen: "Home", manage: "Manage notebooks" },
  bookmarks: { type: C.bookmarkColType, label: "Bookmark lists", one: "Bookmark list", noun: "bookmark list", unit: "bookmarks", icon: "bookmark-outline", screen: "Bookmarks", manage: "Manage bookmark lists" },
};
export const kindOrder: Kind[] = ["calendar", "contacts", "tasks", "notes", "bookmarks"];

// The file a collection is exported as
export function exportExtension(kind: Kind) {
  return (kind === "contacts") ? "vcf" : (kind === "notes") ? "md" : (kind === "bookmarks") ? "html" : "ics";
}

export function kindOf(type: string): Kind | undefined {
  return kindOrder.find((k) => kinds[k].type === type);
}

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

export interface CollectionInfo {
  colUid: string;
  kind: Kind;
  name: string;
  description: string;
  color: string;
  items: number;
  mtime?: number;
  // Admin (the owner, or made one), read & write, or read only
  accessLevel: Etebase.CollectionAccessLevel;
}

export function useCollectionInfos(etebase: Etebase.Account | null | undefined): CollectionInfo[] {
  const collections = useSelector((state: StoreState) => state.allCache.collections);
  const items = useSelector((state: StoreState) => state.allCache.items);
  return React.useMemo(() => {
    const ret: CollectionInfo[] = [];
    const colMgr = etebase?.getCollectionManager();
    for (const [colUid, col] of collections.entries()) {
      const kind = kindOf(col.collectionType);
      if (!kind) {
        continue;
      }
      let accessLevel = Etebase.CollectionAccessLevel.Admin;
      try {
        accessLevel = colMgr?.cacheLoad(col.cache).accessLevel ?? accessLevel;
      } catch (e) {
        // (kept as admin, the server says otherwise when changing it)
      }
      ret.push({
        colUid,
        kind,
        name: col.meta.name ?? "",
        description: col.meta.description ?? "",
        color: (col.meta.color || defaultColor).slice(0, 7),
        items: items.get(colUid)?.count((x) => !x.isDeleted) ?? 0,
        mtime: col.meta.mtime,
        accessLevel,
      });
    }
    return ret.sort((a, b) => a.name.localeCompare(b.name));
  }, [etebase, collections, items]);
}

function loadCollection(etebase: Etebase.Account, colUid: string) {
  const cached = (store.getState() as unknown as StoreState).allCache.collections.get(colUid);
  if (!cached) {
    throw new Error("The collection isn't there anymore");
  }
  const colMgr = etebase.getCollectionManager();
  return { colMgr, col: colMgr.cacheLoad(cached.cache) };
}

// The access level of a collection (it's in the collection, which only the cache entry has)
export function accessLevelOf(etebase: Etebase.Account, colUid: string) {
  try {
    return loadCollection(etebase, colUid).col.accessLevel;
  } catch (e) {
    return Etebase.CollectionAccessLevel.ReadOnly;
  }
}

export async function createCollection(etebase: Etebase.Account, kind: Kind, meta: { name: string, description?: string, color?: string }) {
  const colMgr = etebase.getCollectionManager();
  const col = await colMgr.create(kinds[kind].type, { ...meta, mtime: (new Date()).getTime() }, "");
  await saveCollectionLocally(etebase, colMgr, col, true);
  return col.uid;
}

export async function saveCollection(etebase: Etebase.Account, colUid: string, meta: { name?: string, description?: string, color?: string }) {
  const { colMgr, col } = loadCollection(etebase, colUid);
  col.setMeta({ ...col.getMeta(), ...meta, mtime: (new Date()).getTime() });
  await saveCollectionLocally(etebase, colMgr, col, false);
}

export function deleteCollection(etebase: Etebase.Account, colUid: string) {
  const { colMgr, col } = loadCollection(etebase, colUid);
  col.setMeta({ ...col.getMeta(), mtime: (new Date()).getTime() });
  col.delete(true);
  deleteCollectionLocally(etebase, colMgr, col);
}

// Saves a calendar or task list as an .ics file, an address book as a .vcf file, a notebook as a
// Markdown file (its notes one after the other), a bookmark list as a browser's bookmark file (.html)
export async function exportCollection(etebase: Etebase.Account, colUid: string) {
  const state = store.getState() as unknown as StoreState;
  const { colMgr, col } = loadCollection(etebase, colUid);
  const kind = kindOf(col.getCollectionType())!;
  const name = (col.getMeta().name || kinds[kind].noun).replace(/[\\/:*?"<>|]/g, "_");
  if (kind === "bookmarks") {
    // (all that's needed is in the meta, there's no content to decrypt)
    const bookmarks = bookmarksFrom(state.allCache.items.filter((_x, uid) => uid === colUid));
    await saveFile(`${name}.html`, new TextEncoder().encode(bookmarksToHtml(col.getMeta().name ?? "", bookmarks)), "text/html");
    return bookmarks.length;
  }
  const itemMgr = colMgr.getItemManager(col);
  const contents: string[] = [];
  const names: string[] = [];
  for (const cached of state.allCache.items.get(colUid)?.values() ?? []) {
    if (!cached.isDeleted) {
      contents.push(await itemMgr.cacheLoad(cached.cache).getContent(Etebase.OutputFormat.String));
      names.push(cached.meta.name ?? "");
    }
  }
  let text: string;
  let ext: string;
  let mime: string;
  if (kind === "contacts") {
    text = contents.map((x) => x.trim()).join("\r\n") + "\r\n";
    ext = "vcf";
    mime = "text/vcard";
  } else if (kind === "notes") {
    text = contents.map((x, i) => `# ${names[i]}\n\n${x}`).join("\n\n");
    ext = "md";
    mime = "text/markdown";
  } else {
    // One calendar with all of the events (or tasks) and the time zones they use
    const calendar = new ICAL.Component(["vcalendar", [], []]);
    calendar.updatePropertyWithValue("prodid", "-//EteSync//EteSync all-in-one//EN");
    calendar.updatePropertyWithValue("version", "2.0");
    const zones = new Set<string>();
    for (const content of contents) {
      try {
        const comp = new ICAL.Component(ICAL.parse(content));
        // (a copy of the list: adding a component to the calendar takes it out of the one it was in)
        for (const sub of [...comp.getAllSubcomponents()]) {
          if (sub.name === "vtimezone") {
            const tzid = String(sub.getFirstPropertyValue("tzid"));
            if (zones.has(tzid)) {
              continue;
            }
            zones.add(tzid);
          }
          calendar.addSubcomponent(new ICAL.Component(sub.toJSON()));
        }
      } catch (e) {
        // (an item that can't be read is left out)
      }
    }
    text = calendar.toString();
    ext = "ics";
    mime = "text/calendar";
  }
  await saveFile(`${name}.${ext}`, new TextEncoder().encode(text), mime);
  return contents.length;
}

// Sharing: who has access, inviting by username, changing and removing access, leaving
export interface Member {
  username: string;
  accessLevel: Etebase.CollectionAccessLevel;
}

export async function listMembers(etebase: Etebase.Account, colUid: string): Promise<Member[]> {
  const { colMgr, col } = loadCollection(etebase, colUid);
  const memberMgr = colMgr.getMemberManager(col);
  const ret: Member[] = [];
  let iterator: string | null = null;
  let done = false;
  while (!done) {
    const page = await memberMgr.list({ iterator, limit: 50 });
    iterator = page.iterator as string;
    done = page.done;
    ret.push(...page.data.map((x) => ({ username: x.username, accessLevel: x.accessLevel })));
  }
  return ret;
}

export async function fetchUserKey(etebase: Etebase.Account, username: string) {
  return (await etebase.getInvitationManager().fetchUserProfile(username)).pubkey;
}

export async function inviteMember(etebase: Etebase.Account, colUid: string, username: string, pubkey: Uint8Array, accessLevel: Etebase.CollectionAccessLevel) {
  const { col } = loadCollection(etebase, colUid);
  await etebase.getInvitationManager().invite(col, username, pubkey, accessLevel);
}

export async function setMemberAccess(etebase: Etebase.Account, colUid: string, username: string, accessLevel: Etebase.CollectionAccessLevel) {
  const { colMgr, col } = loadCollection(etebase, colUid);
  await colMgr.getMemberManager(col).modifyAccessLevel(username, accessLevel);
}

export async function removeMember(etebase: Etebase.Account, colUid: string, username: string) {
  const { colMgr, col } = loadCollection(etebase, colUid);
  await colMgr.getMemberManager(col).remove(username);
}

export async function leaveCollection(etebase: Etebase.Account, colUid: string) {
  const { colMgr, col } = loadCollection(etebase, colUid);
  await colMgr.getMemberManager(col).leave();
}

export const accessNames: { [level: number]: string } = {
  [Etebase.CollectionAccessLevel.ReadOnly]: "Read only",
  [Etebase.CollectionAccessLevel.ReadWrite]: "Read & write",
  [Etebase.CollectionAccessLevel.Admin]: "Admin",
};
