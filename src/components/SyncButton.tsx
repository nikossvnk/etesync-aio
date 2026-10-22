// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Syncing from the bars of the screens: the sync button, and syncing when a screen is shown and every
// few minutes

import * as React from "react";
import { Platform } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { StoreState } from "../store";
import { performSync } from "../store/actions";
import { SyncManager } from "../sync/SyncManager";
import { useCredentials } from "../credentials";
import { usePendingCount } from "../SyncGate";
import AppbarButton from "../widgets/AppbarButton";

// Syncs when it starts (or stops being paused), and then every few minutes on the web. It returns the
// function that syncs, for a sync button.
export function useAutoSync(paused = false) {
  const etebase = useCredentials();
  const dispatch = useDispatch();

  const sync = React.useCallback(() => {
    if (etebase) {
      dispatch(performSync(SyncManager.getManager(etebase).sync()) as any); // not awaiting on purpose
    }
  }, [etebase]);

  React.useEffect(() => {
    if (paused) {
      return undefined;
    }
    sync();
    if (Platform.OS !== "web") {
      return undefined;
    }
    const id = setInterval(() => {
      if (navigator.onLine) {
        sync();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [sync, paused]);

  return sync;
}

// Whether the automatic sync waits on a screen: the ones before and right after logging in (which
// syncs for itself first, and would think there are no notebooks yet)
export function syncPausedOn(screen: string | undefined) {
  return !screen || ["AccountWizard", "Login", "Signup"].includes(screen);
}

// The sync button, which says when there are changes that weren't uploaded yet
export default function SyncButton(props: { onPress: () => void }) {
  const pendingCount = usePendingCount();
  const isSyncing = useSelector((state: StoreState) => state.syncCount) > 0;
  return (
    <AppbarButton
      icon={(pendingCount > 0) ? "cloud-upload-outline" : "sync"}
      title={(pendingCount > 0) ? `Sync (${pendingCount} not uploaded yet)` : "Sync"}
      disabled={isSyncing}
      onPress={props.onPress}
    />
  );
}

// The sync button of a screen that also syncs when it's shown, and every few minutes
export function AutoSyncButton() {
  const sync = useAutoSync();
  return <SyncButton onPress={sync} />;
}
