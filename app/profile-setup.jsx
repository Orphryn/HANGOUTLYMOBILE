import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import ProfileAvatar from "../components/ProfileAvatar";
import { colors, radii, shadow } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function getExtension(asset, fileBody) {
  const mime = asset?.mimeType || fileBody?.type || "";

  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("jpg")) return "jpg";

  return "jpg";
}

export default function ProfileSetup() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, email, bio, avatar_url, availability_note"
        )
        .eq("id", user.id)
        .maybeSingle();

      setProfile(data);
      setDisplayName(data?.display_name || data?.username || "");
      setBio(data?.bio || "");
      setAvailabilityNote(data?.availability_note || "");
    }

    load();
  }, [user?.id]);

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
    if (!avatarAsset?.uri || !user?.id) {
      return profile?.avatar_url || null;
    }

    const response = await fetch(avatarAsset.uri);
    const fileBody = await response.blob();
    const extension = getExtension(avatarAsset, fileBody);

    const contentType =
      avatarAsset.mimeType ||
      fileBody.type ||
      (extension === "gif" ? "image/gif" : "image/jpeg");

    const path = `${user.id}/profile-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("profile-avatars")
      .upload(path, fileBody, {
        contentType,
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("profile-avatars")
      .getPublicUrl(path);

    return data?.publicUrl || null;
  }

  async function saveProfile() {
    if (!user?.id) return;

    if (!displayName.trim()) {
      return Alert.alert("Name required", "Add a display name first.");
    }

    setSaving(true);

    try {
      const avatarUrl = await uploadAvatar();

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          availability_note: availabilityNote.trim() || null,
          avatar_url: avatarUrl,
          profile_completed: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      router.replace("/dashboard");
    } catch (err) {
      Alert.alert("Profile save failed", err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Create your profile</Text>

        <Text style={styles.muted}>
          This is how your friends will see you in chats.
        </Text>

        <View style={styles.avatarRow}>
          {avatarAsset?.uri ? (
            <Image source={{ uri: avatarAsset.uri }} style={styles.avatarPreview} />
          ) : (
            <ProfileAvatar profile={profile} size={86} />
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.avatarTitle}>Profile picture or GIF</Text>
            <Text style={styles.muted}>
              If you skip this, an anonymous avatar is used.
            </Text>
          </View>
        </View>

        <AppButton
          title="Upload picture or GIF"
          variant="secondary"
          onPress={pickAvatar}
        />

        <AppInput
          placeholder="Display name"
          value={displayName}
          onChangeText={setDisplayName}
        />

        <AppInput
          placeholder="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
        />

        <AppInput
          placeholder="Availability note, ex: Free after 7"
          value={availabilityNote}
          onChangeText={setAvailabilityNote}
        />

        <AppButton
          title={saving ? "Saving..." : "Finish Profile"}
          onPress={saveProfile}
          disabled={saving}
        />
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
    paddingBottom: 60,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    ...shadow,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
  },
  muted: {
    color: colors.muted,
  },
  avatarRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    backgroundColor: colors.bg2,
    borderRadius: 22,
    padding: 14,
  },
  avatarTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  avatarPreview: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
});