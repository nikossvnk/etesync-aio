// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Bookmarks, the same as in EteSync Notes (on Android): saved links, in collections of their own type
// (bookmark lists), with a title, a note and tags

import * as Etebase from "etebase";
import { Platform } from "react-native";
import { createSelector } from "reselect";

import * as C from "./constants";
import { store } from "./store";
import { CachedCollectionsData, CachedItem, CachedItemsData } from "./store/reducers";
import { saveCollectionLocally, saveItemsLocally } from "./sync/SyncManager";

// A bookmark is an item of a bookmarks collection (C.bookmarkColType). Its title is the item's name,
// and the rest is in its meta too, so that lists don't have to decrypt the content of each one. The
// content is just the link, for whatever reads it as text.
export interface BookmarkMetadata extends Etebase.ItemMetadata {
  name: string; // the title
  mtime: number;
  url: string;
  description?: string; // the note
  tags?: string[];
  created?: number;
  // Where it was saved: see SavedFrom (unset in bookmarks saved before this was recorded)
  savedFrom?: SavedFrom;
}

// Where a bookmark was saved: in the Android app (from its own screen, or shared to it by another app),
// on a computer (this app), or imported from a browser's bookmark file
export type SavedFrom = "android" | "android-share" | "computer" | "import";

// Where this app saves bookmarks from
export const savedHere: SavedFrom = (Platform.OS === "android") ? "android" : "computer";

// Says where a bookmark was saved, after "Saved 12 Oct": e.g. "from Android (Share)"
export function savedFromLabel(from: SavedFrom | undefined) {
  switch (from) {
    case "android": return "on Android";
    case "android-share": return "from Android (Share)";
    case "computer": return "on a computer";
    case "import": return "imported from a browser";
    default: return undefined;
  }
}

export interface Bookmark {
  colUid: string;
  uid: string;
  title: string;
  url: string;
  note: string;
  tags: string[];
  created: number;
  mtime: number;
  savedFrom?: SavedFrom;
}

// The details a bookmark is saved with
export interface BookmarkData {
  title: string;
  url: string;
  note: string;
  tags: string[];
}

export const defaultCollectionName = "Bookmarks";

interface CacheState {
  allCache: {
    collections: CachedCollectionsData;
    items: CachedItemsData;
  };
}

// The bookmark collections and their items, which only change when the cache does
export const bookmarkCollectionsSelector = createSelector(
  (state: CacheState) => state.allCache.collections,
  (collections) => collections.filter((x) => x.collectionType === C.bookmarkColType)
);
export const bookmarksSelector = createSelector(
  bookmarkCollectionsSelector,
  (state: CacheState) => state.allCache.items,
  (cols, items) => items.filter((_x, colUid) => cols.has(colUid))
);

export function toBookmark(colUid: string, uid: string, cached: CachedItem): Bookmark {
  const meta = cached.meta as Partial<BookmarkMetadata>;
  const mtime = meta.mtime ?? 0;
  return {
    colUid,
    uid,
    title: meta.name ?? "",
    url: meta.url ?? "",
    note: meta.description ?? "",
    tags: meta.tags ?? [],
    created: meta.created ?? mtime,
    mtime,
    savedFrom: meta.savedFrom,
  };
}

// The bookmarks (that aren't deleted) of the cached items, the latest first
export function bookmarksFrom(cached: CachedItemsData): Bookmark[] {
  const ret: Bookmark[] = [];
  for (const [colUid, items] of cached.entries()) {
    for (const [uid, item] of items.entries()) {
      if (!item.isDeleted) {
        ret.push(toBookmark(colUid, uid, item));
      }
    }
  }
  return ret.sort((a, b) => b.created - a.created);
}

// The site of a link, without "www."
export function domainOf(url: string) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  const host = (match) ? match[1].replace(/^[^@]*@/, "").replace(/:\d+$/, "") : url.trim();
  return host.replace(/^www\./i, "").toLowerCase();
}

// What a bookmark is called: its title, or else its site
export function bookmarkTitle(bookmark: { title: string, url: string }) {
  return bookmark.title.trim() || domainOf(bookmark.url) || bookmark.url;
}

