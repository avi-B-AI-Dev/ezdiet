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
import WaterAddModal from "@/components/WaterAddModal";
import WaterCard from "@/components/WaterCard";
import {
  createMeal,
  dismissOccurrence,
  getUser,
  listDashboardSupplements,
  listMealsByDate,
  listWaterByDate,
  logWater,
  markOccurrenceTaken,
  SUPPLEMENT_FREQUENCY_LABEL,
  TIME_OF_DAY_LABEL,
  toggleOccurrence,
  updateWaterSettings,
  type DashboardSupplement,
  type Meal,
  type MealType,
  type SupplementFrequency,
  type TimeOfDay,
  type User,
  type WaterEntry,
  type WaterUnit,
} from "@/lib/db";
import {
  DAY_NAMES,
  daysBetween,
  formatLongDate,
  formatShortDate,
  getDayOfWeek,
  greeting,
  localDateISO,
} from "@/lib/date";
import { computeStreak } from "@/lib/streak";
import { Palette, useTheme } from "@/lib/theme";
import { nextWaterUnit, toMl } from "@/lib/water-units";

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
  const [dueSupps, setDueSupps] = useState<DashboardSupplement[]>([]);

  const load = useCallback(async () => {
    const today = localDateISO();
    const [u, m, w, s, sups] = await Promise.all([
      getUser(),
      listMealsByDate(today),
      listWaterByDate(today),
      computeStreak(),
      listDashboardSupplements(),
    ]);
    setUser(u);
    setMeals(m);
    setWaterEntries(w);
    setStreak(s);
    setDueSupps(sups);
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
  const waterGoalMl = user?.water_goal_ml ?? 2000;
  const waterCurrentMl = useMemo(
    () => waterEntries.reduce((sum, e) => sum + e.amount_ml, 0),
    [waterEntries],
  );

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
    await logWater(toMl(1, waterUnit));
    load();
  };

  const handleAddWaterCustomMl = async (ml: number) => {
    await logWater(ml);
    setQuickAdd(null);
    load();
  };

  const handleCycleWaterUnit = async () => {
    const next = nextWaterUnit(waterUnit);
    await updateWaterSettings(next, waterGoalMl);
    load();
  };

  const today = localDateISO();

  const handleToggleSupp = async (supplementId: number, date: string) => {
    await toggleOccurrence(supplementId, date);
    load();
  };

  const handleMarkLate = async (supplementId: number, date: string) => {
    await markOccurrenceTaken(supplementId, date);
    load();
  };

  const handleDismissMissed = async (supplementId: number, date: string) => {
    await dismissOccurrence(supplementId, date);
    load();
  };

  const dailyGroups = useMemo(() => {
    const order: TimeOfDay[] = ["morning", "afternoon", "evening", "with_meal"];
    const buckets: Record<TimeOfDay, DashboardSupplement[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      with_meal: [],
    };
    for (const s of dueSupps) {
      if (!s.isDaily) continue;
      const tod: TimeOfDay = s.supplement.time_of_day ?? "morning";
      buckets[tod].push(s);
    }
    return order
      .filter((t) => buckets[t].length > 0)
      .map((t) => ({ time: t, items: buckets[t] }));
  }, [dueSupps]);

  const nonDailyItems = useMemo(() => {
    return dueSupps.filter((s) => !s.isDaily);
  }, [dueSupps]);

  const hasSupplements = dailyGroups.length > 0 || nonDailyItems.length > 0;

  const handleManageSupps = () => {
    router.push({
      pathname: "/profile",
      params: { scrollTo: "supplements" },
    });
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
            goalMl={waterGoalMl}
            currentMl={waterCurrentMl}
            colors={colors}
            onQuickAdd={handleAddWaterOne}
            onCustomAdd={() => setQuickAdd({ kind: "water" })}
            onCycleUnit={handleCycleWaterUnit}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.suppHeaderRow}>
            <Text style={styles.sectionTitle}>Supplements &amp; Medications</Text>
            <Pressable
              onPress={handleManageSupps}
              hitSlop={10}
              style={({ pressed }) => pressed && { opacity: 0.5 }}
            >
              <Ionicons
                name="settings-outline"
                size={16}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
          <View
            style={[
              styles.suppsCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            {!hasSupplements ? (
              <View style={styles.suppEmpty}>
                <Ionicons
                  name="medkit-outline"
                  size={20}
                  color={colors.textSubtle}
                />
                <Text
                  style={[
                    styles.suppEmptyTitle,
                    { color: colors.text },
                  ]}
                >
                  No supplements yet
                </Text>
                <Text
                  style={[
                    styles.suppEmptyBody,
                    { color: colors.textMuted },
                  ]}
                >
                  Add supplements during onboarding or after a data reset.
                </Text>
              </View>
            ) : null}

            {dailyGroups.map((group, idx) => (
                <View
                  key={group.time}
                  style={[
                    styles.suppGroup,
                    idx > 0 && {
                      borderTopColor: colors.surfaceBorder,
                      borderTopWidth: 1,
                      paddingTop: 12,
                      marginTop: 12,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.suppGroupLabel,
                      { color: colors.textMuted },
                    ]}
                  >
                    {TIME_OF_DAY_LABEL[group.time]}
                  </Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {group.items.map(({ supplement, takenToday }) => (
                      <Pressable
                        key={supplement.id}
                        onPress={() => handleToggleSupp(supplement.id, today)}
                        style={({ pressed }) => [
                          styles.suppRow,
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <Ionicons
                          name={takenToday ? "checkbox" : "square-outline"}
                          size={22}
                          color={
                            takenToday ? colors.accent : colors.textSubtle
                          }
                        />
                        <Text
                          style={[
                            styles.suppItemName,
                            {
                              color: takenToday
                                ? colors.textMuted
                                : colors.text,
                              textDecorationLine: takenToday
                                ? "line-through"
                                : "none",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {supplement.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}

            {nonDailyItems.length > 0 ? (
              <View
                style={[
                  styles.countdownBlock,
                  dailyGroups.length > 0 && {
                    borderTopColor: colors.surfaceBorder,
                    borderTopWidth: 1,
                    paddingTop: 12,
                    marginTop: 12,
                  },
                ]}
              >
                {nonDailyItems.map((item) => (
                  <NonDailySupplementBlock
                    key={item.supplement.id}
                    item={item}
                    today={today}
                    colors={colors}
                    styles={styles}
                    onToggleToday={() =>
                      handleToggleSupp(item.supplement.id, today)
                    }
                    onMarkLate={(date) =>
                      handleMarkLate(item.supplement.id, date)
                    }
                    onDismissMissed={(date) =>
                      handleDismissMissed(item.supplement.id, date)
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
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

      <WaterAddModal
        visible={quickAdd?.kind === "water"}
        initialUnit={waterUnit}
        colors={colors}
        onCancel={() => setQuickAdd(null)}
        onConfirm={handleAddWaterCustomMl}
      />
    </SafeAreaView>
  );
}

function slotLabel(t: MealType): string {
  return t === "snack" ? "snack" : t;
}

type DashboardStyles = ReturnType<typeof makeStyles>;

function formatNextDue(
  date: string,
  today: string,
  freq: SupplementFrequency | null,
): string {
  const days = daysBetween(today, date);
  const short = formatShortDate(date);
  if (freq === "twice_weekly") {
    const dow = getDayOfWeek(date);
    const name = DAY_NAMES[dow];
    if (days <= 0) return `Due today (${name})`;
    if (days === 1) return `Next: ${name} (tomorrow)`;
    if (days <= 6) return `Next: ${name}`;
    return `Next: ${name} (${short})`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return `Due tomorrow (${short})`;
  return `Due in ${days} days (${short})`;
}

function NonDailySupplementBlock(props: {
  item: DashboardSupplement;
  today: string;
  colors: Palette;
  styles: DashboardStyles;
  onToggleToday: () => void;
  onMarkLate: (date: string) => void;
  onDismissMissed: (date: string) => void;
}) {
  const { item, today, colors, styles, onToggleToday, onMarkLate, onDismissMissed } = props;
  const { supplement, todayScheduled, takenToday, missedDates, nextScheduledDate } = item;
  const freqLabel = supplement.frequency
    ? SUPPLEMENT_FREQUENCY_LABEL[supplement.frequency]
    : "";

  return (
    <View style={styles.nonDailyBlock}>
      <Text style={[styles.nonDailyName, { color: colors.text }]}>
        {supplement.name}{" "}
        <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 13 }}>
          ({freqLabel})
        </Text>
      </Text>

      {missedDates.map((d) => (
        <View
          key={`missed-${d}`}
          style={[
            styles.missedRow,
            { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
          ]}
        >
          <Ionicons name="alert-circle" size={16} color="#DC2626" />
          <Text style={styles.missedText}>Missed on {formatShortDate(d)}</Text>
          <Pressable
            onPress={() => onMarkLate(d)}
            hitSlop={6}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={[styles.missedAction, { color: colors.accent }]}>
              Mark taken
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onDismissMissed(d)}
            hitSlop={6}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={[styles.missedAction, { color: colors.textMuted }]}>
              Dismiss
            </Text>
          </Pressable>
        </View>
      ))}

      {todayScheduled ? (
        <Pressable
          onPress={onToggleToday}
          style={({ pressed }) => [
            styles.countdownRow,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons
            name={takenToday ? "checkbox" : "square-outline"}
            size={22}
            color={takenToday ? colors.accent : colors.textSubtle}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.suppItemName,
                {
                  color: takenToday ? colors.textMuted : colors.text,
                  textDecorationLine: takenToday ? "line-through" : "none",
                },
              ]}
              numberOfLines={1}
            >
              {takenToday ? "Done today" : "Due today"}
            </Text>
            {takenToday && nextScheduledDate ? (
              <Text style={[styles.countdownMeta, { color: colors.textMuted }]}>
                {formatNextDue(nextScheduledDate, today, supplement.frequency)}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : nextScheduledDate ? (
        <View style={styles.countdownRow}>
          <Ionicons name="time-outline" size={22} color={colors.textSubtle} />
          <Text style={[styles.countdownMeta, { color: colors.textMuted, flex: 1 }]}>
            {formatNextDue(nextScheduledDate, today, supplement.frequency)}
          </Text>
        </View>
      ) : null}
    </View>
  );
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

    suppsCard: {
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
    },
    suppGroup: {},
    suppGroupLabel: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    suppRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    suppItemName: { fontSize: 14, fontWeight: "600", flex: 1 },
    suppHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    countdownBlock: { gap: 10 },
    countdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    countdownMeta: { fontSize: 12, marginTop: 2, fontWeight: "600" },
    suppEmpty: { alignItems: "center", gap: 6, paddingVertical: 10 },
    suppEmptyTitle: { fontSize: 14, fontWeight: "700" },
    suppEmptyBody: { fontSize: 12, textAlign: "center" },
    nonDailyBlock: { gap: 8, paddingVertical: 4 },
    nonDailyName: { fontSize: 15, fontWeight: "700" },
    missedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
    },
    missedText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#DC2626" },
    missedAction: { fontSize: 12, fontWeight: "700" },

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
