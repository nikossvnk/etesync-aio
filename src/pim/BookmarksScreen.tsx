// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The bookmarks: saving a link by pasting (or dropping) it, the list with search, sorting, tags and
// several at once (moving, tagging, deleting), and next to it the chosen one to edit (or a new one).
// The same bookmarks as the ones of EteSync Notes on Android.

import * as React from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { IconButton, Snackbar, Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { RouteProp } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { popMessage, pushMessage, setSettings } from "../store/actions";
import { store, StoreState } from "../store";
import { RootStackParamList } from "../RootStackParamList";
import { safeExternalUrl } from "../helpers";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import Link from "../widgets/Link";
import Menu from "../widgets/Menu";
import MenuItem from "../widgets/MenuItem";
import {
  allTags, Bookmark, BookmarkData, bookmarksFrom, bookmarksSelector, bookmarkTitle, comparableUrl, createBookmark, deleteBookmark,
  domainOf, fetchTitle, findUrl, isValidUrl, normalizeTag, normalizeUrl, restoreBookmark, savedFromLabel, siteLetter, tagBookmarks, updateBookmark,
} from "../bookmarks";
import { usePimCollections } from "./data";
import { swatches } from "./collections";
import { CollectionPicker, EmptyState } from "./widgets";
import { Button, DialogInput, Labelled, useDialogs } from "./Dialogs";
import { DateFormats, useDateFormats } from "./format";
import { panelStyle } from "./CalendarParts";
import { mono, tint } from "./style";

const ALL = "";
const UNTAGGED = "\u0000untagged";

type Sort = StoreState["settings"]["bookmarksSort"];
const sorts: { key: Sort, label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "Title A–Z" },
  { key: "site", label: "Website" },
];

function compare(sort: Sort) {
  return (a: Bookmark, b: Bookmark) => {
    if (sort === "oldest") {
      return a.created - b.created;
    } else if (sort === "title") {
      return bookmarkTitle(a).localeCompare(bookmarkTitle(b));
    } else if (sort === "site") {
      return domainOf(a.url).localeCompare(domainOf(b.url)) || (b.created - a.created);
    }
    return b.created - a.created;
  };
}

const keyOf = (x: { colUid: string, uid: string }) => `${x.colUid}/${x.uid}`;

// When it was saved: today, yesterday, or the date (with the year when it's another one)
export function savedLabel(time: number, fmt: DateFormats) {
  const date = new Date(time);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / (24 * 3600 * 1000));
  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  }
  return (date.getFullYear() === now.getFullYear()) ? fmt.shortDate(date) : fmt.mediumDate(date);
}

// When it was changed, after "edited": "today", "yesterday" or "on 12 Oct"
function editedLabel(time: number, fmt: DateFormats) {
  const label = savedLabel(time, fmt);
  return (["Today", "Yesterday"].includes(label)) ? label.toLowerCase() : `on ${label}`;
}

// The tile of a site: its first letter, in a colour of its own
export function SiteTile(props: { url: string, size?: number }) {
  const size = props.size ?? 34;
  const domain = domainOf(props.url);
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  }
  const color = swatches[Math.abs(hash) % swatches.length].color;
  return (
    <View aria-hidden style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: tint(color, 0.18), alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Text style={{ color, fontFamily: fonts.bold, fontSize: size * 0.42 }}>{siteLetter(props.url)}</Text>
    </View>
  );
}

function Checkbox(props: { checked: boolean, label: string, onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      borderless
      accessibilityRole="checkbox"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.checked }}
      aria-checked={props.checked}
      onPress={props.onPress}
      style={styles.check}
    >
      <MaterialCommunityIcons name={(props.checked) ? "checkbox-marked" : "checkbox-blank-outline"} size={19} color={(props.checked) ? theme.colors.accent : theme.colors.textMuted} />
    </TouchableRipple>
  );
}

// Opening a link in the browser (only web, email and phone links, see safeExternalUrl)
function OpenLink(props: { url: string, label: string, children: React.ReactNode }) {
  const safe = safeExternalUrl(props.url);
  if (!safe) {
    return null;
  }
  return (
    <Link
      to={safe}
      external
      renderChild={({ onPress }) => (
        <TouchableRipple accessibilityRole="link" accessibilityLabel={props.label} onPress={onPress ?? (() => undefined)} style={{ borderRadius: 8 }}>
          {props.children}
        </TouchableRipple>
      )}
    />
  );
}

