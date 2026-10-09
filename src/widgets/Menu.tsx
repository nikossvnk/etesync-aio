// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { Platform } from "react-native";
import { Menu as PaperMenu } from "react-native-paper";

export default class Menu extends React.PureComponent<React.ComponentProps<typeof PaperMenu>> {
  public static Item = PaperMenu.Item;

  public render() {
    const { children, ...props } = this.props;

    // A closed menu is only its anchor: Paper's menu moves the focus to the anchor, also when it's
    // just there closed, which takes it away from e.g. the title of a new note
    if (!props.visible) {
      return props.anchor as React.ReactNode;
    }

    return (
      <PaperMenu
        statusBarHeight={(Platform.OS === "ios") ? undefined : 0}
        {...props}
      >
        {children}
      </PaperMenu>
    );
  }
}
