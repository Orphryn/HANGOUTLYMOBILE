import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import BottomNav from "../components/BottomNav";
import GroupAvatar from "../components/GroupAvatar";
import ProfileAvatar from "../components/ProfileAvatar";
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

function displayName(profile) {
  if (!profile) return "Friend";
  return profile.display_name || profile.username || profile.email || "Friend";
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
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

function formatDate(value) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  const sameDay = toDateKey(date) === todayKey();

  if (sameDay) return "Today";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateInput(value) {
  if (!value) return todayKey();

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return todayKey();

  return toDateKey(date);
}

function formatEventTime(event) {
  if (event.is_all_day) return "All day";

  const start = event.start_time ? formatStoredTime(event.start_time) : "";
  const end = event.end_time ? formatStoredTime(event.end_time) : "";

  if (start && end) return `${start} - ${end}`;
  if (start) return start;

  return "No time";
}

function formatTaskTime(task) {
  return task.due_time ? formatStoredTime(task.due_time) : "No time";
}

function buildMonthDays(currentMonthDate) {
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();

  const start = new Date(year, month, 1 - startDay);

  const days = [];

  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);

    days.push({
      date: day,
      key: toDateKey(day),
      inMonth: day.getMonth() === month,
      dayNumber: day.getDate(),
      isToday: toDateKey(day) === todayKey(),
    });
  }

  return days;
}

