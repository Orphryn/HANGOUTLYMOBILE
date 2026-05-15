export const colors = {
  bg: "#111827",
  bg2: "#172033",
  card: "#1f2d44",
  border: "#355070",
  text: "#fffaf0",
  muted: "#b9c7dc",
  soft: "#f2d6a2",
  violet: "#7c5cff",
  violet2: "#9b7cff",
  green: "#2dd4bf",
  red: "#fb7185",
  orange: "#ffb86b",
};

export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
};

export const shadow = {
  shadowColor: "#000",
  shadowOpacity: 0.22,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
};

// Keeps the default Expo template files from crashing if they still import Colors/Fonts.
export const Colors = {
  light: {
    text: "#111827",
    background: "#ffffff",
    tint: colors.violet,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: colors.violet,
  },
  dark: {
    text: colors.text,
    background: colors.bg,
    tint: colors.violet2,
    icon: colors.muted,
    tabIconDefault: colors.muted,
    tabIconSelected: colors.violet2,
  },
};

export const Fonts = {
  rounded: undefined,
  mono: "monospace",
};