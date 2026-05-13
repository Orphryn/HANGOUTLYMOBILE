import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { colors } from "../constants/theme";
import { useAuth } from "../context/AuthContext";

export default function Index() {
  const { user, loadingAuth } = useAuth();

  useEffect(() => {
    if (!loadingAuth && user) router.replace("/dashboard");
  }, [loadingAuth, user]);

  if (loadingAuth) {
    return (
      <View style={styles.page}>
        <Text style={styles.muted}>Getting things ready...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.sunGlow} />
      <View style={styles.violetGlow} />

      <View style={styles.heroCard}>
        <Text style={styles.logo}>Hangoutly</Text>
        <Text style={styles.subtitle}>
          Plan the night. Keep the group together.
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton title="Create Account" onPress={() => router.push("/signup")} />
        <AppButton
          title="Log In"
          variant="secondary"
          onPress={() => router.push("/login")}
        />
      </View>

      <Text style={styles.footer}>
        Group chats, plans, tasks, availability, and safety in one warm place.
      </Text>
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
  sunGlow: {
    position: "absolute",
    top: 90,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,107,0.16)",
  },
  violetGlow: {
    position: "absolute",
    bottom: 120,
    left: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.18)",
  },
  heroCard: {
    borderRadius: 34,
    backgroundColor: "rgba(27,41,64,0.86)",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 30,
  },
  logo: {
    color: colors.text,
    fontSize: 52,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: colors.soft,
    textAlign: "center",
    marginTop: 12,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
  },
  actions: {
    marginTop: 22,
    gap: 12,
  },
  footer: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 22,
  },
  muted: {
    color: colors.muted,
    textAlign: "center",
  },
});