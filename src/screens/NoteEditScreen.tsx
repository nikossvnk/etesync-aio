// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import * as Etebase from "etebase";
import { View, ViewProps, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, GestureResponderEvent } from "react-native";
import { Paragraph, Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { fonts, useTheme } from "../theme";
import { useNavigation, RouteProp } from "@react-navigation/native";
import { format } from "date-fns";
import { StackNavigationProp } from "@react-navigation/stack";
import { useDebouncedCallback } from "use-debounce";

import { useSyncGate } from "../SyncGate";
import { goUp } from "../navigation";
import { StoreState, store, useAsyncDispatch } from "../store";
import ScrollView from "../widgets/ScrollView";
import RawTextInput from "../widgets/RawTextInput";
import { useCredentials } from "../credentials";

import Markdown from "../widgets/Markdown";
import { useSelector, useDispatch } from "react-redux";
import { pushMessage, setCacheItem, setSettings, setSyncItem, unsetCacheItem } from "../store/actions";
import { newNotes, openInEditor } from "../newNotes";
import { moveNote, nameFromContent, noteName, untitled } from "../notes";
import { requestSync, saveItemsLocally } from "../sync/SyncManager";
import LoadingIndicator from "../widgets/LoadingIndicator";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import NotFound from "../widgets/NotFound";
import AppbarButton from "../widgets/AppbarButton";
import { defaultColor, fontFamilies } from "../helpers";
import Select from "../widgets/Select";
import { RootStackParamList } from "../RootStackParamList";
import { useWideLayout } from "../components/WideLayout";
import FormatBar from "../widgets/FormatBar";
import { Edit } from "../markdownFormat";
import { canShare, shareItem } from "../import-export";

type NavigationProp = StackNavigationProp<RootStackParamList, "NoteEdit">;

interface PropsType {
  route: RouteProp<RootStackParamList, "NoteEdit">;
}

export default function NoteEditScreen(props: PropsType) {
  const onLeaveRef = React.useRef<() => void>(null);
  // Whether the editor has content that was not yet written to the local cache
  const dirtyRef = React.useRef(false);
  // The note the editor content was loaded for
  const loadedKeyRef = React.useRef<string>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [content, setContent_] = React.useState("");
  const [title, setTitle_] = React.useState("");
  // The current title and content, for saving them from callbacks that were made before they changed
  const contentRef = React.useRef("");
  const titleRef = React.useRef("");
  // Set when the note was moved to another notebook, as it isn't this one anymore then
  const movedRef = React.useRef(false);
  const textInputRef = React.useRef<TextInput>(null);
  const titleInputRef = React.useRef<TextInput>(null);
  // The selection in the editor, which the formatting buttons change the Markdown around
  const selectionRef = React.useRef({ start: 0, end: 0 });
  // A selection the editor is given after formatting, until it reports one of its own
  const [forcedSelection, setForcedSelection] = React.useState<{ start: number, end: number }>();
  // Whether the editor takes the focus when it opens, as when the note was clicked to edit it
  const [focusEditor, setFocusEditor] = React.useState(false);
  const deskRef = React.useRef<View>(null);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const { defaultViewMode, lastViewMode } = viewSettings;
  const { colUid, itemUid } = props.route.params;
  const [viewMode, setViewMode] = React.useState(() => (
    // New notes, and notes that were moved while they were being edited, open in the editor
    (openInEditor.delete(itemUid)) ? false : ((defaultViewMode === "last") ? lastViewMode : (defaultViewMode === "viewer"))
  ));
  // A new note starts with writing its title
  const [isNew] = React.useState(() => newNotes.has(itemUid));
  const [noteDeleteDialogShow, setNoteDeleteDialogShow] = React.useState(false);
  const dispatch = useAsyncDispatch();
  const syncDispatch = useDispatch();
  const syncItems = useSelector((state: StoreState) => state.sync.items);
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const etebase = useCredentials()!;
  const navigation = useNavigation<NavigationProp>();
  const syncGate = useSyncGate();
  const theme = useTheme();
  const wideLayout = useWideLayout();

  const cacheCollection = (colUid) ? cacheItems.get(colUid) : undefined;
  const cacheItem = (cacheCollection && itemUid) ? cacheCollection.get(itemUid) : undefined;

  const changed = syncItems.hasIn([colUid, itemUid]);

  React.useEffect(() => {
    return () => {
      onLeaveRef.current?.();
    };
  }, []);

  // Escape ends editing, on the web (unless it closes a menu or a dialog)
  React.useEffect(() => {
    if (viewMode || (Platform.OS !== "web")) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape") && !document.querySelector('[role="menu"], [aria-modal="true"]')) {
        setLastViewMode(true);
      }
    };
    // (before the text fields, which keep escape to themselves)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [viewMode, viewSettings]);

  // A new note starts with typing its title. It's focused once the screen has opened, as it can't
  // take the focus while the screen is still coming in.
  React.useEffect(() => {
    if (!isNew || loading) {
      return undefined;
    }
    const focus = () => titleInputRef.current?.focus();
    const timeout = setTimeout(focus, 500);
    const unsubscribe = navigation.addListener("transitionEnd", focus);
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [isNew, loading]);

  React.useEffect(() => {
    const name = (cacheItem) ? (cacheItem.meta.name || untitled) : "Note Not Found";
    navigation.setOptions({
      title: name,
      // The title and notebook are in the note itself, wide screens show where it is in the bar
      headerTitle: () => (
        <View style={[styles.headerTitle, styles.breadcrumb]}>
          {(wideLayout && cacheItem) && (
            <>
              <Text style={[styles.crumb, { color: theme.colors.textMuted }]} numberOfLines={1}>{cacheCollections.get(colUid)?.meta.name}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
              <Text style={[styles.crumb, styles.crumbTitle, { color: theme.colors.text }]} numberOfLines={1}>{cacheItem.meta.name || untitled}</Text>
            </>
          )}
        </View>
      ),
      headerRight: () => (
        <RightAction
          viewMode={viewMode}
          setViewMode={setLastViewMode}
          onSave={onSave}
          onDelete={() => setNoteDeleteDialogShow(true)}
          onShare={onShare}
          changed={changed}
        />
      ),
    });
  }, [navigation, colUid, cacheItem, viewMode, setLastViewMode, changed, title, content, loading, wideLayout, theme]);

  // Write the content to the local cache and queue the note to be pushed to the server
  async function saveLocally() {
    if (!etebase) {
      return;
    }
    dirtyRef.current = false;
    const content = contentRef.current;
    const name = noteName(titleRef.current, content);

    const colMgr = etebase.getCollectionManager();
    const col = colMgr.cacheLoad(cacheCollections.get(colUid)!.cache);
    const itemMgr = colMgr.getItemManager(col);

    for (;;) {
      const current = (store.getState() as unknown as StoreState).cache.items.get(colUid)?.get(itemUid);
      if (!current) {
        return;
      }
      const item = itemMgr.cacheLoad(current.cache);

      const meta = item.getMeta();
      meta.name = name;
      meta.mtime = (new Date()).getTime();
      item.setMeta(meta);
      await item.setContent(content);

      // Start over if the cached note was replaced (e.g. by a sync) while we were working on it
      const latest = (store.getState() as unknown as StoreState).cache.items.get(colUid)?.get(itemUid);
      if (latest === current) {
        await dispatch(setCacheItem(col, itemMgr, item));
        syncDispatch(setSyncItem(colUid, itemUid) as any);
        return;
      }
    }
  }

  const persistItem = useDebouncedCallback(
    saveLocally,
    1000,
    // The max wait time:
    { maxWait: 10000 }
  );

  const cache = cacheItem?.cache;
  React.useEffect(() => {
    if (syncGate || !cacheItem) {
      return undefined;
    }

    const key = `${colUid}/${itemUid}`;
    // The cached note changes when we save it ourselves and when a sync updates it.
    // Only reload it when there is nothing local that would be lost.
    if ((loadedKeyRef.current === key) && (changed || dirtyRef.current)) {
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const colMgr = etebase.getCollectionManager();
      const col = colMgr.cacheLoad(cacheCollections.get(colUid)!.cache);
      const itemMgr = colMgr.getItemManager(col);
      const item = itemMgr.cacheLoad(cacheItem.cache);
      const content = await item.getContent(Etebase.OutputFormat.String);
      if (cancelled || ((loadedKeyRef.current === key) && dirtyRef.current)) {
        return;
      }
      const firstLoad = loadedKeyRef.current !== key;
      loadedKeyRef.current = key;
      contentRef.current = content;
      setContent_(content);
      titleRef.current = cacheItem.meta.name ?? "";
      setTitle_(titleRef.current);
      // There is nothing to view in an empty note (e.g. one that was just created), so start writing
      if (firstLoad && (content === "")) {
        setViewMode(false);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [syncGate, colUid, itemUid, cache]);

  function changed_() {
    dirtyRef.current = true;
    if (!changed) {
      syncDispatch(setSyncItem(colUid, itemUid) as any);
    }
    persistItem();
  }

  function setContent(content: string) {
    contentRef.current = content;
    changed_();
    setContent_(content);
  }

  function setTitle(title: string) {
    titleRef.current = title;
    changed_();
    setTitle_(title);
  }

  // Moves the note to another notebook, and shows it there
  async function changeNotebook(toUid: string) {
    if ((toUid === colUid) || movedRef.current) {
      return;
    }
    persistItem.cancel();
    if (dirtyRef.current) {
      await saveLocally();
    }
    const state = store.getState() as unknown as StoreState;
    const current = state.cache.items.get(colUid)?.get(itemUid);
    const from = state.cache.collections.get(colUid);
    const to = state.cache.collections.get(toUid);
    if (!current || !from || !to) {
      return;
    }
    movedRef.current = true;
    const queued = state.sync.items.hasIn([colUid, itemUid]);
    const newUid = await moveNote(etebase, from, colUid, current, to, queued);
    if (!viewMode) {
      openInEditor.add(newUid);
    }
    syncDispatch(pushMessage({ message: `Moved to ${to.meta.name}`, severity: "success" }) as any);
    navigation.replace("NoteEdit", { colUid: toUid, itemUid: newUid });
  }

  async function onSaveDo() {
    persistItem.cancel();
    if (dirtyRef.current) {
      await saveLocally();
    }
    if (etebase) {
      requestSync(etebase, true);
    }
  }

  // Called when the screen is left: saves the note, or throws it away if it was just created and is still empty
  onLeaveRef.current = () => {
    if (movedRef.current) {
      // It was saved before it was moved
      return;
    }
    if (!newNotes.has(itemUid)) {
      onSaveDo();
      return;
    }
    newNotes.delete(itemUid);
    if ((contentRef.current.trim() !== "") || (titleRef.current.trim() !== "")) {
      onSaveDo();
      return;
    }

    persistItem.cancel();
    dirtyRef.current = false;
    if (!changed) {
      // It was never queued to be pushed, so it only exists here
      syncDispatch(unsetCacheItem(colUid, itemUid) as any);
    } else if (etebase && cacheItem) {
      // It got content that was removed again, and may already be on the server, so delete it there too
      const colMgr = etebase.getCollectionManager();
      const col = colMgr.cacheLoad(cacheCollections.get(colUid)!.cache);
      const itemMgr = colMgr.getItemManager(col);
      const item = itemMgr.cacheLoad(cacheItem.cache);
      item.delete(true);
      saveItemsLocally(etebase, col, itemMgr, [item]);
    }
    syncDispatch(pushMessage({ message: "Empty note discarded", severity: "info" }) as any);
  };

  function onSave() {
    onSaveDo();
  }

  // Formats the Markdown around the selection (from the formatting bar) and selects what it made
  function applyFormat(apply: (edit: Edit) => Edit) {
    const { start, end } = selectionRef.current;
    const result = apply({ text: contentRef.current, start, end });
    setContent(result.text);
    selectionRef.current = { start: result.start, end: result.end };
    setForcedSelection({ start: result.start, end: result.end });
    textInputRef.current?.focus();
  }

  // Clicking (or tapping) the note opens it in the editor, but not when text was being selected, or a
  // link or checkbox was clicked
  function editOnClick(e: GestureResponderEvent) {
    if (Platform.OS === "web") {
      const target = (e.nativeEvent as any).target as HTMLElement | undefined;
      if (window.getSelection()?.toString() || target?.closest?.("a, input, [role=checkbox], [role=link], [role=button]")) {
        return;
      }
    }
    setFocusEditor(true);
    setLastViewMode(false);
  }

  function setLastViewMode(viewMode: boolean) {
    setViewMode(viewMode);
    syncDispatch(setSettings({
      viewSettings: {
        ...viewSettings,
        lastViewMode: viewMode,
      },
    }) as any);
  }

  function onShare() {
    (async () => {
      const colMgr = etebase.getCollectionManager();
      const col = colMgr.cacheLoad(cacheCollections.get(colUid)!.cache);
      const itemMgr = colMgr.getItemManager(col);
      const item = itemMgr.cacheLoad(cacheItem!.cache);
      await shareItem(item);
    })();
  }

  if (syncGate) {
    return syncGate;
  }
  
  if (!cacheCollection) {
    return <NotFound />;
  }
  if (!cacheItem) {
    return <NotFound message="This note can't be found" />;
  }

  if (loading) {
    return <LoadingIndicator />;
  }

  const mtime = cacheItem.meta.mtime;
  // The note is a sheet, on a darker desk behind it
  const sheetColors = { backgroundColor: theme.colors.surface, borderColor: theme.colors.border };
  // The notebook and date, and the title, above the note
  const head = (
    <View style={styles.head}>
      <View style={styles.metaLine}>
        <NotebookPicker colUid={colUid} editable={!viewMode} onChange={changeNotebook} />
        {!!mtime && <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>{"·  " + format(mtime, "PP")}</Text>}
      </View>
      <NoteTitle
        editing={!viewMode}
        value={(viewMode) ? (cacheItem.meta.name || untitled) : title}
        placeholder={nameFromContent(content) || "Title"}
        onChange={setTitle}
        onSubmit={() => textInputRef.current?.focus()}
        inputRef={titleInputRef}
        autoFocus={isNew}
      />
    </View>
  );

  return (
    <>
      {viewMode ? (
        <ScrollView keyboardAware style={{ backgroundColor: theme.colors.sidebar }} contentContainerStyle={[styles.desk, (wideLayout) && styles.deskWide]}>
          <Pressable onPress={editOnClick} style={[styles.sheet, styles.viewerPressable, sheetColors]} accessible={false} {...{ tabIndex: -1 }}>
            {head}
            <View testID="note-viewer" style={styles.viewer}>
              <Markdown
                setContent={setContent}
                content={content}
              />
            </View>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <FormatBar onFormat={applyFormat} onDone={(wideLayout) ? undefined : () => setLastViewMode(true)} />
          <Pressable
            ref={deskRef}
            // A click around the note (not in it) ends editing
            onPress={(e) => {
              if ((Platform.OS === "web") && ((e.nativeEvent as any).target === deskRef.current)) {
                setLastViewMode(true);
              }
            }}
            accessible={false}
            {...{ tabIndex: -1 }}
            style={[styles.desk, (wideLayout) && styles.deskWide, styles.editorDesk, { backgroundColor: theme.colors.sidebar }, styles.deskCursor]}
          >
            <View style={[styles.sheet, styles.editorSheet, sheetColors]}>
              {head}
              <TextEditor
                inputRef={textInputRef}
                style={{ flexGrow: 1 }}
                // The body is a shade off the sheet, so that it's told apart from the title
                contentStyle={[styles.editorContent, { backgroundColor: theme.colors.background }]}
                setContent={setContent}
                content={content}
                autoFocus={focusEditor}
                selection={forcedSelection}
                onSelectionChange={(selection) => {
                  selectionRef.current = selection;
                  if (forcedSelection) {
                    setForcedSelection(undefined);
                  }
                }}
              />
            </View>
          </Pressable>
        </>
      )}
      <ConfirmationDialog
        title="Delete Note"
        visible={noteDeleteDialogShow}
        onOk={async () => {
          const colMgr = etebase.getCollectionManager();
          const col = colMgr.cacheLoad(cacheCollections.get(colUid)!.cache);
          const itemMgr = colMgr.getItemManager(col);
          const item = itemMgr.cacheLoad(cacheItem.cache);

          const meta = item.getMeta();
          meta.mtime = (new Date()).getTime();
          item.setMeta(meta);
          item.delete(true);

          persistItem.cancel();
          dirtyRef.current = false;
          await saveItemsLocally(etebase, col, itemMgr, [item]);
          goUp(navigation, props.route);
        }}
        onCancel={() => setNoteDeleteDialogShow(false)}
      >
        <Paragraph>Are you sure you would like to delete this note?</Paragraph>
      </ConfirmationDialog>
    </>
  );
}

interface RightActionViewProps {
  viewMode: boolean;
  changed: boolean;
  setViewMode: (value: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
  onShare: () => void;
}

function RightAction({ viewMode, setViewMode, onSave, onDelete, onShare, changed }: RightActionViewProps) {

  return (
    <View style={{ flexDirection: "row" }}>
      <AppbarButton icon={viewMode ? "pencil" : "eye"} title="View mode" onPress={() => setViewMode(!viewMode)} />
      <AppbarButton icon="content-save" title="Save" disabled={!changed} onPress={onSave} />
      {(canShare()) ? (
        <AppbarButton icon="share-variant" title="Share" onPress={onShare} />
      ) : null}
      <AppbarButton icon="delete" title="Delete" onPress={onDelete} />
    </View>
  );
}

interface TextEditorPropsType extends ViewProps {
  inputRef?: React.Ref<TextInput>;
  content: string;
  setContent: (value: string) => void;
  autoFocus?: boolean;
  selection?: { start: number, end: number };
  onSelectionChange?: (selection: { start: number, end: number }) => void;
  contentStyle?: ViewProps["style"];
}

function TextEditor(props: TextEditorPropsType) {
  const { content, setContent } = props;
  const fontSize = useSelector((state: StoreState) => state.settings.fontSize);
  const fontFamilyKey = useSelector((state: StoreState) => state.settings.viewSettings.editorFontFamily);
  const fontFamily = fontFamilies[fontFamilyKey];

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={(Platform.OS === "ios")}
      style={[{ backgroundColor: "transparent" }, props.style]}
    >
      <RawTextInput
        ref={props.inputRef}
        accessibilityLabel="Content"
        textAlignVertical="top"
        multiline
        scrollEnabled
        style={[{ flexGrow: 1, fontSize, fontFamily, backgroundColor: "transparent" }, props.contentStyle]}
        onChangeText={setContent}
        value={content}
        autoFocus={props.autoFocus}
        selection={props.selection}
        onSelectionChange={(e) => props.onSelectionChange?.(e.nativeEvent.selection)}
      />
    </KeyboardAvoidingView>
  );
}

interface NoteTitlePropsType {
  editing: boolean;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  autoFocus?: boolean;
}

// The title of the note, above it, which can be changed in the editor
function NoteTitle(props: NoteTitlePropsType) {
  const theme = useTheme();
  const { editing, value, placeholder, onChange, onSubmit, inputRef, autoFocus } = props;

  if (!editing) {
    return <Text style={[styles.title, { color: theme.colors.text }]} accessibilityRole="header">{value}</Text>;
  }

  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.disabled}
      accessibilityLabel="Title"
      autoFocus={autoFocus}
      returnKeyType="next"
      onSubmitEditing={onSubmit}
      style={[styles.title, styles.titleInput, { color: theme.colors.text, borderBottomColor: theme.colors.divider }]}
    />
  );
}

interface NotebookPickerPropsType {
  colUid: string;
  // Whether it can be changed, which moves the note to another notebook
  editable: boolean;
  onChange: (colUid: string) => void;
}

// The notebook of the note, above its title
function NotebookPicker(props: NotebookPickerPropsType) {
  const theme = useTheme();
  const { colUid, editable, onChange } = props;
  const [open, setOpen] = React.useState(false);
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const notebooks = Array.from(cacheCollections.entries())
    .map(([uid, col]) => ({ uid, name: col.meta.name ?? "", color: col.meta.color || defaultColor }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = notebooks.find((x) => x.uid === colUid);
  const color = theme.colors.textMuted;

  const content = (
    <View style={[styles.notebook, (editable) ? { borderColor: theme.colors.border, backgroundColor: theme.colors.surface } : undefined, (editable) ? styles.notebookEditable : undefined]}>
      <View style={[styles.notebookColor, { backgroundColor: current?.color ?? defaultColor }]} />
      <Text style={[styles.notebookName, { color }]} numberOfLines={1}>{current?.name}</Text>
      {editable && <MaterialCommunityIcons name="menu-down" size={20} color={color} />}
    </View>
  );

  if (!editable) {
    return (
      <View accessibilityLabel={`Notebook: ${current?.name}`} style={styles.notebookWrap}>
        {content}
      </View>
    );
  }

  const anchor = (
    <TouchableRipple
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={`Notebook: ${current?.name}`}
      style={styles.notebookWrap}
    >
      {content}
    </TouchableRipple>
  );

  return (
    <Select
      visible={open}
      onDismiss={() => setOpen(false)}
      options={notebooks}
      titleAccossor={(x) => x.name}
      active={(x) => x.uid === colUid}
      onChange={(chosen) => {
        setOpen(false);
        if (chosen) {
          onChange(chosen.uid);
        }
      }}
      anchor={anchor}
    />
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flex: 1,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 8,
    minWidth: 0,
  },
  crumb: {
    fontSize: 13,
    flexShrink: 1,
  },
  crumbTitle: {
    fontFamily: fonts.medium,
  },
  // What's behind the note, which is a bit darker than it
  desk: {
    flexGrow: 1,
    padding: 10,
  },
  deskWide: {
    padding: 24,
  },
  // The note: a sheet that uses the width there is, up to what's still comfortable to read
  sheet: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 32,
  },
  viewer: {
    flexGrow: 1,
    minHeight: 40,
  },
  viewerPressable: {
    flexGrow: 1,
    cursor: "text",
  } as any,
  editorDesk: {
    flex: 1,
  },
  deskCursor: {
    cursor: "default",
  } as any,
  editorSheet: {
    flex: 1,
    paddingBottom: 0,
  },
  editorContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 32,
    marginBottom: 16,
    borderRadius: 10,
    // The page shows where the note is typed already
    outlineStyle: "none",
  } as any,
  head: {
    marginBottom: 14,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  metaText: {
    fontSize: 13,
    marginLeft: 6,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  // In the editor the title has a line under it, between it and the body
  titleInput: {
    padding: 0,
    paddingBottom: 8,
    minWidth: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    outlineStyle: "none",
  } as any,
  notebookWrap: {
    flexShrink: 1,
    maxWidth: 280,
    borderRadius: 16,
  },
  notebook: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  notebookEditable: {
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
  },
  notebookColor: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 6,
  },
  notebookName: {
    fontSize: 13,
    flexShrink: 1,
  },
});
