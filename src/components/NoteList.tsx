import * as React from "react";
import { DateFormats, formatChanged, useDateFormats } from "../pim/format";
import { FlatList, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useDispatch, useSelector } from "react-redux";
import * as Etebase from "etebase";

import { useSyncGate } from "../SyncGate";
import { useCredentials } from "../credentials";
import { CachedItem, StoreState } from "../store";
import { defaultColor } from "../helpers";
import { isPinned, untitled } from "../notes";
import { setSettings } from "../store/actions";

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

// When a note was changed: the time today, then the day of the week, then the date (in the format of
// the date and time setting)
export function shortDate(mtime: number, fmt: DateFormats) {
  return formatChanged(new Date(mtime), fmt);
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
  const fmt = useDateFormats();
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
              {mtime && <Text style={[styles.rowSmall, { color: theme.colors.textMuted }]}>{shortDate(mtime, fmt)}</Text>}
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

interface NoteCardPropsType {
  item: Entry;
  itemMgr: Etebase.ItemManager | undefined;
  color: string;
  notebookName?: string;
  // The last one when there's an odd number of them: as wide as two, with the beginning of the note
  wide: boolean;
  // It's open (next to the list), or selected
  current: boolean;
  selected: boolean;
  // A link that's followed (rather than handled by onPress), e.g. on phones
  linkAction?: any;
  onPress: (e?: any) => boolean;
  onLongPress?: () => void;
}

// A pinned note, as a card
const NoteCard = React.memo(function NoteCard(props: NoteCardPropsType) {
  const fmt = useDateFormats();
  const theme = useTheme();
  const { item, itemMgr, color, notebookName, wide, current, selected } = props;
  const preview = useNotePreview((wide) ? itemMgr : undefined, item.cache);
  const mtime = item.meta.mtime;
  const highlighted = current || selected;

  return (
    <Link
      to={`/notebook/${item.colUid}/note/${item.uid}`}
      action={props.linkAction}
      onPress={props.onPress}
      renderChild={(linkProps) => (
        <TouchableRipple
          {...linkProps}
          onLongPress={props.onLongPress}
          delayLongPress={400}
          accessibilityLabel={item.meta.name || untitled}
          accessibilityState={{ selected: highlighted }}
          aria-selected={highlighted}
          style={[styles.card, {
            backgroundColor: (highlighted) ? theme.colors.accentTint : theme.colors.surface,
            borderColor: (highlighted) ? theme.colors.accentRing : theme.colors.border,
          }]}
        >
          <View style={styles.cardInner}>
            <View style={styles.cardTop}>
              <View style={[styles.rowColor, { backgroundColor: color }]} />
              <Text style={[styles.cardSmall, { flex: 1, color: theme.colors.textMuted }]} numberOfLines={1}>{notebookName}</Text>
              {(selected) ? (
                <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.accent} />
              ) : (
                <MaterialCommunityIcons name="pin" size={13} color={theme.colors.textMuted} accessibilityLabel="Pinned" />
              )}
            </View>
            <Text style={[styles.cardTitle, (!wide) && styles.cardTitleHalf, { color: theme.colors.text }]} numberOfLines={2}>{item.meta.name || untitled}</Text>
            {wide && !!preview && (
              <Text style={[styles.cardPreview, { color: theme.colors.textSecondary }]} numberOfLines={1}>{preview}</Text>
            )}
            {!!mtime && <Text style={[styles.cardWhen, { color: theme.colors.textMuted }]}>{shortDate(mtime, fmt)}</Text>}
          </View>
        </TouchableRipple>
      )}
    />
  );
});

// Splits the notes into the pinned ones and the others (each keeps the order it had)
export function splitPinned<T extends CachedItem>(entries: T[]): [T[], T[]] {
  return [entries.filter(isPinned), entries.filter((x) => !isPinned(x))];
}

interface PinnedNotesPropsType {
  notes: Entry[];
  // How many other notes there are (the title above them, when there are any)
  others: number;
  getItemMgr: (colUid: string) => Etebase.ItemManager | undefined;
  showNotebook: boolean;
  isCurrent: (note: string) => boolean;
  isSelected: (note: string) => boolean;
  linkAction?: any;
  onPress: (note: string, e?: any) => boolean;
  onLongPress?: (note: string) => void;
}

