// SPDX-FileCopyrightText: © 2017 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

// Changes the main details of a contact. Contacts can have more of each (e.g. several phone numbers),
// this only changes the first one, and keeps everything else as it is.

import * as React from "react";
import { ScrollView, View } from "react-native";
import { HelperText, Text } from "react-native-paper";
import { useDispatch } from "react-redux";
import { RouteProp, useNavigation } from "@react-navigation/native";
import * as ICAL from "ical.js";
import * as uuid from "uuid";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { pushMessage } from "../store/actions";
import { RootStackParamList } from "../RootStackParamList";
import { goUp } from "../navigation";
import LoadingIndicator from "../widgets/LoadingIndicator";
import NotFound from "../widgets/NotFound";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import AppbarAction from "../widgets/AppbarAction";
import * as C from "../constants";
import { ContactType } from "./pim-types";
import { deletePimItem, savePimItem, usePimCollections, usePimItems } from "./data";
import { AccentButton, CollectionPicker, Field, FieldInput, pimStyles } from "./widgets";
import { contactName } from "./ContactsScreen";

interface PropsType {
  route: RouteProp<RootStackParamList, "ContactEdit">;
}

const fields = [
  { prop: "tel", label: "Phone" },
  { prop: "email", label: "Email" },
  { prop: "org", label: "Organization" },
  { prop: "note", label: "Note" },
];

function firstValue(contact: ContactType | undefined, prop: string) {
  const value = contact?.comp.getFirstPropertyValue(prop);
  return (Array.isArray(value)) ? value.join(" ") : String(value ?? "").replace(/^tel:/, "");
}

export default function ContactEditScreen(props: PropsType) {
  const { colUid, itemUid } = props.route.params ?? {};
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const books = usePimCollections(C.contactsType);
  const contacts = usePimItems(etebase, C.contactsType, ContactType.parse);
  const existing = (itemUid) ? contacts?.find((x) => (x.itemUid === itemUid) && (x.collectionUid === colUid)) : undefined;

  const [loaded, setLoaded] = React.useState(false);
  const [name, setName] = React.useState("");
  const [book, setBook] = React.useState<string>();
  const [values, setValues] = React.useState<{ [prop: string]: string }>({});
  const [error, setError] = React.useState<string>();
  const [deleteShown, setDeleteShown] = React.useState(false);

  React.useEffect(() => {
    if (loaded || !contacts) {
      return;
    }
    setBook(existing?.collectionUid ?? colUid ?? books[0]?.colUid);
    if (existing) {
      setName((existing.fn as string) ?? "");
      setValues(Object.fromEntries(fields.map(({ prop }) => [prop, firstValue(existing, prop)])));
    }
    setLoaded(true);
  }, [contacts, existing, loaded]);

  React.useEffect(() => {
    navigation.setOptions({
      title: (itemUid) ? "Edit Contact" : "New Contact",
      headerRight: () => (itemUid) ? (
        <AppbarAction icon="delete" accessibilityLabel="Delete" onPress={() => setDeleteShown(true)} />
      ) : null,
    });
  }, [itemUid]);

  if (syncGate) {
    return syncGate;
  }
  if (!contacts || !loaded) {
    return <LoadingIndicator />;
  }
  if (itemUid && !existing) {
    return <NotFound />;
  }

  async function save() {
    if (!book) {
      setError("Choose an address book");
      return;
    }
    if (!name.trim()) {
      setError("The contact needs a name");
      return;
    }

    let contact: ContactType;
    if (existing) {
      contact = existing.clone();
      contact.collectionUid = existing.collectionUid;
      contact.itemUid = existing.itemUid;
    } else {
      contact = new ContactType(new ICAL.Component(["vcard", [], []]));
      contact.comp.updatePropertyWithValue("version", "4.0");
      contact.uid = uuid.v4();
    }
    const comp = contact.comp;
    comp.updatePropertyWithValue("prodid", "-//iCal.js EteSync Web");
    comp.updatePropertyWithValue("rev", ICAL.Time.now());
    if (name.trim() !== existing?.fn) {
      comp.updatePropertyWithValue("fn", name.trim());
      // The structured name: last name, first name, middle name(s), prefix, suffix
      const parts = name.trim().split(/\s+/);
      const last = (parts.length > 1) ? parts.pop()! : "";
      comp.updatePropertyWithValue("n", [last, parts.join(" "), "", "", ""]);
    }
    for (const { prop } of fields) {
      const value = (values[prop] ?? "").trim();
      const property = comp.getFirstProperty(prop);
      if (value === firstValue(existing, prop)) {
        continue;
      } else if (!value) {
        if (property) {
          comp.removeProperty(property);
        }
      } else if (property) {
        property.setValue((prop === "org") ? [value] as any : value);
      } else {
        comp.addPropertyWithValue(prop, (prop === "org") ? [value] as any : value);
      }
    }

    try {
      await savePimItem(etebase, book, contact);
      dispatch(pushMessage({ message: (existing) ? "Contact saved" : "Contact created", severity: "success" }) as any);
      goUp(navigation, props.route);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    setDeleteShown(false);
    await deletePimItem(etebase, existing!);
    dispatch(pushMessage({ message: "Contact deleted", severity: "success" }) as any);
    navigation.navigate("Contacts");
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={pimStyles.form}>
        <Field label="Name">
          <FieldInput autoFocus={!existing} value={name} onChangeText={setName} accessibilityLabel="Name" />
        </Field>
        <Field label="Address book">
          <CollectionPicker label="Address book" collections={books} value={book} onChange={setBook} />
        </Field>
        {fields.map(({ prop, label }) => (
          <Field key={prop} label={label}>
            <FieldInput
              value={values[prop] ?? ""}
              onChangeText={(x) => setValues({ ...values, [prop]: x })}
              accessibilityLabel={label}
              multiline={prop === "note"}
              style={(prop === "note") ? { minHeight: 90, textAlignVertical: "top" } : undefined}
            />
          </Field>
        ))}
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <AccentButton label="Save" onPress={save} style={{ alignSelf: "flex-end" }} />
      </View>
      <ConfirmationDialog
        title="Delete Contact"
        visible={deleteShown}
        onOk={remove}
        onCancel={() => setDeleteShown(false)}
      >
        <Text>Delete "{existing && contactName(existing)}"?</Text>
      </ConfirmationDialog>
    </ScrollView>
  );
}
