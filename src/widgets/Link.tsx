import * as React from "react";
import { GestureResponderEvent, Linking } from "react-native";
import { LinkTargetProps, useLinkTarget } from "./linkTarget";

type ChildProps = {
  href?: string;
  accessibilityRole?: "link";
  onPress?: (e?: React.MouseEvent<HTMLAnchorElement, MouseEvent> | GestureResponderEvent) => void;
};

type PropsType = LinkTargetProps & {
  to: string;
  renderChild: (props: ChildProps) => React.ReactElement;
};

export default function Link(props: PropsType) {
  const { to, external, onPress: onPressProp, renderChild } = props;
  const linkProps = useLinkTarget(props);

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