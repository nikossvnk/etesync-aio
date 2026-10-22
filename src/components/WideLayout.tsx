// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { NavigationState, StackActions, useNavigation, useNavigationState } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";

import { StoreState } from "../store";
import { setSettings } from "../store/actions";
import { useCredentials } from "../credentials";
import { useDeviceBreakpoint } from "../helpers";

// Wide screens show three columns when logged in: the sidebar (which can be hidden), the notes, and
// the screen of the open note (or other screen). There's no drawer then, the sidebar has its items.
export function useWideLayout() {
  const wide = useDeviceBreakpoint("tabletLandscape");
  const etebase = useCredentials();
  return wide && !!etebase;
}

// Whether the sidebar is shown: in the wide layout, unless it was hidden
export function useSidebarShown() {
  const wideLayout = useWideLayout();
  const sidebarVisible = useSelector((state: StoreState) => state.settings.sidebarVisible);
  return wideLayout && sidebarVisible;
}

// What's searched for in the sidebar, which the notes column shows the results of
type SearchContextType = { query: string, setQuery: (query: string) => void };
const SearchContext = React.createContext<SearchContextType>({ query: "", setQuery: () => undefined });

export function SearchProvider(props: React.PropsWithChildren<unknown>) {
  const [query, setQuery] = React.useState("");
  const value = React.useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{props.children}</SearchContext.Provider>;
}

export function useSearchQuery() {
  return React.useContext(SearchContext);
}

// The state of the stack with the screens, which is inside of the drawer
function useStackState() {
  return useNavigationState((state: NavigationState) => {
    const root = state.routes.find((x) => x.name === "Root");
    return root?.state as NavigationState | undefined;
  });
}

// Navigating from the columns, which are next to the stack of screens rather than in it
export function useWideNavigation() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const stackState = useStackState();
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);

  // (a state that came from a link, e.g. when the page is loaded, has no index yet: the last screen is open)
  const current = stackState?.routes[stackState.index ?? (stackState.routes.length - 1)];
  const currentParams: any = current?.params ?? {};
  // The note that is open, as "colUid/itemUid"
  const currentNote = (current?.name === "NoteEdit") ? `${currentParams.colUid}/${currentParams.itemUid}` : undefined;
  // The notebook whose notes are listed
  const filterBy = (viewSettings.filterBy && cacheCollections.has(viewSettings.filterBy)) ? viewSettings.filterBy : undefined;

  function navigate(screen: string, params?: any) {
    navigation.navigate("Root", { screen, params });
  }

  // Shows the notes of a notebook, or all of them
  function showNotebook(colUid: string | undefined) {
    dispatch(setSettings({
      viewSettings: {
        ...viewSettings,
        filterBy: colUid ?? null,
      },
    }) as any);
  }

  function openNote(colUid: string, itemUid: string) {
    if (currentNote === `${colUid}/${itemUid}`) {
      return;
    }
    // Going from note to note replaces the note, so that the back button goes back to where it was
    // (the stack replaces the screen the action comes from, which has to be passed as it's sent from outside of it)
    if (stackState && current && (current.name === "NoteEdit")) {
      navigation.dispatch({ ...StackActions.replace("NoteEdit", { colUid, itemUid }), source: current.key, target: stackState.key });
    } else {
      navigate("NoteEdit", { colUid, itemUid });
    }
  }

  return { currentNote, currentScreen: current?.name, currentParams, filterBy, navigate, showNotebook, openNote };
}
