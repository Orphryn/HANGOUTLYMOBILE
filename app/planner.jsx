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

function toDateKey(date) {
  return date.toISOString().split("T")[0];
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

export default function Planner() {
  const { user } = useAuth();
  const today = new Date();

  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth());
  const [visibleYear, setVisibleYear] = useState(today.getFullYear());

  const [groups, setGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);

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
    const cleanDate = toDateKey(date);
    if (!time) return new Date(`${cleanDate}T12:00:00`);
    return new Date(`${cleanDate}T${time}:00`);
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

    const { error } = await supabase
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
      });

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

    setEventTitle("");
    setEventGroupId("");
    setEventStartTime("");
    setEventEndTime("");
    setEventAllDay(false);

    Alert.alert("Event created", `${title} was added.`);
    await loadPlanner();
  }

  async function createTask() {
    const title = taskTitle.trim();

    if (!title) {
      return Alert.alert("Missing task", "Write the task first.");
    }

    const dueAt = makeDateTime(selectedDate, taskDueTime);

    const { error } = await supabase
      .from("planner_tasks")
      .insert({
        creator_id: user.id,
        group_id: taskGroupId || null,
        title,
        due_at: dueAt.toISOString(),
        due_time: taskDueTime || null,
        completed: false,
      });

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

    setTaskTitle("");
    setTaskGroupId("");
    setTaskDueTime("");

    Alert.alert("Task created", `${title} was added.`);
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

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.title}>Planner</Text>
        <Text style={styles.subtitle}>
          Personal plans, group events, and tasks in one place.
        </Text>
      </View>

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
            const isToday = key === toDateKey(today);
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
        <Text style={styles.sectionTitle}>Selected day</Text>
        <Text style={styles.selectedDate}>{prettyDate(selectedDate)}</Text>

        {eventsForSelectedDay.length === 0 && tasksForSelectedDay.length === 0 ? (
          <Text style={styles.muted}>Nothing here yet. This day is open.</Text>
        ) : (
          <>
            {eventsForSelectedDay.map((event) => (
              <View key={event.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{event.title}</Text>

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
              <Pressable
                key={task.id}
                onPress={() => toggleTask(task)}
                style={styles.item}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.itemTitle,
                      task.completed && styles.completedText,
                    ]}
                  >
                    {task.completed ? "✓ " : ""}
                    {task.title}
                  </Text>

                  <Text style={styles.itemSub}>
                    Due {task.due_time || "anytime"}
                  </Text>

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
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Create event</Text>

        <AppInput
          placeholder="Event title"
          value={eventTitle}
          onChangeText={setEventTitle}
        />

        <View style={styles.timeRow}>
          <AppInput
            placeholder="Start time, ex: 18:30"
            value={eventStartTime}
            onChangeText={setEventStartTime}
          />

          <AppInput
            placeholder="End time, ex: 20:00"
            value={eventEndTime}
            onChangeText={setEventEndTime}
          />
        </View>

        <Pressable
          onPress={() => setEventAllDay((value) => !value)}
          style={[styles.toggle, eventAllDay && styles.toggleActive]}
        >
          <Text style={styles.toggleText}>
            {eventAllDay ? "✓ All-day event" : "Make this an all-day event"}
          </Text>
        </Pressable>

        <Text style={styles.label}>Assign to group optional</Text>

        <View style={styles.groupPicker}>
          <Pressable
            onPress={() => setEventGroupId("")}
            style={[
              styles.groupChoice,
              eventGroupId === "" && styles.groupChoiceActive,
            ]}
          >
            <Text style={styles.groupChoiceText}>Personal</Text>
          </Pressable>

          {groups.map((group) => (
            <Pressable
              key={group.id}
              onPress={() => setEventGroupId(group.id)}
              style={[
                styles.groupChoice,
                eventGroupId === group.id && styles.groupChoiceActive,
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

        <AppButton title="Create Event" onPress={createEvent} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add task</Text>

        <AppInput
          placeholder="Task title"
          value={taskTitle}
          onChangeText={setTaskTitle}
        />

        <AppInput
          placeholder="Due time optional, ex: 16:00"
          value={taskDueTime}
          onChangeText={setTaskDueTime}
        />

        <Text style={styles.label}>Assign to group optional</Text>

        <View style={styles.groupPicker}>
          <Pressable
            onPress={() => setTaskGroupId("")}
            style={[
              styles.groupChoice,
              taskGroupId === "" && styles.groupChoiceActive,
            ]}
          >
            <Text style={styles.groupChoiceText}>Personal</Text>
          </Pressable>

          {groups.map((group) => (
            <Pressable
              key={group.id}
              onPress={() => setTaskGroupId(group.id)}
              style={[
                styles.groupChoice,
                taskGroupId === group.id && styles.groupChoiceActive,
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

        <AppButton title="Add Task" onPress={createTask} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18, paddingBottom: 80 },
  hero: { paddingTop: 8 },
  title: { color: colors.text, fontSize: 38, fontWeight: "900" },
  subtitle: { color: colors.muted, marginTop: 5 },
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
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  selectedDate: { color: colors.soft, fontWeight: "900", fontSize: 16 },
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
  timeRow: { gap: 10 },
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