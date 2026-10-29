// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { Linking, PanResponder, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Divider, IconButton, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useDispatch, useSelector } from "react-redux";

import { StoreState } from "../store";
import { setSettings } from "../store/actions";
import { serverName } from "../helpers";
import { cardShadow, fonts, useTheme } from "../theme";
import { usePendingCount } from "../SyncGate";
import { useCredentials } from "../credentials";
import { externalMenuItems, FingerprintDialog } from "../Drawer";
import LogoutDialog from "./LogoutDialog";
import Menu from "../widgets/Menu";
import MenuItem from "../widgets/MenuItem";
import { useSearchQuery, useWideNavigation } from "./WideLayout";
import * as C from "../constants";
import { usePimCollections, usePimItems } from "../pim/data";
import { ContactType, TaskType } from "../pim/pim-types";
import { addDays, birthdaysColor, birthdaysUid, contactBirthday, startOfDay, useOccurrences } from "../pim/occurrences";
import { CollectionInfo, Kind, kinds, useCollectionInfos } from "../pim/collections";
import { CollectionMenu } from "../pim/CollectionsScreen";
import { useDialogs } from "../pim/Dialogs";
import { bookmarksSelector } from "../bookmarks";

export { useSidebarShown } from "./WideLayout";

// The sidebar's width can be changed between these, and always leaves room for the columns next to it
const minWidth = 200;
const maxWidth = 400;
const minScreenWidth = 720;

function clampWidth(width: number, windowWidth: number) {
  return Math.round(Math.max(minWidth, Math.min(width, maxWidth, windowWidth - minScreenWidth)));
}

// Changes the width of the sidebar by dragging the handle on its edge. The width is shown while
// dragging and saved when it's let go.
function useResize(savedWidth: number, save: (width: number) => void) {
  const windowWidth = useWindowDimensions().width;
  const [dragWidth, setDragWidth] = React.useState<number>();
  const startRef = React.useRef(savedWidth);
  const latest = React.useRef({ savedWidth, windowWidth, save });
  latest.current = { savedWidth, windowWidth, save };

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      startRef.current = clampWidth(latest.current.savedWidth, latest.current.windowWidth);
      setDragWidth(startRef.current);
    },
    onPanResponderMove: (_e, gesture) => {
      setDragWidth(clampWidth(startRef.current + gesture.dx, latest.current.windowWidth));
    },
    onPanResponderRelease: (_e, gesture) => {
      latest.current.save(clampWidth(startRef.current + gesture.dx, latest.current.windowWidth));
      setDragWidth(undefined);
    },
    onPanResponderTerminate: () => setDragWidth(undefined),
  }), []);

  return {
    width: dragWidth ?? clampWidth(savedWidth, windowWidth),
    dragging: dragWidth !== undefined,
    handlers: panResponder.panHandlers,
  };
}

interface RowPropsType {
  label: string;
  accessibilityLabel: string;
  selected?: boolean;
  onPress: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  count?: number | string;
  bold?: boolean;
}

function Row(props: RowPropsType) {
  const theme = useTheme();
  const { label, accessibilityLabel, selected, onPress, left, right, count, bold } = props;

  return (
    <TouchableRipple
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      // The web doesn't get the state above for buttons
      aria-selected={!!selected}
      style={[styles.row, (selected) ? [{ backgroundColor: theme.colors.surface }, cardShadow] : undefined]}
    >
      <View style={styles.rowContent}>
        {left}
        <Text
          numberOfLines={1}
          style={[styles.rowLabel, { color: (selected) ? theme.colors.text : theme.colors.textBody },
            (selected || bold) ? { fontFamily: (selected) ? fonts.semibold : fonts.medium } : undefined]}
        >
          {label}
        </Text>
        {(count !== undefined) && (count !== "") && <Text style={[styles.count, { color: theme.colors.textMuted }]}>{count}</Text>}
        {right}
      </View>
    </TouchableRipple>
  );
}

// A row with the ⋯ menu of its collection, which shows when the pointer is over it
function WithMenu(props: React.PropsWithChildren<{ info?: CollectionInfo, extra?: (close: () => void) => React.ReactNode }>) {
  const theme = useTheme();
  const [hover, setHover] = React.useState(false);
  if (!props.info) {
    return <>{props.children}</>;
  }
  return (
    <View
      {...({ onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false) } as any)}
      style={{ position: "relative" }}
    >
      {props.children}
      <View style={[styles.rowMenu, { backgroundColor: theme.colors.sidebar, opacity: (hover) ? 1 : 0 }]} testID="row-menu">
        <CollectionMenu info={props.info} extra={props.extra} />
      </View>
    </View>
  );
}

