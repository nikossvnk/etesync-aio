// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// What the search of the sidebar finds: notes, events, tasks and contacts

import { ScrollView, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";

import { useCredentials } from "../credentials";
import { useSearchQuery } from "../components/WideLayout";
import { useNoteSearch } from "../search";
import { StoreState } from "../store";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import { ContactType, EventType, TaskType } from "./pim-types";
import { usePimCollections, usePimItems } from "./data";
import { useDateFormats } from "./format";
import { ColorDot } from "./widgets";

const limit = 8;

function matches(query: string, ...texts: (string | undefined | null)[]) {
  const words = query.toLowerCase().split(/\s+/).filter((x) => x);
  const text = texts.filter((x) => x).join("\n").toLowerCase();
  return words.every((x) => text.includes(x));
}

interface Result {
  key: string;
  icon?: string;
  color?: string;
  title: string;
  detail?: string;
  onPress: () => void;
}

export default function SearchAllScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const etebase = useCredentials();
  const { query } = useSearchQuery();
  const fmt = useDateFormats();
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const notes = useNoteSearch(query, true);
  const calendars = usePimCollections(C.calendarType);
  const lists = usePimCollections(C.tasksType);
  const events = usePimItems(etebase, C.calendarType, EventType.parse);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const q = query.trim();
  const color = (cols: { colUid: string, color: string }[], colUid?: string) => cols.find((x) => x.colUid === colUid)?.color;

  const groups: { title: string, results: Result[] }[] = (!q) ? [] : [
    {
      title: "Notes",
      results: notes.map((x) => {
        const [colUid, itemUid] = String(x.id).split(":");
        const content = String(x.content ?? "").replace(/\s+/g, " ").trim();
        return {
          key: String(x.id),
          color: cacheCollections.get(colUid)?.meta.color || undefined,
          icon: "file-document-outline",
          title: x.name,
          detail: content.slice(0, 120),
          onPress: () => navigation.navigate("NoteEdit", { colUid, itemUid }),
        };
      }),
    },
    {
      title: "Events",
      results: (events ?? []).filter((x) => matches(q, x.title, x.location, x.description))
        .sort((a, b) => b.startDate.toJSDate().getTime() - a.startDate.toJSDate().getTime())
        .map((x) => {
          const start = x.startDate.toJSDate();
          return {
            key: `${x.collectionUid}/${x.itemUid}`,
            color: color(calendars, x.collectionUid),
            title: x.title || "(no title)",
            detail: [fmt.day.format(start) + ((x.startDate.isDate) ? "" : ` ${fmt.time(start)}`), (x.isRecurring()) ? "repeats" : "", x.location].filter((y) => y).join(" · "),
            onPress: () => navigation.navigate("EventEdit", { colUid: x.collectionUid, itemUid: x.itemUid }),
          };
        }),
    },
    {
      title: "Tasks",
      results: (tasks ?? []).filter((x) => matches(q, x.title, x.description))
        .sort((a, b) => Number(a.finished) - Number(b.finished))
        .map((x) => ({
          key: `${x.collectionUid}/${x.itemUid}`,
          color: color(lists, x.collectionUid),
          title: x.title || "(no title)",
          detail: [(x.finished) ? "Done" : "", (x.dueDate) ? `Due ${fmt.shortDate(x.dueDate.toJSDate())}` : ""].filter((y) => y).join(" · "),
          onPress: () => navigation.navigate("TaskEdit", { colUid: x.collectionUid, itemUid: x.itemUid }),
        })),
    },
    {
      title: "Contacts",
      results: (contacts ?? []).filter((x) => !x.group && matches(q, x.toIcal()))
        .map((x) => ({
          key: `${x.collectionUid}/${x.itemUid}`,
          icon: "account-outline",
          title: String(x.fn || "(no name)"),
          detail: String(x.comp.getFirstPropertyValue("email") ?? x.comp.getFirstPropertyValue("tel") ?? "").replace(/^tel:/, ""),
          onPress: () => navigation.navigate("Contact", { colUid: x.collectionUid, itemUid: x.itemUid }),
        })),
    },
  ];
  const found = groups.filter((x) => x.results.length > 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header">
        {(q) ? `Results for “${q}”` : "Search"}
      </Text>
      {(!q) && <Text style={{ color: theme.colors.textMuted }}>Type in the search of the sidebar to find notes, events, tasks and contacts.</Text>}
      {(q && found.length === 0) && <Text style={{ color: theme.colors.textMuted }}>Nothing found.</Text>}
      {found.map((group) => (
        <View key={group.title} style={styles.group} testID={`results-${group.title}`}>
          <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>{group.title} · {group.results.length}</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {group.results.slice(0, limit).map((x, idx) => (
              <TouchableRipple
                key={x.key}
                accessibilityRole="button"
                accessibilityLabel={`${group.title.slice(0, -1)} ${x.title}`}
                onPress={x.onPress}
                style={[styles.result, (idx > 0) ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider } : undefined]}
              >
                <View style={styles.resultInner}>
                  {(x.icon) ? (
                    <MaterialCommunityIcons name={x.icon as any} size={17} color={x.color ?? theme.colors.textMuted} style={{ marginRight: 10 }} />
                  ) : (
                    <ColorDot color={x.color ?? theme.colors.textMuted} style={{ marginRight: 12, marginLeft: 3 }} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontFamily: fonts.medium }}>{x.title}</Text>
                    {!!x.detail && <Text numberOfLines={1} style={{ color: theme.colors.textMuted, fontSize: 12 }}>{x.detail}</Text>}
                  </View>
                </View>
              </TouchableRipple>
            ))}
          </View>
          {(group.results.length > limit) && (
            <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 6 }}>and {group.results.length - limit} more</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 24,
    gap: 6,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    marginBottom: 8,
  },
  group: {
    marginTop: 14,
  },
  groupTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  result: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resultInner: {
    flexDirection: "row",
    alignItems: "center",
  },
});
