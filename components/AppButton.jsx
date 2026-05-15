import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii } from "../constants/theme";

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
}) {
  const bg =
    variant === "danger"
      ? colors.red
      : variant === "secondary"
      ? colors.bg2
      : colors.violet;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
  },
});