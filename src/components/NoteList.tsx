import * as React from "react";
import { differenceInCalendarDays, format, isThisYear, isToday, isYesterday } from "date-fns";
import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import * as Etebase from "etebase";

import { useSyncGate } from "../SyncGate";
import { useCredentials } from "../credentials";
import { CachedItem, StoreState } from "../store";
import { defaultColor } from "../helpers";
import { untitled } from "../notes";

import NotFound from "../widgets/NotFound";
import Link from "../widgets/Link";
import GroupedRow from "../widgets/GroupedRow";
import { fonts, useTheme } from "../theme";

function sortMtime(aIn: CachedItem, bIn: CachedItem) {
  const a = aIn.meta.mtime!;
  const b = bIn.meta.mtime!;
  return (a > b) ? -1 : (a < b) ? 1 : 0;
}

function sortName(aIn: CachedItem, bIn: CachedItem) {
  const a = aIn.meta.name!;
  const b = bIn.meta.name!;
  return a.localeCompare(b);
}

export function getSortFunction(sortOrder: string) {
  const sortFunctions: (typeof sortName)[] = [];

  switch (sortOrder) {
    case "mtime":
      // Do nothing because it's the last sort function anyway
      break;
    case "name":
      sortFunctions.push(sortName);
      break;
  }

  sortFunctions.push(sortMtime);

  return (a: CachedItem, b: CachedItem) => {
    for (const sortFunction of sortFunctions) {
      const ret = sortFunction(a, b);
      if (ret !== 0) {
        return ret;
      }
    }

    return 0;
  };
}

export type Entry = CachedItem & { colUid: string, uid: string };

// The previews of the notes, by the cache they were made from
const previews = new WeakMap<Uint8Array, string>();

// The beginning of a note as plain text, without most of the markdown formatting
function toPreview(content: string) {
  return content.substring(0, 400)
    .replace(/^\s*[-*+] \[ \]/gm, "☐")
    .replace(/^\s*[-*+] \[x\]/gim, "☑")
    .replace(/^\s*[-*+] /gm, "• ")
    .replace(/^\s*(#{1,6}|>)\s*/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

export function useNotePreview(itemMgr: Etebase.ItemManager | undefined, cache: Uint8Array) {
  const [preview, setPreview] = React.useState(previews.get(cache));

  React.useEffect(() => {
    const known = previews.get(cache);
    if ((known !== undefined) || !itemMgr) {
      setPreview(known);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const content = await itemMgr.cacheLoad(cache).getContent(Etebase.OutputFormat.String);
      const ret = toPreview(content);
      previews.set(cache, ret);
      if (!cancelled) {
        setPreview(ret);
      }
    })().catch(() => {
      // The note just has no preview then
    });
    return () => {
      cancelled = true;
    };
  }, [itemMgr, cache]);

  return preview;
}

// When a note was changed: the time today, then the day of the week, then the date
export function shortDate(mtime: number) {
  const now = new Date();
  if (isToday(mtime)) {
    return format(mtime, "p");
  } else if (isYesterday(mtime)) {
    return "Yesterday";
  } else if (differenceInCalendarDays(now, mtime) < 7) {
    return format(mtime, "EEE");
  } else if (isThisYear(mtime)) {
    return format(mtime, "MMM d");
  }
  return format(mtime, "MMM d, yyyy");
}

interface NoteRowPropsType {
  item: Entry;
  itemMgr: Etebase.ItemManager | undefined;
  color: string;
  // Only passed when notes of more than one notebook are listed
  notebookName?: string;
  first: boolean;
  last: boolean;
  // Selecting: whether it's selected, selecting it (a long press), and a press, which selects it
  // when notes are being selected (then it returns true)
  selected?: boolean;
  onSelect?: (note: string) => void;
  onPressNote?: (note: string) => boolean;
}

const NoteRow = React.memo(function NoteRow(props: NoteRowPropsType) {
  const { item, itemMgr, color, notebookName, first, last, selected, onSelect, onPressNote } = props;
  const key = `${item.colUid}/${item.uid}`;
  const theme = useTheme();
  const preview = useNotePreview(itemMgr, item.cache);
  const mtime = item.meta.mtime;

  return (
    <Link
      to={`/notebook/${item.colUid}/note/${item.uid}`}
      onPress={() => onPressNote?.(key) ?? false}
      renderChild={(props) => (
        <GroupedRow
          {...props}
          first={first}
          last={last}
          // A long press starts selecting notes
          onLongPress={(onSelect) ? () => onSelect(key) : undefined}
          delayLongPress={400}
          accessibilityLabel={item.meta.name || untitled}
          accessibilityState={{ selected: !!selected }}
          aria-selected={!!selected}
          style={[styles.row, (selected) ? { backgroundColor: theme.colors.accentTint } : {}]}
        >
          <View>
            <View style={styles.rowTop}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.meta.name || untitled}</Text>
              {mtime && <Text style={[styles.rowSmall, { color: theme.colors.textMuted }]}>{shortDate(mtime)}</Text>}
            </View>
            {!!preview && (
              <Text style={[styles.rowPreview, { color: theme.colors.textSecondary }]} numberOfLines={2}>{preview}</Text>
            )}
            {selected && (
              <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.accent} style={styles.check} />
            )}
            {notebookName && (
              <View style={styles.rowNotebook}>
                <View style={[styles.rowColor, { backgroundColor: color }]} />
                <Text style={[styles.rowSmall, { color: theme.colors.textMuted }]} numberOfLines={1}>{notebookName}</Text>
              </View>
            )}
          </View>
        </GroupedRow>
      )}
    />
  );
});

