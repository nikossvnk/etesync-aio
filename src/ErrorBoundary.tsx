// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { useSelector, useDispatch } from "react-redux";
import { View, Linking, Clipboard } from "react-native";
import { Button, Text, Paragraph, HelperText } from "react-native-paper";
import { List } from "immutable";

import * as Updates from "expo-updates";

import * as Etebase from "etebase";

import { StoreState, persistor, store } from "./store";

import { Title } from "./widgets/Typography";
import ScrollView from "./widgets/ScrollView";
import { logger, LogLevel, getLogs } from "./logging";
import Container from "./widgets/Container";
import { expo } from "../app.json";
import * as C from "./constants";
import { setSettings, addError, popError, login } from "./store/actions";
import LogoutDialog from "./components/LogoutDialog";
import ConfirmationDialog from "./widgets/ConfirmationDialog";
import PasswordInput from "./widgets/PasswordInput";
import LinkButton from "./widgets/LinkButton";
import { useCredentials } from "./credentials";

// Opens a new issue about the crash, with what went wrong filled in (it's only sent once it's
// submitted there). Without the logs, as issues are public: they can be added by hand.
function reportCrash(error: Error) {
  const title = encodeURIComponent(`Crash: ${error.message}`.slice(0, 200));
  const body = encodeURIComponent([
    `Version: ${expo.version}`,
    "",
    "What happened before the crash:",
    "",
    "",
    "Error:",
    "```",
    `${error.message}\n${error.stack?.toString() ?? ""}`.slice(0, 4000),
    "```",
  ].join("\n"));
  Linking.openURL(`${C.reportIssue}/new?title=${title}&body=${body}`);
}

function SessionExpiredDialog() {
  const etebase = useCredentials()!;
  const dispatch = useDispatch();
  const [fetchFailed, setFetchFailed] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [errorPassword, setErrorPassword] = React.useState<string>();

  React.useEffect(() => {
    const fetch = async () => {
      try {
        await etebase.fetchToken();

        dispatch(login(etebase) as any);
        dispatch(popError() as any);
      } catch (e) {
        if (e instanceof Etebase.UnauthorizedError) {
          setFetchFailed(true);
        } else {
          dispatch(addError(e) as any);
        }
      }
    };

    fetch();
  }, []);

  return fetchFailed ? (
    <ConfirmationDialog
      title="Session expired"
      visible
      onOk={async () => {
        if (!password) {
          setErrorPassword("Password is required");
          return;
        }

        try {
          const { user, serverUrl } = etebase;
          const newEtebase = await Etebase.Account.login(user.username, password, serverUrl);

          dispatch(login(newEtebase) as any);
          dispatch(popError() as any);
        } catch (e) {
          setErrorPassword(e.message);
        }
      }}
      onCancel={() => {
        dispatch(popError() as any);
      }}
    >
      <>
        <Paragraph>
          Your login session has expired, please entry your login password:
        </Paragraph>
        <PasswordInput
          error={!!errorPassword}
          label="Password"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
        />
        <HelperText
          type="error"
          visible={!!errorPassword}
        >
          {errorPassword}
        </HelperText>
        {!C.genericMode && (
          <>
            <LinkButton to={C.forgotPassword} external>
              <Text>Forget password?</Text>
            </LinkButton>
          </>
        )}
      </>
    </ConfirmationDialog>
  ) : null;
}

function ErrorBoundaryInner(props: React.PropsWithChildren<{ error: Error | undefined }>) {
  const etesync = useCredentials();
  const [showLogout, setShowLogout] = React.useState(false);
  const stateErrors: List<Error> = useSelector((state: StoreState) => state.errors);
  const [logs, setLogs] = React.useState<string>();

  const errors = props.error ? stateErrors.concat(props.error) : stateErrors;
  const fatalErrors = errors.filterNot((error) => error instanceof Etebase.PermissionDeniedError || error instanceof Etebase.HttpError || error instanceof Etebase.UnauthorizedError);

  React.useEffect(() => {
    getLogs().then((value) => setLogs(value.join("\n")));
  }, []);

  const buttonStyle = { marginVertical: 5 };
  if (fatalErrors.count() > 0) {
    const error = fatalErrors.last() as Error;
    logger.critical(error.toString());
    const content = `${error.message}\n${error.stack}\n${logs}`;
    return (
      <ScrollView>
        <Container>
          <Title>Something went wrong!</Title>
          <View style={{ marginVertical: 15, flexDirection: "row", justifyContent: "space-evenly", flexWrap: "wrap" }}>
            <Button mode="contained" style={buttonStyle} onPress={() => reportCrash(error)}>Report Bug</Button>
            <Button mode="contained" style={buttonStyle} onPress={() => Clipboard.setString(content)}>Copy Text</Button>
            <Button mode="contained" style={buttonStyle} onPress={() => Updates.reloadAsync()}>Reload App</Button>
            <Button mode="contained" style={buttonStyle} onPress={async () => {
              store.dispatch(setSettings({ logLevel: LogLevel.Debug }));
              persistor.persist();
              Updates.reloadAsync();
            }}>Enable Logging &amp; Reload</Button>
            <Button disabled={!etesync} mode="contained" style={buttonStyle} onPress={() => setShowLogout(true)}>Logout &amp; Reload</Button>
          </View>
          <Text selectable>{content}</Text>
        </Container>
        <LogoutDialog visible={showLogout} onDismiss={(loggedOut) => {
          if (loggedOut) {
            Updates.reloadAsync();
          }
          setShowLogout(false);
        }}
        />
      </ScrollView>
    );
  }

  let nonFatalErrorDialog;
  if (errors.count() > 0) {
    const error = errors.last() as Error;
    if (error instanceof Etebase.UnauthorizedError) {
      nonFatalErrorDialog = (
        <SessionExpiredDialog />
      );
    } else {
      nonFatalErrorDialog = (
        <ConfirmationDialog
          title={`Error (${errors.count()} remaining)`}
          visible={!!error}
          onOk={() => {
            store.dispatch(popError());
          }}
        >
          <Paragraph>
            {error.toString()}
          </Paragraph>
        </ConfirmationDialog>
      );
    }
  }

  return <>
    {props.children}

    {nonFatalErrorDialog}
  </>;
}

interface PropsType {
  children: React.ReactNode | React.ReactNode[];
}

class ErrorBoundary extends React.Component<PropsType> {
  public state: {
    error?: Error;
  };

  constructor(props: PropsType) {
    super(props);
    this.state = { };
  }

  public componentDidCatch(error: Error) {
    this.setState({ error });
  }

  public render() {
    return (
      <ErrorBoundaryInner error={this.state.error}>
        {this.props.children}
      </ErrorBoundaryInner>
    );
  }
}

export default ErrorBoundary;