function TagChip(props: { label: string, selected: boolean, onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      accessibilityRole="tab"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.selected }}
      aria-selected={props.selected}
      onPress={props.onPress}
      style={[styles.chip, { borderColor: (props.selected) ? theme.colors.chipActive : theme.colors.border, backgroundColor: (props.selected) ? theme.colors.chipActive : "transparent" }]}
    >
      <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: (props.selected) ? theme.colors.onChipActive : theme.colors.textSecondary }}>{props.label}</Text>
    </TouchableRipple>
  );
}

function Tag(props: { tag: string, onRemove?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: theme.colors.field }, (props.onRemove) ? { paddingRight: 2 } : undefined]}>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>#{props.tag}</Text>
      {props.onRemove && (
        <TouchableRipple borderless accessibilityRole="button" accessibilityLabel={`Remove tag ${props.tag}`} onPress={props.onRemove} style={styles.tagRemove}>
          <MaterialCommunityIcons name="close" size={13} color={theme.colors.textMuted} />
        </TouchableRipple>
      )}
    </View>
  );
}

// The tags of the bookmark in the panel: the chosen ones (which can be taken out), and a field for
// another one, and the ones of other bookmarks to add with a press (always shown, so that nothing
// moves when the field loses the focus, e.g. to a press of the button under it)
function TagsField(props: { value: string[], onChange: (tags: string[]) => void, known: string[] }) {
  const theme = useTheme();
  const [adding, setAdding] = React.useState<string>();
  const { value, onChange } = props;
  const suggestions = props.known.filter((x) => !value.includes(x) && x.startsWith(normalizeTag(adding ?? ""))).slice(0, 6);

  function add(tag: string) {
    const name = normalizeTag(tag);
    if (name && !value.includes(name)) {
      onChange([...value, name]);
    }
  }

  return (
    <Labelled label="Tags">
      <View style={styles.tags}>
        {value.map((tag) => <Tag key={tag} tag={tag} onRemove={() => onChange(value.filter((x) => x !== tag))} />)}
        {(adding === undefined) ? (
          <TouchableRipple accessibilityRole="button" accessibilityLabel="Add tag" onPress={() => setAdding("")} style={[styles.addTag, { borderColor: theme.colors.disabled }]}>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>+ Add tag</Text>
          </TouchableRipple>
        ) : (
          <TextInput
            autoFocus
            value={adding}
            onChangeText={(text) => {
              // A space or a comma ends a tag
              if (/[\s,]$/.test(text)) {
                add(text);
                setAdding("");
              } else {
                setAdding(text);
              }
            }}
            onSubmitEditing={() => {
              add(adding);
              setAdding("");
            }}
            onBlur={() => {
              add(adding);
              setAdding(undefined);
            }}
            blurOnSubmit={false}
            placeholder="New tag"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="New tag"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.addTag, styles.tagInput, { color: theme.colors.text, borderColor: theme.colors.accent }]}
          />
        )}
      </View>
      {(suggestions.length > 0) && (
        <View style={styles.tags}>
          {suggestions.map((tag) => (
            <TouchableRipple key={tag} accessibilityRole="button" accessibilityLabel={`Add tag ${tag}`}
              // (before the field loses the focus, which would end adding)
              {...({ onPointerDown: (e: any) => e.preventDefault() } as any)}
              onPress={() => add(tag)} style={[styles.addTag, { borderColor: theme.colors.border }]}>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>+ {tag}</Text>
            </TouchableRipple>
          ))}
        </View>
      )}
    </Labelled>
  );
}

interface PanelProps {
  // The bookmark to edit, or none for a new one
  bookmark?: Bookmark;
  // (of a new one)
  initialUrl?: string;
  colUid?: string;
  bookmarks: Bookmark[];
  onSaved: (where: { colUid: string, uid: string }) => void;
  onDelete: (bookmark: Bookmark) => void;
  onShow: (bookmark: Bookmark) => void;
  onClose?: () => void;
}

