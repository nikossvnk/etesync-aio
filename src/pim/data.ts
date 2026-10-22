// SPDX-FileCopyrightText: © 2020 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

// The calendars, task lists and address books, and their items, from the same synced cache as the
// notebooks. Saving works like with notes: the change is kept on the device and pushed by the sync,
// so it also works offline.

import * as React from "react";
import * as Etebase from "etebase";
import { useSelector } from "react-redux";
import { Map as ImmutableMap } from "immutable";

import { store, StoreState } from "../store";
import { CachedCollection, CachedCollectionsData, CachedItem, CachedItemsData } from "../store/reducers";
import { pushMessage } from "../store/actions";
import { saveItemsLocally } from "../sync/SyncManager";
import { findItem, loadCollection } from "../cached";
import { PimType } from "./pim-types";
import { defaultColor } from "../constants";

export interface PimCollection {
  colUid: string;
  name: string;
  color: string;
  collectionType: string;
}

export function usePimCollections(colType: string): PimCollection[] {
  const cached = useSelector((state: StoreState) => state.allCache.collections);
  return React.useMemo(() => (
    Array.from(cached.entries())
      .filter(([_colUid, col]) => col.collectionType === colType)
      .map(([colUid, col]) => ({
        colUid,
        name: col.meta.name ?? "",
        // (the web app saves the color with an alpha, e.g. "#8BC34AFF")
        color: (col.meta.color || defaultColor).slice(0, 7),
        collectionType: col.collectionType,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [cached, colType]);
}

// Decrypting and parsing an item is slow, so it's only done again when its cache entry changes
const parsedCache = new WeakMap<CachedItem, PimType | null>();
// The items that couldn't be read (by their uid), which were already told about
const unreadable = new Set<string>();

// An item that can't be read (e.g. made by an app that writes it in a way this one doesn't know) is
// left out, and the user is told once. Its content (which the parser's error has) isn't shown or
// logged, it could be private, and the error doesn't stop the app like an error of the app would.
function reportUnreadable(itemUid: string) {
  if (unreadable.has(itemUid)) {
    return;
  }
  unreadable.add(itemUid);
  store.dispatch(pushMessage({ message: "An item couldn't be read, so it isn't shown (it may be in a format the app doesn't know).", severity: "warning" }));
}

async function parseItem<T extends PimType>(colMgr: Etebase.CollectionManager, cachedCol: CachedCollection, cachedItem: CachedItem, parse: (content: string) => T): Promise<T | null> {
  const known = parsedCache.get(cachedItem);
  if (known !== undefined) {
    return known as T | null;
  }
  let ret: T | null = null;
  try {
    const col = colMgr.cacheLoad(cachedCol.cache);
    const item = colMgr.getItemManager(col).cacheLoad(cachedItem.cache);
    ret = parse(await item.getContent(Etebase.OutputFormat.String));
  } catch (e) {
    reportUnreadable(cachedItem.meta.name ?? "");
  }
  parsedCache.set(cachedItem, ret);
  return ret;
}

// The cache entries of the collections of a type and their items. It's the same object while none
// of them changed (a note being saved doesn't change the events'), so their items are only parsed
// again then.
export interface TypeEntries {
  collections: [string, CachedCollection][];
  items: (ImmutableMap<string, CachedItem> | undefined)[];
}

const lastEntries = new Map<string, { allCollections: CachedCollectionsData, allItems: CachedItemsData, entries: TypeEntries }>();

export function entriesOfType(state: StoreState, colType: string): TypeEntries {
  const { collections: allCollections, items: allItems } = state.allCache;
  const last = lastEntries.get(colType);
  if (last && (last.allCollections === allCollections) && (last.allItems === allItems)) {
    return last.entries;
  }
  const collections = Array.from(allCollections.entries()).filter(([_colUid, col]) => col.collectionType === colType);
  const items = collections.map(([colUid]) => allItems.get(colUid));
  const same = last && (last.entries.collections.length === collections.length) &&
    collections.every(([colUid, col], i) => (last.entries.collections[i][0] === colUid) && (last.entries.collections[i][1] === col) && (last.entries.items[i] === items[i]));
  const entries = (same) ? last!.entries : { collections, items };
  lastEntries.set(colType, { allCollections, allItems, entries });
  return entries;
}

// The parsed items of the entries, for all of the screens that show them: the first one to need
// them parses them (one item after the other, so the screen stays responsive), the others get the
// same list.
const loadedItems = new WeakMap<TypeEntries, Promise<PimType[]>>();
const loadedItemsNow = new WeakMap<TypeEntries, PimType[]>();

export function loadPimItems<T extends PimType>(etebase: Etebase.Account, entries: TypeEntries, parse: (content: string) => T): Promise<T[]> {
  let ret = loadedItems.get(entries);
  if (!ret) {
    ret = (async () => {
      const colMgr = etebase.getCollectionManager();
      const items: T[] = [];
      for (let i = 0; i < entries.collections.length; i++) {
        const [colUid, cachedCol] = entries.collections[i];
        for (const [itemUid, cachedItem] of (entries.items[i]?.entries() ?? [])) {
          if (cachedItem.isDeleted) {
            continue;
          }
          const item = await parseItem(colMgr, cachedCol, cachedItem, parse);
          if (item) {
            item.collectionUid = colUid;
            item.itemUid = itemUid;
            items.push(item);
          }
        }
      }
      loadedItemsNow.set(entries, items);
      return items;
    })();
    loadedItems.set(entries, ret);
  }
  return ret as Promise<T[]>;
}

// All of the (not deleted) items of the collections of a type, parsed. Undefined while loading.
export function usePimItems<T extends PimType>(etebase: Etebase.Account | null | undefined, colType: string, parse: (content: string) => T): T[] | undefined {
  const entries = useSelector((state: StoreState) => entriesOfType(state, colType));
  const [ret, setRet] = React.useState(() => loadedItemsNow.get(entries) as T[] | undefined);

  React.useEffect(() => {
    if (!etebase) {
      return undefined;
    }
    let cancel = false;
    loadPimItems(etebase, entries, parse).then((items) => {
      if (!cancel) {
        setRet(items);
      }
    });
    return () => {
      cancel = true;
    };
  }, [etebase, entries]);

  return ret;
}

// Saves a new item (when it has no itemUid yet) or a changed one to a collection. Moving an item to
// another collection saves it there and deletes it from the one it was in.
// (the times of a repeating event or task that were changed are a part of the item, see
// EventType.changedTimes, so they're saved with it)
export async function savePimItem(etebase: Etebase.Account, colUid: string, item: PimType) {
  const mtime = (new Date()).getTime();
  const content = item.toIcal();

  if (item.itemUid && item.collectionUid && (item.collectionUid !== colUid)) {
    await deletePimItem(etebase, item);
    item.itemUid = undefined;
  }

  const { col, itemMgr } = loadCollection(etebase, colUid);
  const existing = (item.itemUid) ? findItem(etebase, colUid, item.itemUid)?.item : undefined;
  let eteItem: Etebase.Item;
  if (existing) {
    eteItem = existing;
    await eteItem.setContent(content);
    eteItem.setMeta({ ...eteItem.getMeta(), mtime });
  } else {
    eteItem = await itemMgr.create({ name: item.uid, mtime }, content);
  }
  await saveItemsLocally(etebase, col, itemMgr, [eteItem]);
  item.collectionUid = colUid;
  item.itemUid = eteItem.uid;
}

export async function deletePimItem(etebase: Etebase.Account, item: PimType) {
  const loaded = findItem(etebase, item.collectionUid!, item.itemUid!);
  if (!loaded) {
    return;
  }
  const { col, itemMgr, item: eteItem } = loaded;
  eteItem.setMeta({ ...eteItem.getMeta(), mtime: (new Date()).getTime() });
  eteItem.delete(true);
  await saveItemsLocally(etebase, col, itemMgr, [eteItem]);
}
