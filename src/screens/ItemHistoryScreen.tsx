// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The history of a note or an event: its versions on the server, newest first, and the one that is
// chosen, with what changed since the one before it (whole lines of a note, the fields of an event).
// An earlier version can be brought back, as a new version.

import * as React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { StoreState } from "../store";
import { pushMessage } from "../store/actions";
import { RootStackParamList } from "../RootStackParamList";
import { goUp } from "../navigation";
import { fonts, useTheme } from "../theme";
import { useDeviceBreakpoint } from "../helpers";
import LoadingIndicator from "../widgets/LoadingIndicator";
import NotFound from "../widgets/NotFound";
import { diffLines, isOffline, loadVersions, restoreVersion, Version } from "../history";
import { kindOf } from "../pim/collections";
import { DateFormats, useDateFormats } from "../pim/format";
import { EventType } from "../pim/pim-types";
import { eventAttendees } from "../pim/occurrences";
import { repeatName } from "../pim/TasksScreen";
import { Button, Frame } from "../pim/Dialogs";
import { mono, tint } from "../pim/style";

interface PropsType {
  route: RouteProp<RootStackParamList, "ItemHistory">;
}

// When a version was saved, short ("Today, 09:14", "20 Oct, 14:02") and long ("Tuesday 20 October, 14:02")
function when(mtime: number | undefined, fmt: DateFormats) {
  if (!mtime) {
    return { short: "Unknown time", long: "At an unknown time" };
  }
  const date = new Date(mtime);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / (24 * 3600 * 1000));
  const thisYear = date.getFullYear() === now.getFullYear();
  const day = (days === 0) ? "Today" : (days === 1) ? "Yesterday" : (thisYear) ? fmt.shortDate(date) : fmt.mediumDate(date);
  return {
    short: `${day}, ${fmt.time(date)}`,
    long: `${fmt.day.format(date)}${(thisYear) ? "" : " " + date.getFullYear()}, ${fmt.time(date)}`,
  };
}

// The fields of an event, as the history shows them
interface Field {
  label: string;
  value?: string;
  list?: string[];
}

function eventFields(content: string, fmt: DateFormats): Field[] | undefined {
  let event: EventType;
  try {
    event = EventType.parse(content);
  } catch (e) {
    return undefined;
  }
  const ret: Field[] = [{ label: "Title", value: event.summary || "(no title)" }];
  try {
    const start = event.startDate.toJSDate();
    const allDay = event.startDate.isDate;
    let end = event.endDate?.toJSDate() ?? start;
    if (allDay) {
      // (all day events end at the start of the day after their last one)
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    }
    const days = (d: Date) => `${fmt.weekDay.format(d)} ${fmt.mediumDate(d)}`;
    const sameDay = start.toDateString() === end.toDateString();
    const value = (allDay) ? ((sameDay) ? `${days(start)}, all day` : `${days(start)} – ${days(end)}, all day`) :
      (sameDay) ? `${days(start)}, ${fmt.time(start)} – ${fmt.time(end)}` : `${days(start)}, ${fmt.time(start)} – ${days(end)}, ${fmt.time(end)}`;
    const zone = (!allDay) ? (event.startDate.timezone ?? event.startDate.zone?.tzid) : undefined;
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    ret.push({ label: "When", value: (zone && (zone !== "floating") && (zone !== here)) ? `${value} (${zone.replace(/_/g, " ")} time shown where you are)` : value });
  } catch (e) {
    ret.push({ label: "When", value: "(can't be read)" });
  }
  if (event.isRecurring()) {
    const changed = event.changedTimes.length;
    ret.push({ label: "Repeats", value: repeatName(event.rrule) + ((changed) ? ` (${changed} ${(changed === 1) ? "time" : "times"} changed on its own)` : "") });
  }
  if (event.location) {
    ret.push({ label: "Location", value: event.location });
  }
  const attendees = eventAttendees(event).map((x) => x.name);
  if (attendees.length > 0) {
    ret.push({ label: "Attendees", list: attendees });
  }
  if (event.description) {
    ret.push({ label: "Description", value: event.description });
  }
  return ret;
}

