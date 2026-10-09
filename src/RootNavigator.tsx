// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useDispatch, useSelector } from "react-redux";
import { createStackNavigator } from "@react-navigation/stack";
import { Platform, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";

import { SyncManager, requestSync } from "./sync/SyncManager";

import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import SettingsScreen from "./screens/SettingsScreen";
import AboutScreen from "./screens/AboutScreen";
import ChangePasswordScreen from "./screens/ChangePasswordScreen";
import DebugLogsScreen from "./screens/DebugLogsScreen";
import HomeScreen, { NotebooksRoute, SearchRoute } from "./screens/HomeScreen";
import NoteEditScreen from "./screens/NoteEditScreen";
import NoteCreateScreen from "./screens/NoteCreateScreen";
import NoteRedirectScreen from "./screens/NoteRedirectScreen";
import CollectionEditScreen from "./screens/CollectionEditScreen";
import CollectionChangelogScreen from "./screens/CollectionChangelogScreen";
import CollectionMembersScreen from "./screens/CollectionMembersScreen";
import InvitationsScreen from "./screens/InvitationsScreen";
import AccountWizardScreen from "./screens/AccountWizardScreen";
import NotFoundScreen from "./screens/NotFoundScreen";
import CalendarScreen from "./pim/CalendarScreen";
import EventEditScreen from "./pim/EventEditScreen";
import TasksScreen from "./pim/TasksScreen";
import TaskEditScreen from "./pim/TaskEditScreen";
import ContactsScreen, { ContactScreen } from "./pim/ContactsScreen";
import ContactEditScreen from "./pim/ContactEditScreen";
import PimCollectionCreateScreen from "./pim/PimCollectionCreateScreen";
import SyncAction from "./pim/SyncAction";
import SearchAllScreen from "./pim/SearchAllScreen";

import { useCredentials } from "./credentials";
import { performSync, popMessage } from "./store/actions";

import { useAppStateCb } from "./helpers";

import * as C from "./constants";
import { StoreState } from "./store";
import { RootStackParamList, accountScreens, pimScreens } from "./RootStackParamList";
import MenuButton from "./widgets/MenuButton";
import Appbar from "./widgets/Appbar";
import Sidebar, { SidebarShowButton } from "./components/Sidebar";
import NotesColumn from "./components/NotesColumn";
import { SearchProvider, useWideLayout, useWideNavigation } from "./components/WideLayout";
import { useTheme } from "./theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Stack = createStackNavigator<RootStackParamList>();

export default React.memo(function RootNavigator() {
  const dispatch = useDispatch();
  const etebase = useCredentials();
  // Wide screens have the sidebar and the notes in columns next to the screens
  const wideLayout = useWideLayout();
  const sidebarVisible = useSelector((state: StoreState) => state.settings.sidebarVisible);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The calendar, the tasks and the contacts take the place of the notes column too
  const { currentScreen } = useWideNavigation();
  const notesShown = !pimScreens.includes(currentScreen ?? "") && !accountScreens.includes(currentScreen ?? "");

  // Sync app when it goes to background
  useAppStateCb(React.useCallback((_foreground) => {
    if (etebase) {
      // FIXME: We should only sync when moving to foreground if haven't in X minutes
      const syncManager = SyncManager.getManager(etebase);
      dispatch(performSync(syncManager.sync()) as any);
    }
  }, [etebase]));

  // Sync when the connection comes back, so changes made offline are pushed
  const isConnected = useSelector((state: StoreState) => state.connection?.isConnected);
  React.useEffect(() => {
    if (etebase && isConnected) {
      requestSync(etebase);
    }
  }, [etebase, isConnected]);

  // On the web NetInfo doesn't reliably report going back online, so listen to the browser directly
  React.useEffect(() => {
    if (!etebase || (Platform.OS !== "web")) {
      return undefined;
    }

    const onOnline = () => requestSync(etebase);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [etebase]);

  return (
    <SearchProvider>
      {/* Above the system's navigation bar (on Android the app is drawn behind it) */}
      <View style={{ flex: 1, flexDirection: "row", paddingBottom: insets.bottom, backgroundColor: theme.colors.background }}>
        {wideLayout && ((sidebarVisible) ? <Sidebar /> : <SidebarShowButton />)}
        {wideLayout && notesShown && <NotesColumn />}
        <View style={{ flex: 1 }}>
          <Stack.Navigator
            screenOptions={{
              header: (props) => <Appbar {...props} menuFallback />,
              cardStyle: {
                maxHeight: "100%",
                // (instead of the navigation's own, which is light also in dark mode)
                backgroundColor: theme.colors.background,
              },
            }}
          >
            {(etebase === null) ? (
              <>
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{
                    title: "Login",
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="Signup"
                  component={SignupScreen}
                  options={{
                    title: "Signup",
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
              </>
            ) : (
              <>
                <Stack.Screen
                  name="Home"
                  component={HomeScreen}
                  options={{
                    title: C.appName,
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="Search"
                  component={SearchRoute}
                />
                <Stack.Screen
                  name="Notebooks"
                  component={NotebooksRoute}
                  options={{
                    title: "Notebooks",
                  }}
                />
                <Stack.Screen
                  name="Collection"
                  component={NotebooksRoute}
                  options={{
                    title: C.appName,
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="NoteCreate"
                  component={NoteCreateScreen}
                />
                <Stack.Screen
                  name="NoteProps"
                  component={NoteRedirectScreen}
                />
                <Stack.Screen
                  name="NoteMove"
                  component={NoteRedirectScreen}
                />
                <Stack.Screen
                  name="CollectionEdit"
                  component={CollectionEditScreen}
                />
                <Stack.Screen
                  name="CollectionCreate"
                  component={CollectionEditScreen}
                />
                <Stack.Screen
                  name="CollectionChangelog"
                  component={CollectionChangelogScreen}
                  options={{
                    title: "Manage Notebook",
                  }}
                />
                <Stack.Screen
                  name="CollectionMembers"
                  component={CollectionMembersScreen}
                  options={{
                    title: "Collection Members",
                  }}
                />
                <Stack.Screen
                  name="NoteEdit"
                  component={NoteEditScreen}
                />
                <Stack.Screen
                  name="Calendar"
                  component={CalendarScreen}
                  options={{
                    title: "Calendar",
                    headerRight: () => <SyncAction screen="Calendar" />,
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="EventEdit"
                  component={EventEditScreen}
                />
                <Stack.Screen
                  name="Tasks"
                  component={TasksScreen}
                  options={{
                    title: "Tasks",
                    headerRight: () => <SyncAction screen="Tasks" />,
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="TaskEdit"
                  component={TaskEditScreen}
                />
                <Stack.Screen
                  name="Contacts"
                  component={ContactsScreen}
                  options={{
                    title: "Contacts",
                    headerRight: () => <SyncAction screen="Contacts" />,
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="Contact"
                  component={ContactScreen}
                />
                <Stack.Screen
                  name="ContactEdit"
                  component={ContactEditScreen}
                />
                <Stack.Screen
                  name="SearchAll"
                  component={SearchAllScreen}
                  options={{
                    title: "Search",
                    headerLeft: () => (
                      <MenuButton />
                    ),
                  }}
                />
                <Stack.Screen
                  name="PimCollectionCreate"
                  component={PimCollectionCreateScreen}
                />
                <Stack.Screen
                  name="Invitations"
                  component={InvitationsScreen}
                  options={{
                    title: "Collection Invitations",
                  }}
                />
                <Stack.Screen
                  name="Password"
                  component={ChangePasswordScreen}
                  options={{
                    title: "Change Your Account Password",
                  }}
                />
              </>
            )}
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen
              name="DebugLogs"
              component={DebugLogsScreen}
              options={{
                title: "View Debug Logs",
              }}
            />
            {/* We keep this outside of the guarded routes so we can navigate to it from the login/signup screens */}
            <Stack.Screen
              name="AccountWizard"
              component={AccountWizardScreen}
              options={{
                title: C.appName,
              }}
            />
            <Stack.Screen
              name="404"
              component={NotFoundScreen}
              options={{
                title: "Page Not Found",
                headerLeft: () => (
                  <MenuButton />
                ),
              }}
            />
          </Stack.Navigator>
        </View>
        <GlobalMessages />
      </View>
    </SearchProvider>
  );
});

function GlobalMessages() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const message = useSelector((state: StoreState) => state.messages.first(undefined));

  function handleClose() {
    dispatch(popMessage() as any);
  }

  // FIXME: handle severity
  return (
    <Snackbar
      key={message?.message}
      visible={!!message}
      duration={5000}
      onDismiss={handleClose}
      // Over the columns of wide screens (and not under them), with colors that read in both themes
      wrapperStyle={{ zIndex: 10 }}
      style={{ backgroundColor: theme.colors.chipActive }}
      action={{
        label: "Dismiss",
        onPress: handleClose,
        textColor: (theme.dark) ? theme.colors.accent : "#A8BDF7",
      }}
    >
      <Text style={{ color: theme.colors.onChipActive }}>{message?.message}</Text>
    </Snackbar>
  );
}

