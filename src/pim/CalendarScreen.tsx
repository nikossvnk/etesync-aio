// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { IconButton, Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import * as ICAL from "ical.js";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import LoadingIndicator from "../widgets/LoadingIndicator";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import { StoreState } from "../store";
import { pushMessage, setSettings } from "../store/actions";
import { TaskType } from "./pim-types";
import { savePimItem, usePimItems } from "./data";
import { AccentButton, EmptyState, repeatKeyOf, toDateString } from "./widgets";
import { bumpSequence, changeOccurrence, occurrenceId, updateSeries } from "./recurrence";
import { useDateFormats } from "./format";
import { RepeatChoiceDialog, useDialogs } from "./Dialogs";
import TimeGrid, { mono, tint } from "./TimeGrid";
import { addDays, dayCount, isBar, layoutBars, Occurrence, onDay, sameDay, startOfDay, useOccurrences } from "./occurrences";
import { Agenda, DayPanel, EventDetails, MiniMonth, panelStyle, SmallButton, SpanBar, TasksDue } from "./CalendarParts";
import { setTaskDone } from "./TasksScreen";

type CalendarView = "month" | "week" | "day" | "agenda";
const views: { key: CalendarView, label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "agenda", label: "Agenda" },
];

// The weeks shown for a month, starting on the day the setting says (0 is Sunday)
function monthGrid(month: Date, weekStart: number) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() - weekStart + 7) % 7));
  const days: Date[] = [];
  for (let i = 0 ; i < 42 ; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

export default function CalendarScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const dialogs = useDialogs();
  const dispatch = useDispatch();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const width = useWindowDimensions().width;
  const wide = width >= 1100;
  const fmt = useDateFormats();
  const view = useSelector((state: StoreState) => state.settings.calendarView) ?? "month";
  const showRepeating = useSelector((state: StoreState) => state.settings.showRepeating) ?? false;
  const today = startOfDay(new Date());
  const [month, setMonth] = React.useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = React.useState(today);
  // The event chosen in the week view, whose details are shown next to it
  const [selectedKey, setSelectedKey] = React.useState<string>();
  // A time of a repeating event that was dragged, while it's asked whether only that time moves
  const [moved, setMoved] = React.useState<{ x: Occurrence, start: Date, end: Date }>();
  // The width of the month's weeks, to put the bars of the events of several days over their days
  const [rowWidth, setRowWidth] = React.useState(0);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);

  // The days the view shows
  const days = React.useMemo(() => {
    if (view === "week") {
      const start = addDays(selected, -((selected.getDay() - fmt.weekStart + 7) % 7));
      return [0, 1, 2, 3, 4, 5, 6].map((x) => addDays(start, x));
    } else if (view === "day") {
      return [selected];
    }
    return monthGrid(month, fmt.weekStart);
  }, [view, month, selected, fmt]);
  const miniDays = React.useMemo(() => monthGrid(selected, fmt.weekStart), [selected, fmt]);

  // The events of all that is shown: the month (or the small one), what's coming up after the chosen
  // day, and the four weeks of the agenda
  const from = new Date(Math.min(days[0].getTime(), miniDays[0].getTime(), today.getTime()));
  const to = new Date(Math.max(addDays(days[days.length - 1], 1).getTime(), addDays(miniDays[41], 1).getTime(),
    addDays(today, 29).getTime(), addDays(selected, 60).getTime()));
  const { occurrences, calendars } = useOccurrences(from, to);

  if (syncGate) {
    return syncGate;
  }
  if (!occurrences) {
    return <LoadingIndicator />;
  }
  if (calendars.length === 0) {
    return (
      <EmptyState
        icon="calendar-blank-outline"
        title="No calendars yet"
        text="Create a calendar to add events to it."
        action={<AccentButton icon="plus" label="New calendar" onPress={() => dialogs.newCollection("calendar")} />}
      />
    );
  }

  // Goes to the chosen day, and its month (so that the month view shows it when it's chosen)
  function select(day: Date) {
    setSelected(day);
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  function move(by: number) {
    if (view === "month") {
      setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
    } else {
      select(addDays(selected, by * ((view === "week") ? 7 : 1)));
    }
  }

  function setView(calendarView: CalendarView) {
    dispatch(setSettings({ calendarView }) as any);
  }

  function newEvent(date?: Date, hour?: number) {
    navigation.navigate("EventEdit", {
      date: toDateString(date ?? selected),
      ...((hour !== undefined) ? { time: `${String(hour).padStart(2, "0")}:00` } : {}),
    });
  }

  // Events open in their editor (a repeating one at the time that was chosen), birthdays open their
  // contact
  function open(x: Occurrence) {
    if (x.event) {
      navigation.navigate("EventEdit", { colUid: x.event.collectionUid, itemUid: x.event.itemUid, ...((x.recurrenceId) ? { occurrence: occurrenceId(x.recurrenceId) } : {}) });
    } else if (x.contact) {
      navigation.navigate("Contact", { colUid: x.contact.collectionUid, itemUid: x.contact.itemUid });
    }
  }

  // An event was dragged to another time: its start and end move by as much. For a repeating event
  // it's asked whether only that time moves, or all of them.
  function changeTime(x: Occurrence, start: Date, end: Date) {
    if (x.repeats && x.recurrenceId) {
      setMoved({ x, start, end });
    } else {
      moveEvent(x, start, end, "all");
    }
  }

  async function moveEvent(x: Occurrence, start: Date, end: Date, which: "this" | "all") {
    setMoved(undefined);
    const event = x.event!.clone();
    const shift = (before: Date, after: Date, time: ICAL.Time) => {
      const ret = time.clone();
      ret.addDuration(ICAL.Duration.fromSeconds(Math.round((after.getTime() - before.getTime()) / 1000)));
      return ret;
    };
    if (which === "this") {
      changeOccurrence(event, x.recurrenceId!, (changed) => {
        const newStart = shift(x.start, start, changed.startDate);
        const newEnd = shift(x.end, end, changed.endDate ?? changed.startDate);
        changed.startDate = newStart;
        changed.endDate = newEnd;
      });
    } else {
      const newStart = shift(x.start, start, event.startDate);
      const newEnd = shift(x.end, end, event.endDate ?? event.startDate);
      event.startDate = newStart;
      event.endDate = newEnd;
      // (its cancelled and changed times move with it)
      updateSeries(event, x.event!);
      bumpSequence(event.component);
    }
    event.component.updatePropertyWithValue("last-modified", ICAL.Time.now());
    await savePimItem(etebase, event.collectionUid!, event);
    setSelectedKey(undefined);
    const when = `${(sameDay(start, x.start)) ? "" : fmt.day.format(start) + ", "}${fmt.time(start)} – ${fmt.time(end)}`;
    dispatch(pushMessage({
      message: (x.repeats && (which === "all")) ? `All times of “${x.title}” were moved to ${(sameDay(start, x.start)) ? "" : "another day, "}${fmt.time(start)} – ${fmt.time(end)}` : `“${x.title}” moved to ${when}`,
      severity: "success",
    }) as any);
  }

  // The dialog that asks which times of a repeating event move. All of them can't move to another day
  // when the rule says on which days it is (e.g. every week on Monday and Wednesday).
  const moveDialog = (moved) && (
    <RepeatChoiceDialog
      title="Move a repeating event"
      message={`“${moved.x.title}” repeats. Move only this time, or all of its times?`}
      onlyThis={(!sameDay(moved.start, moved.x.start) && (repeatKeyOf(moved.x.event!.rrule) === "custom")) ?
        "Its other times can't be moved to another day, because of the days it repeats on." : undefined}
      onChoose={(which) => moveEvent(moved.x, moved.start, moved.end, which)}
      onClose={() => setMoved(undefined)}
    />
  );

  const muted = (text: string | number, size?: number) => (
    <Text style={[styles.titleMuted, { color: theme.colors.textMuted }, (size) ? { fontSize: size } : undefined]}>{text}</Text>
  );
  let title: React.ReactNode;
  if (view === "agenda") {
    title = <>Agenda {muted("from today · next 4 weeks", 15)}</>;
  } else if (view === "day") {
    title = <>{fmt.weekDayLong.format(selected)} {fmt.dayMonth.format(selected)} {muted(selected.getFullYear())}</>;
  } else if (view === "week") {
    const first = days[0];
    const last = days[6];
    const range = (first.getMonth() === last.getMonth()) ? `${first.getDate()} – ${fmt.dayMonth.format(last)}` : `${fmt.dayMonth.format(first)} – ${fmt.dayMonth.format(last)}`;
    title = <>{range} {muted(last.getFullYear())}</>;
  } else {
    title = <>{fmt.monthName.format(month)} {muted(month.getFullYear())}</>;
  }

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      {(view !== "agenda") && (
        <View style={{ flexDirection: "row" }}>
          <IconButton icon="chevron-left" accessibilityLabel={`Previous ${view}`} iconColor={theme.colors.textSecondary} containerColor="transparent" onPress={() => move(-1)} style={styles.smallButton} />
          <IconButton icon="chevron-right" accessibilityLabel={`Next ${view}`} iconColor={theme.colors.textSecondary} containerColor="transparent" onPress={() => move(1)} style={styles.smallButton} />
        </View>
      )}
      <Text style={[styles.title, { color: theme.colors.text }]} testID="calendar-month" numberOfLines={1}>{title}</Text>
      {(view !== "agenda") && (
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel="Today"
          onPress={() => select(today)}
          style={[styles.todayButton, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text, fontSize: 13 }}>Today</Text>
        </TouchableRipple>
      )}
      <View style={{ flex: 1 }} />
      {(view === "agenda") && (
        <TouchableRipple
          accessibilityRole="checkbox"
          accessibilityLabel="Show repeating events"
          accessibilityState={{ checked: showRepeating }}
          aria-checked={showRepeating}
          onPress={() => dispatch(setSettings({ showRepeating: !showRepeating }) as any)}
          style={styles.check}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name={(showRepeating) ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={(showRepeating) ? theme.colors.accent : theme.colors.textMuted} />
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Show repeating events</Text>
          </View>
        </TouchableRipple>
      )}
      <View style={[styles.switch, { borderColor: theme.colors.border, backgroundColor: theme.colors.sidebar }]}>
        {views.map((x) => (
          <TouchableRipple
            key={x.key}
            accessibilityRole="button"
            accessibilityLabel={`${x.label} view`}
            accessibilityState={{ selected: view === x.key }}
            aria-selected={view === x.key}
            onPress={() => setView(x.key)}
            style={[styles.switchItem, (view === x.key) ? { backgroundColor: theme.colors.field } : undefined]}
          >
            <Text style={{ fontSize: 13, fontFamily: (view === x.key) ? fonts.medium : fonts.regular, color: (view === x.key) ? theme.colors.text : theme.colors.textMuted }}>
              {x.label}
            </Text>
          </TouchableRipple>
        ))}
      </View>
      <AccentButton icon="plus" label="New event" onPress={() => newEvent()} />
    </View>
  );

  const side = (content: React.ReactNode, testID?: string) => (
    <ScrollView
      testID={testID}
      style={[(wide) ? { width: 340, flexGrow: 0 } : undefined, (wide) ? panelStyle(theme) : undefined]}
      contentContainerStyle={{ padding: 20, gap: 22 }}
    >
      {content}
    </ScrollView>
  );

  if (view === "agenda") {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <ScrollView style={{ flex: 1 }}>
          <Agenda from={today} occurrences={occurrences} fmt={fmt} showRepeating={showRepeating} onEventPress={open} />
        </ScrollView>
      </View>
    );
  }

  if (view === "week" || view === "day") {
    const selectedOccurrence = occurrences.find((x) => x.key === selectedKey);
    const dayEvents = (view === "day") ? onDay(occurrences, selected) : [];
    const dueTasks = (tasks ?? []).filter((t) => t.dueDate && sameDay(t.dueDate.toJSDate(), selected));
    const grid = (
      <TimeGrid
        days={days}
        occurrences={occurrences}
        fmt={fmt}
        detailed={view === "day"}
        selectedKey={(view === "week" && wide) ? selectedKey : undefined}
        onEventPress={(x) => {
          if (view === "week" && wide) {
            setSelectedKey(x.key);
          } else {
            open(x);
          }
        }}
        onEventChange={changeTime}
        onSlotPress={(start) => newEvent(start, start.getHours())}
        onDayPress={(view === "week") ? (day) => {
          select(day);
          setView("day");
        } : undefined}
        overlay={(view === "day" && dayEvents.length === 0) ? (
          <View style={[styles.free, { borderColor: theme.colors.border, backgroundColor: theme.colors.background, top: 9 * 48 }]}>
            <Text style={{ color: theme.colors.textMuted, flex: 1 }}>Nothing scheduled — a free day.</Text>
            <SmallButton label="Add event" onPress={() => newEvent()} />
          </View>
        ) : undefined}
      />
    );
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ flex: 1, flexDirection: (wide) ? "row" : "column" }}>
          <View style={{ flex: 1, minHeight: (wide) ? undefined : 480, paddingTop: 4 }}>{grid}</View>
          {wide && (view === "week") && side(
            <EventDetails x={selectedOccurrence} fmt={fmt} onEdit={open} onOpenContact={open}
              onHistory={(x) => navigation.navigate("ItemHistory", { colUid: x.event!.collectionUid, itemUid: x.event!.itemUid })} />,
            "event-panel"
          )}
          {moveDialog}
          {wide && (view === "day") && side(
            <>
              <MiniMonth selected={selected} days={miniDays} occurrences={occurrences} fmt={fmt} onPick={select} />
              <TasksDue tasks={dueTasks} fmt={fmt} onToggle={(t) => setTaskDone(etebase, t, !t.finished)} onOpenTasks={() => navigation.navigate("Tasks")} />
            </>,
            "day-side"
          )}
        </View>
      </View>
    );
  }

  // The month
  const multiDay = occurrences.filter((x) => isBar(x) && (dayCount(x) > 1));
  const barHeight = (wide) ? 20 : 6;
  const barGap = 3;
  // Where the bars start: below the number of the day (the day's border, padding and number)
  const barsTop = 1.5 + 6 + 26 + barGap;
  const weekendColor = tint(theme.colors.text, (theme.dark) ? 0.012 : 0.02);
  const dayColor = tint(theme.colors.text, (theme.dark) ? 0.04 : 0.035);
  const panel = (
    <DayPanel
      day={selected}
      occurrences={occurrences}
      fmt={fmt}
      onEventPress={open}
      onAdd={() => newEvent()}
      onDayPress={select}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ flex: 1, flexDirection: (wide) ? "row" : "column" }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.grid}>
          <View style={styles.week}>
            {days.slice(0, 7).map((x) => (
              <Text key={x.getDay()} style={[styles.weekDay, { color: theme.colors.textMuted }]}>{fmt.weekDay.format(x)}</Text>
            ))}
          </View>
          {[0, 1, 2, 3, 4, 5].map((week) => {
            const rowDays = days.slice(week * 7, week * 7 + 7);
            // Events of several days are bars over them, on lines of their own; the days give them room
            const { bars, lanes } = layoutBars(rowDays, multiDay);
            const cellWidth = (rowWidth - 6 * cellGap) / 7;
            const step = barHeight + barGap;
            return (
              <View key={week} style={styles.week} onLayout={(week === 0) ? (e) => setRowWidth(e.nativeEvent.layout.width) : undefined}>
                {rowDays.map((day) => {
                  const dayEvents = onDay(occurrences, day);
                  const own = dayEvents.filter((x) => !multiDay.includes(x));
                  const inMonth = day.getMonth() === month.getMonth();
                  const weekend = (day.getDay() === 0) || (day.getDay() === 6);
                  const isSelected = day.getTime() === selected.getTime();
                  const isToday = day.getTime() === today.getTime();
                  // (the bars take the place of some of the day's own events)
                  const max = Math.max(0, 3 - lanes);
                  return (
                    <TouchableRipple
                      key={day.getTime()}
                      accessibilityRole="button"
                      accessibilityLabel={`${fmt.day.format(day)}, ${dayEvents.length} events`}
                      aria-selected={isSelected}
                      onPress={() => setSelected(day)}
                      onLongPress={() => {
                        select(day);
                        setView("day");
                      }}
                      style={[styles.day, { minHeight: (wide) ? 116 : 72, backgroundColor: (inMonth) ? ((weekend) ? weekendColor : dayColor) : "transparent",
                        borderColor: (isSelected) ? theme.colors.accent : "transparent" }]}
                    >
                      <View style={{ gap: barGap }}>
                        {(isToday) ? (
                          <View style={[styles.todayNumber, { backgroundColor: theme.colors.accent }]}>
                            <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: theme.colors.onAccent }}>{day.getDate()}</Text>
                          </View>
                        ) : (
                          <Text style={[styles.dayNumber, { color: (inMonth) ? theme.colors.textSecondary : theme.colors.disabled }]}>{day.getDate()}</Text>
                        )}
                        {(lanes > 0) && <View style={{ height: lanes * step - barGap }} />}
                        {(!wide) && (
                          <View style={styles.dots}>
                            {own.slice(0, 5).map((x) => (
                              <View key={x.key} style={[styles.eventDot, { backgroundColor: x.color, opacity: (inMonth) ? 1 : 0.55 }]} />
                            ))}
                          </View>
                        )}
                        {(wide) && own.slice(0, max).map((x) => {
                          if (x.allDay) {
                            return (
                              <View key={x.key} style={[styles.bar, { backgroundColor: tint(x.color, 0.26), borderRadius: 6, opacity: (inMonth) ? 1 : 0.55 }]}>
                                <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: fonts.medium, color: theme.colors.text }}>{x.title}</Text>
                              </View>
                            );
                          }
                          return (
                            <View key={x.key} style={[styles.timed, { opacity: (inMonth) ? 1 : 0.55 }]}>
                              <View style={[styles.eventDot, { backgroundColor: x.color }]} />
                              <Text style={[styles.mono, { color: theme.colors.textMuted }]}>{fmt.time(x.start)}</Text>
                              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: theme.colors.textBody }}>{x.title}</Text>
                            </View>
                          );
                        })}
                        {(wide) && (own.length > max) && (
                          <Text style={{ fontSize: 12, color: theme.colors.textMuted, paddingLeft: 4 }}>+{own.length - max} more</Text>
                        )}
                      </View>
                    </TouchableRipple>
                  );
                })}
                {(rowWidth > 0) && bars.map((bar) => {
                  const left = bar.first * (cellWidth + cellGap) + ((bar.before) ? 0 : 6);
                  const right = bar.last * (cellWidth + cellGap) + cellWidth - ((bar.after) ? 0 : 6);
                  const selectedHere = (selected >= rowDays[bar.first]) && (selected <= rowDays[bar.last]) &&
                    (selected >= startOfDay(bar.occurrence.start)) && (selected < bar.occurrence.end);
                  return (
                    <View key={bar.occurrence.key} style={{ position: "absolute", top: barsTop + bar.lane * step, left, width: right - left }}>
                      <SpanBar
                        bar={bar}
                        height={barHeight}
                        compact={!wide}
                        selected={selectedHere}
                        // (choosing one chooses its first day in the week)
                        onPress={() => setSelected(rowDays[bar.first])}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
          {!wide && <View style={{ marginTop: 16 }}>{panel}</View>}
        </ScrollView>
        {wide && side(panel)}
      </View>
    </View>
  );
}

const cellGap = 4;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  smallButton: {
    margin: 0,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.2,
  },
  titleMuted: {
    fontFamily: fonts.regular,
  },
  todayButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 32,
    justifyContent: "center",
  },
  check: {
    height: 36,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRadius: 8,
  },
  switch: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  switchItem: {
    paddingHorizontal: 12,
    height: 30,
    justifyContent: "center",
    borderRadius: 7,
  },
  grid: {
    padding: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  week: {
    flexDirection: "row",
    gap: cellGap,
  },
  weekDay: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.medium,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  day: {
    flex: 1,
    minWidth: 0,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  todayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  dayNumber: {
    height: 24,
    paddingLeft: 4,
    fontSize: 13,
    fontFamily: fonts.medium,
    lineHeight: 24,
    marginBottom: 2,
  },
  bar: {
    height: 20,
    paddingHorizontal: 7,
    justifyContent: "center",
  },
  timed: {
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  dots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    paddingLeft: 4,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mono: {
    fontSize: 11,
    fontFamily: mono,
  },
  free: {
    position: "absolute",
    left: 80,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
  },
});
