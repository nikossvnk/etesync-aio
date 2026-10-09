// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The parts of the calendar next to (or under) its views: the details of an event, the events of a
// day and what's coming up, a small month, the tasks of a day, and the agenda

import * as React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { fonts, useTheme } from "../theme";
import { DateFormats } from "./format";
import { addDays, Bar, dayCount, dayOf, initials, Occurrence, onDay, startOfDay } from "./occurrences";
import { TaskType } from "./pim-types";
import { mono, tint } from "./style";

// When an event is, e.g. "10:00 – 11:00", "All day", "All day · 4 days", or on one of its days "All
// day · day 2 of 4"
export function formatRange(x: Occurrence, fmt: DateFormats, day?: Date) {
  const days = dayCount(x);
  if (x.allDay) {
    if (days === 1) {
      return "All day";
    }
    return (day) ? `All day · day ${dayOf(x, day)} of ${days}` : `All day · ${days} days`;
  }
  const range = `${fmt.time(x.start)} – ${fmt.time(x.end)}`;
  return (day && (days > 1)) ? `${range} · day ${dayOf(x, day)} of ${days}` : range;
}

function Label(props: { children: React.ReactNode, color?: string }) {
  const theme = useTheme();
  return <Text style={[styles.label, { color: props.color ?? theme.colors.textMuted }]}>{props.children}</Text>;
}

function People(props: { x: Occurrence, size?: number }) {
  const theme = useTheme();
  const size = props.size ?? 26;
  if (props.x.attendees.length === 0) {
    return null;
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel={`With ${props.x.attendees.map((a) => a.name).join(", ")}`}>
      {props.x.attendees.slice(0, 4).map((a, idx) => (
        <View key={idx} style={[styles.person, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.field }]}>
          <Text style={{ fontSize: 10, fontFamily: fonts.semibold, color: theme.colors.textSecondary }}>{initials(a.name)}</Text>
        </View>
      ))}
      {(props.x.attendees.length > 4) && <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>+{props.x.attendees.length - 4}</Text>}
    </View>
  );
}

function Place(props: { location: string }) {
  const theme = useTheme();
  return (
    <View style={styles.iconRow}>
      <MaterialCommunityIcons name="map-marker-outline" size={14} color={theme.colors.textSecondary} />
      <Text style={{ fontSize: 13, color: theme.colors.textSecondary, flexShrink: 1 }}>{props.location}</Text>
    </View>
  );
}

// An event as a card, in the list of the events of a day
export function EventCard(props: { x: Occurrence, fmt: DateFormats, onPress: (x: Occurrence) => void, day?: Date }) {
  const theme = useTheme();
  const { x, fmt } = props;
  return (
    <TouchableRipple
      accessibilityRole="button"
      accessibilityLabel={`Event ${x.title}`}
      onPress={() => props.onPress(x)}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <View style={{ gap: 6 }}>
        <View style={styles.iconRow}>
          <View style={[styles.dot, { backgroundColor: x.color }]} />
          <Text style={[styles.mono, { color: theme.colors.textMuted }]}>{formatRange(x, fmt, props.day)}{(x.repeats && x.event) ? " · repeats" : ""}</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }} numberOfLines={1}>{x.calendarName}</Text>
        </View>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{x.title}</Text>
        {!!x.location && <Place location={x.location} />}
        <People x={x} />
      </View>
    </TouchableRipple>
  );
}

