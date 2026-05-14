import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import GroupAvatar from "../components/GroupAvatar";
import { colors, radii, shadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const avatarColors = [
  "#7C5CFF",
  "#FF7A90",
  "#FFB86B",
  "#2DD4BF",
  "#60A5FA",
  "#F472B6",
  "#FACC15",
];

const avatarEmojis = ["✨", "🔥", "🌙", "🎮", "🍿", "🏀", "🛡️", "💬"];

const backgrounds = [
  { id: "midnight", label: "Midnight", color: "#111827" },
  { id: "warm", label: "Warm Glow", color: "#3a2630" },
  { id: "ocean", label: "Ocean", color: "#123044" },
  { id: "forest", label: "Forest", color: "#183528" },
];

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

export default function GroupsPage() {
  const { user } = useAuth();
  const pop = useRef(new Animated.Value(1)).current;

  const [groups, setGroups] = useState([]);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarColor, setAvatarColor] = useState("#7C5CFF");
  const [avatarEmoji, setAvatarEmoji] = useState("✨");
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [chatBackground, setChatBackground] = useState("midnight");

  async function loadGroups() {
    if (!user?.id) return;

    const { data, error } = await supabase
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

    if (error) {
      Alert.alert("Could not load groups", error.message);
      return;
    }

    setGroups(
      (data || [])
        .map((row) => ({ ...row.groups, role: row.role }))
        .filter((group) => group?.id)
    );
  }

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [user?.id])
  );

  function animateCreated() {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1.04, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }

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

  async function uploadAvatar(groupId) {
    if (!avatarAsset?.uri) return null;

    const response = await fetch(avatarAsset.uri);
    const fileBody = await response.blob();

    const extension = getExtension(avatarAsset, fileBody);
    const contentType =
      avatarAsset.mimeType ||
      fileBody.type ||
      (extension === "gif" ? "image/gif" : "image/jpeg");

    const path = `${user.id}/${groupId}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("group-avatars")
      .upload(path, fileBody, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("group-avatars").getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new Error("Avatar uploaded, but Supabase did not return a public URL.");
    }

    return data.publicUrl;
  }

  async function saveAvatarUrl(groupId, avatarUrl) {
    const { data, error } = await supabase
      .from("groups")
      .update({ avatar_url: avatarUrl })
      .eq("id", groupId)
      .select(`
        id,
        name,
        avatar_color,
        avatar_emoji,
        avatar_url,
        chat_background
      `)
      .single();

    if (error) {
      throw error;
    }

    if (!data?.avatar_url) {
      throw new Error("Avatar URL did not save to the group row.");
    }

    return data;
  }

  async function createGroup() {
    const cleanName = name.trim();

    if (!cleanName) {
      return Alert.alert("Name required", "Give the group a name first.");
    }

    if (!user?.id) {
      return Alert.alert("Not logged in", "Log in again first.");
    }

    setCreating(true);

    try {
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: cleanName,
          description: description.trim() || null,
          created_by: user.id,
          avatar_color: avatarColor,
          avatar_emoji: avatarEmoji,
          avatar_url: null,
          chat_background: chatBackground,
        })
        .select("*")
        .single();

      if (groupError) {
        throw groupError;
      }

      const { error: memberError } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: user.id,
        invited_by: user.id,
        role: "owner",
        status: "accepted",
      });

      if (memberError) {
        throw memberError;
      }

      let finalAvatarUrl = null;

      if (avatarAsset?.uri) {
        finalAvatarUrl = await uploadAvatar(group.id);
        await saveAvatarUrl(group.id, finalAvatarUrl);
      }

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "group_created",
        title: "Group created",
        body: `${cleanName} is ready.`,
        read: false,
        link: `/group/${group.id}`,
      });

      await supabase.from("messages").insert({
        group_id: group.id,
        sender_id: user.id,
        content: `✨ ${cleanName} was created.`,
      });

      setNotice(`Created ${cleanName}.`);
      animateCreated();

      setName("");
      setDescription("");
      setAvatarColor("#7C5CFF");
      setAvatarEmoji("✨");
      setAvatarAsset(null);
      setChatBackground("midnight");

      await loadGroups();

      Alert.alert(
        "Group created",
        finalAvatarUrl
          ? "Your group was created and the avatar was saved."
          : "Your group was created."
      );
    } catch (err) {
      Alert.alert("Group creation failed", err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {!!notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>✅ {notice}</Text>
        </View>
      )}

      <Animated.View style={[styles.card, { transform: [{ scale: pop }] }]}>
        <Text style={styles.title}>Create a group</Text>
        <Text style={styles.muted}>Make the room feel like your people.</Text>

        <View style={styles.previewRow}>
          <GroupAvatar
            name={name || "Group"}
            color={avatarColor}
            emoji={avatarEmoji}
            avatarUrl={avatarAsset?.uri}
            size={76}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitle}>{name || "Your group"}</Text>
            <Text style={styles.muted}>
              {avatarAsset
                ? "Picture selected. Color and emoji stay saved as fallback."
                : "Pick a color, emoji, picture, and background."}
            </Text>
          </View>
        </View>

        <AppInput placeholder="Group name" value={name} onChangeText={setName} />

        <AppInput
          placeholder="Description optional"
          value={description}
          onChangeText={setDescription}
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

        <Text style={styles.label}>Avatar emoji</Text>

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

        <AppButton title="Upload picture or GIF" variant="secondary" onPress={pickAvatar} />

        {avatarAsset?.uri ? (
          <View style={styles.uploadBox}>
            <Image source={{ uri: avatarAsset.uri }} style={styles.uploadPreview} />

            <Pressable onPress={() => setAvatarAsset(null)} style={styles.removeImageButton}>
              <Text style={styles.removeImageText}>
                Remove picture and use emoji bubble
              </Text>
            </Pressable>
          </View>
        ) : null}

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
            </Pressable>
          ))}
        </View>

        <AppButton
          title={creating ? "Creating..." : "Create Group"}
          onPress={createGroup}
          disabled={creating}
        />
      </Animated.View>

      <View style={styles.card}>
        <Text style={styles.title}>Your groups</Text>

        {groups.length === 0 ? (
          <Text style={styles.muted}>No groups yet. Create one above.</Text>
        ) : (
          groups.map((group) => (
            <Pressable
              key={group.id}
              onPress={() => router.push(`/group/${group.id}`)}
              style={styles.groupRow}
            >
              <GroupAvatar
                name={group.name}
                color={group.avatar_color}
                emoji={group.avatar_emoji}
                avatarUrl={group.avatar_url}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.muted}>
                  {group.description || "No description yet."}
                </Text>
              </View>

              <Text style={styles.role}>{group.role}</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18, paddingBottom: 60 },
  notice: {
    backgroundColor: "rgba(45,212,191,0.16)",
    borderColor: colors.green,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  noticeText: { color: colors.text, fontWeight: "900" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 18,
    gap: 14,
    ...shadow,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: "900" },
  muted: { color: colors.muted },
  label: { color: colors.soft, fontWeight: "900", marginTop: 4 },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.bg2,
    borderRadius: 24,
    padding: 14,
  },
  previewTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedDot: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },
  emojiRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  emojiButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
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
  emojiText: { fontSize: 20 },
  uploadBox: {
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bg2,
    borderRadius: 20,
    padding: 14,
  },
  uploadPreview: {
    width: 110,
    height: 110,
    borderRadius: 24,
  },
  removeImageButton: {
    backgroundColor: "rgba(251,113,133,0.18)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  removeImageText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 12,
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  backgroundChoice: {
    width: "48%",
    minHeight: 74,
    borderRadius: 20,
    padding: 12,
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
  },
  groupRow: {
    backgroundColor: colors.bg2,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  groupName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  role: {
    color: colors.soft,
    fontWeight: "900",
    fontSize: 12,
  },
});