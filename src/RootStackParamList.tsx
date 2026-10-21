
import { StackNavigationProp } from "@react-navigation/stack";

export type RootStackParamList = {
  Home: undefined;
  Search: undefined;
  Notebooks: undefined;
  Login: undefined;
  Signup: undefined;
  CollectionCreate: undefined;
  Collection: { colUid: string };
  CollectionEdit: { colUid: string };
  CollectionChangelog: { colUid: string };
  CollectionMembers: { colUid: string };
  NoteCreate: {
    colUid: string;
    itemUid?: undefined;
  } | undefined;
  NoteEdit: {
    colUid: string;
    itemUid: string;
  };
  NoteProps: {
    colUid: string;
    itemUid: string;
  };
  NoteMove: {
    colUid: string;
    itemUid: string;
  };
  Calendar: undefined;
  EventEdit: { colUid?: string, itemUid?: string, date?: string, time?: string, title?: string, attendeeName?: string, attendeeEmail?: string } | undefined;
  Tasks: undefined;
  TaskEdit: { colUid?: string, itemUid?: string } | undefined;
  Contacts: undefined;
  Contact: { colUid: string, itemUid: string };
  ContactEdit: { colUid?: string, itemUid?: string } | undefined;
  // (with a bookmark: it's open, with a url: a new one with it)
  Bookmarks: { colUid?: string, itemUid?: string, url?: string } | undefined;
  SearchAll: undefined;
  Collections: { colUid?: string, kind?: "calendar" | "contacts" | "tasks" | "notes" | "bookmarks", share?: boolean } | undefined;
  Invitations: undefined;
  Settings: undefined;
  Password: undefined;
  About: undefined;
  DebugLogs: undefined;
  AccountWizard: undefined;
  "404": undefined;
};

// The screens of the calendar, the tasks, the contacts and the bookmarks (and their parts)
export const pimScreens: string[] = ["Calendar", "EventEdit", "Tasks", "TaskEdit", "Contacts", "Contact", "ContactEdit", "Bookmarks", "SearchAll"];

// The settings (and their parts) and the account's screens, which aren't about notes either
export const accountScreens: string[] = ["Settings", "About", "Password", "DebugLogs", "Invitations", "Collections", "CollectionChangelog"];

export type DefaultNavigationProp = StackNavigationProp<RootStackParamList, keyof RootStackParamList>;
