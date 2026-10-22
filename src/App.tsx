// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { StatusBar, useColorScheme } from "react-native";
import { Provider as PaperProvider } from "react-native-paper";

import { NavigationContainer } from "@react-navigation/native";
import { createDrawerNavigator } from "@react-navigation/drawer";
import RootNavigator from "./RootNavigator";

import ErrorBoundary from "./ErrorBoundary";
import Drawer from "./Drawer";
import { useWebScrollbars } from "./webScrollbars";
import SettingsGate from "./SettingsGate";

import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-gesture-handler";
import { enableScreens } from "react-native-screens";
import { useSelector } from "react-redux";
import { StoreState } from "./store";
import { RootStackParamList } from "./RootStackParamList";
import { DarkTheme, LightTheme } from "./theme";
import { useWideLayout } from "./components/WideLayout";
import { useFonts } from "expo-font";
// Each weight from its own file: the package's index has all 18, and the build would include them all
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans/500Medium";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans/700Bold";

enableScreens();

const DrawerNavigation = createDrawerNavigator();

type RootStackScreens = {
  [route in keyof RootStackParamList]: string;
};

const rootStackScreens: RootStackScreens = {
  Home: "",
  Search: "search",
  Notebooks: "notebooks",
  Login: "login",
  Signup: "signup",
  CollectionCreate: "new-notebook",
  Collection: "notebook/:colUid",
  CollectionEdit: "notebook/:colUid/edit",
  CollectionChangelog: "notebook/:colUid/manage",
  CollectionMembers: "notebook/:colUid/members",
  NoteCreate: "new-note",
  NoteEdit: "notebook/:colUid/note/:itemUid",
  NoteProps: "notebook/:colUid/note/:itemUid/properties",
  NoteMove: "notebook/:colUid/note/:itemUid/move",
  Calendar: "calendar",
  EventEdit: "calendar/event",
  ItemHistory: "history/:colUid/:itemUid",
  Tasks: "tasks",
  TaskEdit: "tasks/task",
  Contacts: "contacts",
  Contact: "contacts/:colUid/:itemUid",
  ContactEdit: "contacts/edit",
  Bookmarks: "bookmarks",
  SearchAll: "search-all",
  Collections: "settings/collections",
  Invitations: "invitations",
  Settings: "settings",
  About: "settings/about",
  Password: "settings/password",
  DebugLogs: "settings/logs",
  AccountWizard: "account-wizard",
  "404": "*",
};

const linking = {
  prefixes: ["https://notes.etesync.com", "com.etesync.notes://"],
  config: {
    screens: {
      Root: {
        path: "",
        screens: rootStackScreens,
      },
    },
  },
};

function InnerApp() {
  // XXX Workaround for react-navigation #7561 (flashing drawer)
  const [initRender, setInitRender] = React.useState(true);
  React.useEffect(() => setInitRender(false), []);
  const colorScheme_ = useColorScheme();
  const darkModePreference = useSelector((state: StoreState) => state.settings.theme);
  const colorScheme = (darkModePreference === "auto") ? colorScheme_ : darkModePreference;
  const theme = (colorScheme === "dark") ? DarkTheme : LightTheme;
  useWebScrollbars(theme);
  const wideLayout = useWideLayout();
  // The font of the app, which is part of it, so this is quick (and it falls back to the system's if it fails)
  const [fontsLoaded, fontsError] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexSans_700Bold });

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <PaperProvider theme={theme}>
      <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
      <ErrorBoundary>
        <SettingsGate>
          <NavigationContainer linking={linking}>
            <DrawerNavigation.Navigator
              drawerContent={({ navigation, state }) => <Drawer navigation={navigation} state={state} />}
              screenOptions={{
                headerShown: false,
                drawerStyle: initRender ? { width: 0 } : undefined,
                // The sidebar of wide screens has what the drawer has
                swipeEnabled: !wideLayout,
              }}
            >
              <DrawerNavigation.Screen name="Root" component={RootNavigator} />
            </DrawerNavigation.Navigator>
          </NavigationContainer>
        </SettingsGate>
      </ErrorBoundary>
    </PaperProvider>
  );
}

class App extends React.Component {
  public render() {
    return (
      <SafeAreaProvider>
        <InnerApp />
      </SafeAreaProvider>
    );
  }
}

export default App;