export default function ItemHistoryScreen(props: PropsType) {
  const { colUid, itemUid } = props.route.params;
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const theme = useTheme();
  const fmt = useDateFormats();
  const etebase = useCredentials();
  const syncGate = useSyncGate();
  const wide = useDeviceBreakpoint("tabletLandscape");
  const cachedCol = useSelector((state: StoreState) => state.allCache.collections.get(colUid));
  const cachedItem = useSelector((state: StoreState) => state.allCache.items.get(colUid)?.get(itemUid));
  const kind = (cachedCol) ? kindOf(cachedCol.collectionType) : undefined;
  const isNote = kind === "notes";
  const noun = (isNote) ? "note" : "event";

  const [versions, setVersions] = React.useState<Version[]>();
  const [problem, setProblem] = React.useState<{ offline: boolean, message: string }>();
  const [attempt, setAttempt] = React.useState(0);
  // The chosen version (by its index), which phones show on its own
  const [selected, setSelected] = React.useState<number>();
  const [restoreShown, setRestoreShown] = React.useState(false);

  React.useEffect(() => {
    if (!etebase || !cachedItem) {
      return undefined;
    }
    let cancelled = false;
    setProblem(undefined);
    setVersions(undefined);
    loadVersions(etebase, colUid, itemUid).then((x) => {
      if (!cancelled) {
        setVersions(x);
      }
    }).catch((e) => {
      if (!cancelled) {
        setProblem({ offline: isOffline(e), message: String((e as Error)?.message ?? e) });
      }
    });
    return () => {
      cancelled = true;
    };
    // (loaded again when asked to, not each time the item changes)
  }, [etebase, colUid, itemUid, attempt]);

  // The title of the item (a note's is its name, an event's is in it)
  const title = React.useMemo(() => {
    const newest = versions?.find((x) => !x.deleted);
    if (isNote) {
      return cachedItem?.meta.name || newest?.name || "Untitled";
    }
    try {
      return (newest) ? (EventType.parse(newest.content).summary || "(no title)") : "";
    } catch (e) {
      return "";
    }
  }, [versions, cachedItem, isNote]);

  React.useEffect(() => {
    navigation.setOptions({ title: (title) ? `History: ${title}` : "History" });
  }, [title]);

  if (syncGate) {
    return syncGate;
  }
  if (!cachedCol || !cachedItem || !kind || !["notes", "calendar"].includes(kind)) {
    return <NotFound />;
  }

  const host = (() => {
    try {
      return new URL(etebase!.serverUrl).host;
    } catch (e) {
      return "the server";
    }
  })();
  const muted = { color: theme.colors.textMuted };
  const back = () => goUp(navigation, props.route);

  const head = (
    <View style={[styles.head, { borderBottomColor: theme.colors.border }]}>
      <Text style={[styles.crumbs, muted]} numberOfLines={1}>{(isNote) ? "Notes" : "Calendar"} › {cachedCol.meta.name}</Text>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.text }]} accessibilityRole="header" numberOfLines={1}>
          {title} <Text style={[styles.title, muted, { fontFamily: fonts.regular }]}>History</Text>
        </Text>
        {versions && <Text style={[styles.count, muted]}>{(versions.length === 1) ? "1 version" : `${versions.length} versions`}</Text>}
      </View>
    </View>
  );

  if (problem) {
    return (
      <View style={{ flex: 1 }}>
        {head}
        <View style={styles.problemWrap}>
          <View role="alert" style={[styles.problem, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} testID="history-problem">
            <View style={[styles.problemIcon, { backgroundColor: (problem.offline) ? theme.colors.field : tint(theme.colors.negative, 0.14) }]}>
              <MaterialCommunityIcons name={(problem.offline) ? "cloud-off-outline" : "alert-circle-outline"} size={22} color={(problem.offline) ? theme.colors.textSecondary : theme.colors.negative} />
            </View>
            <Text style={[styles.problemTitle, { color: theme.colors.text }]}>{(problem.offline) ? "History needs a connection" : "Couldn’t load the history"}</Text>
            <Text style={{ color: theme.colors.textBody, textAlign: "center" }}>
              {(problem.offline) ?
                `Earlier versions are kept on ${host}, not on this device. Connect to the internet and try again. Your ${noun} itself is still here.` :
                `The server didn’t answer as expected. Your ${noun} is fine; only its earlier versions couldn’t be loaded.`}
            </Text>
            {!problem.offline && <Text style={[styles.code, { backgroundColor: theme.colors.field, color: theme.colors.textSecondary }]}>{problem.message}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Button label={`Back to ${(isNote) ? "note" : "calendar"}`} onPress={back} />
              <Button label="Try again" primary onPress={() => setAttempt(attempt + 1)} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!versions) {
    return (
      <View style={{ flex: 1 }}>
        {head}
        <Text style={[{ margin: 24 }, muted]}>Loading versions from {host}…</Text>
        <LoadingIndicator />
      </View>
    );
  }

  const chosen = selected ?? 0;
  const version = versions[chosen];
  const older = versions[chosen + 1];
  // (a deleted version has nothing to show, so the one before it is shown)
  const shown = (version?.deleted) ? older : version;
  const label = (i: number) => (versions[i].deleted) ? "Deleted" : (i === 0) ? "Current" : "Earlier version";

  const list = (
    <View accessibilityRole={"navigation" as any} aria-label="Versions" style={[styles.list, (wide) && { borderRightColor: theme.colors.border, borderRightWidth: StyleSheet.hairlineWidth, backgroundColor: theme.colors.sidebar }]}>
      <Text style={[styles.listHead, muted]}>Versions · newest first</Text>
      <ScrollView contentContainerStyle={{ gap: 2 }}>
        {versions.map((x, i) => {
          const on = wide && (i === chosen);
          const pill = (i === 0) ? [theme.colors.accentTint, theme.colors.accentText] : (x.deleted) ? [tint(theme.colors.negative, 0.16), theme.colors.negative] : ["transparent", theme.colors.textMuted];
          return (
            <TouchableRipple
              key={x.id}
              accessibilityRole="button"
              accessibilityLabel={`Version of ${when(x.mtime, fmt).short}, ${label(i)}`}
              aria-current={(on) ? "true" : undefined}
              onPress={() => setSelected(i)}
              style={[styles.row, (on) && { backgroundColor: theme.colors.field, borderColor: tint(theme.colors.accent, 0.45) }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.dot, { backgroundColor: (i === 0) ? theme.colors.accent : (x.deleted) ? theme.colors.negative : theme.colors.disabled }]} />
                <Text style={{ flex: 1, color: theme.colors.text, fontFamily: fonts.medium }}>{when(x.mtime, fmt).short}</Text>
                <Text style={[styles.pill, { backgroundColor: pill[0], color: pill[1] }]}>{label(i)}</Text>
              </View>
            </TouchableRipple>
          );
        })}
      </ScrollView>
      <Text style={[styles.listFoot, muted]}>Versions are kept on {host} and loaded when you open this page.</Text>
    </View>
  );

  const content = (version) && (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.version} testID="history-version">
      {!wide && (
        <TouchableRipple accessibilityRole="button" accessibilityLabel="All versions" onPress={() => setSelected(undefined)} style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.accentText} />
            <Text style={{ color: theme.colors.accentText }}>All versions</Text>
          </View>
        </TouchableRipple>
      )}
      <View style={styles.versionHead}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: (chosen === 0) ? theme.colors.accentText : (version.deleted) ? theme.colors.negative : theme.colors.textMuted }}>{label(chosen)}</Text>
          <Text style={{ fontSize: 17, fontFamily: fonts.semibold, color: theme.colors.text }}>{when(version.mtime, fmt).long}</Text>
        </View>
        {(chosen === 0) ? (
          <Text style={muted}>This is the current version</Text>
        ) : (shown) && (
          <Button label="Restore this version" primary icon="restore" onPress={() => setRestoreShown(true)} />
        )}
      </View>
      {(versions.length === 1) && (
        <View role="note" style={[styles.note, { backgroundColor: theme.colors.field }]}>
          <Text style={{ color: theme.colors.textBody }}>This is the only version so far. Each time this {noun} is saved, the version before it is kept here.</Text>
        </View>
      )}
      {(shown) ? (
        <VersionBody version={shown} older={(version.deleted) ? undefined : older} isNote={isNote} fmt={fmt} />
      ) : (
        <Text style={muted}>This version marks the {noun} as deleted, and has nothing to show.</Text>
      )}
    </ScrollView>
  );

  const restoreDialog = (restoreShown && shown) && (
    <Frame
      title="Restore this version?"
      onClose={() => setRestoreShown(false)}
      width={480}
      testID="restore-dialog"
      footer={(
        <>
          <Button label="Cancel" onPress={() => setRestoreShown(false)} />
          <Button label="Restore" primary onPress={async () => {
            setRestoreShown(false);
            await restoreVersion(etebase!, colUid, itemUid, shown, isNote);
            dispatch(pushMessage({ message: "Restored. It’s now the current version.", severity: "success" }) as any);
            back();
          }} />
        </>
      )}
    >
      <Text style={{ fontSize: 14, color: theme.colors.textBody }}>“{title}” goes back to how it was on {when(shown.mtime, fmt).short}.</Text>
      <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>This is saved as a new version. The current version stays in the history, so you can go back to it at any time.</Text>
    </Frame>
  );

  return (
    <View style={{ flex: 1 }}>
      {head}
      {(wide) ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ width: 300 }}>{list}</View>
          {content}
        </View>
      ) : (
        (selected === undefined) ? list : content
      )}
      {restoreDialog}
    </View>
  );
}

