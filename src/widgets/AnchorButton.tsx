import * as React from "react";
import { Button } from "react-native-paper";
import { fonts, useTheme } from "../theme";

type TypeProps = {
  open: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

export default function AnchorButton(props: TypeProps) {
  const { children, onPress, open } = props; 
  const theme = useTheme();

  return (
    <Button
      mode="outlined"
      uppercase={false}
      style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: 10 }}
      labelStyle={{ color: theme.colors.text, fontFamily: fonts.medium, fontSize: 14 }}
      onPress={onPress}
      icon={(open) ? "menu-up" : "menu-down"}
      contentStyle={{ flexDirection: "row-reverse" }}
    >
      {children}
    </Button>
  );
}