import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import { colors, radii } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function loadGroups() {
    const { data } = await supabase
      .from("group_members")
      .select("group_id, role, groups(id, name, description)")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    setGroups(data?.map((row) => ({ ...row.groups, role: row.role })).filter(Boolean) || []);
  }

  useFocusEffect(
    useCallback(() => {
      if (user) loadGroups();
    }, [user])
  );

  async function createGroup() {
    const cleanName = name.trim();
    if (!cleanName) return Alert.alert("Name needed", "Give the group a name.");

    const { data: group, error } = await supabase
      .from("groups")
      .insert({
        name: cleanName,
        description: description.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return Alert.alert("Could not create group", error.message);

    await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
      invited_by: user.id,
      role: "owner",
      status: "accepted",
    });

    setName("");
    setDescription("");
    router.push(`/group/${group.id}`);
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Create a group</Text>
        <Text style={styles.muted}>Start the room. Let it become something.</Text>

        <View style={styles.form}>
          <AppInput placeholder="Group name" value={name} onChangeText={setName} />
          <AppInput placeholder="Description optional" value={description} onChangeText={setDescription} />
          <AppButton title="Create Group" onPress={createGroup} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Your groups</Text>
        {groups.length === 0 ? (
          <Text style={styles.muted}>No groups yet.</Text>
        ) : (
          groups.map((group) => (
            <Pressable key={group.id} style={styles.group} onPress={() => router.push(`/group/${group.id}`)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{group.name?.[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{group.name}</Text>
                <Text style={styles.muted}>{group.description || "No description yet."}</Text>
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
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: 18, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  muted: { color: colors.muted },
  form: { gap: 10 },
  group: { backgroundColor: colors.bg2, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { height: 48, width: 48, borderRadius: 18, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.text, fontWeight: "900", fontSize: 18 },
  groupTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  role: { color: colors.soft, fontSize: 12, fontWeight: "900" },
});