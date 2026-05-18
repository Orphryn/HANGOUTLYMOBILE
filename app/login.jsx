import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import { colors } from "../constants/theme";
import { supabase } from "../lib/supabase";

export default function Login() {
  const params = useLocalSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState(
    params.created ? "Email verified? You can now log in." : ""
  );

  const [messageType, setMessageType] = useState(
    params.created ? "success" : "error"
  );

  const [loading, setLoading] = useState(false);

  function showError(text) {
    setMessageType("error");
    setMessage(text);
  }

  function showSuccess(text) {
    setMessageType("success");
    setMessage(text);
  }

  async function login() {
    setMessage("");
    setLoading(true);

    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername || !password) {
      setLoading(false);
      return showError("Enter your username and password.");
    }

    const { data: emailResult, error: emailError } = await supabase.rpc(
      "get_email_for_username",
      {
        input_username: cleanUsername,
      }
    );

    if (emailError || !emailResult) {
      setLoading(false);
      return showError("No verified account found with that username.");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailResult,
      password,
    });

    if (error) {
      setLoading(false);
      return showError(error.message);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email_confirmed_at) {
      await supabase.auth.signOut();
      setLoading(false);
      return showError("Please verify your email before logging in.");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, profile_completed")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setLoading(false);
      return showError(profileError.message);
    }

    showSuccess("Logged in successfully.");
    setLoading(false);

    if (!profile?.profile_completed) {
      router.replace("/profile-setup");
    } else {
      router.replace("/dashboard");
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.peachGlow} />

      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>See what your people are up to.</Text>

        {!!message && (
          <View
            style={[
              styles.messageBox,
              messageType === "error" ? styles.errorBox : styles.successBox,
            ]}
          >
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.form}>
          <AppInput
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
          />

          <AppInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <AppButton
            title={loading ? "Logging in..." : "Log In"}
            onPress={login}
            disabled={loading}
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
  peachGlow: {
    position: "absolute",
    top: 80,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,107,0.14)",
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
  messageBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  errorBox: {
    backgroundColor: "rgba(251,113,133,0.16)",
    borderColor: colors.red,
    borderWidth: 1,
  },
  successBox: {
    backgroundColor: "rgba(45,212,191,0.16)",
    borderColor: colors.green,
    borderWidth: 1,
  },
  messageText: {
    color: colors.text,
    fontWeight: "700",
  },
  form: {
    gap: 12,
  },
});