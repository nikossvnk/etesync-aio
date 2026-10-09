// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { BackHandler, StyleSheet, View, Platform } from "react-native";
import { FAB, Paragraph, Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSelector, useDispatch } from "react-redux";

import { useSyncGate, usePendingCount } from "../SyncGate";
import { StoreState } from "../store";
import { SyncManager } from "../sync/SyncManager";
import { performSync, setSettings } from "../store/actions";
import { useCredentials } from "../credentials";

import NoteList from "../components/NoteList";
import NotebookFilter from "../components/NotebookFilter";
import { useSidebarShown } from "../components/Sidebar";
import Appbar from "../widgets/Appbar";
import AppbarButton from "../widgets/AppbarButton";
import { DefaultNavigationProp } from "../RootStackParamList";
import { fonts, useTheme } from "../theme";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import { deleteNotes } from "../notes";

interface PropsType {
  active: boolean;
  // Opens the search
  onSearch: () => void;
}

export default function NoteListScreen(props: PropsType) {
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const { sortBy } = viewSettings;
  // Show all of the notes if the notebook that was filtered by is gone
  const filterBy = useSelector((state: StoreState) => (
    (viewSettings.filterBy && state.cache.collections.has(viewSettings.filterBy)) ? viewSettings.filterBy : undefined
  ));
  const dispatch = useDispatch();
  const navigation = useNavigation<DefaultNavigationProp>();
  const syncGate = useSyncGate();
  const theme = useTheme();
  // The sidebar has the notebooks to choose from already
  const sidebarShown = useSidebarShown();
  const notebookName = useSelector((state: StoreState) => (filterBy) ? state.cache.collections.get(filterBy)?.meta.name : undefined);
  const count = useSelector((state: StoreState) => {
    let ret = 0;
    for (const [colUid, items] of state.cache.items.entries()) {
      if (!filterBy || (colUid === filterBy)) {
        ret += items.count((x) => !x.isDeleted);
      }
    }
    return ret;
  });

  const { active, onSearch } = props;
  const etebase = useCredentials();
  // The notes that are selected (by a long press), to delete them
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set());
  const [deleteShown, setDeleteShown] = React.useState(false);
  const selecting = selection.size > 0;

  const select = React.useCallback((note: string) => {
    setSelection((current) => {
      const ret = new Set(current);
      if (!ret.delete(note)) {
        ret.add(note);
      }
      return ret;
    });
  }, []);

  // While notes are selected, a press selects (or deselects) a note instead of opening it. It's
  // decided when it's pressed, with the selection as it is then.
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;
  // (the release of a long press is a press too, on the web, which isn't one more selection)
  const longPressRef = React.useRef({ note: "", time: 0 });
  const longPress = React.useCallback((note: string) => {
    longPressRef.current = { note, time: Date.now() };
    select(note);
  }, [select]);
  const pressNote = React.useCallback((note: string) => {
    if ((longPressRef.current.note === note) && (Date.now() - longPressRef.current.time < 1500)) {
      longPressRef.current = { note: "", time: 0 };
      return true;
    }
    if (selectionRef.current.size === 0) {
      return false;
    }
    select(note);
    return true;
  }, [select]);

  // The back button deselects them
  React.useEffect(() => {
    if (!selecting) {
      return undefined;
    }
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelection(new Set());
      return true;
    });
    return () => handler.remove();
  }, [selecting]);

  React.useEffect(() => {
    if (!active) {
      return;
    }

    if (selecting) {
      navigation.setOptions({
        header: (props) => <Appbar {...props} menuFallback />,
        title: "Notes",
        headerTitle: () => (
          <Text style={[styles.selectedTitle, { color: theme.colors.text }]}>{selection.size} selected</Text>
        ),
        headerShadowVisible: true,
        headerLeft: () => (
          <AppbarButton icon="close" title="Clear selection" onPress={() => setSelection(new Set())} />
        ),
        headerRight: () => (
          <AppbarButton icon="delete" title="Delete selected" onPress={() => setDeleteShown(true)} />
        ),
      });
      return;
    }

    navigation.setOptions({
      headerLeft: undefined,
      header: (props) => <Appbar {...props} menuFallback />,
      title: "Notes",
      // The title is shown in big under the bar, or above the list next to the sidebar
      headerTitle: () => <View style={{ flex: 1 }} />,
      // On phones the bar and the title under it are one
      headerShadowVisible: sidebarShown,
      headerRight: () => (
        <RightAction />
      ),
    });
  }, [active, navigation, sidebarShown, selecting, selection.size, theme]);

  if (syncGate) {
    return syncGate;
  }

  const title = notebookName ?? ((sidebarShown) ? "All notes" : "Notes");
  const countText = `${count} ${(count === 1) ? "note" : "notes"}`;

  return (
    <>
      {!sidebarShown && (
        <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.bigTitle, { color: theme.colors.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
          <TouchableRipple
            borderless
            onPress={onSearch}
            accessibilityRole="search"
            accessibilityLabel="Search notes"
            style={[styles.search, { backgroundColor: theme.colors.field }]}
          >
            <View style={styles.searchInner}>
              <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textMuted} />
              <Text style={[styles.searchText, { color: theme.colors.textMuted }]} numberOfLines={1}>Search {countText}</Text>
            </View>
          </TouchableRipple>
        </View>
      )}
      {!sidebarShown && <NotebookFilter
        value={filterBy}
        onChange={(colUid) => {
          dispatch(setSettings({
            viewSettings: {
              ...viewSettings,
              filterBy: colUid ?? null,
            },
          }) as any);
        }}
      />}
      <NoteList
        colUid={filterBy}
        sortBy={sortBy}
        header={(sidebarShown) ? (
          <View style={styles.listHeader}>
            <Text style={[styles.title, { color: theme.colors.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>{countText}</Text>
          </View>
        ) : (
          <View style={styles.listGap} />
        )}
        empty={<EmptyNotes onCreate={() => navigation.navigate("NoteCreate")} />}
        selection={selection}
        onSelect={longPress}
        onPressNote={pressNote}
      />

      <ConfirmationDialog
        title="Delete Notes"
        visible={deleteShown}
        onOk={async () => {
          await deleteNotes(etebase!, selection);
          setDeleteShown(false);
          setSelection(new Set());
        }}
        onCancel={() => setDeleteShown(false)}
      >
        <Paragraph>{`Are you sure you would like to delete ${(selection.size === 1) ? "this note" : `these ${selection.size} notes`}?`}</Paragraph>
      </ConfirmationDialog>

      {!selecting && <FAB
        icon="plus"
        accessibilityLabel="New"
        color={theme.colors.onAccent}
        style={[styles.fab, { backgroundColor: theme.colors.accent }]}
        onPress={() => navigation.navigate("NoteCreate", (filterBy) ? { colUid: filterBy } : undefined)}
      />}
    </>
  );
}

// When there are no notes at all yet
export function EmptyNotes(props: { onCreate: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt} aria-hidden>
        <View style={[styles.emptyBack, { backgroundColor: theme.colors.field, borderColor: theme.colors.border }]} />
        <View style={[styles.emptyFront, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.emptyLine, { width: 56, height: 8, backgroundColor: theme.colors.text }]} />
          <View style={styles.emptyCheck}>
            <View style={[styles.emptyBox, { backgroundColor: theme.colors.accent }]} />
            <View style={[styles.emptyLine, { width: 52, backgroundColor: theme.colors.border }]} />
          </View>
          <View style={styles.emptyCheck}>
            <View style={[styles.emptyBox, { borderWidth: 1.5, borderColor: theme.colors.disabled }]} />
            <View style={[styles.emptyLine, { width: 42, backgroundColor: theme.colors.border }]} />
          </View>
          <View style={[styles.emptyLine, { width: 70, backgroundColor: theme.colors.highlight }]} />
        </View>
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Your notes will live here</Text>
      <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
        Jot down an idea, a list or what was said in a meeting. Everything syncs to your other devices.
      </Text>
      <TouchableRipple
        borderless
        onPress={props.onCreate}
        accessibilityRole="button"
        style={[styles.emptyButton, { backgroundColor: theme.colors.accent }]}
      >
        <View style={styles.emptyButtonInner}>
          <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.onAccent} />
          <Text style={[styles.emptyButtonText, { color: theme.colors.onAccent }]}>Write your first note</Text>
        </View>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    margin: 20,
    right: 0,
    bottom: 0,
    borderRadius: 18,
  },
  selectedTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 18,
    marginLeft: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  bigTitle: {
    fontFamily: fonts.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  search: {
    height: 44,
    borderRadius: 12,
  },
  searchInner: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  searchText: {
    fontSize: 15,
    marginLeft: 10,
  },
  listHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    lineHeight: 28,
  },
  count: {
    fontSize: 12,
  },
  listGap: {
    height: 12,
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 48,
  },
  emptyArt: {
    width: 168,
    height: 132,
    marginBottom: 24,
  },
  emptyBack: {
    position: "absolute",
    left: 18,
    top: 14,
    width: 112,
    height: 108,
    borderRadius: 14,
    borderWidth: 1,
    transform: [{ rotate: "-8deg" }],
  },
  emptyFront: {
    position: "absolute",
    left: 40,
    top: 6,
    width: 112,
    height: 116,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 9,
    transform: [{ rotate: "4deg" }],
  },
  emptyLine: {
    height: 6,
    borderRadius: 3,
  },
  emptyCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyBox: {
    width: 11,
    height: 11,
    borderRadius: 3,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    lineHeight: 30,
    textAlign: "center",
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 290,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 22,
    height: 50,
    borderRadius: 14,
  },
  emptyButtonInner: {
    height: 50,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
});

