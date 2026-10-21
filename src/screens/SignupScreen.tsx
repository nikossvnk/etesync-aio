// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import * as Etebase from "etebase";

import { Linking, Platform, View, TextInput as NativeTextInput } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { AuthField, AuthHeading, AuthInput, AuthLayout, ErrorBox, PasswordField, PrimaryButton, ServerBox } from "../components/Auth";
import { fonts, useTheme } from "../theme";
import { tint } from "../pim/style";

import { useAsyncDispatch } from "../store";

import { login } from "../store/actions";
import { enforcePasswordRules, PASSWORD_MIN_LENGTH, validateServerUrl } from "../helpers";

import * as C from "../constants";
import { useCredentials } from "../credentials";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../RootStackParamList";

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
  server?: string;

  general?: string;
}

type NavigationProp = StackNavigationProp<RootStackParamList, "Signup">;

// How strong a password looks, by its length (the rules only ask for 8 characters)
function strength(password: string) {
  const len = password.length;
  const level = (len === 0) ? 0 : (len < 8) ? 1 : (len < 12) ? 2 : 3;
  return { level, label: ["", "Too short", "Okay", "Strong"][level], color: ["", "#F09A5C", "#E0B43C", "#5CC59B"][level] };
}

export default React.memo(function SignupScreen() {
  const etebase = useCredentials();
  const dispatch = useAsyncDispatch();
  const navigation = useNavigation<NavigationProp>();
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [server, setServer] = React.useState("");
  // That the password can't be recovered was understood (signing up needs it)
  const [understood, setUnderstood] = React.useState(false);
  const theme = useTheme();
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});

  const emailRef = React.useRef<NativeTextInput>(null);
  const passwordRef = React.useRef<NativeTextInput>(null);

  async function onSubmit() {
    // The default server is used when it's left empty
    const serverUrl = server.trim() || undefined;

    const errors: FormErrors = {};
    const fieldRequired = "This field is required!";
    if (!email) {
      errors.email = fieldRequired;
    } else if (!email.includes("@")) {
      errors.email = "Valid email address required.";
    }
    if (!username) {
      errors.username = fieldRequired;
    }
    if (!password) {
      errors.password = fieldRequired;
    } else {
      const passwordRulesError = enforcePasswordRules(password);
      if (passwordRulesError) {
        errors.password = passwordRulesError;
      }
    }

    const serverError = (serverUrl) ? validateServerUrl(serverUrl) : undefined;
    if (serverError) {
      errors.server = serverError;
    }

    setErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      const user: Etebase.User = {
        username,
        email,
      };
      const etebase = await Etebase.Account.signup(user, password, serverUrl ?? C.serviceApiBase);
      dispatch(login(etebase));
      navigation.navigate("AccountWizard");
    } catch (e) {
      if ((e instanceof Etebase.HttpError) && (e.content)) {
        let found = false;
        if (e.content.errors) {
          for (const field of e.content.errors) {
            if (field.field === "user.username") {
              errors.username = field.detail;
              found = true;
            } else if (field.field === "user.email") {
              errors.email = field.detail;
              found = true;
            } else if (!field.field) {
              errors.general = field.detail;
              found = true;
            }
          }
        }

        if (!found) {
          errors.general = e.content.detail ?? e.toString();
        }
      } else {
        errors.general = e.toString();
      }
      setErrors(errors);
    } finally {
      setLoading(false);
    }
  }

  if (etebase) {
    return <React.Fragment />;
  }

  const pw = strength(password);

  return (
    <AuthLayout>
      <AuthHeading
        title="Create an account"
        question="Already have one?"
        linkLabel="Log in"
        onLink={() => navigation.navigate("Login")}
      />
      {(!C.genericMode) && (
        <TouchableRipple
          accessibilityRole="link"
          accessibilityLabel="You're starting a free trial on this server. See pricing"
          onPress={() => Linking.openURL(C.pricing)}
          style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.accentTint }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.accent} />
            <Text style={{ flex: 1, fontSize: 13, color: theme.colors.textBody }}>
              You’re starting a free trial on this server. <Text style={{ color: theme.colors.accentText, fontFamily: fonts.medium }}>See pricing ↗</Text>
            </Text>
          </View>
        </TouchableRipple>
      )}
      {(errors.general) && <ErrorBox message={errors.general} />}
      <ServerBox verb="Creating your account on" value={server} onChange={setServer} error={errors.server} />
      <View style={{ gap: 16 }}>
        <AuthField label="Username" error={errors.username}>
          <AuthInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            invalid={!!errors.username}
            onChangeText={setUsername}
            accessibilityLabel="Username"
            value={username}
          />
        </AuthField>
        <AuthField label="Email address" error={errors.email}>
          <AuthInput
            ref={emailRef}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            invalid={!!errors.email}
            onChangeText={setEmail}
            accessibilityLabel="Email"
            value={email}
          />
        </AuthField>
        <View style={{ gap: 8 }}>
          <AuthField label="Password" error={errors.password}>
            <PasswordField
              ref={passwordRef}
              autoComplete={(Platform.OS === "web") ? "new-password" as any : "password-new"}
              invalid={!!errors.password}
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
            />
          </AuthField>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityLabel={(pw.label) ? `Password strength: ${pw.label}` : undefined}>
            <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
              {[1, 2, 3].map((x) => (
                <View key={x} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: (pw.level >= x) ? pw.color : theme.colors.field }} />
              ))}
            </View>
            <Text style={{ minWidth: 64, textAlign: "right", fontSize: 12, fontFamily: fonts.medium, color: pw.color || theme.colors.textMuted }}>{pw.label}</Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
            At least {PASSWORD_MIN_LENGTH} characters. A few random words make a password that’s strong and easy to remember.
          </Text>
        </View>
        <TouchableRipple
          accessibilityRole="checkbox"
          accessibilityLabel="I understand my password can't be recovered"
          accessibilityState={{ checked: understood }}
          aria-checked={understood}
          onPress={() => setUnderstood(!understood)}
          style={{ borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
            backgroundColor: tint("#F09A5C", 0.1), borderColor: tint("#F09A5C", 0.4) }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <MaterialCommunityIcons name={(understood) ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color="#E0864A" />
            <Text style={{ flex: 1, fontSize: 13, color: theme.colors.textBody }}>
              <Text style={{ fontFamily: fonts.semibold }}>I understand my password can’t be recovered.</Text> It encrypts my data, so if I lose it, nobody can reset it or restore my data.
            </Text>
          </View>
        </TouchableRipple>
        <PrimaryButton label="Create account" onPress={onSubmit} disabled={!understood} loading={loading} />
      </View>
    </AuthLayout>
  );
});
