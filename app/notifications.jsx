import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const diffMin = Math.floor((new Date() - date) / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  async function loadNotifications() {
    if (!user?.id) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setNotifications(data || []);
  }

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [user?.id])
  );

  async function openNotification(item) {
    await supabase.from("notifications").update({ read: true }).eq("id", item.id);

    if (item.link) {
      router.push(item.link);
    } else {
      loadNotifications();
    }
  }

  async function markAllRead() {
    if (!user?.id) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id);

    loadNotifications();
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.muted}>Messages, invites, events, and tasks.</Text>
        </View>

        <Pressable onPress={markAllRead} style={styles.readButton}>
          <Text style={styles.readText}>Read all</Text>
        </Pressable>
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing yet.</Text>
          <Text style={styles.muted}>When something happens, it’ll show up here.</Text>
        </View>
      ) : (
        notifications.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => openNotification(item)}
            style={[styles.card, !item.read && styles.unread]}
          >
            <View style={styles.dotRow}>
              {!item.read && <View style={styles.dot} />}
              <Text style={styles.cardTitle}>{item.title}</Text>
            </View>

            {!!item.body && <Text style={styles.body}>{item.body}</Text>}

            <Text style={styles.time}>{formatTime(item.created_at)}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 60 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: colors.text, fontSize: 34, fontWeight: "900" },
  muted: { color: colors.muted },
  readButton: {
    backgroundColor: colors.violet,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  readText: { color: colors.text, fontWeight: "900" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 16,
    gap: 8,
    ...shadow,
  },
  unread: {
    borderColor: colors.violet,
    backgroundColor: "#263653",
  },
  dotRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dot: {
    height: 9,
    width: 9,
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  body: { color: colors.muted, lineHeight: 20 },
  time: { color: colors.soft, fontWeight: "800", fontSize: 12 },
  empty: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
});