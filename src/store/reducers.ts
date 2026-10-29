// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Action, ActionMeta, ActionFunctionAny, combineActions, handleAction, handleActions } from "redux-actions";

import { List, Map as ImmutableMap } from "immutable";

import * as Etebase from "etebase";

import * as actions from "./actions";
import { LogLevel } from "../logging";
import { FontFamilyKey } from "../helpers";

interface BaseModel {
  uid: string;
}

export interface SyncCollectionsEntryData extends BaseModel {
  stoken: string;
}

export type SyncCollectionsData = ImmutableMap<string, SyncCollectionsEntryData>;
export type SyncItemsData = ImmutableMap<string, ImmutableMap<string, true>>;
// Notebooks with local changes that were not pushed to the server yet.
// isNew: the notebook was created locally and doesn't exist on the server yet.
// deletedCache: the notebook was deleted locally, this is its (base64 encoded) cache to push the deletion with.
export type PendingCollection = { isNew?: boolean, deletedCache?: string };
export type PendingCollectionsData = ImmutableMap<string, PendingCollection>;

export type CachedItem = { cache: Uint8Array, meta: Etebase.ItemMetadata, isDeleted: boolean };
export type CachedItems = ImmutableMap<string, CachedItem>;
export type CachedItemsData = ImmutableMap<string, CachedItems>;
export type CachedCollection = { cache: Uint8Array, meta: Etebase.ItemMetadata, collectionType: string };
export type CachedCollectionsData = ImmutableMap<string, CachedCollection>;

export type SyncGeneralData = {
  stoken?: string | null;
  lastSyncDate?: Date;
  // The collection types the stoken is for (the notes only if unset, as etesync-notes synced only them)
  types?: string[];
};

export type Message = {
  message: string;
  severity: "error" | "warning" | "info" | "success";
};

export interface CredentialsData {
  storedSession?: string;
}

export const credentials = handleActions(
  {
    [actions.login.toString()]: (
      state: CredentialsData, action: Action<string>) => {
      if (action.error) {
        return state;
      } else if (action.payload === undefined) {
        return state;
      } else {
        return {
          storedSession: action.payload,
        };
      }
    },
    [actions.logout.toString()]: (_state: CredentialsData, _action: any) => {
      return { storedSession: undefined };
    },
  },
  { storedSession: undefined }
);

export const syncCollections = handleActions(
  {
    [actions.setSyncCollection.toString()]: (state: SyncCollectionsData, action: Action<SyncCollectionsEntryData>) => {
      if (action.payload !== undefined) {
        return state.set(action.payload.uid, action.payload);
      }
      return state;
    },
    [actions.unsetSyncCollection.toString()]: (state: SyncCollectionsData, action: Action<any>) => {
      if (action.payload !== undefined) {
        return state.remove(action.payload as string);
      }
      return state;
    },
    [actions.logout.toString()]: (state: SyncCollectionsData, _action: any) => {
      return state.clear();
    },
  },
  ImmutableMap({})
);

export const pendingCollections = handleActions(
  {
    [actions.setPendingCollection.toString()]: (state: PendingCollectionsData, action: Action<any>) => {
      if (action.payload !== undefined) {
        const { colUid, pending } = action.payload as { colUid: string, pending: PendingCollection };
        return state.set(colUid, pending);
      }
      return state;
    },
    [actions.unsetPendingCollection.toString()]: (state: PendingCollectionsData, action: Action<any>) => {
      if (action.payload !== undefined) {
        return state.remove(action.payload as string);
      }
      return state;
    },
    [actions.logout.toString()]: (state: PendingCollectionsData, _action: any) => {
      return state.clear();
    },
  },
  ImmutableMap({})
);

export const syncItems = handleActions(
  {
    [actions.itemBatch.toString()]: (state: SyncItemsData, action_: Action<unknown>) => {
      const action = action_ as ActionMeta<CachedItem[], { colUid: string, items: Etebase.Item[] }>;
      if (action.payload !== undefined) {
        return state.withMutations((state) => {
          for (const item of action.meta.items) {
            state.removeIn([action.meta.colUid, item.uid]);
          }
        });
      }
      return state;
    },
    [actions.setSyncItem.toString()]: (state: SyncItemsData, action: Action<{ colUid: string, itemUid: string }>) => {
      if (action.payload !== undefined) {
        return state.setIn([action.payload.colUid, action.payload.itemUid], true);
      }
      return state;
    },
    [actions.setSyncItemMulti.toString()]: (state: SyncItemsData, action_: any) => {
      // (typed here, like the batches of the cache below)
      const action = action_ as Action<{ colUid: string, itemUids: string[] }>;
      if (action.payload !== undefined) {
        const { colUid, itemUids } = action.payload;
        return state.withMutations((state) => {
          for (const itemUid of itemUids) {
            state.setIn([colUid, itemUid], true);
          }
        });
      }
      return state;
    },
    [actions.unsetSyncItem.toString()]: (state: SyncItemsData, action: Action<{ colUid: string, itemUid: string }>) => {
      if (action.payload !== undefined) {
        return state.removeIn([action.payload.colUid, action.payload.itemUid]);
      }
      return state;
    },
    [actions.logout.toString()]: (state: SyncItemsData, _action: any) => {
      return state.clear();
    },
  },
  ImmutableMap({})
);

