import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    Pressable,
    RefreshControl,
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

const planColors = [
  "#7C5CFF",
  "#2DD4BF",
  "#FFB86B",
  "#FB7185",
  "#60A5FA",
  "#A78BFA",
  "#F2D6A2",
];

function todayKey() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function displayName(profile) {
  if (!profile) return "Someone";
  return profile.display_name || profile.username || profile.email || "Someone";
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
    return { error: "Use a date like 2026-05-16 or 05/16/2026." };
  }

  const date = new Date(year, month - 1, day);

  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!valid) return { error: "That date is not valid." };

  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`,
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

    return { error: "Enter a time like 6pm or 18:30." };
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
      return {
        error: "Use a time like 6pm, 6:30pm, 18:30, or leave it blank.",
      };
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
    return { error: "Use a real time like 6pm or 18:30." };
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`,
  };
}

function makeDateTime(dateInput, timeInput, allowBlankTime = true) {
  const parsedDate = parseDateInput(dateInput);

  if (parsedDate.error) return { error: parsedDate.error };

  const parsedTime = parseTimeInput(timeInput, allowBlankTime);

  if (parsedTime.error) return { error: parsedTime.error };

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

function formatStoredTime(time) {
  if (!time) return "";

  const [hour, minute] = String(time).split(":").map(Number);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CreatePlan() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);

  const [mode, setMode] = useState("event");
  const [scope, setScope] = useState("personal");
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(todayKey());
  const [taskTime, setTaskTime] = useState("");
  const [taskColor, setTaskColor] = useState("#2DD4BF");

  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState(todayKey());
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventColor, setEventColor] = useState("#7C5CFF");

  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedGroup = useMemo(() => {
    return groups.find((group) => group.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  async function loadProfile() {
    if (!user?.id) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(data);
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
      Alert.alert("Could not load groups", error.message);
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

    if (!selectedGroupId && cleanGroups.length > 0) {
      setSelectedGroupId(cleanGroups[0].id);
    }

    return cleanGroups;
  }

  async function updateLastSeen() {
    if (!user?.id) return;

    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  async function loadAll() {
    if (!user?.id) {
      router.replace("/login");
      return;
    }

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

  async function notifyGroupMembers(groupId, title, body) {
    if (!groupId) return;

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

  function getGroupId() {
    if (scope === "personal") return null;

    if (!selectedGroupId) {
      Alert.alert("Choose a group", "Pick the group this plan belongs to.");
      return undefined;
    }

    return selectedGroupId;
  }

  async function createTask() {
    const title = taskTitle.trim();

    if (!title) {
      return Alert.alert("Missing task", "Write the task first.");
    }

    const groupId = getGroupId();

    if (groupId === undefined) return;

    const due = makeDateTime(taskDate, taskTime, true);

    if (due.error) {
      return Alert.alert("Invalid date or time", due.error);
    }

    setSaving(true);
    setNotice("");

    try {
      const { error } = await supabase.from("planner_tasks").insert({
        creator_id: user.id,
        group_id: groupId,
        title,
        due_at: due.date.toISOString(),
        due_time: due.time,
        completed: false,
        color: taskColor,
      });

      if (error) throw error;

      if (groupId) {
        await notifyGroupMembers(
          groupId,
          "New group task",
          `${title} was added to ${selectedGroup?.name || "your group"}.`
        );

        await supabase.from("messages").insert({
          group_id: groupId,
          sender_id: user.id,
          content: `✅ Task created: ${title} — ${due.dateKey}${
            due.time ? ` at ${formatStoredTime(due.time)}` : ""
          }`,
          message_type: "system",
        });
      }

      setNotice(groupId ? "Group task created." : "Personal task created.");
      setTaskTitle("");
      setTaskDate(todayKey());
      setTaskTime("");
      setTaskColor("#2DD4BF");

      router.replace(groupId ? `/group/${groupId}` : "/planner");
    } catch (err) {
      Alert.alert("Could not create task", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createEvent() {
    const title = eventTitle.trim();

    if (!title) {
      return Alert.alert("Missing event", "Give the event a title.");
    }

    const groupId = getGroupId();

    if (groupId === undefined) return;

    const start = makeDateTime(eventDate, eventAllDay ? "" : eventStartTime, true);

    if (start.error) {
      return Alert.alert("Invalid date or time", start.error);
    }

    let endDate;
    let normalizedEndTime = null;

    if (eventAllDay) {
      endDate = new Date(start.date);
      endDate.setHours(23, 59, 0, 0);
    } else if (eventEndTime.trim()) {
      const end = makeDateTime(eventDate, eventEndTime, true);

      if (end.error) {
        return Alert.alert("Invalid end time", end.error);
      }

      endDate = end.date;
      normalizedEndTime = end.time;

      if (endDate <= start.date) {
        return Alert.alert("Invalid time", "End time must be after start time.");
      }
    } else {
      endDate = new Date(start.date.getTime() + 60 * 60 * 1000);
    }

    setSaving(true);
    setNotice("");

    try {
      const { error } = await supabase.from("planner_events").insert({
        creator_id: user.id,
        group_id: groupId,
        title,
        description: eventDescription.trim() || null,
        starts_at: start.date.toISOString(),
        ends_at: endDate.toISOString(),
        start_time: eventAllDay ? null : start.time,
        end_time: eventAllDay ? null : normalizedEndTime,
        is_all_day: eventAllDay,
        completed: false,
        color: eventColor,
      });

      if (error) throw error;

      if (groupId) {
        await notifyGroupMembers(
          groupId,
          "New group event",
          `${title} was added to ${selectedGroup?.name || "your group"}.`
        );

        await supabase.from("messages").insert({
          group_id: groupId,
          sender_id: user.id,
          content: `📅 Event created: ${title} — ${start.dateKey}${
            eventAllDay
              ? " all day"
              : start.time
              ? ` at ${formatStoredTime(start.time)}`
              : ""
          }`,
          message_type: "system",
        });
      }

      setNotice(groupId ? "Group event created." : "Personal event created.");
      setEventTitle("");
      setEventDescription("");
      setEventDate(todayKey());
      setEventStartTime("");
      setEventEndTime("");
      setEventAllDay(false);
      setEventColor("#7C5CFF");

      router.replace(groupId ? `/group/${groupId}` : "/planner");
    } catch (err) {
      Alert.alert("Could not create event", err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderColorPicker(selectedColor, setSelectedColor) {
    return (
      <View style={styles.colorRow}>
        {planColors.map((color) => (
          <Pressable
            key={color}
            onPress={() => setSelectedColor(color)}
            style={[
              styles.colorDot,
              { backgroundColor: color },
              selectedColor === color && styles.selectedColorDot,
            ]}
          />
        ))}
      </View>
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
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Create Plan</Text>
            <Text style={styles.subtitle}>One place to create tasks and events.</Text>
          </View>
        </View>

        {!!notice && (
          <Pressable onPress={() => setNotice("")} style={styles.notice}>
            <Text style={styles.noticeText}>✅ {notice}</Text>
          </Pressable>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <Text style={styles.heroKicker}>Quick create</Text>
          <Text style={styles.heroTitle}>
            Add it once. See it everywhere it belongs.
          </Text>

          <Text style={styles.heroText}>
            Personal plans show in Plans. Group plans show in Plans and inside the
            selected group.
          </Text>
        </View>

        <View style={styles.segmentCard}>
          <Text style={styles.sectionLabel}>What are you creating?</Text>

          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setMode("event")}
              style={[styles.segmentButton, mode === "event" && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === "event" && styles.segmentTextActive,
                ]}
              >
                Event
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMode("task")}
              style={[styles.segmentButton, mode === "task" && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === "task" && styles.segmentTextActive,
                ]}
              >
                Task
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Where should it live?</Text>

          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setScope("personal")}
              style={[styles.segmentButton, scope === "personal" && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  scope === "personal" && styles.segmentTextActive,
                ]}
              >
                Personal
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setScope("group")}
              style={[styles.segmentButton, scope === "group" && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  scope === "group" && styles.segmentTextActive,
                ]}
              >
                Group
              </Text>
            </Pressable>
          </View>

          {scope === "group" && (
            <View style={styles.groupPicker}>
              {groups.length === 0 ? (
                <View style={styles.emptyGroupBox}>
                  <Text style={styles.emptyGroupTitle}>No groups yet</Text>
                  <Text style={styles.emptyGroupText}>
                    Create or join a group before making shared plans.
                  </Text>

                  <AppButton
                    title="Go to Groups"
                    onPress={() => router.push("/groups")}
                    variant="soft"
                  />
                </View>
              ) : (
                groups.map((group) => (
                  <Pressable
                    key={group.id}
                    onPress={() => setSelectedGroupId(group.id)}
                    style={[
                      styles.groupOption,
                      selectedGroupId === group.id && styles.groupOptionActive,
                    ]}
                  >
                    <GroupAvatar
                      name={group.name}
                      color={group.avatar_color}
                      emoji={group.avatar_emoji}
                      avatarUrl={group.avatar_url}
                      size={44}
                    />

                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Text style={styles.groupSub}>
                        {selectedGroupId === group.id ? "Selected" : "Tap to select"}
                      </Text>
                    </View>

                    {selectedGroupId === group.id && (
                      <View style={styles.checkCircle}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>

        {mode === "event" ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Event details</Text>

            <AppInput
              label="Title"
              placeholder="Movie night"
              value={eventTitle}
              onChangeText={setEventTitle}
            />

            <AppInput
              label="Description"
              placeholder="Optional details"
              value={eventDescription}
              onChangeText={setEventDescription}
              multiline
            />

            <AppInput
              label="Date"
              placeholder="2026-05-16"
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
                  label="Start time"
                  placeholder="6pm"
                  value={eventStartTime}
                  onChangeText={setEventStartTime}
                />

                <AppInput
                  label="End time"
                  placeholder="8pm"
                  value={eventEndTime}
                  onChangeText={setEventEndTime}
                />
              </>
            )}

            <Text style={styles.sectionLabel}>Color</Text>
            {renderColorPicker(eventColor, setEventColor)}

            <AppButton
              title={saving ? "Creating..." : "Create Event"}
              onPress={createEvent}
              disabled={saving}
            />
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Task details</Text>

            <AppInput
              label="Title"
              placeholder="Buy snacks"
              value={taskTitle}
              onChangeText={setTaskTitle}
            />

            <AppInput
              label="Date"
              placeholder="2026-05-16"
              value={taskDate}
              onChangeText={setTaskDate}
            />

            <AppInput
              label="Due time"
              placeholder="Optional, ex: 6pm"
              value={taskTime}
              onChangeText={setTaskTime}
            />

            <Text style={styles.sectionLabel}>Color</Text>
            {renderColorPicker(taskColor, setTaskColor)}

            <AppButton
              title={saving ? "Creating..." : "Create Task"}
              onPress={createTask}
              disabled={saving}
            />
          </View>
        )}

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Cleaner rule</Text>
          <Text style={styles.ruleText}>
            The + button creates. Plans lets you view and edit. Groups lets you
            talk and see group-specific plans. No duplicated creation forms.
          </Text>
        </View>
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
    paddingBottom: 44,
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
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
  },
  notice: {
    backgroundColor: colors.greenSoft,
    borderColor: "rgba(45,212,191,0.45)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
  },
  noticeText: {
    color: colors.text,
    fontWeight: "900",
  },
  heroCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 30,
    padding: 20,
    gap: 12,
    overflow: "hidden",
    ...shadow,
  },
  heroGlow: {
    position: "absolute",
    top: -100,
    right: -90,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.12)",
  },
  heroKicker: {
    color: colors.gold,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  heroText: {
    color: colors.text2,
    fontWeight: "700",
    lineHeight: 21,
  },
  segmentCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 16,
    gap: 14,
    ...softShadow,
  },
  sectionLabel: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: colors.text,
  },
  groupPicker: {
    gap: 10,
  },
  groupOption: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  groupOptionActive: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  groupName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  groupSub: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 2,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: colors.text,
    fontWeight: "900",
  },
  emptyGroupBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 14,
    gap: 10,
  },
  emptyGroupTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  emptyGroupText: {
    color: colors.muted,
    fontWeight: "700",
    lineHeight: 20,
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
  formTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  toggle: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleActive: {
    backgroundColor: colors.greenSoft,
    borderColor: "rgba(45,212,191,0.45)",
  },
  toggleText: {
    color: colors.text,
    fontWeight: "900",
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorDot: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: colors.bg2,
  },
  selectedColorDot: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },
  ruleCard: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: "rgba(242,214,162,0.35)",
    borderRadius: 24,
    padding: 16,
    gap: 6,
  },
  ruleTitle: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 17,
  },
  ruleText: {
    color: colors.text2,
    fontWeight: "700",
    lineHeight: 21,
  },
});