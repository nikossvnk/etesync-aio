// SPDX-FileCopyrightText: © 2020 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

// The calendars, task lists and address books, and their items, from the same synced cache as the
// notebooks. Saving works like with notes: the change is kept on the device and pushed by the sync,
// so it also works offline.

import * as React from "react";
import * as Etebase from "etebase";
import { useSelector } from "react-redux";

import { store, StoreState } from "../store";
import { CachedCollection, CachedItem } from "../store/reducers";
import { pushMessage } from "../store/actions";
import { saveCollectionLocally, saveItemsLocally } from "../sync/SyncManager";
import { PimType } from "./pim-types";

export const defaultColor = "#8BC34A";

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

// All of the (not deleted) items of the collections of a type, parsed. Undefined while loading.
export function usePimItems<T extends PimType>(etebase: Etebase.Account | null | undefined, colType: string, parse: (content: string) => T): T[] | undefined {
  const cachedCollections = useSelector((state: StoreState) => state.allCache.collections);
  const cachedItems = useSelector((state: StoreState) => state.allCache.items);
  const [ret, setRet] = React.useState<T[]>();

  React.useEffect(() => {
    if (!etebase) {
      return undefined;
    }
    let cancel = false;
    (async () => {
      const colMgr = etebase.getCollectionManager();
      const items: T[] = [];
      for (const [colUid, cachedCol] of cachedCollections.entries()) {
        if (cachedCol.collectionType !== colType) {
          continue;
        }
        for (const [itemUid, cachedItem] of (cachedItems.get(colUid)?.entries() ?? [])) {
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
      if (!cancel) {
        setRet(items);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [etebase, cachedCollections, cachedItems, colType]);

  return ret;
}

function loadCollection(etebase: Etebase.Account, colUid: string) {
  const state = store.getState() as unknown as StoreState;
  const cachedCol = state.allCache.collections.get(colUid);
  if (!cachedCol) {
    throw new Error("The collection is not available anymore");
  }
  const colMgr = etebase.getCollectionManager();
  const col = colMgr.cacheLoad(cachedCol.cache);
  return { col, itemMgr: colMgr.getItemManager(col), state };
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

  const { col, itemMgr, state } = loadCollection(etebase, colUid);
  const cachedItem = (item.itemUid) ? state.allCache.items.get(colUid)?.get(item.itemUid) : undefined;
  let eteItem: Etebase.Item;
  if (cachedItem) {
    eteItem = itemMgr.cacheLoad(cachedItem.cache);
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
  const { col, itemMgr, state } = loadCollection(etebase, item.collectionUid!);
  const cachedItem = state.allCache.items.get(item.collectionUid!)?.get(item.itemUid!);
  if (!cachedItem) {
    return;
  }
  const eteItem = itemMgr.cacheLoad(cachedItem.cache);
  eteItem.setMeta({ ...eteItem.getMeta(), mtime: (new Date()).getTime() });
  eteItem.delete(true);
  await saveItemsLocally(etebase, col, itemMgr, [eteItem]);
}

export async function createPimCollection(etebase: Etebase.Account, colType: string, name: string, color?: string) {
  const colMgr = etebase.getCollectionManager();
  const col = await colMgr.create(colType, { name, mtime: (new Date()).getTime(), color }, "");
  await saveCollectionLocally(etebase, colMgr, col, true);
  return col.uid;
}
