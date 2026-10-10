// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The dialogs that open over any page: making a collection (a calendar, a task list, an address book
// or a notebook), and importing files (choose, review, done)

import * as React from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Modal, Portal, Text, TouchableRipple } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useDispatch } from "react-redux";

import { useCredentials } from "../credentials";
import { pushMessage, setSettings } from "../store/actions";
import { store, StoreState } from "../store";
import { fonts, useTheme } from "../theme";
import { saveFile } from "../import-export";
import { createCollection, CollectionInfo, Kind, kindOrder, kinds, swatches, useCollectionInfos } from "./collections";
import { acceptedFiles, Destination, Duplicates, ImportFile, isAccepted, KindResult, kindNoun, Parsed, readFiles, runImport } from "./importFiles";
import { useDateFormats } from "./format";
import { CollectionPicker } from "./widgets";
import { mono, tint } from "./style";
import * as Etebase from "etebase";

interface DialogsType {
  newCollection: (kind?: Kind) => void;
  importFiles: (colUid?: string) => void;
}

const DialogsContext = React.createContext<DialogsType>({ newCollection: () => undefined, importFiles: () => undefined });

export function useDialogs() {
  return React.useContext(DialogsContext);
}

export function DialogsProvider(props: React.PropsWithChildren<unknown>) {
  const [open, setOpen] = React.useState<{ type: "new", kind: Kind } | { type: "import", colUid?: string }>();
  const value = React.useMemo(() => ({
    newCollection: (kind?: Kind) => setOpen({ type: "new", kind: kind ?? "calendar" }),
    importFiles: (colUid?: string) => setOpen({ type: "import", colUid }),
  }), []);
  return (
    <DialogsContext.Provider value={value}>
      {props.children}
      {(open?.type === "new") && (
        <NewCollectionDialog kind={open.kind} onClose={() => setOpen(undefined)} onImport={() => setOpen({ type: "import" })} />
      )}
      {(open?.type === "import") && (
        <ImportDialog colUid={open.colUid} onClose={() => setOpen(undefined)} />
      )}
    </DialogsContext.Provider>
  );
}

function host(etebase: Etebase.Account | null | undefined) {
  try {
    return (etebase) ? new URL(etebase.serverUrl).host : "";
  } catch (e) {
    return "";
  }
}

