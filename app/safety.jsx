import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as Location from "expo-location";

import { colors } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const HOLD_TIME = 3000;

export default function Safety() {
  const { user } = useAuth();

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(
    "Hold the button. If your finger leaves early, your location is sent."
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function sendEmergencyLocation() {
    try {
      setStatus("Getting your location...");

      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return Alert.alert(
          "Permission denied",
          "Location permission is required."
        );
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
        return Alert.alert(
          "No group found",
          "You need to join a group first."
        );
      }

      const { error } = await supabase.from("messages").insert({
        group_id: membership.group_id,
        sender_id: user.id,
        content: link,
      });

      if (error) {
        return Alert.alert("Error", error.message);
      }

      setStatus("Emergency location sent.");
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  }

  function startHold() {
    setHolding(true);
    setProgress(0);

    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const percent = Math.min(elapsed / HOLD_TIME, 1);

      setProgress(percent);

      if (percent >= 1) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;

        setHolding(false);
        setProgress(1);

        setStatus("Safe release confirmed. Alert cancelled.");
      }
    }, 16);
  }

  async function releaseHold() {
    if (!holding) return;

    clearInterval(intervalRef.current);

    const elapsed = Date.now() - startTimeRef.current;

    setHolding(false);

    if (elapsed < HOLD_TIME) {
      setStatus("Finger released early. Sending emergency alert...");
      await sendEmergencyLocation();
    } else {
      setStatus("Safe release confirmed.");
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Safety Hold</Text>

      <Text style={styles.subtitle}>
        Keep holding for 3 seconds to cancel the alert.
        {"\n"}
        Let go early to immediately send your location.
      </Text>

      <View style={styles.outerRing}>
        <View
          style={[
            styles.progressRing,
            {
              transform: [{ scale: 0.7 + progress * 0.3 }],
              opacity: 0.25 + progress * 0.75,
            },
          ]}
        />

        <Pressable
          onPressIn={startHold}
          onPressOut={releaseHold}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.icon}>🛡️</Text>

          <Text style={styles.buttonText}>
            {holding
              ? `${Math.max(
                  0,
                  ((HOLD_TIME - progress * HOLD_TIME) / 1000).toFixed(1)
                )}s`
              : "HOLD"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How it works</Text>

        <Text style={styles.infoText}>
          • Press and hold if you feel unsafe
        </Text>

        <Text style={styles.infoText}>
          • If your thumb slips or you let go early, your live location is sent
        </Text>

        <Text style={styles.infoText}>
          • Holding the full 3 seconds cancels the alert
        </Text>
      </View>

      <Text style={styles.status}>{status}</Text>
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

  title: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "900",
    textAlign: "center",
  },

  subtitle: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 24,
    marginBottom: 40,
  },

  outerRing: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },

  progressRing: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: colors.red,
  },

  button: {
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.red,
    shadowOpacity: 0.45,
    shadowRadius: 25,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 12,
  },

  buttonPressed: {
    transform: [{ scale: 0.96 }],
  },

  icon: {
    fontSize: 42,
    marginBottom: 8,
  },

  buttonText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },

  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },

  infoTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 14,
  },

  infoText: {
    color: colors.muted,
    lineHeight: 24,
    marginBottom: 8,
  },

  status: {
    color: "#cbd5e1",
    textAlign: "center",
    lineHeight: 22,
  },
});