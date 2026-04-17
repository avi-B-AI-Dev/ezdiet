import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initDatabase } from "@/lib/db";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const { mode, colors } = useTheme();

  useEffect(() => {
    initDatabase().catch((err) => {
      console.error("Database init failed:", err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      />
    </SafeAreaProvider>
  );
}
