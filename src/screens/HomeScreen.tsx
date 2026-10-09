// SPDX-FileCopyrightText: Â© 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { RootStackParamList } from "../RootStackParamList";

import NoteListScreen, { EmptyNotes } from "./NoteListScreen";
import { useWideLayout, useWideNavigation } from "../components/WideLayout";
import { StoreState } from "../store";
import { fonts } from "../theme";
import SearchScreen from "./SearchScreen";
import NotebookListScreen from "./NotebookListScreen";
import { useTheme } from "../theme";

interface PropsType {
  route: RouteProp<RootStackParamList, "Home"> | RouteProp<RootStackParamList, "Collection">;
}


// Wide screens list the notes in a column of their own, next to the screen, which shows the open note.
// Without one it says where they are.
function NoNoteOpen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { filterBy, navigate } = useWideNavigation();
  const hasNotes = useSelector((state: StoreState) => state.cache.items.some((items) => items.some((x) => !x.isDeleted)));

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    return () => navigation.setOptions({ headerShown: true });
  }, [navigation]);

  const create = () => navigate("NoteCreate", (filterBy) ? { colUid: filterBy } : undefined);
  if (!hasNotes) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.colors.background }]}>
        <EmptyNotes onCreate={create} />
      </View>
    );
  }

  return (
    <View style={[styles.placeholder, { backgroundColor: theme.colors.background }]}>
      <MaterialCommunityIcons name="note-text-outline" size={44} color={theme.colors.disabled} />
      <Text style={[styles.placeholderTitle, { color: theme.colors.text }]}>No note open</Text>
      <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>Choose a note from the list, or write a new one.</Text>
      <TouchableRipple
        borderless
        accessibilityRole="button"
        onPress={create}
        style={[styles.placeholderButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.placeholderButtonInner}>
          <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.text} />
          <Text style={[styles.placeholderButtonText, { color: theme.colors.text }]}>Write a new note</Text>
        </View>
      </TouchableRipple>
    </View>
  );
}

export default function HomeScreen(_props: PropsType) {
  if (useWideLayout()) {
    return <NoNoteOpen />;
  }
  return <NotesScreen />;
}

// The notes, which have a search field that opens the search, and the notebooks in the menu
function NotesScreen() {
  const navigation = useNavigation<any>();
  return <NoteListScreen active onSearch={() => navigation.navigate("Search")} />;
}

// The search, as a screen of its own
export function SearchRoute() {
  return <SearchScreen active />;
}

// The notebooks (and the notes of one of them), as a screen of its own
export function NotebooksRoute(props: { route: RouteProp<RootStackParamList, "Notebooks"> | RouteProp<RootStackParamList, "Collection"> }) {
  const colUid = (props.route.params as any)?.colUid || undefined;
  return <NotebookListScreen colUid={colUid} active />;
}
const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  placeholderTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    marginTop: 14,
  },
  placeholderText: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  placeholderButton: {
    marginTop: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  placeholderButtonInner: {
    height: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  placeholderButtonText: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
