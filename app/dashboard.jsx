import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { colors, radii, shadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function name(profile) {
  return profile?.username || profile?.display_name || profile?.email || "Someone";
}

export default function Dashboard() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard() {
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    setProfile(profileData);

    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id, role, groups(id, name, description)")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    const groups = memberships?.map((row) => row.groups).filter(Boolean) || [];
    const groupIds = groups.map((g) => g.id);

    if (groupIds.length > 0) {
      const { data: latestMessages } = await supabase
        .from("messages")
        .select("id, group_id, content, created_at, groups(id, name, description), profiles:sender_id(username, display_name, email)")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(40);

      const seen = new Set();
      const chats = [];

      for (const msg of latestMessages || []) {
        if (seen.has(msg.group_id)) continue;
        seen.add(msg.group_id);
        chats.push(msg);
      }

      for (const group of groups) {
        if (!seen.has(group.id)) {
          chats.push({
            id: `empty-${group.id}`,
            group_id: group.id,
            content: "Quiet so far. Someone should say something.",
            created_at: null,
            groups: group,
            profiles: null,
          });
        }
      }

      setRecentChats(chats);
    } else {
      setRecentChats([]);
    }

    const { data: inviteRows } = await supabase
      .from("group_members")
      .select("id, groups(id, name, description), inviter:invited_by(username, display_name, email)")
      .eq("user_id", user.id)
      .eq("status", "pending");

    setInvites(inviteRows || []);

    const { data: notificationRows } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    setNotifications(notificationRows || []);
  }

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [user])
  );

  async function refresh() {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }

  async function acceptInvite(inviteId) {
    await supabase.from("group_members").update({ status: "accepted" }).eq("id", inviteId);
    await loadDashboard();
  }

  async function declineInvite(inviteId) {
    await supabase.from("group_members").delete().eq("id", inviteId);
    await loadDashboard();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>Hangoutly</Text>
          <Text style={styles.muted}>
            {profile?.username ? `Good to see you, ${profile.username}` : "Good to see you."}
          </Text>
        </View>

        <View style={styles.bell}>
          <Text style={styles.bellText}>🔔</Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton title="New / Manage Groups" onPress={() => router.push("/groups")} />
        <AppButton title="Planner" variant="secondary" onPress={() => router.push("/planner")} />
        <AppButton title="Safety" variant="secondary" onPress={() => router.push("/safety")} />
      </View>

      {invites.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invites waiting</Text>
          {invites.map((invite) => (
            <View key={invite.id} style={styles.invite}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{invite.groups?.name}</Text>
                <Text style={styles.muted}>Invited by {name(invite.inviter)}</Text>
              </View>
              <View style={styles.row}>
                <Pressable onPress={() => acceptInvite(invite.id)} style={[styles.pill, { backgroundColor: colors.green }]}>
                  <Text style={styles.pillText}>Accept</Text>
                </Pressable>
                <Pressable onPress={() => declineInvite(invite.id)} style={[styles.pill, { backgroundColor: colors.red }]}>
                  <Text style={styles.pillText}>No</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent Chats</Text>
        {recentChats.length === 0 ? (
          <Text style={styles.muted}>No groups yet. Start something small.</Text>
        ) : (
          recentChats.map((chat) => (
            <Pressable
              key={chat.id}
              onPress={() => router.push(`/group/${chat.group_id}`)}
              style={({ pressed }) => [styles.chat, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{chat.groups?.name?.[0]?.toUpperCase() || "?"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{chat.groups?.name}</Text>
                <Text numberOfLines={1} style={styles.muted}>
                  {chat.profiles ? `${name(chat.profiles)}: ` : ""}
                  {chat.content}
                </Text>
              </View>
              {chat.created_at && (
                <Text style={styles.time}>
                  {new Date(chat.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
              )}
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Little signals</Text>
        {notifications.length === 0 ? (
          <Text style={styles.muted}>Quiet night. Nothing new yet.</Text>
        ) : (
          notifications.map((n) => (
            <View key={n.id} style={styles.notification}>
              <Text style={styles.cardTitle}>{n.title}</Text>
              {!!n.body && <Text style={styles.muted}>{n.body}</Text>}
            </View>
          ))
        )}
      </View>

      <AppButton title="Log Out" variant="danger" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { color: colors.text, fontSize: 36, fontWeight: "900" },
  muted: { color: colors.muted },
  bell: {
    height: 50,
    width: 50,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellText: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: colors.red,
    minWidth: 22,
    height: 22,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  actions: { gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 18,
    gap: 12,
    ...shadow,
  },
  sectionTitle: { color: colors.text, fontSize: 23, fontWeight: "900" },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  invite: { backgroundColor: colors.bg2, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flexDirection: "row", gap: 8 },
  pill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  pillText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  chat: { backgroundColor: colors.bg2, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { height: 48, width: 48, borderRadius: 18, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  time: { color: colors.muted, fontSize: 12 },
  notification: { backgroundColor: colors.bg2, borderRadius: 18, padding: 14 },
});