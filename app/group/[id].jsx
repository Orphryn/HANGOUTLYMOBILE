import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import GroupAvatar from "../../components/GroupAvatar";
import { colors, radii, shadow } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

function displayName(profile) {
  if (!profile) return "Someone";
  return profile.username || profile.display_name || profile.email || "Someone";
}

function isUrl(text) {
  return typeof text === "string" && text.startsWith("https://");
}

function chatBackgroundStyle(background) {
  if (background === "warm") return { backgroundColor: "#2b1d25" };
  if (background === "ocean") return { backgroundColor: "#102b3a" };
  if (background === "forest") return { backgroundColor: "#142a20" };
  return { backgroundColor: colors.bg };
}

export default function GroupDetail() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState("chat");
  const [group, setGroup] = useState(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [content, setContent] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");

  async function loadGroup() {
    if (!id || !user?.id) return;

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("id, username, display_name, email")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(myProfile);

    const { data: groupData } = await supabase
      .from("groups")
      .select(`
        id,
        name,
        description,
        created_by,
        avatar_color,
        avatar_emoji,
        avatar_url,
        chat_background,
        created_at
      `)
      .eq("id", id)
      .maybeSingle();

    setGroup(groupData);

    const { data: messageRows } = await supabase
      .from("messages")
      .select(`
        id,
        group_id,
        sender_id,
        content,
        created_at,
        profiles:sender_id (
          id,
          username,
          display_name,
          email
        )
      `)
      .eq("group_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    setMessages(messageRows || []);

    const { data: memberRows } = await supabase
      .from("group_members")
      .select(`
        id,
        user_id,
        role,
        status,
        profiles:user_id (
          id,
          username,
          display_name,
          email
        )
      `)
      .eq("group_id", id)
      .eq("status", "accepted");

    setMembers(memberRows || []);
  }

  useEffect(() => {
    if (!id || !user?.id) return;

    loadGroup();

    const channel = supabase
      .channel(`group-room-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${id}`,
        },
        async (payload) => {
          const incoming = payload.new;

          const { data: fullMessage } = await supabase
            .from("messages")
            .select(`
              id,
              group_id,
              sender_id,
              content,
              created_at,
              profiles:sender_id (
                id,
                username,
                display_name,
                email
              )
            `)
            .eq("id", incoming.id)
            .maybeSingle();

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === incoming.id)) return prev;
            return [fullMessage || incoming, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user?.id]);

  async function sendMessage() {
    const text = content.trim();

    if (!text) return;

    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      id: tempId,
      group_id: id,
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      profiles: profile,
      optimistic: true,
    };

    setMessages((prev) => [optimisticMessage, ...prev]);
    setContent("");

    const { data: savedMessage, error } = await supabase
      .from("messages")
      .insert({
        group_id: id,
        sender_id: user.id,
        content: text,
      })
      .select(`
        id,
        group_id,
        sender_id,
        content,
        created_at,
        profiles:sender_id (
          id,
          username,
          display_name,
          email
        )
      `)
      .single();

    if (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      return Alert.alert("Message failed", error.message);
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === tempId ? { ...savedMessage, optimistic: false } : msg
      )
    );
  }

  async function inviteUser() {
    const username = inviteUsername.trim().toLowerCase();
    if (!username) return;

    const { data: foundProfile } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();

    if (!foundProfile?.id) {
      return Alert.alert("Not found", "No verified user exists with that username.");
    }

    if (foundProfile.id === user.id) {
      return Alert.alert("Already here", "You cannot invite yourself.");
    }

    const { error } = await supabase.from("group_members").insert({
      group_id: id,
      user_id: foundProfile.id,
      invited_by: user.id,
      role: "member",
      status: "pending",
    });

    if (error) return Alert.alert("Invite failed", error.message);

    await supabase.from("notifications").insert({
      user_id: foundProfile.id,
      type: "group_invite",
      title: "Group invite",
      body: `${displayName(profile)} invited you to ${group?.name || "a group"}.`,
      read: false,
      link: "/dashboard",
    });

    setInviteUsername("");
    Alert.alert("Invite sent", `${username} can accept it from their home screen.`);
  }

  async function leaveGroup() {
    Alert.alert("Leave group?", "You will lose access to this group chat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("leave_group_and_cleanup", {
            input_group_id: id,
          });

          if (error) {
            return Alert.alert("Could not leave group", error.message);
          }

          router.replace("/dashboard");
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, chatBackgroundStyle(group?.chat_background)]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <GroupAvatar
          name={group?.name}
          color={group?.avatar_color}
          emoji={group?.avatar_emoji}
          avatarUrl={group?.avatar_url}
          size={68}
        />

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{group?.name || "Group"}</Text>
          <Text style={styles.muted}>{members.length} members</Text>
        </View>

        <Pressable onPress={leaveGroup} style={styles.leaveButton}>
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {["chat", "members"].map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "chat" && (
        <>
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.messages}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;

              return (
                <View style={[styles.messageWrap, mine && styles.myMessageWrap]}>
                  <Text style={styles.sender}>
                    {mine ? "You" : displayName(item.profiles)}
                    {item.optimistic ? " · sending..." : ""}
                  </Text>

                  <View style={[styles.bubble, mine && styles.myBubble]}>
                    {isUrl(item.content) ? (
                      <Pressable onPress={() => Linking.openURL(item.content)}>
                        <Text style={styles.linkText}>📍 Open location</Text>
                        <Text style={styles.urlText}>{item.content}</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.messageText}>{item.content}</Text>
                    )}
                  </View>
                </View>
              );
            }}
          />

          <View style={styles.composer}>
            <AppInput
              placeholder="Message..."
              value={content}
              onChangeText={setContent}
            />

            <AppButton title="Send" onPress={sendMessage} />
          </View>
        </>
      )}

      {activeTab === "members" && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Members</Text>

            {members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <View style={styles.memberBubble}>
                  <Text style={styles.memberInitial}>
                    {(displayName(member.profiles)[0] || "?").toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{displayName(member.profiles)}</Text>
                  <Text style={styles.muted}>{member.role || "member"}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Invite someone</Text>

            <View style={styles.inviteRow}>
              <AppInput
                placeholder="Username"
                value={inviteUsername}
                onChangeText={setInviteUsername}
              />

              <Pressable style={styles.inviteButton} onPress={inviteUser}>
                <Text style={styles.inviteText}>Invite</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    padding: 18,
    backgroundColor: "rgba(31,45,68,0.92)",
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: "900" },
  muted: { color: colors.muted },
  leaveButton: {
    backgroundColor: colors.red,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  leaveText: {
    color: colors.text,
    fontWeight: "900",
  },
  tabs: { flexDirection: "row", gap: 8, padding: 14 },
  tab: {
    flex: 1,
    backgroundColor: colors.bg2,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },
  activeTab: { backgroundColor: colors.violet },
  tabText: {
    color: colors.muted,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  activeTabText: { color: colors.text },
  messages: { padding: 18, paddingBottom: 30 },
  messageWrap: { marginBottom: 12, alignItems: "flex-start" },
  myMessageWrap: { alignItems: "flex-end" },
  sender: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  bubble: {
    maxWidth: "82%",
    backgroundColor: "rgba(31,45,68,0.95)",
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  myBubble: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  messageText: { color: colors.text, fontSize: 15 },
  linkText: { color: colors.text, fontWeight: "900" },
  urlText: { color: "#dbeafe", fontSize: 12, textDecorationLine: "underline" },
  composer: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(31,45,68,0.95)",
  },
  panel: { flex: 1 },
  panelContent: { padding: 18, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: "rgba(31,45,68,0.94)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 26,
    padding: 16,
    gap: 12,
    ...shadow,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  memberRow: {
    backgroundColor: colors.bg2,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberBubble: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInitial: {
    color: colors.text,
    fontWeight: "900",
  },
  memberName: {
    color: colors.text,
    fontWeight: "900",
  },
  inviteRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  inviteButton: {
    backgroundColor: colors.violet,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
  },
  inviteText: {
    color: colors.text,
    fontWeight: "900",
  },
});