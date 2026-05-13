import * as Location from "expo-location";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Safety() {
  const { user } = useAuth();
  const [status, setStatus] = useState("Tap to send your location to your latest group.");
  const [sending, setSending] = useState(false);

  async function sendSafetyAlert() {
    setSending(true);

    const { status: permission } = await Location.requestForegroundPermissionsAsync();
    if (permission !== "granted") {
      setSending(false);
      return Alert.alert("Location blocked", "Enable location permissions first.");
    }

    const location = await Location.getCurrentPositionAsync({});
    const link = `https://www.google.com/maps?q=${location.coords.latitude},${location.coords.longitude}`;

    const { data: membership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .limit(1)
      .single();

    if (!membership?.group_id) {
      setSending(false);
      return Alert.alert("No group", "Join or create a group first.");
    }

    await supabase.from("messages").insert({
      group_id: membership.group_id,
      sender_id: user.id,
      content: `🚨 Safety alert. Last known location: ${link}`,
    });

    setStatus("Sent. Your group has your last known location.");
    setSending(false);
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Safety Mode</Text>
      <Text style={styles.subtitle}>A simple emergency signal for people who know you.</Text>

      <Pressable onPress={sendSafetyAlert} style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.96 }] }]}>
        <Text style={styles.icon}>📍</Text>
        <Text style={styles.buttonText}>{sending ? "Sending..." : "Send Safety Alert"}</Text>
      </Pressable>

      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" },
  title: { color: colors.text, fontSize: 38, fontWeight: "900", textAlign: "center" },
  subtitle: { color: colors.muted, textAlign: "center", marginTop: 10, marginBottom: 34 },
  button: { height: 210, width: 210, borderRadius: 999, backgroundColor: colors.red, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 38 },
  buttonText: { color: colors.text, fontWeight: "900", marginTop: 8 },
  status: { color: colors.muted, textAlign: "center", marginTop: 28, lineHeight: 22 },
});