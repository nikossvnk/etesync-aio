// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Platform } from "react-native";
import Color from "color";

export const mono = Platform.select({ web: "'IBM Plex Mono', ui-monospace, monospace", default: "monospace" });

// A color, see-through (e.g. the background of an event in its calendar's color)
export function tint(color: string, alpha: number) {
  try {
    return Color(color).alpha(alpha).rgb().string();
  } catch (e) {
    return color;
  }
}
