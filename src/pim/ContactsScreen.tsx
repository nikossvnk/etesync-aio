// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { RootStackParamList } from "../RootStackParamList";
import { StoreState } from "../store";
import { useNoteSearch } from "../search";
import { openExternalUrl, safeExternalUrl } from "../helpers";
import LoadingIndicator from "../widgets/LoadingIndicator";
import NotFound from "../widgets/NotFound";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import { ContactType, TaskType } from "./pim-types";
import { usePimCollections, usePimItems } from "./data";
import { AccentButton, EmptyState } from "./widgets";
import { useDateFormats } from "./format";
import { useDialogs } from "./Dialogs";
import { addDays, contactBirthday, initials, startOfDay, useOccurrences } from "./occurrences";
import { formatDue } from "./TasksScreen";
import { formatRange } from "./CalendarParts";

export function contactName(contact: ContactType) {
  return (contact.fn as string | undefined)?.trim() || "(no name)";
}

function Avatar(props: { name: string, size: number }) {
  const theme = useTheme();
  return (
    <View style={{ width: props.size, height: props.size, borderRadius: props.size / 2, backgroundColor: theme.colors.field, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.colors.textSecondary, fontFamily: fonts.semibold, fontSize: props.size * 0.36 }}>{initials(props.name)}</Text>
    </View>
  );
}

function values(contact: ContactType, name: string): { value: string, type?: string }[] {
  return contact.comp.getAllProperties(name).map((prop) => {
    let value = prop.getFirstValue();
    if (Array.isArray(value)) {
      // (e.g. addresses: post office box, extended, street, city, region, code, country)
      value = value.filter((x) => x).join(", ");
    } else if (value && (typeof value === "object")) {
      value = value.toString();
    }
    const type = prop.getParameter("type");
    return { value: String(value ?? "").replace(/^tel:/, ""), type: (Array.isArray(type)) ? type.join(", ") : type };
  }).filter((x) => x.value);
}

function first(contact: ContactType, name: string) {
  return values(contact, name)[0]?.value;
}

// The line under a contact's name: their title and organization (or an email)
function subtitle(contact: ContactType) {
  const parts = [first(contact, "title"), first(contact, "org")].filter((x) => x);
  return (parts.length) ? parts.join(" · ") : (first(contact, "email") ?? first(contact, "tel") ?? "");
}

function Card(props: React.PropsWithChildren<{ title: string, testID?: string }>) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} testID={props.testID}>
      <Text style={[styles.cardTitle, { color: theme.colors.textMuted }]}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function Action(props: { icon: string, label: string, onPress?: () => void, iconOnly?: boolean }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={!props.onPress}
      onPress={props.onPress}
      style={[styles.action, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: (props.onPress) ? 1 : 0.45 }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <MaterialCommunityIcons name={props.icon as any} size={16} color={theme.colors.text} />
        {!props.iconOnly && <Text style={{ fontSize: 13, color: theme.colors.text }}>{props.label}</Text>}
      </View>
    </TouchableRipple>
  );
}

