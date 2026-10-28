// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Pieces the calendar, the tasks and the contacts share, in the style of the notes

import * as React from "react";
import { StyleSheet, TextInput as NativeTextInput, View, ViewStyle, StyleProp } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ICAL from "ical.js";

import Menu from "../widgets/Menu";
import MenuItem from "../widgets/MenuItem";
import { fonts, useTheme } from "../theme";
import { PimCollection } from "./data";
import { DateFormats, useDateFormats } from "./format";
import { Reminder, reminderKey, reminderLabel, reminderPresets } from "./reminders";
import { knownTimezones } from "./timezones";

export function ColorDot(props: { color: string, size?: number, style?: StyleProp<ViewStyle> }) {
  const size = props.size ?? 10;
  return <View style={[{ width: size, height: size, borderRadius: size / 3, backgroundColor: props.color }, props.style]} />;
}

// A labelled field with a box around it, like the search field of the sidebar
export function Field(props: React.PropsWithChildren<{ label: string, style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return (
    <View style={[styles.field, props.style]}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{props.label}</Text>
      {props.children}
    </View>
  );
}

export function FieldInput(props: React.ComponentProps<typeof NativeTextInput>) {
  const theme = useTheme();
  const { style, ...rest } = props;
  return (
    <NativeTextInput
      placeholderTextColor={theme.colors.textMuted}
      style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, style]}
      {...rest}
    />
  );
}

// Dates are kept as "YYYY-MM-DD" and times as "HH:MM", and shown and typed in the format of the date
// and time setting (e.g. "09/10/2026" and "14:00", or "10/09/2026" and "2:00 PM")

function isoOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateOfIso(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return (m) ? new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])) : undefined;
}

// A typed date, in the order of the setting (or as "YYYY-MM-DD"); undefined if it isn't one
function parseTypedDate(text: string, fmt: DateFormats): string | undefined {
  const t = text.trim();
  if (dateOfIso(t)) {
    return t;
  }
  const m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(t);
  if (!m) {
    return undefined;
  }
  const [first, second] = [parseInt(m[1]), parseInt(m[2])];
  const [day, month] = (fmt.locale === "en-us") ? [second, first] : [first, second];
  const year = (m[3].length === 2) ? 2000 + parseInt(m[3]) : parseInt(m[3]);
  const date = new Date(year, month - 1, day);
  // (e.g. 31/02 isn't a date)
  return (date.getMonth() === month - 1 && date.getDate() === day) ? isoOf(date) : undefined;
}

