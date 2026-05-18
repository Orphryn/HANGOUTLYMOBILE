import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    Image,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";

import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import GroupAvatar from "../components/GroupAvatar";
import ProfileAvatar from "../components/ProfileAvatar";
import { colors, shadow, softShadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function displayName(profile) {
  if (!profile) return "Friend";
  return profile.display_name || profile.username || profile.email || "Friend";
}

function formatRelativeTime(value) {
  if (!value) return "Never";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 30) return "now";
  if (minutes < 1) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getExtension(asset, fileBody) {
  const mime = asset?.mimeType || fileBody?.type || "";

  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("jpg")) return "jpg";

  const uri = asset?.uri || "";
  const fromUri = uri.split(".").pop()?.split("?")[0]?.toLowerCase();

  if (["gif", "png", "webp", "jpg", "jpeg"].includes(fromUri)) {
    return fromUri === "jpeg" ? "jpg" : fromUri;
  }

  return "jpg";
}

function safeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

export default function Settings() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);

  const [displayNameInput, setDisplayNameInput] = useState("");
  const [bio, setBio] = useState("");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [avatarAsset, setAvatarAsset] = useState(null);

  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [allowGroupInvites, setAllowGroupInvites] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [defaultSafetyGroupId, setDefaultSafetyGroupId] = useState("");

  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");

  const defaultSafetyGroup = useMemo(() => {
    return groups.find((group) => group.id === defaultSafetyGroupId) || null;
  }, [groups, defaultSafetyGroupId]);

  const profileStrength = useMemo(() => {
    let score = 0;

    if (displayNameInput.trim()) score += 25;
    if (bio.trim()) score += 20;
    if (availabilityNote.trim()) score += 15;
    if (avatarAsset?.uri || profile?.avatar_url) score += 25;
    if (defaultSafetyGroupId) score += 15;

    return Math.min(score, 100);
  }, [displayNameInput, bio, availabilityNote, avatarAsset?.uri, profile, defaultSafetyGroupId]);

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
        email,
        display_name,
        avatar_url,
        bio,
        availability_note,
        profile_completed,
        last_seen_at,
        show_online_status,
        allow_group_invites,
        push_notifications,
        default_safety_group_id,
        created_at,
        updated_at
      `
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      Alert.alert("Could not load profile", error.message);
      return null;
    }

    setProfile(data);

    setDisplayNameInput(data?.display_name || data?.username || "");
    setBio(data?.bio || "");
    setAvailabilityNote(data?.availability_note || "");

    setShowOnlineStatus(safeBoolean(data?.show_online_status, true));
    setAllowGroupInvites(safeBoolean(data?.allow_group_invites, true));
    setPushNotifications(safeBoolean(data?.push_notifications, true));
    setDefaultSafetyGroupId(data?.default_safety_group_id || "");

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
      console.log("Could not load settings groups:", error.message);
      setGroups([]);
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

    return cleanGroups;
  }

  async function loadAll() {
    if (!user?.id) return;

    await updateLastSeen();
    await Promise.all([loadProfile(), loadGroups()]);
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

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.95,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarAsset(result.assets[0]);
    }
  }

  async function uploadProfileAvatar() {
    if (!avatarAsset?.uri || !user?.id) return null;

    const response = await fetch(avatarAsset.uri);
    const fileBody = await response.blob();

    const extension = getExtension(avatarAsset, fileBody);

    const contentType =
      avatarAsset.mimeType ||
      fileBody.type ||
      (extension === "gif" ? "image/gif" : "image/jpeg");

    const path = `${user.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-avatars")
      .upload(path, fileBody, {
        contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new Error("Avatar uploaded, but Supabase did not return a public URL.");
    }

    return data.publicUrl;
  }

  async function saveSettings() {
    if (!user?.id) return;

    const cleanDisplayName = displayNameInput.trim();

    if (!cleanDisplayName) {
      return Alert.alert("Missing display name", "Your profile needs a display name.");
    }

    setSaving(true);
    setNotice("");

    try {
      const uploadedAvatarUrl = await uploadProfileAvatar();

      const updatePayload = {
        display_name: cleanDisplayName,
        bio: bio.trim() || null,
        availability_note: availabilityNote.trim() || null,
        show_online_status: showOnlineStatus,
        allow_group_invites: allowGroupInvites,
        push_notifications: pushNotifications,
        default_safety_group_id: defaultSafetyGroupId || null,
        profile_completed: true,
        updated_at: new Date().toISOString(),
      };

      if (uploadedAvatarUrl) {
        updatePayload.avatar_url = uploadedAvatarUrl;
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", user.id)
        .select(
          `
          id,
          username,
          email,
          display_name,
          avatar_url,
          bio,
          availability_note,
          profile_completed,
          last_seen_at,
          show_online_status,
          allow_group_invites,
          push_notifications,
          default_safety_group_id,
          created_at,
          updated_at
        `
        )
        .single();

      if (error) throw error;

      setProfile(data);
      setAvatarAsset(null);
      setNotice("Settings saved.");
    } catch (err) {
      Alert.alert("Could not save settings", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function deleteAccountNow() {
    const { error } = await supabase.rpc("delete_my_account");

    if (error) {
      Alert.alert("Could not delete account", error.message);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/");
  }

  async function confirmDeleteAccount() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Delete your account? This removes your profile, memberships, messages, plans, and account login."
      );

      if (confirmed) await deleteAccountNow();

      return;
    }

    Alert.alert(
      "Delete account?",
      "This removes your profile, memberships, messages, plans, and account login. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: deleteAccountNow,
        },
      ]
    );
  }

  function renderToggle({
    title,
    subtitle,
    value,
    onValueChange,
    icon,
    danger = false,
  }) {
    return (
      <View style={styles.toggleRow}>
        <View style={[styles.toggleIcon, danger && styles.toggleIconDanger]}>
          <Text style={styles.toggleIconText}>{icon}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>{title}</Text>
          <Text style={styles.toggleSub}>{subtitle}</Text>
        </View>

        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: colors.muted2,
            true: danger ? "#FCA5A5" : "#C4B5FD",
          }}
          thumbColor={value ? (danger ? colors.red : colors.violet) : "#FFFFFF"}
        />
      </View>
    );
  }

  function renderSafetyGroup(group) {
    const selected = group.id === defaultSafetyGroupId;

    return (
      <Pressable
        key={group.id}
        onPress={() => setDefaultSafetyGroupId(selected ? "" : group.id)}
        style={[styles.groupOption, selected && styles.groupOptionActive]}
      >
        <GroupAvatar
          name={group.name}
          color={group.avatar_color}
          emoji={group.avatar_emoji}
          avatarUrl={group.avatar_url}
          size={48}
        />

        <View style={{ flex: 1 }}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupSub}>
            {selected ? "Default safety group" : "Tap to make default"}
          </Text>
        </View>

        {selected && (
          <View style={styles.checkCircle}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
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
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.roundButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.logo}>Settings</Text>
            <Text style={styles.subHeader}>Profile, privacy, and safety defaults.</Text>
          </View>

          <Pressable onPress={() => router.push("/dashboard")} style={styles.roundButton}>
            <Text style={styles.roundButtonText}>⌂</Text>
          </Pressable>
        </View>

        {!!notice && (
          <Pressable onPress={() => setNotice("")} style={styles.notice}>
            <Text style={styles.noticeText}>✅ {notice}</Text>
          </Pressable>
        )}

        <View style={styles.profileHero}>
          <View style={styles.heroGlow} />

          <View style={styles.profileHeroTop}>
            <Pressable onPress={pickAvatar}>
              {avatarAsset?.uri ? (
                <Image source={{ uri: avatarAsset.uri }} style={styles.heroAvatar} />
              ) : (
                <ProfileAvatar profile={profile} size={86} showOnline online ring />
              )}
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>Profile</Text>
              <Text style={styles.heroName}>{displayName(profile)}</Text>
              <Text style={styles.heroUsername}>
                @{profile?.username || "username"}
              </Text>
            </View>
          </View>

          <Text style={styles.heroText}>
            {profile?.bio ||
              "Add a bio so people know who they are planning with."}
          </Text>

          <View style={styles.strengthBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strengthTitle}>Profile strength</Text>
              <Text style={styles.strengthSub}>{profileStrength}% complete</Text>
            </View>

            <View style={styles.strengthTrack}>
              <View
                style={[
                  styles.strengthFill,
                  {
                    width: `${profileStrength}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile picture</Text>

          <View style={styles.avatarPanel}>
            {avatarAsset?.uri ? (
              <Image source={{ uri: avatarAsset.uri }} style={styles.avatarPreview} />
            ) : (
              <ProfileAvatar profile={profile} size={68} showOnline online ring />
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Avatar or GIF</Text>
              <Text style={styles.muted}>
                This appears in chats, groups, invites, and your profile card.
              </Text>
            </View>

            <Pressable onPress={pickAvatar} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Upload</Text>
            </Pressable>
          </View>

          {avatarAsset?.uri && (
            <Pressable
              onPress={() => setAvatarAsset(null)}
              style={styles.removeButton}
            >
              <Text style={styles.removeButtonText}>Remove selected avatar</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Public profile</Text>

          <AppInput
            label="Display name"
            placeholder="David"
            value={displayNameInput}
            onChangeText={setDisplayNameInput}
          />

          <View style={styles.lockedRow}>
            <View style={styles.lockIcon}>
              <Text style={styles.lockIconText}>@</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.lockedLabel}>Username</Text>
              <Text style={styles.lockedValue}>
                @{profile?.username || "username locked"}
              </Text>
            </View>

            <Text style={styles.lockedPill}>Locked</Text>
          </View>

          <View style={styles.lockedRow}>
            <View style={styles.lockIcon}>
              <Text style={styles.lockIconText}>✉️</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.lockedLabel}>Email</Text>
              <Text style={styles.lockedValue}>
                {profile?.email || user?.email || "Email unavailable"}
              </Text>
            </View>

            <Text style={styles.lockedPill}>Auth</Text>
          </View>

          <AppInput
            label="Bio"
            placeholder="Short intro people see when they tap your avatar."
            value={bio}
            onChangeText={setBio}
            multiline
          />

          <AppInput
            label="Availability note"
            placeholder="Example: Usually free after 6pm."
            value={availabilityNote}
            onChangeText={setAvailabilityNote}
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Privacy</Text>

          {renderToggle({
            icon: "🟢",
            title: "Show online status",
            subtitle: "Friends can see when you are recently active.",
            value: showOnlineStatus,
            onValueChange: setShowOnlineStatus,
          })}

          {renderToggle({
            icon: "📩",
            title: "Allow group invites",
            subtitle: "People can invite you by username.",
            value: allowGroupInvites,
            onValueChange: setAllowGroupInvites,
          })}

          {renderToggle({
            icon: "🔔",
            title: "Push notifications",
            subtitle: "Keep alerts, invites, tasks, and events enabled.",
            value: pushNotifications,
            onValueChange: setPushNotifications,
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Default safety group</Text>

          <Text style={styles.muted}>
            Safety alerts will open with this group selected first.
          </Text>

          {groups.length === 0 ? (
            <View style={styles.emptyInline}>
              <Text style={styles.emptyIcon}>🛡️</Text>
              <Text style={styles.emptyTitle}>No groups yet.</Text>
              <Text style={styles.emptyText}>
                Create or join a group before setting a default safety group.
              </Text>

              <AppButton title="Go to Groups" onPress={() => router.push("/groups")} />
            </View>
          ) : (
            <View style={styles.groupList}>{groups.map(renderSafetyGroup)}</View>
          )}

          {defaultSafetyGroup && (
            <View style={styles.defaultPreview}>
              <GroupAvatar
                name={defaultSafetyGroup.name}
                color={defaultSafetyGroup.avatar_color}
                emoji={defaultSafetyGroup.avatar_emoji}
                avatarUrl={defaultSafetyGroup.avatar_url}
                size={46}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.defaultTitle}>{defaultSafetyGroup.name}</Text>
                <Text style={styles.defaultSub}>Current emergency default</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account info</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoNumber}>{groups.length}</Text>
              <Text style={styles.infoLabel}>groups</Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoNumber}>
                {profile?.profile_completed ? "Yes" : "No"}
              </Text>
              <Text style={styles.infoLabel}>complete</Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoNumber}>
                {formatRelativeTime(profile?.last_seen_at)}
              </Text>
              <Text style={styles.infoLabel}>last seen</Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={saveSettings}
          disabled={saving}
          style={[styles.saveButton, saving && styles.disabledButton]}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save Settings"}
          </Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Session</Text>

          <Pressable onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>

        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>Danger zone</Text>

          <Text style={styles.dangerText}>
            Deleting your account removes your profile and app data tied to your
            user account.
          </Text>

          <Pressable onPress={confirmDeleteAccount} style={styles.deleteAccountButton}>
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </Pressable>
        </View>
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
          <Text style={styles.navIcon}>♡</Text>
          <Text style={styles.navText}>Safety</Text>
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
  roundButtonText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18,
  },
  backText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 34,
    marginTop: -5,
  },
  logo: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  subHeader: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
  },
  muted: {
    color: colors.muted,
    fontWeight: "700",
    lineHeight: 21,
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
  profileHero: {
    backgroundColor: colors.violet,
    borderRadius: 34,
    padding: 20,
    overflow: "hidden",
    gap: 16,
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
  profileHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroAvatar: {
    width: 86,
    height: 86,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: colors.violetSoft,
  },
  heroKicker: {
    color: "rgba(255,255,255,0.76)",
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 11,
  },
  heroName: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 2,
  },
  heroUsername: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "900",
    marginTop: 2,
  },
  heroText: {
    color: "rgba(255,255,255,0.86)",
    fontWeight: "800",
    lineHeight: 22,
  },
  strengthBox: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 22,
    padding: 13,
    gap: 10,
  },
  strengthTitle: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  strengthSub: {
    color: "rgba(255,255,255,0.76)",
    fontWeight: "800",
    marginTop: 2,
  },
  strengthTrack: {
    height: 9,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 30,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    ...softShadow,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  avatarPanel: {
    backgroundColor: colors.softSurface2,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarPreview: {
    width: 68,
    height: 68,
    borderRadius: 999,
    backgroundColor: colors.violetSoft,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  smallButton: {
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
    ...shadow,
    shadowOpacity: 0.08,
  },
  smallButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  removeButton: {
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFD1D1",
  },
  removeButtonText: {
    color: colors.red,
    fontWeight: "900",
    textAlign: "center",
  },
  lockedRow: {
    backgroundColor: colors.softSurface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lockIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  lockIconText: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 16,
  },
  lockedLabel: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  lockedValue: {
    color: colors.text,
    fontWeight: "900",
    marginTop: 3,
  },
  lockedPill: {
    color: colors.violet,
    backgroundColor: colors.violetSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6DFFF",
  },
  toggleRow: {
    backgroundColor: colors.softSurface2,
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: colors.violetSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E6DFFF",
  },
  toggleIconDanger: {
    backgroundColor: colors.redSoft,
    borderColor: "#FFD1D1",
  },
  toggleIconText: {
    fontSize: 22,
  },
  toggleTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  toggleSub: {
    color: colors.muted,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 3,
  },
  groupList: {
    gap: 10,
  },
  groupOption: {
    backgroundColor: colors.softSurface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  groupOptionActive: {
    backgroundColor: colors.violetSoft,
    borderColor: "#E6DFFF",
  },
  groupName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  groupSub: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 3,
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  defaultPreview: {
    backgroundColor: colors.greenSoft,
    borderColor: "#CFF7DC",
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  defaultTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  defaultSub: {
    color: colors.green,
    fontWeight: "900",
    marginTop: 2,
  },
  emptyInline: {
    backgroundColor: colors.softSurface2,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    fontSize: 34,
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
    fontWeight: "700",
  },
  infoGrid: {
    gap: 10,
  },
  infoCard: {
    backgroundColor: colors.softSurface2,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoNumber: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 20,
  },
  infoLabel: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 3,
  },
  saveButton: {
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    ...shadow,
    shadowOpacity: 0.08,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  logoutButton: {
    backgroundColor: colors.softSurface2,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    color: colors.text,
    fontWeight: "900",
  },
  dangerCard: {
    backgroundColor: colors.redSoft,
    borderRadius: 30,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FFD1D1",
    gap: 12,
    ...softShadow,
  },
  dangerTitle: {
    color: colors.red,
    fontSize: 22,
    fontWeight: "900",
  },
  dangerText: {
    color: colors.text2,
    fontWeight: "700",
    lineHeight: 21,
  },
  deleteAccountButton: {
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow,
    shadowOpacity: 0.08,
  },
  deleteAccountText: {
    color: "#FFFFFF",
    fontWeight: "900",
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
  navText: {
    color: colors.muted,
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