// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// What the screens of logging in and signing up share: on wide screens a bar with the app's name,
// help links and the settings above a card with the form; on phones a bar with the menu button
// above the form. And the parts of their forms.

import * as React from "react";
import { Linking, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DrawerActions, useNavigation } from "@react-navigation/native";

import { useDeviceBreakpoint } from "../helpers";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import { tint } from "../pim/style";

const mono = Platform.select({ web: "'IBM Plex Mono', ui-monospace, monospace", default: "monospace" });

export const helpLinks = [
  ...((C.genericMode) ? [] : [
    { title: "Website", link: C.homePage, icon: "web" },
    { title: "FAQ", link: C.faq, icon: "help-circle-outline" },
  ]),
  { title: "Report an issue", link: C.reportIssue, icon: "bug-outline" },
];

// The app's mark: a lock, as everything in it is encrypted
export function Logo(props: { size?: number }) {
  const theme = useTheme();
  const size = props.size ?? 32;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: tint(theme.colors.accent, 0.16), alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name="lock-outline" size={size * 0.56} color={theme.colors.accent} />
    </View>
  );
}

function EncryptedNote() {
  const theme = useTheme();
  return (
    <View style={styles.encrypted}>
      <MaterialCommunityIcons name="lock-outline" size={14} color={theme.colors.textMuted} />
      <Text style={{ fontSize: 12, color: theme.colors.textMuted, textAlign: "center", flexShrink: 1 }}>
        End-to-end encrypted — only you can read your notes, calendar, tasks and contacts.
      </Text>
    </View>
  );
}

export function AuthLayout(props: React.PropsWithChildren<unknown>) {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const wide = useDeviceBreakpoint("tabletPortrait");

  if (!wide) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={styles.phoneBar}>
          <TouchableRipple
            borderless
            accessibilityRole="button"
            accessibilityLabel="Main menu"
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            style={styles.menuButton}
          >
            <MaterialCommunityIcons name="menu" size={22} color={theme.colors.text} />
          </TouchableRipple>
          <Logo size={28} />
          <Text style={[styles.appName, { color: theme.colors.text }]}>{C.appName}</Text>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.phoneContent}>
          <View style={{ gap: 20 }}>{props.children}</View>
          <View style={{ marginTop: "auto", paddingTop: 24 }}><EncryptedNote /></View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.sidebar }}>
      <View style={styles.topBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <Logo />
          <Text style={[styles.appName, { color: theme.colors.text }]}>{C.appName}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }} accessibilityRole={"navigation" as any} aria-label="Help">
          {helpLinks.map((x) => (
            <TouchableRipple
              key={x.title}
              accessibilityRole="link"
              accessibilityLabel={x.title}
              onPress={() => Linking.openURL(x.link)}
              style={styles.helpLink}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{x.title}</Text>
                <MaterialCommunityIcons name="arrow-top-right" size={13} color={theme.colors.textSecondary} />
              </View>
            </TouchableRipple>
          ))}
        </View>
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => navigation.navigate("Settings")}
          style={[styles.squareButton, { borderColor: theme.colors.border }]}
        >
          <MaterialCommunityIcons name="tune-variant" size={17} color={theme.colors.textSecondary} />
        </TouchableRipple>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wideContent}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {props.children}
        </View>
        <View style={{ marginTop: 28 }}><EncryptedNote /></View>
      </ScrollView>
    </View>
  );
}

// The title of the form, and the link to the other one (log in or sign up)
export function AuthHeading(props: { title: string, question?: string, linkLabel?: string, onLink?: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header">{props.title}</Text>
      {props.question && (
        <Text style={{ color: theme.colors.textMuted }}>
          {props.question}{" "}
          <Text accessibilityRole="link" onPress={props.onLink} style={{ color: theme.colors.accentText, fontFamily: fonts.medium }}>{props.linkLabel}</Text>
        </Text>
      )}
    </View>
  );
}

