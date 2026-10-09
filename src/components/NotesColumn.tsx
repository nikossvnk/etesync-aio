// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useDateFormats } from "../pim/format";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import { Paragraph, Text, TouchableRipple } from "react-native-paper";
import { useDispatch, useSelector } from "react-redux";
import * as Etebase from "etebase";

import { StoreState } from "../store";
import { performSync, setSettings } from "../store/actions";
import { SyncManager } from "../sync/SyncManager";
import { useCredentials } from "../credentials";
import { usePendingCount, useSyncGate } from "../SyncGate";
import { defaultColor } from "../helpers";
import { deleteNotes, untitled } from "../notes";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import { useNoteSearch } from "../search";
import { fonts, useTheme } from "../theme";
import Link from "../widgets/Link";
import AppbarButton from "../widgets/AppbarButton";
import { Result } from "../screens/SearchScreen";
import { Entry, getSortFunction, shortDate, useNotePreview } from "./NoteList";
import { useSearchQuery, useWideNavigation } from "./WideLayout";

interface RowPropsType {
  item: Entry;
  itemMgr: Etebase.ItemManager | undefined;
  notebookName: string;
  color: string;
  selected: boolean;
  // Returns true when the press was handled there (e.g. selecting with ctrl), and the note isn't opened
  onOpen: (e?: any) => boolean;
  // What the note matched when searching, to show instead of its beginning
  snippet?: React.ReactNode;
}