interface RightActionPropsType {
  colUid?: string;
}

function RightAction(props: RightActionPropsType) {
  const etebase = useCredentials()!;
  const syncDispatch = useDispatch();
  const isSyncing = useSelector((state: StoreState) => state.syncCount) > 0;
  const pendingCount = usePendingCount();
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const navigation = useNavigation<DefaultNavigationProp>();
  // The notebook whose notes are listed
  const filterBy = useSelector((state: StoreState) => (
    (viewSettings.filterBy && state.cache.collections.has(viewSettings.filterBy)) ? viewSettings.filterBy : undefined
  ));
  const { colUid } = props;

  function setSortBy(sortBy: "name" | "mtime") {
    syncDispatch(setSettings({
      viewSettings: {
        ...viewSettings,
        sortBy,
      },
    }) as any);
  }

  async function refresh() {
    const syncManager = SyncManager.getManager(etebase!);
    syncDispatch(performSync(syncManager.sync()) as any); // not awaiting on puprose
  }

  useFocusEffect(React.useCallback(() => {
    if (!etebase) {
      return () => true;
    }

    refresh();

    if (Platform.OS !== "web") {
      return () => true;
    }

    function autoRefresh() {
      if (navigator.onLine && etebase) {
        refresh();
      }
    }

    const interval = 5 * 60 * 1000;
    const id = setInterval(autoRefresh, interval);
    return () => clearInterval(id);
  }, [etebase]));

  // The sort order is a button that switches between the two
  const byName = (viewSettings.sortBy === "name");
  return (
    <View style={{ flexDirection: "row" }}>
      <AppbarButton
        icon={(pendingCount > 0) ? "cloud-upload-outline" : "sync"}
        title={(pendingCount > 0) ? `Sync (${pendingCount} not uploaded yet)` : "Sync"}
        disabled={isSyncing}
        onPress={refresh}
      />
      <AppbarButton
        icon={(byName) ? "sort-alphabetical-ascending" : "sort-clock-descending-outline"}
        title={(byName) ? "Sorted by name, sort by modification time" : "Sorted by modification time, sort by name"}
        disabled={isSyncing}
        onPress={() => setSortBy((byName) ? "mtime" : "name")}
      />
      {(colUid ?? filterBy) && (
        <AppbarButton
          icon="notebook"
          title="Manage Notebook"
          disabled={isSyncing}
          onPress={() => navigation.navigate("CollectionChangelog", { colUid: (colUid ?? filterBy)! })}
        />
      )}
    </View>
  );
}