// A dialog: its title (and steps), what's in it, and a bar with what it does at the bottom
function Frame(props: React.PropsWithChildren<{ title: string, steps?: { labels: string[], current: number }, onClose: () => void, footer: React.ReactNode, width: number, testID?: string }>) {
  const theme = useTheme();
  const etebase = useCredentials();
  const window = useWindowDimensions();
  return (
    <Portal>
      <Modal
        visible
        onDismiss={props.onClose}
        style={{ justifyContent: "flex-start" }}
        contentContainerStyle={[styles.dialog, {
          width: Math.min(props.width, window.width - 32),
          maxHeight: window.height - 96,
          marginTop: Math.min(80, window.height * 0.08),
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }]}
      >
        <View accessibilityRole={"dialog" as any} aria-label={props.title} testID={props.testID} style={{ maxHeight: window.height - 96 }}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: theme.colors.text }]} accessibilityRole="header">{props.title}</Text>
            {props.steps && (
              <View style={styles.steps} accessibilityLabel={`Step ${props.steps.current + 1} of ${props.steps.labels.length}: ${props.steps.labels[props.steps.current]}`}>
                {props.steps.labels.map((label, i) => {
                  const done = i < props.steps!.current;
                  const now = i === props.steps!.current;
                  return (
                    <View key={label} style={styles.step}>
                      <View style={[styles.stepDot, { backgroundColor: (done) ? theme.colors.success : (now) ? theme.colors.accent : theme.colors.field }]}>
                        {(done) ? <MaterialCommunityIcons name="check" size={12} color={theme.colors.onAccent} /> : (
                          <Text style={{ fontSize: 11, fontFamily: fonts.bold, color: (now) ? theme.colors.onAccent : theme.colors.textMuted }}>{i + 1}</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: (done || now) ? theme.colors.text : theme.colors.textMuted }}>{label}</Text>
                      {(i < props.steps!.labels.length - 1) && <View style={[styles.stepLine, { backgroundColor: theme.colors.border }]} />}
                    </View>
                  );
                })}
              </View>
            )}
            <TouchableRipple borderless accessibilityRole="button" accessibilityLabel="Close" onPress={props.onClose} style={styles.close}>
              <MaterialCommunityIcons name="close" size={18} color={theme.colors.textMuted} />
            </TouchableRipple>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {props.children}
          </ScrollView>
          <View style={[styles.foot, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
            <View style={styles.encrypted}>
              <MaterialCommunityIcons name="lock-outline" size={13} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                Encrypted, saved to <Text style={{ fontFamily: mono, fontSize: 12, color: theme.colors.textMuted }}>{host(etebase)}</Text>
              </Text>
            </View>
            {props.footer}
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

export function Button(props: { label: string, onPress: () => void, primary?: boolean, disabled?: boolean, danger?: boolean, icon?: string }) {
  const theme = useTheme();
  const color = (props.primary) ? theme.colors.onAccent : (props.danger) ? theme.colors.error : theme.colors.text;
  return (
    <TouchableRipple
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      aria-disabled={!!props.disabled}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, (props.primary) ? { backgroundColor: (props.disabled) ? theme.colors.field : theme.colors.accent, borderColor: "transparent" } :
        { borderColor: (props.danger) ? tint(theme.colors.error, 0.5) : theme.colors.border }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {props.icon && <MaterialCommunityIcons name={props.icon as any} size={16} color={color} />}
        <Text style={{ fontSize: 14, fontFamily: (props.primary) ? fonts.semibold : fonts.regular, color: (props.disabled && props.primary) ? theme.colors.textMuted : color }}>{props.label}</Text>
      </View>
    </TouchableRipple>
  );
}

export function SwatchPicker(props: { value: string, onChange: (color: string) => void, size?: number }) {
  const theme = useTheme();
  const size = props.size ?? 30;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole={"radiogroup" as any} aria-label="Colour">
      {swatches.map((x) => {
        const on = x.color.toLowerCase() === props.value.toLowerCase();
        return (
          <TouchableRipple
            key={x.name}
            borderless
            accessibilityRole="radio"
            accessibilityLabel={x.name}
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => props.onChange(x.color)}
            style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 2, borderColor: (on) ? theme.colors.text : "transparent", alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: x.color }} />
          </TouchableRipple>
        );
      })}
    </View>
  );
}

export function Labelled(props: React.PropsWithChildren<{ label: string, optional?: boolean }>) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: theme.colors.textSecondary }}>
        {props.label}{props.optional && <Text style={{ fontFamily: fonts.regular, color: theme.colors.textMuted }}> optional</Text>}
      </Text>
      {props.children}
    </View>
  );
}

export const DialogInput = React.forwardRef(function DialogInput(props: React.ComponentProps<typeof TextInput>, ref: React.Ref<TextInput>) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);
  const { style, ...rest } = props;
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.colors.textMuted}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: (focused) ? theme.colors.accent : theme.colors.border }, style]}
      {...rest}
    />
  );
});

const placeholders: { [kind in Kind]: string } = {
  calendar: "e.g. Family, Climbing club",
  contacts: "e.g. Clients, Neighbours",
  tasks: "e.g. Groceries, Side project",
  notes: "e.g. Journal, Ideas",
};

