// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useDateFormats } from "../pim/format";
import { useSelector } from "react-redux";
import { FlatList, View } from "react-native";
import { Divider, Text, List } from "react-native-paper";
import { useTheme } from "../theme";
import { useNavigation, RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";

import { useSyncGate } from "../SyncGate";
import * as Etebase from "etebase";
import { useCredentials } from "../credentials";
import { kindOf } from "../pim/collections";
import { StoreState } from "../store";
import { CachedItem } from "../store/reducers";
import Container from "../widgets/Container";
import { Title } from "../widgets/Typography";
import NotFound from "../widgets/NotFound";
import AppbarButton from "../widgets/AppbarButton";

import { defaultColor } from "../helpers";
import { DefaultNavigationProp, RootStackParamList } from "../RootStackParamList";

import ColorBox from "../widgets/ColorBox";

const iconDeleted = (props: any) => (<List.Icon {...props} color="#F20C0C" icon="delete" />);
const iconChanged = (props: any) => (<List.Icon {...props} color="#FEB115" icon="pencil" />);

type NavigationProp = StackNavigationProp<RootStackParamList, "CollectionChangelog">;

interface PropsType {
  route: RouteProp<RootStackParamList, "CollectionChangelog">;
}

export default function CollectionChangelogScreen(props: PropsType) {
  const navigation = useNavigation<NavigationProp>();
  const syncGate = useSyncGate();
  const theme = useTheme();
  const fmt = useDateFormats();
  // (of all kinds of collections, not only notebooks)
  const cachedCollections = useSelector((state: StoreState) => state.allCache.collections);
  const cachedItems = useSelector((state: StoreState) => state.allCache.items);
  const etebase = useCredentials();

  const colUid = props.route.params.colUid ?? "";
  const cachedCollection = cachedCollections.get(colUid);
  const colCachedItems = cachedItems.get(colUid);
  const kind = (cachedCollection) ? kindOf(cachedCollection.collectionType) : undefined;
  // The titles of events, tasks and contacts are in them (their item's name is their UID)
  const [titles, setTitles] = React.useState<Map<string, string>>(new Map());
  React.useEffect(() => {
    if (!etebase || !cachedCollection || !colCachedItems || (kind === "notes")) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const colMgr = etebase.getCollectionManager();
      const itemMgr = colMgr.getItemManager(colMgr.cacheLoad(cachedCollection.cache));
      const ret = new Map<string, string>();
      for (const [itemUid, cached] of colCachedItems.entries()) {
        try {
          const content = (await itemMgr.cacheLoad(cached.cache).getContent(Etebase.OutputFormat.String)).replace(/\r?\n[ \t]/g, "");
          const m = /^(?:SUMMARY|FN)(?:;[^:]*)?:(.*)$/m.exec(content);
          if (m) {
            ret.set(itemUid, m[1].trim().replace(/\\,/g, ",").replace(/\\;/g, ";"));
          }
        } catch (e) {
          // (left with its name)
        }
      }
      if (!cancelled) {
        setTitles(ret);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [etebase, cachedCollection, colCachedItems]);

  // Opening an item (that's still there)
  function open(itemUid: string) {
    const params = { colUid, itemUid };
    const screen = { calendar: "EventEdit", tasks: "TaskEdit", contacts: "Contact", notes: "NoteEdit" }[kind!];
    navigation.navigate(screen as any, params as any);
  }

  React.useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <RightAction colUid={colUid} notebook={kindOf(cachedCollections.get(colUid)?.collectionType ?? "") === "notes"} />
      ),
    });
  }, [colUid, cachedCollection?.collectionType]);

  if (syncGate) {
    return syncGate;
  }

  if (!cachedCollection || !colCachedItems) {
    return <NotFound />;
  }

  const { meta } = cachedCollection;

  const entriesList = Array.from(colCachedItems.entries()).map(([uid, val]) => ({ uid, ...val })).sort((a_, b_) => {
    const a = a_.meta.mtime ?? 0;
    const b = b_.meta.mtime ?? 0;
    return b - a;
  });

  function renderEntry(param: { item: CachedItem & { uid: string } }) {
    const item = param.item;

    const icon = (item.isDeleted) ? iconDeleted : iconChanged;

    const name = titles.get(item.uid) ?? item.meta.name ?? "";
    const mtime = (item.meta.mtime) ? `${fmt.mediumDate(new Date(item.meta.mtime))}, ${fmt.timeSeconds(new Date(item.meta.mtime))}` : undefined;

    return (
      <List.Item
        key={item.uid}
        left={icon}
        title={name}
        description={mtime}
        onPress={(item.isDeleted) ? undefined : () => open(item.uid)}
      />
    );
  }

  const collectionColorBox = (
    <ColorBox size={36} color={meta.color || defaultColor} />
  );

  return (
    <>
      <Container style={{ flexDirection: "row" }}>
        <View style={{ marginRight: "auto" }}>
          <Title>{meta.name}</Title>
          <Text>
            Change log items: {entriesList.length}
          </Text>
        </View>
        {collectionColorBox}
      </Container>
      <Divider />
      <FlatList
        style={[{ backgroundColor: theme.colors.background }, { flex: 1 }]}
        data={entriesList}
        keyExtractor={(item) => item.uid}
        renderItem={renderEntry}
        maxToRenderPerBatch={10}
      />
    </>
  );
}

function RightAction(props: { colUid: string, notebook: boolean }) {
  const navigation = useNavigation<DefaultNavigationProp>();
  const colUid = props.colUid;

  return (
    <View style={{ flexDirection: "row" }}>
      {/* (notebooks have the screens of the notes, the others the collections page) */}
      <AppbarButton icon="pencil" title="Edit" onPress={() => (props.notebook) ? navigation.navigate("CollectionEdit", { colUid }) : navigation.navigate("Collections", { colUid })} />
      <AppbarButton icon="account-multiple" title="Members" onPress={() => (props.notebook) ? navigation.navigate("CollectionMembers", { colUid }) : navigation.navigate("Collections", { colUid, share: true })} />
    </View>
  );
}
