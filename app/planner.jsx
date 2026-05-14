import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const quickTimes = ["09:00", "12:00", "15:00", "18:00", "20:00"];

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({
      day: prevDays - i,
      currentMonth: false,
      date: new Date(year, month - 1, prevDays - i),
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      currentMonth: true,
      date: new Date(year, month, day),
    });
  }

  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (startDay + daysInMonth) + 1;
    cells.push({
      day: nextDay,
      currentMonth: false,
      date: new Date(year, month + 1, nextDay),
    });
  }

  return cells;
}

function groupNameById(groups, groupId) {
  return groups.find((group) => group.id === groupId)?.name || "your group";
}

export default function Planner() {
  const { user } = useAuth();
  const today = new Date();

  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth());
  const [visibleYear, setVisibleYear] = useState(today.getFullYear());

  const [groups, setGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [mode, setMode] = useState("event");
  const [notice, setNotice] = useState("");

  const [eventTitle, setEventTitle] = useState("");
  const [eventGroupId, setEventGroupId] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskGroupId, setTaskGroupId] = useState("");
  const [taskDueTime, setTaskDueTime] = useState("");

  const selectedKey = toDateKey(selectedDate);

  const calendarCells = useMemo(
    () => buildMonthGrid(visibleYear, visibleMonth),
    [visibleYear, visibleMonth]
  );

  async function loadPlanner() {
    if (!user?.id) return;

    const { data: groupRows } = await supabase
      .from("group_members")
      .select(`
        group_id,
        groups (
          id,
          name,
          avatar_color,
          avatar_emoji,
          avatar_url
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "accepted");

    const cleanGroups =
      groupRows?.map((row) => row.groups).filter((group) => group?.id) || [];

    setGroups(cleanGroups);

    const groupIds = cleanGroups.map((group) => group.id);

    const { data: eventRows } = await supabase
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
        created_at,
        groups (
          id,
          name,
          avatar_color,
          avatar_emoji,
          avatar_url
        )
      `)
      .or(
        groupIds.length
          ? `creator_id.eq.${user.id},group_id.in.(${groupIds.join(",")})`
          : `creator_id.eq.${user.id}`
      )
      .order("starts_at", { ascending: true });

    setEvents(eventRows || []);

    const { data: taskRows } = await supabase
      .from("planner_tasks")
      .select(`
        id,
        creator_id,
        group_id,
        title,
        due_at,
        due_time,
        completed,
        created_at,
        groups (
          id,
          name,
          avatar_color,
          avatar_emoji,
          avatar_url
        )
      `)
      .or(
        groupIds.length
          ? `creator_id.eq.${user.id},group_id.in.(${groupIds.join(",")})`
          : `creator_id.eq.${user.id}`
      )
      .order("created_at", { ascending: false });

    setTasks(taskRows || []);
  }

  useFocusEffect(
    useCallback(() => {
      loadPlanner();
    }, [user?.id])
  );

  function previousMonth() {
    if (visibleMonth === 0) {
      setVisibleMonth(11);
      setVisibleYear((year) => year - 1);
    } else {
      setVisibleMonth((month) => month - 1);
    }
  }

  function nextMonth() {
    if (visibleMonth === 11) {
      setVisibleMonth(0);
      setVisibleYear((year) => year + 1);
    } else {
      setVisibleMonth((month) => month + 1);
    }
  }

  function makeDateTime(date, time) {
    const [hourRaw, minuteRaw] = time ? time.split(":") : ["12", "00"];
    const hour = Number(hourRaw || 12);
    const minute = Number(minuteRaw || 0);

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
      minute,
      0
    );
  }

  async function notifyGroupMembers(groupId, title, body, link) {
    if (!groupId) return;

    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("status", "accepted");

    const rows =
      members?.map((member) => ({
        user_id: member.user_id,
        type: "group_activity",
        title,
        body,
        read: false,
        link,
      })) || [];

    if (rows.length > 0) {
      await supabase.from("notifications").insert(rows);
    }
  }

  async function createEvent() {
    const title = eventTitle.trim();

    if (!title) {
      return Alert.alert("Missing title", "Give the event a title.");
    }

    const startsAt = makeDateTime(selectedDate, eventAllDay ? "" : eventStartTime);
    const endsAt = eventEndTime
      ? makeDateTime(selectedDate, eventEndTime)
      : new Date(startsAt.getTime() + 60 * 60 * 1000);

    const { data: createdEvent, error } = await supabase
      .from("planner_events")
      .insert({
        creator_id: user.id,
        group_id: eventGroupId || null,
        title,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        start_time: eventAllDay ? null : eventStartTime || null,
        end_time: eventAllDay ? null : eventEndTime || null,
        is_all_day: eventAllDay,
        completed: false,
      })
      .select("*")
      .single();

    if (error) {
      return Alert.alert("Could not create event", error.message);
    }

    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "event_created",
      title: "Event created",
      body: `${title} was added to your planner.`,
      read: false,
      link: "/planner",
    });

    if (eventGroupId) {
      const groupName = groupNameById(groups, eventGroupId);

      await notifyGroupMembers(
        eventGroupId,
        "New group event",
        `${title} was added to ${groupName}.`,
        `/group/${eventGroupId}`
      );

      await supabase.from("messages").insert({
        group_id: eventGroupId,
        sender_id: user.id,
        content: `📅 Event created: ${title} — ${prettyDate(selectedDate)}${
          eventAllDay ? " all day" : eventStartTime ? ` at ${eventStartTime}` : ""
        }`,
      });
    }

    setNotice(`Event created: ${title}`);
    setEventTitle("");
    setEventGroupId("");
    setEventStartTime("");
    setEventEndTime("");
    setEventAllDay(false);

    await loadPlanner();
  }

  async function createTask() {
    const title = taskTitle.trim();

    if (!title) {
      return Alert.alert("Missing task", "Write the task first.");
    }

    const dueAt = makeDateTime(selectedDate, taskDueTime);

    const { data: createdTask, error } = await supabase
      .from("planner_tasks")
      .insert({
        creator_id: user.id,
        group_id: taskGroupId || null,
        title,
        due_at: dueAt.toISOString(),
        due_time: taskDueTime || null,
        completed: false,
      })
      .select("*")
      .single();

    if (error) {
      return Alert.alert("Could not create task", error.message);
    }

    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "task_created",
      title: "Task created",
      body: `${title} was added to your planner.`,
      read: false,
      link: "/planner",
    });

    if (taskGroupId) {
      const groupName = groupNameById(groups, taskGroupId);

      await notifyGroupMembers(
        taskGroupId,
        "New group task",
        `${title} was added to ${groupName}.`,
        `/group/${taskGroupId}`
      );

      await supabase.from("messages").insert({
        group_id: taskGroupId,
        sender_id: user.id,
        content: `✅ Task created: ${title} — due ${prettyDate(selectedDate)}${
          taskDueTime ? ` at ${taskDueTime}` : ""
        }`,
      });
    }

    setNotice(`Task created: ${title}`);
    setTaskTitle("");
    setTaskGroupId("");
    setTaskDueTime("");

    await loadPlanner();
  }

  async function toggleTask(task) {
    const { error } = await supabase
      .from("planner_tasks")
      .update({ completed: !task.completed })
      .eq("id", task.id);

    if (error) {
      return Alert.alert("Could not update task", error.message);
    }

    await loadPlanner();
  }

  async function deleteEvent(event) {
    const { error } = await supabase
      .from("planner_events")
      .delete()
      .eq("id", event.id);

    if (error) return Alert.alert("Could not delete event", error.message);

    await loadPlanner();
  }

  async function deleteTask(task) {
    const { error } = await supabase
      .from("planner_tasks")
      .delete()
      .eq("id", task.id);

    if (error) return Alert.alert("Could not delete task", error.message);

    await loadPlanner();
  }

  const eventsForSelectedDay = events.filter(
    (event) => toDateKey(new Date(event.starts_at)) === selectedKey
  );

  const tasksForSelectedDay = tasks.filter(
    (task) => task.due_at && toDateKey(new Date(task.due_at)) === selectedKey
  );

  function eventsOnDate(date) {
    const key = toDateKey(date);
    return events.filter((event) => toDateKey(new Date(event.starts_at)) === key);
  }

  function tasksOnDate(date) {
    const key = toDateKey(date);
    return tasks.filter(
      (task) => task.due_at && toDateKey(new Date(task.due_at)) === key
    );
  }

  const completeTasks = tasksForSelectedDay.filter((task) => task.completed).length;
  const selectedTotal = tasksForSelectedDay.length + eventsForSelectedDay.length;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.title}>Planner</Text>
        <Text style={styles.subtitle}>
          Pick a day, add an event or task, and optionally share it with a group.
        </Text>
      </View>

      {!!notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>✅ {notice}</Text>
        </View>
      )}

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable onPress={previousMonth} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>‹</Text>
          </Pressable>

          <View>
            <Text style={styles.monthTitle}>
              {MONTHS[visibleMonth]} {visibleYear}
            </Text>
            <Text style={styles.monthSubtitle}>{prettyDate(selectedDate)}</Text>
          </View>

          <Pressable onPress={nextMonth} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {DAYS.map((day) => (
            <Text key={day} style={styles.weekText}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {calendarCells.map((cell, index) => {
            const key = toDateKey(cell.date);
            const selected = key === selectedKey;
            const isToday = key === toDateKey(new Date());
            const dayEvents = eventsOnDate(cell.date);
            const dayTasks = tasksOnDate(cell.date);

            return (
              <Pressable
                key={`${key}-${index}`}
                onPress={() => setSelectedDate(cell.date)}
                style={[
                  styles.dayCell,
                  !cell.currentMonth && styles.otherMonthCell,
                  selected && styles.selectedDayCell,
                  isToday && styles.todayCell,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !cell.currentMonth && styles.otherMonthText,
                    selected && styles.selectedDayText,
                  ]}
                >
                  {cell.day}
                </Text>

                <View style={styles.dayDots}>
                  {dayEvents.slice(0, 2).map((event) => (
                    <View key={event.id} style={styles.eventDot} />
                  ))}

                  {dayTasks.slice(0, 2).map((task) => (
                    <View key={task.id} style={styles.taskDot} />
                  ))}
                </View>

                {dayEvents[0] && (
                  <Text numberOfLines={1} style={styles.dayPreview}>
                    {dayEvents[0].title}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{prettyDate(selectedDate)}</Text>
            <Text style={styles.muted}>
              {selectedTotal === 0
                ? "Nothing planned yet."
                : `${eventsForSelectedDay.length} events • ${completeTasks}/${tasksForSelectedDay.length} tasks done`}
            </Text>
          </View>
        </View>

        {eventsForSelectedDay.map((event) => (
          <View key={event.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>📅 {event.title}</Text>

              <Text style={styles.itemSub}>
                {event.is_all_day
                  ? "All day"
                  : `${event.start_time || "No time"}${
                      event.end_time ? ` - ${event.end_time}` : ""
                    }`}
              </Text>

              {event.groups && (
                <View style={styles.groupTag}>
                  <GroupAvatar
                    name={event.groups.name}
                    color={event.groups.avatar_color}
                    emoji={event.groups.avatar_emoji}
                    avatarUrl={event.groups.avatar_url}
                    size={24}
                  />
                  <Text style={styles.groupTagText}>{event.groups.name}</Text>
                </View>
              )}
            </View>

            <Pressable onPress={() => deleteEvent(event)} style={styles.deleteButton}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}

        {tasksForSelectedDay.map((task) => (
          <Pressable key={task.id} onPress={() => toggleTask(task)} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, task.completed && styles.completedText]}>
                {task.completed ? "✓ " : "○ "}
                {task.title}
              </Text>

              <Text style={styles.itemSub}>Due {task.due_time || "anytime"}</Text>

              {task.groups && (
                <View style={styles.groupTag}>
                  <GroupAvatar
                    name={task.groups.name}
                    color={task.groups.avatar_color}
                    emoji={task.groups.avatar_emoji}
                    avatarUrl={task.groups.avatar_url}
                    size={24}
                  />
                  <Text style={styles.groupTagText}>{task.groups.name}</Text>
                </View>
              )}
            </View>

            <Pressable onPress={() => deleteTask(task)} style={styles.deleteButton}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.modeSwitch}>
          <Pressable
            onPress={() => setMode("event")}
            style={[styles.modeButton, mode === "event" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, mode === "event" && styles.modeTextActive]}>
              Event
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMode("task")}
            style={[styles.modeButton, mode === "task" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, mode === "task" && styles.modeTextActive]}>
              Task
            </Text>
          </Pressable>
        </View>

        {mode === "event" ? (
          <>
            <Text style={styles.sectionTitle}>Create event</Text>

            <AppInput
              placeholder="Event title"
              value={eventTitle}
              onChangeText={setEventTitle}
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
                <Text style={styles.label}>Start time</Text>

                <View style={styles.quickTimeRow}>
                  {quickTimes.map((time) => (
                    <Pressable
                      key={time}
                      onPress={() => setEventStartTime(time)}
                      style={[
                        styles.timeChip,
                        eventStartTime === time && styles.timeChipActive,
                      ]}
                    >
                      <Text style={styles.timeChipText}>{time}</Text>
                    </Pressable>
                  ))}
                </View>

                <AppInput
                  placeholder="Custom start time, ex: 18:30"
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

            <Text style={styles.label}>Share with group optional</Text>

            <GroupPicker
              groups={groups}
              selectedGroupId={eventGroupId}
              setSelectedGroupId={setEventGroupId}
            />

            <AppButton title="Create Event" onPress={createEvent} />
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Add task</Text>

            <AppInput
              placeholder="Task title"
              value={taskTitle}
              onChangeText={setTaskTitle}
            />

            <Text style={styles.label}>Due time optional</Text>

            <View style={styles.quickTimeRow}>
              {quickTimes.map((time) => (
                <Pressable
                  key={time}
                  onPress={() => setTaskDueTime(time)}
                  style={[
                    styles.timeChip,
                    taskDueTime === time && styles.timeChipActive,
                  ]}
                >
                  <Text style={styles.timeChipText}>{time}</Text>
                </Pressable>
              ))}
            </View>

            <AppInput
              placeholder="Custom due time, ex: 16:00"
              value={taskDueTime}
              onChangeText={setTaskDueTime}
            />

            <Text style={styles.label}>Share with group optional</Text>

            <GroupPicker
              groups={groups}
              selectedGroupId={taskGroupId}
              setSelectedGroupId={setTaskGroupId}
            />

            <AppButton title="Add Task" onPress={createTask} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function GroupPicker({ groups, selectedGroupId, setSelectedGroupId }) {
  return (
    <View style={styles.groupPicker}>
      <Pressable
        onPress={() => setSelectedGroupId("")}
        style={[
          styles.groupChoice,
          selectedGroupId === "" && styles.groupChoiceActive,
        ]}
      >
        <Text style={styles.groupChoiceText}>Personal</Text>
      </Pressable>

      {groups.map((group) => (
        <Pressable
          key={group.id}
          onPress={() => setSelectedGroupId(group.id)}
          style={[
            styles.groupChoice,
            selectedGroupId === group.id && styles.groupChoiceActive,
          ]}
        >
          <GroupAvatar
            name={group.name}
            color={group.avatar_color}
            emoji={group.avatar_emoji}
            avatarUrl={group.avatar_url}
            size={26}
          />
          <Text style={styles.groupChoiceText}>{group.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18, paddingBottom: 80 },
  hero: { paddingTop: 8 },
  title: { color: colors.text, fontSize: 38, fontWeight: "900" },
  subtitle: { color: colors.muted, marginTop: 5, lineHeight: 20 },
  notice: {
    backgroundColor: "rgba(45,212,191,0.16)",
    borderColor: colors.green,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  noticeText: { color: colors.text, fontWeight: "900" },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
    ...shadow,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthButton: {
    height: 42,
    width: 42,
    borderRadius: 16,
    backgroundColor: colors.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 32,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  monthSubtitle: {
    color: colors.soft,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 3,
  },
  weekRow: { flexDirection: "row" },
  weekText: {
    flex: 1,
    color: colors.muted,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  dayCell: {
    width: "13.35%",
    minHeight: 84,
    backgroundColor: colors.bg2,
    borderRadius: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  otherMonthCell: { opacity: 0.45 },
  selectedDayCell: {
    borderColor: colors.soft,
    backgroundColor: "rgba(124,92,255,0.34)",
  },
  todayCell: { borderColor: colors.violet },
  dayNumber: { color: colors.text, fontWeight: "900" },
  otherMonthText: { color: colors.muted },
  selectedDayText: { color: colors.soft },
  dayDots: { flexDirection: "row", gap: 4, marginTop: 8 },
  eventDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.violet,
  },
  taskDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  dayPreview: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 7,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
    ...shadow,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  muted: { color: colors.muted },
  item: {
    backgroundColor: colors.bg2,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  itemTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  itemSub: { color: colors.muted, marginTop: 4 },
  completedText: { textDecorationLine: "line-through", opacity: 0.55 },
  groupTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  groupTagText: { color: colors.soft, fontWeight: "900", fontSize: 12 },
  deleteButton: {
    backgroundColor: colors.red,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: colors.bg2,
    padding: 5,
    borderRadius: 18,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: colors.violet,
  },
  modeText: {
    color: colors.muted,
    fontWeight: "900",
  },
  modeTextActive: {
    color: colors.text,
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
  toggleText: { color: colors.text, fontWeight: "900" },
  label: { color: colors.soft, fontWeight: "900" },
  quickTimeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeChip: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  timeChipActive: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  timeChipText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 12,
  },
  groupPicker: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  groupChoice: {
    backgroundColor: colors.bg2,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupChoiceActive: {
    backgroundColor: "rgba(124,92,255,0.32)",
    borderColor: colors.violet,
  },
  groupChoiceText: { color: colors.text, fontWeight: "900" },
});