// The letter of a site's tile: the first of its name, without the parts that many sites have in front
// (e.g. "en." of en.wikipedia.org, "developer." of developer.mozilla.org)
export function siteLetter(url: string) {
  const domain = domainOf(url);
  if (/^[\d.:[\]]+$/.test(domain)) {
    // (an IP address)
    return domain.replace(/^\[/, "")[0] ?? "?";
  }
  const parts = domain.split(".");
  const name = (parts.length > 2) ? parts[parts.length - 2] : parts[0];
  return (name?.[0] ?? "?").toUpperCase();
}

// A link as it's saved: with a scheme (https if it has none), and without spaces around it
export function normalizeUrl(url: string) {
  const ret = url.trim();
  if (ret === "") {
    return ret;
  }
  // (a dot before the colon is a host with a port, e.g. "example.com:8080")
  return (/^[a-z][a-z0-9+-]*:/i.test(ret)) ? ret : `https://${ret}`;
}

// Whether it's a link that can be saved: a web address (with a dot in its host, the scheme can be left
// out), or a link with another scheme (e.g. "mailto:")
export function isValidUrl(url: string) {
  const ret = normalizeUrl(url);
  if ((ret === "") || /\s/.test(ret)) {
    return false;
  }
  return (/^https?:/i.test(ret)) ? /^https?:\/\/([^/?#.]+(\.[^/?#.]+)+|localhost)([/?#:]|$)/i.test(ret) : true;
}

// The link for comparing, to find out whether it was saved already: "https://Example.com/a/" and
// "http://example.com/a" are the same page
export function comparableUrl(url: string) {
  return normalizeUrl(url)
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .replace(/^[^/?]+/, (host) => host.toLowerCase());
}

// A web link in a text, e.g. what's pasted or dropped, which is often the title and then the link
export function findUrl(text: string) {
  const match = /\bhttps?:\/\/[^\s<>"]+/i.exec(text);
  return (match) ? match[0].replace(/[.,;:!?)\]}'"]+$/, "") : undefined;
}

// All of the tags of the bookmarks, the most used first
export function allTags(bookmarks: Bookmark[]) {
  const counts = new Map<string, number>();
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort(([a, x], [b, y]) => (y - x) || a.localeCompare(b))
    .map(([tag]) => tag);
}

// A tag as it's saved: without the "#" and the spaces
export function normalizeTag(tag: string) {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase();
}

// The bookmark collections, the default one ("Bookmarks") first
export function bookmarkCollections(state: any) {
  return Array.from(bookmarkCollectionsSelector(state).entries())
    .map(([uid, col]) => ({ uid, name: col.meta.name ?? defaultCollectionName }))
    .sort((a, b) => ((a.name === defaultCollectionName) ? -1 : (b.name === defaultCollectionName) ? 1 : a.name.localeCompare(b.name)));
}

// The collection to save in: the given one, or else the first one. There's always one: it's created
// (on the device, and uploaded with the next sync) when there's none yet.
async function getCollection(etebase: Etebase.Account, colUid?: string) {
  const colMgr = etebase.getCollectionManager();
  const state = store.getState() as any;
  const cols = bookmarkCollectionsSelector(state);
  const uid = (colUid && cols.has(colUid)) ? colUid : bookmarkCollections(state)[0]?.uid;
  if (uid) {
    return colMgr.cacheLoad(cols.get(uid)!.cache);
  }
  const col = await colMgr.create(C.bookmarkColType, { name: defaultCollectionName, mtime: (new Date()).getTime() }, "");
  await saveCollectionLocally(etebase, colMgr, col, true);
  return col;
}

export function metaOf(data: BookmarkData, created: number, savedFrom?: SavedFrom): BookmarkMetadata {
  const tags = Array.from(new Set(data.tags.map(normalizeTag).filter((x) => x !== "")));
  return {
    name: data.title.trim(),
    mtime: (new Date()).getTime(),
    url: normalizeUrl(data.url),
    description: data.note.trim() || undefined,
    tags: (tags.length > 0) ? tags : undefined,
    created,
    savedFrom,
  };
}

// Saves a new bookmark (to the device, and uploads it), and returns where it is. It's saved from here,
// unless it's one that was saved elsewhere before (moved to another list, or deleted and undone).
export async function createBookmark(etebase: Etebase.Account, data: BookmarkData, colUid?: string, created?: number, savedFrom: SavedFrom | undefined = savedHere) {
  const col = await getCollection(etebase, colUid);
  const itemMgr = etebase.getCollectionManager().getItemManager(col);
  const meta = metaOf(data, created ?? (new Date()).getTime(), savedFrom);
  const item = await itemMgr.create(meta, meta.url);
  await saveItemsLocally(etebase, col, itemMgr, [item]);
  return { colUid: col.uid, uid: item.uid };
}

function loadItem(etebase: Etebase.Account, colUid: string, uid: string) {
  const state = store.getState() as any;
  const cachedCol = bookmarkCollectionsSelector(state).get(colUid);
  const cachedItem: CachedItem | undefined = state.allCache.items.get(colUid)?.get(uid);
  if (!cachedCol || !cachedItem) {
    return undefined;
  }
  const colMgr = etebase.getCollectionManager();
  const col = colMgr.cacheLoad(cachedCol.cache);
  const itemMgr = colMgr.getItemManager(col);
  return { col, itemMgr, item: itemMgr.cacheLoad(cachedItem.cache) };
}

// Changes a bookmark. Moving it to another collection makes a new one there (an item can't change
// its collection), so it returns where it is now.
export async function updateBookmark(etebase: Etebase.Account, bookmark: Bookmark, data: BookmarkData, colUid?: string) {
  if (colUid && (colUid !== bookmark.colUid)) {
    const ret = await createBookmark(etebase, data, colUid, bookmark.created, bookmark.savedFrom);
    await deleteBookmark(etebase, bookmark);
    return ret;
  }
  const loaded = loadItem(etebase, bookmark.colUid, bookmark.uid);
  if (!loaded) {
    throw new Error("The bookmark is not available anymore");
  }
  const { col, itemMgr, item } = loaded;
  // (what else it has, e.g. from a newer version of the app, is kept)
  const meta = { ...item.getMeta(), ...metaOf(data, bookmark.created, bookmark.savedFrom) };
  item.setMeta(meta);
  await item.setContent(meta.url);
  await saveItemsLocally(etebase, col, itemMgr, [item]);
  return { colUid: bookmark.colUid, uid: bookmark.uid };
}

export async function deleteBookmark(etebase: Etebase.Account, bookmark: Bookmark) {
  const loaded = loadItem(etebase, bookmark.colUid, bookmark.uid);
  if (!loaded || loaded.item.isDeleted) {
    return;
  }
  const { col, itemMgr, item } = loaded;
  const meta = item.getMeta();
  meta.mtime = (new Date()).getTime();
  item.setMeta(meta);
  item.delete(true);
  await saveItemsLocally(etebase, col, itemMgr, [item]);
}

// Undoes deleting a bookmark. A deleted item can't come back, so it's saved again as a new one.
export async function restoreBookmark(etebase: Etebase.Account, bookmark: Bookmark) {
  return createBookmark(etebase, bookmark, bookmark.colUid, bookmark.created, bookmark.savedFrom);
}

// Adds tags to several bookmarks at once (the ones that have them already stay as they are)
export async function tagBookmarks(etebase: Etebase.Account, bookmarks: Bookmark[], tags: string[]) {
  for (const bookmark of bookmarks) {
    const merged = Array.from(new Set([...bookmark.tags, ...tags.map(normalizeTag).filter((x) => x !== "")]));
    if (merged.length !== bookmark.tags.length) {
      await updateBookmark(etebase, bookmark, { ...bookmark, tags: merged });
    }
  }
}

// The title of a web page, read from it. This contacts the site, so it's only done when asked for (the
// "Get title" button), like in EteSync Notes. Browsers don't let a page read other sites, so on the web the local server reads it (see
// local-web/serve.py); without one (e.g. while developing) there's no title, and the site is shown.
export async function fetchTitle(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    if (Platform.OS === "web") {
      const response = await fetch(`/bookmark-title?url=${encodeURIComponent(normalizeUrl(url))}`, {
        signal: controller.signal,
        // (which a page of another site can't send without asking first, so only the app can use it)
        headers: { "X-EteSync-Request": "title" },
      });
      if (!response.ok || !(response.headers.get("Content-Type") ?? "").startsWith("application/json")) {
        return undefined;
      }
      const title = (await response.json()).title;
      return (typeof title === "string" && title.trim()) ? title.trim() : undefined;
    }
    const response = await fetch(normalizeUrl(url), {
      signal: controller.signal,
      credentials: "omit",
      // Some sites refuse the default "okhttp" (e.g. Wikipedia), and also a browser's that the request
      // doesn't otherwise look like, so it says what it is, as they ask for
      headers: { "User-Agent": `EteSync (+${C.sourceCode})` },
    });
    if (!response.ok) {
      return undefined;
    }
    return titleOfHtml((await response.text()).slice(0, 200000));
  } catch (e) {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

// The title of a page: its og:title, or else its <title>
export function titleOfHtml(html: string) {
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html);
  const title = og?.[1] ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  return (title) ? decodeEntities(title).replace(/\s+/g, " ").trim() || undefined : undefined;
}

function decodeEntities(text: string) {
  const named: { [name: string]: string } = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = (code[1].toLowerCase() === "x") ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return (Number.isFinite(n) && (n > 0) && (n <= 0x10FFFF)) ? String.fromCodePoint(n) : all;
    }
    return named[code.toLowerCase()] ?? all;
  });
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The bookmark files of browsers (the "Netscape" format that Chrome, Firefox, Safari and Edge export
// and import): the bookmarks of a list, in a folder named after it
export function bookmarksToHtml(name: string, bookmarks: Bookmark[]) {
  const seconds = (time: number) => Math.floor(time / 1000);
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->",
    "<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">",
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    `    <DT><H3>${escapeHtml(name)}</H3>`,
    "    <DL><p>",
  ];
  for (const x of bookmarks) {
    const tags = (x.tags.length > 0) ? ` TAGS="${escapeHtml(x.tags.join(","))}"` : "";
    lines.push(`        <DT><A HREF="${escapeHtml(x.url)}" ADD_DATE="${seconds(x.created)}" LAST_MODIFIED="${seconds(x.mtime)}"${tags}>${escapeHtml(bookmarkTitle(x))}</A>`);
    if (x.note) {
      lines.push(`        <DD>${escapeHtml(x.note)}`);
    }
  }
  lines.push("    </DL><p>", "</DL><p>", "");
  return lines.join("\n");
}

// The folders that browsers put all bookmarks in, which aren't made tags
const browserFolders = /^(bookmarks( bar| toolbar| menu)?|favou?rites( bar)?|other bookmarks|mobile bookmarks|unsorted bookmarks|imported|lesezeichen(symbolleiste)?)$/i;

export interface ParsedBookmark extends BookmarkData {
  created?: number;
}

// Reads the bookmarks of a browser's bookmark file. The folders they're in become their tags (except
// the browser's own ones, e.g. "Bookmarks bar"), with the tags they have (Firefox's). A link that's in
// several folders is one bookmark with the tags of all of them.
export function readBookmarksHtml(text: string): { bookmarks: ParsedBookmark[], skipped: { title: string, reason: string, line: number }[] } {
  const bookmarks = new Map<string, ParsedBookmark>();
  const skipped: { title: string, reason: string, line: number }[] = [];
  const folders: (string | undefined)[] = [];
  let pendingFolder: string | undefined;
  let last: ParsedBookmark | undefined;
  const attr = (tag: string, name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return (m) ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : undefined;
  };
  const strip = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
  const token = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<dl\b[^>]*>|<\/dl\s*>|(<a\b[^>]*>)([\s\S]*?)<\/a>|<dd\b[^>]*>([^<]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = token.exec(text)) !== null) {
    const all = m[0].toLowerCase();
    if (m[1] !== undefined) {
      pendingFolder = strip(m[1]);
      last = undefined;
    } else if (all.startsWith("<dl")) {
      folders.push(pendingFolder);
      pendingFolder = undefined;
    } else if (all.startsWith("</dl")) {
      folders.pop();
      last = undefined;
    } else if (m[2] !== undefined) {
      const href = (attr(m[2], "href") ?? "").trim();
      const title = strip(m[3]);
      const line = text.slice(0, m.index).split("\n").length;
      last = undefined;
      if (!href) {
        skipped.push({ title, reason: "has no link", line });
        continue;
      } else if (!/^(https?|ftp|mailto):/i.test(href)) {
        // (e.g. "javascript:" bookmarklets, and the browser's own pages, like "place:" or "chrome:")
        skipped.push({ title, reason: `is a link that can't be saved (${href.split(":")[0]}:)`, line });
        continue;
      }
      const folderTags = folders.filter((x): x is string => !!x && !browserFolders.test(x));
      const tags = [...folderTags, ...(attr(m[2], "tags") ?? "").split(",")].map(normalizeTag).filter((x) => x !== "");
      const added = Number(attr(m[2], "add_date"));
      const created = (Number.isFinite(added) && (added > 0)) ? ((added > 1e14) ? Math.floor(added / 1000) : (added > 1e11) ? added : added * 1000) : undefined;
      const key = comparableUrl(href);
      const there = bookmarks.get(key);
      if (there) {
        there.tags = Array.from(new Set([...there.tags, ...tags]));
        last = there;
      } else {
        last = { url: href, title, note: "", tags: Array.from(new Set(tags)), created };
        bookmarks.set(key, last);
      }
    } else if ((m[4] !== undefined) && last && !last.note) {
      // The description of the bookmark before it
      last.note = strip(m[4]);
    }
  }
  return { bookmarks: Array.from(bookmarks.values()), skipped };
}
