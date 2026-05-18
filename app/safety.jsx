import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
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
  if (diffMinutes < 1) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function locationUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export default function Safety() {
  const { user } = useAuth();

  const countdownTimerRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [note, setNote] = useState("");

  const [logs, setLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [countdownActive, setCountdownActive] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [lastLocation, setLastLocation] = useState(null);
  const [notice, setNotice] = useState("");

  const selectedGroup = useMemo(() => {
    return groups.find((group) => group.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

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
        default_safety_group_id,
        availability_note,
        show_online_status
      `
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      Alert.alert("Could not load profile", error.message);
      return null;
    }

    setProfile(data);

    return data;
  }

  async function loadGroups(profileRow) {
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
        .filter((group) => group?.id)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return String(a.name || "").localeCompare(String(b.name || ""));
        }) || [];

    setGroups(cleanGroups);

    const defaultGroupId = profileRow?.default_safety_group_id;

    if (
      defaultGroupId &&
      cleanGroups.some((group) => group.id === defaultGroupId)
    ) {
      setSelectedGroupId(defaultGroupId);
    } else if (!selectedGroupId && cleanGroups.length > 0) {
      setSelectedGroupId(cleanGroups[0].id);
    }

    return cleanGroups;
  }

  async function loadLogs(groupRows) {
    if (!user?.id) return;

    const groupIds = groupRows.map((group) => group.id);

    let query = supabase
      .from("safety_logs")
      .select(
        `
        id,
        user_id,
        group_id,
        latitude,
        longitude,
        accuracy,
        maps_url,
        status,
        created_at
      `
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (groupIds.length > 0) {
      query = query.or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(",")})`);
    } else {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.log("Could not load safety logs:", error.message);
      setLogs([]);
      return;
    }

    setLogs(data || []);
  }

  async function loadAll() {
    if (!user?.id) {
      router.replace("/login");
      return;
    }

    setLoading(true);

    await updateLastSeen();

    const profileRow = await loadProfile();
    const groupRows = await loadGroups(profileRow);

    await loadLogs(groupRows);

    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadAll();

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      };
    }, [user?.id])
  );

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      throw new Error(
        "Location permission is required to send your location to your group."
      );
    }

    const currentLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return currentLocation;
  }

  async function notifyGroupMembers(groupId, title, body) {
    if (!groupId) return;

    const { error } = await supabase.rpc("notify_group_members", {
      input_group_id: groupId,
      input_title: title,
      input_body: body,
      input_link: `/group/${groupId}`,
    });

    if (error) {
      console.log("Notification RPC failed:", error.message);
    }
  }

  async function sendSafetyAlert() {
    if (!user?.id) return;

    if (!selectedGroupId) {
      Alert.alert("Choose a group", "Pick the group you want to alert first.");
      return;
    }

    setSendingAlert(true);
    setNotice("");

    try {
      const currentLocation = await requestLocation();

      const latitude = currentLocation.coords.latitude;
      const longitude = currentLocation.coords.longitude;
      const accuracy = currentLocation.coords.accuracy;
      const mapsUrl = locationUrl(latitude, longitude);

      setLastLocation({
        latitude,
        longitude,
        accuracy,
        mapsUrl,
      });

      const cleanNote = note.trim();

      const { data: insertedLog, error: logError } = await supabase
        .from("safety_logs")
        .insert({
          user_id: user.id,
          group_id: selectedGroupId,
          latitude,
          longitude,
          accuracy,
          maps_url: mapsUrl,
          status: "sent",
        })
        .select(
          `
          id,
          user_id,
          group_id,
          latitude,
          longitude,
          accuracy,
          maps_url,
          status,
          created_at
        `
        )
        .single();

      if (logError) throw logError;

      const senderName = displayName(profile);

      const alertMessage = [
        `🚨 SAFETY ALERT from ${senderName}`,
        cleanNote ? `Note: ${cleanNote}` : null,
        `Location: ${mapsUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      const { error: messageError } = await supabase.from("messages").insert({
        group_id: selectedGroupId,
        sender_id: user.id,
        content: alertMessage,
        message_type: "system",
      });

      if (messageError) throw messageError;

      await notifyGroupMembers(
        selectedGroupId,
        "Safety alert",
        `${senderName} sent a safety alert in ${selectedGroup?.name || "your group"}.`
      );

      setLogs((prev) => [insertedLog, ...prev]);
      setNote("");
      setNotice("Safety alert sent.");
      setCountdownActive(false);
      setCountdown(30);

      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      Alert.alert(
        "Alert sent",
        `Your location was shared with ${selectedGroup?.name || "your group"}.`
      );
    } catch (err) {
      Alert.alert("Could not send alert", err.message);
    } finally {
      setSendingAlert(false);
    }
  }

  function startCountdown() {
    if (!selectedGroupId) {
      Alert.alert("Choose a group", "Pick the group you want to alert first.");
      return;
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setCountdown(30);
    setCountdownActive(true);
    setNotice("");

    countdownTimerRef.current = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          sendSafetyAlert();
          return 0;
        }

        return value - 1;
      });
    }, 1000);
  }

  function cancelCountdown() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setCountdownActive(false);
    setCountdown(30);
    setNotice("Safety alert canceled.");
  }

  function confirmSendNow() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Send safety alert now?");

      if (confirmed) sendSafetyAlert();

      return;
    }

    Alert.alert(
      "Send safety alert now?",
      "Your location will be shared with the selected group.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send Now", style: "destructive", onPress: sendSafetyAlert },
      ]
    );
  }

  function renderGroupSelector() {
    if (groups.length === 0) {
      return (
        <View style={styles.emptyGroupBox}>
          <Text style={styles.emptyGroupTitle}>No groups yet</Text>
          <Text style={styles.emptyGroupText}>
            Create a group first so there is someone to alert.
          </Text>

          <AppButton
            title="Create Group"
            onPress={() => router.push("/create-group")}
            variant="soft"
          />
        </View>
      );
    }

    return (
      <View style={styles.groupList}>
        {groups.map((group) => {
          const selected = selectedGroupId === group.id;

          return (
            <Pressable
              key={group.id}
              onPress={() => setSelectedGroupId(group.id)}
              style={[styles.groupOption, selected && styles.groupOptionActive]}
            >
              <GroupAvatar
                name={group.name}
                color={group.avatar_color}
                emoji={group.avatar_emoji}
                avatarUrl={group.avatar_url}
                size={44}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupSub}>
                  {selected ? "Selected safety group" : "Tap to select"}
                </Text>
              </View>

              {selected && (
                <View style={styles.checkCircle}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Safety</Text>
            <Text style={styles.title}>Hold to alert</Text>
            <Text style={styles.subtitle}>Share your location with a trusted group.</Text>
          </View>

          <Pressable onPress={() => router.push("/settings")}>
            <ProfileAvatar profile={profile} size={52} showOnline online ring />
          </Pressable>
        </View>

        {!!notice && (
          <Pressable onPress={() => setNotice("")} style={styles.notice}>
            <Text style={styles.noticeText}>✅ {notice}</Text>
          </Pressable>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <View style={styles.ringOuter}>
            <View style={styles.ringMiddle}>
              <View style={styles.ringInner}>
                <Text style={styles.alertIcon}>!</Text>
              </View>
            </View>
          </View>

          <Text style={styles.heroTitle}>
            {countdownActive ? `${countdown}s` : "Emergency Alert"}
          </Text>

          <Text style={styles.heroText}>
            {countdownActive
              ? "Cancel if this was accidental. The alert sends automatically when the timer ends."
              : "Start a countdown or send immediately. Your group will receive your location."}
          </Text>

          {selectedGroup ? (
            <View style={styles.selectedGroupPill}>
              <GroupAvatar
                name={selectedGroup.name}
                color={selectedGroup.avatar_color}
                emoji={selectedGroup.avatar_emoji}
                avatarUrl={selectedGroup.avatar_url}
                size={28}
              />
              <Text style={styles.selectedGroupText}>{selectedGroup.name}</Text>
            </View>
          ) : (
            <Text style={styles.noGroupText}>Choose a safety group below.</Text>
          )}
        </View>

        <View style={styles.actionCard}>
          {countdownActive ? (
            <>
              <AppButton
                title="Cancel Alert"
                onPress={cancelCountdown}
                variant="danger"
              />

              <AppButton
                title={sendingAlert ? "Sending..." : "Send Now"}
                onPress={confirmSendNow}
                disabled={sendingAlert}
                variant="secondary"
              />
            </>
          ) : (
            <>
              <AppButton
                title="Start 30 Second Countdown"
                onPress={startCountdown}
                disabled={sendingAlert || groups.length === 0}
                variant="danger"
              />

              <AppButton
                title={sendingAlert ? "Sending..." : "Send Immediately"}
                onPress={confirmSendNow}
                disabled={sendingAlert || groups.length === 0}
                variant="secondary"
              />
            </>
          )}

          <AppInput
            label="Optional note"
            placeholder="Example: I feel unsafe near..."
            value={note}
            onChangeText={setNote}
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Safety group</Text>
          {renderGroupSelector()}
        </View>

        {!!lastLocation?.mapsUrl && (
          <Pressable
            onPress={() => Linking.openURL(lastLocation.mapsUrl)}
            style={styles.locationCard}
          >
            <Text style={styles.locationTitle}>Last shared location</Text>
            <Text style={styles.locationText}>{lastLocation.mapsUrl}</Text>
            <Text style={styles.locationHint}>Tap to open in Maps</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent safety logs</Text>
            <Text style={styles.sectionCount}>{logs.length}</Text>
          </View>

          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No safety alerts have been sent yet.</Text>
          ) : (
            <View style={styles.logList}>
              {logs.map((log) => {
                const group = groups.find((item) => item.id === log.group_id);

                return (
                  <Pressable
                    key={log.id}
                    onPress={() => log.maps_url && Linking.openURL(log.maps_url)}
                    style={styles.logRow}
                  >
                    <View style={styles.logIcon}>
                      <Text style={styles.logIconText}>!</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.logTitle}>
                        Sent to {group?.name || "group"}
                      </Text>

                      <Text style={styles.logMeta}>
                        {formatRelativeTime(log.created_at)}
                        {log.accuracy ? ` • ±${Math.round(log.accuracy)}m` : ""}
                      </Text>
                    </View>

                    <Text style={styles.arrow}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {loading && <Text style={styles.loadingText}>Refreshing...</Text>}
      </ScrollView>

      <BottomNav active="safety" />
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
  notice: {
    backgroundColor: colors.greenSoft,
    borderColor: "rgba(45,212,191,0.45)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
  },
  noticeText: {
    color: colors.text,
    fontWeight: "900",
  },
  heroCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.45)",
    borderRadius: 34,
    padding: 22,
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
    ...shadow,
  },
  heroGlow: {
    position: "absolute",
    top: -130,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: "rgba(251,113,133,0.14)",
  },
  ringOuter: {
    width: 138,
    height: 138,
    borderRadius: 999,
    backgroundColor: "rgba(251,113,133,0.10)",
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringMiddle: {
    width: 104,
    height: 104,
    borderRadius: 999,
    backgroundColor: "rgba(251,113,133,0.16)",
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: 74,
    height: 74,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  alertIcon: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "900",
  },
  heroTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 28,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  heroText: {
    color: colors.text2,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 21,
  },
  selectedGroupPill: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedGroupText: {
    color: colors.text,
    fontWeight: "900",
  },
  noGroupText: {
    color: colors.red,
    fontWeight: "900",
  },
  actionCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 16,
    gap: 12,
    ...softShadow,
  },
  card: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 16,
    gap: 13,
    ...softShadow,
  },
  sectionTitle: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  groupList: {
    gap: 10,
  },
  groupOption: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  groupOptionActive: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  groupName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  groupSub: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: colors.text,
    fontWeight: "900",
  },
  emptyGroupBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 14,
    gap: 10,
  },
  emptyGroupTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18,
  },
  emptyGroupText: {
    color: colors.text2,
    fontWeight: "700",
    lineHeight: 20,
  },
  locationCard: {
    backgroundColor: colors.redSoft,
    borderColor: "rgba(251,113,133,0.45)",
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 5,
  },
  locationTitle: {
    color: colors.red,
    fontWeight: "900",
    fontSize: 16,
  },
  locationText: {
    color: colors.text,
    fontWeight: "700",
    lineHeight: 20,
  },
  locationHint: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 12,
    marginTop: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionCount: {
    color: colors.violet,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "800",
    textAlign: "center",
    paddingVertical: 16,
  },
  logList: {
    gap: 10,
  },
  logRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  logIconText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
  },
  logTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
  },
  logMeta: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 3,
  },
  arrow: {
    color: colors.violet,
    fontSize: 28,
    fontWeight: "900",
  },
  loadingText: {
    color: colors.muted,
    textAlign: "center",
    fontWeight: "800",
  },
});