import { Image, StyleSheet, Text, View } from "react-native";
import { colors, shadow } from "../constants/theme";

export default function GroupAvatar({
  name,
  color = colors.violet,
  emoji = "✨",
  avatarUrl,
  size = 52,
  stacked = false,
}) {
  const safeName = name || "Group";
  const initials = safeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const fallbackText = emoji || initials || "G";

  return (
    <View
      style={[
        styles.shell,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
        },
        stacked && styles.stacked,
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{
            width: size,
            height: size,
            borderRadius: size * 0.28,
          }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size * 0.28,
              backgroundColor: color || colors.violet,
            },
          ]}
        >
          <View style={styles.innerGlow} />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.emoji, { fontSize: size * 0.34 }]}
          >
            {fallbackText}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.card2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  innerGlow: {
    position: "absolute",
    width: "120%",
    height: "120%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    top: "-58%",
    right: "-48%",
  },
  emoji: {
    fontWeight: "900",
    color: colors.text,
  },
  stacked: {
    marginLeft: -10,
  },
});