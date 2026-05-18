import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "../constants/theme";

export default function AppInput({
  label,
  helper,
  error,
  style,
  inputStyle,
  multiline = false,
  ...props
}) {
  return (
    <View style={[styles.wrap, style]}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          multiline && styles.multiline,
          error && styles.inputError,
          inputStyle,
        ]}
      />

      {!!helper && !error && <Text style={styles.helper}>{helper}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 7,
  },
  label: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 13,
    marginLeft: 2,
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: "800",
  },
  multiline: {
    minHeight: 104,
    textAlignVertical: "top",
    paddingTop: 14,
    lineHeight: 21,
  },
  inputError: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
  },
  helper: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 2,
  },
  error: {
    color: colors.red,
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 2,
  },
});