// The panel next to the list: the chosen bookmark, to change it, or a new one
function BookmarkPanel(props: PanelProps) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const dispatch = useDispatch();
  const fmt = useDateFormats();
  const lists = usePimCollections(C.bookmarkColType);
  const { bookmark } = props;
  const [url, setUrl] = React.useState(bookmark?.url ?? props.initialUrl ?? "");
  const [title, setTitle] = React.useState(bookmark?.title ?? "");
  const [note, setNote] = React.useState(bookmark?.note ?? "");
  const [tags, setTags] = React.useState(bookmark?.tags ?? []);
  const [colUid, setColUid] = React.useState(bookmark?.colUid ?? props.colUid ?? lists[0]?.colUid);
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);
  const known = React.useMemo(() => allTags(props.bookmarks), [props.bookmarks]);
  // A new one with a link that's saved already updates that one (rather than adding it twice)
  const existing = (!bookmark && isValidUrl(url)) ? props.bookmarks.find((x) => comparableUrl(x.url) === comparableUrl(url)) : undefined;

  // Changes from elsewhere (e.g. the title read from the page after it was saved, or a sync) are
  // shown, in the fields that weren't changed here
  const before = React.useRef(bookmark);
  React.useEffect(() => {
    const was = before.current;
    before.current = bookmark;
    if (!was || !bookmark || (was === bookmark)) {
      return;
    }
    setUrl((x) => (x === was.url) ? bookmark.url : x);
    setTitle((x) => (x === was.title) ? bookmark.title : x);
    setNote((x) => (x === was.note) ? bookmark.note : x);
    setTags((x) => (x.join() === was.tags.join()) ? bookmark.tags : x);
  }, [bookmark]);

  // The title of the page, read from it. This contacts the site, so it's only done when asked for.
  async function getTitle() {
    setFetching(true);
    const found = await fetchTitle(url);
    setFetching(false);
    if (found) {
      setTitle(found);
    } else {
      dispatch(pushMessage({ message: "The page's title couldn't be read", severity: "warning" }) as any);
    }
  }

  // (a list that's new, or the first one when the one it had is gone)
  React.useEffect(() => {
    if (!colUid || !lists.some((x) => x.colUid === colUid)) {
      setColUid(lists[0]?.colUid);
    }
  }, [lists]);

  async function save() {
    if (!isValidUrl(url)) {
      setError("This isn't a link that can be saved, e.g. https://example.com/page");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const data: BookmarkData = { url, title, note, tags };
      let where;
      if (bookmark) {
        where = await updateBookmark(etebase, bookmark, data, colUid);
      } else if (existing) {
        where = await updateBookmark(etebase, existing, {
          url,
          title: title || existing.title,
          note: note || existing.note,
          tags: Array.from(new Set([...existing.tags, ...tags])),
        }, colUid);
      } else {
        where = await createBookmark(etebase, data, colUid);
      }
      dispatch(pushMessage({ message: (bookmark || existing) ? "Bookmark saved" : "Bookmark added", severity: "success" }) as any);
      props.onSaved(where);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(normalizeUrl(url));
      dispatch(pushMessage({ message: "Link copied", severity: "success" }) as any);
    } catch (e) {
      dispatch(pushMessage({ message: "The link couldn't be copied", severity: "error" }) as any);
    }
  }

  const edited = bookmark && (Math.abs(bookmark.mtime - bookmark.created) > 60 * 1000);
  const listOptions = lists.map((x) => ({ ...x }));

  return (
    <View style={{ gap: 16 }} testID="bookmark-panel" aria-label={(bookmark) ? "Bookmark" : "New bookmark"}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[styles.panelTitle, { color: theme.colors.text }]} accessibilityRole="header">{(bookmark) ? "Bookmark" : "New bookmark"}</Text>
        {bookmark && (
          <>
            <OpenLink url={bookmark.url} label="Open">
              <View style={[styles.smallButton, { borderColor: theme.colors.border }]}>
                <MaterialCommunityIcons name="open-in-new" size={15} color={theme.colors.text} />
                <Text style={{ fontSize: 13, color: theme.colors.text }}>Open</Text>
              </View>
            </OpenLink>
            {(Platform.OS === "web") && (
              <IconButton icon="content-copy" size={16} accessibilityLabel="Copy link" iconColor={theme.colors.text} containerColor="transparent"
                onPress={copy} style={[styles.iconButton, { borderColor: theme.colors.border, borderWidth: 1 }]} />
            )}
          </>
        )}
        {props.onClose && (
          <IconButton icon="close" size={18} accessibilityLabel="Close" iconColor={theme.colors.textSecondary} containerColor="transparent" onPress={props.onClose} style={{ margin: 0 }} />
        )}
      </View>

      {bookmark && (
        <View style={[styles.summary, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <SiteTile url={bookmark.url} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ fontFamily: fonts.medium, color: theme.colors.text }}>{bookmarkTitle(bookmark)}</Text>
            <Text numberOfLines={1} style={{ fontFamily: mono, fontSize: 12, color: theme.colors.textMuted }}>{domainOf(bookmark.url)}</Text>
          </View>
        </View>
      )}

      <Labelled label="Link">
        <DialogInput
          value={url}
          onChangeText={(x) => {
            setUrl(x);
            setError(undefined);
          }}
          onSubmitEditing={save}
          autoFocus={!bookmark && !props.initialUrl}
          placeholder="https://"
          accessibilityLabel="Link"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          style={{ fontFamily: mono, fontSize: 13 }}
        />
        {/^https?:/i.test(normalizeUrl(url)) && isValidUrl(url) && (
          <View style={styles.getTitle}>
            <Text style={{ flex: 1, fontSize: 12, color: theme.colors.textMuted }}>Getting the title contacts {domainOf(normalizeUrl(url))}</Text>
            <Button label={(fetching) ? "Getting the title…" : "Get title"} icon="download-outline" disabled={fetching} onPress={getTitle} />
          </View>
        )}
      </Labelled>
      {existing && (
        <View style={[styles.notice, { backgroundColor: theme.colors.accentTint }]} accessibilityRole="alert">
          <MaterialCommunityIcons name="information-outline" size={17} color={theme.colors.text} />
          <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }}>
            You saved this link on {fmt.mediumDate(new Date(existing.created))}. Saving it again updates that bookmark.{" "}
            <Text accessibilityRole="link" onPress={() => props.onShow(existing)} style={{ color: theme.colors.accentText }}>Show it</Text>
          </Text>
        </View>
      )}
      <Labelled label="Title">
        <DialogInput value={title} onChangeText={setTitle} onSubmitEditing={save} placeholder={(isValidUrl(url)) ? domainOf(normalizeUrl(url)) : "The name of the page"} accessibilityLabel="Title" />
      </Labelled>
      <Labelled label="Note" optional>
        <DialogInput value={note} onChangeText={setNote} multiline placeholder="Why you saved it" accessibilityLabel="Note" style={styles.noteInput} />
      </Labelled>
      <TagsField value={tags} onChange={setTags} known={known} />
      <Labelled label="List">
        {(listOptions.length > 0) ? (
          <CollectionPicker label="List" collections={listOptions} value={colUid} onChange={setColUid} />
        ) : (
          <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Bookmarks (a new list, made when it&apos;s saved)</Text>
        )}
      </Labelled>
      {bookmark && (
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }} testID="bookmark-saved">
          Saved {fmt.mediumDate(new Date(bookmark.created))}{(savedFromLabel(bookmark.savedFrom)) ? ` ${savedFromLabel(bookmark.savedFrom)}` : ""}
          {(edited) ? ` · edited ${editedLabel(bookmark.mtime, fmt)}` : ""}
        </Text>
      )}
      {!!error && <Text style={{ fontSize: 13, color: theme.colors.error }} accessibilityLiveRegion="polite">{error}</Text>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label={(bookmark || existing) ? "Save changes" : "Save bookmark"} primary disabled={saving} onPress={save} />
        </View>
        {bookmark && <Button label="Delete" danger onPress={() => props.onDelete(bookmark)} />}
      </View>
    </View>
  );
}