export const syncGeneral = handleActions(
  {
    [actions.setSyncGeneral.toString()]: (state: SyncGeneralData, action: ActionMeta<string | null | undefined, { types: string[] }>) => {
      if (action.payload !== undefined) {
        return {
          stoken: action.payload,
          lastSyncDate: new Date(),
          types: action.meta?.types,
        };
      }
      return state;
    },
    [actions.logout.toString()]: (_state: SyncGeneralData, _action: any) => {
      return {};
    },
  },
  {} as SyncGeneralData
);

export const collections = handleActions(
  {
    [combineActions(
      actions.setCacheCollection,
      actions.collectionUpload,
      actions.unsetCacheCollection
    ).toString()]: (state: CachedCollectionsData, action: ActionMeta<CachedCollection, { colUid: string, deleted: boolean }>) => {
      if (action.payload !== undefined) {
        if (action.meta.deleted) {
          return state.remove(action.meta.colUid);
        } else {
          return state.set(action.meta.colUid, action.payload);
        }
      }
      return state;
    },
    [actions.logout.toString()]: (state: CachedCollectionsData, _action: any) => {
      return state.clear();
    },
  },
  ImmutableMap({})
);

export const items = handleActions(
  {
    [combineActions(
      actions.setCacheItem
    ).toString()]: (state: CachedItemsData, action: ActionMeta<CachedItem, { colUid: string, itemUid: string }>) => {
      if (action.payload !== undefined) {
        return state.setIn([action.meta.colUid, action.meta.itemUid], action.payload);
      }
      return state;
    },
    [actions.unsetCacheItem.toString()]: (state: CachedItemsData, action: Action<any>) => {
      if (action.payload !== undefined) {
        const { colUid, itemUid } = action.payload as { colUid: string, itemUid: string };
        return state.removeIn([colUid, itemUid]);
      }
      return state;
    },
    [combineActions(
      actions.itemBatch,
      actions.setCacheItemMulti
    ).toString()]: (state: CachedItemsData, action_: any) => {
      // Fails without it for some reason
      const action = action_ as ActionMeta<CachedItem[], { colUid: string, items: Etebase.Item[] }>;
      if (action.payload !== undefined) {
        return state.withMutations((state) => {
          let i = 0;
          for (const item of action.meta.items) {
            state.setIn([action.meta.colUid, item.uid], action.payload[i]);
            i++;
          }
        });
      }
      return state;
    },
    [combineActions(
      actions.setCacheCollection,
      actions.collectionUpload
    ).toString()]: (state: CachedItemsData, action_: any) => {
      const action = action_ as ActionMeta<CachedCollection[], { colUid: string, deleted: boolean }>;
      if (action.payload !== undefined && !action.meta.deleted) {
        if (!state.has(action.meta.colUid)) {
          return state.set(action.meta.colUid, ImmutableMap());
        }
      }
      return state;
    },
    [combineActions(
      actions.unsetCacheCollection,
      actions.collectionUpload
    ).toString()]: (state: CachedItemsData, action_: any) => {
      const action = action_ as ActionMeta<CachedCollection[], { colUid: string, deleted: boolean }>;
      if (action.payload !== undefined && action.meta.deleted) {
        return state.remove(action.meta.colUid);
      }
      return state;
    },
    [actions.logout.toString()]: (state: CachedItemsData, _action: any) => {
      return state.clear();
    },
  },
  ImmutableMap({})
);

const fetchActions = [
] as Array<ActionFunctionAny<Action<any>>>;

for (const func in actions) {
  if (func.startsWith("fetch") ||
    func.startsWith("add") ||
    func.startsWith("update") ||
    func.startsWith("delete")) {

    fetchActions.push((actions as any)[func.toString()]);
  }
}

// Indicates network activity, not just fetch
export const fetchCount = handleAction(
  combineActions(
    ...fetchActions
  ),
  (state: number, action: any) => {
    if (action.payload === undefined) {
      return state + 1;
    } else {
      return state - 1;
    }
  },
  0
);

export const errorsReducer = handleActions(
  {
    [actions.performSync.toString()]: (state: List<Error>, action: Action<any>) => {
      if (action.error) {
        return state.push(action.payload);
      }

      return state;
    },
    [actions.addError.toString()]: (state: List<Error>, action: Action<Error>) => {
      return state.push(action.payload);
    },
    [actions.popError.toString()]: (state: List<Error>, _action: Action<any>) => {
      return state.pop();
    },
    [actions.clearErrors.toString()]: (state: List<Error>, _action: Action<any>) => {
      return state.clear();
    },
    [actions.logout.toString()]: (state: List<Error>, _action: any) => {
      return state.clear();
    },
  },
  List<Error>([])
);

