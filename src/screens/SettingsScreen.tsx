// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { Linking } from "react-native";
import { List, Switch } from "react-native-paper";
import { useDispatch, useSelector } from "react-redux";
import * as Updates from "expo-updates";
import { format } from "date-fns";

import { LogLevel } from "../logging";

import { useCredentials } from "../credentials";

import ScrollView from "../widgets/ScrollView";

import { StoreState, store } from "../store";
import { setSettings, pushMessage } from "../store/actions";
import { ViewModeKey } from "../store/reducers";

import * as C from "../constants";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import AnchorButton from "../widgets/AnchorButton";
import FontSelector from "../widgets/FontSelector";
import Select from "../widgets/Select";
import { RootStackParamList } from "../RootStackParamList";
import { useTheme } from "../theme";
import { locales } from "../pim/format";
import { exportNotes, importNotes, pickFile, readNotesZip, saveFile } from "../import-export";

// A setting that is one of a few options, shown with the chosen one's name
function OptionSelector<T extends string>(props: { title: string, description: string, options: { [key in T]: string }, value: T, onChange: (value: T) => void }) {
  const [open, setOpen] = React.useState(false);
  const keys = Object.keys(props.options) as T[];
  return (
    <List.Item
      title={props.title}
      description={props.description}
      onPress={() => setOpen(true)}
      right={(rightProps) =>
        <Select
          {...rightProps}
          visible={open}
          onDismiss={() => setOpen(false)}
          options={keys}
          titleAccossor={(x) => props.options[x]}
          active={(x) => x === props.value}
          onChange={(selected) => {
            setOpen(false);
            if (selected && (selected !== props.value)) {
              props.onChange(selected);
            }
          }}
          anchor={(
            <AnchorButton open={open} onPress={() => setOpen(true)}>
              {props.options[props.value]}
            </AnchorButton>
          )}
        />
      }
    />
  );
}

// The settings of the calendar and the tasks, which came from the web app
function CalendarAndTasksSettings() {
  const dispatch = useDispatch();
  const locale = useSelector((state: StoreState) => state.settings.locale);
  const taskSettings = useSelector((state: StoreState) => state.settings.taskSettings);
  return (
    <List.Section>
      <List.Subheader>Calendar and Tasks</List.Subheader>
      <OptionSelector
        title="Date and time format"
        description={locales[locale] ?? locales["en-gb"]}
        options={{ "en-gb": "UK", "en-us": "US" }}
        value={(locale === "en-us") ? "en-us" : "en-gb"}
        onChange={(value) => dispatch(setSettings({ locale: value }) as any)}
      />
      <OptionSelector
        title="Sort tasks by"
        description="The order of the task list"
        options={{ smart: "Due date", title: "Title" }}
        value={taskSettings.sortBy}
        onChange={(sortBy) => dispatch(setSettings({ taskSettings: { ...taskSettings, sortBy } }) as any)}
      />
    </List.Section>
  );
}

function DarkModePreferenceSelector() {
  const dispatch = useDispatch();
  const [selectDarkModeOpen, setDarkModePreferenceOpen] = React.useState(false);
  const darkModePreference = useSelector((state: StoreState) => state.settings.theme);
  const prettyName: { [key: string]: string } = {
    auto: "Auto",
    dark: "Dark",
    light: "Light",
  };

  return (
    <List.Item
      title="Theme"
      description="Set the app's theme to dark, light or auto"
      onPress={() => setDarkModePreferenceOpen(true)}
      right={(props) =>
        <Select
          {...props}
          visible={selectDarkModeOpen}
          onDismiss={() => setDarkModePreferenceOpen(false)}
          options={["auto", "dark", "light"]}
          titleAccossor={(x) => prettyName[x]}
          active={(x) => x === darkModePreference}
          onChange={(selected) => {
            setDarkModePreferenceOpen(false);
            if (selected === darkModePreference) {
              return;
            }
            dispatch(setSettings({ theme: selected as typeof darkModePreference }) as any);
          }}
          anchor={(
            <AnchorButton
              open={selectDarkModeOpen}
              onPress={() => setDarkModePreferenceOpen(true)}
            >
              {prettyName[darkModePreference]}
            </AnchorButton>
          )}
        />
      }
    />
  );
}