// Saving a link by pasting it and pressing enter, or dropping one from the browser
function QuickSave(props: { onSave: (url: string) => Promise<boolean>, listName?: string }) {
  const theme = useTheme();
  const [value, setValue] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const ref = React.useRef<View>(null);

  async function submit(text: string) {
    const url = findUrl(text) ?? text.trim();
    if (!url) {
      return;
    }
    if (!isValidUrl(url)) {
      setError("That isn't a link, e.g. https://example.com/page");
      return;
    }
    setError(undefined);
    if (await props.onSave(url)) {
      setValue("");
    }
  }

  // Dropping a link (on the web), e.g. dragged from the browser's address bar or a page
  React.useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if ((Platform.OS !== "web") || !node) {
      return undefined;
    }
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.some((x) => (x === "text/uri-list") || (x === "text/plain"))) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const list = (e.dataTransfer?.getData("text/uri-list") ?? "").split(/\r?\n/).find((x) => x && !x.startsWith("#"));
      submit(list ?? e.dataTransfer?.getData("text/plain") ?? "");
    };
    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => {
      node.removeEventListener("dragover", over);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, [ref.current, props.onSave]);

  return (
    <View style={{ gap: 4 }}>
      <View ref={ref} testID="quick-save" style={[styles.quick, {
        borderColor: (dragging) ? theme.colors.accent : theme.colors.border,
        backgroundColor: (dragging) ? theme.colors.accentTint : theme.colors.surface,
      }]}>
        <MaterialCommunityIcons name="link-variant" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={(x) => {
            setValue(x);
            setError(undefined);
          }}
          onSubmitEditing={() => submit(value)}
          blurOnSubmit={false}
          placeholder={(dragging) ? "Drop the link to save it" : "Paste a link and press Enter — or drop one from your browser"}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Paste a link to save it"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          style={[styles.quickInput, { color: theme.colors.text }, (value) ? { fontFamily: mono, fontSize: 13 } : undefined]}
        />
        <Button label="Save" onPress={() => submit(value)} />
      </View>
      {!!error && <Text style={{ fontSize: 12, color: theme.colors.error, paddingLeft: 4 }} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

// The bar that shows when bookmarks are ticked: moving, tagging or deleting them together
function BulkBar(props: { count: number, onMove: (colUid: string) => void, onTag: (tag: string) => void, onDelete: () => void, onClear: () => void }) {
  const theme = useTheme();
  const lists = usePimCollections(C.bookmarkColType);
  const [moving, setMoving] = React.useState(false);
  const [tagging, setTagging] = React.useState<string>();
  const button = (label: string, onPress: () => void, color?: string) => (
    <TouchableRipple accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.barButton}>
      <Text style={{ fontSize: 13, color: color ?? theme.colors.text }}>{label}</Text>
    </TouchableRipple>
  );
  return (
    <View accessibilityRole="toolbar" aria-label="Selected bookmarks" style={[styles.bulk, { backgroundColor: theme.colors.field }]}>
      <Text style={{ flex: 1, fontFamily: fonts.semibold, color: theme.colors.text }}>{props.count} selected</Text>
      {(lists.length > 1) && (
        <Menu visible={moving} onDismiss={() => setMoving(false)} anchor={button("Move to…", () => setMoving(true))}>
          {lists.map((x) => (
            <MenuItem key={x.colUid} title={x.name} onPress={() => {
              setMoving(false);
              props.onMove(x.colUid);
            }} />
          ))}
        </Menu>
      )}
      {(tagging === undefined) ? button("Add tag…", () => setTagging("")) : (
        <TextInput
          autoFocus
          value={tagging}
          onChangeText={setTagging}
          onSubmitEditing={() => {
            if (normalizeTag(tagging)) {
              props.onTag(tagging);
            }
            setTagging(undefined);
          }}
          onBlur={() => setTagging(undefined)}
          placeholder="Tag, then Enter"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Tag to add"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.barInput, { color: theme.colors.text, borderColor: theme.colors.accent, backgroundColor: theme.colors.background }]}
        />
      )}
      {button("Delete", props.onDelete, theme.colors.error)}
      <IconButton icon="close" size={16} accessibilityLabel="Clear selection" iconColor={theme.colors.textMuted} containerColor="transparent" onPress={props.onClear} style={{ margin: 0 }} />
    </View>
  );
}

function BookmarkRow(props: { bookmark: Bookmark, selected: boolean, checked: boolean, compact: boolean, fmt: DateFormats, onToggle: () => void, onPress: () => void, onDelete: () => void }) {
  const theme = useTheme();
  const { bookmark, compact } = props;
  const title = bookmarkTitle(bookmark);
  const tags = <View style={[styles.tags, { gap: 6 }]}>{bookmark.tags.map((tag) => <Tag key={tag} tag={tag} />)}</View>;
  const when = <Text style={[styles.when, { color: theme.colors.textMuted }]}>{savedLabel(bookmark.created, props.fmt)}</Text>;
  return (
    <View style={[styles.row, (props.selected) ? { backgroundColor: theme.colors.accentTint, boxShadow: `inset 3px 0 0 ${theme.colors.accent}` } as any :
      (props.checked) ? { backgroundColor: tint(theme.colors.accent, 0.06) } : undefined]}>
      <Checkbox checked={props.checked} label={`Select ${title}`} onPress={props.onToggle} />
      <SiteTile url={bookmark.url} />
      <TouchableRipple accessibilityRole="button" accessibilityLabel={`Bookmark ${title}`} aria-selected={props.selected} onPress={props.onPress} style={styles.rowMain}>
        <View style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.medium, color: theme.colors.text }}>{title}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textMuted }}>
            <Text style={{ fontFamily: mono, fontSize: 12, color: theme.colors.textMuted }}>{domainOf(bookmark.url)}</Text>
            {!!bookmark.note && <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{" — "}{bookmark.note}</Text>}
          </Text>
          {compact && ((bookmark.tags.length > 0) ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{tags}{when}</View> : when)}
        </View>
      </TouchableRipple>
      {!compact && <View style={styles.colTags}>{tags}</View>}
      {!compact && <View style={styles.colWhen}>{when}</View>}
      <View style={styles.rowActions}>
        <OpenLink url={bookmark.url} label={`Open ${title}`}>
          <View style={styles.rowAction}>
            <MaterialCommunityIcons name="open-in-new" size={17} color={theme.colors.textMuted} />
          </View>
        </OpenLink>
        <IconButton icon="delete-outline" size={18} accessibilityLabel={`Delete ${title}`} iconColor={theme.colors.textMuted} containerColor="transparent" onPress={props.onDelete} style={{ margin: 0 }} />
      </View>
    </View>
  );
}

