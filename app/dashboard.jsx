import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AliveCard from "../components/AliveCard";
import AppButton from "../components/AppButton";
import GroupAvatar from "../components/GroupAvatar";
import { colors, radii, shadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function displayName(profile) {
  if (!profile) return "Someone";
  return profile.username || profile.display_name || profile.email || "Someone";
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const diffMin = Math.floor((new Date() - date) / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return `${Math.floor(diffHours / 24)}d`;
}

export default function Dashboard() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllChats, setShowAllChats] = useState(false);

  async function loadDashboard() {
    if (!user?.id) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, username, display_name, email")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(profileData);

    const { data: memberships } = await supabase
      .from("group_members")
      .select(`
        id,
        role,
        groups (
          id,
          name,
          description,
          avatar_color,
          avatar_emoji,
          avatar_url,
          chat_background,
          created_at
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "accepted");

    const groups =
      memberships
        ?.map((row) => ({ ...row.groups, role: row.role }))
        .filter((group) => group?.id) || [];

    const groupIds = groups.map((group) => group.id);

    if (groupIds.length > 0) {
      const { data: latestMessages } = await supabase
        .from("messages")
        .select(`
          id,
          group_id,
          content,
          created_at,
          profiles:sender_id (
            id,
            username,
            display_name,
            email
          ),
          groups (
            id,
            name,
            description,
            avatar_color,
            avatar_emoji,
            avatar_url,
            chat_background,
            created_at
          )
        `)
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(150);

      const seen = new Set();
      const chats = [];

      for (const message of latestMessages || []) {
        if (!message?.group_id || seen.has(message.group_id)) continue;

        seen.add(message.group_id);

        const fallbackGroup = groups.find((group) => group.id === message.group_id);

        chats.push({
          group_id: message.group_id,
          group: message.groups || fallbackGroup,
          lastMessage: message.content,
          lastSender: message.profiles,
          lastAt: message.created_at,
          hasMessage: true,
        });
      }

      const quietGroups = groups
        .filter((group) => !seen.has(group.id))
        .map((group) => ({
          group_id: group.id,
          group,
          lastMessage: "Quiet so far. Someone should say something.",
          lastSender: null,
          lastAt: group.created_at,
          hasMessage: false,
        }));

      setRecentChats([...chats, ...quietGroups]);
    } else {
      setRecentChats([]);
    }

    const { data: inviteRows } = await supabase
      .from("group_members")
      .select(`
        id,
        group_id,
        role,
        status,
        groups (
          id,
          name,
          description,
          avatar_color,
          avatar_emoji,
          avatar_url,
          chat_background,
          created_at
        ),
        inviter:invited_by (
          id,
          username,
          display_name,
          email
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "pending");

    setInvites((inviteRows || []).filter((row) => row?.id));

    const { data: notificationRows } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6);

    setNotifications(notificationRows || []);
  }

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [user?.id])
  );

  async function refresh() {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }

  async function acceptInvite(inviteId) {
    const { error } = await supabase
      .from("group_members")
      .update({ status: "accepted" })
      .eq("id", inviteId);

    if (!error) await loadDashboard();
  }

  async function declineInvite(inviteId) {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("id", inviteId);

    if (!error) await loadDashboard();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  const unreadCount = notifications.filter((item) => !item.read).length;
  const visibleChats = showAllChats ? recentChats : recentChats.slice(0, 3);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet} />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.logo}>Hangoutly</Text>
          <Text style={styles.subtitle}>
            Good to see you, {profile?.username || "friend"}.
          </Text>
        </View>

        <Pressable onPress={() => router.push("/notifications")} style={styles.bell}>
          <Text style={styles.bellIcon}>🔔</Text>

          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.quickActions}>
        <AliveCard style={styles.quickCard} onPress={() => router.push("/groups")}>
          <Text style={styles.quickIcon}>👥</Text>
          <Text style={styles.quickTitle}>Groups</Text>
          <Text style={styles.quickText}>Chats and invites</Text>
        </AliveCard>

        <AliveCard style={styles.quickCard} onPress={() => router.push("/planner")}>
          <Text style={styles.quickIcon}>📅</Text>
          <Text style={styles.quickTitle}>Planner</Text>
          <Text style={styles.quickText}>Events and tasks</Text>
        </AliveCard>

        <AliveCard style={styles.quickCard} onPress={() => router.push("/safety")}>
          <Text style={styles.quickIcon}>🛡️</Text>
          <Text style={styles.quickTitle}>Safety</Text>
          <Text style={styles.quickText}>Hold to alert</Text>
        </AliveCard>
      </View>

      {invites.length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Invites waiting</Text>
            <Text style={styles.sectionPill}>{invites.length}</Text>
          </View>

          {invites.map((invite) => (
            <View key={invite.id} style={styles.inviteCard}>
              <GroupAvatar
                name={invite.groups?.name}
                color={invite.groups?.avatar_color}
                emoji={invite.groups?.avatar_emoji}
                avatarUrl={invite.groups?.avatar_url}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {invite.groups?.name || "Group invite"}
                </Text>
                <Text style={styles.muted}>
                  Invited by {displayName(invite.inviter)}
                </Text>
              </View>

              <Pressable
                onPress={() => acceptInvite(invite.id)}
                style={[styles.smallButton, { backgroundColor: colors.green }]}
              >
                <Text style={styles.smallButtonText}>Yes</Text>
              </Pressable>

              <Pressable
                onPress={() => declineInvite(invite.id)}
                style={[styles.smallButton, { backgroundColor: colors.red }]}
              >
                <Text style={styles.smallButtonText}>No</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent chats</Text>
            <Text style={styles.muted}>The last rooms people touched.</Text>
          </View>

          <Pressable onPress={() => router.push("/groups")}>
            <Text style={styles.viewAll}>View all</Text>
          </Pressable>
        </View>

        {visibleChats.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No groups yet.</Text>
            <Text style={styles.emptyText}>
              Start with one group. The app gets better when people are here.
            </Text>

            <View style={{ marginTop: 14 }}>
              <AppButton
                title="Create your first group"
                onPress={() => router.push("/groups")}
              />
            </View>
          </View>
        ) : (
          visibleChats.map((chat) => (
            <AliveCard
              key={chat.group_id}
              style={styles.chatCard}
              onPress={() => router.push(`/group/${chat.group_id}`)}
            >
              <GroupAvatar
                name={chat.group?.name}
                color={chat.group?.avatar_color}
                emoji={chat.group?.avatar_emoji}
                avatarUrl={chat.group?.avatar_url}
              />

              <View style={{ flex: 1 }}>
                <View style={styles.chatTopLine}>
                  <Text numberOfLines={1} style={styles.chatTitle}>
                    {chat.group?.name || "Group"}
                  </Text>

                  {!!chat.lastAt && (
                    <Text style={styles.timeText}>{formatTime(chat.lastAt)}</Text>
                  )}
                </View>

                <Text numberOfLines={1} style={styles.chatSnippet}>
                  {chat.lastSender ? `${displayName(chat.lastSender)}: ` : ""}
                  {chat.lastMessage}
                </Text>
              </View>

              {chat.hasMessage && <View style={styles.activeDot} />}
            </AliveCard>
          ))
        )}

        {recentChats.length > 3 && (
          <Pressable
            onPress={() => setShowAllChats((value) => !value)}
            style={styles.showMoreButton}
          >
            <Text style={styles.showMoreText}>
              {showAllChats ? "Show less" : `Show ${recentChats.length - 3} more`}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Activity</Text>
            <Text style={styles.muted}>Recent alerts, invites, tasks, and events.</Text>
          </View>

          <Pressable onPress={() => router.push("/notifications")}>
            <Text style={styles.viewAll}>Open</Text>
          </Pressable>
        </View>

        {notifications.length === 0 ? (
          <Text style={styles.emptyText}>Nothing new yet.</Text>
        ) : (
          notifications.slice(0, 3).map((item) => (
            <Pressable
              key={item.id}
              onPress={() => item.link && router.push(item.link)}
              style={[styles.notification, !item.read && styles.unreadNotification]}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              {!!item.body && <Text style={styles.muted}>{item.body}</Text>}
              <Text style={styles.smallMuted}>{formatTime(item.created_at)}</Text>
            </Pressable>
          ))
        )}
      </View>

      <AppButton title="Log Out" variant="danger" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18, paddingBottom: 44 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  logo: { color: colors.text, fontSize: 38, fontWeight: "900" },
  subtitle: { color: colors.muted, marginTop: 4 },
  bell: {
    height: 54,
    width: 54,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  bellIcon: { fontSize: 23 },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  quickActions: { flexDirection: "row", gap: 10 },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 14,
    minHeight: 118,
    justifyContent: "space-between",
    ...shadow,
  },
  quickIcon: { fontSize: 24 },
  quickTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  quickText: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 18,
    gap: 13,
    ...shadow,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  sectionPill: {
    backgroundColor: colors.violet,
    color: colors.text,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: "900",
  },
  viewAll: { color: colors.soft, fontWeight: "900" },
  muted: { color: colors.muted },
  smallMuted: { color: colors.muted, fontSize: 12, marginTop: 3 },
  cardTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  inviteCard: {
    backgroundColor: colors.bg2,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  smallButton: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9 },
  smallButtonText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  chatCard: {
    backgroundColor: colors.bg2,
    borderRadius: 23,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(242,214,162,0.18)",
  },
  chatTopLine: { flexDirection: "row", gap: 10, alignItems: "center" },
  chatTitle: { color: colors.text, fontWeight: "900", fontSize: 17, flex: 1 },
  timeText: { color: colors.muted, fontSize: 12 },
  chatSnippet: { color: colors.muted, marginTop: 3 },
  activeDot: { height: 9, width: 9, borderRadius: 999, backgroundColor: colors.green },
  showMoreButton: {
    backgroundColor: colors.bg2,
    borderRadius: 16,
    padding: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  showMoreText: {
    color: colors.soft,
    fontWeight: "900",
  },
  notification: {
    backgroundColor: colors.bg2,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  unreadNotification: { borderColor: colors.violet },
  emptyState: { backgroundColor: colors.bg2, borderRadius: 24, padding: 18 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 17 },
  emptyText: { color: colors.muted, marginTop: 5, lineHeight: 20 },
});