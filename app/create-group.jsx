import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
    Alert,
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
import { colors, shadow, softShadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const groupColors = [
  "#7C5CFF",
  "#2DD4BF",
  "#FFB86B",
  "#FB7185",
  "#60A5FA",
  "#A78BFA",
  "#F2D6A2",
];

const groupEmojis = ["✨", "🎮", "🍿", "🏀", "🚗", "🌙", "🔥", "💬", "🎧", "📍"];

function getMediaExtension(asset, fileBody) {
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

export default function CreateGroup() {
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [avatarColor, setAvatarColor] = useState("#7C5CFF");
  const [chatBackground, setChatBackground] = useState("midnight");
  const [imageAsset, setImageAsset] = useState(null);
  const [creating, setCreating] = useState(false);

  const previewName = useMemo(() => {
    return name.trim() || "New group";
  }, [name]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.95,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.[0]) return;

    setImageAsset(result.assets[0]);
  }

  async function uploadAvatar(groupId) {
    if (!imageAsset?.uri) return null;

    const response = await fetch(imageAsset.uri);
    const fileBody = await response.blob();

    const extension = getMediaExtension(imageAsset, fileBody);

    const contentType =
      imageAsset.mimeType ||
      fileBody.type ||
      (extension === "gif" ? "image/gif" : "image/jpeg");

    const path = `${groupId}/avatar-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("group-avatars")
      .upload(path, fileBody, {
        contentType,
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage.from("group-avatars").getPublicUrl(path);

    return data?.publicUrl || null;
  }

  async function createGroup() {
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    if (!cleanName) {
      Alert.alert("Name required", "Give the group a name first.");
      return;
    }

    if (cleanName.length < 2) {
      Alert.alert("Name too short", "Use at least 2 characters.");
      return;
    }

    setCreating(true);

    try {
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: cleanName,
          description: cleanDescription || null,
          created_by: user.id,
          avatar_color: avatarColor,
          avatar_emoji: emoji,
          avatar_url: null,
          chat_background: chatBackground,
        })
        .select(
          "id, name, description, created_by, avatar_color, avatar_emoji, avatar_url, chat_background, created_at"
        )
        .single();

      if (groupError) throw groupError;

      let avatarUrl = null;

      if (imageAsset?.uri) {
        avatarUrl = await uploadAvatar(group.id);

        if (avatarUrl) {
          const { error: avatarError } = await supabase
            .from("groups")
            .update({ avatar_url: avatarUrl })
            .eq("id", group.id);

          if (avatarError) throw avatarError;
        }
      }

      const { error: memberError } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: user.id,
        invited_by: user.id,
        role: "owner",
        status: "accepted",
        pinned: false,
        muted: false,
      });

      if (memberError) throw memberError;

      await supabase.from("messages").insert({
        group_id: group.id,
        sender_id: user.id,
        content: `${cleanName} was created.`,
        message_type: "system",
      });

      router.replace(`/group/${group.id}`);
    } catch (err) {
      Alert.alert("Could not create group", err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>New room</Text>
            <Text style={styles.title}>Create Group</Text>
            <Text style={styles.subtitle}>Simple, clean, not cluttered.</Text>
          </View>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewGlow} />

          {imageAsset?.uri ? (
            <Image source={{ uri: imageAsset.uri }} style={styles.previewImage} />
          ) : (
            <GroupAvatar
              name={previewName}
              color={avatarColor}
              emoji={emoji}
              size={82}
            />
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.previewName}>{previewName}</Text>
            <Text numberOfLines={2} style={styles.previewDescription}>
              {description.trim() || "Your new group chat and shared plans room."}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Group details</Text>

          <AppInput
            label="Group name"
            placeholder="Weekend crew"
            value={name}
            onChangeText={setName}
          />

          <AppInput
            label="Description"
            placeholder="Optional. What is this group for?"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Avatar</Text>

          <Pressable onPress={pickImage} style={styles.uploadButton}>
            <Text style={styles.uploadTitle}>
              {imageAsset?.uri ? "Change image or GIF" : "Upload image or GIF"}
            </Text>
            <Text style={styles.uploadSub}>
              Optional. If you skip this, your color and emoji will be used.
            </Text>
          </Pressable>

          <Text style={styles.fieldLabel}>Emoji fallback</Text>

          <View style={styles.emojiRow}>
            {groupEmojis.map((item) => (
              <Pressable
                key={item}
                onPress={() => setEmoji(item)}
                style={[styles.emojiButton, emoji === item && styles.emojiActive]}
              >
                <Text style={styles.emojiText}>{item}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Color</Text>

          <View style={styles.colorRow}>
            {groupColors.map((color) => (
              <Pressable
                key={color}
                onPress={() => setAvatarColor(color)}
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                  avatarColor === color && styles.colorDotActive,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Chat vibe</Text>

          <View style={styles.backgroundGrid}>
            {[
              { id: "midnight", label: "Midnight" },
              { id: "ocean", label: "Ocean" },
              { id: "forest", label: "Forest" },
              { id: "warm", label: "Warm" },
            ].map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setChatBackground(item.id)}
                style={[
                  styles.backgroundOption,
                  chatBackground === item.id && styles.backgroundActive,
                ]}
              >
                <Text
                  style={[
                    styles.backgroundText,
                    chatBackground === item.id && styles.backgroundTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <AppButton
          title={creating ? "Creating..." : "Create Group"}
          onPress={createGroup}
          disabled={creating}
        />

        <Pressable onPress={() => router.back()} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
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
    paddingBottom: 42,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    marginTop: -5,
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
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.9,
  },
  subtitle: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
  },
  previewCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 30,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    overflow: "hidden",
    ...shadow,
  },
  previewGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.12)",
  },
  previewImage: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
    letterSpacing: -0.5,
  },
  previewDescription: {
    color: colors.text2,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 5,
  },
  formCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 16,
    gap: 14,
    ...softShadow,
  },
  sectionTitle: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  uploadButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 15,
    gap: 4,
  },
  uploadTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  uploadSub: {
    color: colors.muted,
    fontWeight: "700",
    lineHeight: 19,
  },
  fieldLabel: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 13,
  },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  emojiButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiActive: {
    borderColor: colors.violet,
    backgroundColor: colors.violetSoft,
  },
  emojiText: {
    fontSize: 22,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorDot: {
    width: 39,
    height: 39,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: colors.bg2,
  },
  colorDotActive: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  backgroundOption: {
    width: "47%",
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundActive: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  backgroundText: {
    color: colors.muted,
    fontWeight: "900",
  },
  backgroundTextActive: {
    color: colors.text,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelText: {
    color: colors.muted,
    fontWeight: "900",
  },
});