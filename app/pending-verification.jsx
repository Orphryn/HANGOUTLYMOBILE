import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { colors } from "../constants/theme";

export default function PendingVerification() {
  const { email } = useLocalSearchParams();

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Check your email</Text>

        <Text style={styles.subtitle}>
          We sent a confirmation link to:
        </Text>

        <Text style={styles.email}>{email}</Text>

        <Text style={styles.body}>
          After you verify your email, come back here and log in with your username.
        </Text>

        <View style={styles.actions}>
          <AppButton
            title="I verified my email"
            onPress={() => router.replace("/login?created=true")}
          />

          <AppButton
            title="Back to Sign Up"
            variant="secondary"
            onPress={() => router.replace("/signup")}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 30,
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    marginTop: 12,
    fontSize: 16,
  },
  email: {
    color: colors.soft,
    marginTop: 8,
    fontSize: 18,
    fontWeight: "900",
  },
  body: {
    color: colors.muted,
    marginTop: 22,
    lineHeight: 22,
  },
  actions: {
    marginTop: 28,
    gap: 12,
  },
});