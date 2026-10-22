// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Collections and items as the device has them (the synced cache, see SyncManager), loaded by their
// UIDs to read or change them

import * as Etebase from "etebase";

import { store } from "./store";

// A collection, with its item manager. Undefined when the device doesn't have it (anymore).
export function findCollection(etebase: Etebase.Account, colUid: string) {
  const cached = store.getState().allCache.collections.get(colUid);
  if (!cached) {
    return undefined;
  }
  const colMgr = etebase.getCollectionManager();
  const col = colMgr.cacheLoad(cached.cache);
  return { colMgr, col, itemMgr: colMgr.getItemManager(col) };
}

// An item, with its collection. Undefined when the device doesn't have it (anymore).
export function findItem(etebase: Etebase.Account, colUid: string, itemUid: string) {
  const cached = store.getState().allCache.items.get(colUid)?.get(itemUid);
  const loaded = (cached) ? findCollection(etebase, colUid) : undefined;
  if (!cached || !loaded) {
    return undefined;
  }
  return { ...loaded, item: loaded.itemMgr.cacheLoad(cached.cache) };
}

// The same, for when it has to be there
export function loadCollection(etebase: Etebase.Account, colUid: string) {
  const ret = findCollection(etebase, colUid);
  if (!ret) {
    throw new Error("The collection is not available anymore");
  }
  return ret;
}

export function loadItem(etebase: Etebase.Account, colUid: string, itemUid: string) {
  const ret = findItem(etebase, colUid, itemUid);
  if (!ret) {
    throw new Error("The item is not available anymore");
  }
  return ret;
}
