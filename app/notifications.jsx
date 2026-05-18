import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import GroupAvatar from "../components/GroupAvatar";
import ProfileAvatar from "../components/ProfileAvatar";
import { colors, shadow, softShadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function displayName(profile) {
  if (!profile) return "Someone";
  return profile.display_name || profile.username || profile.email || "Someone";
}

function formatRelativeTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 30) return "now";
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function notificationMeta(type, title, body) {
  const text = `${type || ""} ${title || ""} ${body || ""}`.toLowerCase();

  if (text.includes("safety") || text.includes("alert")) {
    return {
      icon: "🚨",
      label: "Safety",
      bg: colors.redSoft,
      border: "#FFD1D1",
      accent: colors.red,
    };
  }

  if (text.includes("invite")) {
    return {
      icon: "📩",
      label: "Invite",
      bg: colors.violetSoft,
      border: "#E6DFFF",
      accent: colors.violet,
    };
  }

  if (text.includes("event")) {
    return {
      icon: "📅",
      label: "Event",
      bg: colors.blueSoft,
      border: "#D8E7FF",
      accent: colors.blue,
    };
  }

  if (text.includes("task")) {
    return {
      icon: "✅",
      label: "Task",
      bg: colors.greenSoft,
      border: "#CFF7DC",
      accent: colors.green,
    };
  }

  if (text.includes("group")) {
    return {
      icon: "💬",
      label: "Group",
      bg: colors.violetSoft,
      border: "#E6DFFF",
      accent: colors.violet,
    };
  }

  return {
    icon: "🔔",
    label: "Update",
    bg: colors.softSurface2,
    border: colors.border,
    accent: colors.violet,
  };
}

function cleanRoute(link) {
  if (!link || typeof link !== "string") return "";
  if (link.startsWith("/")) return link;
  return `/${link}`;
}