// The pinned notes above the others, as cards two per row, under a title that folds them away. Then
// the title of the other notes.
export function PinnedNotes(props: PinnedNotesPropsType) {
  const theme = useTheme();
  const dispatch = useDispatch();
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const collapsed = useSelector((state: StoreState) => !!state.settings.pinnedCollapsed);
  const { notes } = props;
  if (notes.length === 0) {
    return null;
  }
  const rows: Entry[][] = [];
  for (let i = 0 ; i < notes.length ; i += 2) {
    rows.push(notes.slice(i, i + 2));
  }

  return (
    <View style={styles.pinned}>
      <TouchableRipple
        accessibilityRole="button"
        accessibilityLabel={`Pinned, ${notes.length}`}
        accessibilityState={{ expanded: !collapsed }}
        aria-expanded={!collapsed}
        onPress={() => dispatch(setSettings({ pinnedCollapsed: !collapsed }) as any)}
        style={styles.sectionButton}
      >
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name={(collapsed) ? "chevron-right" : "chevron-down"} size={15} color={theme.colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]} accessibilityRole="header">Pinned</Text>
          <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>{notes.length}</Text>
        </View>
      </TouchableRipple>
      {!collapsed && (
        <View testID="pinned-notes" style={styles.cards}>
          {rows.map((row) => (
            <View key={row[0].uid} style={styles.cardRow}>
              {row.map((item) => {
                const key = `${item.colUid}/${item.uid}`;
                const collection = cacheCollections.get(item.colUid);
                return (
                  // (on the web the card is in a link, so it's in a cell that takes its half of the row)
                  <View key={item.uid} style={styles.cardCell}>
                    <NoteCard
                      item={item}
                      itemMgr={props.getItemMgr(item.colUid)}
                      color={collection?.meta.color || defaultColor}
                      notebookName={(props.showNotebook) ? collection?.meta.name : undefined}
                      wide={row.length === 1}
                      current={props.isCurrent(key)}
                      selected={props.isSelected(key)}
                      linkAction={props.linkAction}
                      onPress={(e) => props.onPress(key, e)}
                      onLongPress={(props.onLongPress) ? () => props.onLongPress!(key) : undefined}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
      {(props.others > 0) && (
        <View style={[styles.sectionTitleRow, styles.othersTitle, { borderTopColor: theme.colors.divider }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]} accessibilityRole="header">Other notes</Text>
          <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>{props.others}</Text>
        </View>
      )}
    </View>
  );
}

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

  // The pinned notes, above the others
  const [pinnedList, entriesList] = React.useMemo(() => {
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
    return splitPinned(ret.sort(getSortFunction(sortBy)));
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
      ListHeaderComponent={(
        <>
          {props.header}
          <PinnedNotes
            notes={pinnedList}
            others={entriesList.length}
            getItemMgr={getItemMgr}
            showNotebook={!colUid}
            isCurrent={() => false}
            isSelected={(note) => !!props.selection?.has(note)}
            onPress={(note) => props.onPressNote?.(note) ?? false}
            onLongPress={props.onSelect}
          />
        </>
      )}
      ListEmptyComponent={() => (pinnedList.length > 0) ? null : (props.empty && !colUid) ? props.empty : (
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
  pinned: {
    marginBottom: 4,
  },
  sectionButton: {
    alignSelf: "flex-start",
    borderRadius: 7,
    marginBottom: 6,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingHorizontal: 6,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 12,
    opacity: 0.8,
  },
  othersTitle: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    height: 38,
    paddingTop: 4,
  },
  cards: {
    gap: 8,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: "row",
    gap: 8,
  },
  // (the cell is its part of the row, and the card all of it)
  cardCell: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flexGrow: 1,
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 12,
  },
  cardInner: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    height: 16,
  },
  cardSmall: {
    fontSize: 11,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
  // Two lines high, so that the cards next to each other are as high (on the web they're in links,
  // which don't stretch them to the height of the row)
  cardTitleHalf: {
    minHeight: 36,
  },
  cardPreview: {
    fontSize: 13,
  },
  cardWhen: {
    fontSize: 12,
    marginTop: "auto",
  },
});
