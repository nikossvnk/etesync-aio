// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as Etebase from "etebase";

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { store, persistor, StoreState, asyncDispatch } from "../store";

import { credentialsSelector } from "../credentials";
import { setSyncCollection, unsetSyncCollection, setSyncGeneral, setCacheCollection, unsetCacheCollection, setPendingCollection, unsetPendingCollection, setCacheItem, setCacheItemMulti, setSyncItem, unsetSyncItem, addError, performSync, pushMessage, setSyncStatus } from "../store/actions";
import { CachedCollection, CachedItem } from "../store/reducers";
import * as C from "../constants";
import { startTask, arrayToChunkIterator } from "../helpers";

const cachedSyncManager = new Map<string, SyncManager>();
export class SyncManager {
  private COLLECTION_TYPES = C.collectionTypes;
  private BATCH_SIZE = 20;

  public static getManager(etebase: Etebase.Account) {
    const cached = cachedSyncManager.get(etebase.user.username);
    if (cached) {
      return cached;
    }

    const ret = new SyncManager();
    cachedSyncManager.set(etebase.user.username, ret);
    return ret;
  }

  public static removeManager(etebase: Etebase.Account) {
    cachedSyncManager.delete(etebase.user.username);
  }

  protected etebase: Etebase.Account;
  protected isSyncing: boolean;
  // Set when a sync was requested (or became needed) while another one was running
  protected resyncNeeded = false;

  private async fetchCollection(col: Etebase.Collection) {
    const storeState = store.getState() as unknown as StoreState;
    const etebase = (await credentialsSelector(storeState))!;
    const syncCollection = storeState.sync.collections.get(col.uid, undefined);

    const colMgr = etebase.getCollectionManager();
    const itemMgr = colMgr.getItemManager(col);

    let stoken = syncCollection?.stoken;
    const limit = this.BATCH_SIZE;
    let done = false;
    while (!done) {
      const items = await itemMgr.list({ stoken, limit });
      // Never overwrite items that have local changes waiting to be pushed.
      // The next push will detect the conflict and resolve it.
      const pending = (store.getState() as unknown as StoreState).sync.items.get(col.uid);
      const data = (pending) ? items.data.filter((item) => !pending.has(item.uid)) : items.data;
      if (data.length !== items.data.length) {
        this.resyncNeeded = true;
      }
      store.dispatch(setCacheItemMulti(col.uid, itemMgr, data));
      done = items.done;
      stoken = items.stoken;
    }

    if (syncCollection?.stoken !== stoken) {
      store.dispatch(setSyncCollection(col.uid, stoken!));
    }
  }

  private async fetchAllCollections() {
    const storeState = store.getState() as unknown as StoreState;
    const etebase = (await credentialsSelector(storeState))!;
    const syncGeneral = storeState.sync.general;

    const colMgr = etebase.getCollectionManager();
    const limit = this.BATCH_SIZE;
    // A type that wasn't synced before (e.g. bookmarks after an update, or the calendars of an install of
    // etesync-notes) also has the collections that are older than the stoken, so then all of them are
    // listed again (their items are fetched from where they were, with their own stokens)
    const sameTypes = (syncGeneral?.types ?? [C.colType]).join() === this.COLLECTION_TYPES.join();
    let stoken = (sameTypes) ? syncGeneral?.stoken : undefined;
    let done = false;
    while (!done) {
      const collections = await colMgr.list(this.COLLECTION_TYPES, { stoken, limit });
      for (const col of collections.data) {
        const collectionType = col.getCollectionType();
        if (this.COLLECTION_TYPES.includes(collectionType)) {
          // Never overwrite notebooks that have local changes waiting to be pushed.
          // The next push will detect the conflict and resolve it.
          const pending = this.getPendingCollection(col.uid);
          if (pending) {
            this.resyncNeeded = true;
            if (!pending.deletedCache && !col.isDeleted) {
              await this.fetchCollection(col);
            }
          } else if (col.isDeleted) {
            store.dispatch(unsetCacheCollection(colMgr, col.uid));
          } else {
            store.dispatch(setCacheCollection(colMgr, col));
            await this.fetchCollection(col);
          }
        }
      }
      if (collections.removedMemberships) {
        for (const removed of collections.removedMemberships) {
          store.dispatch(unsetPendingCollection(removed.uid));
          store.dispatch(unsetCacheCollection(colMgr, removed.uid));
        }
      }
      done = collections.done;
      stoken = collections.stoken;
    }

    if ((syncGeneral?.stoken !== stoken) || !sameTypes) {
      store.dispatch(setSyncGeneral(stoken ?? null, this.COLLECTION_TYPES));
    }
    return true;
  }