// A version, with what changed since the one before it (if there is one to compare with)
function VersionBody(props: { version: Version, older?: Version, isNote: boolean, fmt: DateFormats }) {
  const theme = useTheme();
  const { version, older, isNote, fmt } = props;
  const muted = { color: theme.colors.textMuted };
  const compared = !!older && !older.deleted;

  let rows: React.ReactNode[];
  let counts = { added: 0, removed: 0, changed: 0 };
  if (isNote) {
    const titleChanged = compared && (older!.name !== version.name);
    const lines = (compared) ? diffLines(older!.content, version.content) : version.content.split("\n").map((text) => ({ text, change: "same" as const }));
    counts = { added: lines.filter((x) => x.change === "added").length, removed: lines.filter((x) => x.change === "removed").length, changed: (titleChanged) ? 1 : 0 };
    rows = [
      <View key="title" style={[styles.line, (titleChanged) && { backgroundColor: tint(theme.colors.changed, 0.12) }]}>
        <Text style={[styles.mark, { color: theme.colors.changed }]} aria-hidden>{(titleChanged) ? "±" : ""}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontFamily: fonts.bold, color: theme.colors.text }}>{(titleChanged) ? "Changed: " : ""}{version.name || "Untitled"}</Text>
          {titleChanged && <Text style={muted}>was <Text style={{ textDecorationLine: "line-through", color: theme.colors.negative }}>{older!.name || "Untitled"}</Text></Text>}
        </View>
      </View>,
      ...lines.map((x, i) => <NoteLine key={i} text={x.text} change={x.change} />),
    ];
  } else {
    const fields = eventFields(version.content, fmt);
    const before = (compared) ? eventFields(older!.content, fmt) : undefined;
    if (!fields) {
      rows = [<Text key="unreadable" style={muted}>This version can’t be read.</Text>];
    } else {
      const labels = [...fields.map((x) => x.label), ...(before ?? []).map((x) => x.label).filter((x) => !fields.some((y) => y.label === x))];
      rows = labels.map((labelText) => {
        const now = fields.find((x) => x.label === labelText);
        const then = before?.find((x) => x.label === labelText);
        const text = (x?: Field) => (x?.list) ? x.list.join(", ") : (x?.value ?? "");
        const change = (!before) ? "same" : (!then) ? "added" : (!now) ? "removed" : (text(now) !== text(then)) ? "changed" : "same";
        if (change !== "same") {
          counts[change]++;
        }
        const pill = { added: ["Added", theme.colors.positive], removed: ["Removed", theme.colors.negative], changed: ["Changed", theme.colors.changed], same: ["", ""] }[change];
        return (
          <View key={labelText} style={[styles.field, { borderBottomColor: theme.colors.divider }, (change === "added") && { backgroundColor: tint(theme.colors.positive, 0.07) }, (change === "removed") && { backgroundColor: tint(theme.colors.negative, 0.06) }]}>
            <View style={styles.fieldLabel}>
              <Text style={[{ fontSize: 13 }, muted]}>{labelText}</Text>
              {!!pill[0] && <Text style={[styles.pill, { backgroundColor: tint(pill[1], 0.16), color: pill[1] }]}>{pill[0]}</Text>}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {(now?.list || then?.list) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {(now?.list ?? []).map((x) => {
                    const added = !!before && !(then?.list ?? []).includes(x);
                    return <Text key={x} style={[styles.chip, { backgroundColor: (added) ? tint(theme.colors.positive, 0.22) : theme.colors.field, color: theme.colors.text }]}>{(added) ? "+ " : ""}{x}</Text>;
                  })}
                  {(!!before) && (then?.list ?? []).filter((x) => !(now?.list ?? []).includes(x)).map((x) => (
                    <Text key={"-" + x} style={[styles.chip, { backgroundColor: tint(theme.colors.negative, 0.18), color: theme.colors.negative, textDecorationLine: "line-through" }]}>− {x}</Text>
                  ))}
                </View>
              ) : (change === "removed") ? (
                <Text style={{ color: theme.colors.negative, textDecorationLine: "line-through" }}>{text(then)}</Text>
              ) : (
                <>
                  <Text style={[{ color: theme.colors.text, alignSelf: "flex-start" }, (change !== "same") && { backgroundColor: tint(theme.colors.positive, 0.22), paddingHorizontal: 4 }]}>{text(now)}</Text>
                  {(change === "changed") && <Text style={muted}>was <Text style={{ textDecorationLine: "line-through", color: theme.colors.negative }}>{text(then)}</Text></Text>}
                </>
              )}
            </View>
          </View>
        );
      });
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }} testID="history-compare">
        <Text style={muted}>{(compared) ? `Changes since the version from ${when(older!.mtime, fmt).short}.` : "First version — there is nothing earlier to compare with."}</Text>
        {compared && (counts.added > 0) && <Text style={[styles.pill, { backgroundColor: tint(theme.colors.positive, 0.16), color: theme.colors.positive }]}>+ {counts.added} added</Text>}
        {compared && (counts.removed > 0) && <Text style={[styles.pill, { backgroundColor: tint(theme.colors.negative, 0.16), color: theme.colors.negative }]}>− {counts.removed} removed</Text>}
        {compared && (counts.changed > 0) && <Text style={[styles.pill, { backgroundColor: tint(theme.colors.changed, 0.16), color: theme.colors.changed }]}>± {counts.changed} changed</Text>}
      </View>
      <View style={[styles.body, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        {rows}
      </View>
    </View>
  );
}

