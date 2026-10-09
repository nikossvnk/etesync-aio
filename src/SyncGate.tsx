// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { useSelector } from "react-redux";

import { useCredentials } from "./credentials";

import LoadingIndicator from "./widgets/LoadingIndicator";

import { StoreState } from "./store";

// Only blocks until the first sync after login has finished. After that the locally
// stored data is always shown, and syncing happens in the background.
export function useSyncGate() {
  const etebase = useCredentials();
  const syncCount = useSelector((state: StoreState) => state.syncCount);
  const syncStatus = useSelector((state: StoreState) => state.syncStatus);
  const hasSynced = useSelector((state: StoreState) => !!state.sync.lastSync || (state.sync.general?.stoken !== undefined));

  if (!etebase || ((syncCount > 0) && !hasSynced)) {
    return (<LoadingIndicator status={syncStatus} />);
  }

  return null;
}

// The number of notes and notebooks with local changes that were not pushed to the server yet
export function usePendingCount() {
  return useSelector((state: StoreState) => state.sync.items.reduce((count, items) => count + items.size, state.sync.pendingCollections.size));
}