export default function Planner() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [creatorMap, setCreatorMap] = useState({});

  const [activeView, setActiveView] = useState("calendar");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey());
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [editingType, setEditingType] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState(todayKey());
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editAllDay, setEditAllDay] = useState(false);
  const [editColor, setEditColor] = useState("#7C5CFF");
  const [editCompleted, setEditCompleted] = useState(false);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const groupMap = useMemo(() => {
    const map = {};

    for (const group of groups) {
      map[group.id] = group;
    }

    return map;
  }, [groups]);

  const monthDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (scopeFilter === "personal") return !task.group_id;
      if (scopeFilter === "group") return !!task.group_id;
      return true;
    });
  }, [tasks, scopeFilter]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      if (scopeFilter === "personal") return !event.group_id;
      if (scopeFilter === "group") return !!event.group_id;
      return true;
    });
  }, [events, scopeFilter]);

  const selectedDayTasks = useMemo(() => {
    return visibleTasks
      .filter((task) => toDateKey(new Date(task.due_at)) === selectedDateKey)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  }, [visibleTasks, selectedDateKey]);

  const selectedDayEvents = useMemo(() => {
    return visibleEvents
      .filter((event) => toDateKey(new Date(event.starts_at)) === selectedDateKey)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [visibleEvents, selectedDateKey]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();

    return visibleEvents
      .filter((event) => {
        const startsAt = new Date(event.starts_at).getTime();
        return !Number.isNaN(startsAt) && startsAt >= now - 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [visibleEvents]);

  const openTasks = useMemo(() => {
    return visibleTasks
      .filter((task) => !task.completed)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  }, [visibleTasks]);

  const completedTasks = useMemo(() => {
    return visibleTasks
      .filter((task) => task.completed)
      .sort((a, b) => new Date(b.due_at) - new Date(a.due_at));
  }, [visibleTasks]);

  const monthLabel = currentMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  async function updateLastSeen() {
    if (!user?.id) return;

    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }

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
        .filter((group) => group?.id) || [];

    setGroups(cleanGroups);

    return cleanGroups;
  }

  async function attachCreators(items) {
    const ids = [
      ...new Set((items || []).map((item) => item.creator_id).filter(Boolean)),
    ];

    if (ids.length === 0) {
      setCreatorMap({});
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, email, avatar_url")
      .in("id", ids);

    const map = {};

    for (const row of data || []) {
      map[row.id] = row;
    }

    setCreatorMap(map);
  }

  async function loadPlans(groupRows) {
    const groupIds = groupRows.map((group) => group.id);

    const [{ data: taskRows, error: taskError }, { data: eventRows, error: eventError }] =
      await Promise.all([
        supabase
          .from("planner_tasks")
          .select(
            `
            id,
            creator_id,
            group_id,
            title,
            due_at,
            due_time,
            completed,
            color,
            created_at
          `
          )
          .order("due_at", { ascending: true }),
        supabase
          .from("planner_events")
          .select(
            `
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
            color,
            created_at
          `
          )
          .order("starts_at", { ascending: true }),
      ]);

    if (taskError) {
      Alert.alert("Could not load tasks", taskError.message);
      setTasks([]);
    } else {
      const cleanTasks =
        taskRows?.filter(
          (task) =>
            task.creator_id === user.id ||
            !task.group_id ||
            groupIds.includes(task.group_id)
        ) || [];

      setTasks(cleanTasks);
    }

    if (eventError) {
      Alert.alert("Could not load events", eventError.message);
      setEvents([]);
    } else {
      const cleanEvents =
        eventRows?.filter(
          (event) =>
            event.creator_id === user.id ||
            !event.group_id ||
            groupIds.includes(event.group_id)
        ) || [];

      setEvents(cleanEvents);
    }

    await attachCreators([...(taskRows || []), ...(eventRows || [])]);
  }

  async function loadAll() {
    if (!user?.id) {
      router.replace("/login");
      return;
    }

    await updateLastSeen();
    await loadProfile();

    const groupRows = await loadGroups();

    await loadPlans(groupRows);
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

  function previousMonth() {
    setCurrentMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCurrentMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1));
  }

  function getCreatorName(item) {
    if (item.creator_id === user?.id) return "You";
    return displayName(creatorMap[item.creator_id]);
  }

  function getScopeLabel(item) {
    if (!item.group_id) return "Personal";
    return groupMap[item.group_id]?.name || "Group";
  }

  function canEdit(item) {
    return item.creator_id === user?.id;
  }

  function openEdit(type, item) {
    setEditingType(type);
    setEditingItem(item);

    setEditTitle(item.title || "");
    setEditColor(item.color || (type === "event" ? "#7C5CFF" : "#2DD4BF"));

    if (type === "event") {
      setEditDescription(item.description || "");
      setEditDate(formatDateInput(item.starts_at));
      setEditStartTime(item.start_time || "");
      setEditEndTime(item.end_time || "");
      setEditAllDay(item.is_all_day === true);
      setEditCompleted(item.completed === true);
    } else {
      setEditDescription("");
      setEditDate(formatDateInput(item.due_at));
      setEditStartTime(item.due_time || "");
      setEditEndTime("");
      setEditAllDay(false);
      setEditCompleted(item.completed === true);
    }
  }

  function closeEdit() {
    setEditingType(null);
    setEditingItem(null);
    setEditTitle("");
    setEditDescription("");
    setEditDate(todayKey());
    setEditStartTime("");
    setEditEndTime("");
    setEditAllDay(false);
    setEditColor("#7C5CFF");
    setEditCompleted(false);
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

  async function saveEdit() {
    if (!editingItem || !editingType) return;

    if (!canEdit(editingItem)) {
      return Alert.alert("View only", "Only the creator can edit this plan.");
    }

    const cleanTitle = editTitle.trim();

    if (!cleanTitle) {
      return Alert.alert("Missing title", "The title cannot be blank.");
    }

    setSaving(true);

    try {
      if (editingType === "task") {
        const due = makeDateTime(editDate, editStartTime, true);

        if (due.error) {
          setSaving(false);
          return Alert.alert("Invalid date or time", due.error);
        }

        const { error } = await supabase
          .from("planner_tasks")
          .update({
            title: cleanTitle,
            due_at: due.date.toISOString(),
            due_time: due.time,
            completed: editCompleted,
            color: editColor,
          })
          .eq("id", editingItem.id)
          .eq("creator_id", user.id);

        if (error) throw error;

        if (editingItem.group_id) {
          await notifyGroupMembers(
            editingItem.group_id,
            "Task updated",
            `${cleanTitle} was updated.`
          );
        }

        setNotice("Task updated.");
      } else {
        const start = makeDateTime(editDate, editAllDay ? "" : editStartTime, true);

        if (start.error) {
          setSaving(false);
          return Alert.alert("Invalid date or time", start.error);
        }

        let endDate;
        let normalizedEndTime = null;

        if (editAllDay) {
          endDate = new Date(start.date);
          endDate.setHours(23, 59, 0, 0);
        } else if (editEndTime.trim()) {
          const end = makeDateTime(editDate, editEndTime, true);

          if (end.error) {
            setSaving(false);
            return Alert.alert("Invalid end time", end.error);
          }

          endDate = end.date;
          normalizedEndTime = end.time;

          if (endDate <= start.date) {
            setSaving(false);
            return Alert.alert("Invalid time", "End time must be after start time.");
          }
        } else {
          endDate = new Date(start.date.getTime() + 60 * 60 * 1000);
        }

        const { error } = await supabase
          .from("planner_events")
          .update({
            title: cleanTitle,
            description: editDescription.trim() || null,
            starts_at: start.date.toISOString(),
            ends_at: endDate.toISOString(),
            start_time: editAllDay ? null : start.time,
            end_time: editAllDay ? null : normalizedEndTime,
            is_all_day: editAllDay,
            completed: editCompleted,
            color: editColor,
          })
          .eq("id", editingItem.id)
          .eq("creator_id", user.id);

        if (error) throw error;

        if (editingItem.group_id) {
          await notifyGroupMembers(
            editingItem.group_id,
            "Event updated",
            `${cleanTitle} was updated.`
          );
        }

        setNotice("Event updated.");
      }

      closeEdit();
      await loadAll();
    } catch (err) {
      Alert.alert("Could not save changes", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTaskComplete(task) {
    if (!canEdit(task)) {
      return Alert.alert("View only", "Only the creator can update this task.");
    }

    const { error } = await supabase
      .from("planner_tasks")
      .update({ completed: !task.completed })
      .eq("id", task.id)
      .eq("creator_id", user.id);

    if (error) {
      Alert.alert("Could not update task", error.message);
      return;
    }

    await loadAll();
  }

  async function deletePlan() {
    if (!editingItem || !editingType) return;

    if (!canEdit(editingItem)) {
      return Alert.alert("View only", "Only the creator can delete this plan.");
    }

    const doDelete = async () => {
      setSaving(true);

      try {
        const table = editingType === "task" ? "planner_tasks" : "planner_events";

        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id", editingItem.id)
          .eq("creator_id", user.id);

        if (error) throw error;

        setNotice(editingType === "task" ? "Task deleted." : "Event deleted.");
        closeEdit();
        await loadAll();
      } catch (err) {
        Alert.alert("Could not delete", err.message);
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm("Delete this plan?");
      if (confirmed) await doDelete();
      return;
    }

    Alert.alert("Delete plan?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  }

  function renderColorPicker() {
    return (
      <View style={styles.colorRow}>
        {planColors.map((color) => (
          <Pressable
            key={color}
            onPress={() => setEditColor(color)}
            style={[
              styles.colorDot,
              { backgroundColor: color },
              editColor === color && styles.selectedColorDot,
            ]}
          />
        ))}
      </View>
    );
  }

  function renderScopePill(item) {
    const group = item.group_id ? groupMap[item.group_id] : null;

    return (
      <View style={styles.scopePill}>
        {group ? (
          <GroupAvatar
            name={group.name}
            color={group.avatar_color}
            emoji={group.avatar_emoji}
            avatarUrl={group.avatar_url}
            size={22}
          />
        ) : (
          <View style={styles.personalDot}>
            <Text style={styles.personalDotText}>Me</Text>
          </View>
        )}

        <Text style={styles.scopePillText}>{getScopeLabel(item)}</Text>
      </View>
    );
  }

  function renderEventCard(event) {
    const editable = canEdit(event);

    return (
      <Pressable
        key={`event-${event.id}`}
        onPress={() => openEdit("event", event)}
        style={styles.planCard}
      >
        <View style={[styles.colorBar, { backgroundColor: event.color || colors.violet }]} />

        <View style={{ flex: 1 }}>
          <View style={styles.planTopRow}>
            <Text style={styles.planTitle}>📅 {event.title}</Text>
            <Text style={editable ? styles.editableText : styles.viewOnlyText}>
              {editable ? "Edit" : "View"}
            </Text>
          </View>

          <Text style={styles.planMeta}>
            {formatDate(event.starts_at)} • {formatEventTime(event)}
          </Text>

          {!!event.description && (
            <Text numberOfLines={2} style={styles.planDescription}>
              {event.description}
            </Text>
          )}

          <View style={styles.pillRow}>
            {renderScopePill(event)}
            <Text style={styles.smallPill}>By {getCreatorName(event)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  function renderTaskCard(task) {
    const editable = canEdit(task);

    return (
      <Pressable
        key={`task-${task.id}`}
        onPress={() => openEdit("task", task)}
        style={styles.planCard}
      >
        <View style={[styles.colorBar, { backgroundColor: task.color || colors.green }]} />

        <Pressable
          onPress={() => toggleTaskComplete(task)}
          style={[
            styles.checkBox,
            task.completed && styles.checkBoxDone,
            !editable && styles.checkBoxDisabled,
          ]}
        >
          <Text style={styles.checkText}>{task.completed ? "✓" : ""}</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={styles.planTopRow}>
            <Text style={[styles.planTitle, task.completed && styles.completedTitle]}>
              ✅ {task.title}
            </Text>

            <Text style={editable ? styles.editableText : styles.viewOnlyText}>
              {editable ? "Edit" : "View"}
            </Text>
          </View>

          <Text style={styles.planMeta}>
            {formatDate(task.due_at)} • {formatTaskTime(task)}
          </Text>

          <View style={styles.pillRow}>
            {renderScopePill(task)}
            <Text style={styles.smallPill}>By {getCreatorName(task)}</Text>
            {task.completed && <Text style={styles.donePill}>Done</Text>}
          </View>
        </View>
      </Pressable>
    );
  }

  function renderCalendarDay(day) {
    const dayEvents = visibleEvents.filter(
      (event) => toDateKey(new Date(event.starts_at)) === day.key
    );

    const dayTasks = visibleTasks.filter(
      (task) => toDateKey(new Date(task.due_at)) === day.key
    );

    const hasItems = dayEvents.length + dayTasks.length > 0;
    const selected = selectedDateKey === day.key;

    return (
      <Pressable
        key={day.key}
        onPress={() => setSelectedDateKey(day.key)}
        style={[
          styles.dayCell,
          !day.inMonth && styles.dayCellMuted,
          day.isToday && styles.dayCellToday,
          selected && styles.dayCellSelected,
        ]}
      >
        <Text
          style={[
            styles.dayNumber,
            !day.inMonth && styles.dayNumberMuted,
            selected && styles.dayNumberSelected,
          ]}
        >
          {day.dayNumber}
        </Text>

        {hasItems && (
          <View style={styles.dayDots}>
            {dayEvents.slice(0, 2).map((event) => (
              <View
                key={`event-dot-${event.id}`}
                style={[styles.dayDot, { backgroundColor: event.color || colors.violet }]}
              />
            ))}

            {dayTasks.slice(0, 2).map((task) => (
              <View
                key={`task-dot-${task.id}`}
                style={[styles.dayDot, { backgroundColor: task.color || colors.green }]}
              />
            ))}
          </View>
        )}
      </Pressable>
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
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Plans</Text>
            <Text style={styles.title}>Your schedule</Text>
            <Text style={styles.subtitle}>View and edit tasks/events.</Text>
          </View>

          <Pressable onPress={() => router.push("/settings")}>
            <ProfileAvatar profile={profile} size={52} showOnline online ring />
          </Pressable>
        </View>

        {!!notice && (
          <Pressable onPress={() => setNotice("")} style={styles.notice}>
            <Text style={styles.noticeText}>✅ {notice}</Text>
          </Pressable>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <View>
            <Text style={styles.heroKicker}>Overview</Text>
            <Text style={styles.heroTitle}>
              {upcomingEvents.length + openTasks.length}
            </Text>
            <Text style={styles.heroText}>active plans ahead</Text>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{upcomingEvents.length}</Text>
              <Text style={styles.heroStatLabel}>events</Text>
            </View>

            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{openTasks.length}</Text>
              <Text style={styles.heroStatLabel}>tasks</Text>
            </View>
          </View>
        </View>

        <View style={styles.controlCard}>
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setActiveView("calendar")}
              style={[
                styles.segmentButton,
                activeView === "calendar" && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeView === "calendar" && styles.segmentTextActive,
                ]}
              >
                Calendar
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveView("list")}
              style={[
                styles.segmentButton,
                activeView === "list" && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeView === "list" && styles.segmentTextActive,
                ]}
              >
                List
              </Text>
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {["all", "personal", "group"].map((filter) => (
              <Pressable
                key={filter}
                onPress={() => setScopeFilter(filter)}
                style={[
                  styles.filterButton,
                  scopeFilter === filter && styles.filterActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    scopeFilter === filter && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {activeView === "calendar" ? (
          <>
            <View style={styles.calendarCard}>
              <View style={styles.monthHeader}>
                <Pressable onPress={previousMonth} style={styles.monthButton}>
                  <Text style={styles.monthButtonText}>‹</Text>
                </Pressable>

                <Text style={styles.monthTitle}>{monthLabel}</Text>

                <Pressable onPress={nextMonth} style={styles.monthButton}>
                  <Text style={styles.monthButtonText}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <Text key={`${day}-${index}`} style={styles.weekDay}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>{monthDays.map(renderCalendarDay)}</View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>SELECTED DAY</Text>
              <Text style={styles.sectionLink}>{selectedDateKey}</Text>
            </View>

            {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nothing on this day</Text>
                <Text style={styles.emptyText}>
                  Use the + button to create a task or event.
                </Text>
              </View>
            ) : (
              <View style={styles.listStack}>
                {selectedDayEvents.map(renderEventCard)}
                {selectedDayTasks.map(renderTaskCard)}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
              <Text style={styles.sectionLink}>{upcomingEvents.length}</Text>
            </View>

            {upcomingEvents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No upcoming events</Text>
                <Text style={styles.emptyText}>Create one with the + button.</Text>
              </View>
            ) : (
              <View style={styles.listStack}>{upcomingEvents.map(renderEventCard)}</View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>OPEN TASKS</Text>
              <Text style={styles.sectionLink}>{openTasks.length}</Text>
            </View>

            {openTasks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No open tasks</Text>
                <Text style={styles.emptyText}>Create one with the + button.</Text>
              </View>
            ) : (
              <View style={styles.listStack}>{openTasks.map(renderTaskCard)}</View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>COMPLETED</Text>
              <Text style={styles.sectionLink}>{completedTasks.length}</Text>
            </View>

            {completedTasks.length > 0 && (
              <View style={styles.listStack}>
                {completedTasks.slice(0, 12).map(renderTaskCard)}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <BottomNav active="plans" />

      <Modal visible={!!editingItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.editSheet}>
            <View style={styles.editHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.editKicker}>
                  {editingType === "task" ? "Task" : "Event"}
                </Text>
                <Text style={styles.editTitle}>
                  {canEdit(editingItem || {}) ? "Edit plan" : "View plan"}
                </Text>
              </View>

              <Pressable onPress={closeEdit} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.editContent}
            >
              <AppInput
                label="Title"
                placeholder="Title"
                value={editTitle}
                onChangeText={setEditTitle}
                editable={canEdit(editingItem || {})}
              />

              {editingType === "event" && (
                <AppInput
                  label="Description"
                  placeholder="Optional details"
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  editable={canEdit(editingItem || {})}
                />
              )}

              <AppInput
                label="Date"
                placeholder="2026-05-16"
                value={editDate}
                onChangeText={setEditDate}
                editable={canEdit(editingItem || {})}
              />

              {editingType === "event" ? (
                <>
                  <Pressable
                    onPress={() =>
                      canEdit(editingItem || {}) &&
                      setEditAllDay((value) => !value)
                    }
                    style={[styles.toggle, editAllDay && styles.toggleActive]}
                  >
                    <Text style={styles.toggleText}>
                      {editAllDay ? "✓ All-day event" : "Timed event"}
                    </Text>
                  </Pressable>

                  {!editAllDay && (
                    <>
                      <AppInput
                        label="Start time"
                        placeholder="6pm"
                        value={editStartTime}
                        onChangeText={setEditStartTime}
                        editable={canEdit(editingItem || {})}
                      />

                      <AppInput
                        label="End time"
                        placeholder="8pm"
                        value={editEndTime}
                        onChangeText={setEditEndTime}
                        editable={canEdit(editingItem || {})}
                      />
                    </>
                  )}
                </>
              ) : (
                <AppInput
                  label="Due time"
                  placeholder="Optional, ex: 6pm"
                  value={editStartTime}
                  onChangeText={setEditStartTime}
                  editable={canEdit(editingItem || {})}
                />
              )}

              <Pressable
                onPress={() =>
                  canEdit(editingItem || {}) &&
                  setEditCompleted((value) => !value)
                }
                style={[styles.toggle, editCompleted && styles.toggleActive]}
              >
                <Text style={styles.toggleText}>
                  {editCompleted ? "✓ Marked complete" : "Not complete"}
                </Text>
              </Pressable>

              <Text style={styles.fieldLabel}>Color</Text>

              {canEdit(editingItem || {}) ? (
                renderColorPicker()
              ) : (
                <View
                  style={[
                    styles.readOnlyColor,
                    { backgroundColor: editColor || colors.violet },
                  ]}
                />
              )}

              {editingItem && (
                <View style={styles.editInfoBox}>
                  <Text style={styles.editInfoText}>
                    Scope: {getScopeLabel(editingItem)}
                  </Text>
                  <Text style={styles.editInfoText}>
                    Creator: {getCreatorName(editingItem)}
                  </Text>
                </View>
              )}

              {canEdit(editingItem || {}) ? (
                <>
                  <AppButton
                    title={saving ? "Saving..." : "Save Changes"}
                    onPress={saveEdit}
                    disabled={saving}
                  />

                  <Pressable
                    onPress={deletePlan}
                    disabled={saving}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>Delete Plan</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.viewOnlyBox}>
                  <Text style={styles.viewOnlyBoxText}>
                    You can view this plan, but only the creator can edit it.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 112,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
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
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    ...shadow,
  },
  heroGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
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
    fontWeight: "900",
    fontSize: 58,
    letterSpacing: -2,
  },
  heroText: {
    color: colors.text2,
    fontWeight: "800",
  },
  heroStats: {
    gap: 10,
    justifyContent: "center",
  },
  heroStat: {
    minWidth: 82,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 10,
    alignItems: "center",
  },
  heroStatNumber: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
  },
  heroStatLabel: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 11,
    marginTop: 2,
  },
  controlCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 14,
    gap: 12,
    ...softShadow,
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
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  filterText: {
    color: colors.muted,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  filterTextActive: {
    color: colors.text,
  },
  calendarCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 30,
    padding: 16,
    gap: 14,
    ...softShadow,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    marginTop: -4,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  weekRow: {
    flexDirection: "row",
  },
  weekDay: {
    flex: 1,
    textAlign: "center",
    color: colors.gold,
    fontWeight: "900",
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dayCell: {
    width: "13.45%",
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayCellMuted: {
    opacity: 0.35,
  },
  dayCellToday: {
    borderColor: colors.gold,
  },
  dayCellSelected: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  dayNumber: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
  },
  dayNumberMuted: {
    color: colors.muted,
  },
  dayNumberSelected: {
    color: colors.text,
  },
  dayDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    justifyContent: "center",
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionLink: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 13,
  },
  listStack: {
    gap: 12,
  },
  planCard: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    overflow: "hidden",
    ...softShadow,
  },
  colorBar: {
    width: 5,
    alignSelf: "stretch",
    borderRadius: 999,
  },
  planTopRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  planTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  completedTitle: {
    opacity: 0.55,
    textDecorationLine: "line-through",
  },
  planMeta: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 5,
  },
  planDescription: {
    color: colors.text2,
    fontWeight: "700",
    marginTop: 7,
    lineHeight: 20,
  },
  editableText: {
    color: colors.green,
    fontWeight: "900",
    fontSize: 12,
  },
  viewOnlyText: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 12,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  scopePill: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scopePillText: {
    color: colors.text2,
    fontWeight: "900",
    fontSize: 11,
  },
  personalDot: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  personalDotText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: "900",
  },
  smallPill: {
    color: colors.text2,
    backgroundColor: colors.card,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  donePill: {
    color: colors.green,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.45)",
    overflow: "hidden",
  },
  checkBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkBoxDone: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  checkBoxDisabled: {
    opacity: 0.55,
  },
  checkText: {
    color: colors.bg,
    fontWeight: "900",
  },
  emptyCard: {
    backgroundColor: colors.bg2,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 6,
    ...softShadow,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18,
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "700",
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  editSheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 30,
    padding: 16,
    gap: 14,
    ...shadow,
  },
  editHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  editKicker: {
    color: colors.gold,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  editTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 26,
    letterSpacing: -0.6,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
    marginTop: -2,
  },
  editContent: {
    gap: 13,
    paddingBottom: 10,
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
  fieldLabel: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
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
  readOnlyColor: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: colors.border,
  },
  editInfoBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 13,
    gap: 5,
  },
  editInfoText: {
    color: colors.text2,
    fontWeight: "800",
  },
  deleteButton: {
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.45)",
  },
  deleteButtonText: {
    color: colors.red,
    fontWeight: "900",
  },
  viewOnlyBox: {
    backgroundColor: colors.violetSoft,
    borderColor: "rgba(124,92,255,0.45)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  viewOnlyBoxText: {
    color: colors.text,
    fontWeight: "800",
    lineHeight: 20,
  },
});