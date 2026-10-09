// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { NavigationProp, StackActions } from "@react-navigation/native";

import { RootStackParamList } from "./RootStackParamList";

type RouteName = keyof RootStackParamList;

interface UpTarget {
  // The screens that count as the level above. The first available one is opened if none of them is found.
  names: RouteName[];
  // The params the screen above has to have, and is opened with
  params?: (params: any) => Record<string, string>;
}

const lists: RouteName[] = ["Home", "Collection"];
const note = ({ colUid, itemUid }: any) => ({ colUid, itemUid });
const notebook = ({ colUid }: any) => ({ colUid });

// The level above each screen, which is where the back button leads to.
// Screens that are not here are top level screens.
const upTargets: { [name in RouteName]?: UpTarget } = {
  Collection: { names: ["Notebooks", "Home"] },
  Search: { names: ["Home"] },
  NoteCreate: { names: lists },
  NoteEdit: { names: lists },
  NoteProps: { names: ["NoteEdit"], params: note },
  NoteMove: { names: ["NoteEdit"], params: note },
  CollectionCreate: { names: [...lists, "NoteCreate"] },
  CollectionChangelog: { names: lists },
  CollectionEdit: { names: ["CollectionChangelog"], params: notebook },
  CollectionMembers: { names: ["CollectionChangelog"], params: notebook },
  Invitations: { names: lists },
  EventEdit: { names: ["Calendar"] },
  TaskEdit: { names: ["Tasks"] },
  Contact: { names: ["Contacts"] },
  ContactEdit: { names: ["Contact", "Contacts"] },
  PimCollectionCreate: { names: ["Calendar", "Tasks", "Contacts"] },
  Settings: { names: [...lists, "Calendar", "Tasks", "Contacts", "Login", "Signup"] },
  Password: { names: ["Settings"] },
  About: { names: ["Settings"] },
  DebugLogs: { names: ["Settings"] },
};

export function canGoUp(routeName: string) {
  return routeName in upTargets;
}

// Go one level up from the passed screen. Unlike goBack() it doesn't depend on which
// screens were visited before: it returns to the nearest screen of the level above, and
// opens that screen in place of the current one if it was never visited.
export function goUp(navigation: NavigationProp<any>, route: { key: string, name: string, params?: any }) {
  const target = upTargets[route.name as RouteName];
  const state = navigation.getState();
  const index = state.routes.findIndex((x) => x.key === route.key);
  if (!target || (index < 0)) {
    navigation.goBack();
    return;
  }

  const params = target.params?.(route.params ?? {});
  for (let i = index - 1 ; i >= 0 ; i--) {
    const candidate = state.routes[i];
    const candidateParams: any = candidate.params ?? {};
    if (target.names.includes(candidate.name as RouteName) &&
      (!params || Object.keys(params).every((key) => candidateParams[key] === params[key]))) {
      navigation.dispatch({ ...StackActions.pop(index - i), source: route.key, target: state.key });
      return;
    }
  }

  const name = target.names.find((x) => state.routeNames.includes(x));
  if (name) {
    navigation.dispatch({ ...StackActions.replace(name, params), source: route.key, target: state.key });
  } else {
    navigation.goBack();
  }
}
