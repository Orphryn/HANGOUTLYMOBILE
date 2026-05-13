import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import { colors } from "../constants/theme";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function showError(text) {
    setMessage(text);
  }

  async function signup() {
    setMessage("");
    setLoading(true);

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      setLoading(false);
      return showError("Username must be at least 3 characters.");
    }

    if (!cleanEmail.includes("@")) {
      setLoading(false);
      return showError("Use a real email address.");
    }

    if (password.length < 6) {
      setLoading(false);
      return showError("Password must be at least 6 characters.");
    }

    if (password !== confirmPassword) {
      setLoading(false);
      return showError("Passwords do not match.");
    }

    const { data: existingUsername } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existingUsername) {
      setLoading(false);
      return showError("That username is already taken.");
    }

    const { data: existingEmail } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingEmail) {
      setLoading(false);
      return showError("That email already has an account.");
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername,
          display_name: displayName.trim() || cleanUsername,
        },
      },
    });

    if (error) {
      setLoading(false);
      return showError(error.message);
    }

    setUsername("");
    setDisplayName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setLoading(false);

    router.replace({
      pathname: "/pending-verification",
      params: { email: cleanEmail },
    });
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Make your space</Text>
        <Text style={styles.subtitle}>Pick a name your friends can find.</Text>

        {!!message && (
          <View style={styles.errorBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.form}>
          <AppInput placeholder="Username" value={username} onChangeText={setUsername} />
          <AppInput placeholder="Display name optional" value={displayName} onChangeText={setDisplayName} />
          <AppInput placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <AppInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
          <AppInput placeholder="Verify password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          <AppButton title={loading ? "Creating..." : "Create Account"} onPress={signup} />
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
    fontSize: 38,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.soft,
    marginTop: 8,
    marginBottom: 20,
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: "rgba(251,113,133,0.16)",
    borderColor: colors.red,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  messageText: {
    color: colors.text,
    fontWeight: "700",
  },
  form: {
    gap: 12,
  },
});