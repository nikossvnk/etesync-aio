// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// On the web, the scroll bars are thin and in the colors of the theme (instead of the browser's
// wide grey ones): no track, a rounded thumb that is quiet until the pointer is over it.

import * as React from "react";
import { Platform } from "react-native";
import Color from "color";

import { Theme } from "./theme";

export function useWebScrollbars(theme: Theme) {
  React.useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const thumb = Color(theme.colors.text).alpha((theme.dark) ? 0.16 : 0.18).rgb().string();
    const hover = Color(theme.colors.text).alpha((theme.dark) ? 0.32 : 0.34).rgb().string();
    let style = document.getElementById("app-scrollbars") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "app-scrollbars";
      document.head.appendChild(style);
    }
    style.textContent = `
      * { scrollbar-width: thin; scrollbar-color: ${thumb} transparent; }
      *:hover { scrollbar-color: ${hover} transparent; }
      ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
      ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
      ::-webkit-scrollbar-thumb:hover { background: ${hover}; background-clip: content-box; }
    `;
  }, [theme.dark]);
}