// The account the app is logged in to, with a menu of what the drawer has on phones
function Account() {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const { navigate } = useWideNavigation();
  const syncCount = useSelector((state: StoreState) => state.syncCount);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showFingerprint, setShowFingerprint] = React.useState(false);
  const [showLogout, setShowLogout] = React.useState(false);
  const username = etebase.user.username;

  return (
    <>
      <Menu
        visible={showMenu}
        onDismiss={() => setShowMenu(false)}
        anchor={(
          <TouchableRipple
            accessibilityRole="button"
            accessibilityLabel="Account menu"
            onPress={() => setShowMenu(true)}
            style={[styles.account, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
          >
            <View style={styles.accountInner}>
              <View style={[styles.avatar, { backgroundColor: theme.colors.chipActive }]}>
                <Text style={[styles.avatarText, { color: theme.colors.onChipActive }]}>{username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.accountText}>
                <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={1}>{username}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <MaterialCommunityIcons name="server" size={11} color={theme.colors.textMuted} />
                  <Text style={[styles.server, { color: theme.colors.textMuted }]} numberOfLines={1} accessibilityLabel={`Server: ${serverName(etebase.serverUrl)}`}>
                    {serverName(etebase.serverUrl)}
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons name="unfold-more-horizontal" size={18} color={theme.colors.textMuted} />
            </View>
          </TouchableRipple>
        )}
      >
        <MenuItem icon="email-outline" title="Invitations" onPress={() => {
          setShowMenu(false);
          navigate("Invitations");
        }} />
        <MenuItem icon="fingerprint" title="Show Fingerprint" onPress={() => {
          setShowMenu(false);
          setShowFingerprint(true);
        }} />
        <MenuItem icon="exit-to-app" title="Logout" disabled={syncCount > 0} onPress={() => {
          setShowMenu(false);
          setShowLogout(true);
        }} />
        <Divider />
        {externalMenuItems.map((item) => (
          <MenuItem key={item.title} icon={item.icon} title={item.title} onPress={() => {
            setShowMenu(false);
            Linking.openURL(item.link);
          }} />
        ))}
      </Menu>
      <FingerprintDialog visible={showFingerprint} onDismiss={() => setShowFingerprint(false)} />
      <LogoutDialog visible={showLogout} onDismiss={() => setShowLogout(false)} />
    </>
  );
}

type Section = "notes" | "bookmarks" | "calendar" | "tasks" | "contacts" | "settings" | "other";

// Which of the five sections a screen belongs to
function sectionOf(screen: string | undefined): Section {
  if (!screen) {
    return "notes";
  } else if (screen === "Bookmarks") {
    return "bookmarks";
  } else if (["Calendar", "EventEdit"].includes(screen)) {
    return "calendar";
  } else if (["Tasks", "TaskEdit"].includes(screen)) {
    return "tasks";
  } else if (["Contacts", "Contact", "ContactEdit"].includes(screen)) {
    return "contacts";
  } else if (["Settings", "About", "Password", "DebugLogs", "Invitations", "Collections", "CollectionChangelog"].includes(screen)) {
    return "settings";
  } else if (["SearchAll", "ItemHistory"].includes(screen)) {
    return "other";
  }
  return "notes";
}

// The "+" next to the search: making a note, a bookmark, an event, a task or a contact from anywhere
function CreateButton() {
  const theme = useTheme();
  const [visible, setVisible] = React.useState(false);
  const { filterBy, navigate } = useWideNavigation();
  const create = (screen: string, params?: any) => {
    setVisible(false);
    navigate(screen, params);
  };
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={(
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel="Create new"
          onPress={() => setVisible(true)}
          style={[styles.squareButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
        >
          <MaterialCommunityIcons name="plus" size={18} color={theme.colors.text} />
        </TouchableRipple>
      )}
    >
      <MenuItem icon="note-plus-outline" title="New note" onPress={() => create("NoteCreate", (filterBy) ? { colUid: filterBy } : undefined)} />
      <MenuItem icon="bookmark-plus-outline" title="New bookmark" onPress={() => create("Bookmarks", { url: "" })} />
      <MenuItem icon="calendar-plus" title="New event" onPress={() => create("EventEdit")} />
      <MenuItem icon="checkbox-marked-circle-plus-outline" title="New task" onPress={() => create("TaskEdit")} />
      <MenuItem icon="account-plus-outline" title="New contact" onPress={() => create("ContactEdit")} />
    </Menu>
  );
}

// The list under the sections, which is about the section that is open: the notebooks, the bookmark
// lists, the calendars (to hide and show them), the task lists, or the address books and groups of contacts
// (inSection: the page is of the section, rather than e.g. the settings opened from it, where none
// of the list is the chosen one)
function SectionList(props: { section: Section, inSection: boolean, onPimScreen: boolean }) {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const etebase = useCredentials();
  const { filterBy, navigate, showNotebook, currentScreen } = useWideNavigation();
  const { query, setQuery } = useSearchQuery();
  const settings = useSelector((state: StoreState) => state.settings);
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const calendars = usePimCollections(C.calendarType);
  const lists = usePimCollections(C.tasksType);
  const books = usePimCollections(C.contactsType);
  const bookmarkLists = usePimCollections(C.bookmarkColType);
  const bookmarkItems = useSelector(bookmarksSelector);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const searching = query.trim() !== "";
  const section = (props.section === "other") ? "notes" : props.section;
  const dialogs = useDialogs();
  const infos = useCollectionInfos(etebase);
  const infoOf = (colUid: string) => infos.find((x) => x.colUid === colUid);

  const header = (title: string, addLabel: string, onAdd: () => void) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{title}</Text>
      <IconButton containerColor="transparent" iconColor={theme.colors.textMuted} icon="plus" size={16} style={styles.smallButton} accessibilityLabel={addLabel} onPress={onAdd} />
    </View>
  );
  // The way to all of the collections of the section, at the end of its list
  const manage = (kind: Kind) => (
    <TouchableRipple accessibilityRole="link" accessibilityLabel={kinds[kind].manage} onPress={() => navigate("Collections", { kind })} style={[styles.row, { marginTop: 4 }]}>
      <View style={styles.rowContent}>
        <MaterialCommunityIcons name="cog-outline" size={16} color={theme.colors.textMuted} style={styles.icon} />
        <Text style={[styles.rowLabel, { fontSize: 13, color: theme.colors.textMuted }]}>{kinds[kind].manage}</Text>
      </View>
    </TouchableRipple>
  );

  if (section === "settings") {
    const pages = [
      { label: "General", screen: "Settings", icon: "tune-variant", also: ["Password", "DebugLogs"] },
      { label: "Collections", screen: "Collections", icon: "folder-multiple-outline", also: ["CollectionChangelog"] },
      { label: "Invitations", screen: "Invitations", icon: "email-outline", also: [] },
      { label: "About", screen: "About", icon: "information-outline", also: [] },
    ];
    return (
      <>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, paddingVertical: 6 }]}>Settings</Text>
        </View>
        {pages.map((x) => (
          <Row key={x.screen} label={x.label} accessibilityLabel={`Settings: ${x.label}`} selected={(currentScreen === x.screen) || x.also.includes(currentScreen ?? "")}
            onPress={() => navigate(x.screen)} left={<MaterialCommunityIcons name={x.icon as any} size={17} color={theme.colors.textMuted} style={styles.icon} />} />
        ))}
      </>
    );
  }
  const colorBox = (color: string) => <View style={[styles.color, { backgroundColor: color }]} />;

  if (section === "calendar") {
    const hidden = settings.hiddenCalendars ?? [];
    const toggle = (colUid: string) => dispatch(setSettings({
      hiddenCalendars: (hidden.includes(colUid)) ? hidden.filter((x) => x !== colUid) : [...hidden, colUid],
    }) as any);
    const rows = calendars.map((x) => ({ colUid: x.colUid, name: x.name, color: x.color }));
    if (contacts?.some((x) => contactBirthday(x))) {
      rows.push({ colUid: birthdaysUid, name: "Birthdays", color: birthdaysColor });
    }
    return (
      <>
        {header("Calendars", "New calendar", () => dialogs.newCollection("calendar"))}
        {rows.map((x) => {
          const shown = !hidden.includes(x.colUid);
          // (the ⋯ menu can also show only this one)
          const onlyThis = (close: () => void) => (
            <MenuItem icon="eye-outline" title="Show only this one" onPress={() => {
              close();
              dispatch(setSettings({ hiddenCalendars: [...calendars.map((c) => c.colUid), birthdaysUid].filter((c) => c !== x.colUid) }) as any);
            }} />
          );
          return (
            <WithMenu key={x.colUid} info={infoOf(x.colUid)} extra={onlyThis}>
              <TouchableRipple
                key={x.colUid}
                accessibilityRole="checkbox"
                accessibilityLabel={`Show ${x.name}`}
                accessibilityState={{ checked: shown }}
                aria-checked={shown}
                onPress={() => toggle(x.colUid)}
                style={styles.row}
              >
                <View style={styles.rowContent}>
                  <MaterialCommunityIcons name={(shown) ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={(shown) ? x.color : theme.colors.textMuted} style={styles.icon} />
                  <Text numberOfLines={1} style={[styles.rowLabel, { color: theme.colors.textBody }]}>{x.name}</Text>
                </View>
              </TouchableRipple>
            </WithMenu>
          );
        })}
        {manage("calendar")}
      </>
    );
  }

  if (section === "tasks") {
    const open = (tasks ?? []).filter((x) => !x.finished);
    const filter = (lists.some((x) => x.colUid === settings.taskSettings.filterBy)) ? settings.taskSettings.filterBy : null;
    const choose = (colUid: string | null) => {
      dispatch(setSettings({ taskSettings: { ...settings.taskSettings, filterBy: colUid } }) as any);
      if (currentScreen !== "Tasks") {
        navigate("Tasks");
      }
    };
    return (
      <>
        {header("Lists", "New task list", () => dialogs.newCollection("tasks"))}
        <Row label="All tasks" accessibilityLabel="All tasks" selected={props.inSection && !filter} onPress={() => choose(null)} count={open.length}
          left={<MaterialCommunityIcons name="format-list-checks" size={18} color={theme.colors.textMuted} style={styles.icon} />} />
        {lists.map((x) => (
          <WithMenu key={x.colUid} info={infoOf(x.colUid)}>
            <Row label={x.name} accessibilityLabel={`List ${x.name}`} selected={props.inSection && (filter === x.colUid)} onPress={() => choose(x.colUid)}
              count={open.filter((t) => t.collectionUid === x.colUid).length} left={colorBox(x.color)} />
          </WithMenu>
        ))}
        {manage("tasks")}
      </>
    );
  }

  if (section === "bookmarks") {
    const filter = (bookmarkLists.some((x) => x.colUid === settings.bookmarksFilter)) ? settings.bookmarksFilter : null;
    const countOf = (colUid: string) => bookmarkItems.get(colUid)?.count((x) => !x.isDeleted) ?? 0;
    const choose = (colUid: string | null) => {
      dispatch(setSettings({ bookmarksFilter: colUid }) as any);
      if (currentScreen !== "Bookmarks") {
        navigate("Bookmarks");
      }
    };
    return (
      <>
        {header("Bookmark lists", "New bookmark list", () => dialogs.newCollection("bookmarks"))}
        <Row label="All bookmarks" accessibilityLabel="All bookmarks" selected={props.inSection && !filter} onPress={() => choose(null)}
          count={bookmarkLists.reduce((sum, x) => sum + countOf(x.colUid), 0)}
          left={<MaterialCommunityIcons name="bookmark-multiple-outline" size={18} color={theme.colors.textMuted} style={styles.icon} />} />
        {bookmarkLists.map((x) => (
          <WithMenu key={x.colUid} info={infoOf(x.colUid)}>
            <Row label={x.name} accessibilityLabel={`Bookmark list ${x.name}`} selected={props.inSection && (filter === x.colUid)} onPress={() => choose(x.colUid)}
              count={countOf(x.colUid)} left={colorBox(x.color)} />
          </WithMenu>
        ))}
        {manage("bookmarks")}
      </>
    );
  }

  if (section === "contacts") {
    const people = (contacts ?? []).filter((x) => !x.group);
    const groups = (contacts ?? []).filter((x) => x.group).sort((a, b) => String(a.fn).localeCompare(String(b.fn)));
    const filter = settings.contactsFilter ?? null;
    const choose = (value: string | null) => {
      dispatch(setSettings({ contactsFilter: value }) as any);
      if (currentScreen !== "Contacts") {
        navigate("Contacts");
      }
    };
    return (
      <>
        {header("Address books", "New address book", () => dialogs.newCollection("contacts"))}
        <Row label="All contacts" accessibilityLabel="All contacts" selected={props.inSection && !filter} onPress={() => choose(null)} count={people.length}
          left={<MaterialCommunityIcons name="account-multiple-outline" size={18} color={theme.colors.textMuted} style={styles.icon} />} />
        {books.map((x) => (
          <WithMenu key={x.colUid} info={infoOf(x.colUid)}>
            <Row label={x.name} accessibilityLabel={`Address book ${x.name}`} selected={props.inSection && (filter === `book:${x.colUid}`)}
              onPress={() => choose(`book:${x.colUid}`)} count={people.filter((c) => c.collectionUid === x.colUid).length} left={colorBox(x.color)} />
          </WithMenu>
        ))}
        {(groups.length > 0) && (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, paddingVertical: 6 }]}>Groups</Text>
          </View>
        )}
        {groups.map((x) => (
          <Row key={x.uid} label={String(x.fn || "(no name)")} accessibilityLabel={`Group ${x.fn}`} selected={props.inSection && (filter === `group:${x.uid}`)}
            onPress={() => choose(`group:${x.uid}`)} count={x.members.length}
            left={<MaterialCommunityIcons name="account-group-outline" size={18} color={theme.colors.textMuted} style={styles.icon} />} />
        ))}
        {manage("contacts")}
      </>
    );
  }

  // The notebooks
  const notebooks = Array.from(cacheCollections.entries())
    .map(([colUid, collection]) => ({
      colUid,
      name: collection.meta.name ?? "",
      color: collection.meta.color || C.defaultColor,
      count: cacheItems.get(colUid)?.count((x) => !x.isDeleted) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = notebooks.reduce((sum, x) => sum + x.count, 0);
  const onNotes = props.inSection && !props.onPimScreen && (props.section === "notes");
  const show = (colUid: string | undefined) => {
    setQuery("");
    showNotebook(colUid);
    if (!onNotes) {
      navigation.navigate("Root", { screen: "Home" });
    }
  };
  return (
    <>
      {header("Notebooks", "New notebook", () => dialogs.newCollection("notes"))}
      <Row label="All notes" accessibilityLabel="All notes" selected={onNotes && !searching && !filterBy} onPress={() => show(undefined)} count={total}
        left={<MaterialCommunityIcons name="note-multiple-outline" size={18} color={theme.colors.textMuted} style={styles.icon} />} />
      {notebooks.map((notebook) => (
        <WithMenu key={notebook.colUid} info={infoOf(notebook.colUid)}>
          <Row
            label={notebook.name}
            accessibilityLabel={`Notebook ${notebook.name}`}
            selected={onNotes && !searching && (filterBy === notebook.colUid)}
            onPress={() => show(notebook.colUid)}
            count={notebook.count}
            left={colorBox(notebook.color)}
          />
        </WithMenu>
      ))}
      {(notebooks.length === 0) && (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No notebooks yet</Text>
      )}
      {manage("notes")}
    </>
  );
}

// The first column on wide screens: the account, the search (of everything) and making new things,
// the four sections, a list about the section that is open, and the settings and the sync
export default function Sidebar() {
  const theme = useTheme();
  const dispatch = useDispatch();
  const etebase = useCredentials();
  const { currentScreen, currentParams, navigate } = useWideNavigation();
  const { query, setQuery } = useSearchQuery();
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const bookmarkItems = useSelector(bookmarksSelector);
  const savedWidth = useSelector((state: StoreState) => state.settings.sidebarWidth);
  const resize = useResize(savedWidth, (sidebarWidth) => dispatch(setSettings({ sidebarWidth }) as any));
  const pendingCount = usePendingCount();
  const isSyncing = useSelector((state: StoreState) => state.syncCount) > 0;
  const section = sectionOf(currentScreen);
  const onPimScreen = section !== "notes";
  // Pages of no section (e.g. the settings) keep the list of the section they were opened from
  const lastSection = React.useRef<Section>("notes");
  if (section !== "other") {
    lastSection.current = section;
  }
  // Where to go back to when the search is cleared (the screen, and which note or event it was of)
  const beforeSearch = React.useRef<{ name: string, params?: any }>({ name: "Home" });

  // The numbers next to the sections: the notes, the events of today, and the tasks that are due
  const today = startOfDay(new Date());
  const { occurrences: todays } = useOccurrences(today, addDays(today, 1));
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  const notesCount = React.useMemo(() => cacheItems.reduce((sum, items) => sum + items.count((x) => !x.isDeleted), 0), [cacheItems]);
  const bookmarksCount = React.useMemo(() => bookmarkItems.reduce((sum, items) => sum + items.count((x) => !x.isDeleted), 0), [bookmarkItems]);
  const dueCount = (tasks ?? []).filter((x) => !x.finished && (x.overdue || x.dueToday)).length;

  function search(value: string) {
    setQuery(value);
    if (value.trim() && (currentScreen !== "SearchAll")) {
      beforeSearch.current = { name: currentScreen ?? "Home", params: currentParams };
      navigate("SearchAll");
    } else if (!value.trim() && (currentScreen === "SearchAll")) {
      navigate(beforeSearch.current.name, beforeSearch.current.params);
    }
  }

  const sections = [
    { key: "calendar", label: "Calendar", icon: "calendar-blank-outline", screen: "Calendar", count: (todays?.length) ? `${todays.length} today` : "" },
    { key: "tasks", label: "Tasks", icon: "checkbox-marked-circle-outline", screen: "Tasks", badge: dueCount },
    { key: "notes", label: "Notes", icon: "file-document-outline", screen: "Home", count: notesCount },
    { key: "bookmarks", label: "Bookmarks", icon: "bookmark-multiple-outline", screen: "Bookmarks", count: bookmarksCount },
    { key: "contacts", label: "Contacts", icon: "account-outline", screen: "Contacts" },
  ];

  function goTo(screen: string) {
    setQuery("");
    navigate(screen);
  }

  // Alt+1 to Alt+5 go to the sections, in their order (by the key's place, which the keyboard's
  // layout doesn't change)
  const goToRef = React.useRef(goTo);
  goToRef.current = goTo;
  const screens = sections.map((x) => x.screen).join(" ");
  React.useEffect(() => {
    if (Platform.OS !== "web") {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      const number = /^Digit([1-9])$/.exec(e.code);
      const screen = (number) ? screens.split(" ")[Number(number[1]) - 1] : undefined;
      if (screen && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        goToRef.current(screen);
      }
    };
    // (before the fields get it, which keep it to themselves)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [screens]);

  const borderColor = theme.colors.border;

  return (
    <View
      testID="sidebar"
      style={[styles.sidebar, { width: resize.width, backgroundColor: theme.colors.sidebar, borderRightColor: borderColor },
        // No text gets selected while dragging the edge
        (resize.dragging && (Platform.OS === "web")) ? ({ userSelect: "none" } as any) : undefined]}
    >
      <View style={styles.top}>
        <Account />
        <View style={styles.searchRow}>
          <View style={[styles.search, { borderColor, backgroundColor: theme.colors.surface }]}>
            <MaterialCommunityIcons name="magnify" size={17} color={theme.colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={search}
              placeholder="Search"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Search"
              style={[styles.searchInput, { color: theme.colors.text }]}
            />
            {(query !== "") && (
              <IconButton containerColor="transparent" iconColor={theme.colors.textMuted} icon="close" size={14} style={styles.smallButton} accessibilityLabel="Clear the search" onPress={() => search("")} />
            )}
          </View>
          <CreateButton />
        </View>
      </View>

      <View style={styles.sections}>
        {sections.map((x) => {
          const selected = (section === x.key) && (currentScreen !== "SearchAll");
          return (
            <Row
              key={x.key}
              label={x.label}
              accessibilityLabel={x.label}
              selected={selected}
              onPress={() => goTo(x.screen)}
              count={x.count}
              left={<MaterialCommunityIcons name={x.icon as any} size={18} color={(selected) ? theme.colors.accent : theme.colors.textMuted} style={styles.icon} />}
              right={(x.badge) ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.warning }]} accessibilityLabel={`${x.badge} due`}>
                  <Text style={[styles.badgeText, { color: theme.colors.onWarning }]}>{x.badge}</Text>
                </View>
              ) : undefined}
            />
          );
        })}
      </View>
      <View style={[styles.divider, { backgroundColor: borderColor }]} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tree}>
        <SectionList section={(section === "other") ? lastSection.current : section} inSection={section !== "other"} onPimScreen={onPimScreen} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: borderColor }]}>
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel="Settings"
          aria-selected={currentScreen === "Settings"}
          onPress={() => navigate("Settings")}
          style={[styles.row, { flex: 1 }, (currentScreen === "Settings") ? { backgroundColor: theme.colors.surface } : undefined]}
        >
          <View style={styles.rowContent}>
            <MaterialCommunityIcons name="tune-variant" size={17} color={theme.colors.textMuted} style={styles.icon} />
            <Text style={[styles.rowLabel, { color: theme.colors.textBody }]}>Settings</Text>
          </View>
        </TouchableRipple>
        <View style={[styles.syncPill, { borderColor, backgroundColor: theme.colors.surface }]}>
          <View style={[styles.syncDot, { backgroundColor: (pendingCount > 0) ? theme.colors.disabled : theme.colors.success }]} />
          <Text style={[styles.syncText, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {(isSyncing) ? "Syncing…" : (pendingCount > 0) ? `${pendingCount} to sync` : "Synced"}
          </Text>
        </View>
        <IconButton
          containerColor="transparent"
          iconColor={theme.colors.textMuted}
          icon="dock-left"
          size={18}
          style={styles.smallButton}
          accessibilityLabel="Hide the sidebar"
          onPress={() => dispatch(setSettings({ sidebarVisible: false }) as any)}
        />
      </View>
      <View
        {...resize.handlers}
        testID="sidebar-resize"
        accessibilityLabel="Change the width of the sidebar"
        style={[styles.resize, (Platform.OS === "web") ? ({ cursor: "col-resize" } as any) : undefined,
          (resize.dragging) ? { backgroundColor: theme.colors.activeIcon } : undefined]}
      />
    </View>
  );
}

