import { Stack } from "expo-router";
import { colors } from "../constants/theme";
import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: "900",
          },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />

        <Stack.Screen name="login" options={{ title: "Log In" }} />

        <Stack.Screen name="signup" options={{ title: "Sign Up" }} />

        <Stack.Screen
          name="pending-verification"
          options={{ title: "Verify Email" }}
        />

        <Stack.Screen name="dashboard" options={{ headerShown: false }} />

        <Stack.Screen name="groups" options={{ title: "Groups" }} />

        <Stack.Screen name="planner" options={{ title: "Planner" }} />

        <Stack.Screen name="safety" options={{ title: "Safety" }} />

        <Stack.Screen name="group/[id]" options={{ title: "Group" }} />
      </Stack>
    </AuthProvider>
  );
}