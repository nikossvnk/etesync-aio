// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { useSelector } from "react-redux";

import { StoreState } from "../store";
import { defaultColor } from "../helpers";
import { fonts, useTheme } from "../theme";

interface ChipPropsType {
  label: string;
  color?: string;
  selected: boolean;
  onPress: () => void;
}

function Chip(props: ChipPropsType) {
  const theme = useTheme();
  const { label, color, selected, onPress } = props;

  return (
    <TouchableRipple
      borderless
      style={[styles.chip, {
        backgroundColor: (selected) ? theme.colors.chipActive : theme.colors.surface,
        borderColor: (selected) ? theme.colors.chipActive : theme.colors.border,
      }]}
      accessibilityRole="button"
      accessibilityLabel={`Filter: ${label}`}
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      <View style={styles.chipContent}>
        {color && (
          <View style={[styles.chipColor, { backgroundColor: color }]} />
        )}
        <Text style={[styles.label, (selected) ? { color: theme.colors.onChipActive, fontFamily: fonts.medium } : { color: theme.colors.text }]} numberOfLines={1}>{label}</Text>
      </View>
    </TouchableRipple>
  );
}

interface PropsType {
  // The uid of the notebook that is filtered by, if any
  value: string | undefined;
  onChange: (colUid: string | undefined) => void;
}

// A row of chips to choose which notebook's notes to show
export default function NotebookFilter(props: PropsType) {
  const theme = useTheme();
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const notebooks = React.useMemo(() => Array.from(cacheCollections
    .sort((a, b) => (a.meta!.name!.toUpperCase() >= b.meta!.name!.toUpperCase()) ? 1 : -1)
    .map(({ meta }, uid) => ({ meta, uid }))
    .values()
  ), [cacheCollections]);
  const { value, onChange } = props;

  // Nothing to choose from
  if (notebooks.length < 2) {
    return null;
  }

  return (
    <View style={{ backgroundColor: theme.colors.background }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        <Chip label="All" selected={!value} onPress={() => onChange(undefined)} />
        {notebooks.map((notebook) => (
          <Chip
            key={notebook.uid}
            label={notebook.meta.name!}
            color={notebook.meta.color || defaultColor}
            selected={value === notebook.uid}
            onPress={() => onChange((value === notebook.uid) ? undefined : notebook.uid)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 2,
  },
  chip: {
    height: 36,
    maxWidth: 220,
    marginRight: 8,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
  },
  chipContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  label: {
    fontSize: 14,
  },
  chipColor: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 7,
  },
});
