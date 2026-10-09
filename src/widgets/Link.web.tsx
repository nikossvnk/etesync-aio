import * as React from "react";
import { GestureResponderEvent } from "react-native";
import { NavigationAction, useLinkBuilder, useLinkProps } from "@react-navigation/native";
import Clickable from "./Clickable";

type ChildProps = {
  onPress?: () => void;
};

type PropsType = {
  to?: string;
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
      e?.preventDefault();
      return;
    }

    if (!external) {
      linkProps.onPress(e);
    }
  };

  return (
    <Clickable
      applyToChild
      renderChild={(props) => (
        <a
          {...props}
          // Before what's in it (e.g. something that can be long pressed, which keeps clicks to itself)
          onClickCapture={onPress}
          href={(external) ? to : linkProps.href}
          target={(external) ? "_blank" : undefined}
          // The page that is opened gets neither the app's address nor a way back to it
          rel={(external) ? "noreferrer" : undefined}
          style={{ textDecoration: "none" }}
        >
          {renderChild({})}
        </a>
      )}
    />
  );
}