import * as React from "react";
import { GestureResponderEvent } from "react-native";
import { LinkTargetProps, useLinkTarget } from "./linkTarget";
import Clickable from "./Clickable";

type ChildProps = {
  onPress?: () => void;
};

type PropsType = LinkTargetProps & {
  renderChild: (props: ChildProps) => React.ReactElement;
};

export default function Link(props: PropsType) {
  const { to, external, onPress: onPressProp, renderChild } = props;
  const linkProps = useLinkTarget(props);

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