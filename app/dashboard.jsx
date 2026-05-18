import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "../components/AppButton";
import BottomNav from "../components/BottomNav";
import GroupAvatar from "../components/GroupAvatar";
import ProfileAvatar from "../components/ProfileAvatar";
import { colors, shadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function displayName(profile) {
  if (!profile) return "Friend";
  return profile.display_name || profile.username || profile.email || "Friend";
}

function firstName(profile) {
  return displayName(profile).split(" ")[0] || "Friend";
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatRelativeTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 30) return "now";
  if (diffMinutes < 1) return `${diffSeconds}s`;
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatEventDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const sameDay = toDateKey(date) === todayKey();

  const day = sameDay
    ? "Today"
    : date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${day} • ${time}`;
}

function summarizeMessage(message) {
  if (!message) return "Quiet so far.";

  if (message.deleted_at) return "Message deleted";
  if (message.message_type === "image") return "Shared a picture";
  if (message.message_type === "gif") return "Shared a GIF";
  if (message.message_type === "system") return message.content || "System update";

  const text = String(message.content || "").trim();

  if (!text) return "No message text";
  if (text.startsWith("https://www.google.com/maps")) return "Shared a location";
  if (text.startsWith("https://")) return "Shared a link";

  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function isRecentlyOnline(value) {
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  return Date.now() - date.getTime() < 5 * 60 * 1000;
}

export default function Dashboard() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [messagesByGroup, setMessagesByGroup] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const unreadCount = notifications.filter((item) => !item.read).length;

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      const aMessage = messagesByGroup[a.id];
      const bMessage = messagesByGroup[b.id];

      const aTime = aMessage?.created_at
        ? new Date(aMessage.created_at).getTime()
        : new Date(a.created_at || 0).getTime();

      const bTime = bMessage?.created_at
        ? new Date(bMessage.created_at).getTime()
        : new Date(b.created_at || 0).getTime();

      return bTime - aTime;
    });
  }, [groups, messagesByGroup]);

  const recentGroups = sortedGroups.slice(0, 4);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();

    return [...events]
      .filter((event) => {
        const start = new Date(event.starts_at).getTime();
        return !Number.isNaN(start) && start >= now - 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 3);
  }, [events]);

  const openTasks = tasks.filter((task) => !task.completed);
  const onlineCount = availability.filter((item) => item.online).length;
  const primaryInvite = invites[0] || null;

  async function updateLastSeen() {
    if (!user?.id) return;

    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  async function loadProfile() {
    if (!user?.id) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        username,
        display_name,
        email,
        avatar_url,
        bio,
        profile_completed,
        availability_note,
        last_seen_at,
        show_online_status,
        push_notifications,
        default_safety_group_id
      `
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      Alert.alert("Could not load profile", error.message);
      return null;
    }

    setProfile(data);

    if (data && data.profile_completed === false) {
      router.replace("/profile-setup");
    }

    return data;
  }

  async function loadGroups() {
    if (!user?.id) return [];

    const { data, error } = await supabase
      .from("group_members")
      .select(
        `
        id,
        group_id,
        role,
        status,
        muted,
        pinned,
        groups (
          id,
          name,
          description,
          created_by,
          avatar_color,
          avatar_emoji,
          avatar_url,
          chat_background,
          created_at
        )
      `
      )
      .eq("user_id", user.id)
      .eq("status", "accepted");

    if (error) {
      Alert.alert("Could not load groups", error.message);
      return [];
    }

    const cleanGroups =
      data
        ?.map((row) => ({
          ...(row.groups || {}),
          membership_id: row.id,
          role: row.role,
          muted: row.muted === true,
          pinned: row.pinned === true,
        }))
        .filter((group) => group?.id) || [];

    setGroups(cleanGroups);

    return cleanGroups;
  }

  async function loadInvites() {
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
      Alert.alert("Could not load invites", error.message);
      return;
    }

    setInvites(data || []);
  }

  async function loadRecentMessages(groupList) {
    const groupIds = groupList.map((group) => group.id);

    if (groupIds.length === 0) {
      setMessagesByGroup({});
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select(
        `
        id,
        group_id,
        sender_id,
        content,
        message_type,
        media_url,
        media_mime,
        deleted_at,
        created_at,
        profiles:sender_id (
          id,
          username,
          display_name,
          email,
          avatar_url
        )
      `
      )
      .in("group_id", groupIds)
      .order("created_at", { ascending: false })
      .limit(140);

    if (error) {
      console.log("Could not load recent messages:", error.message);
      setMessagesByGroup({});
      return;
    }

    const map = {};

    for (const message of data || []) {
      if (!map[message.group_id]) {
        map[message.group_id] = message;
      }
    }

    setMessagesByGroup(map);
  }

  async function loadNotifications() {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, read, link, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.log("Could not load notifications:", error.message);
      setNotifications([]);
      return;
    }

    setNotifications(data || []);
  }

  async function loadPlannerPreview(groupList) {
    if (!user?.id) return;

    const groupIds = groupList.map((group) => group.id);

    const eventQuery = supabase
      .from("planner_events")
      .select(
        `
        id,
        creator_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        start_time,
        end_time,
        is_all_day,
        color,
        created_at
      `
      )
      .gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(12);

    const taskQuery = supabase
      .from("planner_tasks")
      .select(
        `
        id,
        creator_id,
        group_id,
        title,
        due_at,
        due_time,
        completed,
        color,
        created_at
      `
      )
      .order("due_at", { ascending: true })
      .limit(12);

    const [
      { data: eventRows, error: eventError },
      { data: taskRows, error: taskError },
    ] = await Promise.all([eventQuery, taskQuery]);

    if (eventError) {
      console.log("Could not load events:", eventError.message);
      setEvents([]);
    } else {
      const visibleEvents =
        eventRows?.filter(
          (event) => !event.group_id || groupIds.includes(event.group_id)
        ) || [];

      setEvents(visibleEvents);
    }

    if (taskError) {
      console.log("Could not load tasks:", taskError.message);
      setTasks([]);
    } else {
      const visibleTasks =
        taskRows?.filter(
          (task) =>
            task.creator_id === user.id ||
            !task.group_id ||
            groupIds.includes(task.group_id)
        ) || [];

      setTasks(visibleTasks);
    }
  }

  async function loadAvailability(groupList) {
    const groupIds = groupList.map((group) => group.id);

    if (groupIds.length === 0) {
      setAvailability([]);
      return;
    }

    const today = todayKey();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = toDateKey(tomorrowDate);

    const { data: memberRows } = await supabase
      .from("group_members")
      .select(
        `
        id,
        group_id,
        user_id,
        status,
        profiles:user_id (
          id,
          username,
          display_name,
          email,
          avatar_url,
          availability_note,
          last_seen_at,
          show_online_status
        )
      `
      )
      .in("group_id", groupIds)
      .eq("status", "accepted");

    const { data: taskRows } = await supabase
      .from("planner_tasks")
      .select("id, creator_id, group_id, title, due_at, completed")
      .in("group_id", groupIds)
      .gte("due_at", `${today}T00:00:00`)
      .lt("due_at", `${tomorrow}T00:00:00`);

    const { data: eventRows } = await supabase
      .from("planner_events")
      .select("id, creator_id, group_id, title, starts_at, ends_at")
      .in("group_id", groupIds)
      .gte("starts_at", `${today}T00:00:00`)
      .lt("starts_at", `${tomorrow}T00:00:00`);

    const summary =
      (memberRows || [])
        .filter((row) => row.user_id !== user?.id)
        .slice(0, 8)
        .map((row) => {
          const memberTasks = (taskRows || []).filter(
            (task) => task.creator_id === row.user_id && !task.completed
          );

          const memberEvents = (eventRows || []).filter(
            (event) => event.creator_id === row.user_id
          );

          const busyCount = memberTasks.length + memberEvents.length;
          const showOnline = row.profiles?.show_online_status !== false;
          const online = showOnline && isRecentlyOnline(row.profiles?.last_seen_at);

          return {
            id: `${row.group_id}-${row.user_id}`,
            group_id: row.group_id,
            user_id: row.user_id,
            profile: row.profiles,
            online,
            busyCount,
            group: groupList.find((group) => group.id === row.group_id),
          };
        }) || [];

    setAvailability(summary);
  }

  async function loadDashboard() {
    if (!user?.id) return;

    setLoading(true);

    await updateLastSeen();

    await loadProfile();
    const loadedGroups = await loadGroups();

    await Promise.all([
      loadInvites(),
      loadRecentMessages(loadedGroups),
      loadNotifications(),
      loadPlannerPreview(loadedGroups),
      loadAvailability(loadedGroups),
    ]);

    setLoading(false);
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

  async function acceptInvite(invite) {
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

    await loadDashboard();
    router.push(`/group/${invite.group_id}`);
  }

  async function declineInvite(invite) {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("id", invite.id)
      .eq("user_id", user.id);

    if (error) {
      Alert.alert("Could not decline invite", error.message);
      return;
    }

    await loadDashboard();
  }

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={styles.phoneCard}>
          <View style={styles.phoneGlow} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.name}>{firstName(profile)}</Text>
            </View>

            <Pressable
              onPress={() => router.push("/notifications")}
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>□</Text>

              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={() => router.push("/settings")}>
              <ProfileAvatar profile={profile} size={52} showOnline online ring />
            </Pressable>
          </View>

          <View style={styles.statusGrid}>
            <View style={styles.statusCard}>
              <Text style={styles.statusNumber}>{groups.length}</Text>
              <Text style={styles.statusLabel}>Groups</Text>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusNumber}>{upcomingEvents.length}</Text>
              <Text style={styles.statusLabel}>Events</Text>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusNumber}>{openTasks.length}</Text>
              <Text style={styles.statusLabel}>Tasks</Text>
            </View>
          </View>

          {primaryInvite ? (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteKicker}>INVITE WAITING</Text>

              <View style={styles.inviteContent}>
                <GroupAvatar
                  name={primaryInvite.groups?.name}
                  color={primaryInvite.groups?.avatar_color || colors.orange}
                  emoji={primaryInvite.groups?.avatar_emoji || "WC"}
                  avatarUrl={primaryInvite.groups?.avatar_url}
                  size={56}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteTitle}>
                    {primaryInvite.groups?.name || "Group invite"}
                  </Text>

                  <Text style={styles.inviteBody}>
                    Invited by @{primaryInvite.profiles?.username || "someone"}
                  </Text>
                </View>

                <Pressable
                  onPress={() => acceptInvite(primaryInvite)}
                  style={styles.yesButton}
                >
                  <Text style={styles.yesText}>Yes</Text>
                </Pressable>

                <Pressable
                  onPress={() => declineInvite(primaryInvite)}
                  style={styles.noButton}
                >
                  <Text style={styles.noText}>No</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() =>
                upcomingEvents[0]?.group_id
                  ? router.push(`/group/${upcomingEvents[0].group_id}`)
                  : router.push("/planner")
              }
              style={styles.nextCard}
            >
              <Text style={styles.inviteKicker}>
                {upcomingEvents.length > 0 ? "NEXT PLAN" : "NO PLAN YET"}
              </Text>

              <View style={styles.nextRow}>
                <View style={styles.nextIconBox}>
                  <Text style={styles.nextIcon}>
                    {upcomingEvents.length > 0 ? "□" : "＋"}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteTitle}>
                    {upcomingEvents.length > 0
                      ? upcomingEvents[0].title
                      : "Create the next hangout"}
                  </Text>

                  <Text style={styles.inviteBody}>
                    {upcomingEvents.length > 0
                      ? formatEventDate(upcomingEvents[0].starts_at)
                      : "Use the + button to create a task or group."}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RECENT CHATS</Text>

            <Pressable onPress={() => router.push("/groups")}>
              <Text style={styles.viewAll}>View all</Text>
            </Pressable>
          </View>

          {recentGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No rooms yet</Text>
              <Text style={styles.emptyText}>
                Use the + button to create a group, or accept an invite.
              </Text>

              <AppButton
                title="Go to Groups"
                onPress={() => router.push("/groups")}
                variant="soft"
              />
            </View>
          ) : (
            <View style={styles.chatList}>
              {recentGroups.map((group) => {
                const latest = messagesByGroup[group.id];

                return (
                  <Pressable
                    key={group.id}
                    onPress={() => router.push(`/group/${group.id}`)}
                    style={styles.chatRow}
                  >
                    <GroupAvatar
                      name={group.name}
                      color={group.avatar_color}
                      emoji={group.avatar_emoji}
                      avatarUrl={group.avatar_url}
                      size={56}
                    />

                    <View style={{ flex: 1 }}>
                      <View style={styles.chatTitleRow}>
                        <Text style={styles.chatName}>{group.name}</Text>

                        {group.pinned && <Text style={styles.miniPill}>Pinned</Text>}
                        {group.muted && <Text style={styles.miniPill}>Muted</Text>}
                      </View>

                      <Text numberOfLines={1} style={styles.chatPreview}>
                        {latest?.profiles ? `${displayName(latest.profiles)}: ` : ""}
                        {summarizeMessage(latest)}
                      </Text>
                    </View>

                    <View style={styles.chatRight}>
                      <Text style={styles.chatTime}>
                        {latest ? formatRelativeTime(latest.created_at) : ""}
                      </Text>

                      {latest && <View style={styles.activeDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TODAY</Text>

            <Pressable onPress={() => router.push("/planner")}>
              <Text style={styles.viewAll}>Plans</Text>
            </Pressable>
          </View>

          <View style={styles.todayGrid}>
            <View style={styles.todayCard}>
              <Text style={styles.todayNumber}>{onlineCount}</Text>
              <Text style={styles.todayLabel}>friends online</Text>
            </View>

            <View style={styles.todayCard}>
              <Text style={styles.todayNumber}>{unreadCount}</Text>
              <Text style={styles.todayLabel}>unread alerts</Text>
            </View>
          </View>

          {loading && <Text style={styles.loadingText}>Refreshing...</Text>}
        </View>
      </ScrollView>

      <BottomNav active="home" />
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
    paddingBottom: 112,
  },
  phoneCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 34,
    padding: 18,
    gap: 18,
    overflow: "hidden",
    ...shadow,
  },
  phoneGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.10)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  greeting: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 13,
  },
  name: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 30,
    letterSpacing: -0.8,
    marginTop: 1,
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconButtonText: {
    color: colors.violet,
    fontSize: 22,
    fontWeight: "900",
  },
  badge: {
    position: "absolute",
    right: -7,
    top: -8,
    minWidth: 25,
    height: 25,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.bg2,
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  statusGrid: {
    flexDirection: "row",
    gap: 11,
  },
  statusCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  statusNumber: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 28,
  },
  statusLabel: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 12,
  },
  inviteCard: {
    borderWidth: 1,
    borderColor: colors.violet,
    backgroundColor: "rgba(124,92,255,0.08)",
    borderRadius: 24,
    padding: 16,
    gap: 13,
  },
  nextCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 16,
    gap: 13,
  },
  inviteKicker: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.1,
  },
  inviteContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inviteTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18,
  },
  inviteBody: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 3,
  },
  yesButton: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  yesText: {
    color: colors.bg,
    fontWeight: "900",
    fontSize: 12,
  },
  noButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  noText: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 12,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nextIconBox: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  nextIcon: {
    color: colors.violet,
    fontSize: 24,
    fontWeight: "900",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  viewAll: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 13,
  },
  chatList: {
    backgroundColor: colors.card,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(53,80,112,0.65)",
  },
  chatRow: {
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(53,80,112,0.38)",
  },
  chatTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  chatName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  miniPill: {
    color: colors.violet,
    backgroundColor: colors.violetSoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.45)",
  },
  chatPreview: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 19,
  },
  chatRight: {
    alignItems: "flex-end",
    gap: 9,
  },
  chatTime: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 12,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  emptyState: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18,
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "700",
    lineHeight: 20,
  },
  todayGrid: {
    flexDirection: "row",
    gap: 12,
  },
  todayCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 15,
    alignItems: "center",
  },
  todayNumber: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 28,
  },
  todayLabel: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 3,
  },
  loadingText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
  },
});