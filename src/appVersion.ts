// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The release's version (its tag, without the "v"). desktop/build-release.sh writes it to
// version.txt next to the app, rather than into the app's code, which Metro's cache could keep from
// one build to the next. Other builds (development, the tests) don't have it.

import * as React from "react";
import { Platform } from "react-native";

export const developmentBuild = "(development build)";

// (once it's known, e.g. for a crash report)
export let appVersion: string | undefined;

let loading: Promise<string> | undefined;

export function loadAppVersion(): Promise<string> {
  loading ??= (async () => {
    try {
      const response = (Platform.OS === "web") ? await fetch("/version.txt", { cache: "no-store" }) : undefined;
      const text = (response?.ok) ? (await response.text()).trim() : "";
      // (a server without it may answer with the app's page instead)
      appVersion = (/^[\w.+-]{1,40}$/.test(text)) ? text : developmentBuild;
    } catch (e) {
      appVersion = developmentBuild;
    }
    return appVersion;
  })();
  return loading;
}

export function useAppVersion() {
  const [version, setVersion] = React.useState(appVersion);
  React.useEffect(() => {
    let mounted = true;
    loadAppVersion().then((x) => mounted && setVersion(x));
    return () => {
      mounted = false;
    };
  }, []);
  return version ?? "";
}
