// SPDX-FileCopyrightText: © 2017 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from "react";
import * as Etebase from "etebase";
import { View } from "react-native";
import { Button, Paragraph } from "react-native-paper";

import LoadingIndicator from "../widgets/LoadingIndicator";
import Container from "../widgets/Container";
import { Headline } from "../widgets/Typography";
import Wizard, { WizardNavigationBar, PagePropsType } from "../widgets/Wizard";

import { SyncManager } from "../sync/SyncManager";

import { store } from "../store";
import { useCredentials } from "../credentials";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { useSyncGate } from "../SyncGate";
import { useDispatch } from "react-redux";
import { performSync } from "../store/actions";

import * as C from "../constants";
import { RootStackParamList } from "../RootStackParamList";

// The collections a new account starts with, like the web app creates them
const defaultCollections = [
  [C.colType, "My Notes"],
  [C.calendarType, "My Calendar"],
  [C.tasksType, "My Tasks"],
  [C.contactsType, "My Contacts"],
];

function missingDefaultCollections() {
  const cached = store.getState().allCache.collections;
  return defaultCollections.filter(([type]) => !cached.some((x) => x.collectionType === type));
}

// The wizard is shown when there is no notebook (to keep notes in), and then also creates whichever
// of the others are missing. Accounts that have one already are not asked about the others again,
// they can be created on their own screens.
function needsWizard() {
  const cached = store.getState().allCache.collections;
  return !cached.some((x) => x.collectionType === C.colType);
}

const wizardPages = [
  (props: PagePropsType) => (
    <SetupCollectionsPage {...props} />
  ),
];

function SetupCollectionsPage(props: PagePropsType) {
  const etebase = useCredentials()!;
  const [error, setError] = React.useState<Error>();
  const [loading, setLoading] = React.useState(false);
  async function onNext() {
    setLoading(true);
    try {
      const colMgr = etebase.getCollectionManager();
      for (const [type, name] of missingDefaultCollections()) {
        const meta: Etebase.ItemMetadata = {
          name,
          mtime: (new Date()).getTime(),
        };
        const collection = await colMgr.create(type, meta, "");
        await colMgr.upload(collection);
      }

      const syncManager = SyncManager.getManager(etebase!);
      syncManager.sync();

      props.next?.();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  const next = (loading) ? undefined : onNext;
  if (loading) {
    return (
      <LoadingIndicator />
    );
  }

  return (
    <>
      <View style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Headline style={{ textAlign: "center" }}>Set Up Your Account</Headline>
        <Paragraph style={{ textAlign: "center" }}>
          Clicking "Finish" below will create these for you: {missingDefaultCollections().map(([_type, name]) => name).join(", ")}.
        </Paragraph>
        {(error) && (
          <Paragraph style={{ color: "red" }}>{error.message}</Paragraph>
        )}
      </View>
      <WizardNavigationBar {...props} next={next} />
    </>
  );
}

type NavigationProp = StackNavigationProp<RootStackParamList, "AccountWizard">;

export default function AccountWizardScreen() {
  const [tryCount, setTryCount] = React.useState(0);
  const [ranWizard, setRanWizard] = React.useState(false);
  const [syncError, setSyncError] = React.useState<Error>();
  const etebase = useCredentials();
  const dispatch = useDispatch();
  const syncGate = useSyncGate();
  const navigation = useNavigation<NavigationProp>();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setSyncError(undefined);
    if (!etebase) {
      return;
    }
    setLoading(true);
    dispatch(performSync((async () => {
      const syncManager = SyncManager.getManager(etebase!);
      const sync = syncManager.sync(true);
      try {
        await sync;

        if (!needsWizard()) {
          setRanWizard(true);
        }
      } catch (e) {
        setSyncError(e);
      }
      setLoading(false);

      return true;
    })()) as any);
  }, [etebase, tryCount]);

  React.useEffect(() => {
    if (etebase === null) {
      navigation.navigate("Login");
    }
  }, [etebase]);

  React.useEffect(() => {
    if (!syncError && !syncGate && ranWizard) {
      navigation.navigate("Home");
    }
  }, [ranWizard, syncError, syncGate]);

  if (syncError) {
    return (
      <Container style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
        <Headline style={{ textAlign: "center" }}>Error!</Headline>
        <Paragraph style={{ textAlign: "center" }}>
          {syncError?.message}
        </Paragraph>
        <Button
          mode="contained"
          onPress={() => setTryCount(tryCount + 1)}
        >
          Retry
        </Button>
      </Container>
    );
  }

  if (syncGate) {
    return syncGate;
  }

  if (loading) {
    return (<LoadingIndicator />);
  }

  if (!ranWizard) {
    return (
      <Wizard pages={wizardPages} onFinish={() => setRanWizard(true)} style={{ display: "flex", flexDirection: "column", flex: 1 }} />
    );
  }

  return (<LoadingIndicator />);
}
