import { StyleSheet, TextInput } from "react-native";
import { colors, radii } from "../constants/theme";

export default function AppInput(props) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      style={styles.input}
      autoCapitalize="none"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bg2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 15,
    color: colors.text,
    fontSize: 15,
  },
});