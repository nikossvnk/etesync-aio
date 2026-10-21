// SPDX-FileCopyrightText: © 2017 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

// Importing files (like the import of the web app, and notes too): .ics files have events and tasks,
// .vcf files contacts, .md or .txt files are a note each, and .html files are the bookmarks that a
// browser exported. The files are read here, on the device; what's in them is saved (encrypted) like
// everything else.

import * as Etebase from "etebase";
import * as ICAL from "ical.js";
import * as uuid from "uuid";

import { store, StoreState } from "../store";
import { saveItemsLocally } from "../sync/SyncManager";
import { createCollection, Kind, kinds } from "./collections";
import { BookmarkMetadata, comparableUrl, metaOf, ParsedBookmark, readBookmarksHtml } from "../bookmarks";

export interface ImportFile {
  name: string;
  size: number;
  text: string;
}

export interface Entry {
  // The iCalendar UID (for notes, the title, for bookmarks, the link as it's compared), which is how
  // items that are there already are found
  uid: string;
  title: string;
  // The item's content: a calendar with the event (or task) and the time zones it uses, a vCard,
  // or the text of a note
  content: string;
  // When it is (events), when it's due (tasks), or when it was saved (bookmarks)
  date?: Date;
  // A bookmark's details, which are in its meta
  bookmark?: ParsedBookmark;
}

export interface Unreadable {
  file: string;
  what: string;
  reason: string;
  line?: number;
}

export interface Parsed {
  files: ImportFile[];
  entries: { [kind in Kind]: Entry[] };
  unreadable: Unreadable[];
}

const calendarExt = /\.(ics|ical|ifb|icalendar)$/i;
const contactsExt = /\.(vcf|vcard)$/i;
const notesExt = /\.(md|markdown|txt)$/i;
const bookmarksExt = /\.(html|htm)$/i;
export const acceptedFiles = [".ics", ".ical", ".vcf", ".md", ".markdown", ".txt", ".html", ".htm", "text/calendar", "text/vcard", "text/markdown", "text/plain", "text/html"];

export function isAccepted(name: string) {
  return calendarExt.test(name) || contactsExt.test(name) || notesExt.test(name) || bookmarksExt.test(name);
}

// The line of the file where something is (e.g. "UID:..."), counting from 1
function lineOf(text: string, needle: string | undefined) {
  if (!needle) {
    return undefined;
  }
  const at = text.indexOf(needle);
  return (at < 0) ? undefined : text.slice(0, at).split("\n").length;
}

// ICAL.parse returns one component, or a list of them when there are several
function parseAll(text: string): ICAL.Component[] {
  const parsed: any = ICAL.parse(text);
  const list = (Array.isArray(parsed[0])) ? parsed : [parsed];
  return list.map((x: any) => new ICAL.Component(x));
}

function readCalendar(file: ImportFile, parsed: Parsed) {
  let calendars: ICAL.Component[];
  try {
    calendars = parseAll(file.text);
  } catch (e) {
    parsed.unreadable.push({ file: file.name, what: "The file", reason: `isn't a calendar that can be read (${(e as Error).message})` });
    return;
  }
  for (const calendar of calendars) {
    const zones = calendar.getAllSubcomponents("vtimezone");
    for (const [name, kind] of [["vevent", "calendar"], ["vtodo", "tasks"]] as const) {
      // An event that repeats is one item with the times that are changed (they have its UID)
      const byUid = new Map<string, ICAL.Component[]>();
      for (const comp of calendar.getAllSubcomponents(name)) {
        let id = comp.getFirstPropertyValue("uid");
        if (!id) {
          id = uuid.v4();
          comp.updatePropertyWithValue("uid", id);
        }
        byUid.set(String(id), [...(byUid.get(String(id)) ?? []), comp]);
      }
      for (const [id, comps] of byUid) {
        const main = comps.find((x) => !x.hasProperty("recurrence-id")) ?? comps[0];
        const title = String(main.getFirstPropertyValue("summary") ?? "");
        const what = `${(kind === "calendar") ? "Event" : "Task"} “${title || "(no title)"}”`;
        const line = lineOf(file.text, `UID:${id}`) ?? lineOf(file.text, `SUMMARY:${title}`);
        let date: Date | undefined;
        try {
          const time = main.getFirstPropertyValue((kind === "calendar") ? "dtstart" : "due") ?? main.getFirstPropertyValue("dtstart");
          if ((kind === "calendar") && !time) {
            parsed.unreadable.push({ file: file.name, what, reason: "has no start date", line });
            continue;
          }
          date = time?.toJSDate();
        } catch (e) {
          parsed.unreadable.push({ file: file.name, what, reason: `has a date that can't be read (${(e as Error).message})`, line });
          continue;
        }
        // A calendar of its own, with the time zones its times are in
        const item = new ICAL.Component(["vcalendar", [], []]);
        item.updatePropertyWithValue("prodid", calendar.getFirstPropertyValue("prodid") ?? "-//EteSync//EteSync all-in-one//EN");
        item.updatePropertyWithValue("version", "2.0");
        const text = comps.map((x) => x.toString()).join("\n");
        for (const zone of zones) {
          if (text.includes(`TZID=${zone.getFirstPropertyValue("tzid")}`)) {
            item.addSubcomponent(new ICAL.Component(zone.toJSON()));
          }
        }
        for (const comp of comps) {
          item.addSubcomponent(new ICAL.Component(comp.toJSON()));
        }
        parsed.entries[kind].push({ uid: id, title: title || "(no title)", content: item.toString(), date });
      }
    }
  }
}

