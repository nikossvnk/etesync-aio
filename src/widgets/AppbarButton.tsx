// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Tooltip } from "react-native-paper";

import AppbarAction from "./AppbarAction";
import { useTheme } from "../theme";

interface PropsType {
  icon: string;
  // Shown when hovering, and the label for screen readers
  title: string;
  onPress: () => void;
  disabled?: boolean;
  // A button that is on (e.g. the pin of a pinned note): in the accent colour, and pressed for screen readers
  pressed?: boolean;
}

// An action in the bar of a screen, with its title as a tooltip
export default function AppbarButton(props: PropsType) {
  const { icon, title, onPress, disabled, pressed } = props;
  const theme = useTheme();

  return (
    <Tooltip title={title}>
      <AppbarAction
        icon={icon}
        accessibilityLabel={title}
        disabled={disabled}
        onPress={onPress}
        {...((pressed !== undefined) ? { "aria-pressed": pressed } as any : {})}
        color={(pressed) ? theme.colors.accent : undefined}
        style={(pressed) ? { backgroundColor: theme.colors.accentTint, borderRadius: 8 } : undefined}
      />
    </Tooltip>
  );
}