export default function Notifications() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [activeFilter, setActiveFilter] = useState("unread");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const unreadCount = notifications.filter((item) => !item.read).length;

  const visibleNotifications = useMemo(() => {
    if (activeFilter === "unread") {
      return notifications.filter((item) => !item.read);
    }

    return notifications;
  }, [notifications, activeFilter]);

  const safetyCount = notifications.filter((item) => {
    const text = `${item.type || ""} ${item.title || ""} ${item.body || ""}`.toLowerCase();
    return text.includes("safety") || text.includes("alert");
  }).length;

  const inviteCount = pendingInvites.length;

  async function updateLastSeen() {
    if (!user?.id) return;

    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  async function loadProfile() {
    if (!user?.id) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, email, avatar_url, bio")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(data);
  }

  async function loadNotifications() {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, read, link, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      Alert.alert("Could not load notifications", error.message);
      setNotifications([]);
      return;
    }

    setNotifications(data || []);
  }

  async function loadPendingInvites() {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("group_members")
      .select(
        `
        id,
        group_id,
        invited_by,
        role,
        status,
        created_at,
        groups (
          id,
          name,
          description,
          avatar_color,
          avatar_emoji,
          avatar_url
        ),
        profiles:invited_by (
          id,
          username,
          display_name,
          email,
          avatar_url
        )
      `
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Could not load invites:", error.message);
      setPendingInvites([]);
      return;
    }

    setPendingInvites(data || []);
  }

  async function loadAll() {
    if (!user?.id) return;

    setLoading(true);

    await updateLastSeen();

    await Promise.all([loadProfile(), loadNotifications(), loadPendingInvites()]);

    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [user?.id])
  );

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function markOneRead(notification) {
    if (!notification || notification.read) return;

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notification.id)
      .eq("user_id", user.id);

    if (error) {
      console.log("Could not mark read:", error.message);
      return;
    }

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, read: true } : item
      )
    );
  }

  async function markAllRead() {
    if (!user?.id) return;

    const unreadIds = notifications
      .filter((item) => !item.read)
      .map((item) => item.id);

    if (unreadIds.length === 0) {
      setNotice("Nothing unread.");
      return;
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .in("id", unreadIds);

    if (error) {
      Alert.alert("Could not mark all read", error.message);
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setNotice("All notifications marked read.");
  }

  async function deleteNotification(notification) {
    if (!notification?.id) return;

    const doDelete = async () => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notification.id)
        .eq("user_id", user.id);

      if (error) {
        Alert.alert("Could not delete notification", error.message);
        return;
      }

      setNotifications((prev) =>
        prev.filter((item) => item.id !== notification.id)
      );
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm("Delete this notification?");
      if (confirmed) await doDelete();
      return;
    }

    Alert.alert("Delete notification?", "This removes it from your inbox.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: doDelete,
      },
    ]);
  }

  async function openNotification(notification) {
    if (!notification) return;

    await markOneRead(notification);

    const route = cleanRoute(notification.link);

    if (route) {
      router.push(route);
      return;
    }

    const text = `${notification.type || ""} ${notification.title || ""} ${
      notification.body || ""
    }`.toLowerCase();

    if (text.includes("planner") || text.includes("event") || text.includes("task")) {
      router.push("/planner");
      return;
    }

    if (text.includes("safety")) {
      router.push("/safety");
      return;
    }

    router.push("/dashboard");
  }

  async function acceptInvite(invite) {
    if (!invite?.id) return;

    const { error } = await supabase
      .from("group_members")
      .update({ status: "accepted" })
      .eq("id", invite.id)
      .eq("user_id", user.id);

    if (error) {
      Alert.alert("Could not accept invite", error.message);
      return;
    }

    await supabase.from("messages").insert({
      group_id: invite.group_id,
      sender_id: user.id,
      content: `${displayName(profile)} joined the group.`,
      message_type: "system",
    });

    if (invite.invited_by) {
      await supabase.from("notifications").insert({
        user_id: invite.invited_by,
        type: "group_invite_accepted",
        title: "Invite accepted",
        body: `${displayName(profile)} joined ${invite.groups?.name || "your group"}.`,
        read: false,
        link: `/group/${invite.group_id}`,
      });
    }

    setNotice(`Joined ${invite.groups?.name || "group"}.`);

    await loadAll();

    router.push(`/group/${invite.group_id}`);
  }

  async function declineInvite(invite) {
    if (!invite?.id) return;

    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("id", invite.id)
      .eq("user_id", user.id);

    if (error) {
      Alert.alert("Could not decline invite", error.message);
      return;
    }

    setNotice("Invite declined.");
    await loadAll();
  }

  function renderInvite(invite) {
    return (
      <View key={invite.id} style={styles.inviteCard}>
        <GroupAvatar
          name={invite.groups?.name}
          color={invite.groups?.avatar_color}
          emoji={invite.groups?.avatar_emoji}
          avatarUrl={invite.groups?.avatar_url}
          size={58}
        />

        <View style={{ flex: 1 }}>
          <Text style={styles.inviteTitle}>
            {invite.groups?.name || "Group invite"}
          </Text>

          <Text style={styles.inviteBody}>
            Invited by {displayName(invite.profiles)}
          </Text>

          {!!invite.groups?.description && (
            <Text numberOfLines={2} style={styles.inviteDescription}>
              {invite.groups.description}
            </Text>
          )}

          <Text style={styles.timeText}>
            {formatRelativeTime(invite.created_at)} ago
          </Text>
        </View>

        <View style={styles.inviteActions}>
          <Pressable onPress={() => acceptInvite(invite)} style={styles.acceptButton}>
            <Text style={styles.acceptText}>Accept</Text>
          </Pressable>

          <Pressable onPress={() => declineInvite(invite)} style={styles.declineButton}>
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderNotification(notification) {
    const meta = notificationMeta(
      notification.type,
      notification.title,
      notification.body
    );

    return (
      <View
        key={notification.id}
        style={[
          styles.notificationCard,
          !notification.read && styles.unreadNotification,
        ]}
      >
        <Pressable
          onPress={() => openNotification(notification)}
          style={styles.notificationMain}
        >
          <View
            style={[
              styles.notificationIcon,
              {
                backgroundColor: meta.bg,
                borderColor: meta.border,
              },
            ]}
          >
            <Text style={styles.notificationIconText}>{meta.icon}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.notificationTitleRow}>
              <Text style={styles.notificationTitle}>
                {notification.title || "Notification"}
              </Text>

              {!notification.read && <View style={styles.unreadDot} />}
            </View>

            {!!notification.body && (
              <Text numberOfLines={3} style={styles.notificationBody}>
                {notification.body}
              </Text>
            )}

            <View style={styles.metaRow}>
              <Text
                style={[
                  styles.typePill,
                  {
                    color: meta.accent,
                    backgroundColor: meta.bg,
                    borderColor: meta.border,
                  },
                ]}
              >
                {meta.label}
              </Text>

              <Text style={styles.timeText}>
                {formatRelativeTime(notification.created_at)} ago
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.notificationActions}>
          <Pressable
            onPress={() => openNotification(notification)}
            style={styles.openButton}
          >
            <Text style={styles.openText}>Open</Text>
          </Pressable>

          <Pressable
            onPress={() => deleteNotification(notification)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteText}>×</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.roundButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.logo}>Notifications</Text>
            <Text style={styles.subHeader}>Invites, plans, alerts, and updates.</Text>
          </View>

          <Pressable onPress={() => router.push("/settings")}>
            <ProfileAvatar profile={profile} size={42} showOnline online ring />
          </Pressable>
        </View>

        {!!notice && (
          <Pressable onPress={() => setNotice("")} style={styles.notice}>
            <Text style={styles.noticeText}>✅ {notice}</Text>
          </Pressable>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <View>
            <Text style={styles.heroKicker}>Inbox</Text>
            <Text style={styles.heroTitle}>
              {unreadCount > 0 ? unreadCount : "0"}
            </Text>
            <Text style={styles.heroText}>
              {unreadCount > 0
                ? `Unread update${unreadCount === 1 ? "" : "s"} waiting.`
                : "You are all caught up."}
            </Text>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{inviteCount}</Text>
              <Text style={styles.heroStatLabel}>invites</Text>
            </View>

            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{safetyCount}</Text>
              <Text style={styles.heroStatLabel}>alerts</Text>
            </View>
          </View>
        </View>

        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setActiveFilter("unread")}
              style={[
                styles.filterButton,
                activeFilter === "unread" && styles.filterButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === "unread" && styles.filterTextActive,
                ]}
              >
                Unread
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveFilter("all")}
              style={[
                styles.filterButton,
                activeFilter === "all" && styles.filterButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === "all" && styles.filterTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={markAllRead}
              disabled={unreadCount === 0}
              style={[styles.markAllButton, unreadCount === 0 && styles.disabledButton]}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>

            <Pressable onPress={() => router.push("/dashboard")} style={styles.backHomeButton}>
              <Text style={styles.backHomeText}>Home</Text>
            </Pressable>
          </View>
        </View>

        {pendingInvites.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Group invites</Text>
              <Text style={styles.sectionLink}>{pendingInvites.length}</Text>
            </View>

            <View style={styles.listStack}>
              {pendingInvites.map(renderInvite)}
            </View>
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {activeFilter === "unread" ? "Unread" : "All notifications"}
          </Text>

          <Text style={styles.sectionLink}>{visibleNotifications.length}</Text>
        </View>

        {visibleNotifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>
              {activeFilter === "unread" ? "✅" : "🔔"}
            </Text>

            <Text style={styles.emptyTitle}>
              {activeFilter === "unread"
                ? "No unread notifications."
                : "No notifications yet."}
            </Text>

            <Text style={styles.emptyText}>
              {activeFilter === "unread"
                ? "Anything important will show up here when it happens."
                : "Group invites, events, tasks, and safety alerts will appear here."}
            </Text>
          </View>
        ) : (
          <View style={styles.listStack}>
            {visibleNotifications.map(renderNotification)}
          </View>
        )}

        {loading && <Text style={styles.loadingText}>Refreshing...</Text>}
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable onPress={() => router.push("/dashboard")} style={styles.navItem}>
          <Text style={styles.navIcon}>⌂</Text>
          <Text style={styles.navText}>Home</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/groups")} style={styles.navItem}>
          <Text style={styles.navIcon}>💬</Text>
          <Text style={styles.navText}>Groups</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/planner")} style={styles.navCenter}>
          <Text style={styles.navCenterText}>＋</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/planner")} style={styles.navItem}>
          <Text style={styles.navIcon}>📅</Text>
          <Text style={styles.navText}>Plans</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/safety")} style={styles.navItem}>
          <Text style={styles.navIconActive}>♡</Text>
          <Text style={styles.navTextActive}>Alerts</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 18,
    gap: 16,
    paddingBottom: 112,
  },
  topBar: {
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  backText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 34,
    marginTop: -5,
  },
  logo: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  subHeader: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
  },
  notice: {
    backgroundColor: colors.greenSoft,
    borderColor: "#CFF7DC",
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
  },
  noticeText: {
    color: colors.text,
    fontWeight: "900",
  },
  heroCard: {
    backgroundColor: colors.violet,
    borderRadius: 34,
    padding: 20,
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 14,
    ...shadow,
  },
  heroGlow: {
    position: "absolute",
    right: -80,
    top: -80,
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroKicker: {
    color: "rgba(255,255,255,0.76)",
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 11,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 60,
    fontWeight: "900",
    letterSpacing: -2,
  },
  heroText: {
    color: "rgba(255,255,255,0.84)",
    fontWeight: "800",
    lineHeight: 22,
  },
  heroStats: {
    gap: 8,
  },
  heroStat: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 76,
    alignItems: "center",
  },
  heroStatNumber: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 22,
  },
  heroStatLabel: {
    color: "rgba(255,255,255,0.74)",
    fontWeight: "900",
    fontSize: 10,
    marginTop: 2,
  },
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...softShadow,
  },
  filterRow: {
    flexDirection: "row",
    backgroundColor: colors.softSurface2,
    borderRadius: 999,
    padding: 5,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: "center",
  },
  filterButtonActive: {
    backgroundColor: colors.violet,
  },
  filterText: {
    color: colors.muted,
    fontWeight: "900",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  markAllButton: {
    flex: 1,
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    ...shadow,
    shadowOpacity: 0.08,
  },
  markAllText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  backHomeButton: {
    flex: 1,
    backgroundColor: colors.softSurface2,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  backHomeText: {
    color: colors.text,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  sectionLink: {
    color: colors.violet,
    fontWeight: "900",
  },
  listStack: {
    gap: 12,
  },
  inviteCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...softShadow,
  },
  inviteTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  inviteBody: {
    color: colors.text2,
    fontWeight: "800",
    marginTop: 3,
  },
  inviteDescription: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 5,
    lineHeight: 19,
  },
  inviteActions: {
    gap: 7,
  },
  acceptButton: {
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  acceptText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },
  declineButton: {
    backgroundColor: colors.redSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFD1D1",
  },
  declineText: {
    color: colors.red,
    fontWeight: "900",
    fontSize: 12,
  },
  notificationCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...softShadow,
  },
  unreadNotification: {
    borderColor: "#E6DFFF",
  },
  notificationMain: {
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  notificationIconText: {
    fontSize: 23,
  },
  notificationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.violet,
  },
  notificationBody: {
    color: colors.text2,
    lineHeight: 20,
    marginTop: 4,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 9,
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "900",
    borderWidth: 1,
    overflow: "hidden",
  },
  timeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  notificationActions: {
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 10,
    backgroundColor: colors.softSurface2,
    flexDirection: "row",
    gap: 8,
  },
  openButton: {
    flex: 1,
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  openText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },
  deleteButton: {
    width: 44,
    backgroundColor: colors.redSoft,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFD1D1",
  },
  deleteText: {
    color: colors.red,
    fontWeight: "900",
    fontSize: 16,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...softShadow,
  },
  emptyIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 6,
    fontWeight: "700",
  },
  loadingText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
  },
  bottomNav: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    height: 74,
    borderRadius: 30,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    ...shadow,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  navIcon: {
    fontSize: 18,
    opacity: 0.55,
  },
  navIconActive: {
    fontSize: 20,
  },
  navText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  navTextActive: {
    color: colors.violet,
    fontSize: 10,
    fontWeight: "900",
  },
  navCenter: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    ...shadow,
  },
  navCenterText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "600",
    marginTop: -3,
  },
});