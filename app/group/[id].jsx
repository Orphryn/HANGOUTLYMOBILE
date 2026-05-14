import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  PanResponder,
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

function todayKey() {
  const d = new Date();
  return toDateKey(d);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const clean = String(value || "").trim();

  if (!clean) {
    return { error: "Enter a date like 2026-05-16 or 05/16/2026." };
  }

  let year;
  let month;
  let day;

  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (slashMatch) {
    month = Number(slashMatch[1]);
    day = Number(slashMatch[2]);
    year = Number(slashMatch[3]);
  } else {
    return { error: "Use a real date like 2026-05-16 or 05/16/2026." };
  }

  const date = new Date(year, month - 1, day);

  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!valid) {
    return { error: "That date is not valid." };
  }

  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function parseTimeInput(value, allowBlank = true) {
  const clean = String(value || "").trim().toLowerCase();

  if (!clean) {
    if (allowBlank) {
      return {
        hour: 12,
        minute: 0,
        normalized: null,
      };
    }

    return { error: "Enter a time like 18:30." };
  }

  let match = clean.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  let hour;
  let minute;
  let suffix;

  if (match) {
    hour = Number(match[1]);
    minute = Number(match[2]);
    suffix = match[3];
  } else {
    match = clean.match(/^(\d{1,2})\s*(am|pm)$/);

    if (!match) {
      return { error: "Use a time like 18:30, 6pm, or leave it blank." };
    }

    hour = Number(match[1]);
    minute = 0;
    suffix = match[2];
  }

  if (suffix) {
    if (hour < 1 || hour > 12) {
      return { error: "AM/PM times must be between 1 and 12." };
    }

    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { error: "Use a real time like 18:30." };
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function makeDateTime(dateInput, timeInput, allowBlankTime = true) {
  const parsedDate = parseDateInput(dateInput);

  if (parsedDate.error) {
    return { error: parsedDate.error };
  }

  const parsedTime = parseTimeInput(timeInput, allowBlankTime);

  if (parsedTime.error) {
    return { error: parsedTime.error };
  }

  const date = new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
    0
  );

  if (Number.isNaN(date.getTime())) {
    return { error: "That date or time is invalid." };
  }

  return {
    date,
    dateKey: parsedDate.dateKey,
    time: parsedTime.normalized,
  };
}

function chatBackgroundStyle(background) {
  if (background === "warm") return { backgroundColor: "#2b1d25" };
  if (background === "ocean") return { backgroundColor: "#102b3a" };
  if (background === "forest") return { backgroundColor: "#142a20" };
  return { backgroundColor: colors.bg };
}

function formatMessageDate(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (toDateKey(date) === toDateKey(today)) return "Today";
  if (toDateKey(date) === toDateKey(yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatClock(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPlanDate(value) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DateDivider({ label }) {
  return (
    <View style={styles.dateDivider}>
      <Text style={styles.dateDividerText}>{label}</Text>
    </View>
  );
}

function MessageRow({
  item,
  mine,
  showDateDivider,
  visibleTimeId,
  setVisibleTimeId,
}) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 18) {
          setVisibleTimeId(item.id);
        }
      },
      onPanResponderRelease: () => {
        setVisibleTimeId(null);
      },
      onPanResponderTerminate: () => {
        setVisibleTimeId(null);
      },
    })
  ).current;

  const visibleTime = visibleTimeId === item.id;

  return (
    <View>
      {showDateDivider && <DateDivider label={formatMessageDate(item.created_at)} />}

      <View
        {...panResponder.panHandlers}
        style={[styles.messageWrap, mine && styles.myMessageWrap]}
      >
        <Text style={styles.sender}>
          {mine ? "You" : displayName(item.profiles)}
          {item.optimistic ? " · sending..." : ""}
        </Text>

        <View style={[styles.timeRevealRow, mine && styles.myTimeRevealRow]}>
          {!mine && visibleTime && (
            <Text style={styles.revealedTime}>{formatClock(item.created_at)}</Text>
          )}

          <Pressable
            onLongPress={() => setVisibleTimeId(item.id)}
            onPress={() => {
              if (visibleTime) setVisibleTimeId(null);
            }}
            style={[styles.bubble, mine && styles.myBubble]}
          >
            {isUrl(item.content) ? (
              <Pressable onPress={() => Linking.openURL(item.content)}>
                <Text style={styles.linkText}>📍 Open location</Text>
                <Text style={styles.urlText}>{item.content}</Text>
              </Pressable>
            ) : (
              <Text style={styles.messageText}>{item.content}</Text>
            )}
          </Pressable>

          {mine && visibleTime && (
            <Text style={styles.revealedTime}>{formatClock(item.created_at)}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function GroupDetail() {
  const params = useLocalSearchParams();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState("chat");
  const [notice, setNotice] = useState("");
  const [visibleTimeId, setVisibleTimeId] = useState(null);

  const [group, setGroup] = useState(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);

  const [content, setContent] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(todayKey());
  const [taskDueTime, setTaskDueTime] = useState("");

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(todayKey());
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);

  async function loadGroup() {
    if (!groupId || !user?.id) return;

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("id, username, display_name, email")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(myProfile);

    const { data: groupData, error: groupError } = await supabase
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
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(150);

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
      .eq("group_id", groupId)
      .eq("status", "accepted");

    setMembers(memberRows || []);

    const { data: taskRows, error: taskError } = await supabase
      .from("planner_tasks")
      .select(`
        id,
        creator_id,
        group_id,
        title,
        due_at,
        due_time,
        completed,
        created_at
      `)
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (taskError) {
      Alert.alert("Could not load tasks", taskError.message);
    } else {
      setTasks(taskRows || []);
    }

    const { data: eventRows, error: eventError } = await supabase
      .from("planner_events")
      .select(`
        id,
        creator_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        start_time,
        end_time,
        is_all_day,
        completed,
        created_at
      `)
      .eq("group_id", groupId)
      .order("starts_at", { ascending: true });

    if (eventError) {
      Alert.alert("Could not load events", eventError.message);
    } else {
      setEvents(eventRows || []);
    }
  }

  useEffect(() => {
    if (!groupId || !user?.id) return;

    loadGroup();

    const channel = supabase
      .channel(`group-room-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${groupId}`,
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

          const finalMessage = fullMessage || incoming;

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === finalMessage.id)) return prev;

            const optimisticIndex = prev.findIndex(
              (msg) =>
                msg.optimistic &&
                msg.sender_id === finalMessage.sender_id &&
                msg.content === finalMessage.content
            );

            if (optimisticIndex !== -1) {
              const copy = [...prev];
              copy[optimisticIndex] = { ...finalMessage, optimistic: false };
              return copy;
            }

            return [finalMessage, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planner_tasks",
          filter: `group_id=eq.${groupId}`,
        },
        () => loadGroup()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planner_events",
          filter: `group_id=eq.${groupId}`,
        },
        () => loadGroup()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, user?.id]);

  async function notifyGroupMembers(title, body) {
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

  async function sendMessage() {
    const text = content.trim();
    if (!text) return;

    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      id: tempId,
      group_id: groupId,
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
        group_id: groupId,
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

  async function createTask() {
    const title = taskTitle.trim();

    if (!title) {
      return Alert.alert("Missing task", "Write the task first.");
    }

    const due = makeDateTime(taskDate, taskDueTime, true);

    if (due.error) {
      return Alert.alert("Invalid date or time", due.error);
    }

    const { data: createdTask, error } = await supabase
      .from("planner_tasks")
      .insert({
        creator_id: user.id,
        group_id: groupId,
        title,
        due_at: due.date.toISOString(),
        due_time: due.time,
        completed: false,
      })
      .select(`
        id,
        creator_id,
        group_id,
        title,
        due_at,
        due_time,
        completed,
        created_at
      `)
      .single();

    if (error) {
      return Alert.alert("Task failed", error.message);
    }

    await notifyGroupMembers(
      "New group task",
      `${title} was added to ${group?.name || "this group"}.`
    );

    await supabase.from("messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: `✅ Task created: ${title} — ${due.dateKey}${
        due.time ? ` at ${due.time}` : ""
      }`,
    });

    setTasks((prev) => [createdTask, ...prev]);
    setTaskTitle("");
    setTaskDate(todayKey());
    setTaskDueTime("");
    setNotice(`Task created: ${title}`);

    await loadGroup();
  }

  async function createEvent() {
    const title = eventTitle.trim();

    if (!title) {
      return Alert.alert("Missing event", "Give the event a title.");
    }

    const start = makeDateTime(eventDate, eventAllDay ? "" : eventStartTime, true);

    if (start.error) {
      return Alert.alert("Invalid date or time", start.error);
    }

    let endDate;

    if (eventEndTime.trim()) {
      const end = makeDateTime(eventDate, eventEndTime, true);

      if (end.error) {
        return Alert.alert("Invalid end time", end.error);
      }

      endDate = end.date;
    } else {
      endDate = new Date(start.date.getTime() + 60 * 60 * 1000);
    }

    const { data: createdEvent, error } = await supabase
      .from("planner_events")
      .insert({
        creator_id: user.id,
        group_id: groupId,
        title,
        starts_at: start.date.toISOString(),
        ends_at: endDate.toISOString(),
        start_time: eventAllDay ? null : start.time,
        end_time: eventAllDay ? null : eventEndTime.trim() || null,
        is_all_day: eventAllDay,
        completed: false,
      })
      .select(`
        id,
        creator_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        start_time,
        end_time,
        is_all_day,
        completed,
        created_at
      `)
      .single();

    if (error) {
      return Alert.alert("Event failed", error.message);
    }

    await notifyGroupMembers(
      "New group event",
      `${title} was added to ${group?.name || "this group"}.`
    );

    await supabase.from("messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: `📅 Event created: ${title} — ${start.dateKey}${
        eventAllDay ? " all day" : start.time ? ` at ${start.time}` : ""
      }`,
    });

    setEvents((prev) => [createdEvent, ...prev]);
    setEventTitle("");
    setEventDate(todayKey());
    setEventStartTime("");
    setEventEndTime("");
    setEventAllDay(false);
    setNotice(`Event created: ${title}`);

    await loadGroup();
  }

  async function toggleTask(task) {
    const { error } = await supabase
      .from("planner_tasks")
      .update({ completed: !task.completed })
      .eq("id", task.id);

    if (error) return Alert.alert("Task update failed", error.message);

    await loadGroup();
  }

  async function deleteTask(task) {
    const { error } = await supabase
      .from("planner_tasks")
      .delete()
      .eq("id", task.id);

    if (error) return Alert.alert("Delete failed", error.message);

    await loadGroup();
  }

  async function deleteEvent(event) {
    const { error } = await supabase
      .from("planner_events")
      .delete()
      .eq("id", event.id);

    if (error) return Alert.alert("Delete failed", error.message);

    await loadGroup();
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
      group_id: groupId,
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

  async function actuallyLeaveGroup() {
    const { error } = await supabase.rpc("leave_group_and_cleanup", {
      input_group_id: groupId,
    });

    if (error) {
      return Alert.alert("Could not leave group", error.message);
    }

    router.replace("/dashboard");
  }

  async function leaveGroup() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Leave group? Your plans for this group will be erased."
      );

      if (confirmed) {
        await actuallyLeaveGroup();
      }

      return;
    }

    Alert.alert(
      "Leave group?",
      "Your plans for this group will be erased.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: actuallyLeaveGroup,
        },
      ]
    );
  }

  const completedTasks = tasks.filter((task) => task.completed);
  const openTasks = tasks.filter((task) => !task.completed);
  const progress = tasks.length
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0;

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
          <Text style={styles.muted}>
            {members.length} member{members.length === 1 ? "" : "s"}
          </Text>
        </View>

        <Pressable onPress={leaveGroup} style={styles.leaveButton}>
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
      </View>

      {!!notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>✅ {notice}</Text>
        </View>
      )}

      <View style={styles.tabs}>
        {["chat", "tasks", "calendar", "members"].map((tab) => (
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
            renderItem={({ item, index }) => {
              const mine = item.sender_id === user?.id;
              const nextOlder = messages[index + 1];

              const showDateDivider =
                !nextOlder ||
                toDateKey(new Date(item.created_at)) !==
                  toDateKey(new Date(nextOlder.created_at));

              return (
                <MessageRow
                  item={item}
                  mine={mine}
                  showDateDivider={showDateDivider}
                  visibleTimeId={visibleTimeId}
                  setVisibleTimeId={setVisibleTimeId}
                />
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Quiet room. Say the first thing.</Text>
            }
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

      {activeTab === "tasks" && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Group tasks</Text>
            <Text style={styles.muted}>
              {completedTasks.length}/{tasks.length} complete • {progress}%
            </Text>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>

            <AppInput
              placeholder="Add a task..."
              value={taskTitle}
              onChangeText={setTaskTitle}
            />

            <AppInput
              placeholder="Date, ex: 2026-05-16 or 05/16/2026"
              value={taskDate}
              onChangeText={setTaskDate}
            />

            <AppInput
              placeholder="Due time optional, ex: 18:30 or 6pm"
              value={taskDueTime}
              onChangeText={setTaskDueTime}
            />

            <AppButton title="Add Task" onPress={createTask} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>To do</Text>

            {openTasks.length === 0 ? (
              <Text style={styles.emptyText}>Nothing open.</Text>
            ) : (
              openTasks.map((task) => (
                <View key={task.id} style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{task.title}</Text>
                    <Text style={styles.muted}>
                      {formatPlanDate(task.due_at)}
                      {task.due_time ? ` • ${task.due_time}` : " • No time set"}
                    </Text>
                  </View>

                  <Pressable onPress={() => toggleTask(task)} style={styles.doneButton}>
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>

                  <Pressable onPress={() => deleteTask(task)} style={styles.deleteButton}>
                    <Text style={styles.deleteText}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Done</Text>

            {completedTasks.length === 0 ? (
              <Text style={styles.emptyText}>No completed tasks yet.</Text>
            ) : (
              completedTasks.map((task) => (
                <View key={task.id} style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, styles.completedText]}>{task.title}</Text>
                    <Text style={styles.muted}>Completed</Text>
                  </View>

                  <Pressable onPress={() => toggleTask(task)} style={styles.doneButton}>
                    <Text style={styles.doneText}>Reopen</Text>
                  </Pressable>

                  <Pressable onPress={() => deleteTask(task)} style={styles.deleteButton}>
                    <Text style={styles.deleteText}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === "calendar" && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Group calendar</Text>

            <AppInput
              placeholder="Event title"
              value={eventTitle}
              onChangeText={setEventTitle}
            />

            <AppInput
              placeholder="Date, ex: 2026-05-16 or 05/16/2026"
              value={eventDate}
              onChangeText={setEventDate}
            />

            <Pressable
              onPress={() => setEventAllDay((value) => !value)}
              style={[styles.toggle, eventAllDay && styles.toggleActive]}
            >
              <Text style={styles.toggleText}>
                {eventAllDay ? "✓ All-day event" : "Timed event"}
              </Text>
            </Pressable>

            {!eventAllDay && (
              <>
                <AppInput
                  placeholder="Start time optional, ex: 18:30 or 6pm"
                  value={eventStartTime}
                  onChangeText={setEventStartTime}
                />

                <AppInput
                  placeholder="End time optional, ex: 20:00"
                  value={eventEndTime}
                  onChangeText={setEventEndTime}
                />
              </>
            )}

            <AppButton title="Create Event" onPress={createEvent} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Upcoming</Text>

            {events.length === 0 ? (
              <Text style={styles.emptyText}>Nothing planned yet.</Text>
            ) : (
              events.map((event) => (
                <View key={event.id} style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>📅 {event.title}</Text>
                    <Text style={styles.muted}>
                      {formatPlanDate(event.starts_at)}
                      {event.is_all_day
                        ? " • All day"
                        : event.start_time
                        ? ` • ${event.start_time}${event.end_time ? ` - ${event.end_time}` : ""}`
                        : " • No time"}
                    </Text>
                  </View>

                  <Pressable onPress={() => deleteEvent(event)} style={styles.deleteButton}>
                    <Text style={styles.deleteText}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>
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
  notice: {
    backgroundColor: "rgba(45,212,191,0.16)",
    borderBottomWidth: 1,
    borderColor: colors.green,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  noticeText: {
    color: colors.text,
    fontWeight: "900",
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    backgroundColor: "rgba(17,24,39,0.85)",
  },
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
    fontSize: 12,
  },
  activeTabText: { color: colors.text },
  messages: { padding: 18, paddingBottom: 30 },
  dateDivider: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 12,
  },
  dateDividerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  messageWrap: { marginBottom: 12, alignItems: "flex-start" },
  myMessageWrap: { alignItems: "flex-end" },
  sender: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  timeRevealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  myTimeRevealRow: {
    justifyContent: "flex-end",
  },
  revealedTime: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
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
  progressTrack: {
    height: 10,
    backgroundColor: colors.bg2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.green,
  },
  rowCard: {
    backgroundColor: colors.bg2,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  completedText: {
    textDecorationLine: "line-through",
    opacity: 0.55,
  },
  doneButton: {
    backgroundColor: colors.violet,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  doneText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: colors.red,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  deleteText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
  },
  toggle: {
    backgroundColor: colors.bg2,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleActive: {
    backgroundColor: "rgba(45,212,191,0.18)",
    borderColor: colors.green,
  },
  toggleText: {
    color: colors.text,
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
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 20,
  },
});