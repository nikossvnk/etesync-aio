// SPDX-FileCopyrightText: © 2017 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

// Settings → Collections: all of the calendars, address books, task lists and notebooks, by kind, with
// how much is in them, who they're shared with and when they changed; and next to them the chosen
// one's name, description and colour, who has access to it (invitations by username), and deleting it

import * as React from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Paragraph, Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { NavigationProp, RouteProp, StackActions, useNavigation } from "@react-navigation/native";
import { useDispatch } from "react-redux";
import * as Etebase from "etebase";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { pushMessage } from "../store/actions";
import { RootStackParamList } from "../RootStackParamList";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import PrettyFingerprint from "../widgets/PrettyFingerprint";
import Menu from "../widgets/Menu";
import MenuItem from "../widgets/MenuItem";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import {
  accessNames, CollectionInfo, deleteCollection, exportCollection, exportExtension, fetchUserKey, inviteMember, Kind, kindOrder, kinds,
  leaveCollection, listMembers, Member, removeMember, saveCollection, setMemberAccess, useCollectionInfos,
} from "./collections";
import { Button, DialogInput, Labelled, SwatchPicker, useDialogs } from "./Dialogs";
import { formatChanged, useDateFormats } from "./format";
import { initials, oneTimeEventsBefore } from "./occurrences";
import { deletePimItems, usePimItems } from "./data";
import { EventType } from "./pim-types";
import { mono, tint } from "./style";

function host(url: string) {
  try {
    return new URL(url).host;
  } catch (e) {
    return url;
  }
}

// The ⋯ of a collection: what can be done with it
export function CollectionMenu(props: { info: CollectionInfo, onEdit?: () => void, extra?: (close: () => void) => React.ReactNode, anchorStyle?: any }) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const dialogs = useDialogs();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deletingOld, setDeletingOld] = React.useState(false);
  const { info } = props;
  const kind = kinds[info.kind];
  const admin = info.accessLevel === Etebase.CollectionAccessLevel.Admin;
  const close = () => setOpen(false);
  return (
    <>
      <Menu
        visible={open}
        onDismiss={close}
        anchor={(
          <TouchableRipple
            borderless
            accessibilityRole="button"
            accessibilityLabel={`${info.name} options`}
            aria-haspopup="menu"
            onPress={() => setOpen(true)}
            style={[styles.more, props.anchorStyle, (open) ? { backgroundColor: theme.colors.field } : undefined]}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={16} color={theme.colors.textSecondary} />
          </TouchableRipple>
        )}
      >
        {props.extra?.(close)}
        <MenuItem icon="pencil-outline" title={`Edit ${kind.noun}…`} onPress={() => {
          close();
          if (props.onEdit) {
            props.onEdit();
          } else {
            navigation.navigate("Root", { screen: "Collections", params: { colUid: info.colUid } });
          }
        }} />
        {admin && <MenuItem icon="account-multiple-outline" title="Share…" onPress={() => {
          close();
          navigation.navigate("Root", { screen: "Collections", params: { colUid: info.colUid, share: true } });
        }} />}
        <MenuItem icon="tray-arrow-down" title={`Export as .${exportExtension(info.kind)}`} onPress={async () => {
          close();
          const n = await exportCollection(etebase, info.colUid);
          dispatch(pushMessage({ message: `Exported ${n} ${kind.unit}`, severity: "success" }) as any);
        }} />
        {(info.accessLevel !== Etebase.CollectionAccessLevel.ReadOnly) && <MenuItem icon="tray-arrow-up" title={`Import into this ${kind.noun}…`} onPress={() => {
          close();
          dialogs.importFiles(info.colUid);
        }} />}
        {(info.kind === "calendar") && (info.accessLevel !== Etebase.CollectionAccessLevel.ReadOnly) && <MenuItem icon="delete-clock-outline" title="Delete old events…" onPress={() => {
          close();
          setDeletingOld(true);
        }} />}
        <MenuItem icon={(admin) ? "delete-outline" : "exit-run"} title={(admin) ? `Delete ${kind.noun}…` : `Leave ${kind.noun}…`} onPress={() => {
          close();
          setDeleting(true);
        }} />
      </Menu>
      <DeleteDialog info={info} visible={deleting} onDone={() => setDeleting(false)} />
      {deletingOld && <DeleteOldEvents info={info} onClose={() => setDeletingOld(false)} />}
    </>
  );
}

