// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { ScrollView, View } from "react-native";
import { HelperText } from "react-native-paper";
import { useDispatch } from "react-redux";
import { RouteProp, useNavigation } from "@react-navigation/native";

import { useCredentials } from "../credentials";
import { pushMessage } from "../store/actions";
import { RootStackParamList } from "../RootStackParamList";
import { goUp } from "../navigation";
import ColorPicker from "../widgets/ColorPicker";
import * as C from "../constants";
import { createPimCollection, defaultColor } from "./data";
import { AccentButton, Field, FieldInput, pimStyles } from "./widgets";

export const collectionNames: { [colType: string]: string } = {
  [C.calendarType]: "Calendar",
  [C.tasksType]: "Task List",
  [C.contactsType]: "Address Book",
};

export default function PimCollectionCreateScreen(props: { route: RouteProp<RootStackParamList, "PimCollectionCreate"> }) {
  const { colType } = props.route.params;
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const etebase = useCredentials()!;
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("");
  const [error, setError] = React.useState<string>();
  const kind = collectionNames[colType] ?? "Collection";

  React.useEffect(() => {
    navigation.setOptions({ title: `New ${kind}` });
  }, [kind]);

  async function save() {
    if (!name.trim()) {
      setError("The name is required");
      return;
    }
    if (color && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) {
      setError("The color must be of the form #RRGGBB");
      return;
    }
    await createPimCollection(etebase, colType, name.trim(), color || undefined);
    dispatch(pushMessage({ message: `${kind} created`, severity: "success" }) as any);
    goUp(navigation, props.route);
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={pimStyles.form}>
        <Field label="Name">
          <FieldInput autoFocus value={name} onChangeText={setName} onSubmitEditing={save} accessibilityLabel="Name" />
        </Field>
        <ColorPicker defaultColor={defaultColor} color={color} onChange={setColor} />
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <AccentButton label="Create" onPress={save} style={{ alignSelf: "flex-end" }} />
      </View>
    </ScrollView>
  );
}
