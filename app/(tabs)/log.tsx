import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MealType } from "@/lib/db";
import { Palette, useTheme } from "@/lib/theme";

const OPTIONS: { type: MealType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "breakfast", label: "Breakfast", icon: "sunny-outline" },
  { type: "lunch", label: "Lunch", icon: "restaurant-outline" },
  { type: "dinner", label: "Dinner", icon: "moon-outline" },
  { type: "snack", label: "Snack", icon: "nutrition-outline" },
];

export default function LogMealScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const open = (mealType: MealType) => {
    router.push({ pathname: "/meal-log", params: { mealType } });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        <Ionicons name="add-circle" size={56} color={colors.accent} />
        <Text style={styles.title}>Log a meal</Text>
        <Text style={styles.subtitle}>
          Start typing your ingredients — our 6-agent pipeline will do the rest.
        </Text>
        <View style={styles.grid}>
          {OPTIONS.map((o) => (
            <Pressable
              key={o.type}
              onPress={() => open(o.type)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.surfaceBorder,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={o.icon} size={28} color={colors.accent} />
              <Text style={[styles.cardLabel, { color: colors.text }]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 10,
    },
    title: { color: c.text, fontSize: 22, fontWeight: "800", marginTop: 8 },
    subtitle: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 12,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "center",
      marginTop: 12,
    },
    card: {
      width: 140,
      aspectRatio: 1,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    cardLabel: { fontSize: 14, fontWeight: "700" },
  });