export interface ConnectionInfo {
  type: string;
  isConnected: boolean;
}

export const connectionReducer = handleActions(
  {
    [actions.setConnectionInfo.toString()]: (_state: ConnectionInfo | null, action: Action<ConnectionInfo>) => {
      return action.payload;
    },
  },
  null
);

export const syncStatusReducer = handleActions(
  {
    [actions.setSyncStatus.toString()]: (_state: string | null, action: Action<string | null>) => {
      return action.payload;
    },
    [actions.performSync.toString()]: (_state: string | null, action: Action<any>) => {
      if (action.payload === undefined) {
        return "Started sync";
      }
      return null;
    },
  },
  null
);

export const lastSyncReducer = handleActions(
  {
    [actions.performSync.toString()]: (state: Date | null, action: Action<boolean | undefined>) => {
      if (action.payload) {
        return new Date();
      }
      return state;
    },
    [actions.logout.toString()]: (_state: Date | null, _action: any) => {
      return null;
    },
  },
  null
);

export const syncCount = handleAction(
  actions.performSync,
  (state: number, action: any) => {
    if (action.payload === undefined) {
      return state + 1;
    } else {
      return state - 1;
    }
  },
  0
);

export const messagesReducer = handleActions(
  {
    [actions.pushMessage.toString()]: (state: List<Message>, action: Action<Message>) => {
      return state.push(action.payload);
    },
    [actions.popMessage.toString()]: (state: List<Message>, _action: Action<unknown>) => {
      return state.remove(0);
    },
  },
  List([])
);

// FIXME Move all the below (potentially the fetchCount ones too) to their own file
export type ViewModeKey = "last" | "viewer" | "editor";

export interface TaskSettingsType {
  // The task list that is shown (null for all of them)
  filterBy: string | null;
  // "smart": not done ones first, the ones due soonest at the top. "title": by their titles.
  sortBy: "smart" | "title";
  showCompleted: boolean;
}

// How a task list is grouped and which priorities it shows (none: all of them)
export interface TaskViewType {
  groupBy: "date" | "priority";
  priorities: ("high" | "medium" | "low" | "none")[];
}

export interface SettingsType {
  // How dates and times are shown in the calendar and the tasks (and which day weeks start on):
  // "en-gb" or "en-us", like in the web app
  locale: string;
  taskSettings: TaskSettingsType;
  // The view of each task list, by its uid ("all" for all of them)
  taskViews: { [list: string]: TaskViewType };
  calendarView: "month" | "week" | "day" | "agenda";
  // The calendars that are hidden (by their uid, "birthdays" for the birthdays of the contacts)
  hiddenCalendars: string[];
  // Whether the agenda shows the events that repeat
  showRepeating: boolean;
  // The contacts that are shown: all of them (null), an address book's ("book:<colUid>"), or a group's ("group:<uid>")
  contactsFilter: string | null;
  // The bookmarks that are shown: all of them (null) or a bookmark list's (its uid), and their order
  bookmarksFilter: string | null;
  bookmarksSort: "newest" | "oldest" | "title" | "site";
  logLevel: LogLevel;
  ranWizrd: boolean;
  theme: "auto" | "dark" | "light";
  fontSize: number;
  // Whether the pinned notes are folded away (above the notes)
  pinnedCollapsed?: boolean;
  // Whether the sidebar with the notebooks and notes is shown on wide screens
  sidebarVisible: boolean;
  // Its width in pixels, which can be changed by dragging its edge
  sidebarWidth: number;
  viewSettings: {
    defaultViewMode: ViewModeKey;
    lastViewMode: boolean;
    filterBy: string | null;
    sortBy: "name" | "mtime";
    editorFontFamily: FontFamilyKey;
    viewerFontFamily: FontFamilyKey;
  };
}

export const settingsReducer = handleActions(
  {
    [actions.setSettings.toString()]: (state: SettingsType, action: any) => (
      { ...state, ...action.payload }
    ),
  },
  {
    locale: "en-gb",
    taskSettings: {
      filterBy: null,
      sortBy: "smart",
      showCompleted: false,
    },
    taskViews: {},
    calendarView: "month",
    hiddenCalendars: [],
    showRepeating: false,
    contactsFilter: null,
    bookmarksFilter: null,
    bookmarksSort: "newest",
    logLevel: LogLevel.Off,
    ranWizrd: false,
    theme: "auto",
    fontSize: 16,
    sidebarVisible: true,
    sidebarWidth: 280,
    viewSettings: {
      defaultViewMode: "viewer",
      lastViewMode: false,
      filterBy: null,
      sortBy: "name",
      editorFontFamily: "monospace",
      viewerFontFamily: "regular",
    },
  }
);
