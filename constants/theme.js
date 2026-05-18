export const colors = {
  // Core background
  bg: "#111827",
  bg2: "#162033",
  card: "#1F2D44",
  card2: "#243653",
  card3: "#2A3D5C",

  // Borders
  border: "#355070",
  border2: "#466488",

  // Text
  text: "#F8FAFC",
  text2: "#CBD5E1",
  muted: "#8EA0B8",
  muted2: "#64748B",

  // Brand colors
  violet: "#7C5CFF",
  violetDark: "#6247E8",
  violetSoft: "rgba(124, 92, 255, 0.16)",

  green: "#2DD4BF",
  greenSoft: "rgba(45, 212, 191, 0.16)",

  red: "#FB7185",
  redSoft: "rgba(251, 113, 133, 0.16)",

  orange: "#FFB86B",
  orangeSoft: "rgba(255, 184, 107, 0.16)",

  gold: "#F2D6A2",
  goldSoft: "rgba(242, 214, 162, 0.14)",

  blue: "#60A5FA",
  blueSoft: "rgba(96, 165, 250, 0.16)",

  purple: "#A78BFA",
  lavender: "#C4B5FD",

  // Legacy aliases so older files do not break
  soft: "#7C5CFF",
  primary: "#7C5CFF",
  danger: "#FB7185",
  softSurface: "#243653",
  softSurface2: "#182338",
};

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 34,
  pill: 999,
};

export const shadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.28,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 12 },
  elevation: 5,
};

export const softShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 7 },
  elevation: 3,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const typography = {
  h1: {
    fontSize: 34,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.8,
  },
  h2: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4,
  },
  h3: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  body: {
    fontSize: 15,
    color: colors.text2,
    lineHeight: 21,
  },
  small: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
  },
};