// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useSelector } from "react-redux";
import { DrawerNavigationProp } from "@react-navigation/drawer";
import { Image, Linking, View, StatusBar, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Divider, Drawer as PaperDrawer, Text, Paragraph } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { StoreState } from "./store";

import ScrollView from "./widgets/ScrollView";
import ConfirmationDialog from "./widgets/ConfirmationDialog";
import PrettyFingerprint from "./widgets/PrettyFingerprint";
import Container from "./widgets/Container";
import DrawerItem from "./widgets/DrawerItem";

import LogoutDialog from "./components/LogoutDialog";

import * as C from "./constants";
import { useCredentials } from "./credentials";
import { serverName } from "./helpers";
import { RootStackParamList } from "./RootStackParamList";
import { fonts, useTheme } from "./theme";

type MenuItem = {
  title: string;
  path: keyof RootStackParamList;
  icon: string;
  link: string;
};

const menuItems: MenuItem[] = [
  {
    title: "Settings",
    path: "Settings",
    icon: "cog",
    link: "/settings",
  },
];

// The calendar, the tasks and the contacts, which are next to the notes
export const pimMenuItems: MenuItem[] = [
  {
    title: "Search all",
    path: "SearchAll",
    icon: "magnify",
    link: "/search-all",
  },
  {
    title: "Calendar",
    path: "Calendar",
    icon: "calendar-month-outline",
    link: "/calendar",
  },
  {
    title: "Tasks",
    path: "Tasks",
    icon: "checkbox-marked-circle-outline",
    link: "/tasks",
  },
  {
    title: "Contacts",
    path: "Contacts",
    icon: "account-box-outline",
    link: "/contacts",
  },
];

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
}

export default function Drawer(props: PropsType) {
  const [showFingerprint, setShowFingerprint] = React.useState(false);
  const [showLogout, setShowLogout] = React.useState(false);
  const navigation = props.navigation as DrawerNavigationProp<RootStackParamList, keyof RootStackParamList>;
  const etebase = useCredentials();
  const loggedIn = !!etebase;
  const syncCount = useSelector((state: StoreState) => state.syncCount);
  const theme = useTheme();

  return (
    <>
      <ScrollView style={{ flex: 1 }}>
        <SafeAreaView style={{ backgroundColor: theme.colors.sidebar, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
          <View style={{ height: StatusBar.currentHeight || 0 }} />
          <Container style={{ backgroundColor: "transparent", paddingVertical: 18 }}>
            <View style={styles.app}>
              <Image style={styles.appIcon} source={require("./images/icon.png")} />
              <Text style={[styles.appName, { color: theme.colors.textMuted }]}>{C.appName}</Text>
            </View>
            {etebase && (
              <View style={styles.account}>
                {/* The initials of the account */}
                <View style={[styles.avatar, { backgroundColor: theme.colors.chipActive }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.onChipActive }]}>{etebase.user.username.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={1}>{etebase.user.username}</Text>
                  {/* The server the account is on */}
                  <View style={styles.server} accessibilityLabel={`Server: ${serverName(etebase.serverUrl)}`}>
                    <MaterialCommunityIcons name="server" size={13} color={theme.colors.textMuted} style={{ marginRight: 5 }} />
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{serverName(etebase.serverUrl)}</Text>
                  </View>
                </View>
              </View>
            )}
          </Container>
        </SafeAreaView>
        {loggedIn && (
          <>
            <DrawerItem
              label="Notes"
              to="/"
              onPress={() => {
                navigation.closeDrawer();
                (navigation as any).navigate("Root", { screen: "Home", pop: true });
              }}
              icon="note-multiple"
            />
            <DrawerItem
              label="Notebooks"
              to="/notebooks"
              onPress={() => {
                navigation.closeDrawer();
                (navigation as any).navigate("Root", { screen: "Notebooks" });
              }}
              icon="notebook-multiple"
            />
            {pimMenuItems.map((item) => (
              <DrawerItem
                key={item.path}
                label={item.title}
                to={item.link}
                onPress={() => {
                  navigation.closeDrawer();
                  (navigation as any).navigate("Root", { screen: item.path });
                }}
                icon={item.icon}
              />
            ))}
            <Divider />
          </>
        )}
        <>
          {menuItems.map((menuItem) => (
            <DrawerItem
              key={menuItem.title}
              label={menuItem.title}
              to={menuItem.link}
              onPress={() => {
                navigation.closeDrawer();
                (navigation as any).navigate("Root", { screen: menuItem.path });
              }}
              icon={menuItem.icon}
            />
          ))}
          {loggedIn && (
            <>
              <DrawerItem
                label="Show Fingerprint"
                onPress={() => {
                  setShowFingerprint(true);
                }}
                icon="fingerprint"
              />
              <DrawerItem
                label="Invitations"
                to="/invitations"
                onPress={() => {
                  navigation.closeDrawer();
                  (navigation as any).navigate("Root", { screen: "Invitations" });
                }}
                icon="email-outline"
              />
              <DrawerItem
                label="Logout"
                onPress={() => setShowLogout(true)}
                disabled={syncCount > 0}
                icon="exit-to-app"
              />
            </>
          )}
        </>
        <Divider />
        <PaperDrawer.Section title="External links">
          {externalMenuItems.map((menuItem) => (
            <DrawerItem
              key={menuItem.title}
              label={menuItem.title}
              to={menuItem.link}
              onPress={() => { Linking.openURL(menuItem.link) }}
              icon={menuItem.icon}
            />
          ))}
        </PaperDrawer.Section>
      </ScrollView>

      <FingerprintDialog visible={showFingerprint} onDismiss={() => setShowFingerprint(false)} />
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
  app: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  appIcon: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  appName: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  username: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  server: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
});