// What's shown in place of the sidebar when it's hidden
export function SidebarShowButton() {
  const theme = useTheme();
  const dispatch = useDispatch();
  return (
    <View style={[styles.hidden, { backgroundColor: theme.colors.sidebar, borderRightColor: theme.colors.border }]}>
      <IconButton
        containerColor="transparent"
        iconColor={theme.colors.textMuted}
        icon="chevron-double-right"
        size={20}
        accessibilityLabel="Show the sidebar"
        onPress={() => dispatch(setSettings({ sidebarVisible: true }) as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderRightWidth: StyleSheet.hairlineWidth,
    // Over the column next to it, which the handle of the edge reaches into
    zIndex: 1,
    paddingTop: 12,
  },
  // The handle to drag the edge with, over the edge
  resize: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: -3,
    width: 6,
    zIndex: 1,
  },
  // (its button is at the bottom, where the one that hides it is)
  hidden: {
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  top: {
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 14,
  },
  account: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  accountInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  server: {
    fontSize: 11.5,
    fontFamily: Platform.select({ web: "'IBM Plex Mono', ui-monospace, monospace", default: "monospace" }),
  },
  searchRow: {
    flexDirection: "row",
    gap: 6,
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    borderWidth: 1,
    borderRadius: 9,
    minHeight: 36,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    fontFamily: fonts.regular,
    // The box around it shows where the text goes already
    outlineStyle: "none",
  } as any,
  squareButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sections: {
    paddingHorizontal: 8,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 4,
  },
  tree: {
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    marginTop: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    borderWidth: 1,
    gap: 6,
    flexShrink: 1,
  },
  syncText: {
    fontSize: 12,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
  },
  row: {
    paddingLeft: 10,
    paddingRight: 10,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 8,
  },
  // The ⋯ of a row, over its right end
  rowMenu: {
    position: "absolute",
    right: 4,
    top: 4,
    borderRadius: 6,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
  },
  icon: {
    marginRight: 10,
  },
  smallButton: {
    margin: 0,
  },
  color: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginLeft: 4,
    marginRight: 12,
  },
  count: {
    fontSize: 12,
    marginLeft: 6,
  },
  empty: {
    padding: 12,
  },
});
