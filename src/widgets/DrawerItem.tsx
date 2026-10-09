import * as React from "react";
import { DrawerItem as BaseDrawerItem } from "@react-navigation/drawer";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import Clickable from "./Clickable";

type PropsType = Omit<React.ComponentProps<typeof BaseDrawerItem>, "icon" | "to"> & {
  disabled?: boolean;
  icon: string;
  to?: string;
};

export default function DrawerItem(props: PropsType) {
  const { disabled, icon, onPress, to, ...rest } = props;
  const { colors } = useTheme();

  return <Clickable
    renderChild={(props) => (
      <BaseDrawerItem
        {...props}
        inactiveTintColor={(disabled) ? colors.disabled : colors.onSurface}
        icon={({ size }) => (
          <MaterialCommunityIcons
            name={icon as any}
            color={(disabled) ? colors.disabled : colors.inactiveIcon}
            size={size}
          />
        )}
        onPress={(disabled) ? () => null : onPress}
        {...rest}
      />
    )}
  />;
}