  public markLocalChanges() {
    if (this.isSyncing) {
      this.resyncNeeded = true;
    }
  }

  private getCachedItem(colUid: string, itemUid: string) {
    const storeState = store.getState() as unknown as StoreState;
    return storeState.allCache.items.get(colUid)?.get(itemUid);
  }

  // Called after an item was uploaded. "uploadedFrom" is the cache entry the uploaded item was loaded from.
  private async markPushed(col: Etebase.Collection, itemMgr: Etebase.ItemManager, item: Etebase.Item, uploadedFrom: CachedItem) {
    let current = this.getCachedItem(col.uid, item.uid);
    if (current === uploadedFrom) {
      await asyncDispatch(setCacheItem(col, itemMgr, item));
      store.dispatch(unsetSyncItem(col.uid, item.uid));
      return;
    }

    // The item was changed locally while we were uploading it. Reapply the local
    // changes on top of the uploaded revision and leave it queued for the next push.
    while (current) {
      const newer = itemMgr.cacheLoad(current.cache);
      item.setMeta(newer.getMeta());
      await item.setContent(await newer.getContent());
      if (newer.isDeleted) {
        item.delete(true);
      }

      const latest = this.getCachedItem(col.uid, item.uid);
      if (latest === current) {
        break;
      }
      current = latest;
    }
    await asyncDispatch(setCacheItem(col, itemMgr, item));
    this.resyncNeeded = true;
  }

  // The item was changed both locally and on the server. Keep both: the server version
  // stays as the note, and the local version is saved next to it as a conflict copy.
  private async resolveConflict(col: Etebase.Collection, itemMgr: Etebase.ItemManager, itemUid: string) {
    const cached = this.getCachedItem(col.uid, itemUid);
    const remote = await itemMgr.fetch(itemUid);

    if (cached) {
      const local = itemMgr.cacheLoad(cached.cache);
      const localMeta = local.getMeta();
      const localContent = await local.getContent(Etebase.OutputFormat.String);

      let identical = local.isDeleted === remote.isDeleted;
      if (identical && !local.isDeleted) {
        const remoteContent = await remote.getContent(Etebase.OutputFormat.String);
        identical = (remoteContent === localContent) && (remote.getMeta().name === localMeta.name);
        // (the note and the tags of a bookmark are in its meta)
        if (identical && (col.getCollectionType() === C.bookmarkColType)) {
          const withoutTime = (meta: Etebase.ItemMetadata) => JSON.stringify({ ...meta, mtime: undefined });
          identical = withoutTime(remote.getMeta()) === withoutTime(localMeta);
        }
      }

      // Calendars, task lists and address books get no copy: a copy would be a second event (or
      // task, or contact) with the same UID. The version from elsewhere is kept.
      const isNote = col.getCollectionType() === C.colType;
      if (!identical && !isNote) {
        store.dispatch(pushMessage({
          message: "An item was also changed elsewhere, so that version was kept and yours was discarded.",
          severity: "warning",
        }));
      }

      // A local deletion never wins over a change made elsewhere, the note is just restored.
      if (!identical && !local.isDeleted && isNote) {
        const copy = await itemMgr.create({
          ...localMeta,
          name: `${localMeta.name} (conflict copy)`,
          mtime: (new Date()).getTime(),
        }, localContent);
        await itemMgr.batch([copy]);
        await asyncDispatch(setCacheItem(col, itemMgr, copy));
        store.dispatch(pushMessage({
          message: `"${localMeta.name}" was also changed elsewhere. Your version was saved as "${localMeta.name} (conflict copy)".`,
          severity: "warning",
        }));
      }
    }

    await asyncDispatch(setCacheItem(col, itemMgr, remote));
    store.dispatch(unsetSyncItem(col.uid, itemUid));
  }