interface PropsType {
  colUid?: string;
  sortBy: "name" | "mtime";
  // Above the notes, scrolling with them
  header?: React.ReactElement;
  // Shown when there are no notes at all
  empty?: React.ReactElement;
  // The notes that are selected ("colUid/itemUid"), when notes can be selected, and selecting one
  selection?: Set<string>;
  onSelect?: (note: string) => void;
  onPressNote?: (note: string) => boolean;
}

export default function NoteList(props: PropsType) {
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const syncGate = useSyncGate();
  const theme = useTheme();
  const etebase = useCredentials();

  // The item managers the cards load their previews with, created as needed
  const itemMgrs = React.useMemo(() => new Map<string, Etebase.ItemManager>(), [etebase, cacheCollections]);
  function getItemMgr(colUid: string) {
    const cached = cacheCollections.get(colUid);
    if (!itemMgrs.has(colUid) && etebase && cached) {
      const colMgr = etebase.getCollectionManager();
      itemMgrs.set(colUid, colMgr.getItemManager(colMgr.cacheLoad(cached.cache)));
    }
    return itemMgrs.get(colUid);
  }

  const { sortBy } = props;
  const colUid = props.colUid || undefined;
  const cacheCollection = (colUid) ? cacheCollections.get(colUid) : undefined;

  const entriesList = React.useMemo(() => {
    const filterByUid = colUid;

    const ret: Entry[] = [];
    for (const [colUid, itemLists] of cacheItems.entries()) {
      if (filterByUid && (filterByUid !== colUid)) {
        continue;
      }

      for (const [uid, item] of itemLists.entries()) {
        if (item.isDeleted) {
          continue;
        }

        ret.push({ ...item, uid, colUid });
      }
    }
    return ret.sort(getSortFunction(sortBy));
  }, [cacheItems, sortBy, colUid]);

  if (syncGate) {
    return syncGate;
  }

  if (colUid && !cacheCollection) {
    return <NotFound />;
  }

  function renderEntry(param: { item: Entry, index: number }) {
    const { item, index } = param;
    const collection = cacheCollections.get(item.colUid);

    return (
      <NoteRow
        item={item}
        itemMgr={getItemMgr(item.colUid)}
        color={collection?.meta.color || defaultColor}
        notebookName={(colUid) ? undefined : collection?.meta.name}
        first={index === 0}
        last={index === entriesList.length - 1}
        selected={props.selection?.has(`${item.colUid}/${item.uid}`)}
        onSelect={props.onSelect}
        onPressNote={props.onPressNote}
      />
    );
  }

  return (
    <FlatList
      style={[{ backgroundColor: theme.colors.background }, { flex: 1 }]}
      contentContainerStyle={styles.list}
      data={entriesList}
      // (the rows show whether they're selected)
      extraData={props.selection}
      keyExtractor={(item) => item.uid}
      renderItem={renderEntry}
      maxToRenderPerBatch={10}
      ListHeaderComponent={props.header}
      ListEmptyComponent={() => (props.empty && !colUid) ? props.empty : (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>Notebook is empty</Text>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    // Leave room for the button that's floating over the list
    paddingBottom: 112,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  rowTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 21,
    marginRight: 8,
  },
  rowPreview: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  rowNotebook: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  rowColor: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 6,
  },
  rowSmall: {
    fontSize: 12,
  },
  check: {
    position: "absolute",
    right: 0,
    bottom: 0,
  },
  empty: {
    padding: 16,
    fontSize: 15,
  },
});
