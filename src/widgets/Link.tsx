import * as React from "react";
import { GestureResponderEvent, Linking } from "react-native";
import { NavigationAction, useLinkBuilder, useLinkProps } from "@react-navigation/native";

type ChildProps = {
  href?: string;
  accessibilityRole?: "link";
  onPress?: (e?: React.MouseEvent<HTMLAnchorElement, MouseEvent> | GestureResponderEvent) => void;
};

type PropsType = {
  to: string;
  action?: NavigationAction;
  external?: boolean;
  // Called with the press first: returning true means it was handled there, and the link isn't followed
  onPress?: (e?: any) => boolean | void;
  renderChild: (props: ChildProps) => React.ReactElement;
};

export default function Link(props: PropsType) {
  const { to, action, external, onPress: onPressProp, renderChild } = props;
  const { buildAction } = useLinkBuilder();
  const internal = !!to && !external;
  const linkProps = useLinkProps({
    href: (internal) ? to : undefined,
    action: action ?? ((internal) ? buildAction(to!) : { type: "NOOP" }),
  });

  const onPress = (
    e?: React.MouseEvent<HTMLAnchorElement, MouseEvent> | GestureResponderEvent
  ) => {
    if (onPressProp?.(e)) {
      return;
    }

    if (external) {
      Linking.openURL(to);
    } else {
      linkProps.onPress(e);
    }
  };

  return renderChild({ ...linkProps, onPress });
}