  private getPendingCollection(colUid: string) {
    const storeState = store.getState() as unknown as StoreState;
    return storeState.sync.pendingCollections.get(colUid);
  }

  private getCachedCollection(colUid: string) {
    const storeState = store.getState() as unknown as StoreState;
    return storeState.allCache.collections.get(colUid);
  }

  // Called after a notebook was uploaded. "uploadedFrom" is the cache entry the uploaded notebook was loaded from.
  private async markCollectionPushed(colMgr: Etebase.CollectionManager, col: Etebase.Collection, uploadedFrom: CachedCollection) {
    const current = this.getCachedCollection(col.uid);
    if (current === uploadedFrom) {
      await asyncDispatch(setCacheCollection(colMgr, col));
      store.dispatch(unsetPendingCollection(col.uid));
      return;
    }

    if (current) {
      // The notebook was changed locally while we were uploading it. Reapply the local
      // changes on top of the uploaded revision and leave it queued for the next push.
      col.setMeta(colMgr.cacheLoad(current.cache).getMeta());
      await asyncDispatch(setCacheCollection(colMgr, col));
      store.dispatch(setPendingCollection(col.uid, {}));
    } else {
      // The notebook was deleted locally while we were uploading it
      col.delete();
      store.dispatch(setPendingCollection(col.uid, { deletedCache: Etebase.toBase64(colMgr.cacheSave(col)) }));
    }
    this.resyncNeeded = true;
  }

  private async fetchRemoteCollection(colMgr: Etebase.CollectionManager, colUid: string) {
    try {
      const remote = await colMgr.fetch(colUid);
      return (remote.isDeleted) ? undefined : remote;
    } catch (e) {
      if (e instanceof Etebase.NotFoundError) {
        return undefined;
      }
      throw e;
    }
  }

  // Drop the local changes of a notebook and go back to what the server has
  private async revertCollection(colMgr: Etebase.CollectionManager, colUid: string, remote: Etebase.Collection | undefined) {
    store.dispatch(unsetPendingCollection(colUid));
    if (remote) {
      // The notes may not be available locally anymore, so fetch all of them again
      store.dispatch(unsetSyncCollection(colUid));
      await asyncDispatch(setCacheCollection(colMgr, remote));
      await this.fetchCollection(remote);
    } else {
      store.dispatch(unsetCacheCollection(colMgr, colUid));
    }
  }

  // The notebook was changed both locally and on the server
  private async resolveCollectionConflict(colMgr: Etebase.CollectionManager, local: Etebase.Collection, uploadedFrom: CachedCollection | undefined) {
    const name = local.getMeta().name;
    const remote = await this.fetchRemoteCollection(colMgr, local.uid);

    if (!uploadedFrom) {
      // A local deletion never wins over a change made elsewhere, the notebook is just restored.
      await this.revertCollection(colMgr, local.uid, remote);
      if (remote) {
        store.dispatch(pushMessage({ message: `"${name}" was changed elsewhere, so it was not deleted.`, severity: "warning" }));
      }
      return;
    }

    if (!remote) {
      await this.revertCollection(colMgr, local.uid, remote);
      store.dispatch(pushMessage({ message: `"${name}" was deleted elsewhere.`, severity: "warning" }));
      return;
    }

    // Unlike notes there is nothing to keep both of, so the local details (name, description, color) win
    remote.setMeta({ ...remote.getMeta(), ...local.getMeta() });
    await colMgr.transaction(remote);
    await this.markCollectionPushed(colMgr, remote, uploadedFrom);
  }