// Which server the account is on: the default one, unless another one is set
export function ServerBox(props: { verb: string, value: string, onChange: (value: string) => void, error?: string, inputRef?: React.Ref<TextInput> }) {
  const theme = useTheme();
  const [open, setOpen] = React.useState(!!props.value || !!props.error);
  const custom = props.value.trim();
  React.useEffect(() => {
    if (props.error) {
      setOpen(true);
    }
  }, [props.error]);
  return (
    <View style={[styles.serverBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <MaterialCommunityIcons name="server" size={18} color={theme.colors.textMuted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{props.verb}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: mono, fontSize: 13, color: theme.colors.text }}>
              {(custom) ? custom.replace(/^https?:\/\//, "") : new URL(C.serviceApiBase).host}
            </Text>
            {!custom && (
              <Text style={[styles.default, { color: theme.colors.textMuted, backgroundColor: theme.colors.field }]}>Default</Text>
            )}
          </View>
        </View>
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel={(open) ? "Done with the server" : "Change the server"}
          aria-expanded={open}
          onPress={() => setOpen(!open)}
          style={[styles.smallButton, { borderColor: theme.colors.border }]}
        >
          <Text style={{ fontSize: 13, color: theme.colors.text }}>{(open) ? "Done" : "Change"}</Text>
        </TouchableRipple>
      </View>
      {open && (
        <AuthField
          label="Server URL"
          error={props.error}
          help="For a self-hosted or company server. Leave empty to use the default."
        >
          <AuthInput
            ref={props.inputRef}
            value={props.value}
            onChangeText={props.onChange}
            placeholder="https://etebase.example.com"
            keyboardType="url"
            textContentType="URL"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Server URL"
            style={{ fontFamily: mono, fontSize: 13 }}
          />
        </AuthField>
      )}
    </View>
  );
}

export function AuthField(props: React.PropsWithChildren<{ label: string, error?: string, help?: string, right?: React.ReactNode }>) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{props.label}</Text>
        {props.right}
      </View>
      {props.children}
      {!!props.error && <Text style={{ fontSize: 12, color: theme.colors.error }} accessibilityLiveRegion="polite">{props.error}</Text>}
      {!props.error && !!props.help && <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{props.help}</Text>}
    </View>
  );
}

export const AuthInput = React.forwardRef(function AuthInput(props: React.ComponentProps<typeof TextInput> & { invalid?: boolean }, ref: React.Ref<TextInput>) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);
  const { style, invalid, ...rest } = props;
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.colors.textMuted}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, {
        color: theme.colors.text,
        backgroundColor: theme.colors.background,
        borderColor: (invalid) ? theme.colors.error : (focused) ? theme.colors.accent : theme.colors.border,
      }, style]}
      {...rest}
    />
  );
});

// A password, which can be shown while it's typed
// The username field of logging in and signing up, which is where they start
export function UsernameField(props: { value: string, onChangeText: (value: string) => void, error?: string, onSubmitEditing: () => void }) {
  return (
    <AuthField label="Username" error={props.error}>
      <AuthInput
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        autoFocus
        returnKeyType="next"
        onSubmitEditing={props.onSubmitEditing}
        invalid={!!props.error}
        onChangeText={props.onChangeText}
        accessibilityLabel="Username"
        value={props.value}
      />
    </AuthField>
  );
}

export const PasswordField = React.forwardRef(function PasswordField(props: React.ComponentProps<typeof TextInput> & { invalid?: boolean }, ref: React.Ref<TextInput>) {
  const theme = useTheme();
  const [shown, setShown] = React.useState(false);
  return (
    <View>
      <AuthInput ref={ref} secureTextEntry={!shown} autoCapitalize="none" autoCorrect={false} {...props} style={{ paddingRight: 50 }} />
      <TouchableRipple
        borderless
        accessibilityRole="button"
        accessibilityLabel={(shown) ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onPress={() => setShown(!shown)}
        style={styles.eye}
      >
        <MaterialCommunityIcons name={(shown) ? "eye-off-outline" : "eye-outline"} size={19} color={theme.colors.textMuted} />
      </TouchableRipple>
    </View>
  );
});

export function PrimaryButton(props: { label: string, onPress: () => void, disabled?: boolean, loading?: boolean }) {
  const theme = useTheme();
  const disabled = props.disabled || props.loading;
  return (
    <TouchableRipple
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!disabled }}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={props.onPress}
      style={[styles.primary, { backgroundColor: (props.disabled) ? theme.colors.field : theme.colors.accent }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {props.loading && <ActivityIndicator size={16} color={theme.colors.onAccent} />}
        <Text style={{ fontSize: 15, fontFamily: fonts.semibold, color: (props.disabled) ? theme.colors.textMuted : theme.colors.onAccent }}>{props.label}</Text>
      </View>
    </TouchableRipple>
  );
}

export function ErrorBox(props: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: tint(theme.colors.error, 0.1), borderColor: tint(theme.colors.error, 0.35) }]} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.colors.error} />
      <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }}>{props.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  appName: {
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  helpLink: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: "center",
  },
  squareButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  wideContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 28,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 34,
    paddingTop: 34,
    paddingBottom: 30,
    gap: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  phoneBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  encrypted: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 28,
    letterSpacing: -0.4,
  },
  serverBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  default: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  smallButton: {
    height: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  input: {
    height: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 15,
    fontFamily: fonts.regular,
    outlineStyle: "none",
  } as any,
  eye: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