function FontSizePreferenceSelector() {
  const dispatch = useDispatch();
  const [selectFontSizeOpen, setFontSizePreferenceOpen] = React.useState(false);
  const fontSizePreference = useSelector((state: StoreState) => state.settings.fontSize);
  const prettyName: { [key: string]: string } = {
    8: "Extra Small",
    12: "Small",
    16: "Medium",
    20: "Large",
    24: "Extra Large",
  };

  return (
    <List.Item
      title="Font Size"
      description="Set the content's font size"
      onPress={() => setFontSizePreferenceOpen(true)}
      right={(props) =>
        <Select
          {...props}
          visible={selectFontSizeOpen}
          onDismiss={() => setFontSizePreferenceOpen(false)}
          options={Object.keys(prettyName)}
          titleAccossor={(x) => prettyName[x]}
          active={(x) => x === fontSizePreference.toString()}
          onChange={(selected_) => {
            setFontSizePreferenceOpen(false);
            const selected = (selected_ !== null) ? parseInt(selected_) : null;
            if (selected === fontSizePreference) {
              return;
            }
            dispatch(setSettings({ fontSize: selected as typeof fontSizePreference }) as any);
          }}
          anchor={(
            <AnchorButton
              open={selectFontSizeOpen}
              onPress={() => setFontSizePreferenceOpen(true)}
            >
              {fontSizePreference && prettyName[fontSizePreference]}
            </AnchorButton>
          )}
        />
      }
    />
  );
}

function EditorFontFamilyPreferenceSelector() {
  const dispatch = useDispatch();
  const [selectEditorFontFamilyOpen, setEditorFontFamilyPreferenceOpen] = React.useState(false);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const { editorFontFamily } = viewSettings;

  return (
    <List.Item
      title="Editor Font"
      description="Set the font used in the note editor"
      onPress={() => setEditorFontFamilyPreferenceOpen(true)}
      right={(props) =>
        <FontSelector
          {...props}
          visible={selectEditorFontFamilyOpen}
          selected={editorFontFamily ?? "monospace"}
          onOpen={() => setEditorFontFamilyPreferenceOpen(true)}
          onDismiss={() => setEditorFontFamilyPreferenceOpen(false)}
          onChange={(selected) => {
            setEditorFontFamilyPreferenceOpen(false);
            if (selected == null || selected === editorFontFamily) {
              return;
            }
            dispatch(setSettings({
              viewSettings: {
                ...viewSettings,
                editorFontFamily: selected,
              },
            }) as any);
          }}
        />
      }
    />
  );
}

function ViewerFontFamilyPreferenceSelector() {
  const dispatch = useDispatch();
  const [selectViewerFontFamilyOpen, setViewerFontFamilyPreferenceOpen] = React.useState(false);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const { viewerFontFamily } = viewSettings;

  return (
    <List.Item
      title="Preview Font"
      description="Set the font used in the note preview"
      onPress={() => setViewerFontFamilyPreferenceOpen(true)}
      right={(props) =>
        <FontSelector
          {...props}
          visible={selectViewerFontFamilyOpen}
          selected={viewerFontFamily ?? "regular"}
          onOpen={() => setViewerFontFamilyPreferenceOpen(true)}
          onDismiss={() => setViewerFontFamilyPreferenceOpen(false)}
          onChange={(selected) => {
            setViewerFontFamilyPreferenceOpen(false);
            if (selected == null || selected === viewerFontFamily) {
              return;
            }
            dispatch(setSettings({
              viewSettings: {
                ...viewSettings,
                viewerFontFamily: selected as typeof viewerFontFamily,
              },
            }) as any);
          }}
        />
      }
    />
  );
}

function ViewModePreferenceSelector() {
  const dispatch = useDispatch();
  const [selectViewModeOpen, setViewModePreferenceOpen] = React.useState(false);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);
  const { defaultViewMode } = viewSettings;

  const options: ViewModeKey[] = ["last", "viewer", "editor"];

  const prettyName: Record<ViewModeKey, string> = {
    last: "Last used",
    viewer: "Preview",
    editor: "Editor",
  };

  return (
    <List.Item
      title="Default View Mode"
      description="Set the default view mode for notes"
      onPress={() => setViewModePreferenceOpen(true)}
      right={(props) =>
        <Select
          {...props}
          visible={selectViewModeOpen}
          onDismiss={() => setViewModePreferenceOpen(false)}
          options={options}
          titleAccossor={(x) => prettyName[x]}
          active={(x) => x === defaultViewMode}
          onChange={(selected) => {
            setViewModePreferenceOpen(false);
            if (!selected || selected === defaultViewMode) {
              return;
            }
            dispatch(setSettings({
              viewSettings: {
                ...viewSettings,
                defaultViewMode: selected,
              },
            }) as any);
          }}
          anchor={(
            <AnchorButton
              open={selectViewModeOpen}
              onPress={() => setViewModePreferenceOpen(true)}
            >
              {prettyName[defaultViewMode]}
            </AnchorButton>
          )}
        />
      }
    />
  );
}

type NavigationProp = StackNavigationProp<RootStackParamList, "Settings">;

