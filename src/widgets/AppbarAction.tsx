import * as React from "react";
import { Appbar } from "react-native-paper";
import { useTheme } from "../theme";


export default function AppbarAction(props: React.ComponentProps<typeof Appbar.Action>) {
  const { color, ...rest } = props;
  const theme = useTheme();
  const iconColor = color ?? theme.colors.text;

  return (
    <Appbar.Action color={iconColor} containerColor="transparent" {...rest} />
  );
}
