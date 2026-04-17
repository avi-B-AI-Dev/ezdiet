import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { getUser } from "@/lib/db";
import { useTheme } from "@/lib/theme";

type Decision = "loading" | "onboard" | "home";

export default function Index() {
  const { colors } = useTheme();
  const [decision, setDecision] = useState<Decision>("loading");

  useEffect(() => {
    (async () => {
      try {
        const user = await getUser();
        const onboarded = !!user && !!user.name && !!user.activity_level;
        setDecision(onboarded ? "home" : "onboard");
      } catch (err) {
        console.error("Boot check failed:", err);
        setDecision("onboard");
      }
    })();
  }, []);

  if (decision === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return decision === "home" ? (
    <Redirect href="/dashboard" />
  ) : (
    <Redirect href="/onboarding" />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
