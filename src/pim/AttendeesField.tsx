// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Who is invited to an event (its ATTENDEE properties): added by name, email or "Name <email>", or
// chosen from the contacts, and removed again.

import * as React from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ICAL from "ical.js";

import { useCredentials } from "../credentials";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import { ContactType } from "./pim-types";
import { usePimItems } from "./data";
import { initials } from "./occurrences";
import { FieldInput } from "./widgets";

export interface AttendeeEntry {
  name: string;
  email?: string;
  // The property it came from, which is kept as it is (e.g. whether they accepted), as jCal
  original?: any;
}

export function attendeesOf(comp: ICAL.Component): AttendeeEntry[] {
  return comp.getAllProperties("attendee").map((prop) => {
    const value = String(prop.getFirstValue() ?? "");
    const email = (value.toLowerCase().startsWith("mailto:")) ? value.slice(7) : undefined;
    const cn = prop.getParameter("cn");
    return { name: (cn) ? String(cn) : (email ?? value), email, original: prop.toJSON() };
  });
}

// Writes the attendees to an event: the ones it had stay as they were, new ones are added
export function setAttendees(comp: ICAL.Component, attendees: AttendeeEntry[]) {
  comp.removeAllProperties("attendee");
  for (const a of attendees) {
    if (a.original) {
      comp.addProperty(new ICAL.Property(a.original));
    } else {
      const prop = comp.addPropertyWithValue("attendee", (a.email) ? `mailto:${a.email}` : a.name);
      if (a.name && (a.name !== a.email)) {
        prop.setParameter("cn", a.name);
      }
    }
  }
}

// "Name <email>", an email, or a name
export function parseAttendee(text: string): AttendeeEntry | undefined {
  const t = text.trim().replace(/,$/, "").trim();
  if (!t) {
    return undefined;
  }
  const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(t);
  if (m) {
    return { name: m[1].replace(/^"|"$/g, "").trim() || m[2], email: m[2] };
  }
  if (/^[^\s@]+@[^\s@]+$/.test(t)) {
    return { name: t, email: t };
  }
  return { name: t };
}

export default function AttendeesField(props: { value: AttendeeEntry[], onChange: (value: AttendeeEntry[]) => void }) {
  const theme = useTheme();
  const etebase = useCredentials();
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const [text, setText] = React.useState("");
  const { value } = props;

  const same = (a: AttendeeEntry, b: AttendeeEntry) => (a.email && b.email) ? (a.email.toLowerCase() === b.email.toLowerCase()) : (a.name === b.name);
  function add(entry: AttendeeEntry | undefined) {
    if (entry && !value.some((x) => same(x, entry))) {
      props.onChange([...value, entry]);
    }
    setText("");
  }

  // Contacts with an email that match what's typed
  const q = text.trim().toLowerCase();
  const suggestions = (!q) ? [] : (contacts ?? [])
    .filter((c) => !c.group)
    .map((c) => ({ name: String(c.fn ?? ""), email: String(c.comp.getFirstPropertyValue("email") ?? "") }))
    .filter((c) => c.email && (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)))
    .filter((c) => !value.some((x) => same(x, c)))
    .slice(0, 5);

  return (
    <View style={{ gap: 8 }} testID="attendees">
      {(value.length > 0) && (
        <View style={styles.chips}>
          {value.map((a, idx) => (
            <View key={`${a.email ?? a.name}-${idx}`} style={[styles.chip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <View style={[styles.avatar, { backgroundColor: theme.colors.field }]}>
                <Text style={{ fontSize: 9, fontFamily: fonts.semibold, color: theme.colors.textSecondary }}>{initials(a.name)}</Text>
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, color: theme.colors.text }}>{a.name}</Text>
                {(a.email && (a.email !== a.name)) && <Text numberOfLines={1} style={{ fontSize: 11, color: theme.colors.textMuted }}>{a.email}</Text>}
              </View>
              <TouchableRipple
                borderless
                accessibilityRole="button"
                accessibilityLabel={`Remove ${a.name}`}
                onPress={() => props.onChange(value.filter((x) => x !== a))}
                style={styles.remove}
              >
                <MaterialCommunityIcons name="close" size={14} color={theme.colors.textMuted} />
              </TouchableRipple>
            </View>
          ))}
        </View>
      )}
      <FieldInput
        value={text}
        onChangeText={(t) => {
          // A comma ends one, like in email apps
          if (t.endsWith(",")) {
            add(parseAttendee(t));
          } else {
            setText(t);
          }
        }}
        onSubmitEditing={() => add(parseAttendee(text))}
        blurOnSubmit={false}
        placeholder="Name, email or a contact"
        accessibilityLabel="Add an attendee"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {(suggestions.length > 0) && (
        <View style={[styles.suggestions, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          {suggestions.map((c) => (
            <TouchableRipple
              key={c.email}
              accessibilityRole="button"
              accessibilityLabel={`Invite ${c.name}`}
              onPress={() => add(c)}
              style={styles.suggestion}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.field, width: 26, height: 26, borderRadius: 13 }]}>
                  <Text style={{ fontSize: 10, fontFamily: fonts.semibold, color: theme.colors.textSecondary }}>{initials(c.name)}</Text>
                </View>
                <Text style={{ color: theme.colors.text }}>{c.name}</Text>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{c.email}</Text>
              </View>
            </TouchableRipple>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  remove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