// The details of a contact, and what else is about them: events with them, notes and tasks that
// mention them
export function ContactDetails(props: { contact: ContactType }) {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const etebase = useCredentials();
  const fmt = useDateFormats();
  const wide = useWindowDimensions().width >= 1100;
  const { contact } = props;
  const name = contactName(contact);
  const firstName = name.split(/\s+/)[0];
  const email = first(contact, "email");
  const phone = first(contact, "tel");
  const books = usePimCollections(C.contactsType);
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  const today = startOfDay(new Date());
  const { occurrences } = useOccurrences(today, addDays(today, 90));
  const notes = useNoteSearch(firstName, true);
  const groups = (contacts ?? []).filter((x) => x.group && x.members.includes(contact.uid)).map((x) => String(x.fn));
  const book = books.find((x) => x.colUid === contact.collectionUid);
  const lower = name.toLowerCase();
  const mentions = (text?: string | null) => !!text && (text.toLowerCase().includes(lower) || ((firstName.length >= 3) && new RegExp(`\\b${firstName.replace(/[^\p{L}\p{N}]/gu, "")}\\b`, "iu").test(text)));

  // Events with them (they're invited, or named in it), and their birthday
  const together = (occurrences ?? []).filter((x) => (
    (x.contact === contact) || (x.contact?.uid === contact.uid) ||
    (email && x.attendees.some((a) => a.email?.toLowerCase() === email.toLowerCase())) ||
    x.title.toLowerCase().includes(lower)
  )).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 4);
  const mentioned = notes.filter((x) => mentions(String(x.name)) || mentions(String(x.content))).slice(0, 4);
  const related = (tasks ?? []).filter((x) => !x.finished && (mentions(x.title) || mentions(x.description))).slice(0, 4);

  const bday = contactBirthday(contact);
  const rows: { label: string, value: string, link?: string }[] = [
    ...values(contact, "email").map((x) => ({ label: (x.type) ? `Email (${x.type})` : "Email", value: x.value, link: `mailto:${x.value}` })),
    ...values(contact, "tel").map((x) => ({ label: (x.type) ? `Phone (${x.type})` : "Phone", value: x.value, link: `tel:${x.value.replace(/\s/g, "")}` })),
    ...values(contact, "adr").map((x) => ({ label: "Address", value: x.value })),
    ...((bday) ? [{ label: "Birthday", value: fmt.dayMonth.format(new Date(bday.year ?? 2000, bday.month, bday.day)) + ((bday.year) ? ` ${bday.year}` : "") }] : []),
    ...values(contact, "url").map((x) => ({ label: "Website", value: x.value, link: x.value })),
    ...values(contact, "note").map((x) => ({ label: "Note", value: x.value })),
  ];
  const empty = (text: string) => <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{text}</Text>;

  return (
    <View style={styles.details}>
      <View style={styles.detailsHeader}>
        <Avatar name={name} size={72} />
        <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
          <Text style={[styles.detailsName, { color: theme.colors.text }]} testID="contact-name">{name}</Text>
          {!!subtitle(contact) && <Text style={{ color: theme.colors.textSecondary }}>{subtitle(contact)}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {[...((book && books.length > 1) ? [book.name] : []), ...groups].map((x) => (
              <Text key={x} style={[styles.chip, { color: theme.colors.textSecondary, borderColor: theme.colors.border }]}>{x}</Text>
            ))}
          </View>
        </View>
        <View style={styles.actions}>
          <Action icon="email-outline" label="Email" onPress={(email) ? () => openExternalUrl(`mailto:${email}`) : undefined} />
          <Action icon="phone-outline" label="Call" onPress={(phone) ? () => openExternalUrl(`tel:${phone.replace(/\s/g, "")}`) : undefined} />
          <Action icon="calendar-plus" label="Schedule" onPress={() => navigation.navigate("EventEdit", { title: `With ${name}`, attendeeName: name, attendeeEmail: email })} />
          <Action icon="pencil-outline" label="Edit contact" iconOnly onPress={() => navigation.navigate("ContactEdit", { colUid: contact.collectionUid, itemUid: contact.itemUid })} />
        </View>
      </View>

      <View style={[styles.cards, (wide) ? { flexDirection: "row", flexWrap: "wrap" } : undefined]}>
        <Card title="Contact" testID="contact-info">
          {(rows.length === 0) && empty("No details yet.")}
          {rows.map((x, idx) => (
            <View key={idx} style={styles.dl}>
              <Text style={[styles.dt, { color: theme.colors.textMuted }]}>{x.label}</Text>
              <Text
                selectable
                style={{ flex: 1, color: (x.link && safeExternalUrl(x.link)) ? theme.colors.accentText : theme.colors.text }}
                onPress={(x.link && safeExternalUrl(x.link)) ? () => openExternalUrl(x.link!) : undefined}
              >
                {x.value}
              </Text>
            </View>
          ))}
        </Card>
        <Card title="Coming up together" testID="contact-events">
          {(together.length === 0) && empty(`Nothing scheduled with ${firstName}.`)}
          {together.map((x) => (
            <TouchableRipple
              key={x.key}
              accessibilityRole="button"
              accessibilityLabel={`Event ${x.title}`}
              onPress={() => navigation.navigate("Calendar")}
              style={styles.item}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: "uppercase" }}>{fmt.weekDay.format(x.start)}</Text>
                  <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: theme.colors.text }}>{x.start.getDate()}</Text>
                </View>
                <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: x.color }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.medium, color: theme.colors.text }}>{x.title}</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{fmt.monthShort.format(x.start)} · {formatRange(x, fmt)}</Text>
                </View>
              </View>
            </TouchableRipple>
          ))}
        </Card>
        <Card title="Mentioned in notes" testID="contact-notes">
          {(mentioned.length === 0) && empty(`No notes mention ${firstName} yet.`)}
          {mentioned.map((x) => {
            const [colUid, itemUid] = String(x.id).split(":");
            const content = String(x.content ?? "").replace(/\s+/g, " ");
            const at = Math.max(0, content.toLowerCase().indexOf(firstName.toLowerCase()) - 40);
            return (
              <TouchableRipple
                key={String(x.id)}
                accessibilityRole="button"
                accessibilityLabel={`Note ${x.name}`}
                onPress={() => navigation.navigate("NoteEdit", { colUid, itemUid })}
                style={styles.item}
              >
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <MaterialCommunityIcons name="file-document-outline" size={14} color={theme.colors.textMuted} />
                    <Text style={{ fontFamily: fonts.medium, color: theme.colors.text }}>{x.name}</Text>
                  </View>
                  <Text numberOfLines={2} style={{ fontSize: 13, color: theme.colors.textSecondary }}>{(at > 0) ? "…" : ""}{content.slice(at, at + 140)}</Text>
                </View>
              </TouchableRipple>
            );
          })}
        </Card>
        <Card title="Related tasks" testID="contact-tasks">
          {(related.length === 0) && empty("No open tasks.")}
          {related.map((x) => (
            <TouchableRipple
              key={x.uid}
              accessibilityRole="button"
              accessibilityLabel={`Task ${x.title}`}
              onPress={() => navigation.navigate("TaskEdit", { colUid: x.collectionUid, itemUid: x.itemUid })}
              style={styles.item}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <MaterialCommunityIcons name="checkbox-blank-outline" size={18} color={theme.colors.textMuted} />
                <Text style={{ flex: 1, color: theme.colors.text }}>{x.title}</Text>
                {x.dueDate && <Text style={{ fontSize: 12, color: (x.overdue) ? theme.colors.error : theme.colors.textMuted }}>{formatDue(x, fmt)}</Text>}
              </View>
            </TouchableRipple>
          ))}
        </Card>
      </View>
    </View>
  );
}