function NewCollectionDialog(props: { kind: Kind, onClose: () => void, onImport: () => void }) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const [kind, setKind] = React.useState<Kind>(props.kind);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(swatches[0].color);
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  const info = kinds[kind];

  async function create() {
    if (!name.trim()) {
      setError("The name is required");
      return;
    }
    setSaving(true);
    const colUid = await createCollection(etebase, kind, { name: name.trim(), description: description.trim(), color });
    dispatch(pushMessage({ message: `${info.one} created`, severity: "success" }) as any);
    props.onClose();
    // (to it: its section, or the notes of the notebook)
    if (kind === "notes") {
      const viewSettings = (store.getState() as unknown as StoreState).settings.viewSettings;
      dispatch(setSettings({ viewSettings: { ...viewSettings, filterBy: colUid } }) as any);
    }
    navigation.navigate("Root", { screen: info.screen });
  }

  return (
    <Frame
      title={`New ${info.noun}`}
      onClose={props.onClose}
      width={560}
      testID="new-collection"
      footer={(
        <>
          <Button label="Cancel" onPress={props.onClose} />
          <Button label={`Create ${info.noun}`} primary disabled={saving} onPress={create} />
        </>
      )}
    >
      <View style={styles.types} accessibilityRole={"radiogroup" as any} aria-label="Type">
        {kindOrder.map((k) => {
          const on = k === kind;
          return (
            <TouchableRipple
              key={k}
              accessibilityRole="radio"
              accessibilityLabel={kinds[k].one}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => setKind(k)}
              style={[styles.type, { borderColor: (on) ? theme.colors.accent : theme.colors.border, backgroundColor: (on) ? theme.colors.accentTint : theme.colors.background }]}
            >
              <View style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name={kinds[k].icon as any} size={20} color={(on) ? theme.colors.text : theme.colors.textSecondary} />
                <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: (on) ? theme.colors.text : theme.colors.textSecondary }}>{kinds[k].one}</Text>
              </View>
            </TouchableRipple>
          );
        })}
      </View>
      <Labelled label="Name">
        <DialogInput autoFocus value={name} onChangeText={(x) => {
          setName(x);
          setError(undefined);
        }} onSubmitEditing={create} placeholder={placeholders[kind]} accessibilityLabel="Name" />
        {!!error && <Text style={{ fontSize: 12, color: theme.colors.error }}>{error}</Text>}
      </Labelled>
      <Labelled label="Description" optional>
        <DialogInput value={description} onChangeText={setDescription} accessibilityLabel="Description" />
      </Labelled>
      <Text accessibilityRole="link" onPress={props.onImport} style={{ fontSize: 13, color: theme.colors.accentText }}>
        <MaterialCommunityIcons name="tray-arrow-up" size={14} color={theme.colors.accentText} /> Have an .ics, .vcf or notes file? Import it instead
      </Text>
      <Labelled label="Colour">
        <SwatchPicker value={color} onChange={setColor} />
      </Labelled>
    </Frame>
  );
}

// Reads files that were chosen or dropped, as text
async function readChosen(files: FileList | File[]): Promise<ImportFile[]> {
  const ret: ImportFile[] = [];
  for (const file of Array.from(files)) {
    ret.push({ name: file.name, size: file.size, text: await file.text() });
  }
  return ret;
}

function chooseFiles(): Promise<ImportFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = acceptedFiles.join(",");
    input.addEventListener("change", () => {
      readChosen(input.files ?? []).then(resolve, () => resolve([]));
    });
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

function sizeOf(bytes: number) {
  return (bytes < 1024) ? `${bytes} B` : (bytes < 1024 * 1024) ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Radio(props: { label: string, hint?: string, checked: boolean, onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableRipple
      accessibilityRole="radio"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.checked }}
      aria-checked={props.checked}
      onPress={props.onPress}
      style={{ borderRadius: 8, paddingVertical: 6, paddingHorizontal: 2 }}
    >
      <View style={{ flexDirection: "row", gap: 10 }}>
        <MaterialCommunityIcons name={(props.checked) ? "radiobox-marked" : "radiobox-blank"} size={18} color={(props.checked) ? theme.colors.accent : theme.colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text }}>{props.label}</Text>
          {props.hint && <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{props.hint}</Text>}
        </View>
      </View>
    </TouchableRipple>
  );
}