// Deleting a calendar's events that ended more than a year ago, after asking (only the ones that
// don't repeat)
function DeleteOldEvents(props: { info: CollectionInfo, onClose: () => void }) {
  const dispatch = useDispatch();
  const etebase = useCredentials()!;
  const events = usePimItems(etebase, C.calendarType, EventType.parse);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const old = oneTimeEventsBefore((events ?? []).filter((x) => x.collectionUid === props.info.colUid), yearAgo);
  const name = props.info.name;

  async function remove() {
    await deletePimItems(etebase, old);
    props.onClose();
    dispatch(pushMessage({ message: `${old.length} old ${(old.length === 1) ? "event" : "events"} of ${name} deleted`, severity: "success" }) as any);
  }

  return (
    <ConfirmationDialog
      title="Delete old events"
      visible
      labelOk={(old.length) ? "Delete" : "OK"}
      onOk={(old.length) ? remove : props.onClose}
      onCancel={props.onClose}
    >
      <Text>
        {(!events) ? "Loading…" : (old.length) ?
          `Delete the ${(old.length === 1) ? "event" : `${old.length} events`} of ${name} that ended more than a year ago? This can't be undone.` :
          `${name} has no events that ended more than a year ago.`}
        {" "}Only events that happen once are deleted: repeating events are kept, even old ones.
      </Text>
    </ConfirmationDialog>
  );
}

// Deleting a collection (or leaving one that was shared with you), after saying what that does
function DeleteDialog(props: { info: CollectionInfo, visible: boolean, members?: number, onDone: (deleted: boolean) => void }) {
  const etebase = useCredentials()!;
  const dispatch = useDispatch();
  const { info } = props;
  const kind = kinds[info.kind];
  const admin = info.accessLevel === Etebase.CollectionAccessLevel.Admin;
  if (!props.visible) {
    return null;
  }
  const others = (props.members ?? 1) - 1;
  return (
    <ConfirmationDialog
      title={(admin) ? `Delete ${kind.noun}` : `Leave ${kind.noun}`}
      labelOk={(admin) ? "Delete" : "Leave"}
      visible
      onOk={async () => {
        if (admin) {
          deleteCollection(etebase, info.colUid);
          dispatch(pushMessage({ message: `${kind.one} deleted`, severity: "success" }) as any);
        } else {
          await leaveCollection(etebase, info.colUid);
          dispatch(pushMessage({ message: `You left “${info.name}”. It goes away with the next sync.`, severity: "success" }) as any);
        }
        props.onDone(true);
      }}
      onCancel={() => props.onDone(false)}
    >
      <Paragraph>
        {(admin) ? (
          `Deleting removes “${info.name}” and everything in it (${info.items} ${kind.unit}) ${(others > 0) ? `for all ${others + 1} people who have it` : "from all your devices"}. This can’t be undone.`
        ) : (
          `“${info.name}” was shared with you. Leaving removes it from your devices; the others keep it.`
        )}
      </Paragraph>
    </ConfirmationDialog>
  );
}

const accessChoices = [Etebase.CollectionAccessLevel.ReadOnly, Etebase.CollectionAccessLevel.ReadWrite, Etebase.CollectionAccessLevel.Admin];

function MemberRow(props: { member: Member, you: boolean, onAccess: (level: Etebase.CollectionAccessLevel) => void, onRemove: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const { member } = props;
  return (
    <View style={styles.member}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.field }]}>
        <Text style={{ fontSize: 10, fontFamily: fonts.semibold, color: theme.colors.textSecondary }}>{initials(member.username)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text }}>{(props.you) ? "You" : member.username}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textMuted }}>{member.username}</Text>
      </View>
      {(props.you) ? (
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Owner</Text>
      ) : (
        <Menu
          visible={open}
          onDismiss={() => setOpen(false)}
          anchor={(
            <TouchableRipple
              accessibilityRole="button"
              accessibilityLabel={`Access for ${member.username}: ${accessNames[member.accessLevel]}`}
              onPress={() => setOpen(true)}
              style={[styles.access, { borderColor: theme.colors.border }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 13, color: theme.colors.text }}>{accessNames[member.accessLevel]}</Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color={theme.colors.textMuted} />
              </View>
            </TouchableRipple>
          )}
        >
          {accessChoices.map((level) => (
            <MenuItem key={level} title={accessNames[level]} active={level === member.accessLevel} onPress={() => {
              setOpen(false);
              props.onAccess(level);
            }} />
          ))}
          <MenuItem icon="close" title="Remove access" onPress={() => {
            setOpen(false);
            props.onRemove();
          }} />
        </Menu>
      )}
    </View>
  );
}