  private async pushCollections(etebase: Etebase.Account) {
    const storeState = store.getState() as unknown as StoreState;
    const colMgr = etebase.getCollectionManager();

    for (const [colUid, pending] of storeState.sync.pendingCollections.entries()) {
      const cacheCollection = (pending.deletedCache) ? undefined : this.getCachedCollection(colUid);
      if (!pending.deletedCache && !cacheCollection) {
        // The notebook is not available locally anymore, nothing to push
        store.dispatch(unsetPendingCollection(colUid));
        continue;
      }

      const col = colMgr.cacheLoad((pending.deletedCache) ? Etebase.fromBase64(pending.deletedCache) : cacheCollection!.cache);
      try {
        // A transaction (unlike an upload) fails if the notebook was changed on the server
        await colMgr.transaction(col);
        if (cacheCollection) {
          await this.markCollectionPushed(colMgr, col, cacheCollection);
        } else {
          store.dispatch(unsetPendingCollection(colUid));
        }
      } catch (e) {
        if (e instanceof Etebase.ConflictError) {
          try {
            await this.resolveCollectionConflict(colMgr, col, cacheCollection);
          } catch (e) {
            if (!(e instanceof Etebase.ConflictError)) {
              throw e;
            }
            // Changed on the server yet again, try again with the next sync
            this.resyncNeeded = true;
          }
        } else if ((e instanceof Etebase.PermissionDeniedError) && !pending.isNew) {
          await this.revertCollection(colMgr, colUid, await this.fetchRemoteCollection(colMgr, colUid));
          store.dispatch(pushMessage({ message: `You are not allowed to change "${col.getMeta().name}", so your changes to it were discarded.`, severity: "error" }));
        } else {
          throw e;
        }
      }
    }
  }

  private async pushAll() {
    const etebase = (await credentialsSelector(store.getState() as unknown as StoreState))!;
    // Notebooks go first, notes can't be pushed to a notebook the server doesn't know yet
    await this.pushCollections(etebase);

    const storeState = store.getState() as unknown as StoreState;
    const cacheCollections = storeState.allCache.collections;
    const cacheItems = storeState.allCache.items;
    const syncItemsAll = storeState.sync.items;

    for (const [colUid, syncItems] of syncItemsAll.entries()) {
      if (this.getPendingCollection(colUid)?.isNew) {
        // The notebook could not be created on the server yet, its notes have to wait
        continue;
      }
      const cacheCollection = cacheCollections.get(colUid);
      for (const chunk of arrayToChunkIterator(Array.from(syncItems.keys()), this.BATCH_SIZE)) {
        const entries = [];
        for (const itemUid of chunk) {
          const cacheItem = cacheItems.get(colUid)?.get(itemUid);
          if (cacheCollection && cacheItem) {
            entries.push({ itemUid, cacheItem });
          } else {
            // The notebook or the note is not available locally anymore, nothing to push
            store.dispatch(unsetSyncItem(colUid, itemUid));
          }
        }
        if (entries.length === 0) {
          continue;
        }

        const colMgr = etebase.getCollectionManager();
        const col = colMgr.cacheLoad(cacheCollection!.cache);
        const itemMgr = colMgr.getItemManager(col);
        const items = entries.map(({ cacheItem }) => itemMgr.cacheLoad(cacheItem.cache));

        try {
          // A transaction (unlike a batch) fails if any of the items was changed on the server
          await itemMgr.transaction(items);
          for (let i = 0 ; i < items.length ; i++) {
            await this.markPushed(col, itemMgr, items[i], entries[i].cacheItem);
          }
        } catch (e) {
          if (!(e instanceof Etebase.ConflictError)) {
            throw e;
          }

          // Push one by one to find out which items are conflicting
          for (let i = 0 ; i < items.length ; i++) {
            try {
              await itemMgr.transaction([items[i]]);
              await this.markPushed(col, itemMgr, items[i], entries[i].cacheItem);
            } catch (e) {
              if (!(e instanceof Etebase.ConflictError)) {
                throw e;
              }
              await this.resolveConflict(col, itemMgr, entries[i].itemUid);
            }
          }
        }
      }
    }

    return true;
  }

  public async sync(alwaysThrowErrors = false) {
    if (this.isSyncing) {
      return false;
    }
    this.isSyncing = true;
    this.resyncNeeded = false;

    try {
      store.dispatch(setSyncStatus("Pushing changes"));
      await this.pushAll();
      store.dispatch(setSyncStatus("Pulling changes"));
      const stoken = await this.fetchAllCollections();
      return stoken;
    } catch (e) {
      if (alwaysThrowErrors) {
        throw e;
      }

      if (e instanceof Etebase.NetworkError || e instanceof Etebase.TemporaryServerError) {
        // Ignore network errors
        return null;
      } else if (e instanceof Etebase.PermissionDeniedError) {
        store.dispatch(addError(e));
        return null;
      } else if (e instanceof Etebase.HttpError) {
        store.dispatch(addError(e));
        return null;
      }
      throw e;
    } finally {
      this.isSyncing = false;
      if (this.resyncNeeded && (store.getState() as unknown as StoreState).connection?.isConnected !== false) {
        setTimeout(() => {
          if (this.resyncNeeded) {
            store.dispatch(performSync(this.sync()));
          }
        }, 1000);
      }
    }
  }
}

