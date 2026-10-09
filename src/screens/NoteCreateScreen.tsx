// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useSelector } from "react-redux";
import { Paragraph } from "react-native-paper";
import { useNavigation, RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";

import { useSyncGate } from "../SyncGate";
import { useCredentials } from "../credentials";
import { StoreState, useAsyncDispatch } from "../store";
import { setCacheItem } from "../store/actions";
import { newNotes, openInEditor } from "../newNotes";
import { NoteMetadata } from "../helpers";
import { RootStackParamList } from "../RootStackParamList";

import Container from "../widgets/Container";
import FormButton from "../widgets/FormButton";
import LoadingIndicator from "../widgets/LoadingIndicator";

type NavigationProp = StackNavigationProp<RootStackParamList, "NoteCreate">;

interface PropsType {
  route: RouteProp<RootStackParamList, "NoteCreate">;
}

// Creates a note and opens it, where its title, notebook and content are written. It's in the given
// notebook, or the one the notes are filtered by, or else the first one.
export default function NoteCreateScreen(props: PropsType) {
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const filterBy = useSelector((state: StoreState) => state.settings.viewSettings.filterBy);
  const syncGate = useSyncGate();
  const navigation = useNavigation<NavigationProp>();
  const etebase = useCredentials()!;
  const dispatch = useAsyncDispatch();
  const creating = React.useRef(false);

  const wanted = props.route.params?.colUid ?? filterBy ?? undefined;
  const colUid = (wanted && cacheCollections.has(wanted)) ? wanted : Array.from(cacheCollections.entries())
    .sort(([_a, a], [_b, b]) => (a.meta.name ?? "").localeCompare(b.meta.name ?? ""))[0]?.[0];

  React.useEffect(() => {
    navigation.setOptions({ title: "New Note" });
  }, [navigation]);

  React.useEffect(() => {
    if (syncGate || !colUid || creating.current) {
      return;
    }
    creating.current = true;

    (async () => {
      const colMgr = etebase.getCollectionManager();
      const col = colMgr.cacheLoad(cacheCollections.get(colUid)!.cache);
      const itemMgr = colMgr.getItemManager(col);
      const meta: NoteMetadata = {
        name: "",
        mtime: (new Date()).getTime(),
      };
      const item = await itemMgr.create(meta, "");
      // Only pushed to the server once it gets a title or content, see newNotes
      await dispatch(setCacheItem(col, itemMgr, item));
      newNotes.add(item.uid);
      openInEditor.add(item.uid);
      navigation.replace("NoteEdit", { colUid, itemUid: item.uid });
    })();
  }, [syncGate, colUid]);

  if (syncGate) {
    return syncGate;
  }

  if (!colUid) {
    return (
      <Container>
        <Paragraph>Notes are kept in notebooks, so there has to be one first.</Paragraph>
        <FormButton onPress={() => navigation.navigate("CollectionCreate")}>
          Create a notebook
        </FormButton>
      </Container>
    );
  }

  return <LoadingIndicator />;
}
