// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useDateFormats } from "../pim/format";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import { Menu, Paragraph, Text, TouchableRipple } from "react-native-paper";
import { useDispatch, useSelector } from "react-redux";
import * as Etebase from "etebase";

import { StoreState } from "../store";
import { pushMessage, setSettings } from "../store/actions";
import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { deleteNotes, isPinned, moveNotes, untitled } from "../notes";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import { useNoteSearch } from "../search";
import { fonts, useTheme } from "../theme";
import Link from "../widgets/Link";
import AppbarButton from "../widgets/AppbarButton";
import SyncButton, { syncPausedOn, useAutoSync } from "./SyncButton";
import { Result } from "../screens/SearchScreen";
import { Entry, getSortFunction, PinnedNotes, SelectionButtons, shortDate, splitPinned, useItemManagers, useNotePreview } from "./NoteList";
import { useSearchQuery, useWideNavigation } from "./WideLayout";
import { defaultColor } from "../constants";

interface RowPropsType {
  item: Entry;
  itemMgr: Etebase.ItemManager | undefined;
  notebookName: string;
  color: string;
  selected: boolean;
  // Returns true when the press was handled there (e.g. selecting with ctrl), and the note isn't opened
  onOpen: (e?: any) => boolean;
  // A right click on the note
  onContextMenu: (e: any) => void;
  // What the note matched when searching, to show instead of its beginning
  snippet?: React.ReactNode;
}

const NoteRow = React.memo(function NoteRow(props: RowPropsType) {
  const fmt = useDateFormats();
  const { item, itemMgr, notebookName, color, selected, onOpen, onContextMenu, snippet } = props;
  const theme = useTheme();
  const preview = useNotePreview(itemMgr, item.cache);
  const mtime = item.meta.mtime;

  return (
    <View {...{ onContextMenu } as any}>
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
    </View>
  );
});

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
  const results = useNoteSearch(query, searching && !syncGate);
  // (it syncs when the column is shown)
  const sync = useAutoSync(syncPausedOn(currentScreen));
  // The notes selected with ctrl (or cmd) and a click, to pin or delete them
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set());
  // The notes the dialog asks about deleting
  const [deleting, setDeleting] = React.useState<Set<string>>();
  // The right-click menu: the notes it's for, where it is, and whether it lists the notebooks to move them to
  const [menu, setMenu] = React.useState<{ notes: Set<string>, x: number, y: number, moving?: boolean }>();
  const selecting = selection.size > 0;
  // Whether all of the selected notes are pinned, so that the button unpins them
  const allPinned = selecting && [...selection].every((note) => {
    const [colUid, itemUid] = note.split("/");
    const item = cacheItems.get(colUid)?.get(itemUid);
    return !!item && isPinned(item);
  });

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

  async function deleteChosen() {
    const notes = deleting!;
    await deleteNotes(etebase!, notes);
    setDeleting(undefined);
    setSelection((prev) => new Set([...prev].filter((x) => !notes.has(x))));
    if (currentNote && notes.has(currentNote)) {
      navigate("Home");
    }
  }

  // A right click on a note opens the menu, for the selected notes when it's one of them
  function contextMenu(note: string, e: any) {
    e.preventDefault();
    setMenu({ notes: (selection.has(note)) ? new Set(selection) : new Set([note]), x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  }

  async function moveChosen(notes: Set<string>, toUid: string) {
    setMenu(undefined);
    const moved = await moveNotes(etebase!, notes, toUid);
    setSelection((prev) => new Set([...prev].filter((x) => !notes.has(x))));
    const newCurrent = (currentNote) ? moved.get(currentNote) : undefined;
    if (newCurrent) {
      const [colUid, itemUid] = newCurrent.split("/");
      openNote(colUid, itemUid);
    }
    const name = cacheCollections.get(toUid)?.meta.name ?? "";
    dispatch(pushMessage({ message: `Moved ${(moved.size === 1) ? "the note" : `${moved.size} notes`} to ${name}`, severity: "success" }) as any);
  }

  // The notebooks to move the notes of the menu to: all but the one they're all in
  const menuFrom = new Set([...(menu?.notes ?? [])].map((x) => x.split("/")[0]));
  const moveTargets = Array.from(cacheCollections.entries())
    .filter(([uid]) => !((menuFrom.size === 1) && menuFrom.has(uid)))
    .map(([uid, col]) => ({ uid, name: col.meta.name ?? "", color: col.meta.color || defaultColor }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const getItemMgr = useItemManagers();

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

  // (the results of a search aren't split)
  const [pinned, others] = React.useMemo(() => (searching) ? [[], entries] : splitPinned(entries), [searching, entries]);

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
            <SelectionButtons selection={selection} allPinned={allPinned} onPinned={() => setSelection(new Set())} onDelete={() => setDeleting(new Set(selection))} />
            <AppbarButton icon="close" title="Clear selection" onPress={() => setSelection(new Set())} />
          </>
        )}
        {!selecting && <AppbarButton
          icon="plus"
          title="New note"
          onPress={() => navigate("NoteCreate", (filterBy) ? { colUid: filterBy } : undefined)}
        />}
        {!selecting && <SyncButton onPress={sync} />}
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
        visible={!!deleting}
        onOk={deleteChosen}
        onCancel={() => setDeleting(undefined)}
      >
        <Paragraph>{`Are you sure you would like to delete ${(deleting?.size === 1) ? "this note" : `these ${deleting?.size} notes`}?`}</Paragraph>
      </ConfirmationDialog>
      {menu && (
        <Menu visible onDismiss={() => setMenu(undefined)} anchor={{ x: menu.x, y: menu.y }}>
          {(menu.moving) ? moveTargets.map((x) => (
            <Menu.Item
              key={x.uid}
              title={x.name}
              accessibilityLabel={`Move to ${x.name}`}
              leadingIcon={() => <View style={[styles.menuColor, { backgroundColor: x.color }]} />}
              onPress={() => moveChosen(menu.notes, x.uid)}
            />
          )) : (
            <>
              <Menu.Item
                title="Move to…"
                leadingIcon="folder-move-outline"
                disabled={moveTargets.length === 0}
                onPress={() => setMenu({ ...menu, moving: true })}
              />
              <Menu.Item
                title={(menu.notes.size === 1) ? "Delete" : `Delete ${menu.notes.size} notes`}
                leadingIcon="delete-outline"
                onPress={() => {
                  setDeleting(menu.notes);
                  setMenu(undefined);
                }}
              />
            </>
          )}
        </Menu>
      )}
      {(syncGate) ? syncGate : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          data={others}
          keyExtractor={(item) => `${item.colUid}/${item.uid}`}
          ListHeaderComponent={(
            <PinnedNotes
              notes={pinned}
              others={others.length}
              getItemMgr={getItemMgr}
              showNotebook
              isCurrent={(note) => !selecting && (currentNote === note)}
              isSelected={(note) => selection.has(note)}
              // (the note is opened next to the columns, like from the rows)
              linkAction={{ type: "NOOP" }}
              onPress={press}
              onContextMenu={contextMenu}
            />
          )}
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
                onContextMenu={(e) => contextMenu(`${item.colUid}/${item.uid}`, e)}
                snippet={item.snippet}
              />
            );
          }}
          ListEmptyComponent={() => (pinned.length > 0) ? null : (
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
  menuColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
    margin: 6,
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
