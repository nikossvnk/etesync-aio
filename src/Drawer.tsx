// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useSelector } from "react-redux";
import { DrawerNavigationProp, useDrawerStatus } from "@react-navigation/drawer";
import { Linking, View, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text, Paragraph, TouchableRipple } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StoreState } from "./store";

import ScrollView from "./widgets/ScrollView";
import ConfirmationDialog from "./widgets/ConfirmationDialog";
import PrettyFingerprint from "./widgets/PrettyFingerprint";

import LogoutDialog from "./components/LogoutDialog";
import { helpLinks, Logo } from "./components/Auth";
import { expo } from "../app.json";

import * as C from "./constants";
import { useCredentials } from "./credentials";
import { serverName } from "./helpers";
import { RootStackParamList } from "./RootStackParamList";
import { fonts, useTheme } from "./theme";

export const externalMenuItems = [
  {
    title: "Report issue",
    link: C.reportIssue,
    icon: "bug",
  },
];

if (!C.genericMode) {
  externalMenuItems.unshift(
    {
      title: "FAQ",
      link: C.faq,
      icon: "forum",
    }
  );
  externalMenuItems.unshift(
    {
      title: "Web site",
      link: C.homePage,
      icon: "home",
    }
  );
}

export function FingerprintDialog(props: { visible: boolean, onDismiss: () => void }) {
  const etebase = useCredentials()!;

  if (!props.visible) {
    return null;
  }

  const inviteMgr = etebase.getInvitationManager();

  return (
    <ConfirmationDialog
      title="Security Fingerprint"
      visible={props.visible}
      onOk={props.onDismiss}
      onCancel={props.onDismiss}
    >
      <>
        <Paragraph>
          Your security fingerprint is:
        </Paragraph>
        <View style={{ justifyContent: "center", alignItems: "center", marginTop: 15 }}>
          <PrettyFingerprint publicKey={inviteMgr.pubkey} />
        </View>
      </>
    </ConfirmationDialog>
  );
}

interface PropsType {
  navigation: any;
  // The state of the drawer, to show which screen is open
  state?: any;
}

// The screen that is open in the stack of screens (inside of the drawer)
function currentScreen(state: any): string | undefined {
  const stack = state?.routes?.[0]?.state;
  if (!stack?.routes) {
    return undefined;
  }
  return stack.routes[stack.index ?? (stack.routes.length - 1)]?.name;
}

function Item(props: { label: string, icon: string, onPress: () => void, active?: boolean, disabled?: boolean, external?: boolean }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      accessibilityRole={(props.external) ? "link" : "button"}
      accessibilityLabel={props.label}
      accessibilityState={{ selected: !!props.active, disabled: !!props.disabled }}
      aria-current={(props.active) ? "page" : undefined}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.item, (props.active) ? { backgroundColor: theme.colors.field } : undefined]}
    >
      <View style={styles.itemInner}>
        <MaterialCommunityIcons name={props.icon as any} size={20} color={(props.disabled) ? theme.colors.disabled : (props.active) ? theme.colors.accent : theme.colors.textSecondary} />
        <Text style={[styles.itemLabel, { color: (props.disabled) ? theme.colors.disabled : (props.active) ? theme.colors.text : theme.colors.textBody },
          (props.active) ? { fontFamily: fonts.semibold } : undefined]}>
          {props.label}
        </Text>
        {props.external && <MaterialCommunityIcons name="arrow-top-right" size={15} color={theme.colors.textMuted} />}
      </View>
    </TouchableRipple>
  );
}

