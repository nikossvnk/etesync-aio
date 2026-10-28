// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import * as Etebase from "etebase";


import LoginForm from "../components/LoginForm";
import { AuthHeading, AuthLayout, ErrorBox } from "../components/Auth";

import { useAsyncDispatch } from "../store";

import { login } from "../store/actions";
import { useLoading } from "../helpers";

import * as C from "../constants";
import { useCredentials } from "../credentials";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../RootStackParamList";

type NavigationProp = StackNavigationProp<RootStackParamList, "Login">;

const LoginScreen = React.memo(function _LoginScreen() {
  const etebase = useCredentials();
  const dispatch = useAsyncDispatch();
  const navigation = useNavigation<NavigationProp>();
  const [loading, error, setPromise] = useLoading();

  function onFormSubmit(username: string, password: string, serviceApiUrl: string) {
    setPromise((async () => {
      const etebase = await Etebase.Account.login(username, password, serviceApiUrl);
      dispatch(login(etebase));
      navigation.navigate("AccountWizard");
    })());
  }

  if (etebase) {
    return <React.Fragment />;
  }

  return (
    <AuthLayout>
      <AuthHeading
        title="Log in"
        question={(C.genericMode) ? undefined : "New here?"}
        linkLabel="Create an account"
        onLink={() => navigation.navigate("Signup")}
      />
      {(error) && <ErrorBox message={error.message} />}
      <LoginForm onSubmit={onFormSubmit} loading={loading} />
    </AuthLayout>
  );
});

export default LoginScreen;