function readContacts(file: ImportFile, parsed: Parsed) {
  let cards: ICAL.Component[];
  try {
    cards = parseAll(file.text);
  } catch (e) {
    parsed.unreadable.push({ file: file.name, what: "The file", reason: `isn't an address book that can be read (${(e as Error).message})` });
    return;
  }
  for (const card of cards) {
    if (card.name !== "vcard") {
      continue;
    }
    const name = String(card.getFirstPropertyValue("fn") ?? "").trim() || (card.getFirstPropertyValue("n") as string[] | undefined)?.filter((x) => x).reverse().join(" ") || "";
    let id = card.getFirstPropertyValue("uid");
    if (!name) {
      parsed.unreadable.push({ file: file.name, what: "A contact", reason: "has no name", line: lineOf(file.text, (id) ? `UID:${id}` : undefined) });
      continue;
    }
    if (!id) {
      id = uuid.v4();
      card.updatePropertyWithValue("uid", id);
    }
    parsed.entries.contacts.push({ uid: String(id).replace(/^urn:uuid:/, ""), title: name, content: card.toString() });
  }
}

function readBookmarks(file: ImportFile, parsed: Parsed) {
  const { bookmarks, skipped } = readBookmarksHtml(file.text);
  if ((bookmarks.length === 0) && (skipped.length === 0)) {
    parsed.unreadable.push({ file: file.name, what: "The file", reason: "has no bookmarks (export them from the browser's bookmark manager as an HTML file)" });
    return;
  }
  for (const x of skipped) {
    parsed.unreadable.push({ file: file.name, what: `Bookmark “${x.title || "(no title)"}”`, reason: x.reason, line: x.line });
  }
  for (const bookmark of bookmarks) {
    parsed.entries.bookmarks.push({
      uid: comparableUrl(bookmark.url),
      title: bookmark.title || bookmark.url,
      content: bookmark.url,
      date: (bookmark.created) ? new Date(bookmark.created) : undefined,
      bookmark,
    });
  }
}

export function readFiles(files: ImportFile[]): Parsed {
  const parsed: Parsed = { files, entries: { calendar: [], tasks: [], contacts: [], notes: [], bookmarks: [] }, unreadable: [] };
  for (const file of files) {
    if (calendarExt.test(file.name)) {
      readCalendar(file, parsed);
    } else if (contactsExt.test(file.name)) {
      readContacts(file, parsed);
    } else if (notesExt.test(file.name)) {
      const title = file.name.replace(/\.[^.]+$/, "");
      parsed.entries.notes.push({ uid: title, title, content: file.text });
    } else if (bookmarksExt.test(file.name)) {
      readBookmarks(file, parsed);
    } else {
      parsed.unreadable.push({ file: file.name, what: "The file", reason: "isn't of a kind that can be imported (.ics, .vcf, .md, .txt or .html)" });
    }
  }
  return parsed;
}