export default function Drawer(props: PropsType) {
  const [showFingerprint, setShowFingerprint] = React.useState(false);
  const [showLogout, setShowLogout] = React.useState(false);
  const navigation = props.navigation as DrawerNavigationProp<RootStackParamList, keyof RootStackParamList>;
  const etebase = useCredentials();
  const loggedIn = !!etebase;
  const syncCount = useSelector((state: StoreState) => state.syncCount);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = currentScreen(props.state);
  // A closed drawer has nothing in it, so that its items (e.g. "Log in") aren't found next to the
  // screen's own ones, e.g. by screen readers
  const open = useDrawerStatus() === "open";

  function go(screen: string, params?: any) {
    navigation.closeDrawer();
    (navigation as any).navigate("Root", { screen, params });
  }

  const items: { label: string, icon: string, screen: string, also?: string[] }[] = (loggedIn) ? [
    // The sections in the order of the sidebar's (with the notebooks next to the notes)
    { label: "Search all", icon: "magnify", screen: "SearchAll" },
    { label: "Calendar", icon: "calendar-month-outline", screen: "Calendar" },
    { label: "Tasks", icon: "checkbox-marked-circle-outline", screen: "Tasks" },
    { label: "Notes", icon: "file-document-outline", screen: "Home", also: ["NoteEdit", "NoteCreate", "Search"] },
    { label: "Notebooks", icon: "notebook-multiple", screen: "Notebooks", also: ["Collection"] },
    { label: "Bookmarks", icon: "bookmark-multiple-outline", screen: "Bookmarks" },
    { label: "Contacts", icon: "account-box-outline", screen: "Contacts" },
    { label: "Settings", icon: "tune-variant", screen: "Settings" },
  ] : [
    { label: "Log in", icon: "login", screen: "Login" },
    { label: "Create account", icon: "account-plus-outline", screen: "Signup" },
    { label: "Settings", icon: "tune-variant", screen: "Settings" },
  ];

  if (!open) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.sidebar }} />;
  }

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.sidebar }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Logo size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.appName, { color: theme.colors.text }]} numberOfLines={1}>{(etebase) ? etebase.user.username : C.appName}</Text>
            {(etebase) ? (
              <View style={styles.server} accessibilityLabel={`Server: ${serverName(etebase.serverUrl)}`}>
                <MaterialCommunityIcons name="server" size={13} color={theme.colors.textMuted} style={{ marginRight: 5 }} />
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{serverName(etebase.serverUrl)}</Text>
              </View>
            ) : (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Not logged in</Text>
            )}
          </View>
          <TouchableRipple borderless accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => navigation.closeDrawer()} style={styles.close}>
            <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableRipple>
        </View>

        {items.map((x) => (
          <Item key={x.screen} label={x.label} icon={x.icon} active={(current === x.screen) || !!x.also?.includes(current ?? "")} onPress={() => go(x.screen)} />
        ))}
        {loggedIn && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <Item label="Show Fingerprint" icon="fingerprint" onPress={() => setShowFingerprint(true)} />
            <Item label="Invitations" icon="email-outline" active={current === "Invitations"} onPress={() => go("Invitations")} />
            <Item label="Logout" icon="exit-to-app" disabled={syncCount > 0} onPress={() => setShowLogout(true)} />
          </>
        )}

        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.section, { color: theme.colors.textMuted }]}>Help</Text>
        {helpLinks.map((x) => (
          <Item key={x.title} label={x.title} icon={x.icon} external onPress={() => Linking.openURL(x.link)} />
        ))}
        <Text style={[styles.version, { color: theme.colors.disabled }]}>Version {expo.version}</Text>
      </ScrollView>

      {loggedIn && <FingerprintDialog visible={showFingerprint} onDismiss={() => setShowFingerprint(false)} />}
      <LogoutDialog
        visible={showLogout}
        onDismiss={(loggedOut) => {
          if (loggedOut) {
            navigation.closeDrawer();
          }
          setShowLogout(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 12,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 10,
    paddingRight: 4,
    paddingBottom: 16,
  },
  appName: {
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
  server: {
    flexDirection: "row",
    alignItems: "center",
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    justifyContent: "center",
  },
  itemInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    marginVertical: 10,
  },
  section: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 4,
  },
  version: {
    marginTop: "auto",
    paddingTop: 16,
    paddingHorizontal: 14,
    fontSize: 12,
  },
});