export default function ContactsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const dialogs = useDialogs();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const wide = useWindowDimensions().width >= 1100;
  const books = usePimCollections(C.contactsType);
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const filter = useSelector((state: StoreState) => state.settings.contactsFilter) ?? null;
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string>();

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let ret = (contacts ?? []).filter((x) => !x.group);
    if (filter?.startsWith("book:")) {
      ret = ret.filter((x) => x.collectionUid === filter.slice(5));
    } else if (filter?.startsWith("group:")) {
      const group = (contacts ?? []).find((x) => x.group && (x.uid === filter.slice(6)));
      ret = ret.filter((x) => group?.members.includes(x.uid));
    }
    return ret
      .filter((x) => !q || x.toIcal().toLowerCase().includes(q))
      .sort((a, b) => contactName(a).localeCompare(contactName(b)));
  }, [contacts, filter, query]);

  if (syncGate) {
    return syncGate;
  }
  if (!contacts) {
    return <LoadingIndicator />;
  }
  if (books.length === 0) {
    return (
      <EmptyState
        icon="account-box-outline"
        title="No address books yet"
        text="Create an address book to add contacts to it."
        action={<AccentButton icon="plus" label="New address book" onPress={() => dialogs.newCollection("contacts")} />}
      />
    );
  }

  const current = (wide) ? (shown.find((x) => `${x.collectionUid}/${x.itemUid}` === selected) ?? shown[0]) : undefined;
  const filterBook = (filter?.startsWith("book:")) ? filter.slice(5) : undefined;
  // A to Z, with a heading for each letter
  const sections: { letter: string, items: ContactType[] }[] = [];
  for (const contact of shown) {
    const letter = contactName(contact)[0]?.toUpperCase().replace(/[^\p{L}]/u, "#") ?? "#";
    if (sections[sections.length - 1]?.letter !== letter) {
      sections.push({ letter, items: [] });
    }
    sections[sections.length - 1].items.push(contact);
  }

  const list = (
    <View style={[{ flex: 1 }, (wide) ? { maxWidth: 360, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.colors.border, backgroundColor: theme.colors.sidebar } : undefined]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header">Contacts</Text>
          <Text style={{ color: theme.colors.textMuted }}>{shown.length}</Text>
          <View style={{ flex: 1 }} />
          <AccentButton icon="plus" label="New contact" onPress={() => navigation.navigate("ContactEdit", { colUid: filterBook })} />
        </View>
        <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <MaterialCommunityIcons name="magnify" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name, company or email"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Search contacts"
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
        {(shown.length === 0) && <Text style={{ color: theme.colors.textMuted, padding: 12 }}>No contacts</Text>}
        {sections.map((section) => (
          <View key={section.letter}>
            <Text style={[styles.letter, { color: theme.colors.textMuted }]}>{section.letter}</Text>
            {section.items.map((contact) => {
              const key = `${contact.collectionUid}/${contact.itemUid}`;
              const isSelected = current === contact;
              const name = contactName(contact);
              return (
                <TouchableRipple
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`Contact ${name}`}
                  aria-selected={isSelected}
                  onPress={() => (wide) ? setSelected(key) : navigation.navigate("Contact", { colUid: contact.collectionUid, itemUid: contact.itemUid })}
                  style={[styles.row, (isSelected) ? { backgroundColor: theme.colors.accentTint } : undefined]}
                >
                  <View style={styles.rowInner}>
                    <Avatar name={name} size={36} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontFamily: fonts.medium }}>{name}</Text>
                      {!!subtitle(contact) && <Text numberOfLines={1} style={{ color: theme.colors.textMuted, fontSize: 12 }}>{subtitle(contact)}</Text>}
                    </View>
                  </View>
                </TouchableRipple>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  if (!wide) {
    return list;
  }

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {list}
      <ScrollView style={{ flex: 1.6 }}>
        {(current) ? <ContactDetails contact={current} /> : (
          <EmptyState icon="account-outline" title="No contact chosen" />
        )}
      </ScrollView>
    </View>
  );
}

// A contact on its own screen (on narrow screens, and from the search and the calendar)
export function ContactScreen(props: { route: RouteProp<RootStackParamList, "Contact"> }) {
  const { colUid, itemUid } = props.route.params;
  const navigation = useNavigation<any>();
  const etebase = useCredentials()!;
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const contact = contacts?.find((x) => (x.collectionUid === colUid) && (x.itemUid === itemUid));

  React.useEffect(() => {
    navigation.setOptions({
      title: (contact) ? contactName(contact) : "Contact",
    });
  }, [contact]);

  if (!contacts) {
    return <LoadingIndicator />;
  }
  if (!contact) {
    return <NotFound />;
  }
  return (
    <ScrollView>
      <ContactDetails contact={contact} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 22,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 9,
    paddingLeft: 10,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  letter: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  details: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    padding: 28,
    gap: 24,
  },
  detailsHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 20,
  },
  detailsName: {
    fontFamily: fonts.semibold,
    fontSize: 26,
    letterSpacing: -0.3,
  },
  chip: {
    fontSize: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
    overflow: "hidden",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  action: {
    height: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
  },
  cards: {
    gap: 16,
  },
  card: {
    flexGrow: 1,
    flexBasis: 380,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  dl: {
    flexDirection: "row",
    gap: 12,
  },
  dt: {
    width: 110,
    fontSize: 13,
  },
  item: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
});
