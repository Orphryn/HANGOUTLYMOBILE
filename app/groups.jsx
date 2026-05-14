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

const avatarColors = ["#7C5CFF", "#FF7A90", "#FFB86B", "#2DD4BF", "#60A5FA", "#F472B6", "#FACC15"];
const avatarEmojis = ["✨", "🔥", "🌙", "🎮", "🍿", "🏀", "🛡️", "💬"];
const backgrounds = [
  { id: "midnight", label: "Midnight" },
  { id: "warm", label: "Warm Glow" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
];

export default function GroupsPage() {
  const { user } = useAuth();
  const pop = useRef(new Animated.Value(1)).current;

  const [groups, setGroups] = useState([]);
  const [notice, setNotice] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarColor, setAvatarColor] = useState("#7C5CFF");
  const [avatarEmoji, setAvatarEmoji] = useState("✨");
  const [localAvatarUri, setLocalAvatarUri] = useState("");
  const [chatBackground, setChatBackground] = useState("midnight");

  async function loadGroups() {
    if (!user?.id) return;

    const { data } = await supabase
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
    });

    if (!result.canceled) {
      setLocalAvatarUri(result.assets[0].uri);
    }
  }

  async function uploadAvatar(groupId) {
    if (!localAvatarUri) return null;

    const response = await fetch(localAvatarUri);
    const blob = await response.blob();

    const extension = localAvatarUri.split(".").pop()?.split("?")[0] || "jpg";
    const path = `${groupId}/avatar-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("group-avatars")
      .upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage.from("group-avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function createGroup() {
    const cleanName = name.trim();

    if (!cleanName) {
      return Alert.alert("Name required", "Give the group a name first.");
    }

    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({
        name: cleanName,
        description: description.trim() || null,
        created_by: user.id,
        avatar_color: avatarColor,
        avatar_emoji: avatarEmoji,
        chat_background: chatBackground,
      })
      .select("*")
      .single();

    if (groupError) {
      return Alert.alert("Could not create group", groupError.message);
    }

    try {
      const uploadedUrl = await uploadAvatar(group.id);

      if (uploadedUrl) {
        await supabase.from("groups").update({ avatar_url: uploadedUrl }).eq("id", group.id);
      }

      const { error: memberError } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: user.id,
        invited_by: user.id,
        role: "owner",
        status: "accepted",
      });

      if (memberError) {
        return Alert.alert("Group created, but membership failed", memberError.message);
      }

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "group_created",
        title: "Group created",
        body: `${cleanName} is ready.`,
        read: false,
        link: `/group/${group.id}`,
      });

      setNotice(`Created ${cleanName}.`);
      animateCreated();

      setName("");
      setDescription("");
      setAvatarColor("#7C5CFF");
      setAvatarEmoji("✨");
      setLocalAvatarUri("");
      setChatBackground("midnight");

      await loadGroups();
    } catch (err) {
      Alert.alert("Avatar upload failed", err.message);
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
            avatarUrl={localAvatarUri}
            size={76}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitle}>{name || "Your group"}</Text>
            <Text style={styles.muted}>{description || "Pick an avatar and background."}</Text>
          </View>
        </View>

        <AppInput placeholder="Group name" value={name} onChangeText={setName} />
        <AppInput placeholder="Description optional" value={description} onChangeText={setDescription} />

        <Text style={styles.label}>Avatar color</Text>
        <View style={styles.colorRow}>
          {avatarColors.map((c) => (
            <Pressable
              key={c}
              onPress={() => setAvatarColor(c)}
              style={[styles.colorDot, { backgroundColor: c }, avatarColor === c && styles.selectedDot]}
            />
          ))}
        </View>

        <Text style={styles.label}>Avatar emoji</Text>
        <View style={styles.emojiRow}>
          {avatarEmojis.map((e) => (
            <Pressable
              key={e}
              onPress={() => setAvatarEmoji(e)}
              style={[styles.emojiButton, avatarEmoji === e && styles.selectedEmoji]}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <AppButton title="Upload picture or GIF" variant="secondary" onPress={pickAvatar} />

        {localAvatarUri ? <Image source={{ uri: localAvatarUri }} style={styles.uploadPreview} /> : null}

        <Text style={styles.label}>Chat background</Text>
        <View style={styles.backgroundGrid}>
          {backgrounds.map((bg) => (
            <Pressable
              key={bg.id}
              onPress={() => setChatBackground(bg.id)}
              style={[
                styles.backgroundChoice,
                styles[`bg_${bg.id}`],
                chatBackground === bg.id && styles.selectedBackground,
              ]}
            >
              <Text style={styles.backgroundText}>{bg.label}</Text>
            </Pressable>
          ))}
        </View>

        <AppButton title="Create Group" onPress={createGroup} />
      </Animated.View>

      <View style={styles.card}>
        <Text style={styles.title}>Your groups</Text>

        {groups.map((group) => (
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
              <Text style={styles.muted}>{group.description || "No description yet."}</Text>
            </View>

            <Text style={styles.role}>{group.role}</Text>
          </Pressable>
        ))}
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
  colorDot: { width: 34, height: 34, borderRadius: 999, borderWidth: 2, borderColor: "transparent" },
  selectedDot: { borderColor: colors.text, transform: [{ scale: 1.08 }] },
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
  selectedEmoji: { backgroundColor: colors.violet },
  emojiText: { fontSize: 20 },
  uploadPreview: { width: 90, height: 90, borderRadius: 22, alignSelf: "center" },
  backgroundGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  backgroundChoice: {
    width: "48%",
    minHeight: 74,
    borderRadius: 20,
    padding: 12,
    justifyContent: "flex-end",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedBackground: { borderColor: colors.soft },
  backgroundText: { color: colors.text, fontWeight: "900" },
  bg_midnight: { backgroundColor: "#111827" },
  bg_warm: { backgroundColor: "#3a2630" },
  bg_ocean: { backgroundColor: "#123044" },
  bg_forest: { backgroundColor: "#183528" },
  groupRow: {
    backgroundColor: colors.bg2,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  groupName: { color: colors.text, fontWeight: "900", fontSize: 17 },
  role: { color: colors.soft, fontWeight: "900", fontSize: 12 },
});