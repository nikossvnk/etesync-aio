import * as React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { TouchableRipple } from "react-native-paper";

import { useTheme } from "../theme";

type PropsType = React.ComponentProps<typeof TouchableRipple> & {
  // The first and last rows round the corners of the group
  first: boolean;
  last: boolean;
  style?: ViewStyle | ViewStyle[];
};

// A row of a list whose rows are in a box together, with lines between them
export default function GroupedRow(props: PropsType) {
  const theme = useTheme();
  const { first, last, style, ...rest } = props;

  return (
    <TouchableRipple
      {...rest}
      style={[styles.row, {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderBottomColor: (last) ? theme.colors.border : theme.colors.divider,
      }, first && styles.first, last && styles.last, style]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  last: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
});
