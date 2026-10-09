import * as React from "react";
import { StackHeaderProps } from "@react-navigation/stack";
import { BackHandler, StyleSheet } from "react-native";
import { Appbar as PaperAppbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MenuButton from "./MenuButton";
import { canGoUp, goUp } from "../navigation";
import { fonts, Theme, useTheme } from "../theme";

// The bars at the top of the screens: the color of the screen, with a line under them
export function headerStyle(theme: Theme) {
  return {
    backgroundColor: theme.colors.background,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  };
}

export function headerTitleStyle(theme: Theme) {
  return {
    color: theme.colors.text,
    fontFamily: fonts.semibold,
    fontSize: 18,
  };
}

export default function Appbar(props: StackHeaderProps & { menuFallback: boolean }) {
  const { menuFallback, navigation, options, route } = props;
  // The back button goes one level up, so it doesn't depend on whether there's a previous screen
  const back = canGoUp(route.name);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const title = options.headerTitle ?? options.title ?? route.name;

  // The hardware back button goes one level up too, same as the back button of the header.
  // Screens that set their own headerLeft handle it themselves.
  const handlesBack = back && !options.headerLeft;
  React.useEffect(() => {
    if (!handlesBack) {
      return undefined;
    }

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!navigation.isFocused()) {
        return false;
      }
      goUp(navigation, route);
      return true;
    });
    return () => backHandler.remove();
  }, [handlesBack, navigation, route]);
  let left: React.ReactNode = null;
  if (options.headerLeft) {
    left = options.headerLeft({ canGoBack: back });
  } else if (back) {
    left = <PaperAppbar.BackAction containerColor="transparent" color={theme.colors.text} onPress={() => goUp(navigation, route)} />;
  } else if (menuFallback) {
    left = <MenuButton />;
  }
  const right = options.headerRight?.({ canGoBack: back });

  return (
    <PaperAppbar.Header statusBarHeight={insets.top} style={[headerStyle(theme), (options.headerShadowVisible === false) ? { borderBottomWidth: 0 } : undefined]}>
      {left}
      {(typeof title === "string") ? (
        <PaperAppbar.Content title={title} titleStyle={headerTitleStyle(theme)} />
      ) : title({ children: route.name })}
      {right}
    </PaperAppbar.Header>
  );
}
