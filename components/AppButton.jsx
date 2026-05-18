import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadow } from "../constants/theme";

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  style,
  textStyle,
  icon,
}) {
  const variantStyle =
    variant === "secondary"
      ? styles.secondary
      : variant === "ghost"
      ? styles.ghost
      : variant === "danger"
      ? styles.danger
      : variant === "soft"
      ? styles.soft
      : styles.primary;

  const variantTextStyle =
    variant === "secondary"
      ? styles.secondaryText
      : variant === "ghost"
      ? styles.ghostText
      : variant === "danger"
      ? styles.dangerText
      : variant === "soft"
      ? styles.softText
      : styles.primaryText;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyle,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.inner}>
        {!!icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={[styles.text, variantTextStyle, textStyle]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primary: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
    ...shadow,
  },
  secondary: {
    backgroundColor: colors.card2,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  danger: {
    backgroundColor: colors.red,
    borderColor: colors.red,
    ...shadow,
  },
  soft: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  primaryText: {
    color: colors.text,
  },
  secondaryText: {
    color: colors.text,
  },
  ghostText: {
    color: colors.violet,
  },
  dangerText: {
    color: colors.text,
  },
  softText: {
    color: colors.violet,
  },
});