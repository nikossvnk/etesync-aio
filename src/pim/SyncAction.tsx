// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { useSelector } from "react-redux";

import { StoreState } from "../store";
import { usePendingCount } from "../SyncGate";
import AppbarAction from "../widgets/AppbarAction";
import { useAutoSync } from "../components/NotesColumn";

// The sync button of the calendar, the tasks and the contacts, which also sync when they're opened
// and every few minutes, like the notes column does
export default function SyncAction(props: { screen: string }) {
  const sync = useAutoSync(props.screen);
  const pendingCount = usePendingCount();
  const isSyncing = useSelector((state: StoreState) => state.syncCount) > 0;
  return (
    <AppbarAction
      icon={(pendingCount > 0) ? "cloud-upload-outline" : "sync"}
      accessibilityLabel={(pendingCount > 0) ? `Sync (${pendingCount} not uploaded yet)` : "Sync"}
      disabled={isSyncing}
      onPress={sync}
    />
  );
}
