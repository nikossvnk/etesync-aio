// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { TextInput as NativeTextInput, View } from "react-native";

import { validateServerUrl } from "../helpers";
import { AuthField, PasswordField, PrimaryButton, ServerBox, UsernameField } from "./Auth";

interface FormErrors {
  username?: string;
  password?: string;
  server?: string;
}

interface PropsType {
  onSubmit: (username: string, password: string, serviceApiUrl: string) => void;
  loading?: boolean;
}

export default function LoginForm(props: PropsType) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [server, setServer] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});

  const passwordRef = React.useRef<NativeTextInput>(null);

  function onSubmit() {
    const serverUrl = server.trim();

    const errors: FormErrors = {};
    const fieldRequired = "This field is required!";
    if (!username) {
      errors.username = fieldRequired;
    } else if (username.includes("@")) {
      errors.username = "Please use your username (not email)";
    }
    if (!password) {
      errors.password = fieldRequired;
    }

    const serverError = (serverUrl) ? validateServerUrl(serverUrl) : fieldRequired;
    if (serverError) {
      errors.server = serverError;
    }

    setErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    props.onSubmit(username, password, serverUrl);
  }

  return (
    <>
      <ServerBox verb="Logging in to" value={server} onChange={setServer} error={errors.server} />
      <View style={{ gap: 16 }}>
        <UsernameField value={username} onChangeText={setUsername} error={errors.username} onSubmitEditing={() => passwordRef.current?.focus()} />
        <AuthField
          label="Password"
          error={errors.password}
        >
          <PasswordField
            ref={passwordRef}
            autoComplete="current-password"
            invalid={!!errors.password}
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={onSubmit}
          />
        </AuthField>
        <View style={{ marginTop: 6 }}>
          <PrimaryButton label="Log in" onPress={onSubmit} loading={props.loading} />
        </View>
      </View>
    </>
  );
}