// Where the entries of a kind go: a collection, or a new one with that name
export type Destination = { colUid: string } | { newName: string };
// What happens with ones that are there already (with the same UID, the same title for notes, or the
// same link for bookmarks)
export type Duplicates = "skip" | "update" | "copy";

export interface KindResult {
  kind: Kind;
  colUid: string;
  name: string;
  added: number;
  updated: number;
  skipped: number;
}

function withNewUid(content: string, uid: string) {
  return content.replace(/^UID:.*$/gm, `UID:${uid}`);
}

export async function runImport(etebase: Etebase.Account, parsed: Parsed, destinations: { [kind in Kind]?: Destination }, duplicates: Duplicates): Promise<KindResult[]> {
  const colMgr = etebase.getCollectionManager();
  const results: KindResult[] = [];
  for (const kind of Object.keys(destinations) as Kind[]) {
    const destination = destinations[kind]!;
    const entries = parsed.entries[kind];
    if (entries.length === 0) {
      continue;
    }
    const colUid = ("colUid" in destination) ? destination.colUid : await createCollection(etebase, kind, { name: destination.newName });
    const state = store.getState() as unknown as StoreState;
    const cachedCol = state.allCache.collections.get(colUid)!;
    const col = colMgr.cacheLoad(cachedCol.cache);
    const itemMgr = colMgr.getItemManager(col);

    // The items that are there already, by their UID (for notes, their title, for bookmarks, their link)
    const existing = new Map<string, Etebase.Item>();
    for (const cached of state.allCache.items.get(colUid)?.values() ?? []) {
      if (cached.isDeleted) {
        continue;
      }
      const item = itemMgr.cacheLoad(cached.cache);
      if (kind === "notes") {
        existing.set(cached.meta.name ?? "", item);
      } else if (kind === "bookmarks") {
        existing.set(comparableUrl((cached.meta as { url?: string }).url ?? ""), item);
      } else {
        const content = (await item.getContent(Etebase.OutputFormat.String)).replace(/\r?\n[ \t]/g, "");
        const m = /^UID:(.*)$/m.exec(content);
        if (m) {
          existing.set(m[1].trim().replace(/^urn:uuid:/, ""), item);
        }
      }
    }

    const result: KindResult = { kind, colUid, name: cachedCol.meta.name ?? "", added: 0, updated: 0, skipped: 0 };
    const items: Etebase.Item[] = [];
    const mtime = (new Date()).getTime();
    for (const entry of entries) {
      const there = existing.get(entry.uid);
      if (there && (duplicates === "skip")) {
        result.skipped++;
      } else if (there && (duplicates === "update") && entry.bookmark) {
        // (it keeps when it was saved first)
        const before = there.getMeta() as Partial<BookmarkMetadata>;
        const meta = { ...before, ...metaOf(entry.bookmark, before.created ?? entry.bookmark.created ?? mtime, before.savedFrom ?? "import") };
        there.setMeta(meta);
        await there.setContent(meta.url);
        items.push(there);
        result.updated++;
      } else if (there && (duplicates === "update")) {
        await there.setContent(entry.content);
        there.setMeta({ ...there.getMeta(), mtime });
        items.push(there);
        result.updated++;
      } else if (entry.bookmark) {
        const meta = metaOf(entry.bookmark, entry.bookmark.created ?? mtime, "import");
        items.push(await itemMgr.create(meta, meta.url));
        result.added++;
      } else {
        const copy = !!there;
        const id = (copy && (kind !== "notes")) ? uuid.v4() : entry.uid;
        const content = (copy && (kind !== "notes")) ? withNewUid(entry.content, id) : entry.content;
        items.push(await itemMgr.create({ name: (kind === "notes") ? entry.title : id, mtime }, content));
        result.added++;
      }
    }
    // (saved in parts, so that a big file doesn't stop the app for long)
    for (let i = 0 ; i < items.length ; i += 50) {
      await saveItemsLocally(etebase, col, itemMgr, items.slice(i, i + 50));
    }
    results.push(result);
  }
  return results;
}

export function kindNoun(kind: Kind, count: number) {
  const unit = kinds[kind].unit;
  return (count === 1) ? unit.replace(/s$/, "") : unit;
}
