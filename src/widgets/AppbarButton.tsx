// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Tooltip } from "react-native-paper";

import AppbarAction from "./AppbarAction";

interface PropsType {
  icon: string;
  // Shown when hovering, and the label for screen readers
  title: string;
  onPress: () => void;
  disabled?: boolean;
}

// An action in the bar of a screen, with its title as a tooltip
export default function AppbarButton(props: PropsType) {
  const { icon, title, onPress, disabled } = props;

  return (
    <Tooltip title={title}>
      <AppbarAction icon={icon} accessibilityLabel={title} disabled={disabled} onPress={onPress} />
    </Tooltip>
  );
}
