// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The week and the day views of the calendar: the hours of the days from top to bottom, with the
// events where their times are, and the all day ones (and the ones going past midnight) above them.
// Events can be dragged to another time (and day), and their lower edge to change how long they are.

import * as React from "react";
import { PanResponder, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Color from "color";

import { fonts, useTheme } from "../theme";
import { DateFormats } from "./format";
import { addDays, initials, Occurrence } from "./occurrences";

export const hourHeight = 48;
const gutterWidth = 56;
const dayMinutes = 24 * 60;
// Dragging moves events by quarters of an hour
const snapMinutes = 15;
export const mono = Platform.select({ web: "'IBM Plex Mono', ui-monospace, monospace", default: "monospace" });

export function tint(color: string, alpha: number) {
  try {
    return Color(color).alpha(alpha).rgb().string();
  } catch (e) {
    return color;
  }
}

// Whether an event is shown in the hours of a day, rather than above them
function inHours(x: Occurrence, day: Date) {
  return !x.allDay && (x.start >= day) && (x.end <= addDays(day, 1));
}

interface Placed {
  occurrence: Occurrence;
  top: number;
  height: number;
  column: number;
  columns: number;
}

// Events at the same time are next to each other: each one gets the first column that is free at its
// start, and a group of events that overlap is divided into as many columns as it needs
function placeEvents(occurrences: Occurrence[], day: Date): Placed[] {
  const sorted = [...occurrences].sort((a, b) => (a.start.getTime() - b.start.getTime()) || (b.end.getTime() - a.end.getTime()));
  const ret: Placed[] = [];
  let group: Placed[] = [];
  let columnEnds: number[] = [];
  let groupEnd = 0;
  const finishGroup = () => {
    for (const x of group) {
      x.columns = columnEnds.length;
    }
    group = [];
    columnEnds = [];
  };
  for (const occurrence of sorted) {
    const start = occurrence.start.getTime();
    const end = Math.max(occurrence.end.getTime(), start + 15 * 60 * 1000);
    if (group.length && (start >= groupEnd)) {
      finishGroup();
    }
    let column = columnEnds.findIndex((x) => x <= start);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    groupEnd = (group.length) ? Math.max(groupEnd, end) : end;
    const minutes = (occurrence.start.getTime() - day.getTime()) / 60000;
    const length = (end - start) / 60000;
    const placed = {
      occurrence,
      top: minutes / 60 * hourHeight,
      height: Math.max(Math.min(length, dayMinutes - minutes) / 60 * hourHeight, 22),
      column,
      columns: 1,
    };
    group.push(placed);
    ret.push(placed);
  }
  finishGroup();
  return ret;
}

interface EventBlockProps {
  placed: Placed;
  dayIndex: number;
  dayCount: number;
  columnWidth: number;
  selected: boolean;
  detailed: boolean;
  fmt: DateFormats;
  onPress: (x: Occurrence) => void;
  onChange?: (x: Occurrence, start: Date, end: Date) => void;
}

const snap = (minutes: number) => Math.round(minutes / snapMinutes) * snapMinutes;

// An event in the hours. Pressing it opens it, dragging it moves it, and dragging its lower edge
// changes when it ends.
function EventBlock(props: EventBlockProps) {
  const theme = useTheme();
  const { placed, fmt, detailed } = props;
  const { occurrence: x, top, height, column, columns } = placed;
  const [drag, setDrag] = React.useState<{ mode: "move" | "resize", dx: number, dy: number }>();
  const latest = React.useRef(props);
  latest.current = props;
  const canDrag = !!props.onChange && !!x.event;

  // What a drag does: the minutes it moves the event (or its end) by, and the days it moves it by.
  // Repeating events only move to another time of the same day (another day would change their rule).
  function dragResult(mode: "move" | "resize", dx: number, dy: number) {
    const { dayIndex, dayCount, columnWidth } = latest.current;
    if (mode === "move") {
      const minutes = snap(dy / hourHeight * 60);
      let days = (!x.repeats && (columnWidth > 0)) ? Math.round(dx / columnWidth) : 0;
      days = Math.max(-dayIndex, Math.min(days, dayCount - 1 - dayIndex));
      const start = new Date(x.start.getTime() + minutes * 60000);
      start.setDate(start.getDate() + days);
      return { start, end: new Date(start.getTime() + (x.end.getTime() - x.start.getTime())), minutes, days };
    }
    const end = new Date(Math.max(x.end.getTime() + snap(dy / hourHeight * 60) * 60000, x.start.getTime() + snapMinutes * 60000));
    return { start: x.start, end, minutes: (end.getTime() - x.end.getTime()) / 60000, days: 0 };
  }

  const responder = (mode: "move" | "resize") => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => setDrag({ mode, dx: 0, dy: 0 }),
    onPanResponderMove: (_e, g) => setDrag({ mode, dx: g.dx, dy: g.dy }),
    onPanResponderRelease: (_e, g) => {
      setDrag(undefined);
      if ((Math.abs(g.dx) < 4) && (Math.abs(g.dy) < 4)) {
        latest.current.onPress(x);
        return;
      }
      const result = dragResult(mode, g.dx, g.dy);
      if (canDrag && ((result.minutes !== 0) || (result.days !== 0))) {
        latest.current.onChange!(x, result.start, result.end);
      }
    },
    onPanResponderTerminate: () => setDrag(undefined),
  });
  const moveResponder = React.useMemo(() => responder("move"), [x.key, canDrag]);
  const resizeResponder = React.useMemo(() => responder("resize"), [x.key, canDrag]);

  const result = (drag && canDrag) ? dragResult(drag.mode, drag.dx, drag.dy) : undefined;
  const shownTop = top + ((result && drag!.mode === "move") ? result.minutes / 60 * hourHeight : 0);
  const shownHeight = height + ((result && drag!.mode === "resize") ? result.minutes / 60 * hourHeight : 0);
  const shiftX = (result) ? result.days * props.columnWidth : 0;
  const short = shownHeight <= 34;
  const start = result?.start ?? x.start;
  const end = result?.end ?? x.end;

  return (
    <View
      {...moveResponder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={`Event ${x.title}`}
      aria-selected={props.selected}
      testID="time-grid-event"
      style={[styles.event, {
        top: shownTop,
        height: shownHeight - 2,
        left: `${column / columns * 100}%`,
        width: `${100 / columns}%`,
        backgroundColor: tint(x.color, (theme.dark) ? 0.3 : 0.2),
        borderColor: (props.selected) ? theme.colors.accent : "transparent",
        transform: [{ translateX: shiftX }],
        zIndex: (drag) ? 5 : 1,
        opacity: (drag) ? 0.9 : 1,
      } as any, (Platform.OS === "web") ? ({ cursor: (canDrag) ? ((drag) ? "grabbing" : "grab") : "pointer", userSelect: "none" } as any) : undefined]}
    >
      <View style={[styles.eventInner, { borderLeftColor: x.color }, (short) ? { paddingVertical: 0, justifyContent: "center" } : undefined]}>
        {(short) ? (
          <Text numberOfLines={1} style={[styles.eventTitle, { color: theme.colors.text }]}>
            <Text style={[styles.mono, { color: theme.colors.textSecondary }]}>{fmt.time(start)} </Text>{x.title}
          </Text>
        ) : (
          <>
            <Text numberOfLines={(shownHeight > 60) ? 2 : 1} style={[styles.eventTitle, { color: theme.colors.text }]}>{x.title}</Text>
            <Text numberOfLines={1} style={[styles.mono, { color: theme.colors.textSecondary }]}>
              {fmt.time(start)} – {fmt.time(end)}{(!detailed && x.location) ? ` · ${x.location}` : ""}
            </Text>
            {detailed && (shownHeight > 52) && (!!x.location || (x.attendees.length > 0)) && (
              <View style={styles.eventMeta}>
                {!!x.location && (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color={theme.colors.textSecondary} />
                    <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textSecondary }}>{x.location}</Text>
                  </View>
                )}
                {(x.attendees.length > 0) && (
                  <View style={styles.metaItem}>
                    {x.attendees.slice(0, 4).map((a, idx) => (
                      <View key={idx} style={[styles.person, { backgroundColor: tint(theme.colors.background, 0.6) }]}>
                        <Text style={{ fontSize: 9, fontFamily: fonts.semibold, color: theme.colors.text }}>{initials(a.name)}</Text>
                      </View>
                    ))}
                    {(x.attendees.length > 4) && <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>+{x.attendees.length - 4}</Text>}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
      {canDrag && (
        <View
          {...resizeResponder.panHandlers}
          accessibilityLabel={`Change when ${x.title} ends`}
          testID="time-grid-resize"
          style={[styles.resize, (Platform.OS === "web") ? ({ cursor: "ns-resize" } as any) : undefined]}
        />
      )}
    </View>
  );
}

interface PropsType {
  days: Date[];
  occurrences: Occurrence[];
  fmt: DateFormats;
  // The event that is selected (its key), which is outlined
  selectedKey?: string;
  // The day view shows more of each event (the place and who comes)
  detailed?: boolean;
  onEventPress: (x: Occurrence) => void;
  // An event was dragged to another time, or its end was
  onEventChange?: (x: Occurrence, start: Date, end: Date) => void;
  // An empty hour of a day was chosen, to make an event then
  onSlotPress: (start: Date) => void;
  onDayPress?: (day: Date) => void;
  // Shown over the hours (e.g. when there's nothing on the day)
  overlay?: React.ReactNode;
}

export default function TimeGrid(props: PropsType) {
  const theme = useTheme();
  const { days, occurrences, fmt } = props;
  const scrollRef = React.useRef<ScrollView>(null);
  const [now, setNow] = React.useState(() => new Date());
  const [width, setWidth] = React.useState(0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const columnWidth = (width - gutterWidth) / days.length;

  // Starting in the morning rather than at midnight (a bit above 7:00, so that its label is shown whole)
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ y: 7 * hourHeight - 12, animated: false });
  }, []);

  // The line of the current time moves along
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const perDay = days.map((day) => {
    const next = addDays(day, 1);
    const onDay = occurrences.filter((x) => (x.start < next) && ((x.end > day) || (x.start >= day)));
    return {
      day,
      top: onDay.filter((x) => !inHours(x, day)),
      placed: placeEvents(onDay.filter((x) => inHours(x, day)), day),
    };
  });
  const weekend = (day: Date) => (day.getDay() === 0) || (day.getDay() === 6);
  const weekendColor = tint(theme.colors.text, 0.025);
  const hours = Array.from(Array(24).keys());

  return (
    <View style={{ flex: 1, paddingHorizontal: 16 }} testID="time-grid">
      {/* The days, and what's on them all day */}
      <View style={[styles.headerRow, { borderBottomColor: theme.colors.border }]}>
        <View style={{ width: gutterWidth }} />
        {perDay.map(({ day }) => {
          const isToday = day.getTime() === today.getTime();
          return (
            <TouchableRipple
              key={day.getTime()}
              accessibilityRole="button"
              accessibilityLabel={fmt.day.format(day)}
              disabled={!props.onDayPress}
              onPress={() => props.onDayPress?.(day)}
              style={[styles.column, styles.dayHeader]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Text style={[styles.weekDay, { color: theme.colors.textMuted }]}>{fmt.weekDay.format(day)}</Text>
                {(isToday) ? (
                  <View style={[styles.today, { backgroundColor: theme.colors.accent }]}>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: theme.colors.onAccent }}>{day.getDate()}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 18, fontFamily: fonts.semibold, color: theme.colors.text }}>{day.getDate()}</Text>
                )}
              </View>
            </TouchableRipple>
          );
        })}
      </View>
      <View style={[styles.headerRow, { borderBottomColor: theme.colors.border, minHeight: 34 }]}>
        <View style={{ width: gutterWidth, paddingTop: 8 }}>
          <Text style={[styles.gutterText, { color: theme.colors.textMuted }]}>all-day</Text>
        </View>
        {perDay.map(({ day, top }) => (
          <View key={day.getTime()} style={[styles.column, styles.allDayColumn, { borderLeftColor: theme.colors.divider }]}>
            {top.map((x) => (
              <TouchableRipple
                key={x.key}
                accessibilityRole="button"
                accessibilityLabel={`Event ${x.title}`}
                onPress={() => props.onEventPress(x)}
                style={[styles.allDay, { backgroundColor: tint(x.color, 0.26), borderColor: (props.selectedKey === x.key) ? theme.colors.accent : "transparent" }]}
              >
                <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: fonts.medium, color: theme.colors.text }}>
                  {(x.allDay) ? "" : `${fmt.time(x.start)} `}{x.title}
                </Text>
              </TouchableRipple>
            ))}
          </View>
        ))}
      </View>

      {/* The hours */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", height: 24 * hourHeight }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <View style={{ width: gutterWidth }}>
            {hours.slice(1).map((hour) => (
              <Text key={hour} style={[styles.gutterText, styles.hourLabel, { top: hour * hourHeight - 7, color: theme.colors.textMuted }]}>
                {fmt.time(new Date(2000, 0, 1, hour))}
              </Text>
            ))}
          </View>
          {perDay.map(({ day, placed }, dayIndex) => {
            const isToday = day.getTime() === today.getTime();
            return (
              <View key={day.getTime()} style={[styles.column, { borderLeftColor: theme.colors.divider }, (weekend(day)) ? { backgroundColor: weekendColor } : undefined]}>
                {hours.map((hour) => (
                  <TouchableRipple
                    key={hour}
                    accessibilityRole="button"
                    accessibilityLabel={`New event ${fmt.day.format(day)} ${fmt.time(new Date(2000, 0, 1, hour))}`}
                    onPress={() => props.onSlotPress(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour))}
                    style={[styles.slot, { borderTopColor: theme.colors.divider }]}
                  >
                    <View />
                  </TouchableRipple>
                ))}
                {placed.map((p) => (
                  <EventBlock
                    key={p.occurrence.key}
                    placed={p}
                    dayIndex={dayIndex}
                    dayCount={days.length}
                    columnWidth={columnWidth}
                    selected={props.selectedKey === p.occurrence.key}
                    detailed={!!props.detailed}
                    fmt={fmt}
                    onPress={props.onEventPress}
                    onChange={props.onEventChange}
                  />
                ))}
                {isToday && (
                  <View
                    pointerEvents="none"
                    testID="now-line"
                    style={[styles.now, { top: (now.getHours() * 60 + now.getMinutes()) / 60 * hourHeight }]}
                  >
                    <View style={styles.nowDot} />
                  </View>
                )}
              </View>
            );
          })}
          {props.overlay}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  column: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "transparent",
  },
  dayHeader: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  weekDay: {
    fontSize: 12,
    fontFamily: fonts.medium,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  today: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  allDayColumn: {
    paddingVertical: 5,
    paddingHorizontal: 3,
    gap: 3,
  },
  allDay: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    height: 22,
    justifyContent: "center",
  },
  gutterText: {
    fontSize: 11,
    textAlign: "right",
    paddingRight: 8,
    fontFamily: mono,
  },
  hourLabel: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  slot: {
    height: hourHeight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  event: {
    position: "absolute",
    borderRadius: 6,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  eventInner: {
    flex: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  eventTitle: {
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  mono: {
    fontSize: 11,
    fontFamily: mono,
  },
  eventMeta: {
    marginTop: 3,
    gap: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  person: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  // The lower edge of an event, to drag
  resize: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 7,
  },
  now: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    zIndex: 6,
    backgroundColor: "#F06A6A",
  },
  nowDot: {
    position: "absolute",
    left: -5,
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F06A6A",
  },
});