// The chosen collection: its details, who has access to it, and deleting it
// After a collection was deleted, the screens about it that this one was opened from (e.g. a
// notebook's notes and its page) are left too: back to the screen before the first of them
function leaveDeleted(navigation: NavigationProp<any>, colUid: string) {
  const state = navigation.getState();
  const first = state.routes.findIndex((x) => (x.name !== "Collections") && ((x.params as { colUid?: string } | undefined)?.colUid === colUid));
  if (first > 0) {
    navigation.dispatch(StackActions.pop(state.routes.length - first));
  } else if (first === 0) {
    navigation.dispatch(StackActions.replace("Home"));
  }
}

function CollectionPanel(props: { info: CollectionInfo, members?: Member[], onMembersChanged: () => void, onClose?: () => void, shareFirst?: boolean }) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const dialogs = useDialogs();
  const fmt = useDateFormats();
  const { info } = props;
  const kind = kinds[info.kind];
  const admin = info.accessLevel === Etebase.CollectionAccessLevel.Admin;
  const [name, setName] = React.useState(info.name);
  const [description, setDescription] = React.useState(info.description);
  const [color, setColor] = React.useState(info.color);
  const [invitee, setInvitee] = React.useState("");
  const [inviteKey, setInviteKey] = React.useState<Uint8Array>();
  const [readOnly, setReadOnly] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const changed = (name !== info.name) || (description !== info.description) || (color.toLowerCase() !== info.color.toLowerCase());

  // Another one chosen: its details
  React.useEffect(() => {
    setName(info.name);
    setDescription(info.description);
    setColor(info.color);
    setError(undefined);
  }, [info.colUid, info.name, info.description, info.color]);

  async function save() {
    if (!name.trim()) {
      setError("The name is required");
      return;
    }
    await saveCollection(etebase, info.colUid, { name: name.trim(), description: description.trim(), color });
    dispatch(pushMessage({ message: `${kind.one} saved`, severity: "success" }) as any);
  }

  async function invite() {
    setError(undefined);
    try {
      setInviteKey(await fetchUserKey(etebase, invitee.trim()));
    } catch (e) {
      setError(`There's no user “${invitee.trim()}” on this server (or they haven't set up their encryption yet).`);
    }
  }

  async function changeAccess(action: () => Promise<void>, message: string) {
    try {
      await action();
      dispatch(pushMessage({ message, severity: "success" }) as any);
      props.onMembersChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const members = props.members;
  const sharedWith = (members) ? members.length : undefined;
  const sharing = admin && (
    <View style={{ gap: 4 }} testID="collection-members">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Shared with</Text>
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{(sharedWith === undefined) ? "…" : (sharedWith > 1) ? `${sharedWith} people` : "Only you"}</Text>
      </View>
      {(members ?? []).map((m) => (
        <MemberRow
          key={m.username}
          member={m}
          you={m.username === etebase.user.username}
          onAccess={(level) => changeAccess(() => setMemberAccess(etebase, info.colUid, m.username, level), `${m.username} has ${accessNames[level].toLowerCase()} access now`)}
          onRemove={() => changeAccess(() => removeMember(etebase, info.colUid, m.username), `${m.username} has no access anymore`)}
        />
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <DialogInput value={invitee} onChangeText={setInvitee} onSubmitEditing={invite} placeholder="Invite by username" accessibilityLabel="Invite by username" autoCapitalize="none" autoCorrect={false} />
        </View>
        <Button label="Invite" disabled={!invitee.trim()} onPress={invite} />
      </View>
    </View>
  );

  return (
    <View style={{ gap: 18 }} testID="collection-panel">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {props.onClose && (
          <TouchableRipple borderless accessibilityRole="button" accessibilityLabel="Back to the list" onPress={props.onClose} style={styles.more}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={theme.colors.textSecondary} />
          </TouchableRipple>
        )}
        <View style={[styles.bigSwatch, { backgroundColor: tint(color, 0.18) }]}>
          <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{kind.one}{(admin) ? "" : ` · shared with you, ${accessNames[info.accessLevel].toLowerCase()}`}</Text>
          <Text numberOfLines={1} style={{ fontSize: 18, fontFamily: fonts.semibold, color: theme.colors.text }}>{info.name}</Text>
        </View>
      </View>
      {props.shareFirst && sharing}
      <Labelled label="Name">
        <DialogInput value={name} onChangeText={setName} editable={admin} accessibilityLabel="Name" />
      </Labelled>
      <Labelled label="Description" optional>
        <DialogInput value={description} onChangeText={setDescription} editable={admin} accessibilityLabel="Description" multiline style={{ height: 64, paddingTop: 10, textAlignVertical: "top" }} />
      </Labelled>
      <Labelled label="Colour">
        <View pointerEvents={(admin) ? "auto" : "none"} style={{ opacity: (admin) ? 1 : 0.5 }}>
          <SwatchPicker value={color} onChange={setColor} size={24} />
        </View>
      </Labelled>
      {!props.shareFirst && sharing}
      {!!error && <Text style={{ color: theme.colors.error }} accessibilityLiveRegion="polite">{error}</Text>}
      <View style={styles.meta}>
        <MaterialCommunityIcons name="lock-outline" size={13} color={theme.colors.textMuted} />
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
          End-to-end encrypted · {info.items} {kind.unit}{(info.mtime) ? ` · changed ${formatChanged(new Date(info.mtime), fmt).replace(/^(\d)/, "at $1")}` : ""}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {admin && <Button label="Save changes" primary disabled={!changed} onPress={save} />}
        {admin && changed && <Button label="Cancel" onPress={() => {
          setName(info.name);
          setDescription(info.description);
          setColor(info.color);
        }} />}
        <Button label="Changes" icon="history" onPress={() => navigation.navigate("Root", { screen: "CollectionChangelog", params: { colUid: info.colUid } })} />
        <Button label="Export" icon="tray-arrow-down" onPress={async () => {
          const n = await exportCollection(etebase, info.colUid);
          dispatch(pushMessage({ message: `Exported ${n} ${kind.unit}`, severity: "success" }) as any);
        }} />
        {(info.accessLevel !== Etebase.CollectionAccessLevel.ReadOnly) && <Button label="Import…" icon="tray-arrow-up" onPress={() => dialogs.importFiles(info.colUid)} />}
      </View>
      <View style={[styles.danger, { borderColor: tint(theme.colors.error, 0.35), backgroundColor: tint(theme.colors.error, 0.06) }]}>
        <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: theme.colors.textSecondary }}>
          {(admin) ? `Deleting removes this ${kind.noun} and everything in it ${((sharedWith ?? 1) > 1) ? `for all ${sharedWith} people` : "from all your devices"}. This can’t be undone.` :
            `Leaving removes this ${kind.noun} from your devices; the others keep it.`}
        </Text>
        <Button label={(admin) ? `Delete ${kind.noun}…` : `Leave ${kind.noun}…`} danger onPress={() => setDeleting(true)} />
      </View>
      <DeleteDialog info={info} visible={deleting} members={sharedWith} onDone={(deleted) => {
        setDeleting(false);
        if (deleted) {
          props.onClose?.();
          leaveDeleted(navigation, info.colUid);
        }
      }} />
      {inviteKey && (
        <ConfirmationDialog
          title="Verify the security fingerprint"
          labelOk="Invite"
          visible
          onOk={async () => {
            const key = inviteKey;
            setInviteKey(undefined);
            await changeAccess(() => inviteMember(etebase, info.colUid, invitee.trim(), key,
              (readOnly) ? Etebase.CollectionAccessLevel.ReadOnly : Etebase.CollectionAccessLevel.ReadWrite),
            `Invitation sent to ${invitee.trim()}. They have access once they accept it.`);
            setInvitee("");
          }}
          onCancel={() => setInviteKey(undefined)}
        >
          <Paragraph>Check {invitee.trim()}'s security fingerprint with them, so you know it's really them (and the encryption is safe).</Paragraph>
          <PrettyFingerprint publicKey={inviteKey} />
          <TouchableRipple accessibilityRole="checkbox" accessibilityLabel="Read only" accessibilityState={{ checked: readOnly }} aria-checked={readOnly} onPress={() => setReadOnly(!readOnly)} style={{ marginTop: 12, borderRadius: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name={(readOnly) ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={theme.colors.accent} />
              <Text style={{ color: theme.colors.text }}>Read only (they can't change anything)</Text>
            </View>
          </TouchableRipple>
        </ConfirmationDialog>
      )}
    </View>
  );
}

export default function CollectionsScreen(props: { route: RouteProp<RootStackParamList, "Collections"> }) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const dialogs = useDialogs();
  const fmt = useDateFormats();
  const wide = useWindowDimensions().width >= 1100;
  const infos = useCollectionInfos(etebase);
  const [filter, setFilter] = React.useState<Kind | "all">(props.route.params?.kind ?? "all");
  const [selected, setSelected] = React.useState<string | undefined>(props.route.params?.colUid);
  const [members, setMembers] = React.useState<{ [colUid: string]: Member[] }>({});

  React.useEffect(() => {
    if (props.route.params?.colUid) {
      setSelected(props.route.params.colUid);
    }
    if (props.route.params?.kind) {
      setFilter(props.route.params.kind);
    }
  }, [props.route.params?.colUid, props.route.params?.kind]);

  // Who the collections are shared with (only their admins can see that; it needs the server)
  async function fetchMembers(colUids: string[]) {
    const fetched: { [colUid: string]: Member[] } = {};
    await Promise.all(colUids.map(async (colUid) => {
      try {
        fetched[colUid] = await listMembers(etebase, colUid);
      } catch (e) {
        // (offline: not known)
      }
    }));
    setMembers((current) => ({ ...current, ...fetched }));
  }
  const adminUids = infos.filter((x) => x.accessLevel === Etebase.CollectionAccessLevel.Admin).map((x) => x.colUid).join(",");
  React.useEffect(() => {
    if (adminUids) {
      fetchMembers(adminUids.split(","));
    }
  }, [adminUids]);

  if (syncGate) {
    return syncGate;
  }

  const groups = kindOrder.filter((k) => (filter === "all") || (filter === k)).map((k) => ({ kind: k, rows: infos.filter((x) => x.kind === k) }));
  // (on wide screens one is always shown: the first of the list, until one is chosen)
  const current = infos.find((x) => x.colUid === selected) ?? ((wide) ? groups.flatMap((g) => g.rows)[0] : undefined);

  const panel = current && (
    <CollectionPanel
      key={current.colUid}
      info={current}
      members={members[current.colUid]}
      shareFirst={!!props.route.params?.share}
      onMembersChanged={() => fetchMembers([current.colUid])}
      onClose={(wide) ? undefined : () => setSelected(undefined)}
    />
  );

  if (!wide && current) {
    return <ScrollView contentContainerStyle={{ padding: 20 }}>{panel}</ScrollView>;
  }

  const sharedLabel = (info: CollectionInfo) => {
    if (info.accessLevel !== Etebase.CollectionAccessLevel.Admin) {
      return { text: "Shared with you", avatars: [] as string[] };
    }
    const list = members[info.colUid];
    if (!list) {
      return { text: "…", avatars: [] };
    }
    const others = list.filter((m) => m.username !== etebase.user.username);
    return { text: (others.length === 0) ? "Only you" : (others.length === 1) ? others[0].username : `${others.length} people`, avatars: others.slice(0, 3).map((m) => initials(m.username)) };
  };

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 260, gap: 2 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.semibold, letterSpacing: 0.7, textTransform: "uppercase", color: theme.colors.textMuted }}>Settings</Text>
            <Text style={{ fontSize: 26, fontFamily: fonts.semibold, color: theme.colors.text }} accessibilityRole="header">Collections</Text>
            <Text style={{ color: theme.colors.textMuted }}>
              Calendars, address books, task lists, notebooks and bookmark lists for <Text style={{ fontFamily: fonts.medium, color: theme.colors.textSecondary }}>{etebase.user.username}</Text> on <Text style={{ fontFamily: mono, color: theme.colors.textSecondary }}>{host(etebase.serverUrl)}</Text>.
            </Text>
          </View>
          <Button label="Import…" icon="tray-arrow-up" onPress={() => dialogs.importFiles()} />
          <Button label="New collection" icon="plus" primary onPress={() => dialogs.newCollection((filter === "all") ? undefined : filter)} />
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(["all", ...kindOrder] as (Kind | "all")[]).map((k) => {
            const on = filter === k;
            const count = (k === "all") ? infos.length : infos.filter((x) => x.kind === k).length;
            return (
              <TouchableRipple
                key={k}
                accessibilityRole="tab"
                accessibilityLabel={(k === "all") ? "All" : kinds[k].label}
                accessibilityState={{ selected: on }}
                aria-selected={on}
                onPress={() => setFilter(k)}
                style={[styles.tab, { borderColor: (on) ? theme.colors.chipActive : theme.colors.border, backgroundColor: (on) ? theme.colors.chipActive : "transparent" }]}
              >
                <Text style={{ fontSize: 13, color: (on) ? theme.colors.onChipActive : theme.colors.textSecondary }}>
                  {(k === "all") ? "All" : kinds[k].label} <Text style={{ fontSize: 12, color: (on) ? theme.colors.onChipActive : theme.colors.textMuted, opacity: 0.75 }}>{count}</Text>
                </Text>
              </TouchableRipple>
            );
          })}
        </View>
        {groups.map(({ kind, rows }) => (
          <View key={kind} style={{ gap: 6 }} accessibilityLabel={kinds[kind].label} testID={`collections-${kind}`}>
            <View style={styles.groupHead}>
              <MaterialCommunityIcons name={kinds[kind].icon as any} size={17} color={theme.colors.textSecondary} />
              <Text style={{ fontSize: 15, fontFamily: fonts.semibold, color: theme.colors.text }}>{kinds[kind].label}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{rows.length}</Text>
              <View style={{ flex: 1 }} />
              <Text accessibilityRole="button" onPress={() => dialogs.newCollection(kind)} style={{ fontSize: 13, color: theme.colors.accentText }}>+ New {kinds[kind].noun}</Text>
            </View>
            <View style={[styles.table, { borderColor: theme.colors.border }]}>
              <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}>
                <Text style={[styles.colName, styles.th, { color: theme.colors.textMuted }]}>Name</Text>
                <Text style={[styles.colItems, styles.th, { color: theme.colors.textMuted }]}>Items</Text>
                <Text style={[styles.colShared, styles.th, { color: theme.colors.textMuted }]}>Shared with</Text>
                <Text style={[styles.colChanged, styles.th, { color: theme.colors.textMuted }]}>Changed</Text>
                <View style={{ width: 32 }} />
              </View>
              {(rows.length === 0) && <Text style={{ padding: 14, color: theme.colors.textMuted }}>No {kinds[kind].label.toLowerCase()} yet</Text>}
              {rows.map((info, idx) => {
                const on = current?.colUid === info.colUid;
                const shared = sharedLabel(info);
                return (
                  <View key={info.colUid} style={[styles.row, (idx > 0) ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider } : undefined,
                    (on) ? { backgroundColor: theme.colors.accentTint } : undefined]}>
                    <TouchableRipple
                      accessibilityRole="button"
                      accessibilityLabel={`${kinds[kind].one} ${info.name}`}
                      aria-selected={on}
                      onPress={() => setSelected(info.colUid)}
                      style={{ flex: 1, alignSelf: "stretch", justifyContent: "center" }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={[styles.colName, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
                          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: info.color }} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ color: theme.colors.text, fontFamily: fonts.medium }}>{info.name}</Text>
                            <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textMuted }}>{info.description || "No description"}</Text>
                          </View>
                        </View>
                        <Text style={[styles.colItems, { color: theme.colors.textSecondary, fontSize: 13 }]}>{info.items} {kinds[kind].unit}</Text>
                        <View style={[styles.colShared, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                          {shared.avatars.map((a, i) => (
                            <View key={i} style={[styles.avatar, { width: 22, height: 22, marginLeft: (i > 0) ? -10 : 0, backgroundColor: theme.colors.field, borderColor: theme.colors.surface, borderWidth: 2 }]}>
                              <Text style={{ fontSize: 9, fontFamily: fonts.semibold, color: theme.colors.textSecondary }}>{a}</Text>
                            </View>
                          ))}
                          <Text numberOfLines={1} style={{ fontSize: 13, color: (shared.avatars.length) ? theme.colors.textSecondary : theme.colors.textMuted }}>{shared.text}</Text>
                        </View>
                        <Text style={[styles.colChanged, { fontSize: 13, color: theme.colors.textMuted }]}>{(info.mtime) ? formatChanged(new Date(info.mtime), fmt) : "—"}</Text>
                      </View>
                    </TouchableRipple>
                    <CollectionMenu info={info} onEdit={() => setSelected(info.colUid)} />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      {wide && panel && (
        <ScrollView style={[styles.side, { borderLeftColor: theme.colors.border, backgroundColor: tint(theme.colors.sidebar, 0.6) }]} contentContainerStyle={{ padding: 22 }}>
          {panel}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    gap: 22,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  table: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 6,
  },
  th: {
    fontSize: 12,
    paddingVertical: 8,
  },
  colName: {
    flex: 1,
    minWidth: 140,
    paddingRight: 12,
  },
  colItems: {
    width: 110,
  },
  colShared: {
    width: 150,
  },
  colChanged: {
    width: 90,
  },
  more: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  side: {
    width: 380,
    flexGrow: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  bigSwatch: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  access: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  danger: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
});
