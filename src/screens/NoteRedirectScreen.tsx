// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useNavigation, RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";

import { RootStackParamList } from "../RootStackParamList";
import LoadingIndicator from "../widgets/LoadingIndicator";

type NavigationProp = StackNavigationProp<RootStackParamList, "NoteProps">;

interface PropsType {
  route: RouteProp<RootStackParamList, "NoteProps"> | RouteProp<RootStackParamList, "NoteMove">;
}

// The properties and the move of a note used to be screens of their own. They're changed in the
// note itself now, so their addresses open the note.
export default function NoteRedirectScreen(props: PropsType) {
  const navigation = useNavigation<NavigationProp>();
  const { colUid, itemUid } = props.route.params;

  React.useEffect(() => {
    navigation.replace("NoteEdit", { colUid, itemUid });
  }, []);

  return <LoadingIndicator />;
}
