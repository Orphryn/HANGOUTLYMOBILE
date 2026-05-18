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
          headerTitleStyle: { fontWeight: "900" },
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

        <Stack.Screen
          name="profile-setup"
          options={{ title: "Create Profile" }}
        />

        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="groups" options={{ headerShown: false }} />
        <Stack.Screen name="create-group" options={{ headerShown: false }} />
        <Stack.Screen name="planner" options={{ headerShown: false }} />
        <Stack.Screen name="create-plan" options={{ headerShown: false }} />
        <Stack.Screen name="safety" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />

        <Stack.Screen name="group/[id]" options={{ headerShown: false }} />

        <Stack.Screen
          name="group-settings/[id]"
          options={{ headerShown: false }}
        />
      </Stack>
    </AuthProvider>
  );
}