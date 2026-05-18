import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

export default function ProfileAvatar({
  profile,
  size = 44,
  showOnline = false,
  online = false,
  ring = false,
}) {
  const name =
    profile?.display_name || profile?.username || profile?.email || "User";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const fallbackText = initials || name?.[0]?.toUpperCase() || "?";

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        ring && styles.ring,
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {profile?.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
            }}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.fallbackText, { fontSize: size * 0.34 }]}
            >
              {fallbackText}
            </Text>
          </View>
        )}
      </View>

      {showOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              backgroundColor: online ? colors.green : colors.muted2,
              width: Math.max(12, size * 0.25),
              height: Math.max(12, size * 0.25),
              borderRadius: 999,
              borderWidth: Math.max(2, size * 0.045),
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: "relative",
  },
  ring: {
    borderWidth: 2,
    borderColor: colors.violet,
    padding: 2,
  },
  avatar: {
    overflow: "hidden",
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.violet,
  },
  fallbackText: {
    color: colors.text,
    fontWeight: "900",
  },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    borderColor: colors.bg,
  },
});