import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

export default function GroupAvatar({
  name = "?",
  color = "#7C5CFF",
  emoji,
  avatarUrl,
  size = 52,
}) {
  const [failed, setFailed] = useState(false);
  const letter = name?.[0]?.toUpperCase() || "?";
  const radius = Math.max(12, size / 2.6);
  const showImage = !!avatarUrl && !failed;

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: color || "#7C5CFF",
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, borderRadius: radius }}
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