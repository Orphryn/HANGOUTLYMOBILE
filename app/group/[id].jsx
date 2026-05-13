import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import { colors, radii } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

function who(profile) {
  return profile?.username || profile?.display_name || profile?.email || "Someone";
}

export default function GroupDetail() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [content, setContent] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");

  async function loadGroup() {
    const { data: groupData } = await supabase.from("groups").select("*").eq("id", id).single();
    setGroup(groupData);

    const { data: messageRows } = await supabase
      .from("messages")
      .select("*, profiles:sender_id(username, display_name, email)")
      .eq("group_id", id)
      .order("created_at", { ascending: false })
      .limit(60);

    setMessages(messageRows || []);

    const { data: memberRows } = await supabase
      .from("group_members")
      .select("role, profiles(id, username, display_name, email)")
      .eq("group_id", id)
      .eq("status", "accepted");

    setMembers(memberRows || []);
  }

  useEffect(() => {
    loadGroup();

    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${id}` },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select("*, profiles:sender_id(username, display_name, email)")
            .eq("id", payload.new.id)
            .single();

          if (data) setMessages((prev) => [data, ...prev]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  async function sendMessage() {
    const text = content.trim();
    if (!text) return;

    setContent("");

    const { error } = await supabase.from("messages").insert({
      group_id: id,
      sender_id: user.id,
      content: text,
    });

    if (error) Alert.alert("Message failed", error.message);
  }

  async function inviteUser() {
    const username = inviteUsername.trim().toLowerCase();
    if (!username) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (!profile) return Alert.alert("Not found", "No user with that username.");

    const { error } = await supabase.from("group_members").insert({
      group_id: id,
      user_id: profile.id,
      invited_by: user.id,
      role: "member",
      status: "pending",
    });

    if (error) return Alert.alert("Invite failed", error.message);

    setInviteUsername("");
    Alert.alert("Invite sent", `${username} can accept it from their home screen.`);
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>{group?.name || "Group"}</Text>
        <Text style={styles.muted}>
          {members.length} member{members.length === 1 ? "" : "s"} here
        </Text>

        <View style={styles.memberRow}>
          {members.slice(0, 5).map((m) => (
            <View key={m.profiles?.id} style={styles.memberBubble}>
              <Text style={styles.memberText}>{who(m.profiles)[0]?.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        <View style={styles.inviteRow}>
          <AppInput placeholder="Invite by username" value={inviteUsername} onChangeText={setInviteUsername} />
          <Pressable style={styles.inviteButton} onPress={inviteUser}>
            <Text style={styles.inviteText}>Invite</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => {
          const mine = item.sender_id === user.id;

          return (
            <View style={[styles.messageWrap, mine && { alignItems: "flex-end" }]}>
              <Text style={styles.sender}>{mine ? "You" : who(item.profiles)}</Text>
              <View style={[styles.bubble, mine && styles.myBubble]}>
                <Text style={styles.messageText}>{item.content}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Quiet room. Say the first thing.</Text>}
      />

      <View style={styles.composer}>
        <AppInput placeholder="Message..." value={content} onChangeText={setContent} />
        <AppButton title="Send" onPress={sendMessage} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 18, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border, gap: 10 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900" },
  muted: { color: colors.muted },
  memberRow: { flexDirection: "row" },
  memberBubble: { height: 32, width: 32, borderRadius: 999, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center", marginRight: -7, borderWidth: 2, borderColor: colors.card },
  memberText: { color: colors.text, fontWeight: "900" },
  inviteRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  inviteButton: { backgroundColor: colors.violet, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 16 },
  inviteText: { color: colors.text, fontWeight: "900" },
  messages: { padding: 18, gap: 10 },
  messageWrap: { marginBottom: 12 },
  sender: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  bubble: { maxWidth: "82%", backgroundColor: colors.card, borderRadius: radii.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  myBubble: { backgroundColor: colors.violet },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  composer: { padding: 14, gap: 10, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
});