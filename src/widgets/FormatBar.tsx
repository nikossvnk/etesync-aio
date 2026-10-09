// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { IconButton, Text, Tooltip, TouchableRipple } from "react-native-paper";

import { code, Edit, heading, link, linePrefix, wrap } from "../markdownFormat";
import { fonts, useTheme } from "../theme";

type Button = { icon: string, label: string, apply: (edit: Edit) => Edit };

const groups: Button[][] = [
  [
    { icon: "format-header-pound", label: "Heading", apply: heading },
    { icon: "format-bold", label: "Bold", apply: (e) => wrap(e, "**", "bold text") },
    { icon: "format-italic", label: "Italic", apply: (e) => wrap(e, "_", "italic text") },
    { icon: "format-strikethrough-variant", label: "Strikethrough", apply: (e) => wrap(e, "~~", "struck text") },
  ],
  [
    { icon: "format-list-bulleted", label: "Bulleted list", apply: (e) => linePrefix(e, "- ") },
    { icon: "format-list-numbered", label: "Numbered list", apply: (e) => linePrefix(e, "1. ") },
    { icon: "format-list-checks", label: "Checklist", apply: (e) => linePrefix(e, "- [ ] ") },
  ],
  [
    { icon: "format-quote-close", label: "Quote", apply: (e) => linePrefix(e, "> ") },
    { icon: "code-tags", label: "Code", apply: code },
    { icon: "link-variant", label: "Insert link", apply: link },
  ],
];

interface PropsType {
  // Applies a change of the Markdown to the note, around its selection
  onFormat: (apply: (edit: Edit) => Edit) => void;
  // Shown at the end on narrow screens, which don't have room for the view mode button in the bar
  onDone?: () => void;
}

// The bar above the editor with buttons that format the Markdown of the note
export default function FormatBar(props: PropsType) {
  const theme = useTheme();
  const { onFormat, onDone } = props;

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Formatting"
      style={[styles.bar, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border }]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.buttons}>
        {groups.map((group, i) => (
          <React.Fragment key={i}>
            {(i > 0) && <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />}
            {group.map((button) => (
              <Tooltip key={button.label} title={button.label}>
                <IconButton
                  icon={button.icon}
                  size={20}
                  containerColor="transparent"
                  iconColor={theme.colors.textBody}
                  style={styles.button}
                  accessibilityLabel={button.label}
                  // Keeps the focus (and so the selection) in the editor on the web
                  {...((Platform.OS === "web") ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
                  onPress={() => onFormat(button.apply)}
                />
              </Tooltip>
            ))}
          </React.Fragment>
        ))}
      </ScrollView>
      {onDone && (
        <TouchableRipple
          borderless
          accessibilityRole="button"
          accessibilityLabel="Done editing"
          onPress={onDone}
          style={[styles.done, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={[styles.doneText, { color: theme.colors.onAccent }]}>Done</Text>
        </TouchableRipple>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 8,
  },
  buttons: {
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  button: {
    margin: 0,
    borderRadius: 8,
  },
  separator: {
    width: 1,
    height: 20,
    marginHorizontal: 6,
  },
  done: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: "center",
    marginLeft: 6,
  },
  doneText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 16,
  },
});
