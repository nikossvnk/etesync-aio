import * as React from "react";
import { StyleSheet, FlatList, Platform, View, BackHandler } from "react-native";
import { Appbar as PaperAppbar, List, FAB, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import * as Etebase from "etebase";

import { useSyncGate, usePendingCount } from "../SyncGate";
import { StoreState } from "../store";
import { SyncManager } from "../sync/SyncManager";
import { performSync } from "../store/actions";
import { useCredentials } from "../credentials";

import NoteList from "../components/NoteList";
import Appbar from "../widgets/Appbar";
import AppbarAction from "../widgets/AppbarAction";
import AppbarButton from "../widgets/AppbarButton";
import NotFound from "../widgets/NotFound";
import GroupedRow from "../widgets/GroupedRow";
import { defaultColor } from "../helpers";
import { DefaultNavigationProp } from "../RootStackParamList";
import { fonts, useTheme } from "../theme";

interface PropsType {
  colUid?: string;
  active: boolean;
}

type Notebook = {
  meta: Etebase.ItemMetadata;
  uid: string;
};

export default function NotebookListScreen(props: PropsType) {
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const notebooks: Notebook[] = React.useMemo(() => Array.from(cacheCollections
    .sort((a, b) => (a.meta!.name!.toUpperCase() >= b.meta!.name!.toUpperCase()) ? 1 : -1)
    .map(({ meta }, uid) => {return { meta, uid }})
    .values()
  ), [cacheCollections]);
  const navigation = useNavigation<DefaultNavigationProp>();
  const syncGate = useSyncGate();
  const theme = useTheme();

  const { colUid, active } = props;
  const cacheCollection = (colUid) ? notebooks.find((col) => col.uid === colUid) : undefined;
  const [notebook, setNotebook] = React.useState(cacheCollection);

  // Follow changes to the open notebook, and leave it when it's deleted
  React.useEffect(() => {
    if (notebook) {
      setNotebook(notebooks.find((col) => col.uid === notebook.uid));
    }
  }, [notebooks]);

  React.useEffect(() => {
    if (!active) {
      return;
    }

    navigation.setOptions({
      header: (props) => <Appbar {...props} menuFallback />,
      title: notebook?.meta.name || "Notebooks",
      // (set by the list of notes)
      headerTitle: undefined,
      headerShadowVisible: undefined,
      headerLeft: (notebook) ? () => <PaperAppbar.BackAction containerColor="transparent" color={theme.colors.text} onPress={() => setNotebook(undefined)} /> : undefined,
      headerRight: () => (
        <RightAction colUid={notebook?.uid} />
      ),
    });
  }, [active, navigation, notebook]);

  const onBackPress = React.useCallback(() => {
    if (active && notebook) {
      setNotebook(undefined);
      return true;
    } else {
      return false;
    }
  }, [active, notebook]);

  React.useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);

    return () => backHandler.remove();
  }, [onBackPress]);

  if (syncGate) {
    return syncGate;
  }

  if (colUid && !cacheCollection) {
    return <NotFound />;
  }

  function renderItem({ item, index }: { item: Notebook, index: number }) {
    const first = index === 0;
    const last = index === notebooks.length - 1;
    const count = cacheItems.get(item.uid)?.count((x) => !x.isDeleted) ?? 0;
    return (
      <GroupedRow
        first={first}
        last={last}
        accessibilityRole="button"
        onPress={() => {
          setNotebook(item);
        }}
        style={styles.row}
      >
        <View style={styles.rowInner}>
          <View style={[styles.color, { backgroundColor: item.meta.color || defaultColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{item.meta.name!}</Text>
            {!!item.meta.description && (
              <Text style={[styles.description, { color: theme.colors.textSecondary }]} numberOfLines={2}>{item.meta.description}</Text>
            )}
          </View>
          <Text style={[styles.count, { color: theme.colors.textMuted }]}>{count}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </View>
      </GroupedRow>
    );
  }

  return (
    <>
      {notebook ? (
        <NoteList
          colUid={notebook.uid}
          sortBy="name"
        />
      ) : (
        <FlatList
          style={[{ backgroundColor: theme.colors.background }, { flex: 1 }]}
          contentContainerStyle={styles.list}
          data={notebooks}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          maxToRenderPerBatch={10}
          ListEmptyComponent={() => (
            <List.Item
              title="No Notebooks"
            />
          )}
        />
      )}

      <FAB
        icon="plus"
        accessibilityLabel="New"
        color={theme.colors.onAccent}
        style={[styles.fab, { backgroundColor: theme.colors.accent }]}
        onPress={() => navigation.navigate("CollectionCreate")}
      />
    </>
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
  list: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 112,
  },
  row: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 14,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  color: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 12,
  },
  name: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  description: {
    fontSize: 13,
    marginTop: 2,
  },
  count: {
    fontSize: 13,
    marginLeft: 8,
    marginRight: 2,
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
  const navigation = useNavigation<DefaultNavigationProp>();
  const { colUid } = props;

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

  return (
    <View style={{ flexDirection: "row" }}>
      <AppbarAction
        icon={(pendingCount > 0) ? "cloud-upload-outline" : "sync"}
        accessibilityLabel={(pendingCount > 0) ? `Sync (${pendingCount} not uploaded yet)` : "Sync"}
        disabled={isSyncing}
        onPress={refresh}
      />
      {colUid && (
        <AppbarButton
          icon="notebook"
          title="Manage Notebook"
          disabled={isSyncing}
          onPress={() => navigation.navigate("CollectionChangelog", { colUid })}
        />
      )}
    </View>
  );
}