const NoteRow = React.memo(function NoteRow(props: RowPropsType) {
  const fmt = useDateFormats();
  const { item, itemMgr, notebookName, color, selected, onOpen, snippet } = props;
  const theme = useTheme();
  const preview = useNotePreview(itemMgr, item.cache);
  const mtime = item.meta.mtime;

  return (
    <Link
      to={`/notebook/${item.colUid}/note/${item.uid}`}
      // The note is opened next to the columns, replacing the one that is open
      action={{ type: "NOOP" } as any}
      onPress={onOpen}
      renderChild={(linkProps) => (
        <TouchableRipple
          {...linkProps}
          accessibilityLabel={item.meta.name || untitled}
          accessibilityState={{ selected }}
          aria-selected={selected}
          style={[styles.row, (selected)
            ? { backgroundColor: theme.colors.accentTint, borderColor: theme.colors.accentRing }
            : { borderColor: "transparent", borderBottomColor: theme.colors.divider }]}
        >
          <View>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{item.meta.name || untitled}</Text>
            {(snippet || preview) ? (
              <Text style={[styles.preview, { color: theme.colors.textSecondary }]} numberOfLines={2}>{snippet ?? preview}</Text>
            ) : null}
            <View style={styles.meta}>
              <View style={[styles.color, { backgroundColor: color }]} />
              <Text style={[styles.small, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {notebookName}{(mtime) ? ` · ${shortDate(mtime, fmt)}` : ""}
              </Text>
            </View>
          </View>
        </TouchableRipple>
      )}
    />
  );
});

// Syncs when the column is shown, and every few minutes on the web. Not while the screen after
// logging in is open, which syncs for itself first (and would think there are no notebooks yet).
export function useAutoSync(currentScreen: string | undefined) {
  const etebase = useCredentials();
  const dispatch = useDispatch();
  const paused = !currentScreen || ["AccountWizard", "Login", "Signup"].includes(currentScreen);

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

// The second column on wide screens: the notes of the chosen notebook (or all of them), or what
// was searched for
export default function NotesColumn() {
  const theme = useTheme();
  const dispatch = useDispatch();
  const etebase = useCredentials();
  const syncGate = useSyncGate();
  const { currentNote, currentScreen, filterBy, navigate, openNote } = useWideNavigation();
  const { query } = useSearchQuery();
  const searching = query.trim() !== "";
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const isSyncing = useSelector((state: StoreState) => state.syncCount) > 0;
  const pendingCount = usePendingCount();
  const results = useNoteSearch(query, searching && !syncGate);
  const sync = useAutoSync(currentScreen);
  // The notes selected with ctrl (or cmd) and a click, to delete them
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set());
  const [deleteShown, setDeleteShown] = React.useState(false);
  const selecting = selection.size > 0;

  // Ctrl-click adds a note to the selection (or takes it away), starting with the one that is
  // open. A click without it opens the note, and selects none.
  function press(note: string, e?: any) {
    const event = e?.nativeEvent ?? e;
    if (event?.ctrlKey || event?.metaKey) {
      setSelection((current) => {
        const ret = new Set(current);
        if ((ret.size === 0) && currentNote && (currentNote !== note)) {
          ret.add(currentNote);
        }
        if (!ret.delete(note)) {
          ret.add(note);
        }
        return ret;
      });
      return true;
    }
    setSelection(new Set());
    const [colUid, itemUid] = note.split("/");
    openNote(colUid, itemUid);
    return false;
  }

  // Escape selects none
  React.useEffect(() => {
    if (!selecting || (Platform.OS !== "web")) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  async function deleteSelected() {
    const notes = new Set(selection);
    await deleteNotes(etebase!, notes);
    setDeleteShown(false);
    setSelection(new Set());
    if (currentNote && notes.has(currentNote)) {
      navigate("Home");
    }
  }

  // The item managers the rows load their previews with, created as needed
  const itemMgrs = React.useMemo(() => new Map<string, Etebase.ItemManager>(), [etebase, cacheCollections]);
  function getItemMgr(colUid: string) {
    const cached = cacheCollections.get(colUid);
    if (!itemMgrs.has(colUid) && etebase && cached) {
      const colMgr = etebase.getCollectionManager();
      itemMgrs.set(colUid, colMgr.getItemManager(colMgr.cacheLoad(cached.cache)));
    }
    return itemMgrs.get(colUid);
  }

  const entries: (Entry & { snippet?: React.ReactNode })[] = React.useMemo(() => {
    if (searching) {
      const ret = [];
      for (const result of results) {
        const [colUid, uid] = result.id.split(":");
        const item = cacheItems.get(colUid)?.get(uid);
        if (item && !item.isDeleted) {
          const contentMatches = result.terms.filter((term) => result.match[term].includes("content"));
          ret.push({
            ...item, colUid, uid,
            snippet: (contentMatches.length > 0) ? <Result text={result.content} search={query} matches={contentMatches} /> : undefined,
          });
        }
      }
      return ret;
    }
    const ret: Entry[] = [];
    for (const [colUid, items] of cacheItems.entries()) {
      if (filterBy && (colUid !== filterBy)) {
        continue;
      }
      for (const [uid, item] of items.entries()) {
        if (!item.isDeleted) {
          ret.push({ ...item, uid, colUid });
        }
      }
    }
    return ret.sort(getSortFunction(viewSettings.sortBy));
  }, [searching, results, cacheItems, filterBy, viewSettings.sortBy]);

  const byName = (viewSettings.sortBy === "name");
  const title = (selecting) ? `${selection.size} selected` : (searching) ? "Search" : (filterBy) ? (cacheCollections.get(filterBy)?.meta.name ?? "") : "All notes";
  const subtitle = (selecting) ? "Ctrl-click to select more, Esc to select none" : (searching)
    ? `${entries.length} ${(entries.length === 1) ? "note matches" : "notes match"} “${query.trim()}”`
    : `${entries.length} ${(entries.length === 1) ? "note" : "notes"}`;

  return (
    <View testID="notes-column" style={[styles.column, { backgroundColor: theme.colors.background, borderRightColor: theme.colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
          <Text style={[styles.small, { color: theme.colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        {selecting && (
          <>
            <AppbarButton icon="delete" title="Delete selected" onPress={() => setDeleteShown(true)} />
            <AppbarButton icon="close" title="Clear selection" onPress={() => setSelection(new Set())} />
          </>
        )}
        {!selecting && <AppbarButton
          icon="plus"
          title="New note"
          onPress={() => navigate("NoteCreate", (filterBy) ? { colUid: filterBy } : undefined)}
        />}
        {!selecting && <AppbarButton
          icon={(pendingCount > 0) ? "cloud-upload-outline" : "sync"}
          title={(pendingCount > 0) ? `Sync (${pendingCount} not uploaded yet)` : "Sync"}
          disabled={isSyncing}
          onPress={sync}
        />}
        {(!searching && !selecting) && (
          <AppbarButton
            icon={(byName) ? "sort-alphabetical-ascending" : "sort-clock-descending-outline"}
            title={(byName) ? "Sorted by name, sort by modification time" : "Sorted by modification time, sort by name"}
            disabled={isSyncing}
            onPress={() => dispatch(setSettings({ viewSettings: { ...viewSettings, sortBy: (byName) ? "mtime" : "name" } }) as any)}
          />
        )}
        {(filterBy && !searching && !selecting) && (
          <AppbarButton
            icon="notebook-edit-outline"
            title="Manage Notebook"
            disabled={isSyncing}
            onPress={() => navigate("CollectionChangelog", { colUid: filterBy })}
          />
        )}
      </View>
      <ConfirmationDialog
        title="Delete Notes"
        visible={deleteShown}
        onOk={deleteSelected}
        onCancel={() => setDeleteShown(false)}
      >
        <Paragraph>{`Are you sure you would like to delete ${(selection.size === 1) ? "this note" : `these ${selection.size} notes`}?`}</Paragraph>
      </ConfirmationDialog>
      {(syncGate) ? syncGate : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          data={entries}
          keyExtractor={(item) => `${item.colUid}/${item.uid}`}
          extraData={selection}
          maxToRenderPerBatch={10}
          renderItem={({ item }) => {
            const collection = cacheCollections.get(item.colUid);
            return (
              <NoteRow
                item={item}
                itemMgr={getItemMgr(item.colUid)}
                notebookName={collection?.meta.name ?? ""}
                color={collection?.meta.color || defaultColor}
                selected={(selecting) ? selection.has(`${item.colUid}/${item.uid}`) : (currentNote === `${item.colUid}/${item.uid}`)}
                onOpen={(e) => press(`${item.colUid}/${item.uid}`, e)}
                snippet={item.snippet}
              />
            );
          }}
          ListEmptyComponent={() => (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              {(searching) ? `No notes match “${query.trim()}”` : (filterBy) ? "Notebook is empty" : "No notes yet"}
            </Text>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: 340,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 6,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  list: {
    paddingHorizontal: 10,
    paddingBottom: 16,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  preview: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  color: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 8,
  },
  small: {
    fontSize: 12,
    flexShrink: 1,
  },
  empty: {
    padding: 12,
    fontSize: 14,
  },
});