// Sync in the background without waiting for the result.
// Pass localChanges when there is something new to push, so that it is not
// missed if a sync is already running.
export function requestSync(etebase: Etebase.Account, localChanges = false) {
  const syncManager = SyncManager.getManager(etebase);
  if (localChanges) {
    syncManager.markLocalChanges();
  }
  store.dispatch(performSync(syncManager.sync()));
}

// Save items to the local cache and queue them to be pushed to the server.
// This always works, even when offline.
export async function saveItemsLocally(etebase: Etebase.Account, col: Etebase.Collection, itemMgr: Etebase.ItemManager, items: Etebase.Item[]) {
  for (const item of items) {
    await asyncDispatch(setCacheItem(col, itemMgr, item));
    store.dispatch(setSyncItem(col.uid, item.uid));
  }
  requestSync(etebase, true);
}

// Save a notebook to the local cache and queue it to be pushed to the server.
// This always works, even when offline.
export async function saveCollectionLocally(etebase: Etebase.Account, colMgr: Etebase.CollectionManager, col: Etebase.Collection, isNew: boolean) {
  const pending = (store.getState() as unknown as StoreState).sync.pendingCollections.get(col.uid);
  await asyncDispatch(setCacheCollection(colMgr, col));
  store.dispatch(setPendingCollection(col.uid, (isNew || pending?.isNew) ? { isNew: true } : {}));
  requestSync(etebase, true);
}

// Remove a notebook locally and queue the deletion to be pushed to the server.
// Expects a collection that delete() was already called on.
export function deleteCollectionLocally(etebase: Etebase.Account, colMgr: Etebase.CollectionManager, col: Etebase.Collection) {
  const pending = (store.getState() as unknown as StoreState).sync.pendingCollections.get(col.uid);
  store.dispatch(unsetCacheCollection(colMgr, col.uid));
  if (pending?.isNew) {
    // It was never uploaded, so there is nothing to delete on the server
    store.dispatch(unsetPendingCollection(col.uid));
  } else {
    store.dispatch(setPendingCollection(col.uid, { deletedCache: Etebase.toBase64(colMgr.cacheSave(col)) }));
  }
  requestSync(etebase, true);
}

function persistorLoaded() {
  return new Promise((resolve, _reject) => {
    const subscription = {} as { unsubscribe: () => void };
    subscription.unsubscribe = persistor.subscribe(() => {
      const { bootstrapped } = persistor.getState();
      if (bootstrapped) {
        resolve(true);
        subscription.unsubscribe();
      }
    });
    if (persistor.getState().bootstrapped) {
      resolve(true);
      subscription.unsubscribe();
    }
  });
}

const BACKGROUND_SYNC_TASK_NAME = "SYNCMANAGER_SYNC";

TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
  const timeout = startTask(() => true, 27 * 1000); // Background fetch is limited to 30 seconds.

  try {
    await persistorLoaded();
    const beforeState = store.getState() as unknown as StoreState;
    const etebase = await credentialsSelector(beforeState);

    if (!etebase) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    const syncManager = SyncManager.getManager(etebase);
    const sync = syncManager.sync();
    Promise.race([timeout, sync]);
    store.dispatch(performSync(sync));

    const afterState = store.getState() as unknown as StoreState;
    const receivedNewData =
      (beforeState.allCache.collections !== afterState.allCache.collections) ||
      (beforeState.allCache.items !== afterState.allCache.items);

    return receivedNewData ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export function registerSyncTask(_username: string) {
  return BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
    minimumInterval: 4 * 60 * 60, // 4 hours
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export function unregisterSyncTask(_username: string) {
  return BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK_NAME);
}
