import { Image, StyleSheet, Text, View } from "react-native";

export default function GroupAvatar({
  name = "?",
  color = "#7C5CFF",
  emoji,
  avatarUrl,
  size = 52,
}) {
  const letter = name?.[0]?.toUpperCase() || "?";

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: color || "#7C5CFF",
          width: size,
          height: size,
          borderRadius: size / 2.6,
        },
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2.6,
          }}
        />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.42 }]}>
          {emoji || letter}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  text: {
    color: "white",
    fontWeight: "900",
  },
});