// A typed time, e.g. "9", "9:30", "0930", "14:00" or "2:30 pm"; undefined if it isn't one
function parseTypedTime(text: string): string | undefined {
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i.exec(text.trim());
  if (!m) {
    return undefined;
  }
  let hour = parseInt(m[1]);
  const minute = (m[2]) ? parseInt(m[2]) : 0;
  const half = m[3]?.toLowerCase();
  if (half) {
    if (hour < 1 || hour > 12) {
      return undefined;
    }
    hour = (hour % 12) + ((half === "p") ? 12 : 0);
  }
  if (hour > 23 || minute > 59) {
    return undefined;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function showDate(value: string, fmt: DateFormats) {
  const date = dateOfIso(value);
  return (date) ? fmt.numericDate(date) : "";
}

function showTime(value: string, fmt: DateFormats) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return (m) ? fmt.time(new Date(2000, 0, 1, parseInt(m[1]), parseInt(m[2]))) : "";
}

// A small month to choose a date in
function DatePickerGrid(props: { value: string, onPick: (value: string) => void, fmt: DateFormats }) {
  const theme = useTheme();
  const { fmt } = props;
  const chosen = dateOfIso(props.value);
  const [month, setMonth] = React.useState(() => {
    const base = chosen ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - ((month.getDay() - fmt.weekStart + 7) % 7));
  const days = Array.from(Array(42).keys()).map((i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const today = isoOf(new Date());
  return (
    <View style={[styles.picker2, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} testID="date-picker">
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableRipple borderless accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.pickerNav}>
          <MaterialCommunityIcons name="chevron-left" size={18} color={theme.colors.textSecondary} />
        </TouchableRipple>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.semibold, color: theme.colors.text }}>{fmt.month.format(month)}</Text>
        <TouchableRipple borderless accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.pickerNav}>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textSecondary} />
        </TouchableRipple>
      </View>
      {[0, 1, 2, 3, 4, 5, 6].map((row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {(row === 0) ? days.slice(0, 7).map((d) => (
            <Text key={d.getDay()} style={[styles.pickerCell, { fontSize: 11, color: theme.colors.textMuted }]}>{fmt.weekDay.format(d).slice(0, 2)}</Text>
          )) : days.slice((row - 1) * 7, row * 7).map((d) => {
            const iso = isoOf(d);
            const isChosen = iso === props.value;
            return (
              <TouchableRipple
                key={iso}
                accessibilityRole="button"
                accessibilityLabel={fmt.day.format(d)}
                aria-selected={isChosen}
                onPress={() => props.onPick(iso)}
                style={[styles.pickerCell, styles.pickerDay, (isChosen) ? { backgroundColor: theme.colors.accent } : (iso === today) ? { borderWidth: 1, borderColor: theme.colors.accent } : undefined]}
              >
                <Text style={{ fontSize: 13, color: (isChosen) ? theme.colors.onAccent : (d.getMonth() === month.getMonth()) ? theme.colors.text : theme.colors.disabled }}>{d.getDate()}</Text>
              </TouchableRipple>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// A date or a time field, in the format of the date and time setting. What's typed is taken once
// it's a date (or time); a date can also be chosen in a small month.
export function DateTimeInput(props: { mode: "date" | "time", value: string, onChange: (value: string) => void, accessibilityLabel: string, disabled?: boolean }) {
  const theme = useTheme();
  const fmt = useDateFormats();
  const show = (props.mode === "date") ? showDate : showTime;
  const [text, setText] = React.useState(() => show(props.value, fmt));
  const [focused, setFocused] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const parsed = (props.mode === "date") ? parseTypedDate(text, fmt) : parseTypedTime(text);
  const invalid = !!text.trim() && !parsed;

  // Changed from outside (or the setting changed): shown again, unless it's being typed in
  React.useEffect(() => {
    if (!focused) {
      setText(show(props.value, fmt));
    }
  }, [props.value, fmt, focused]);

  function change(t: string) {
    setText(t);
    const value = (props.mode === "date") ? parseTypedDate(t, fmt) : parseTypedTime(t);
    if (value) {
      props.onChange(value);
    } else if (!t.trim()) {
      props.onChange("");
    }
  }

  return (
    <View>
      <View>
        <FieldInput
          value={text}
          editable={!props.disabled}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          // (a time or date that is typed in its own way is then shown in the format of the setting)
          onBlur={() => setFocused(false)}
          placeholder={(props.mode === "date") ? fmt.numericDatePattern : (fmt.twelveHours) ? "h:mm AM" : "HH:MM"}
          accessibilityLabel={props.accessibilityLabel}
          style={[(props.mode === "date") ? { paddingRight: 40 } : undefined, (invalid) ? { borderColor: theme.colors.error } : undefined,
            (props.disabled) ? { opacity: 0.5 } : undefined]}
        />
        {(props.mode === "date") && (
          <TouchableRipple
            borderless
            disabled={props.disabled}
            accessibilityRole="button"
            accessibilityLabel={`Choose the ${props.accessibilityLabel.toLowerCase()}`}
            onPress={() => setPicking(!picking)}
            style={styles.pickerButton}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.colors.textMuted} />
          </TouchableRipple>
        )}
      </View>
      {picking && (
        <DatePickerGrid
          value={props.value}
          fmt={fmt}
          onPick={(value) => {
            setPicking(false);
            setText(showDate(value, fmt));
            props.onChange(value);
          }}
        />
      )}
    </View>
  );
}

// Choosing which calendar (or task list, or address book) something is in
export function CollectionPicker(props: { collections: PimCollection[], value: string | undefined, onChange: (colUid: string) => void, label: string }) {
  const theme = useTheme();
  const [visible, setVisible] = React.useState(false);
  const current = props.collections.find((x) => x.colUid === props.value);
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={(
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel={`${props.label}: ${current?.name ?? "none"}`}
          onPress={() => setVisible(true)}
          style={[styles.input, styles.picker, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.pickerInner}>
            {current && <ColorDot color={current.color} style={{ marginRight: 8 }} />}
            <Text style={{ flex: 1, color: theme.colors.text }}>{current?.name ?? "Choose…"}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={theme.colors.textMuted} />
          </View>
        </TouchableRipple>
      )}
    >
      {props.collections.map((col) => (
        <MenuItem
          key={col.colUid}
          title={col.name}
          active={col.colUid === props.value}
          onPress={() => {
            setVisible(false);
            props.onChange(col.colUid);
          }}
        />
      ))}
    </Menu>
  );
}

export function EmptyState(props: { icon: string, title: string, text?: string, action?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={props.icon as any} size={40} color={theme.colors.disabled} />
      <Text style={[styles.emptyTitle, { color: theme.colors.textBody }]}>{props.title}</Text>
      {props.text && <Text style={{ color: theme.colors.textMuted, textAlign: "center" }}>{props.text}</Text>}
      {props.action}
    </View>
  );
}

// The main button of a screen, like "New note" in the sidebar
export function AccentButton(props: { icon?: string, label: string, onPress: () => void, style?: StyleProp<ViewStyle>, disabled?: boolean }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      borderless
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[styles.accent, { backgroundColor: theme.colors.accent, opacity: (props.disabled) ? 0.5 : 1 }, props.style]}
    >
      <View style={styles.accentInner}>
        {props.icon && <MaterialCommunityIcons name={props.icon as any} size={18} color={theme.colors.onAccent} />}
        <Text style={[styles.accentText, { color: theme.colors.onAccent }]}>{props.label}</Text>
      </View>
    </TouchableRipple>
  );
}

// Dates as "YYYY-MM-DD" and times as "HH:MM", in local time
export function toDateString(date: Date) {
  const pad = (x: number) => x.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeString(date: Date) {
  const pad = (x: number) => x.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeStrings(date: string, time?: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!d) {
    return null;
  }
  const t = (time !== undefined) ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : ["", "0", "0"];
  if (!t) {
    return null;
  }
  return new Date(parseInt(d[1]), parseInt(d[2]) - 1, parseInt(d[3]), parseInt(t[1]), parseInt(t[2]));
}

export const pimStyles = StyleSheet.create({
  // The content of the form screens, as wide as the forms of the notes
  form: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: 16,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 18,
  },
});

const styles = StyleSheet.create({
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  picker: {
    minHeight: 38,
    justifyContent: "center",
  },
  pickerInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  accent: {
    borderRadius: 10,
  },
  pickerButton: {
    position: "absolute",
    right: 4,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  picker2: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 2,
    maxWidth: 300,
  },
  pickerNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCell: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 4,
  },
  pickerDay: {
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneList: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  zoneItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  accentInner: {
    height: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  accentText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
});

// How often something repeats. "custom" is a rule this app can't make (e.g. on some days of the
// week), which is kept as it is unless another one is chosen.
export type RepeatKey = "none" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "custom";
const repeatNames: { [key in RepeatKey]: string } = {
  none: "Never",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  custom: "Custom",
};

export function repeatKeyOf(rule: any): RepeatKey {
  if (!rule) {
    return "none";
  }
  const json = rule.toJSON?.() ?? {};
  const simple = Object.keys(json).every((x) => ["freq", "interval", "wkst"].includes(x)) && ((json.interval ?? 1) === 1);
  return (simple && (json.freq in repeatNames)) ? json.freq : "custom";
}

export function RepeatPicker(props: { value: RepeatKey, onChange: (value: RepeatKey) => void }) {
  const theme = useTheme();
  const options = (["none", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as RepeatKey[]).concat((props.value === "custom") ? ["custom"] : []);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((x) => {
        const selected = props.value === x;
        return (
          <TouchableRipple
            key={x}
            accessibilityRole="button"
            accessibilityLabel={`Repeat ${repeatNames[x]}`}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => props.onChange(x)}
            style={[styles.chip, { borderColor: (selected) ? theme.colors.chipActive : theme.colors.border, backgroundColor: (selected) ? theme.colors.chipActive : theme.colors.surface }]}
          >
            <Text style={{ fontSize: 13, color: (selected) ? theme.colors.onChipActive : theme.colors.textBody }}>{repeatNames[x]}</Text>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

// Sets how often an event or a task repeats ("custom" keeps the rule it has)
export function applyRepeat(comp: ICAL.Component, repeat: RepeatKey) {
  if (repeat === "custom") {
    return;
  } else if (repeat === "none") {
    comp.removeAllProperties("rrule");
  } else if (repeatKeyOf(comp.getFirstPropertyValue("rrule")) !== repeat) {
    comp.updatePropertyWithValue("rrule", new ICAL.Recur({ freq: repeat } as any));
  }
}

// The time zones the browser knows, and UTC
const timezones: string[] = ["UTC", ...knownTimezones().filter((x) => x !== "UTC").sort()];

export function timezoneName(zone: string) {
  return zone.replace(/_/g, " ");
}

// Choosing a time zone, by typing a part of its name (e.g. "berlin" or "new york")
export function TimezonePicker(props: { value: string, onChange: (zone: string) => void, disabled?: boolean }) {
  const theme = useTheme();
  const [query, setQuery] = React.useState<string>();
  const searching = query !== undefined;
  const q = (query ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const matches = (searching) ? timezones.filter((x) => x.toLowerCase().includes(q)).slice(0, 8) : [];

  return (
    <View>
      <FieldInput
        value={(searching) ? query : timezoneName(props.value)}
        editable={!props.disabled}
        onFocus={() => setQuery("")}
        // (later than a press on one of the time zones, which ends the search itself)
        onBlur={() => setTimeout(() => setQuery(undefined), 200)}
        onChangeText={setQuery}
        placeholder={timezoneName(props.value)}
        accessibilityLabel="Time zone"
        style={(props.disabled) ? { opacity: 0.5 } : undefined}
      />
      {searching && (
        <View style={[styles.zoneList, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} testID="timezone-list">
          {matches.map((zone) => (
            <TouchableRipple
              key={zone}
              accessibilityRole="button"
              accessibilityLabel={`Time zone ${timezoneName(zone)}`}
              onPress={() => {
                props.onChange(zone);
                setQuery(undefined);
              }}
              style={styles.zoneItem}
            >
              <Text style={{ color: (zone === props.value) ? theme.colors.accentText : theme.colors.text }}>{timezoneName(zone)}</Text>
            </TouchableRipple>
          ))}
          {(matches.length === 0) && <Text style={[styles.zoneItem, { color: theme.colors.textMuted }]}>No time zone matches</Text>}
        </View>
      )}
    </View>
  );
}

// The reminders of an event or a task: the ones it has (each can be removed), and the times that can
// be added
export function ReminderPicker(props: { value: Reminder[], onChange: (value: Reminder[]) => void, allDay: boolean, isTask?: boolean, disabled?: boolean }) {
  const theme = useTheme();
  const fmt = useDateFormats();
  const [adding, setAdding] = React.useState(false);
  const label = (x: Reminder) => reminderLabel(x, props.allDay, !!props.isTask, fmt);
  const keys = props.value.map(reminderKey);
  const offered = reminderPresets(props.allDay).filter((x) => !keys.includes(String(x)));
  const chip = (text: string, accessibilityLabel: string, onPress: () => void, icon?: string, active?: boolean) => (
    <TouchableRipple
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={props.disabled}
      onPress={onPress}
      style={[styles.chip, { borderColor: (active) ? theme.colors.chipActive : theme.colors.border, backgroundColor: (active) ? theme.colors.chipActive : theme.colors.surface, opacity: (props.disabled) ? 0.5 : 1 }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 13, color: (active) ? theme.colors.onChipActive : theme.colors.textBody }}>{text}</Text>
        {icon && <MaterialCommunityIcons name={icon as any} size={14} color={(active) ? theme.colors.onChipActive : theme.colors.textSecondary} />}
      </View>
    </TouchableRipple>
  );
  return (
    <View style={{ gap: 8 }} testID="reminders">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {props.value.map((x, i) => chip(label(x), `Remove reminder ${label(x)}`, () => props.onChange(props.value.filter((_y, j) => j !== i)), "close", true))}
        {(offered.length > 0) && chip((adding) ? "Done" : "Add a reminder", (adding) ? "Done adding reminders" : "Add a reminder", () => setAdding(!adding), (adding) ? undefined : "plus")}
      </View>
      {adding && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID="reminder-options">
          {offered.map((x) => chip(label({ seconds: x }), `Remind ${label({ seconds: x })}`, () => props.onChange([...props.value, { seconds: x }].sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0)))))}
        </View>
      )}
    </View>
  );
}
