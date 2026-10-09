import { Platform } from "react-native";
import { configureFonts, MD2DarkTheme as PaperDarkTheme, MD2LightTheme as PaperLightTheme, MD2Theme as PaperTheme, useTheme as usePaperTheme } from "react-native-paper";
import Color from "color";

// IBM Plex Sans, one family per weight (Android doesn't pick the weight of a custom font by itself).
// They're loaded in App.
export const fonts = {
  regular: "IBMPlexSans_400Regular",
  medium: "IBMPlexSans_500Medium",
  semibold: "IBMPlexSans_600SemiBold",
  bold: "IBMPlexSans_700Bold",
};

const paperFonts = (() => {
  const config = {
    regular: { fontFamily: fonts.regular, fontWeight: "normal" as const },
    medium: { fontFamily: fonts.medium, fontWeight: "normal" as const },
    light: { fontFamily: fonts.regular, fontWeight: "normal" as const },
    thin: { fontFamily: fonts.regular, fontWeight: "normal" as const },
  };
  return configureFonts({ isV3: false, config: { web: config, ios: config, android: config, default: config } });
})();

export interface Theme extends PaperTheme {
  colors: PaperTheme["colors"] & {
    accentText: string;
    onAccent: string;
    active: string;
    activeIcon: string;
    activeBackground: string;
    inactiveIcon: string;
    // The text of headings and titles, of the body of notes, and of things that are less important
    textBody: string;
    textSecondary: string;
    textMuted: string;
    // Lines around cards and fields, and between the rows of a list
    border: string;
    divider: string;
    // The sidebar of wide screens, the fields (e.g. search) and the chosen chip
    sidebar: string;
    field: string;
    chipActive: string;
    onChipActive: string;
    // Under the chosen row of a list (a tint of the accent) and its outline
    accentTint: string;
    accentRing: string;
    highlight: string;
    success: string;
  };
}

const light = {
  accent: "#2E55C8",
  background: "#FAFAF7",
  surface: "#FFFFFF",
  text: "#1B1C1E",
};

export const LightTheme: Theme = {
  ...PaperLightTheme,
  fonts: paperFonts,
  roundness: 10,
  colors: {
    ...PaperLightTheme.colors,
    primary: light.accent,
    accent: light.accent,
    background: light.background,
    surface: light.surface,
    text: light.text,
    onSurface: light.text,
    placeholder: "#5C5E64",
    disabled: "#A3A5AA",
    accentText: light.accent,
    onAccent: "#FFFFFF",
    active: light.accent,
    activeIcon: light.accent,
    activeBackground: Color(light.accent).alpha(0.09).rgb().string(),
    inactiveIcon: "#5C5E64",
    textBody: "#2A2B2F",
    textSecondary: "#4A4C52",
    textMuted: "#5C5E64",
    border: "#E2E2DC",
    divider: "#EFEFEA",
    sidebar: "#F1F1EC",
    field: "#EFEFEA",
    chipActive: "#1B1C1E",
    onChipActive: "#FFFFFF",
    accentTint: Color(light.accent).alpha(0.09).rgb().string(),
    accentRing: Color(light.accent).alpha(0.22).rgb().string(),
    highlight: "#FFE58A",
    success: "#2F8F6B",
  },
};

const dark = {
  accent: "#7B98F2",
  background: "#18191C",
  surface: "#1C1D21",
  text: "#ECECEA",
};

export const DarkTheme: Theme = {
  ...PaperDarkTheme,
  fonts: paperFonts,
  roundness: 10,
  colors: {
    ...PaperDarkTheme.colors,
    primary: dark.accent,
    accent: dark.accent,
    background: dark.background,
    surface: dark.surface,
    text: dark.text,
    onSurface: dark.text,
    placeholder: "#9A9CA3",
    disabled: "#6E7076",
    accentText: dark.accent,
    onAccent: "#0F1424",
    active: dark.accent,
    activeIcon: dark.accent,
    activeBackground: Color(dark.accent).alpha(0.16).rgb().string(),
    inactiveIcon: "#9A9CA3",
    textBody: "#D6D7DA",
    textSecondary: "#A9ABB1",
    textMuted: "#9A9CA3",
    border: "#2C2E33",
    divider: "#26282C",
    sidebar: "#141518",
    field: "#26282C",
    chipActive: "#34363C",
    onChipActive: "#ECECEA",
    accentTint: Color(dark.accent).alpha(0.16).rgb().string(),
    accentRing: Color(dark.accent).alpha(0.35).rgb().string(),
    highlight: "rgba(255,210,80,0.30)",
    success: "#2F8F6B",
  },
};

// Shadows are a style of their own on web
export const cardShadow = Platform.select({
  web: { boxShadow: "0 1px 2px rgba(20,20,20,0.06)" },
  default: { elevation: 1 },
});

export function useTheme() {
  return usePaperTheme() as Theme;
}
