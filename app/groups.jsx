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

function summarizeMessage(message) {
  if (!message) return "No messages yet.";

  if (message.deleted_at) return "Message deleted";
  if (message.message_type === "image") return "Shared a picture";
  if (message.message_type === "gif") return "Shared a GIF";
  if (message.message_type === "system") return message.content || "System update";

  const text = String(message.content || "").trim();

  if (!text) return "No message text";
  if (text.startsWith("https://www.google.com/maps")) return "Shared a location";
  if (text.startsWith("https://")) return "Shared a link";

  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

export default function Groups() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [messagesByGroup, setMessagesByGroup] = useState({});
  const [memberCounts, setMemberCounts] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const aMsg = messagesByGroup[a.id];
      const bMsg = messagesByGroup[b.id];

      const aReceived = aMsg?.latestReceivedAt
        ? new Date(aMsg.latestReceivedAt).getTime()
        : 0;

      const bReceived = bMsg?.latestReceivedAt
        ? new Date(bMsg.latestReceivedAt).getTime()
        : 0;

      if (aReceived || bReceived) {
        return bReceived - aReceived;
      }

      const aMine = aMsg?.latestMineAt
        ? new Date(aMsg.latestMineAt).getTime()
        : 0;

      const bMine = bMsg?.latestMineAt
        ? new Date(bMsg.latestMineAt).getTime()
        : 0;

      if (aMine || bMine) {
        return bMine - aMine;
      }

      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;

      return bCreated - aCreated;
    });
  }, [groups, messagesByGroup]);

  const topGroup = sortedGroups[0] || null;

  const otherGroups = topGroup
    ? sortedGroups.filter((group) => group.id !== topGroup.id)
    : [];

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
      .select("id, username, display_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(data);
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

  async function loadMessages(groupRows) {
    const groupIds = groupRows.map((group) => group.id);

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
      .limit(250);

    if (error) {
      console.log("Could not load group messages:", error.message);
      setMessagesByGroup({});
      return;
    }

    const map = {};

    for (const message of data || []) {
      if (!map[message.group_id]) {
        map[message.group_id] = {
          latest: message,
          latestReceived: null,
          latestReceivedAt: null,
          latestMine: null,
          latestMineAt: null,
        };
      }

      const groupInfo = map[message.group_id];

      if (!groupInfo.latest) {
        groupInfo.latest = message;
      }

      if (message.sender_id !== user.id && !groupInfo.latestReceived) {
        groupInfo.latestReceived = message;
        groupInfo.latestReceivedAt = message.created_at;
      }

      if (message.sender_id === user.id && !groupInfo.latestMine) {
        groupInfo.latestMine = message;
        groupInfo.latestMineAt = message.created_at;
      }
    }

    setMessagesByGroup(map);
  }

  async function loadMemberCounts(groupRows) {
    const groupIds = groupRows.map((group) => group.id);

    if (groupIds.length === 0) {
      setMemberCounts({});
      return;
    }

    const { data, error } = await supabase
      .from("group_members")
      .select("id, group_id, status")
      .in("group_id", groupIds)
      .eq("status", "accepted");

    if (error) {
      console.log("Could not load member counts:", error.message);
      setMemberCounts({});
      return;
    }

    const counts = {};

    for (const row of data || []) {
      counts[row.group_id] = (counts[row.group_id] || 0) + 1;
    }

    setMemberCounts(counts);
  }

  async function loadAll() {
    if (!user?.id) {
      router.replace("/login");
      return;
    }

    setLoading(true);

    await updateLastSeen();
    await loadProfile();

    const groupRows = await loadGroups();

    await Promise.all([loadMessages(groupRows), loadMemberCounts(groupRows)]);

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

  function renderGroupCard(group, featured = false) {
    if (!group) return null;

    const messageInfo = messagesByGroup[group.id];
    const latest = messageInfo?.latest || null;
    const count = memberCounts[group.id] || 1;

    return (
      <Pressable
        key={group.id}
        onPress={() => router.push(`/group/${group.id}`)}
        style={[styles.groupCard, featured && styles.featuredCard]}
      >
        <GroupAvatar
          name={group.name}
          color={group.avatar_color}
          emoji={group.avatar_emoji}
          avatarUrl={group.avatar_url}
          size={featured ? 68 : 56}
        />

        <View style={{ flex: 1 }}>
          <View style={styles.groupTitleRow}>
            <Text style={[styles.groupName, featured && styles.featuredName]}>
              {group.name}
            </Text>

            {group.pinned && <Text style={styles.smallPill}>Pinned</Text>}
            {group.muted && <Text style={styles.smallPill}>Muted</Text>}
          </View>

          {!!group.description && featured && (
            <Text numberOfLines={2} style={styles.groupDescription}>
              {group.description}
            </Text>
          )}

          <Text numberOfLines={1} style={styles.previewText}>
            {latest?.profiles ? `${displayName(latest.profiles)}: ` : ""}
            {summarizeMessage(latest)}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {count} member{count === 1 ? "" : "s"}
            </Text>

            <Text style={styles.metaDot}>•</Text>

            <Text style={styles.metaText}>
              {latest ? formatRelativeTime(latest.created_at) : "new room"}
            </Text>
          </View>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>
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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Groups</Text>
            <Text style={styles.title}>Your rooms</Text>
            <Text style={styles.subtitle}>Only the groups you are in.</Text>
          </View>

          <Pressable onPress={() => router.push("/settings")}>
            <ProfileAvatar profile={profile} size={52} showOnline online ring />
          </Pressable>
        </View>

        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>♙</Text>
            </View>

            <Text style={styles.emptyTitle}>No groups yet</Text>

            <Text style={styles.emptyText}>
              Start a group with the middle + button, or wait for someone to invite you.
            </Text>

            <AppButton
              title="Create Group"
              onPress={() => router.push("/create-group")}
              variant="soft"
            />
          </View>
        ) : (
          <>
            <View style={styles.featureSection}>
              <Text style={styles.sectionTitle}>TOP GROUP</Text>
              {renderGroupCard(topGroup, true)}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ALL GROUPS</Text>
              <Text style={styles.sectionCount}>{groups.length}</Text>
            </View>

            <View style={styles.list}>
              {otherGroups.length === 0 ? (
                <Text style={styles.onlyGroupText}>
                  This is your only group right now.
                </Text>
              ) : (
                otherGroups.map((group) => renderGroupCard(group))
              )}
            </View>
          </>
        )}

        {loading && <Text style={styles.loadingText}>Refreshing...</Text>}
      </ScrollView>

      <BottomNav active="groups" />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kicker: {
    color: colors.gold,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 32,
    padding: 22,
    gap: 14,
    alignItems: "center",
    ...shadow,
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 28,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 34,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
    textAlign: "center",
  },
  emptyText: {
    color: colors.text2,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 21,
  },
  featureSection: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.8,
  },
  sectionCount: {
    color: colors.violet,
    fontWeight: "900",
  },
  list: {
    gap: 12,
  },
  groupCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    ...softShadow,
  },
  featuredCard: {
    borderRadius: 30,
    padding: 18,
    backgroundColor: colors.bg2,
    borderColor: colors.violet,
    ...shadow,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  groupName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  featuredName: {
    fontSize: 23,
    letterSpacing: -0.4,
  },
  groupDescription: {
    color: colors.text2,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 5,
  },
  previewText: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
  },
  metaText: {
    color: colors.text2,
    fontWeight: "900",
    fontSize: 12,
  },
  metaDot: {
    color: colors.muted,
    fontWeight: "900",
  },
  smallPill: {
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
  arrow: {
    color: colors.violet,
    fontSize: 30,
    fontWeight: "900",
  },
  onlyGroupText: {
    color: colors.muted,
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 16,
  },
  loadingText: {
    color: colors.muted,
    textAlign: "center",
    fontWeight: "800",
  },
});