// A line of a note, in the style it has (a heading, an item of a list, a checkbox), and marked when
// it was added or removed
function NoteLine(props: { text: string, change: "same" | "added" | "removed" }) {
  const theme = useTheme();
  const { change } = props;
  let text = props.text;
  let style: object = { fontSize: 15, color: theme.colors.textBody };
  let prefix = "";
  const heading = /^(#{1,6})\s+(.*)$/.exec(text);
  const check = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(text);
  const item = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(text);
  if (heading) {
    text = heading[2];
    style = { fontSize: (heading[1].length === 1) ? 20 : 17, fontFamily: fonts.semibold, color: theme.colors.text, marginTop: 6 };
  } else if (check) {
    prefix = (check[1] === " ") ? "☐ " : "☑ ";
    text = check[2];
  } else if (item) {
    prefix = (/\d/.test(item[1])) ? item[1] + " " : "• ";
    text = item[2];
  }
  if (!text.trim() && (change === "same")) {
    return <View style={{ height: 6 }} />;
  }
  const color = (change === "added") ? theme.colors.positive : (change === "removed") ? theme.colors.negative : undefined;
  return (
    <View style={[styles.line, (color) && { backgroundColor: tint(color, (change === "added") ? 0.14 : 0.12) }]}>
      <Text style={[styles.mark, { color }]} aria-hidden>{(change === "added") ? "+" : (change === "removed") ? "−" : ""}</Text>
      <Text style={[{ flex: 1 }, style, (change === "removed") && { color: theme.colors.negative, textDecorationLine: "line-through" }]}>
        {(change === "added") ? <Text style={styles.hidden}>Added: </Text> : (change === "removed") ? <Text style={styles.hidden}>Removed: </Text> : null}
        {prefix}{text || " "}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  crumbs: {
    fontSize: 13,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  count: {
    fontSize: 13,
  },
  list: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  listHead: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    paddingHorizontal: 8,
  },
  listFoot: {
    fontSize: 12,
    paddingHorizontal: 8,
  },
  row: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  pill: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  version: {
    padding: 24,
    gap: 14,
    maxWidth: 820,
  },
  versionHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  note: {
    padding: 12,
    borderRadius: 9,
  },
  body: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 2,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    paddingRight: 6,
    borderRadius: 6,
  },
  mark: {
    width: 20,
    textAlign: "center",
    fontFamily: mono,
    fontSize: 13,
    paddingTop: 2,
  },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  field: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: {
    width: 130,
    gap: 4,
    alignItems: "flex-start",
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 13,
  },
  problemWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  problem: {
    maxWidth: 460,
    alignItems: "center",
    gap: 10,
    padding: 28,
    borderWidth: 1,
    borderRadius: 14,
  },
  problemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  problemTitle: {
    fontSize: 18,
    fontFamily: fonts.semibold,
  },
  code: {
    fontFamily: mono,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
