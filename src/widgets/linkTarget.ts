// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { NavigationAction, useLinkBuilder, useLinkProps } from "@react-navigation/native";

// What the links of Link.tsx and Link.web.tsx have
export type LinkTargetProps = {
  to?: string;
  action?: NavigationAction;
  external?: boolean;
  // Called with the press first: returning true means it was handled there, and the link isn't followed
  onPress?: (e?: any) => boolean | void;
};

// Where a link goes in the app: its address, and what pressing it does (nothing for a link outside
// of the app, which is opened by the link itself)
export function useLinkTarget(props: LinkTargetProps) {
  const { to, action, external } = props;
  const { buildAction } = useLinkBuilder();
  const internal = !!to && !external;
  return useLinkProps({
    href: (internal) ? to : undefined,
    action: action ?? ((internal) ? buildAction(to!) : { type: "NOOP" }),
  });
}