export default function BookmarksScreen(props: { route: RouteProp<RootStackParamList, "Bookmarks"> }) {
  const theme = useTheme();
  const dispatch = useDispatch();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const dialogs = useDialogs();
  const fmt = useDateFormats();
  const window = useWindowDimensions();
  const wide = window.width >= 1100;
  const lists = usePimCollections(C.bookmarkColType);
  const bookmarkItems = useSelector(bookmarksSelector);
  const all = React.useMemo(() => bookmarksFrom(bookmarkItems), [bookmarkItems]);
  const settings = useSelector((state: StoreState) => state.settings);
  const sort = settings.bookmarksSort ?? "newest";
  // (a list that isn't there anymore shows all of them)
  const filter = (lists.some((x) => x.colUid === settings.bookmarksFilter)) ? settings.bookmarksFilter : null;
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState(ALL);
  const [sortShown, setSortShown] = React.useState(false);
  // What the panel shows: a bookmark (by its key), or a new one (with the link it starts with)
  const [selected, setSelected] = React.useState<string>();
  const [creating, setCreating] = React.useState<{ url: string, n: number }>();
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set());
  const [deleted, setDeleted] = React.useState<Bookmark[]>([]);
  const [listWidth, setListWidth] = React.useState(800);

  // Opened for a bookmark (e.g. from the changes of a list), or to make one
  const params = props.route.params;
  React.useEffect(() => {
    if (params?.colUid && params?.itemUid) {
      setSelected(keyOf({ colUid: params.colUid, uid: params.itemUid }));
      setCreating(undefined);
    } else if (params?.url !== undefined) {
      setSelected(undefined);
      setCreating({ url: params.url, n: Date.now() });
    }
  }, [params]);

  const inList = all.filter((x) => !filter || (x.colUid === filter));
  const tags = React.useMemo(() => allTags(inList), [inList]);
  const hasUntagged = inList.some((x) => x.tags.length === 0);
  // The chosen tag may be gone (e.g. its last bookmark was deleted)
  const filterTag = ((tag === ALL) || (tag === UNTAGGED && hasUntagged) || tags.includes(tag)) ? tag : ALL;
  const words = query.trim().toLowerCase().split(/\s+/).filter((x) => x);
  const shown = inList.filter((x) => {
    if ((filterTag === UNTAGGED) ? (x.tags.length > 0) : ((filterTag !== ALL) && !x.tags.includes(filterTag))) {
      return false;
    }
    const text = [x.title, x.url, x.note, ...x.tags.map((t) => "#" + t)].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  }).sort(compare(sort));
  const checkedShown = shown.filter((x) => checked.has(keyOf(x)));
  const current = all.find((x) => keyOf(x) === selected);
  const listName = (filter) ? lists.find((x) => x.colUid === filter)?.name : "All bookmarks";
  const compact = listWidth < 700;

  if (syncGate) {
    return syncGate;
  }

  function show(where: { colUid: string, uid: string } | undefined) {
    setCreating(undefined);
    setSelected((where) ? keyOf(where) : undefined);
  }

  // Saves a link right away (into the list that is shown). It has no title until one is written, or
  // got from the page with "Get title" (its site is shown in the meantime).
  async function quickSave(url: string) {
    const there = all.find((x) => comparableUrl(x.url) === comparableUrl(url));
    if (there) {
      show(there);
      dispatch(pushMessage({ message: `You saved this link on ${fmt.mediumDate(new Date(there.created))} already`, severity: "info" }) as any);
      return true;
    }
    const where = await createBookmark(etebase, { url, title: "", note: "", tags: [] }, filter ?? undefined);
    show(where);
    dispatch(pushMessage({ message: "Bookmark saved", severity: "success" }) as any);
    return true;
  }

  async function remove(bookmarks: Bookmark[]) {
    for (const x of bookmarks) {
      await deleteBookmark(etebase, x);
    }
    const keys = new Set(bookmarks.map(keyOf));
    setChecked((x) => new Set([...x].filter((k) => !keys.has(k))));
    if (selected && keys.has(selected)) {
      setSelected(undefined);
    }
    // The Undo takes the place of the app's messages (e.g. "Bookmark saved"), which would cover it
    for (let i = (store.getState() as unknown as StoreState).messages.size; i > 0; i--) {
      dispatch(popMessage() as any);
    }
    setDeleted(bookmarks);
  }

  async function undo() {
    const bookmarks = deleted;
    setDeleted([]);
    for (const x of bookmarks) {
      await restoreBookmark(etebase, x);
    }
  }

  async function move(colUid: string) {
    const name = lists.find((x) => x.colUid === colUid)?.name;
    const moving = checkedShown.filter((x) => x.colUid !== colUid);
    for (const x of moving) {
      const where = await updateBookmark(etebase, x, x, colUid);
      if (selected === keyOf(x)) {
        setSelected(keyOf(where));
      }
    }
    setChecked(new Set());
    dispatch(pushMessage({ message: `${moving.length} ${(moving.length === 1) ? "bookmark" : "bookmarks"} moved to ${name}`, severity: "success" }) as any);
  }

  async function addTag(name: string) {
    await tagBookmarks(etebase, checkedShown, [name]);
    dispatch(pushMessage({ message: `#${normalizeTag(name)} added to ${checkedShown.length} ${(checkedShown.length === 1) ? "bookmark" : "bookmarks"}`, severity: "success" }) as any);
  }

  function toggle(bookmark: Bookmark) {
    setChecked((x) => {
      const ret = new Set(x);
      if (ret.has(keyOf(bookmark))) {
        ret.delete(keyOf(bookmark));
      } else {
        ret.add(keyOf(bookmark));
      }
      return ret;
    });
  }

  const allChecked = (shown.length > 0) && (checkedShown.length === shown.length);
  // (on wide screens the panel is always there: the chosen bookmark, or a new one)
  const panelOpen = wide || !!current || !!creating;
  const panel = panelOpen && (
    <BookmarkPanel
      key={(current) ? keyOf(current) : `new-${creating?.n ?? 0}-${filter}`}
      bookmark={current}
      initialUrl={creating?.url}
      colUid={filter ?? undefined}
      bookmarks={all}
      onSaved={(where) => show(where)}
      onDelete={(x) => remove([x])}
      onShow={(x) => show(x)}
      onClose={(wide) ? undefined : () => show(undefined)}
    />
  );

  const undoBar = (
    <Snackbar
      visible={deleted.length > 0}
      onDismiss={() => setDeleted([])}
      duration={8000}
      wrapperStyle={{ zIndex: 5 }}
      style={{ backgroundColor: theme.colors.chipActive }}
      action={{ label: "Undo", onPress: undo, textColor: (theme.dark) ? theme.colors.accent : "#A8BDF7" }}
    >
      <Text style={{ color: theme.colors.onChipActive }}>{(deleted.length > 1) ? `${deleted.length} bookmarks deleted` : "Bookmark deleted"}</Text>
    </Snackbar>
  );

  if (!wide && panelOpen) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">{panel}</ScrollView>
        {undoBar}
      </View>
    );
  }

  const chips = [ALL, ...tags, ...((hasUntagged && (tags.length > 0)) ? [UNTAGGED] : [])];

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexShrink: 1 }}>
            <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header" numberOfLines={1}>{listName}</Text>
            <Text style={{ color: theme.colors.textMuted }} testID="bookmarks-count">{inList.length}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <MaterialCommunityIcons name="magnify" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search bookmarks"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Search bookmarks"
              style={[styles.searchInput, { color: theme.colors.text }]}
            />
            {(query !== "") && (
              <IconButton icon="close" size={14} accessibilityLabel="Clear the search" iconColor={theme.colors.textMuted} containerColor="transparent" onPress={() => setQuery("")} style={{ margin: 0 }} />
            )}
          </View>
          <Menu
            visible={sortShown}
            onDismiss={() => setSortShown(false)}
            anchor={(
              <TouchableRipple accessibilityRole="button" accessibilityLabel={`Sort: ${sorts.find((x) => x.key === sort)?.label}`} onPress={() => setSortShown(true)}
                style={[styles.sort, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="sort" size={16} color={theme.colors.textMuted} />
                  <Text style={{ fontSize: 13, color: theme.colors.text }}>{sorts.find((x) => x.key === sort)?.label}</Text>
                </View>
              </TouchableRipple>
            )}
          >
            {sorts.map((x) => (
              <MenuItem key={x.key} title={x.label} active={x.key === sort} onPress={() => {
                setSortShown(false);
                dispatch(setSettings({ bookmarksSort: x.key }) as any);
              }} />
            ))}
          </Menu>
          <Button label="New bookmark" icon="plus" primary onPress={() => {
            setSelected(undefined);
            setCreating({ url: "", n: Date.now() });
          }} />
        </View>

        <View style={styles.content}>
          <QuickSave onSave={quickSave} />

          {(chips.length > 1) && (
            <View style={styles.chips} accessibilityRole="tablist" aria-label="Filter by tag">
              {chips.map((x) => (
                <TagChip key={x || "all"} label={(x === ALL) ? "All" : (x === UNTAGGED) ? "Untagged" : `#${x}`} selected={x === filterTag} onPress={() => setTag(x)} />
              ))}
            </View>
          )}

          {(checkedShown.length > 0) && (
            <BulkBar
              count={checkedShown.length}
              onMove={move}
              onTag={addTag}
              onDelete={() => remove(checkedShown)}
              onClear={() => setChecked(new Set())}
            />
          )}

          {(all.length === 0) ? (
            <EmptyState
              icon="bookmark-outline"
              title="No bookmarks yet"
              text="Paste a link above to save it, or bring in the bookmarks of your browser: export them from its bookmark manager as an HTML file, and import that."
              action={<Button label="Import bookmarks…" icon="tray-arrow-up" onPress={() => dialogs.importFiles(filter ?? lists[0]?.colUid)} />}
            />
          ) : (
            <View style={[styles.table, { borderColor: theme.colors.border }]} onLayout={(e) => setListWidth(e.nativeEvent.layout.width)} testID="bookmark-list">
              <View style={[styles.row, styles.headRow, { backgroundColor: theme.colors.surface }]}>
                <Checkbox checked={allChecked} label="Select all" onPress={() => setChecked((allChecked) ? new Set() : new Set(shown.map(keyOf)))} />
                <View style={{ width: 34 }} />
                <Text style={[styles.th, styles.rowMain, { color: theme.colors.textMuted }]}>Title</Text>
                {!compact && <Text style={[styles.th, styles.colTags, { color: theme.colors.textMuted }]}>Tags</Text>}
                {!compact && <Text style={[styles.th, styles.colWhen, { color: theme.colors.textMuted }]}>Saved</Text>}
                <View style={styles.rowActions} />
              </View>
              {shown.map((x) => (
                <View key={keyOf(x)} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider }}>
                  <BookmarkRow
                    bookmark={x}
                    selected={keyOf(x) === selected}
                    checked={checked.has(keyOf(x))}
                    compact={compact}
                    fmt={fmt}
                    onToggle={() => toggle(x)}
                    onPress={() => show(x)}
                    onDelete={() => remove([x])}
                  />
                </View>
              ))}
              {(shown.length === 0) && (
                <Text style={{ padding: 28, textAlign: "center", color: theme.colors.textMuted, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider }}>
                  {(words.length > 0) ? `No bookmarks match “${query.trim()}”.` : (filterTag !== ALL) ? "No bookmarks with this tag." : "No bookmarks in this list yet."}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
      {wide && (
        <ScrollView style={[{ width: 380, flexGrow: 0 }, panelStyle(theme)]} contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
          {panel}
        </ScrollView>
      )}
      {undoBar}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 14,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 26,
    letterSpacing: -0.3,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    width: 240,
    maxWidth: "100%",
    height: 38,
    paddingLeft: 10,
    borderWidth: 1,
    borderRadius: 9,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    fontSize: 13,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  sort: {
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 9,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 28,
    gap: 14,
  },
  quick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    paddingLeft: 14,
    paddingRight: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
  },
  quickInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
    justifyContent: "center",
  },
  bulk: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    minHeight: 46,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 10,
  },
  barButton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: "center",
  },
  barInput: {
    height: 34,
    width: 160,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 7,
    fontSize: 13,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  table: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 4,
    paddingRight: 8,
  },
  headRow: {
    paddingVertical: 2,
  },
  th: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  check: {
    padding: 8,
    borderRadius: 18,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    borderRadius: 6,
  },
  colTags: {
    width: 170,
  },
  colWhen: {
    width: 84,
  },
  when: {
    fontSize: 13,
  },
  rowActions: {
    width: 76,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  rowAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  tagRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addTag: {
    height: 30,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 15,
    justifyContent: "center",
  },
  tagInput: {
    borderStyle: "solid",
    width: 130,
    fontSize: 13,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  panelTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  iconButton: {
    margin: 0,
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  getTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notice: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 10,
  },
  noteInput: {
    height: 84,
    paddingTop: 10,
    textAlignVertical: "top",
  },
});