const SettingsScreen = function _SettingsScreen() {
  const etebase = useCredentials();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch();
  const theme = useTheme();
  const settings = useSelector((state: StoreState) => state.settings);

  const [exporting, setExporting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const loggedIn = !!etebase;

  async function onExport() {
    setExporting(true);
    try {
      const { data, count } = await exportNotes(etebase!, store.getState() as unknown as StoreState);
      const name = `etesync-notes-${format(new Date(), "yyyy-MM-dd")}.zip`;
      if (await saveFile(name, data, "application/zip")) {
        dispatch(pushMessage({ message: `Exported ${count} ${(count === 1) ? "note" : "notes"} to ${name}`, severity: "success" }) as any);
      }
    } catch (e) {
      dispatch(pushMessage({ message: `Export failed: ${e.message}`, severity: "error" }) as any);
    } finally {
      setExporting(false);
    }
  }

  async function onImport() {
    setImporting(true);
    try {
      const data = await pickFile([".zip", "application/zip", "application/x-zip-compressed"]);
      if (!data) {
        return;
      }
      const notes = readNotesZip(data);
      if (notes.length === 0) {
        dispatch(pushMessage({ message: "There are no notes (Markdown files) in this file", severity: "warning" }) as any);
        return;
      }
      const { imported, skipped, notebooksCreated } = await importNotes(etebase!, store.getState() as unknown as StoreState, notes);
      const parts = [`Imported ${imported} ${(imported === 1) ? "note" : "notes"}`];
      if (notebooksCreated > 0) {
        parts.push(`${notebooksCreated} new ${(notebooksCreated === 1) ? "notebook" : "notebooks"}`);
      }
      if (skipped > 0) {
        parts.push(`${skipped} already there`);
      }
      dispatch(pushMessage({ message: parts.join(", "), severity: "success" }) as any);
    } catch (e) {
      dispatch(pushMessage({ message: `Import failed: ${e.message}`, severity: "error" }) as any);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }}>
        {loggedIn && (
          <List.Section>
            <List.Subheader>Account</List.Subheader>
            {!C.genericMode &&
              <List.Item
                title="Account Dashboard"
                description="Change your payment info, plan and other account settings"
                onPress={async () => {
                  try {
                    const url = await etebase!.getDashboardUrl();
                    Linking.openURL(url);
                  } catch (e) {
                    dispatch(pushMessage({ message: e.message, severity: "error" }) as any);
                  }
                }}
              />
            }
            <List.Item
              title="Change Password"
              description="Change your account's password"
              onPress={() => { navigation.navigate("Password") }}
            />
            <List.Item
              title="Export Notes"
              description={(exporting) ? "Exporting…" : "Save all of your notes as Markdown files in a zip, a folder for every notebook"}
              disabled={exporting}
              onPress={onExport}
            />
            <List.Item
              title="Import Notes"
              description={(importing) ? "Importing…" : "Add notes from a zip of Markdown files, a folder for every notebook (as the export makes it)"}
              disabled={importing}
              onPress={onImport}
            />
          </List.Section>
        )}

        <List.Section>
          <List.Subheader>General</List.Subheader>
          <DarkModePreferenceSelector />
          <FontSizePreferenceSelector />
          <EditorFontFamilyPreferenceSelector />
          <ViewerFontFamilyPreferenceSelector />
          <ViewModePreferenceSelector />
        </List.Section>
        <CalendarAndTasksSettings />
        <List.Section>
          <List.Item
            title="About"
            description="About and open source licenses"
            onPress={() => {
              navigation.navigate("About");
            }}
          />
        </List.Section>

        {!C.genericMode && (
          <List.Section>
            <List.Subheader>Debugging</List.Subheader>
            <List.Item
              title="Enable Logging"
              description={(settings.logLevel === LogLevel.Off) ? "Click to enable debug logging" : "Click to disable debug logging"}
              accessible={false}
              right={(props) =>
                <Switch
                  {...props}
                  color={theme.colors.primary}
                  value={settings.logLevel !== LogLevel.Off}
                  onValueChange={(value) => {
                    dispatch(setSettings({ logLevel: (value) ? LogLevel.Debug : LogLevel.Off }) as any);
                  }}
                />
              }
            />
            <List.Item
              title="View Logs"
              description="View previously collected debug logs"
              onPress={() => {
                navigation.navigate("DebugLogs");
              }}
            />
            <List.Item
              title="Download Updates"
              description="Download and run app updates"
              onPress={async () => {
                try {
                  const check = await Updates.checkForUpdateAsync();
                  if (check.isAvailable) {
                    dispatch(pushMessage({ message: "Dowloading update", severity: "info" }) as any);
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } else {
                    dispatch(pushMessage({ message: "Already on most recent version", severity: "info" }) as any);
                  }
                } catch (e) {
                  dispatch(pushMessage({ message: `Error: ${e.message}`, severity: "error" }) as any);
                }
              }}
            />
          </List.Section>
        )}
      </ScrollView>
    </>
  );
};

export default SettingsScreen;
