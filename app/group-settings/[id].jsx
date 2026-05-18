import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import GroupAvatar from "../../components/GroupAvatar";
import ProfileAvatar from "../../components/ProfileAvatar";
import { colors, radii, shadow } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

const avatarColors = [
  "#7C5CFF",
  "#FF7A90",
  "#FFB86B",
  "#2DD4BF",
  "#60A5FA",
  "#F472B6",
  "#FACC15",
  "#EF4444",
  "#34D399",
  "#A78BFA",
];

const avatarEmojis = ["✨", "🔥", "🌙", "🎮", "🍿", "🏀", "🛡️", "💬", "🚗", "🎧"];

const backgrounds = [
  {
    id: "midnight",
    label: "Midnight",
    subtitle: "clean dark room",
    color: "#111827",
  },
  {
    id: "warm",
    label: "Warm Glow",
    subtitle: "soft late-night vibe",
    color: "#3a2630",
  },
  {
    id: "ocean",
    label: "Ocean",
    subtitle: "cool blue lounge",
    color: "#123044",
  },
  {
    id: "forest",
    label: "Forest",
    subtitle: "deep green hangout",
    color: "#183528",
  },
];

function displayName(profile) {
  if (!profile) return "Someone";
  return profile.display_name || profile.username || profile.email || "Someone";
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

export default function GroupSettings() {
  const params = useLocalSearchParams();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [membership, setMembership] = useState(null);
  const [members, setMembers] = useState([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarColor, setAvatarColor] = useState("#7C5CFF");
  const [avatarEmoji, setAvatarEmoji] = useState("✨");
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [chatBackground, setChatBackground] = useState("midnight");

  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadSettings() {
    if (!groupId || !user?.id) return;

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .select(
        `
        id,
        name,
        description,
        created_by,
        avatar_color,
        avatar_emoji,
        avatar_url,
        chat_background,
        created_at
      `
      )
      .eq("id", groupId)
      .maybeSingle();

    if (groupError) {
      Alert.alert("Could not load group", groupError.message);
      return;
    }

    if (!groupData) {
      router.replace("/dashboard");
      return;
    }

    setGroup(groupData);
    setName(groupData.name || "");
    setDescription(groupData.description || "");
    setAvatarColor(groupData.avatar_color || "#7C5CFF");
    setAvatarEmoji(groupData.avatar_emoji || "✨");
    setChatBackground(groupData.chat_background || "midnight");

    const { data: myMembership, error: membershipError } = await supabase
      .from("group_members")
      .select("id, group_id, user_id, role, status, muted, pinned")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      Alert.alert("Could not load membership", membershipError.message);
      return;
    }

    if (!myMembership || myMembership.status !== "accepted") {
      Alert.alert("No access", "You are not an accepted member of this group.");
      router.replace("/dashboard");
      return;
    }

    setMembership(myMembership);
    setMuted(myMembership.muted === true);
    setPinned(myMembership.pinned === true);

    const { data: memberRows, error: membersError } = await supabase
      .from("group_members")
      .select(
        `
        id,
        user_id,
        role,
        status,
        profiles:user_id (
          id,
          username,
          display_name,
          email,
          avatar_url,
          bio,
          last_seen_at
        )
      `
      )
      .eq("group_id", groupId)
      .eq("status", "accepted")
      .order("role", { ascending: false });

    if (membersError) {
      Alert.alert("Could not load members", membersError.message);
      return;
    }

    setMembers(memberRows || []);
  }

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [groupId, user?.id])
  );

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarAsset(result.assets[0]);
    }
  }

  async function uploadAvatar() {
    if (!avatarAsset?.uri || !user?.id || !groupId) {
      return group?.avatar_url || null;
    }

    const response = await fetch(avatarAsset.uri);
    const fileBody = await response.blob();

    const extension = getExtension(avatarAsset, fileBody);

    const contentType =
      avatarAsset.mimeType ||
      fileBody.type ||
      (extension === "gif" ? "image/gif" : "image/jpeg");

    const path = `${groupId}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("group-avatars")
      .upload(path, fileBody, {
        contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("group-avatars").getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new Error("Avatar uploaded, but Supabase did not return a public URL.");
    }

    return data.publicUrl;
  }

  async function saveMemberPrefs(nextValues = {}) {
    if (!membership?.id) return;

    const update = {
      muted,
      pinned,
      ...nextValues,
    };

    const { error } = await supabase
      .from("group_members")
      .update(update)
      .eq("id", membership.id);

    if (error) {
      Alert.alert("Could not save preference", error.message);
      return;
    }

    if (typeof update.muted === "boolean") setMuted(update.muted);
    if (typeof update.pinned === "boolean") setPinned(update.pinned);

    setNotice("Preferences saved.");
  }

  async function saveGroup() {
    const cleanName = name.trim();

    if (!cleanName) {
      return Alert.alert("Missing name", "Group name cannot be empty.");
    }

    setSaving(true);
    setNotice("");

    try {
      const avatarUrl = await uploadAvatar();

      const { data, error } = await supabase
        .from("groups")
        .update({
          name: cleanName,
          description: description.trim() || null,
          avatar_color: avatarColor,
          avatar_emoji: avatarEmoji,
          avatar_url: avatarUrl,
          chat_background: chatBackground,
        })
        .eq("id", groupId)
        .select(
          `
          id,
          name,
          description,
          created_by,
          avatar_color,
          avatar_emoji,
          avatar_url,
          chat_background,
          created_at
        `
        )
        .single();

      if (error) throw error;

      await supabase.from("messages").insert({
        group_id: groupId,
        sender_id: user.id,
        content: "⚙️ Group settings updated.",
        message_type: "system",
      });

      setGroup(data);
      setAvatarAsset(null);
      setNotice("Group updated.");
    } catch (err) {
      Alert.alert("Save failed", err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />

        <View style={styles.heroTop}>
          <GroupAvatar
            name={name || group?.name}
            color={avatarColor}
            emoji={avatarEmoji}
            avatarUrl={avatarAsset?.uri || group?.avatar_url}
            size={76}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Group settings</Text>
            <Text style={styles.title}>{group?.name || "Group"}</Text>
            <Text style={styles.muted}>Customize the room and your preferences.</Text>
          </View>
        </View>

        {!!notice && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>✅ {notice}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your preferences</Text>

        <Pressable
          onPress={() => saveMemberPrefs({ pinned: !pinned })}
          style={styles.preferenceRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Pin group</Text>
            <Text style={styles.muted}>Keep this group higher in your list.</Text>
          </View>

          <Text style={styles.preferenceValue}>{pinned ? "On" : "Off"}</Text>
        </Pressable>

        <Pressable
          onPress={() => saveMemberPrefs({ muted: !muted })}
          style={styles.preferenceRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Mute group</Text>
            <Text style={styles.muted}>Reduce non-safety notifications later.</Text>
          </View>

          <Text style={styles.preferenceValue}>{muted ? "On" : "Off"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Group identity</Text>

        <View style={styles.avatarPanel}>
          {avatarAsset?.uri ? (
            <Image source={{ uri: avatarAsset.uri }} style={styles.avatarPreview} />
          ) : (
            <GroupAvatar
              name={name || group?.name}
              color={avatarColor}
              emoji={avatarEmoji}
              avatarUrl={group?.avatar_url}
              size={70}
            />
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Group picture or GIF</Text>
            <Text style={styles.muted}>
              Picture shows first. Color and emoji stay as fallback.
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

        <AppInput
          placeholder="Group name"
          value={name}
          onChangeText={setName}
        />

        <AppInput
          placeholder="Group description"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Avatar color</Text>

        <View style={styles.colorRow}>
          {avatarColors.map((color) => (
            <Pressable
              key={color}
              onPress={() => setAvatarColor(color)}
              style={[
                styles.colorDot,
                { backgroundColor: color },
                avatarColor === color && styles.selectedDot,
              ]}
            />
          ))}
        </View>

        <Text style={styles.label}>Emoji fallback</Text>

        <View style={styles.emojiRow}>
          {avatarEmojis.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => setAvatarEmoji(emoji)}
              style={[
                styles.emojiButton,
                avatarEmoji === emoji && styles.selectedEmoji,
              ]}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Chat background</Text>

        <View style={styles.backgroundGrid}>
          {backgrounds.map((bg) => (
            <Pressable
              key={bg.id}
              onPress={() => setChatBackground(bg.id)}
              style={[
                styles.backgroundChoice,
                { backgroundColor: bg.color },
                chatBackground === bg.id && styles.selectedBackground,
              ]}
            >
              <Text style={styles.backgroundText}>{bg.label}</Text>
              <Text style={styles.backgroundSub}>{bg.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <AppButton
          title={saving ? "Saving..." : "Save Group"}
          onPress={saveGroup}
          disabled={saving}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Members</Text>

        {members.map((member) => {
          const memberIsOwner = member.role === "owner";
          const isSelf = member.user_id === user.id;

          return (
            <View key={member.id} style={styles.memberRow}>
              <ProfileAvatar profile={member.profiles} size={46} />

              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{displayName(member.profiles)}</Text>
                <Text style={styles.muted}>
                  {memberIsOwner ? "Owner" : "Member"}
                  {isSelf ? " • You" : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 70,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    overflow: "hidden",
    ...shadow,
  },
  heroGlow: {
    position: "absolute",
    right: -90,
    top: -90,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.18)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  kicker: {
    color: colors.soft,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
  },
  muted: {
    color: colors.muted,
  },
  notice: {
    backgroundColor: "rgba(45,212,191,0.16)",
    borderColor: colors.green,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  noticeText: {
    color: colors.text,
    fontWeight: "900",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    ...shadow,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  cardTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  preferenceRow: {
    backgroundColor: colors.bg2,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  preferenceValue: {
    color: colors.text,
    fontWeight: "900",
    backgroundColor: "rgba(124,92,255,0.24)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  avatarPanel: {
    backgroundColor: colors.bg2,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarPreview: {
    width: 70,
    height: 70,
    borderRadius: 26,
    backgroundColor: colors.bg,
  },
  smallButton: {
    backgroundColor: colors.violet,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  smallButtonText: {
    color: colors.text,
    fontWeight: "900",
  },
  removeButton: {
    backgroundColor: "rgba(251,113,133,0.14)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.35)",
  },
  removeButtonText: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "center",
  },
  label: {
    color: colors.soft,
    fontWeight: "900",
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorDot: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "transparent",
  },
  selectedDot: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  emojiButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.bg2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedEmoji: {
    backgroundColor: colors.violet,
    borderColor: colors.text,
  },
  emojiText: {
    fontSize: 21,
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  backgroundChoice: {
    width: "48%",
    minHeight: 94,
    borderRadius: 22,
    padding: 14,
    justifyContent: "flex-end",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedBackground: {
    borderColor: colors.soft,
  },
  backgroundText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  backgroundSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  memberRow: {
    backgroundColor: colors.bg2,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
});