function ImportDialog(props: { colUid?: string, onClose: () => void }) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const navigation = useNavigation<any>();
  const fmt = useDateFormats();
  const collections = useCollectionInfos(etebase);
  const target = collections.find((x) => x.colUid === props.colUid);
  const [step, setStep] = React.useState<"pick" | "review" | "done">("pick");
  const [parsed, setParsed] = React.useState<Parsed>();
  const [include, setInclude] = React.useState<{ [kind in Kind]?: boolean }>({});
  const [where, setWhere] = React.useState<{ [kind in Kind]?: string }>({});
  const [duplicates, setDuplicates] = React.useState<Duplicates>("skip");
  const [previewShown, setPreviewShown] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<KindResult[]>();
  const [error, setError] = React.useState<string>();
  const [dragging, setDragging] = React.useState(false);
  const dropRef = React.useRef<View>(null);

  // (a read only collection can't be imported into)
  const writable = (kind: Kind) => collections.filter((x) => (x.kind === kind) && (x.accessLevel !== Etebase.CollectionAccessLevel.ReadOnly));

  function load(files: ImportFile[]) {
    setError(undefined);
    if (files.length === 0) {
      return;
    }
    const accepted = files.filter((x) => isAccepted(x.name));
    if (accepted.length === 0) {
      setError("These files can't be imported: choose .ics, .vcf, .md or .txt files.");
      return;
    }
    const result = readFiles(accepted);
    const found = kindOrder.filter((k) => result.entries[k].length > 0);
    if (found.length === 0) {
      setError((result.unreadable.length > 0) ? `Nothing could be read: ${result.unreadable[0].what} ${result.unreadable[0].reason}.` : "There is nothing to import in these files.");
      return;
    }
    // Each kind goes to the collection it was opened from (when it's of that kind), or the first one
    const choice: { [kind in Kind]?: string } = {};
    const on: { [kind in Kind]?: boolean } = {};
    for (const kind of found) {
      const list = writable(kind);
      choice[kind] = (target?.kind === kind && list.includes(target)) ? target.colUid : (list[0]?.colUid ?? "new");
      on[kind] = true;
    }
    setParsed(result);
    setWhere(choice);
    setInclude(on);
    setStep("review");
  }

  // Dropping files (on the web)
  React.useEffect(() => {
    const node = dropRef.current as unknown as HTMLElement | null;
    if ((Platform.OS !== "web") || !node || (step !== "pick")) {
      return undefined;
    }
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      readChosen(e.dataTransfer?.files ?? []).then(load);
    };
    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => {
      node.removeEventListener("dragover", over);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, [step, dropRef.current]);

  const fileNames = parsed?.files.map((x) => x.name).join(", ") ?? "";
  const chosenKinds = kindOrder.filter((k) => include[k] && parsed?.entries[k].length);
  const count = chosenKinds.reduce((sum, k) => sum + parsed!.entries[k].length, 0);

  async function run() {
    if (!parsed) {
      return;
    }
    setRunning(true);
    try {
      const destinations: { [kind in Kind]?: Destination } = {};
      for (const kind of chosenKinds) {
        const name = parsed.files[0].name.replace(/\.[^.]+$/, "");
        destinations[kind] = (where[kind] === "new") ? { newName: name } : { colUid: where[kind]! };
      }
      setResults(await runImport(etebase, parsed, destinations, duplicates));
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function saveReport() {
    const lines = [
      `Import of ${fileNames}`,
      "",
      ...(results ?? []).map((r) => `${kinds[r.kind].label} into "${r.name}": ${r.added} added, ${r.updated} updated, ${r.skipped} skipped (already there)`),
      "",
      ...((parsed?.unreadable.length) ? ["Couldn't be read:", ...parsed.unreadable.map((u) => `- ${u.file}${(u.line) ? `, line ${u.line}` : ""}: ${u.what} ${u.reason}`)] : []),
    ];
    saveFile("import-report.txt", new TextEncoder().encode(lines.join("\n") + "\n"), "text/plain");
  }

  const steps = { labels: ["Choose", "Review", "Done"], current: ["pick", "review", "done"].indexOf(step) };
  const mainKind = results?.[0]?.kind ?? chosenKinds[0];
  let footer: React.ReactNode;
  if (step === "pick") {
    footer = <Button label="Cancel" onPress={props.onClose} />;
  } else if (step === "review") {
    footer = (
      <>
        <Button label="Back" onPress={() => setStep("pick")} />
        <Button label={(count) ? `Import ${count} ${(count === 1) ? "item" : "items"}` : "Nothing selected"} primary disabled={!count || running} onPress={run} />
      </>
    );
  } else {
    footer = (
      <>
        <Button label="Import another file" onPress={() => {
          setParsed(undefined);
          setResults(undefined);
          setStep("pick");
        }} />
        {mainKind && <Button label={`Open ${(mainKind === "notes") ? "notes" : kinds[mainKind].noun.replace(/ list$/, "s").replace("address book", "contacts")}`} primary onPress={() => {
          props.onClose();
          if ((mainKind === "notes") && results?.[0]) {
            const viewSettings = (store.getState() as unknown as StoreState).settings.viewSettings;
            store.dispatch(setSettings({ viewSettings: { ...viewSettings, filterBy: results[0].colUid } }) as any);
          }
          navigation.navigate("Root", { screen: kinds[mainKind].screen });
        }} />}
      </>
    );
  }

  const describe = (kind: Kind) => {
    const entries = parsed!.entries[kind];
    if (kind === "calendar") {
      const dates = entries.map((x) => x.date).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
      return (dates.length) ? `${fmt.mediumDate(dates[0])} – ${fmt.mediumDate(dates[dates.length - 1])}` : "";
    } else if (kind === "tasks") {
      const due = entries.filter((x) => x.date).length;
      return `${due} with due dates`;
    }
    return "";
  };

  return (
    <Frame title="Import" steps={steps} onClose={() => !running && props.onClose()} footer={footer} width={640} testID="import-dialog">
      {(step === "pick") && (
        <>
          {target && (
            <View style={[styles.into, { backgroundColor: theme.colors.field }]}>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Into</Text>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: target.color }} />
              <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: theme.colors.text }}>{target.name}</Text>
            </View>
          )}
          <View ref={dropRef} style={[styles.drop, { borderColor: (dragging) ? theme.colors.accent : theme.colors.border, backgroundColor: (dragging) ? theme.colors.accentTint : theme.colors.background }]} testID="drop-zone">
            <View style={[styles.dropIcon, { backgroundColor: tint(theme.colors.accent, 0.16) }]}>
              <MaterialCommunityIcons name="tray-arrow-up" size={24} color={theme.colors.accent} />
            </View>
            <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: theme.colors.text }}>Drop files here</Text>
            <Text style={{ color: theme.colors.textMuted }}>or</Text>
            <Button label="Choose files…" primary onPress={() => chooseFiles().then(load)} />
          </View>
          {!!error && <Text style={{ color: theme.colors.error }} accessibilityLiveRegion="polite">{error}</Text>}
          <View style={styles.kinds}>
            {[[".ics", "Events and tasks"], [".vcf", "Contacts"], [".md .txt", "Notes, one per file"]].map(([ext, what]) => (
              <View key={ext} style={[styles.kindBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                <Text style={{ fontFamily: mono, fontSize: 13, color: theme.colors.text }}>{ext}</Text>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{what}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Files are read on this device and encrypted before upload. Nothing is sent until you confirm.</Text>
        </>
      )}

      {(step === "review") && parsed && (
        <>
          <View style={[styles.fileCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
            <View style={[styles.fileIcon, { backgroundColor: theme.colors.field }]}>
              <Text style={{ fontFamily: mono, fontSize: 11, color: theme.colors.textSecondary }}>{(parsed.files[0].name.split(".").pop() ?? "").toUpperCase().slice(0, 4)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.medium, color: theme.colors.text }}>{fileNames}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }} testID="import-found">
                {sizeOf(parsed.files.reduce((s, x) => s + x.size, 0))} · {kindOrder.filter((k) => parsed.entries[k].length).map((k) => `${parsed.entries[k].length} ${kindNoun(k, parsed.entries[k].length)}`).join(" and ")} found
              </Text>
            </View>
            <Button label="Change file" onPress={() => setStep("pick")} />
          </View>

          <Labelled label="Import into">
            {kindOrder.filter((k) => parsed.entries[k].length).map((kind) => {
              const on = !!include[kind];
              const options = [...writable(kind).map((x) => ({ colUid: x.colUid, name: x.name, color: x.color, collectionType: kinds[kind].type })),
                { colUid: "new", name: `New ${kinds[kind].noun}…`, color: theme.colors.disabled, collectionType: kinds[kind].type }];
              const n = parsed.entries[kind].length;
              return (
                <View key={kind} style={[styles.dest, { borderColor: theme.colors.border }]}>
                  <TouchableRipple
                    borderless
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Import ${n} ${kindNoun(kind, n)}`}
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    onPress={() => setInclude({ ...include, [kind]: !on })}
                    style={{ borderRadius: 4 }}
                  >
                    <MaterialCommunityIcons name={(on) ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={(on) ? theme.colors.accent : theme.colors.textMuted} />
                  </TouchableRipple>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={{ fontFamily: fonts.medium, color: (on) ? theme.colors.text : theme.colors.textMuted }}>{n} {kindNoun(kind, n)}</Text>
                    {!!describe(kind) && <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{describe(kind)}</Text>}
                  </View>
                  <View style={{ width: 220, opacity: (on) ? 1 : 0.5 }} pointerEvents={(on) ? "auto" : "none"}>
                    <CollectionPicker label={`Where the ${kinds[kind].unit} go`} collections={options} value={where[kind]} onChange={(x) => setWhere({ ...where, [kind]: x })} />
                  </View>
                </View>
              );
            })}
          </Labelled>

          <Labelled label="Items that already exist">
            <View accessibilityRole={"radiogroup" as any} aria-label="Items that already exist">
              <Radio label="Skip them" hint="Recommended. Matches by the item’s ID, so importing the same file again is safe." checked={duplicates === "skip"} onPress={() => setDuplicates("skip")} />
              <Radio label="Update them from the file" hint="Overwrites changes you made in the app." checked={duplicates === "update"} onPress={() => setDuplicates("update")} />
              <Radio label="Import as copies" hint="You may end up with duplicates." checked={duplicates === "copy"} onPress={() => setDuplicates("copy")} />
            </View>
          </Labelled>

          {(parsed.unreadable.length > 0) && (
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>
              {parsed.unreadable.length} {(parsed.unreadable.length === 1) ? "entry" : "entries"} can’t be read and will be left out.
            </Text>
          )}

          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 8 }}>
            <TouchableRipple accessibilityRole="button" accessibilityLabel="Preview first 5 items" aria-expanded={previewShown} onPress={() => setPreviewShown(!previewShown)} style={{ paddingVertical: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name={(previewShown) ? "chevron-down" : "chevron-right"} size={16} color={theme.colors.textSecondary} />
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Preview first 5 items</Text>
              </View>
            </TouchableRipple>
            {previewShown && kindOrder.flatMap((k) => parsed.entries[k]).slice(0, 5).map((x, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, paddingVertical: 2, paddingLeft: 22 }}>
                <Text style={{ width: 110, fontFamily: mono, fontSize: 12, color: theme.colors.textMuted }}>{(x.date) ? fmt.shortDate(x.date) : ""}</Text>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: theme.colors.text }}>{x.title}</Text>
              </View>
            ))}
          </View>
          {!!error && <Text style={{ color: theme.colors.error }}>{error}</Text>}
        </>
      )}

      {(step === "done") && results && parsed && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={[styles.doneIcon, { backgroundColor: tint(theme.colors.success, 0.16) }]}>
              <MaterialCommunityIcons name="check" size={22} color={theme.colors.success} />
            </View>
            <View>
              <Text style={{ fontSize: 17, fontFamily: fonts.semibold, color: theme.colors.text }} testID="import-done">
                {results.reduce((s, r) => s + r.added + r.updated, 0)} items imported
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>from {fileNames}</Text>
            </View>
          </View>
          <View style={[styles.summary, { borderColor: theme.colors.border }]} testID="import-summary">
            {results.flatMap((r) => [
              (r.added > 0) && { key: `${r.kind}-added`, color: collections.find((x) => x.colUid === r.colUid)?.color, text: `${kinds[r.kind].unit[0].toUpperCase()}${kinds[r.kind].unit.slice(1)} added to`, name: r.name, count: r.added },
              (r.updated > 0) && { key: `${r.kind}-updated`, color: collections.find((x) => x.colUid === r.colUid)?.color, text: `${kinds[r.kind].unit[0].toUpperCase()}${kinds[r.kind].unit.slice(1)} updated in`, name: r.name, count: r.updated },
              (r.skipped > 0) && { key: `${r.kind}-skipped`, color: theme.colors.disabled, text: "Skipped, already in", name: r.name, count: r.skipped, muted: true },
            ]).filter((x): x is any => !!x).map((x, i) => (
              <View key={x.key} style={[styles.summaryRow, (i > 0) ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border } : undefined]}>
                <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: x.color ?? theme.colors.accent }} />
                <Text style={{ flex: 1, color: (x.muted) ? theme.colors.textMuted : theme.colors.text }}>{x.text} <Text style={{ fontFamily: fonts.semibold }}>{x.name}</Text></Text>
                <Text style={{ fontFamily: mono, fontSize: 13, color: (x.muted) ? theme.colors.textMuted : theme.colors.text }}>{x.count}</Text>
              </View>
            ))}
            {(parsed.unreadable.length > 0) && (
              <View style={[styles.summaryRow, { alignItems: "flex-start", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, backgroundColor: tint("#F09A5C", 0.08) }]}>
                <MaterialCommunityIcons name="alert-outline" size={16} color="#F09A5C" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.colors.text }}>
                    {parsed.unreadable.length} {(parsed.unreadable.length === 1) ? "entry" : "entries"} couldn’t be read
                  </Text>
                  {parsed.unreadable.slice(0, 5).map((u, i) => (
                    <Text key={i} style={{ fontSize: 12, color: theme.colors.textMuted }}>
                      {u.what} {u.reason}{(u.line) ? ` (line ${u.line})` : ""}{(parsed.files.length > 1) ? ` · ${u.file}` : ""}.
                    </Text>
                  ))}
                </View>
                <Text accessibilityRole="link" onPress={saveReport} style={{ fontSize: 13, color: theme.colors.accentText }}>Save report</Text>
              </View>
            )}
          </View>
        </>
      )}
    </Frame>
  );
}

export type { CollectionInfo };

const styles = StyleSheet.create({
  dialog: {
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
  },
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  title: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 19,
  },
  steps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    width: 14,
    height: 1,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 18,
  },
  foot: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  encrypted: {
    flex: 1,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  button: {
    height: 38,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 9,
    justifyContent: "center",
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9,
    fontSize: 14,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  types: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  type: {
    flexGrow: 1,
    flexBasis: 110,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  into: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  drop: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  dropIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  kinds: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kindBox: {
    flexGrow: 1,
    flexBasis: 150,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dest: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  doneIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
