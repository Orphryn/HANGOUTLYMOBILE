import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import AppInput from "../components/AppInput";
import { colors, radii } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Planner() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskTitle, setTaskTitle] = useState("");

  async function loadPlanner() {
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id, groups(id, name)")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    const accepted = memberships?.map((row) => row.groups).filter(Boolean) || [];
    setGroups(accepted);

    const ids = accepted.map((g) => g.id);
    if (ids.length === 0) return setTasks([]);

    const { data: taskRows } = await supabase
      .from("tasks")
      .select("*, groups(id, name)")
      .in("group_id", ids)
      .order("created_at", { ascending: false });

    setTasks(taskRows || []);
  }

  useFocusEffect(
    useCallback(() => {
      if (user) loadPlanner();
    }, [user])
  );

  async function addTask() {
    const title = taskTitle.trim();
    if (!title || groups.length === 0) return;

    await supabase.from("tasks").insert({
      group_id: groups[0].id,
      created_by: user.id,
      title,
      status: "todo",
      priority: "medium",
      completed: false,
    });

    setTaskTitle("");
    await loadPlanner();
  }

  async function completeTask(task) {
    await supabase
      .from("tasks")
      .update({ status: "completed", completed: true })
      .eq("id", task.id);

    await loadPlanner();
  }

  const completed = tasks.filter((t) => t.status === "completed").length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Planner</Text>
        <Text style={styles.muted}>
          {completed}/{tasks.length} tasks done • {progress}%
        </Text>

        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.form}>
          <AppInput placeholder="Add a task..." value={taskTitle} onChangeText={setTaskTitle} />
          <AppButton title="Add Task" onPress={addTask} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>To Do</Text>
        {tasks.filter((t) => t.status !== "completed").map((task) => (
          <View key={task.id} style={styles.task}>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.muted}>{task.groups?.name}</Text>
            </View>
            <AppButton title="Done" onPress={() => completeTask(task)} />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Done</Text>
        {tasks.filter((t) => t.status === "completed").map((task) => (
          <View key={task.id} style={styles.task}>
            <Text style={[styles.taskTitle, { textDecorationLine: "line-through", color: colors.muted }]}>
              {task.title}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 18, gap: 12 },
  title: { color: colors.text, fontSize: 34, fontWeight: "900" },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  muted: { color: colors.muted },
  progress: { height: 10, borderRadius: 99, backgroundColor: colors.bg2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.violet },
  form: { gap: 10 },
  task: { backgroundColor: colors.bg2, padding: 14, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  taskTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
});