import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CalorieRing from "@/components/CalorieRing";
import MacroBar from "@/components/MacroBar";
import MealSlot from "@/components/MealSlot";
import QuickAddModal from "@/components/QuickAddModal";
import WaterCard from "@/components/WaterCard";
import {
  createMeal,
  getUser,
  listMealsByDate,
  listWaterByDate,
  logWater,
  updateWaterSettings,
  type Meal,
  type MealType,
  type User,
  type WaterEntry,
  type WaterUnit,
} from "@/lib/db";
import { formatLongDate, greeting, localDateISO } from "@/lib/date";
import { computeStreak } from "@/lib/streak";
import { Palette, useTheme } from "@/lib/theme";
import { convertWater, nextWaterUnit } from "@/lib/water-units";

const SLOTS: { type: MealType; title: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }[] = [
  { type: "breakfast", title: "Breakfast", icon: "sunny-outline" },
  { type: "lunch", title: "Lunch", icon: "restaurant-outline" },
  { type: "dinner", title: "Dinner", icon: "moon-outline" },
  { type: "snack", title: "Snacks", icon: "nutrition-outline" },
];

type QuickAdd =
  | { kind: "meal"; slot: MealType }
  | { kind: "water" }
  | null;

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [user, setUser] = useState<User | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [favorites, setFavorites] = useState<Set<MealType>>(new Set());
  const [quickAdd, setQuickAdd] = useState<QuickAdd>(null);

  const load = useCallback(async () => {
    const today = localDateISO();
    const [u, m, w, s] = await Promise.all([
      getUser(),
      listMealsByDate(today),
      listWaterByDate(today),
      computeStreak(),
    ]);
    setUser(u);
    setMeals(m);
    setWaterEntries(w);
    setStreak(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const totals = useMemo(() => {
    return meals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.total_calories * m.servings,
        protein: acc.protein + m.total_protein * m.servings,
        carbs: acc.carbs + m.total_carbs * m.servings,
        fat: acc.fat + m.total_fat * m.servings,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [meals]);

  const mealsByType = useMemo(() => {
    const grouped: Record<MealType, Meal[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const m of meals) grouped[m.meal_type].push(m);
    return grouped;
  }, [meals]);

  const waterUnit: WaterUnit = user?.water_unit ?? "glasses";
  const waterGoal = user?.water_goal ?? 8;
  const waterCurrent = useMemo(() => {
    return waterEntries.reduce(
      (sum, e) => sum + convertWater(e.amount, e.unit, waterUnit),
      0,
    );
  }, [waterEntries, waterUnit]);

  const calorieGoal = user?.daily_calorie_goal ?? 0;
  const remaining = Math.max(calorieGoal - totals.calories, 0);

  const handleToggleFavorite = (slot: MealType) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const handleQuickAddMeal = async (slot: MealType, calories: number) => {
    await createMeal(
      {
        meal_type: slot,
        input_type: "combination",
        description: "Quick add",
        total_calories: calories,
        total_protein: 0,
        total_carbs: 0,
        total_fat: 0,
        servings: 1,
      },
      [],
    );
    setQuickAdd(null);
    load();
  };

  const handleAddWaterOne = async () => {
    await logWater(1, waterUnit);
    load();
  };

  const handleAddWaterCustom = async (amount: number) => {
    await logWater(amount, waterUnit);
    setQuickAdd(null);
    load();
  };

  const handleCycleWaterUnit = async () => {
    const next = nextWaterUnit(waterUnit);
    await updateWaterSettings(next, waterGoal);
    load();
  };

  if (!user) {
    return <SafeAreaView style={styles.container} edges={["top"]} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: tabBarHeight + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>{formatLongDate()}</Text>
          </View>
          <View style={styles.streak}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>
              {streak} day{streak === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroNumber}>
              {remaining.toLocaleString()}
            </Text>
            <Text style={styles.heroSubtitle}>calories remaining</Text>
            <Text style={styles.heroMeta}>
              {Math.round(totals.calories).toLocaleString()} eaten ·{" "}
              {calorieGoal.toLocaleString()} goal
            </Text>
          </View>
          <CalorieRing
            consumed={totals.calories}
            goal={calorieGoal}
            colors={colors}
            size={140}
          />
        </View>

        <View style={styles.macrosCard}>
          <MacroBar
            label="Protein"
            consumed={totals.protein}
            goal={user.daily_protein_goal}
            color={colors.accent}
            colors={colors}
          />
          <MacroBar
            label="Carbs"
            consumed={totals.carbs}
            goal={user.daily_carbs_goal}
            color="#F59E0B"
            colors={colors}
          />
          <MacroBar
            label="Fat"
            consumed={totals.fat}
            goal={user.daily_fat_goal}
            color="#EF4444"
            colors={colors}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today&apos;s meals</Text>
          <View style={styles.slotList}>
            {SLOTS.map((s) => (
              <MealSlot
                key={s.type}
                title={s.title}
                icon={s.icon}
                meals={mealsByType[s.type]}
                favorited={favorites.has(s.type)}
                colors={colors}
                onAdd={() => router.push("/log")}
                onQuickAdd={() => setQuickAdd({ kind: "meal", slot: s.type })}
                onToggleFavorite={() => handleToggleFavorite(s.type)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <WaterCard
            unit={waterUnit}
            goal={waterGoal}
            current={waterCurrent}
            colors={colors}
            onQuickAdd={handleAddWaterOne}
            onCustomAdd={() => setQuickAdd({ kind: "water" })}
            onCycleUnit={handleCycleWaterUnit}
          />
        </View>
      </ScrollView>

      <Pressable
        onPress={() => router.push("/log")}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.accent,
            bottom: tabBarHeight + 16,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add" size={28} color={colors.accentText} />
      </Pressable>

      <QuickAddModal
        visible={quickAdd?.kind === "meal"}
        title={
          quickAdd?.kind === "meal"
            ? `Quick add ${slotLabel(quickAdd.slot)}`
            : ""
        }
        placeholder="450"
        unit="kcal"
        colors={colors}
        onCancel={() => setQuickAdd(null)}
        onConfirm={(n) =>
          quickAdd?.kind === "meal" && handleQuickAddMeal(quickAdd.slot, n)
        }
      />

      <QuickAddModal
        visible={quickAdd?.kind === "water"}
        title="Add water"
        placeholder="1"
        unit={waterUnit}
        colors={colors}
        onCancel={() => setQuickAdd(null)}
        onConfirm={handleAddWaterCustom}
      />
    </SafeAreaView>
  );
}

function slotLabel(t: MealType): string {
  return t === "snack" ? "snack" : t;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 20, gap: 16 },
    header: { flexDirection: "row", alignItems: "center", gap: 12 },
    greeting: { color: c.text, fontSize: 24, fontWeight: "800" },
    date: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    streak: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
    },
    streakEmoji: { fontSize: 14 },
    streakText: { color: c.text, fontSize: 13, fontWeight: "700" },

    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
      borderRadius: 18,
      padding: 20,
      gap: 12,
    },
    heroLeft: { flex: 1, gap: 4 },
    heroNumber: {
      color: c.text,
      fontSize: 44,
      fontWeight: "800",
      letterSpacing: -1.5,
    },
    heroSubtitle: { color: c.textMuted, fontSize: 14, fontWeight: "600" },
    heroMeta: { color: c.textSubtle, fontSize: 12, marginTop: 4 },

    macrosCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
      borderRadius: 14,
      padding: 16,
      gap: 14,
    },

    section: { gap: 10 },
    sectionTitle: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    slotList: { gap: 10 },

    fab: {
      position: "absolute",
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  });
