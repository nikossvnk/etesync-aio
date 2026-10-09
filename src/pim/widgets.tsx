// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Pieces the calendar, the tasks and the contacts share, in the style of the notes

import * as React from "react";
import { Platform, StyleSheet, TextInput as NativeTextInput, View, ViewStyle, StyleProp } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import Menu from "../widgets/Menu";
import MenuItem from "../widgets/MenuItem";
import { fonts, useTheme } from "../theme";
import { PimCollection } from "./data";

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

// A date ("YYYY-MM-DD") or a time ("HH:MM"). Browsers have their own pickers for them, the phones get
// a text field.
export function DateTimeInput(props: { mode: "date" | "time", value: string, onChange: (value: string) => void, accessibilityLabel: string, disabled?: boolean }) {
  const theme = useTheme();
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: props.mode,
      value: props.value,
      disabled: props.disabled,
      "aria-label": props.accessibilityLabel,
      onChange: (e: any) => props.onChange(e.target.value),
      style: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: theme.colors.text,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 10,
        padding: "8px 10px",
        colorScheme: (theme.dark) ? "dark" : "light",
        opacity: (props.disabled) ? 0.5 : 1,
      },
    });
  }
  return (
    <FieldInput
      value={props.value}
      editable={!props.disabled}
      onChangeText={props.onChange}
      placeholder={(props.mode === "date") ? "YYYY-MM-DD" : "HH:MM"}
      accessibilityLabel={props.accessibilityLabel}
    />
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

// A row of chips to choose between all of the collections or one of them
export function CollectionChips(props: { collections: PimCollection[], value: string | null, onChange: (colUid: string | null) => void, allLabel: string }) {
  const theme = useTheme();
  const chip = (colUid: string | null, label: string, color?: string) => {
    const selected = props.value === colUid;
    return (
      <TouchableRipple
        key={colUid ?? "all"}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        aria-selected={selected}
        onPress={() => props.onChange(colUid)}
        style={[styles.chip, { borderColor: theme.colors.border },
          (selected) ? { backgroundColor: theme.colors.chipActive, borderColor: theme.colors.chipActive } : { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.pickerInner}>
          {color && <ColorDot color={color} size={8} style={{ marginRight: 6 }} />}
          <Text style={{ fontSize: 13, color: (selected) ? theme.colors.onChipActive : theme.colors.textBody }}>{label}</Text>
        </View>
      </TouchableRipple>
    );
  };
  return (
    <View style={styles.chips}>
      {chip(null, props.allLabel)}
      {props.collections.map((col) => chip(col.colUid, col.name, col.color))}
    </View>
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