// The events of the chosen day of the month, and the next ones after it
export function DayPanel(props: { day: Date, occurrences: Occurrence[], fmt: DateFormats, onEventPress: (x: Occurrence) => void, onAdd: () => void, onDayPress: (day: Date) => void }) {
  const theme = useTheme();
  const { day, fmt } = props;
  const events = onDay(props.occurrences, day);
  const isToday = startOfDay(new Date()).getTime() === day.getTime();
  // What's coming up after the day (repeating events would fill the list)
  const upcoming = props.occurrences
    .filter((x) => (x.start >= addDays(day, 1)) && !(x.repeats && x.event))
    .sort((a, b) => (startOfDay(a.start).getTime() - startOfDay(b.start).getTime()) || (Number(b.allDay) - Number(a.allDay)) || (a.start.getTime() - b.start.getTime()))
    .slice(0, 4);
  return (
    <View style={{ gap: 16 }} testID="day-panel">
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View>
          <Label color={theme.colors.accentText}>{(isToday) ? "Today · " : ""}{fmt.weekDayLong.format(day)}</Label>
          <Text style={[styles.bigDate, { color: theme.colors.text }]} testID="agenda-title">{fmt.dayMonth.format(day)}</Text>
        </View>
        <Text style={{ fontSize: 13, color: theme.colors.textMuted, paddingBottom: 4 }}>{(events.length === 1) ? "1 event" : `${events.length} events`}</Text>
      </View>
      {(events.length === 0) ? (
        <View style={[styles.emptyBox, { borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.textSecondary }}>Nothing scheduled</Text>
          <SmallButton label="Add event" onPress={props.onAdd} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {events.map((x) => <EventCard key={x.key} x={x} fmt={fmt} day={day} onPress={props.onEventPress} />)}
        </View>
      )}
      {(upcoming.length > 0) && (
        <>
          <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
          <View style={{ gap: 2 }}>
            <Label>Coming up</Label>
            {upcoming.map((x) => (
              <TouchableRipple
                key={x.key}
                accessibilityRole="button"
                accessibilityLabel={`Coming up: ${x.title}`}
                onPress={() => props.onDayPress(startOfDay(x.start))}
                style={styles.upcoming}
              >
                <View style={styles.upcomingInner}>
                  <View style={{ width: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: "uppercase" }}>{fmt.weekDay.format(x.start)}</Text>
                    <Text style={{ fontSize: 17, fontFamily: fonts.semibold, color: theme.colors.text }}>{x.start.getDate()}</Text>
                  </View>
                  <View style={[styles.bar, { backgroundColor: x.color }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.medium, color: theme.colors.text }}>{x.title}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{formatRange(x, fmt)}</Text>
                  </View>
                </View>
              </TouchableRipple>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export function SmallButton(props: { label: string, onPress: () => void, icon?: string }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[styles.smallButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.iconRow}>
        {props.icon && <MaterialCommunityIcons name={props.icon as any} size={15} color={theme.colors.text} />}
        <Text style={{ fontSize: 13, color: theme.colors.text }}>{props.label}</Text>
      </View>
    </TouchableRipple>
  );
}

// The details of the event chosen in the week view
export function EventDetails(props: { x?: Occurrence, fmt: DateFormats, onEdit: (x: Occurrence) => void, onOpenContact: (x: Occurrence) => void }) {
  const theme = useTheme();
  const { x, fmt } = props;
  if (!x) {
    return <Text style={{ color: theme.colors.textMuted }}>Select an event to see its details.</Text>;
  }
  const description = x.event?.description;
  return (
    <View style={{ gap: 14 }} testID="event-details">
      <View style={styles.iconRow}>
        <View style={[styles.dot, { backgroundColor: x.color }]} />
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{x.calendarName}</Text>
      </View>
      <Text style={[styles.detailsTitle, { color: theme.colors.text }]}>{x.title}</Text>
      <View>
        <Text style={{ color: theme.colors.textSecondary }}>{formatDays(x, fmt)}</Text>
        <Text style={[styles.mono, { fontSize: 13, color: theme.colors.textSecondary }]}>{formatRange(x, fmt)}</Text>
        {x.repeats && x.event && <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>Repeats</Text>}
      </View>
      {!!x.location && <Place location={x.location} />}
      {(x.attendees.length > 0) && (
        <View style={{ gap: 6 }}>
          <People x={x} size={28} />
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{x.attendees.map((a) => a.name).join(", ")}</Text>
        </View>
      )}
      {!!description && <Text style={{ fontSize: 13, color: theme.colors.textBody }}>{description}</Text>}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        {(x.event) ? (
          <SmallButton label="Edit" icon="pencil-outline" onPress={() => props.onEdit(x)} />
        ) : (
          <SmallButton label="Open contact" icon="account-outline" onPress={() => props.onOpenContact(x)} />
        )}
      </View>
    </View>
  );
}

// A small month, to go to another day; days with events have a dot
export function MiniMonth(props: { selected: Date, days: Date[], occurrences: Occurrence[], fmt: DateFormats, onPick: (day: Date) => void }) {
  const theme = useTheme();
  const { selected, fmt } = props;
  const today = startOfDay(new Date());
  return (
    <View style={{ gap: 6 }} testID="mini-month">
      <Text style={{ fontFamily: fonts.semibold, color: theme.colors.text, paddingHorizontal: 4 }}>
        {fmt.monthName.format(selected)} {selected.getFullYear()}
      </Text>
      <View style={styles.miniRow}>
        {props.days.slice(0, 7).map((d) => (
          <Text key={d.getTime()} style={[styles.miniCell, { fontSize: 11, color: theme.colors.textMuted, height: 18 }]}>{fmt.weekDay.format(d).slice(0, 2)}</Text>
        ))}
      </View>
      {[0, 1, 2, 3, 4, 5].map((w) => (
        <View key={w} style={styles.miniRow}>
          {props.days.slice(w * 7, w * 7 + 7).map((d) => {
            const isSelected = d.getTime() === selected.getTime();
            const isToday = d.getTime() === today.getTime();
            const inMonth = d.getMonth() === selected.getMonth();
            const has = onDay(props.occurrences, d).length > 0;
            return (
              <TouchableRipple
                key={d.getTime()}
                accessibilityRole="button"
                accessibilityLabel={fmt.day.format(d)}
                aria-selected={isSelected}
                onPress={() => props.onPick(d)}
                style={[styles.miniCell, styles.miniDay, (isSelected) ? { backgroundColor: theme.colors.accent } : (isToday) ? { borderWidth: 1, borderColor: theme.colors.accent } : undefined]}
              >
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontFamily: (isSelected || isToday) ? fonts.semibold : fonts.regular,
                    color: (isSelected) ? theme.colors.onAccent : (inMonth) ? theme.colors.text : theme.colors.disabled }}>
                    {d.getDate()}
                  </Text>
                  <View style={[styles.miniDot, { backgroundColor: (has) ? ((isSelected) ? theme.colors.onAccent : theme.colors.textMuted) : "transparent" }]} />
                </View>
              </TouchableRipple>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// The tasks due on a day, which can be ticked off here
export function TasksDue(props: { tasks: TaskType[], fmt: DateFormats, onToggle: (task: TaskType) => void, onOpenTasks: () => void }) {
  const theme = useTheme();
  const { fmt } = props;
  return (
    <View style={{ gap: 4 }} testID="tasks-due">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 4 }}>
        <Label>Tasks due</Label>
        <Text accessibilityRole="link" onPress={props.onOpenTasks} style={{ fontSize: 12, color: theme.colors.accentText }}>Open Tasks</Text>
      </View>
      {props.tasks.map((t) => (
        <View key={`${t.collectionUid}/${t.itemUid}`} style={styles.taskRow}>
          <TouchableRipple
            borderless
            accessibilityRole="checkbox"
            accessibilityLabel={`Done: ${t.title}`}
            accessibilityState={{ checked: t.finished }}
            aria-checked={t.finished}
            onPress={() => props.onToggle(t)}
            style={{ borderRadius: 4, padding: 2 }}
          >
            <MaterialCommunityIcons name={(t.finished) ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={(t.finished) ? theme.colors.success : theme.colors.textMuted} />
          </TouchableRipple>
          <Text numberOfLines={1} style={{ flex: 1, color: (t.finished) ? theme.colors.textMuted : theme.colors.text,
            textDecorationLine: (t.finished) ? "line-through" : "none" }}>{t.title}</Text>
          {(t.dueDate && !t.dueDate.isDate) && (
            <Text style={{ fontSize: 12, color: (t.overdue && !t.finished) ? theme.colors.error : theme.colors.textMuted }}>{fmt.time(t.dueDate.toJSDate())}</Text>
          )}
        </View>
      ))}
      {(props.tasks.length === 0) && <Text style={{ paddingHorizontal: 6, fontSize: 13, color: theme.colors.textMuted }}>No tasks due this day.</Text>}
    </View>
  );
}

// The next four weeks, day by day (the days with nothing on are left out)
export function Agenda(props: { from: Date, occurrences: Occurrence[], fmt: DateFormats, showRepeating: boolean, onEventPress: (x: Occurrence) => void }) {
  const theme = useTheme();
  // On phones the time is above the event, rather than in a column of its own
  const narrow = useWindowDimensions().width < 700;
  const { fmt } = props;
  const now = new Date();
  const until = addDays(props.from, 28);
  const shown = props.occurrences.filter((x) => props.showRepeating || !(x.repeats && x.event));
  // The next event: the first one that hasn't ended yet
  const next = shown.find((x) => !x.allDay && (x.end > now));
  const days: { day: Date, events: Occurrence[] }[] = [];
  for (let day = props.from ; day < until ; day = addDays(day, 1)) {
    const events = onDay(shown, day);
    if (events.length > 0) {
      days.push({ day, events });
    }
  }
  return (
    <View style={[styles.agenda, (narrow) ? { paddingHorizontal: 16 } : undefined]} testID="agenda">
      {days.map(({ day, events }, idx) => {
        const offset = Math.round((day.getTime() - startOfDay(now).getTime()) / (24 * 3600 * 1000));
        const tag = (offset === 0) ? "Today" : (offset === 1) ? "Tomorrow" : "";
        return (
          <View key={day.getTime()} style={[styles.agendaDay, (narrow) ? { gap: 12 } : undefined, (idx > 0) ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border } : undefined]}>
            <View style={{ width: (narrow) ? 68 : 84 }}>
              {(offset === 0) ? (
                <View style={[styles.agendaToday, { backgroundColor: theme.colors.accent }]}>
                  <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: theme.colors.onAccent }}>{day.getDate()}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 26, fontFamily: fonts.semibold, lineHeight: 40, color: theme.colors.text }}>{day.getDate()}</Text>
              )}
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{fmt.weekDay.format(day)} · {fmt.monthShort.format(day)}</Text>
              {!!tag && <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: (offset === 0) ? theme.colors.accentText : theme.colors.textMuted }}>{tag}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              {events.map((x) => {
                const isNext = x === next;
                const span = Math.round((x.end.getTime() - x.start.getTime()) / (24 * 3600 * 1000));
                const dayOf = Math.round((day.getTime() - startOfDay(x.start).getTime()) / (24 * 3600 * 1000)) + 1;
                return (
                  <TouchableRipple
                    key={x.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Event ${x.title}`}
                    onPress={() => props.onEventPress(x)}
                    style={[styles.agendaEvent, (isNext) ? { backgroundColor: theme.colors.accentTint } : undefined]}
                  >
                    <View style={{ flexDirection: (narrow) ? "column" : "row", alignItems: "flex-start", gap: (narrow) ? 2 : 14 }}>
                      <Text style={[styles.mono, { width: (narrow) ? undefined : 116, fontSize: 12, paddingTop: 2, color: theme.colors.textSecondary }]}>
                        {(x.allDay) ? ((span > 1) ? `Day ${dayOf} of ${span}` : "All day") : `${fmt.time(x.start)} – ${fmt.time(x.end)}`}
                      </Text>
                      {!narrow && <View style={[styles.agendaDot, { backgroundColor: x.color }]} />}
                      <View style={{ flex: (narrow) ? undefined : 1, minWidth: 0, gap: 3, alignSelf: "stretch" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          {narrow && <View style={[styles.agendaDot, { backgroundColor: x.color, marginTop: 0 }]} />}
                          <Text style={{ flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: theme.colors.text }}>{x.title}</Text>
                        </View>
                        {(!!x.location || (x.attendees.length > 0)) && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                            {!!x.location && <Place location={x.location} />}
                            {(x.attendees.length > 0) && (
                              <View style={styles.iconRow}>
                                <MaterialCommunityIcons name="account-multiple-outline" size={14} color={theme.colors.textSecondary} />
                                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{x.attendees.map((a) => a.name).join(", ")}</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                      {isNext && (
                        <View style={[styles.next, { backgroundColor: theme.colors.accent }]}>
                          <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: theme.colors.onAccent }}>Next</Text>
                        </View>
                      )}
                    </View>
                  </TouchableRipple>
                );
              })}
            </View>
          </View>
        );
      })}
      <Text style={{ marginTop: 20, fontSize: 13, color: theme.colors.textMuted, textAlign: "center" }}>
        {(days.length === 0) ? "Nothing in the next four weeks." : `That’s everything until ${fmt.dayMonth.format(until)}.`}
      </Text>
    </View>
  );
}

export const panelStyle = (theme: ReturnType<typeof useTheme>) => ({
  borderLeftWidth: StyleSheet.hairlineWidth,
  borderLeftColor: theme.colors.border,
  backgroundColor: tint(theme.colors.sidebar, 0.6),
});

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  mono: {
    fontSize: 12,
    fontFamily: mono,
  },
  bigDate: {
    fontSize: 24,
    fontFamily: fonts.semibold,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  detailsTitle: {
    fontSize: 21,
    fontFamily: fonts.semibold,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  person: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  upcoming: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  upcomingInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  smallButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center",
  },
  miniRow: {
    flexDirection: "row",
    gap: 2,
  },
  miniCell: {
    flex: 1,
    textAlign: "center",
  },
  miniDay: {
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  miniDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 38,
    paddingHorizontal: 6,
  },
  spanBar: {
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  spanBarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  spanMark: {
    width: 3,
    height: 12,
    borderRadius: 2,
  },
  agenda: {
    width: "100%",
    maxWidth: 900,
    paddingHorizontal: 32,
    paddingTop: 8,
    paddingBottom: 48,
  },
  agendaDay: {
    flexDirection: "row",
    gap: 24,
    paddingVertical: 18,
  },
  agendaToday: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  agendaEvent: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  agendaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  next: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});

// An event that covers days, as a bar over them: a mark of its color, its title, and how many days it
// is (when it starts and ends in the row). Where it goes on before or after the row, its end is
// straight, with an arrow.
export function SpanBar(props: { bar: Bar, height: number, compact?: boolean, selected?: boolean, onPress: (x: Occurrence) => void }) {
  const theme = useTheme();
  const { bar, height } = props;
  const x = bar.occurrence;
  const days = dayCount(x);
  const radius = Math.min(6, height / 2);
  return (
    <TouchableRipple
      accessibilityRole="button"
      accessibilityLabel={`Event ${x.title}${(days > 1) ? `, ${days} days` : ", all day"}`}
      aria-selected={!!props.selected}
      testID="span-bar"
      onPress={() => props.onPress(x)}
      style={[styles.spanBar, {
        height,
        backgroundColor: tint(x.color, (theme.dark) ? 0.3 : 0.24),
        borderColor: (props.selected) ? x.color : "transparent",
        borderTopLeftRadius: (bar.before) ? 0 : radius,
        borderBottomLeftRadius: (bar.before) ? 0 : radius,
        borderTopRightRadius: (bar.after) ? 0 : radius,
        borderBottomRightRadius: (bar.after) ? 0 : radius,
        paddingHorizontal: (props.compact) ? 0 : 8,
      }]}
    >
      {(props.compact) ? <View /> : (
        <View style={styles.spanBarInner}>
          {bar.before && <MaterialCommunityIcons name="arrow-left" size={12} color={theme.colors.textSecondary} />}
          <View style={[styles.spanMark, { backgroundColor: x.color }]} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontFamily: fonts.medium, color: theme.colors.text }}>{x.title}</Text>
          {(!bar.before && !bar.after && (days > 1)) && <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{days} days</Text>}
          {bar.after && <MaterialCommunityIcons name="arrow-right" size={12} color={theme.colors.textSecondary} />}
        </View>
      )}
    </TouchableRipple>
  );
}

// The days of an event that covers several, e.g. "Thu 8 – Sun 11 October"
export function formatDays(x: Occurrence, fmt: DateFormats) {
  const last = new Date(x.end.getTime() - 1);
  if (dayCount(x) === 1) {
    return fmt.day.format(x.start);
  }
  const sameMonth = last.getMonth() === x.start.getMonth();
  return `${fmt.weekDay.format(x.start)} ${(sameMonth) ? x.start.getDate() : fmt.dayMonth.format(x.start)} – ${fmt.weekDay.format(last)} ${fmt.dayMonth.format(last)}`;
}
